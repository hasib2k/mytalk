export interface MeetingRecord {
  roomName: string;
  role: string;
  timestamp: number;
  hk?: string; // host token, so the host can rejoin as host from history
}

const STORAGE_KEY = 'mytalk_meeting_history';
const MAX_HISTORY = 20;

export function saveMeeting(roomName: string, role: string, hk?: string) {
  try {
    const history = getMeetingHistory();
    // Remove duplicate if exists
    const filtered = history.filter((m) => m.roomName !== roomName);
    filtered.unshift({ roomName, role, timestamp: Date.now(), ...(hk ? { hk } : {}) });
    // Keep only latest
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_HISTORY)));
  } catch {}
}

export function getMeetingHistory(): MeetingRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function removeMeeting(roomName: string) {
  try {
    const history = getMeetingHistory().filter((m) => m.roomName !== roomName);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {}
}

export function clearAllMeetings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
