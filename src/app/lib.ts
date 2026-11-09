// Small helpers shared across the app. Nothing here touches `window` at import
// time, so it is safe for server rendering.

import type { Post } from "./types";
import { postPath } from "./data";

export function formatNumber(n: number) {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// Age of a post in hours. Uses createdAt (server posts) or parses timeAgo
// strings like "3 hours ago", "45m ago", "2d ago", "just now" (sample posts).
export function ageHours(p: Post, now = Date.now()): number {
  if (p.createdAt) return Math.max(0, (now - new Date(p.createdAt).getTime()) / 3_600_000);
  const s = (p.timeAgo || "").toLowerCase();
  if (s.includes("just")) return 0;
  const n = parseFloat(s) || 0;
  if (/\d\s*(months?|mo)\b/.test(s)) return n * 24 * 30;
  if (/\d\s*(m|mins?|minutes?)\b/.test(s)) return n / 60;
  if (/\d\s*(h|hrs?|hours?)\b/.test(s)) return n;
  if (/\d\s*(d|days?)\b/.test(s)) return n * 24;
  if (/\d\s*(w|wks?|weeks?)\b/.test(s)) return n * 24 * 7;
  return n;
}

// Hot: votes decay with age (like Reddit). Top: most votes. New: newest first.
// Rising: fastest votes-per-hour among posts from the last 24 hours.
export function sortPosts(posts: Post[], sort: string, now = Date.now()): Post[] {
  const list = [...posts];
  const age = (p: Post) => ageHours(p, now);
  const hot = (p: Post) => p.votes / Math.pow(age(p) + 2, 1.5);
  if (sort === "Top") list.sort((a, b) => b.votes - a.votes);
  else if (sort === "New") list.sort((a, b) => age(a) - age(b));
  else if (sort === "Rising") {
    const rate = (p: Post) => (age(p) <= 24 ? p.votes / (age(p) + 1) : -1);
    list.sort((a, b) => rate(b) - rate(a));
  } else list.sort((a, b) => hot(b) - hot(a));
  if (sort === "Hot") list.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  return list;
}

// localStorage can be missing (server rendering) or throw (private mode).
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch { return fallback; }
}
export function savePref(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Sample posts only exist in the app's code, not on the server. */
export const isSamplePost = (p: Post) => !!p.sample || String(p.id).startsWith("demo-");

export type Routing = "query" | "paths";

/** The address a post can be shared at. "paths" is used by the Next.js site. */
export function shareUrlFor(post: Post, routing: Routing): string {
  if (typeof window === "undefined") return postPath(post);
  if (routing === "paths") return new URL(postPath(post), window.location.origin).toString();
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("post", String(post.id));
  return url.toString();
}

/** True when the browser asks to save data or the connection is very slow. */
export function prefersDataSaver(): boolean {
  try {
    const c = (navigator as any).connection;
    return !!c && (c.saveData === true || /(^|-)2g$/.test(String(c.effectiveType ?? "")));
  } catch { return false; }
}
