import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL SECURITY ERROR: JWT_SECRET environment variable must be set in production');
    }
    return 'local-ccms-secret-key-12345';
  }
  return secret;
}

export function hashPassword(password: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/**
 * FIX: tenant_id is now embedded in the JWT payload.
 * Previously it was missing, causing the server to rely on a global
 * tenant_config fallback that could mix up data between different cafés.
 */
export function signToken(payload: { id: string; email: string; role: string; tenant_id?: string | null }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '1h' });
}

export function verifyToken(token: string): { id: string; email: string; role: string; tenant_id?: string | null } {
  return jwt.verify(token, getJwtSecret()) as { id: string; email: string; role: string; tenant_id?: string | null };
}

export function signRefreshToken(payload: { id: string }): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, getJwtSecret()) as { id: string };
}
