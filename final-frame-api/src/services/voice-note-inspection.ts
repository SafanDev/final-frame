import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadStorageObjectToFile } from '../config/storage.js';
import { assertFileIsMalwareFree, assertFileSignature } from './file-inspection.js';

/**
 * Verifies a bounded voice-note upload before it becomes part of a comment.
 * The object remains private and is streamed through the malware scanner.
 */
export async function inspectVoiceNote(
  storageKey: string,
  mimeType: string,
  expectedBytes: number,
): Promise<void> {
  const workdir = await mkdtemp(join(tmpdir(), 'finalframe-voice-'));
  const sourcePath = join(workdir, 'voice-note');
  try {
    await downloadStorageObjectToFile(storageKey, sourcePath);
    const file = await stat(sourcePath);
    if (!file.isFile() || file.size !== expectedBytes) {
      throw new Error('The stored voice note no longer matches the verified upload.');
    }
    await assertFileSignature(sourcePath, mimeType);
    await assertFileIsMalwareFree(sourcePath);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}
