import { Router, type Response, type NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { r2 } from '../config/storage.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';

const router = Router({ mergeParams: true });

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { text, xPos, yPos } = req.body;
    const authorId = req.user!.id; 
    
    const asset = await prisma.asset.findUnique({ 
        where: { id: String(req.params.assetId) }, 
        include: { project: { include: { members: true } } }
    });
    
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    const project = asset.project;

    // PHASE 3: Enforce Lock State
    if (project.status === 'APPROVED' || project.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Feedback is disabled.' });
    }

    if (project.ownerId !== authorId && !project.members.some(m => m.userId === authorId)) {
        return res.status(403).json({ error: 'Forbidden. You do not have access to this asset.' });
    }

    const newComment = await prisma.comment.create({ data: { text, xPos, yPos, assetId: asset.id, authorId } });

    await prisma.activityLog.create({ 
      data: { projectId: project.id, userId: authorId, action: 'COMMENT', details: `Dropped a new feedback pin.` } 
    });

    req.app.get('io').to(project.id).emit('refresh-workspace');
    return res.status(201).json(newComment);
  } catch (error) { next(error); }
});

router.put('/:commentId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { text } = req.body;
    
    // PHASE 3: Fix Comment Trust Issue - Ignore client projectId payload, fetch DB truth
    const comment = await prisma.comment.findUnique({ 
        where: { id: String(req.params.commentId) },
        include: { asset: { include: { project: true } } }
    });
    
    if (!comment || comment.authorId !== req.user!.id) return res.status(403).json({ error: 'Forbidden.' });

    // PHASE 3: Enforce Lock State
    if (comment.asset.project.status === 'APPROVED' || comment.asset.project.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Edits are disabled.' });
    }

    const updatedComment = await prisma.comment.update({ where: { id: comment.id }, data: { text } });
    req.app.get('io').to(comment.asset.projectId).emit('refresh-workspace');
    return res.status(200).json(updatedComment);
  } catch (error) { next(error); }
});

router.patch('/:commentId/resolve', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { isResolved } = req.body; 
    
    // PHASE 3: Fix Comment Trust Issue - Fetch DB truth
    const comment = await prisma.comment.findUnique({ 
        where: { id: String(req.params.commentId) }, 
        include: { asset: { include: { project: { include: { owner: true } } } } } 
    }) as any;
    
    if (!comment || comment.asset.project.ownerId !== req.user!.id) return res.status(403).json({ error: 'Forbidden.' });

    // PHASE 3: Enforce Lock State
    if (comment.asset.project.status === 'APPROVED' || comment.asset.project.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Resolution state cannot be changed.' });
    }

    const updatedComment = await prisma.comment.update({ where: { id: comment.id }, data: { isResolved } });

    await prisma.activityLog.create({ 
      data: { projectId: comment.asset.projectId, userId: req.user!.id, action: 'RESOLVE', details: `Pin marked as ${isResolved ? 'Resolved' : 'Re-opened'}.` } 
    });

    req.app.get('io').to(comment.asset.projectId).emit('refresh-workspace');
    return res.status(200).json({ message: 'Comment status updated.' });
  } catch (error) { next(error); }
});

router.delete('/:commentId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const comment = await prisma.comment.findUnique({ 
        where: { id: String(req.params.commentId) }, 
        include: { asset: { include: { project: true } } } 
    }) as any;
    
    if (!comment || (comment.authorId !== req.user!.id && comment.asset.project.ownerId !== req.user!.id)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    // PHASE 3: Enforce Lock State
    if (comment.asset.project.status === 'APPROVED' || comment.asset.project.isArchived) {
        return res.status(403).json({ error: 'Project is locked. Deletions are disabled.' });
    }

    if (comment.text.startsWith('{')) {
      try {
        const parsed = JSON.parse(comment.text);
        if (parsed.audioUrl) {
          let key = parsed.audioUrl;
          if (key.startsWith('http')) {
             const urlObj = new URL(key); 
             key = urlObj.pathname.substring(1);
          }
          if (key) await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
        }
      } catch (e) {}
    }

    await prisma.comment.delete({ where: { id: comment.id } });
    req.app.get('io').to(comment.asset.projectId).emit('refresh-workspace');
    return res.status(200).json({ message: 'Comment deleted.' });
  } catch (error) { next(error); }
});

export default router;