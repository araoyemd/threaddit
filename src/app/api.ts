import { projectId, publicAnonKey } from "../../utils/supabase/info";
import type {
  Post, PostDetail, Comment, Community, AppNotification, Gold, ModItem, ReportReason, AwardKind, VoteDir,
  BotRunReport, BotStatus, UserProfile,
} from "./types";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-8937b06c`;

function authHeaders(token?: string | null) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token ?? publicAnonKey}`,
  };
}

async function request<T>(
  method: string,
  path: string,
  token?: string | null,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(token),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as T;
}

type VoteResult = { votes: number; userVote: VoteDir | null };

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface SignUpChecks {
  /** Hidden field; real people leave it empty */
  website?: string;
  /** How long the form was open, in milliseconds */
  formMs?: number;
  /** Cloudflare Turnstile token, when a site key is configured */
  captchaToken?: string;
  /** Where the confirmation email's link should send people */
  redirectTo?: string;
}

export function signUp(email: string, password: string, username: string, checks: SignUpChecks = {}) {
  return request<{ userId: string; username: string; needsConfirmation: boolean }>(
    "POST", "/auth/signup", null, { email, password, username, ...checks },
  );
}

// ── Your account ──────────────────────────────────────────────────────────────

export function exportAccount(token: string) {
  return request<Record<string, unknown>>("GET", "/account/export", token);
}

export function deleteAccount(token: string, deleteContent: boolean, confirm: string) {
  return request<{ ok: boolean }>("POST", "/account/delete", token, { deleteContent, confirm });
}

// ── Profiles, blocking, search ────────────────────────────────────────────────

export function getUser(username: string, token?: string | null) {
  return request<UserProfile>("GET", `/users/${encodeURIComponent(username.replace(/^u\//i, ""))}`, token);
}

export function getBlocks(token: string) {
  return request<{ id: string; username: string }[]>("GET", "/blocks", token);
}

export function setBlocked(token: string, username: string, block: boolean) {
  return request<{ id: string; username: string }[]>("POST", "/blocks", token, { username, block });
}

