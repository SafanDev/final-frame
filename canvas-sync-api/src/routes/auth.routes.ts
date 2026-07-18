import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { authLimiter } from '../middleware/auth.js';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['CLIENT', 'DESIGNER']).optional(),
});

router.post('/register', authLimiter, async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { name, email, password, role } = validatedData;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists.' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await prisma.user.create({ data: { name, email, passwordHash, role: role || 'CLIENT' } });
    const { passwordHash: _, ...safeUser } = newUser;
    
    return res.status(201).json({ message: 'User created', user: safeUser });
  } catch (error) { 
    // Phase 2: Pass to global error handler
    next(error); 
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials.' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const { passwordHash: _, ...safeUser } = user;
    
    return res.status(200).json({ message: 'Login successful', user: safeUser });
  } catch (error) { next(error); }
});

export default router;