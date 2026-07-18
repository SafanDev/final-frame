import { Router, type Response, type NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { getSecureUrl, r2 } from '../config/storage.js';
import { sendEmail, escapeHTML } from '../services/email.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import assetRoutes from './asset.routes.js';
import crypto from 'crypto';
import { z } from 'zod'; 
import rateLimit from 'express-rate-limit'; 

const router = Router();

const createProjectSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  status: z.enum(['IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED']).optional(),
  isDownloadUnlocked: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

router.use('/:projectId/assets', assetRoutes);

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validatedData = createProjectSchema.parse(req.body);
    const ownerId = req.user!.id;

    const newProject = await prisma.project.create({ 
      data: { 
        title: validatedData.title, 
        description: validatedData.description || '', 
        ownerId 
      } 
    });
    
    await prisma.activityLog.create({ 
      data: { projectId: newProject.id, userId: ownerId, action: 'STATUS', details: `Project initialized.` } 
    });
    
    return res.status(201).json(newProject);
  } catch (error) { next(error); }
});

router.get('/workspace/:projectId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const projectId = String(req.params.projectId);
    const userId = req.user!.id;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { 
        members: true,
        activityLogs: { orderBy: { createdAt: 'desc' } },
        assets: {
          orderBy: { createdAt: 'desc' }, 
          include: { comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true, email: true } } } } }
        }
      }, 
    });

    if (!project) return res.status(404).json({ error: 'Project not found.' });
    
    const isMember = project.members.some((m: any) => m.userId === userId);
    if (project.ownerId !== userId && !isMember) return res.status(403).json({ error: 'Access Denied.' });

    await Promise.all(project.assets.map(async (asset: any) => {
      asset.fileUrl = await getSecureUrl(asset.fileUrl);
      await Promise.all(asset.comments.map(async (comment: any) => {
        try {
          if (comment.text.startsWith('{')) {
            const parsed = JSON.parse(comment.text);
            if (parsed.audioUrl) {
              parsed.audioUrl = await getSecureUrl(parsed.audioUrl);
              comment.text = JSON.stringify(parsed);
            }
          }
        } catch (e) {} 
      }));
    }));

    return res.status(200).json(project);
  } catch (error) { next(error); }
});

router.get('/:userId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const userId = req.user!.id;
    if (userId !== req.params.userId) return res.status(403).json({ error: "Forbidden access." });

    const projects = await prisma.project.findMany({
      where: { OR: [{ ownerId: userId }, { members: { some: { userId: userId } } }] },
      include: { assets: { include: { comments: { select: { id: true } } } } },
      orderBy: { updatedAt: 'desc' }, 
    });

    await Promise.all(projects.map(async (project: any) => {
      await Promise.all(project.assets.map(async (asset: any) => { asset.fileUrl = await getSecureUrl(asset.fileUrl); }));
    }));

    return res.status(200).json(projects);
  } catch (error) { next(error); }
});

router.put('/:projectId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const projectId = String(req.params.projectId);
    const userId = req.user!.id;
    
    const validatedData = updateProjectSchema.parse(req.body);

    const project = await prisma.project.findUnique({ 
        where: { id: projectId },
        include: { members: true } 
    });
    
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    
    const isOwner = project.ownerId === userId;
    const isMember = project.members.some(m => m.userId === userId);

    if (!isOwner && !isMember) return res.status(403).json({ error: 'Forbidden.' });

    // PHASE 3: Fix Project Update Authorization by Field
    const updateData: any = {};
    
    // Members can update status. Owners can update everything.
    if (validatedData.status !== undefined) updateData.status = validatedData.status;

    if (!isOwner) {
        if (validatedData.title !== undefined || validatedData.isDownloadUnlocked !== undefined || validatedData.isArchived !== undefined) {
            return res.status(403).json({ error: 'Forbidden: Only the owner can modify structural project settings.' });
        }
    } else {
        if (validatedData.title !== undefined) updateData.title = validatedData.title;
        if (validatedData.isDownloadUnlocked !== undefined) updateData.isDownloadUnlocked = validatedData.isDownloadUnlocked;
        if (validatedData.isArchived !== undefined) updateData.isArchived = validatedData.isArchived;
    }

    if (Object.keys(updateData).length === 0) return res.status(400).json({ error: 'No valid fields provided for update.' });

    const updatedProject = await prisma.project.update({ 
      where: { id: projectId }, 
      data: updateData, 
      include: { owner: true } 
    });

    if (validatedData.status) await prisma.activityLog.create({ data: { projectId, userId, action: 'STATUS', details: `Project status moved to ${validatedData.status.replace('_', ' ')}` } });
    if (validatedData.isDownloadUnlocked !== undefined) await prisma.activityLog.create({ data: { projectId, userId, action: 'UNLOCK', details: `Final download assets were ${validatedData.isDownloadUnlocked ? 'unlocked' : 'revoked'}.` } });
    if (validatedData.isArchived !== undefined) await prisma.activityLog.create({ data: { projectId, userId, action: 'STATUS', details: `Project was ${validatedData.isArchived ? 'Closed' : 'Re-Opened'}.` } });

    req.app.get('io').to(projectId).emit('refresh-workspace');
    return res.status(200).json(updatedProject);
  } catch (error) { next(error); }
});

