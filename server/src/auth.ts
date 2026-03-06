import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface UserContext {
  userId: string;
  email?: string;
}

declare global {
  namespace Express {
    interface Request {
      userContext?: UserContext;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'openclaw-default-jwt-secret';
const JWT_EXPIRES_IN = '30d';

export function signToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const bearer = req.headers['authorization'];

  if (!bearer?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized — please sign in' });
    return;
  }

  const token = bearer.slice(7);

  // JWT authentication
  const payload = verifyToken(token);
  if (payload) {
    req.userContext = { userId: payload.userId, email: payload.email };
    return next();
  }

  // Legacy static ACCESS_TOKEN (for programmatic / CLI access)
  const accessToken = process.env.ACCESS_TOKEN;
  if (accessToken && token === accessToken) {
    const userId = req.headers['x-user-id'] as string;
    if (!userId) {
      res.status(400).json({ error: 'X-User-Id header is required with ACCESS_TOKEN' });
      return;
    }
    req.userContext = { userId };
    return next();
  }

  res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
}
