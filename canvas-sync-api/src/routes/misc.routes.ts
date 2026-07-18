import { Router, type Response, type NextFunction } from 'express';
import { generatePresignedUpload } from '../config/storage.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

const router = Router();

router.post('/upload-audio', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const fileName = `voice-notes/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webm`;
    const presignedData = await generatePresignedUpload(fileName, 'audio/webm', 10);
    return res.status(201).json({ presignedData, fileUrl: fileName });
  } catch (error) { next(error); }
});

export default router;