export function search(q: string, token?: string | null, community?: string) {
  const params = new URLSearchParams({ q });
  if (community) params.set("community", community);
  return request<Post[]>("GET", `/search?${params}`, token);
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export function getPosts(token?: string | null, community?: string) {
  const q = community ? `?community=${encodeURIComponent(community)}` : "";
  return request<Post[]>("GET", `/posts${q}`, token);
}

export function getPost(id: string, token?: string | null) {
  return request<PostDetail>("GET", `/posts/${encodeURIComponent(id)}`, token);
}

export function createPost(token: string, data: {
  community: string;
  communityIcon?: string;
  title: string;
  body?: string;
  flair?: string | null;
  flairColor?: string | null;
}) {
  return request<Post>("POST", "/posts", token, data);
}

export function editPost(token: string, postId: string, changes: { title?: string; body?: string; flair?: string | null; flairColor?: string | null }) {
  return request<Post>("PUT", `/posts/${postId}`, token, changes);
}

export function deletePost(token: string, postId: string) {
  return request<{ ok: boolean }>("DELETE", `/posts/${postId}`, token);
}

export function votePost(token: string, postId: string, direction: VoteDir) {
  return request<VoteResult>("POST", `/posts/${postId}/vote`, token, { direction });
}

export function giveAward(token: string, postId: string, award: AwardKind) {
  return request<{ awards: Post["awards"]; gold: Gold }>("POST", `/posts/${postId}/award`, token, { award });
}

// ── Comments ──────────────────────────────────────────────────────────────────

export function createComment(token: string, postId: string, body: string, parentId?: string | null) {
  return request<Comment>("POST", `/posts/${postId}/comments`, token, { body, parentId: parentId ?? null });
}

export function editComment(token: string, commentId: string, body: string) {
  return request<Comment>("PUT", `/comments/${commentId}`, token, { body });
}

export function deleteComment(token: string, commentId: string) {
  return request<{ ok: boolean; placeholder: boolean }>("DELETE", `/comments/${commentId}`, token);
}

export function voteComment(token: string, commentId: string, direction: VoteDir) {
  return request<VoteResult>("POST", `/comments/${commentId}/vote`, token, { direction });
}

// ── Reports & moderation ──────────────────────────────────────────────────────

export function report(token: string, targetType: "post" | "comment", targetId: string, reason: ReportReason) {
  return request<{ ok: boolean; hidden?: boolean; alreadyReported?: boolean }>(
    "POST", "/reports", token, { targetType, targetId, reason },
  );
}

export function getModQueue(token: string, community: string) {
  return request<ModItem[]>("GET", `/modqueue?community=${encodeURIComponent(community)}`, token);
}

export function moderate(token: string, targetType: "post" | "comment", targetId: string, action: "approve" | "remove") {
  return request<{ ok: boolean }>("POST", "/moderate", token, { targetType, targetId, action });
}

export function getModerates(token: string) {
  return request<string[]>("GET", "/moderates", token);
}

// ── Communities ───────────────────────────────────────────────────────────────

export type CommunityDTO = Community;

export function getCommunities() {
  return request<Community[]>("GET", "/communities");
}

export function getCommunityCounts() {
  return request<Record<string, number>>("GET", "/communities/counts");
}

// Creates the community and awards the founder +50 gold on the server.
export function createCommunity(token: string, data: { name: string; description?: string }) {
  return request<Community>("POST", "/communities", token, data);
}

export function getMemberships(token: string) {
  return request<string[]>("GET", "/memberships", token);
}

export function setJoined(token: string, community: string, join: boolean) {
  return request<{ members: number; joined: string[] }>(
    "POST", `/communities/${encodeURIComponent(community)}/join`, token, { join },
  );
}

export function getCommunityStats() {
  return request<Record<string, number>>("GET", "/stats/communities");
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function getNotifications(token: string) {
  return request<AppNotification[]>("GET", "/notifications", token);
}

export function markNotificationsRead(token: string, ids?: string[]) {
  return request<{ ok: boolean }>("POST", "/notifications/read", token, { ids });
}

// ── Bots (admins only; the scheduler uses a secret header instead) ───────────

export type BotJob = "news" | "gist" | "welcome" | "helper";

export function runBots(token: string, jobs?: BotJob[]) {
  return request<BotRunReport>("POST", "/bots/run", token, { jobs });
}

export function getBotStatus(token: string) {
  return request<BotStatus>("GET", "/bots/status", token);
}

export function setBotsPaused(token: string, paused: boolean) {
  return request<{ paused: boolean }>("POST", "/bots/pause", token, { paused });
}

// ── Pins ──────────────────────────────────────────────────────────────────────

export function getPins() {
  return request<any[]>("GET", "/pins");
}

export function createPin(token: string, data: {
  x: number; y: number; state: string;
  title: string; desc?: string; category?: string;
}) {
  return request<any>("POST", "/pins", token, data);
}

export function editPin(token: string, id: string, data: {
  title?: string; desc?: string; category?: string;
}) {
  return request<any>("PUT", `/pins/${id}`, token, data);
}

export function deletePin(token: string, id: string) {
  return request<{ success: boolean }>("DELETE", `/pins/${id}`, token);
}

// ── Gold & profile ────────────────────────────────────────────────────────────
// Gold is awarded and spent only by the server (posts, upvotes received,
// communities, awards, flair).

export function getGold(token: string) {
  return request<Gold>("GET", "/gold", token);
}

export function setProfileFlair(token: string, flair: string | null) {
  return request<{ flair: string | null; owned?: string[]; gold: Gold }>("POST", "/profile/flair", token, { flair });
}

export function getProfile(token: string) {
  return request<{
    userId: string; username: string; email: string;
    gold: Gold; flair: string | null; flairsOwned: string[]; isAdmin: boolean;
  }>("GET", "/profile", token);
}
