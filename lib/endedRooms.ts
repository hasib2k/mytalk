/**
 * Tracks rooms that have been explicitly ended by host or admin.
 * Once ended, no one can rejoin - they must get a new room from admin.
 *
 * In-memory store; resets on server restart.
 * For production, consider persisting to Redis or a database.
 */

const endedRooms = new Set<string>();

export function markRoomEnded(roomName: string): void {
  endedRooms.add(roomName);
}

export function isRoomEnded(roomName: string): boolean {
  return endedRooms.has(roomName);
}
