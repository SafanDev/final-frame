import { env } from '../config/env.js';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createStorageKey,
  generatePresignedMultipartPart,
  generatePresignedUpload,
  listMultipartUploadParts,
  normalizeFileName,
  storageKeyBelongsToProject,
  validateUploadPolicy,
  verifyUploadedObject,
} from '../config/storage.js';
import { prisma } from '../config/prisma.js';
import { UploadKind } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError, ConflictError, NotFoundError } from '../errors/app-error.js';
import { createMultipartPartPlan, validateCompleteMultipartParts } from './multipart-upload-core.js';
import { queueStorageDeletion } from './storage-cleanup.js';

export interface CreateUploadReservationInput {
  projectId: string;
  userId: string;
  kind: UploadKind;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
}

const reservationSelect = {
  id: true,
  storageKey: true,
  projectId: true,
  userId: true,
  kind: true,
  originalFileName: true,
  mimeType: true,
  fileSize: true,
  multipartUploadId: true,
  multipartPartSize: true,
  multipartCompletedAt: true,
  consumedAt: true,
  expiresAt: true,
} as const;

export type UploadReservationRecord = Prisma.UploadReservationGetPayload<{ select: typeof reservationSelect }>;

const policyFor = (input: Pick<CreateUploadReservationInput, 'kind' | 'mimeType' | 'fileSize'>) => {
  const voice = input.kind === UploadKind.VOICE_NOTE;
  return validateUploadPolicy(
    input.mimeType,
    input.fileSize,
    voice ? env.MAX_AUDIO_UPLOAD_BYTES : env.MAX_ASSET_UPLOAD_BYTES,
    voice ? 'voice' : 'asset',
  );
};

export const createUploadReservationRecord = async (
  transaction: Prisma.TransactionClient,
  input: CreateUploadReservationInput,
): Promise<UploadReservationRecord> => {
  const policy = policyFor(input);
  const originalFileName = normalizeFileName(input.originalFileName);
  const storageKey = createStorageKey(
    input.projectId,
    originalFileName,
    input.kind === UploadKind.VOICE_NOTE ? 'voice-notes' : 'assets',
  );
  const expiresAt = new Date(Date.now() + env.UPLOAD_RESERVATION_TTL_MINUTES * 60_000);

  return transaction.uploadReservation.create({
    data: {
      storageKey,
      projectId: input.projectId,
      userId: input.userId,
      kind: input.kind,
      originalFileName,
      mimeType: policy.mimeType,
      fileSize: policy.fileSize,
      expiresAt,
    },
    select: reservationSelect,
  });
};

async function ensureMultipartReservation(reservation: UploadReservationRecord): Promise<UploadReservationRecord> {
  if (reservation.multipartUploadId && reservation.multipartPartSize) return reservation;
  const uploadId = await createMultipartUpload(reservation.storageKey, reservation.mimeType);
  try {
    return await prisma.uploadReservation.update({
      where: { id: reservation.id },
      data: {
        multipartUploadId: uploadId,
        multipartPartSize: env.MULTIPART_UPLOAD_PART_SIZE_BYTES,
      },
      select: reservationSelect,
    });
  } catch (error) {
    await abortMultipartUpload(reservation.storageKey, uploadId).catch(() => undefined);
    throw error;
  }
}

export interface MultipartUploadPlanResponse {
  uploadId: string;
  partSize: number;
  partCount: number;
  uploadedParts: Array<{ partNumber: number; etag: string; fileSize: number }>;
  parts: Array<{ partNumber: number; url: string; uploadHeaders: Readonly<Record<string, string>> }>;
}

export async function buildMultipartUploadPlan(reservationInput: UploadReservationRecord): Promise<MultipartUploadPlanResponse> {
  const reservation = await ensureMultipartReservation(reservationInput);
  const uploadId = reservation.multipartUploadId;
  const partSize = reservation.multipartPartSize;
  if (!uploadId || !partSize) throw new ConflictError('Multipart upload initialization did not complete.');
  const plan = createMultipartPartPlan(reservation.fileSize, partSize);
  const uploadedParts = await listMultipartUploadParts(reservation.storageKey, uploadId);
  const uploadedByNumber = new Map(uploadedParts.map((part) => [part.partNumber, part]));
  for (const expected of plan) {
    const uploaded = uploadedByNumber.get(expected.partNumber);
    if (uploaded && uploaded.fileSize !== expected.fileSize) {
      throw new ConflictError(`Uploaded part ${expected.partNumber} does not match the authorized size.`);
    }
  }
  const missing = plan.filter((part) => !uploadedByNumber.has(part.partNumber));
  const parts = await Promise.all(missing.map(async (part) => ({
    partNumber: part.partNumber,
    url: await generatePresignedMultipartPart(reservation.storageKey, uploadId, part.partNumber),
    uploadHeaders: {},
  })));
  return { uploadId, partSize, partCount: plan.length, uploadedParts, parts };
}

