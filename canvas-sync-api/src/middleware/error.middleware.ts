import { type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

export const errorHandler = (err: any, req: Request, res: Response, next: NextFunction): any => {
  // Catch Zod Validation Errors globally
  if (err instanceof z.ZodError) {
    logger.warn('Validation error', { path: req.path, issues: err.issues });
    return res.status(400).json({ error: err.issues[0]?.message || 'Validation failed' });
  }

  // Log the full error securely (hiding stack traces from users in production)
  logger.error('Unhandled Exception', {
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? 'Hidden' : err.stack,
    path: req.path,
    method: req.method
  });

  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal Server Error' 
    : (err.message || 'Internal Server Error');

  return res.status(status).json({ error: message });
};