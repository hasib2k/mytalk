/**
 * Input validation helpers for security hardening.
 */

const ROOM_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_ROOM_NAME_LENGTH = 100;
const MAX_PARTICIPANT_NAME_LENGTH = 50;
const MAX_METADATA_SIZE = 4096; // bytes

export function validateRoomName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MAX_ROOM_NAME_LENGTH) return false;
  return ROOM_NAME_REGEX.test(name);
}

export function validateParticipantName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;
  if (name.length === 0 || name.length > MAX_PARTICIPANT_NAME_LENGTH) return false;
  // Allow alphanumeric, spaces, hyphens, underscores, and common name characters
  return /^[a-zA-Z0-9 _\-'.]+$/.test(name);
}

export function validateImageUrl(url: string | null | undefined): boolean {
  if (!url || url === '') return true; // empty is allowed
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateMetadataSize(metadata: string | null | undefined): boolean {
  if (!metadata) return true;
  return new TextEncoder().encode(metadata).length <= MAX_METADATA_SIZE;
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[<>]/g, '') // strip angle brackets to prevent injection
    .trim();
}
