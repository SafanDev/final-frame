import { type Request, type Response, type NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { logger } from '../utils/logger.js';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET as string;

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20, 
  message: { error: "Too many login attempts. Please try again later." }
});

// Phase 2: Restrict global limit from 1000 down to 200 requests per minute
export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, max: 200, 
  message: { error: "API rate limit exceeded." }
});

export interface AuthRequest extends Request {
  user?: { id: string; role: string; email?: string; name?: string };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction): any => {
  const token = req.cookies['__Secure-next-auth.session-token'] || req.cookies['next-auth.session-token'];
  
  if (!token) {
    logger.warn(`Missing authentication cookie on ${req.path}.`);
    return res.status(401).json({ error: 'Unauthorized: Missing Authentication Cookie.' });
  }

  try {
    const decoded = jwt.verify(token, NEXTAUTH_SECRET) as any;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or Expired Session.' });
  }
};