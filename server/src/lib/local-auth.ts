import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'local-ccms-secret-key-12345';

export function hashPassword(password: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

export function verifyToken(token: string): { id: string; email: string; role: string } {
  return jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
}

export function signRefreshToken(payload: { id: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { id: string } {
  return jwt.verify(token, JWT_SECRET) as { id: string };
}
