import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'; 
import multer from 'multer';
import { createServer } from 'http';
import { Server } from 'socket.io';
import crypto from 'crypto';
import { Resend } from 'resend'; 

// --- CLOUDFLARE R2 SETUP ---
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

// --- COST PROTECTION & SANITIZATION ---
const storage = multer.memoryStorage();
const uploadAsset = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); 
const uploadVoiceNote = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); 

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// --- INITIALIZE RESEND (EMAIL ENGINE) ---
const resend = new Resend(process.env.RESEND_API_KEY || 'mock_key');

const sendEmail = async (to: string, subject: string, html: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n📧 MOCK EMAIL TRIGGERED (No Resend Key): \nTo: ${to}\nSubject: ${subject}\n`);
    return;
  }
  try {
    await resend.emails.send({
      from: 'PinSight Notifications <onboarding@resend.dev>', 
      to,
      subject,
      html
    });
  } catch(e) { console.error("Email delivery failed:", e); }
};

const app = express();
const PORT = process.env.PORT || 5000;

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
  }
});

app.set('io', io);

// --- MULTIPLAYER SOCKET ENGINE ---
io.on('connection', (socket) => {
  console.log(`⚡ Client connected: ${socket.id}`);

  socket.on('join-workspace', (projectId) => {
    socket.join(projectId);
    console.log(`👤 Client joined workspace: ${projectId}`);
  });

  socket.on('cursor-move', (data) => {
    socket.to(data.projectId).emit('cursor-update', { socketId: socket.id, ...data });
  });

  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (room !== socket.id) socket.to(room).emit('cursor-remove', socket.id);
    }
  });

  socket.on('disconnect', () => console.log(`❌ Client disconnected: ${socket.id}`));
});

app.use(cors());
app.use(express.json());

// ==========================================
// --- SECURE URL GENERATOR ENGINE ---
// ==========================================
async function getSecureUrl(fileReference: string) {
  if (!fileReference) return fileReference;
  
  let key = fileReference;
  if (fileReference.startsWith('http')) {
    try {
      const urlObj = new URL(fileReference);
      key = urlObj.pathname.substring(1); 
    } catch(e) {}
  }
  
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
    });
    return await getSignedUrl(r2, command, { expiresIn: 3600 });
  } catch(err) {
    console.error("Presign error:", err);
    return fileReference;
  }
}

// ==========================================
// --- AUTHENTICATION ROUTES ---
// ==========================================

app.post('/api/auth/register', async (req: Request, res: Response): Promise<any> => {
  try {
    const { name, email, password, role } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({
      data: { name, email, passwordHash, role: role || 'CLIENT' },
    });

    const { passwordHash: _, ...safeUser } = newUser;
    return res.status(201).json({ message: 'User created', user: safeUser });
  } catch (error) { return res.status(500).json({ error: 'Internal server error.' }); }
});

app.post('/api/auth/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const { passwordHash: _, ...safeUser } = user;
    return res.status(200).json({ message: 'Login successful', user: safeUser });
  } catch (error) { return res.status(500).json({ error: 'Internal server error.' }); }
});

// ==========================================
// --- PROJECT ROUTES ---
// ==========================================

app.post('/api/projects', async (req: Request, res: Response): Promise<any> => {
  try {
    const { title, description, ownerId } = req.body;
    if (!title || !ownerId) return res.status(400).json({ error: 'Missing data.' });

    const newProject = await prisma.project.create({
      data: { title, description: description || '', ownerId },
    });
    
    // 🚀 NEW: Log Creation
    await prisma.activityLog.create({ data: { projectId: newProject.id, action: 'STATUS', details: `Project Workspace created.` } });
    
    return res.status(201).json(newProject);
  } catch (error) { return res.status(500).json({ error: 'Failed to create project.' }); }
});

app.get('/api/projects/:userId', async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId as string;
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId: userId } } }
        ]
      },
      include: {
        assets: { include: { comments: { select: { id: true } } } }
      },
      orderBy: { updatedAt: 'desc' }, 
    });

    for (const project of projects) {
      for (const asset of project.assets) {
        asset.fileUrl = await getSecureUrl(asset.fileUrl);
      }
    }

    return res.status(200).json(projects);
  } catch (error) {
    console.error('Fetch projects error:', error);
    return res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

app.get('/api/projects/workspace/:projectId', async (req: Request, res: Response): Promise<any> => {
  try {
    const projectId = req.params.projectId as string;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { 
        activityLogs: { orderBy: { createdAt: 'desc' } }, // 🚀 NEW: Fetch Timeline Data
        assets: {
          orderBy: { createdAt: 'desc' }, 
          include: { 
            comments: {
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { name: true, email: true } } }
            } 
          }
        }
      }, 
    });

    if (!project) return res.status(404).json({ error: 'Project not found.' });

    for (const asset of project.assets) {
      asset.fileUrl = await getSecureUrl(asset.fileUrl);
      for (const comment of asset.comments) {
        try {
          if (comment.text.startsWith('{')) {
            const parsed = JSON.parse(comment.text);
            if (parsed.audioUrl) {
              parsed.audioUrl = await getSecureUrl(parsed.audioUrl);
              comment.text = JSON.stringify(parsed);
            }
          }
        } catch (e) {} 
      }
    }

    return res.status(200).json(project);
  } catch (error) { return res.status(500).json({ error: 'Failed to fetch project.' }); }
});

app.put('/api/projects/:projectId', async (req: Request, res: Response): Promise<any> => {
  try {
    const projectId = req.params.projectId as string;
    const { title, status, isDownloadUnlocked } = req.body; 
    
    const updateData: any = {};
    if (title) updateData.title = title;
    if (status) updateData.status = status;
    if (isDownloadUnlocked !== undefined) updateData.isDownloadUnlocked = isDownloadUnlocked; 

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
      include: { owner: true } 
    });

    // 🚀 NEW: Log Status Changes
    if (status) {
      await prisma.activityLog.create({ data: { projectId, action: 'STATUS', details: `Project status moved to ${status.replace('_', ' ')}` } });
    }
    if (isDownloadUnlocked !== undefined) {
      await prisma.activityLog.create({ data: { projectId, action: 'UNLOCK', details: `Final download assets were ${isDownloadUnlocked ? 'unlocked' : 'revoked'}.` } });
    }

    if (status === 'APPROVED' && updatedProject.owner?.email) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #10b981; margin-top: 0;">Project Approved! 🎉</h2>
          <p>Great news! The client has officially approved <strong>${updatedProject.title}</strong>.</p>
          <p style="color: #6b7280; font-size: 14px;">Log in to PinSight to unlock the final downloads for your client once they have settled their invoice.</p>
        </div>
      `;
      await sendEmail(updatedProject.owner.email, `✅ Approved: ${updatedProject.title}`, emailHtml);
    }

    const socketIo = req.app.get('io');
    socketIo.to(projectId).emit('refresh-workspace');

    return res.status(200).json(updatedProject);
  } catch (error) {
    console.error('Failed to update project:', error);
    return res.status(500).json({ error: 'Failed to update project.' });
  }
});

