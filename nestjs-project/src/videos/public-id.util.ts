import { randomBytes } from 'node:crypto';

export const PUBLIC_ID_LENGTH = 11;

// 9 random bytes encode to exactly 12 base64url characters (72 bits);
// the first 11 keep 66 bits of entropy with the URL-safe alphabet [A-Za-z0-9_-].
export function generatePublicId(): string {
  return randomBytes(9).toString('base64url').slice(0, PUBLIC_ID_LENGTH);
}