router.delete('/:projectId', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const projectId = String(req.params.projectId);
    const userId = req.user!.id;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    if (project.ownerId !== userId) return res.status(403).json({ error: 'Forbidden.' });

    // PHASE 3: Secure Asset Deletion - Protect the Audit Log
    if (project.status === 'APPROVED') {
        return res.status(403).json({ error: 'Cannot delete an Approved project. It is locked as an official Audit Log.' });
    }

    const assets = await prisma.asset.findMany({ where: { projectId } });
    const comments = await prisma.comment.findMany({ where: { asset: { projectId } } });
    const keysToDelete: string[] = [];

    for (const asset of assets) {
      let key = asset.fileUrl;
      if (key.startsWith('http')) { try { const urlObj = new URL(key); key = urlObj.pathname.substring(1); } catch (e) {} }
      if (key) keysToDelete.push(key);
    }

    for (const comment of comments) {
      if (comment.text.startsWith('{')) {
        try {
          const parsed = JSON.parse(comment.text);
          if (parsed.audioUrl) {
            let key = parsed.audioUrl;
            if (key.startsWith('http')) { const urlObj = new URL(key); key = urlObj.pathname.substring(1); }
            if (key) keysToDelete.push(key);
          }
        } catch(e) {}
      }
    }

    await Promise.allSettled(keysToDelete.map(key => r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }))));

    await prisma.project.delete({ where: { id: projectId } });
    
    return res.status(200).json({ message: 'Project permanently deleted.' });
  } catch (error) { next(error); }
});

router.post('/:projectId/invite', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const projectId = String(req.params.projectId);
    const { email, origin } = req.body; 
    let project = await prisma.project.findUnique({ where: { id: projectId } });
    
    if (!project || project.ownerId !== req.user!.id) return res.status(403).json({ error: 'Forbidden' });

    if (!project.inviteToken) {
      const newToken = crypto.randomBytes(16).toString('hex');
      const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      project = await prisma.project.update({ where: { id: projectId }, data: { inviteToken: newToken, inviteTokenExpiresAt: expiry } });
    }

    if (email && origin) {
      const inviteLink = `${origin}/invite/${project.inviteToken}`;
      // PHASE 3: Sanitize Email Injections
      const safeTitle = escapeHTML(project.title);
      
      const emailHtml = `
        <div style="font-family: sans-serif; padding: 30px; background-color: #050505; color: #fff; border-radius: 4px;">
          <h2 style="color: #10b981;">FinalFrame Collaboration</h2>
          <p style="color: #a1a1aa;">You have been invited to review:</p>
          <h3>Project: ${safeTitle}</h3>
          <br/>
          <a href="${inviteLink}" style="padding: 12px 24px; background-color: #10b981; color: #050505; text-decoration: none; font-weight: bold; font-size: 12px; text-transform: uppercase;">Open Workspace</a>
        </div>
      `;
      await sendEmail(email, `You're invited to a FinalFrame Project`, emailHtml);
      await prisma.activityLog.create({ data: { projectId, userId: req.user!.id, action: 'STATUS', details: `Sent an email invite to ${email}` } });
    }

    return res.status(200).json({ inviteToken: project.inviteToken });
  } catch (error) { next(error); }
});

router.post('/invite/:token/join', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const userId = req.user!.id;
    const project = await prisma.project.findUnique({ where: { inviteToken: String(req.params.token) } });
    if (!project) return res.status(404).json({ error: 'Invalid or expired invite link.' });

    if (project.inviteTokenExpiresAt && new Date() > project.inviteTokenExpiresAt) {
      return res.status(410).json({ error: 'This invite link has expired.' });
    }

    if (project.ownerId === userId) return res.status(200).json({ message: 'You own this project.', projectId: project.id });

    const existingMember = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: project.id, userId: userId } } });
    if (!existingMember) await prisma.projectMember.create({ data: { projectId: project.id, userId: userId } });

    return res.status(200).json({ message: 'Successfully joined project!', projectId: project.id });
  } catch (error) { next(error); }
});

const aiLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: "AI rate limit exceeded. Please wait a minute." } });

router.post('/:projectId/summary', requireAuth, aiLimiter, async (req: AuthRequest, res: Response, next: NextFunction): Promise<any> => {
  try {
    const projectId = String(req.params.projectId);
    const userId = req.user!.id;
    
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.ownerId !== userId) return res.status(403).json({ error: "Forbidden. Only project owners can generate summaries." });
    
    if (!process.env.OPENROUTER_API_KEY) return res.status(200).json({ summary: "System Error: OPENROUTER_API_KEY is missing." });
    
    const dbComments = await prisma.comment.findMany({
      where: { asset: { projectId } },
      select: { text: true }
    });

    const parsedTexts = dbComments.map(c => {
      if (c.text.startsWith('{')) { 
        try { return JSON.parse(c.text).t; } catch(e) { return ""; } 
      }
      return c.text;
    }).filter(t => t);

    if (parsedTexts.length === 0) return res.status(400).json({ error: "No feedback found to summarize." });

    const systemPrompt = "You are a UX/UI Project Manager. Summarize the user's feedback points. Group them into a clean, actionable checklist using markdown.";
    
    let rawCommentsText = parsedTexts.join('\n');
    if (rawCommentsText.length > 12000) {
      rawCommentsText = rawCommentsText.substring(0, 12000) + "\n...[Truncated]";
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openrouter/free", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `Feedback:\n${rawCommentsText}` }] })
    });

    if (!response.ok) {
      if (response.status === 429) return res.status(429).json({ error: "AI limit reached. Try again later." });
      throw new Error("AI Engine failed to connect.");
    }

    const data = await response.json();
    return res.status(200).json({ summary: data.choices[0].message.content });
  } catch (error) { next(error); }
});

export default router;