// ==========================================
// --- AI SUMMARY ROUTE (OPENROUTER) ---
// ==========================================

app.post('/api/projects/:projectId/summary', async (req: Request, res: Response): Promise<any> => {
  try {
    const { comments, requestorRole } = req.body;
    
    if (!comments || comments.length === 0) {
      return res.status(400).json({ error: "No feedback found to summarize." });
    }

    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(200).json({ summary: "⚠️ **System Error:** OPENROUTER_API_KEY is missing from your .env file." });
    }
    
    const targetSource = requestorRole === 'DESIGNER' ? 'the Client' : 'the Designer';
    const systemPrompt = "You are an elite UX/UI Project Manager. Summarize the user's feedback points. Group them into a clean, highly actionable checklist. Be concise, professional, and do not use conversational filler. Use markdown formatting (bullet points, bold text).";
    const userPrompt = `Feedback to summarize from ${targetSource}:\n${comments.join('\n')}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openrouter/free", 
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      console.error("OpenRouter API Error:", err);
      if (response.status === 429) {
        return res.status(429).json({ error: "Free AI limit reached. Please try again in a few seconds." });
      }
      return res.status(500).json({ error: "AI Engine failed to connect." });
    }

    const data = await response.json();
    const summaryText = data.choices[0].message.content;

    return res.status(200).json({ summary: summaryText });

  } catch (error: any) {
    console.error("AI Summary Error Block Reached:", error.message);
    return res.status(500).json({ error: "AI Engine failed to generate summary." });
  }
});

// ==========================================
// --- ASSET MANAGEMENT ROUTES (VERSION CONTROL) ---
// ==========================================

const handleAssetUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadAsset.single('file')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File rejected. Maximum size is 100MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: 'Unknown upload error occurred.' });
    }
    next();
  });
};

app.post('/api/projects/:projectId/assets', handleAssetUpload, async (req: Request, res: Response): Promise<any> => {
  try {
    const projectId = req.params.projectId as string;
    const file = req.file;
    const { fileNameOverride } = req.body; 

    if (!file) return res.status(400).json({ error: 'No file uploaded.' });

    const isImageOrPdf = file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf';
    if (isImageOrPdf && file.size > 25 * 1024 * 1024) {
      return res.status(400).json({ error: 'Images and Documents must be under 25MB.' });
    }

    const safeOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}-${safeOriginalName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
    await r2.send(command);

    const finalFileName = fileNameOverride || file.originalname;

    const existingVersionsCount = await prisma.asset.count({
      where: { projectId, fileName: finalFileName }
    });

    const newAsset = await prisma.asset.create({
      data: { 
        fileUrl: fileName, 
        projectId, 
        fileName: finalFileName,
        version: existingVersionsCount + 1 
      },
    });

    // 🚀 NEW: Log Uploads
    await prisma.activityLog.create({ data: { projectId, action: 'UPLOAD', details: `Uploaded Version ${newAsset.version} of ${finalFileName}` } });

    const socketIo = req.app.get('io');
    socketIo.to(projectId).emit('refresh-workspace');

    const secureUrl = await getSecureUrl(newAsset.fileUrl);
    return res.status(201).json({ ...newAsset, fileUrl: secureUrl });
  } catch (error) {
    console.error('Asset upload failed:', error);
    return res.status(500).json({ error: 'Asset upload failed.' });
  }
});

app.put('/api/assets/:assetId', async (req: Request, res: Response): Promise<any> => {
  try {
    const assetId = req.params.assetId as string;
    const { fileName } = req.body;
    
    if (!fileName) return res.status(400).json({ error: 'File name is required.' });

    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });

    await prisma.asset.updateMany({
      where: { projectId: asset.projectId, fileName: asset.fileName },
      data: { fileName: fileName },
    });

    const socketIo = req.app.get('io');
    socketIo.to(asset.projectId).emit('refresh-workspace');

    return res.status(200).json({ message: 'Stack renamed successfully.' });
  } catch (error) {
    console.error('Failed to rename asset:', error);
    return res.status(500).json({ error: 'Failed to rename asset.' });
  }
});

app.delete('/api/assets/:assetId', async (req: Request, res: Response): Promise<any> => {
  try {
    const assetId = req.params.assetId as string;
    
    const asset = await prisma.asset.findUnique({ where: { id: assetId } });
    if (!asset) return res.status(404).json({ error: 'Asset not found.' });

    try {
      let key = asset.fileUrl;
      if (key.startsWith('http')) {
         const urlObj = new URL(key);
         key = urlObj.pathname.substring(1);
      }
      if (key) {
        await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
      }
    } catch (r2Error) { console.warn("Could not delete from R2, proceeding with DB deletion...", r2Error); }

    await prisma.asset.delete({ where: { id: assetId } });

    // 🚀 NEW: Log Deletions
    await prisma.activityLog.create({ data: { projectId: asset.projectId, action: 'UPLOAD', details: `Deleted file stack: ${asset.fileName}` } });

    const socketIo = req.app.get('io');
    socketIo.to(asset.projectId).emit('refresh-workspace');

    return res.status(200).json({ message: 'Asset deleted successfully.' });
  } catch (error) {
    console.error('Failed to delete asset:', error);
    return res.status(500).json({ error: 'Failed to delete asset.' });
  }
});

// ==========================================
// --- PIN (COMMENT) ROUTES ---
// ==========================================

app.post('/api/assets/:assetId/comments', async (req: Request, res: Response): Promise<any> => {
  try {
    const assetId = req.params.assetId as string;
    const { text, xPos, yPos, authorId, projectId } = req.body;

    if (!text || !authorId || xPos === undefined || yPos === undefined || !projectId) {
      return res.status(400).json({ error: 'Missing comment data.' });
    }

    const newComment = await prisma.comment.create({
      data: { text, xPos, yPos, assetId, authorId },
    });

    const user = await prisma.user.findUnique({ where: { id: authorId } });

    // 🚀 NEW: Log Pin creation
    await prisma.activityLog.create({ data: { projectId, action: 'COMMENT', details: `${user?.name || 'A user'} dropped a new feedback pin.` } });

    const socketIo = req.app.get('io');
    socketIo.to(projectId).emit('refresh-workspace');

    return res.status(201).json(newComment);
  } catch (error) {
    console.error('Failed to save comment:', error);
    return res.status(500).json({ error: 'Failed to save comment.' });
  }
});

app.put('/api/comments/:commentId', async (req: Request, res: Response): Promise<any> => {
  try {
    const commentId = req.params.commentId as string;
    const { text, projectId } = req.body;

    if (!text || !projectId) return res.status(400).json({ error: 'Missing data.' });

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { text: text },
    });

    const socketIo = req.app.get('io');
    socketIo.to(projectId).emit('refresh-workspace');

    return res.status(200).json(updatedComment);
  } catch (error) {
    console.error('Failed to update comment:', error);
    return res.status(500).json({ error: 'Failed to update comment.' });
  }
});

app.delete('/api/comments/:commentId', async (req: Request, res: Response): Promise<any> => {
  try {
    const commentId = req.params.commentId as string;
    
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { asset: true }
    });

    if (!comment) return res.status(404).json({ error: 'Comment not found.' });

    await prisma.comment.delete({ where: { id: commentId } });

    const socketIo = req.app.get('io');
    socketIo.to(comment.asset.projectId).emit('refresh-workspace');

    return res.status(200).json({ message: 'Comment deleted successfully.' });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    return res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

app.patch('/api/comments/:commentId/resolve', async (req: Request, res: Response): Promise<any> => {
  try {
    const commentId = req.params.commentId as string;
    const { projectId, isResolved } = req.body; 

    if (!projectId) return res.status(400).json({ error: 'Missing projectId.' });

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { isResolved: isResolved }, 
      include: { asset: { include: { project: { include: { owner: true } } } } } 
    });

    // 🚀 NEW: Log Pin Resolution
    await prisma.activityLog.create({ data: { projectId, action: 'RESOLVE', details: `A feedback pin was marked as ${isResolved ? 'Resolved' : 'Re-opened'}.` } });

    if (isResolved && updatedComment.asset?.project?.owner?.email) {
      const emailHtml = `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h2 style="color: #3b82f6; margin-top: 0;">Pin Resolved 📌</h2>
          <p>A client has marked a feedback pin as <b>Resolved</b> on the file: <i>${updatedComment.asset.fileName}</i>.</p>
          <p style="color: #6b7280; font-size: 14px;">Project: ${updatedComment.asset.project.title}</p>
        </div>
      `;
      await sendEmail(updatedComment.asset.project.owner.email, `Pin Resolved on ${updatedComment.asset.project.title}`, emailHtml);
    }

    const socketIo = req.app.get('io');
    socketIo.to(projectId).emit('refresh-workspace');

    return res.status(200).json({ message: 'Comment status updated successfully.' });
  } catch (error) {
    console.error('Failed to resolve comment:', error);
    return res.status(500).json({ error: 'Failed to resolve comment.' });
  }
});

const handleVoiceUpload = (req: Request, res: Response, next: NextFunction) => {
  uploadVoiceNote.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Voice note rejected. Audio must be under 10MB.' });
    }
    next();
  });
};

app.post('/api/upload-audio', handleVoiceUpload, async (req: Request, res: Response): Promise<any> => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No audio uploaded.' });

    const fileName = `voice-notes/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.webm`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });
    await r2.send(command);

    return res.status(201).json({ fileUrl: fileName });
  } catch (error) {
    console.error('Audio upload failed:', error);
    return res.status(500).json({ error: 'Audio upload failed.' });
  }
});

// ==========================================
// --- INVITE SYSTEM ROUTES ---
// ==========================================

app.post('/api/projects/:projectId/invite', async (req: Request, res: Response): Promise<any> => {
  try {
    const projectId = req.params.projectId as string;
    const { email, origin } = req.body; 
    
    let project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    if (!project.inviteToken) {
      const newToken = crypto.randomBytes(16).toString('hex');
      project = await prisma.project.update({
        where: { id: projectId },
        data: { inviteToken: newToken }
      });
    }

    if (email && origin) {
      const inviteLink = `${origin}/invite/${project.inviteToken}`;
      const emailHtml = `
        <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto; padding: 30px; border: 1px solid #111; background-color: #050505; color: #fff; border-radius: 4px;">
          <h2 style="color: #10b981; margin-top: 0;">PinSight Collaboration</h2>
          <p style="color: #a1a1aa; font-size: 16px;">You have been invited by the designer to review and provide feedback on:</p>
          <h3 style="font-size: 20px; border-left: 3px solid #10b981; padding-left: 10px;">${project.title}</h3>
          <br/>
          <a href="${inviteLink}" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #050505; text-decoration: none; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; border-radius: 2px;">Open Workspace</a>
        </div>
      `;
      await sendEmail(email, `You're invited to review ${project.title}`, emailHtml);
      
      // 🚀 NEW: Log Invitations
      await prisma.activityLog.create({ data: { projectId, action: 'STATUS', details: `Sent an email invite to ${email}` } });
    }

    return res.status(200).json({ inviteToken: project.inviteToken });
  } catch (error) {
    console.error('Failed to generate invite:', error);
    return res.status(500).json({ error: 'Failed to generate invite.' });
  }
});

app.post('/api/invite/:token/join', async (req: Request, res: Response): Promise<any> => {
  try {
    const token = req.params.token as string;
    const { userId } = req.body;

    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    const project = await prisma.project.findUnique({ where: { inviteToken: token } });
    if (!project) return res.status(404).json({ error: 'Invalid or expired invite link.' });

    if (project.ownerId === userId) {
      return res.status(200).json({ message: 'You own this project.', projectId: project.id });
    }

    const existingMember = await prisma.projectMember.findUnique({
      where: { 
        projectId_userId: { projectId: project.id, userId: userId } 
      }
    });

    if (!existingMember) {
      await prisma.projectMember.create({
        data: { projectId: project.id, userId: userId }
      });
    }

    return res.status(200).json({ message: 'Successfully joined project!', projectId: project.id });
  } catch (error) {
    console.error('Failed to join project:', error);
    return res.status(500).json({ error: 'Failed to join project.' });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 PinSight Engine running on http://localhost:${PORT}`);
});