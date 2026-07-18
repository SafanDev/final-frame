import 'dotenv/config'; 

// Phase 2: Switch to structured logger
import { logger } from './utils/logger.js';

const REQUIRED_ENVS = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'FRONTEND_URL'];
for (const env of REQUIRED_ENVS) {
  if (!process.env[env]) {
    logger.error(`[CRITICAL HALT] Missing required environment variable: ${env}`);
    process.exit(1);
  }
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet'; 
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

import { prisma } from './config/prisma.js'; 
import { apiLimiter } from './middleware/auth.js';
import authRoutes from './routes/auth.routes.js';
import projectRoutes from './routes/project.routes.js';
import commentRoutes from './routes/comment.routes.js';
import miscRoutes from './routes/misc.routes.js';
import healthRoutes from './routes/health.routes.js';
import { errorHandler } from './middleware/error.middleware.js';

const FRONTEND_URL = process.env.FRONTEND_URL as string;
const PORT = process.env.PORT || 5000;
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET as string;

const app = express();
const server = createServer(app);

// PHASE 5: Essential for secure cookies and accurate rate limiting behind Render/Railway proxies
app.set('trust proxy', 1); 

// PHASE 5: Helmet secures Express headers. We allow cross-origin so Cloudflare R2 media loads correctly.
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
})); 

app.use(cookieParser());
app.use(compression()); 

// PHASE 5: Strict CORS locked to your exact production frontend URL
app.use(cors({ 
  origin: FRONTEND_URL, 
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"]
}));

app.use(express.json({ limit: '10mb' })); 

app.use('/health', healthRoutes);
app.use('/api/', apiLimiter);

// PHASE 5: Production WSS (WebSocket Secure) Optimization
const io = new Server(server, {
  cors: { 
    origin: FRONTEND_URL, 
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"], 
    credentials: true 
  },
  transports: ['websocket', 'polling'], // Prioritize fast websocket, fallback to polling if blocked by corporate firewalls
  pingTimeout: 60000, // Keep connections alive longer on spotty internet
  pingInterval: 25000
});

app.set('io', io);

const activeRooms = new Map<string, Map<string, any>>();

io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return next(new Error("Authentication error: Missing cookies."));

  const getCookie = (name: string) => {
    const match = cookieHeader.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return match[2];
    return null;
  };

  const token = getCookie('__Secure-next-auth.session-token') || getCookie('next-auth.session-token');
  if (!token) return next(new Error("Authentication error: Missing NextAuth token."));

  try {
    const decoded = jwt.verify(token, NEXTAUTH_SECRET) as any;
    socket.data.jwtUser = decoded; 
    next();
  } catch (err) {
    return next(new Error("Authentication error: Invalid or Expired Token."));
  }
});

io.on('connection', (socket) => {
  socket.on('join-workspace', async (payload) => {
    try {
      const projectId = typeof payload === 'string' ? payload : payload.projectId;
      const userId = socket.data.jwtUser.id;
      
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { members: true }
      });
      
      if (!project) return socket.disconnect();
      
      const isMember = project.members.some((m: any) => m.userId === userId);
      if (project.ownerId !== userId && !isMember) return socket.disconnect(); 

      const user = {
        id: socket.data.jwtUser.id,
        name: socket.data.jwtUser.name || 'User',
        email: socket.data.jwtUser.email,
        role: socket.data.jwtUser.role
      };
      
      socket.join(projectId);
      socket.data.projectId = projectId;
      socket.data.user = user;
      
      if (!activeRooms.has(projectId)) activeRooms.set(projectId, new Map());
      activeRooms.get(projectId)!.set(socket.id, { ...user, socketId: socket.id });
      io.to(projectId).emit('active-users', Array.from(activeRooms.get(projectId)!.values()));
    } catch (error) {
      logger.error("Socket join authorization error:", { error });
      socket.disconnect();
    }
  });

  socket.on('cursor-move', (data) => {
    if (socket.data.projectId === data.projectId) {
      socket.to(data.projectId).emit('cursor-update', { socketId: socket.id, ...data });
    }
  });

  socket.on('disconnecting', () => {
    const projectId = socket.data.projectId;
    if (projectId && activeRooms.has(projectId)) {
      activeRooms.get(projectId)!.delete(socket.id);
      if (activeRooms.get(projectId)!.size === 0) activeRooms.delete(projectId);
      else io.to(projectId).emit('active-users', Array.from(activeRooms.get(projectId)!.values()));
    }
    for (const room of socket.rooms) {
      if (room !== socket.id) socket.to(room).emit('cursor-remove', socket.id);
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api', miscRoutes); 

// PHASE 2: Global Error Handler MUST be the last middleware
app.use(errorHandler);

server.listen(PORT, () => logger.info(`🚀 Secure MVC FinalFrame Engine running on port ${PORT}`));