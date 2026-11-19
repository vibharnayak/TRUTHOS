import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../db/database';

const RUNTIME_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

export function getJwtSecret(): string {
  return process.env.SECRET_KEY || RUNTIME_FALLBACK_SECRET;
}

export function getTokenExpiryMinutes(): number {
  const raw = Number(process.env.ACCESS_TOKEN_EXPIRE_MINUTES || 1440);
  return Number.isFinite(raw) && raw > 0 ? raw : 1440;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(payload: { userId: string; email: string; role: string }): string {
  const expiresMinutes = getTokenExpiryMinutes();
  return jwt.sign(payload, getJwtSecret(), { expiresIn: `${expiresMinutes}m` });
}

export function verifyAccessToken(token: string): { userId: string; email: string; role: string } | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { userId: string; email: string; role: string };
    return decoded;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name: string;
    role: 'analyst' | 'admin';
    theme_preference: 'dark' | 'light';
    default_freshness_threshold: number;
    default_monitoring_frequency_hours: number;
    created_at: string;
  };
  authToken?: string;
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map((c) => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('truthos_token=')) {
        return decodeURIComponent(cookie.slice('truthos_token='.length));
      }
    }
  }
  return null;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired session token', code: 'INVALID_TOKEN' });
    return;
  }

  const db = getDb();
  const tokenHash = hashToken(token);
  const session = db
    .prepare(
      `SELECT id, expires_at FROM sessions WHERE user_id = ? AND token_hash = ? AND datetime(expires_at) > datetime('now')`
    )
    .get(decoded.userId, tokenHash) as { id: string; expires_at: string } | undefined;

  if (!session) {
    res.status(401).json({ error: 'Session revoked or expired', code: 'SESSION_EXPIRED' });
    return;
  }

  const user = db
    .prepare(
      `SELECT id, email, full_name, role, theme_preference, default_freshness_threshold, default_monitoring_frequency_hours, created_at
       FROM users WHERE id = ?`
    )
    .get(decoded.userId) as AuthenticatedRequest['user'];

  if (!user) {
    res.status(401).json({ error: 'User account not found', code: 'USER_NOT_FOUND' });
    return;
  }

  req.user = user;
  req.authToken = token;
  next();
}

export function recordAuditLog(params: {
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  details?: Record<string, unknown>;
}): void {
  try {
    const db = getDb();
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      params.userId ?? null,
      params.action,
      params.resourceType,
      params.resourceId ?? null,
      JSON.stringify(params.details ?? {})
    );
  } catch {
    // Non-fatal audit write failure should never leak internals
  }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function sanitizeRetrievedText(raw: string, maxLen = 1200): string {
  if (!raw) return '';
  return raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}
