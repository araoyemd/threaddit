// ─── Preview backend storage ──────────────────────────────────────────────────
// Used only by the hosted preview build (npm run build:preview), where the page
// can't reach Supabase. Everything is kept in this browser's localStorage, and
// falls back to memory if storage is blocked (private mode, previews).

const PREFIX = "threadit-preview:";
const memory = new Map<string, string>();

export function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw) as T;
  } catch {
    const raw = memory.get(key);
    if (raw !== undefined) return JSON.parse(raw) as T;
  }
  return fallback;
}

export function write(key: string, value: unknown) {
  const raw = JSON.stringify(value);
  try { localStorage.setItem(PREFIX + key, raw); } catch { memory.set(key, raw); }
}

export function remove(key: string) {
  try { localStorage.removeItem(PREFIX + key); } catch { memory.delete(key); }
}

// A short pause so loading states behave like they do against the real server
export const delay = (ms = 180) => new Promise(r => setTimeout(r, ms));

export interface PreviewUser {
  id: string;
  email: string;
  password: string;
  username: string;
  createdAt: string;
}

export function users(): Record<string, PreviewUser> {
  return read<Record<string, PreviewUser>>("users", {});
}

export function userFromToken(token?: string | null): PreviewUser | null {
  if (!token || !token.startsWith("preview-")) return null;
  const id = token.slice("preview-".length);
  return Object.values(users()).find(u => u.id === id) ?? null;
}

/** In the preview, the first account created in this browser can moderate everything. */
export function isPreviewAdmin(u: PreviewUser | null) {
  if (!u) return false;
  const first = Object.values(users()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  return first?.id === u.id;
}

export function publicUser(u: PreviewUser) {
  return { id: u.id, email: u.email, created_at: u.createdAt, user_metadata: { username: u.username.replace(/^u\//i, "") } };
}
