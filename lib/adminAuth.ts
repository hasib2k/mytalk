/**
 * HMAC-based admin token generation and verification.
 *
 * Instead of passing the raw ADMIN_PASSWORD to clients, we generate
 * a short-lived, room-scoped HMAC token. This ensures that even if
 * the token is intercepted, it cannot be reused for other rooms
 * and expires after 5 minutes.
 */
import crypto from 'crypto';

// Key used to SIGN all server tokens (admin/host/participant). This must be a
// strong, non-public secret, otherwise anyone could forge tokens. We use
// NEXTAUTH_SECRET (already required for auth) so a weak ADMIN_PASSWORD can never
// make tokens forgeable. In production an unset secret is a hard error.
const SIGNING_SECRET =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === 'production'
    ? (() => {
        throw new Error('NEXTAUTH_SECRET must be set in production');
      })()
    : 'dev-only-insecure-signing-secret');

const TOKEN_EXPIRY_SECONDS = 86400; // 24 hours (matches session maxAge)
const HOST_TOKEN_EXPIRY_SECONDS = 60 * 60 * 24 * 30; // 30 days — host link credential

export function generateAdminToken(roomName: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = `${roomName}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  return `${timestamp}:${signature}`;
}

export function verifyAdminToken(token: string, roomName: string): boolean {
  if (!token) return false;

  const parts = token.split(':');
  if (parts.length !== 2) return false;

  const [timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > TOKEN_EXPIRY_SECONDS) return false;

  // Recompute expected signature
  const payload = `${roomName}:${timestampStr}`;
  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Host link credential. Only someone who knows ADMIN_PASSWORD (i.e. the server)
 * can mint a valid token for a room, so a listener cannot promote themselves to
 * host by editing `?role=listener` to `?role=host` in the URL.
 */
/**
 * Per-participant proof of identity. Set as an httpOnly cookie at join time so
 * that endpoints which act on a participant (raise hand, mid-meeting host
 * promotion) can confirm the caller really IS that participant — and not just
 * someone who read the (publicly visible in-room) identity string. The signature
 * can't be forged without the server secret, and the cookie can't be read by JS.
 */
const PARTICIPANT_AUTH_EXPIRY_SECONDS = 60 * 60 * 12; // 12 hours

export function signParticipant(identity: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`pt:${identity}:${timestamp}`)
    .digest('hex');
  return `${timestamp}:${sig}`;
}

export function verifyParticipant(token: string | undefined, identity: string): boolean {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > PARTICIPANT_AUTH_EXPIRY_SECONDS) return false;
  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`pt:${identity}:${timestampStr}`)
    .digest('hex');
  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export function generateHostToken(roomName: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`host:${roomName}:${timestamp}`)
    .digest('hex');
  return `${timestamp}:${signature}`;
}

export function verifyHostToken(token: string, roomName: string): boolean {
  if (!token) return false;
  const parts = token.split(':');
  if (parts.length !== 2) return false;
  const [timestampStr, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > HOST_TOKEN_EXPIRY_SECONDS) return false;

  const expected = crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`host:${roomName}:${timestampStr}`)
    .digest('hex');

  if (signature.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}
