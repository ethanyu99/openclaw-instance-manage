import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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

// In production, JWT_SECRET must be explicitly set.
// In development, a random ephemeral secret is generated per process start.
let _devSecret: string | undefined;

function getJwtSecret(): string {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be set in production');
  }
  if (!_devSecret) {
    _devSecret = crypto.randomBytes(64).toString('hex');
    console.warn('[auth] WARNING: No JWT_SECRET set — using ephemeral random secret (dev mode only)');
  }
  return _devSecret;
}

const JWT_EXPIRES_IN = '30d';

export function signToken(payload: { userId: string; email: string }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): { userId: string; email: string } | null {
  try {
    return jwt.verify(token, getJwtSecret()) as { userId: string; email: string };
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
  // Binds to a fixed admin userId — X-User-Id header is ignored to prevent impersonation.
  const accessToken = process.env.ACCESS_TOKEN;
  if (accessToken && token === accessToken) {
    const adminUserId = process.env.ADMIN_USER_ID || 'admin';
    req.userContext = { userId: adminUserId };
    return next();
  }

  res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
}
