/**
 * Minimal in-memory, per-IP rate limiter.
 *
 * NOTE: this lives in process memory, so it's per-instance and resets on
 * restart. For production at scale, back it with Redis. It's still an effective
 * first line against floods (e.g. room-creation spam) from a single source.
 */
const buckets = new Map<string, Map<string, { count: number; resetTime: number }>>();

export function rateLimit(bucket: string, ip: string, max: number, windowMs = 60_000): boolean {
  let m = buckets.get(bucket);
  if (!m) {
    m = new Map();
    buckets.set(bucket, m);
  }
  const now = Date.now();
  const entry = m.get(ip);
  if (!entry || now > entry.resetTime) {
    m.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

export function clientIp(request: Request): string {
  const h = request.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}
