import { Router, type Response, type NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { generatePresignedUpload, r2, getSecureUrl } from '../config/storage.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import commentRoutes from './comment.routes.js';

const router = Router({ mergeParams: true });

const renameAssetSchema = z.object({
  fileName: z.string().min(1).max(200),
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const projectId = String(req.params.projectId);
    if (!projectId || projectId === "undefined") {
        return res.status(400).json({ error: 'Project ID is missing from the request URL.' });
    }

    // PHASE 3: Enforce Lock/Archive States for Uploads
    const project = await prisma.project.findUnique({ 
        where: { id: projectId }, 
        include: { members: true } 
    });
    
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    
    if (project.status === 'APPROVED' || project.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Uploads are disabled.' });
    }

    const isMember = project.members.some((m: any) => m.userId === req.user!.id);
    if (project.ownerId !== req.user!.id && !isMember) {
        return res.status(403).json({ error: 'Unauthorized to upload to this workspace.' });
    }

    const body = req.body || {};
    const { fileName, fileType, storageKey, originalFileName } = body;
    
    if (storageKey && originalFileName) {
      const newAsset = await prisma.$transaction(async (tx) => {
        const lastAsset = await tx.asset.findFirst({
          where: { projectId, fileName: originalFileName },
          orderBy: { version: 'desc' }
        });
        
        const nextVersion = lastAsset ? lastAsset.version + 1 : 1;
        
        return await tx.asset.create({
          data: { fileUrl: storageKey, projectId, fileName: originalFileName, version: nextVersion },
        });
      }, {
        maxWait: 10000,
        timeout: 30000 
      });
 
      await prisma.activityLog.create({ 
        data: { projectId, userId: req.user!.id, action: 'UPLOAD', details: `Uploaded Version ${newAsset.version} of ${originalFileName}` } 
      });
 
      const io = req.app.get('io');
      if (io) io.to(projectId).emit('refresh-workspace');
      
      try {
         const secureUrl = await getSecureUrl(newAsset.fileUrl);
         return res.status(201).json({ ...newAsset, fileUrl: secureUrl });
      } catch (urlError) {
         logger.warn("[R2 URL Gen Warning]", { error: urlError });
         return res.status(201).json({ ...newAsset, fileUrl: newAsset.fileUrl, warning: "Asset saved, but viewing URL could not be generated." });
      }
    } 
    
    if (fileName) { 
      const safeFileType = fileType || "text/plain";
      const safeOriginalName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const generatedStorageKey = `${Date.now()}-${safeOriginalName}`;
 
      const presignedData = await generatePresignedUpload(generatedStorageKey, safeFileType, 100);
      
      if (!presignedData) {
         throw new Error("Cloudflare R2 failed to generate an upload signature.");
      }

      return res.status(200).json({ presignedData, storageKey: generatedStorageKey });
    }

    return res.status(400).json({ error: 'Invalid payload: Must provide (fileName, fileType) for presign, or (storageKey, originalFileName) for confirmation.' });
    
  } catch (error: any) { 
    next(error); 
  }
});

router.put('/:assetId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validatedData = renameAssetSchema.parse(req.body);
    const assetId = String(req.params.assetId);
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });
    const project = await prisma.project.findUnique({ where: { id: asset.projectId } });
    if (project?.ownerId !== req.user!.id) return res.status(403).json({ error: 'Forbidden.' });
    
    // PHASE 3: Enforce Lock State
    if (project?.status === 'APPROVED' || project?.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Edits are disabled.' });
    }

    await prisma.asset.updateMany({
      where: { projectId: asset.projectId, fileName: asset.fileName }, 
      data: { fileName: validatedData.fileName },
    });

    const io = req.app.get('io');
    if (io) io.to(asset.projectId).emit('refresh-workspace');
    return res.status(200).json({ message: 'Stack renamed.' });
  } catch (error) { 
    next(error); 
  }
});

router.delete('/:assetId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: String(req.params.assetId) }, include: { project: true, comments: true } });
    if (!asset || asset.project.ownerId !== req.user!.id) return res.status(403).json({ error: 'Forbidden.' });

    // PHASE 3: Enforce Lock State
    if (asset.project.status === 'APPROVED' || asset.project.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Deletions are disabled.' });
    }

    const keysToDelete: string[] = [];

    for (const comment of asset.comments) {
      if (comment.text.startsWith('{')) {
        try {
          const parsed = JSON.parse(comment.text);
          if (parsed.audioUrl) {
            let key = parsed.audioUrl;
            if (key.startsWith('http')) { const urlObj = new URL(key); key = urlObj.pathname.substring(1); }
            if (key) keysToDelete.push(key);
          }
        } catch (e) {}
      }
    }

    let assetKey = asset.fileUrl;
    if (assetKey.startsWith('http')) { 
        try { const urlObj = new URL(assetKey); assetKey = urlObj.pathname.substring(1); } catch (e) {} 
    }
    if (assetKey) keysToDelete.push(assetKey);

    // PHASE 3: Batch R2 Deletions via Promise.allSettled
    await Promise.allSettled(keysToDelete.map(key => r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }))));

    await prisma.asset.delete({ where: { id: asset.id } });
    
    // PHASE 3: Fix Audit Log Typos (UPLOAD -> DELETE)
    await prisma.activityLog.create({ 
      data: { projectId: asset.projectId, userId: req.user!.id, action: 'DELETE', details: `Deleted file stack: ${asset.fileName}` } 
    });

    const io = req.app.get('io');
    if (io) io.to(asset.projectId).emit('refresh-workspace');
    return res.status(200).json({ message: 'Asset deleted.' });
  } catch (error) { 
    next(error); 
  }
});

router.use('/:assetId/comments', commentRoutes);

export default router;