export const signUploadReservation = async (reservation: UploadReservationRecord) => {
  const multipart = reservation.kind === UploadKind.ASSET
    && reservation.fileSize >= env.MULTIPART_UPLOAD_THRESHOLD_BYTES;
  if (multipart) {
    return {
      reservation,
      uploadMode: 'multipart' as const,
      uploadHeaders: {},
      multipart: await buildMultipartUploadPlan(reservation),
    };
  }
  const voice = reservation.kind === UploadKind.VOICE_NOTE;
  const signed = await generatePresignedUpload(
    reservation.storageKey,
    reservation.mimeType,
    reservation.fileSize,
    voice ? env.MAX_AUDIO_UPLOAD_BYTES : env.MAX_ASSET_UPLOAD_BYTES,
    voice ? 'voice' : 'asset',
  );
  return {
    reservation,
    uploadMode: 'single' as const,
    uploadUrl: signed.url,
    uploadHeaders: signed.requiredHeaders,
  };
};

export const createUploadReservation = async (input: CreateUploadReservationInput) => {
  const reservation = await prisma.$transaction((transaction) =>
    createUploadReservationRecord(transaction, input));
  try {
    return await signUploadReservation(reservation);
  } catch (error) {
    await prisma.uploadReservation.deleteMany({ where: { id: reservation.id, consumedAt: null } });
    throw error;
  }
};

export const requireActiveUploadReservation = async (
  storageKey: string,
  projectId: string,
  userId: string,
  kind: UploadKind,
): Promise<UploadReservationRecord> => {
  const expectedKind = kind === UploadKind.VOICE_NOTE ? 'voice-notes' : 'assets';
  if (!storageKeyBelongsToProject(storageKey, projectId, expectedKind)) {
    throw new NotFoundError('Upload reservation not found.');
  }
  const reservation = await prisma.uploadReservation.findFirst({
    where: { storageKey, projectId, userId, kind, consumedAt: null },
    select: reservationSelect,
  });
  if (!reservation) throw new NotFoundError('Upload reservation not found.');
  if (reservation.expiresAt <= new Date()) {
    throw new AppError({
      statusCode: 410,
      code: 'UPLOAD_RESERVATION_EXPIRED',
      message: 'The upload reservation has expired.',
      clientMessage: 'The upload authorization expired. Start the upload again.',
    });
  }
  return reservation;
};

export async function completeMultipartReservation(reservation: UploadReservationRecord): Promise<void> {
  if (!reservation.multipartUploadId || !reservation.multipartPartSize) {
    throw new ConflictError('This reservation is not a multipart upload.');
  }
  if (reservation.multipartCompletedAt) {
    await verifyUploadedObject(reservation.storageKey, reservation.mimeType, reservation.fileSize);
    return;
  }
  // A previous completion request may have assembled the object but lost its
  // database acknowledgement. Recognize that state before trying to list a
  // multipart upload that storage has already closed.
  try {
    await verifyUploadedObject(reservation.storageKey, reservation.mimeType, reservation.fileSize);
    await prisma.uploadReservation.updateMany({
      where: { id: reservation.id, consumedAt: null, multipartCompletedAt: null },
      data: { multipartCompletedAt: new Date() },
    });
    return;
  } catch {
    // The assembled object is not present yet; validate and complete the parts.
  }
  const uploaded = await listMultipartUploadParts(reservation.storageKey, reservation.multipartUploadId);
  let completeParts;
  try {
    completeParts = validateCompleteMultipartParts(uploaded, reservation.fileSize, reservation.multipartPartSize);
  } catch (error) {
    throw new ConflictError(error instanceof Error ? error.message : 'Multipart upload is incomplete.');
  }
  await completeMultipartUpload(reservation.storageKey, reservation.multipartUploadId, completeParts);
  await verifyUploadedObject(reservation.storageKey, reservation.mimeType, reservation.fileSize);
  await prisma.uploadReservation.updateMany({
    where: { id: reservation.id, consumedAt: null, multipartCompletedAt: null },
    data: { multipartCompletedAt: new Date() },
  });
}

export async function abortUploadReservation(reservation: UploadReservationRecord): Promise<void> {
  if (reservation.multipartUploadId && !reservation.multipartCompletedAt) {
    await abortMultipartUpload(reservation.storageKey, reservation.multipartUploadId);
  } else if (reservation.multipartCompletedAt) {
    await queueStorageDeletion([reservation.storageKey]);
  }
  await prisma.uploadReservation.deleteMany({ where: { id: reservation.id, consumedAt: null } });
}

export async function abortUploadReservationById(reservationId: string): Promise<void> {
  const reservation = await prisma.uploadReservation.findUnique({
    where: { id: reservationId },
    select: reservationSelect,
  });
  if (!reservation || reservation.consumedAt) return;
  await abortUploadReservation(reservation);
}

export const assertReservationMetadata = (
  reservation: Pick<UploadReservationRecord, 'originalFileName' | 'mimeType' | 'fileSize' | 'kind'>,
  originalFileName: string,
  mimeType: string,
  fileSize: number,
): void => {
  const policy = policyFor({ kind: reservation.kind, mimeType, fileSize });
  const normalizedName = normalizeFileName(originalFileName);
  if (
    reservation.originalFileName !== normalizedName ||
    reservation.mimeType !== policy.mimeType ||
    reservation.fileSize !== policy.fileSize
  ) {
    throw new ConflictError('Upload metadata does not match the original authorization.');
  }
};

export const consumeUploadReservation = async (
  transaction: Prisma.TransactionClient,
  reservationId: string,
): Promise<void> => {
  const result = await transaction.uploadReservation.updateMany({
    where: { id: reservationId, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (result.count !== 1) {
    throw new ConflictError('This upload authorization was already used or has expired.');
  }
};
