// Server-side data for the Next.js pages. Reads the same Supabase edge function
// the app uses, with short caching so pages stay fast and fresh.
//
// Set THREADIT_DEMO=1 to render with the built-in sample posts instead (useful
// for local testing without network access).

import "server-only";
import { projectId, publicAnonKey } from "../../utils/supabase/info";
import { BUILTIN_COMMUNITIES, SAMPLE_POSTS } from "../../src/app/data";
import type { Post, PostDetail, Community, UserProfile } from "../../src/app/types";

const BASE = `https://${projectId}.supabase.co/functions/v1/make-server-8937b06c`;
const DEMO = process.env.THREADIT_DEMO === "1";

// The site's public address, used for canonical links, share images, the sitemap
// and robots.txt. Set THREADIT_SITE_URL in Vercel (https://www.owanbe.com); if it's
// missing, fall back to the production domain Vercel provides, never localhost.
const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
export const SITE_URL = (
  process.env.THREADIT_SITE_URL?.trim() ||
  (vercelProd ? `https://${vercelProd}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");

async function get<T>(path: string, revalidate = 60): Promise<T | null> {
  if (DEMO) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${publicAnonKey}` },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const clean = (p: Post): Post => ({ ...p, community: p.community.replace(/^r\//i, "") });

/** Real posts, or null when the server has none (the app then shows samples). */
export async function getFeed(community?: string): Promise<Post[] | null> {
  if (DEMO) {
    const list = community ? SAMPLE_POSTS.filter(p => p.community.toLowerCase() === community.toLowerCase()) : SAMPLE_POSTS;
    return list.length ? list : null;
  }
  const q = community ? `?community=${encodeURIComponent(community)}` : "";
  const posts = await get<Post[]>(`/posts${q}`);
  return posts && posts.length ? posts.map(clean) : null;
}

export async function getPostDetail(id: string): Promise<(PostDetail & { sample?: boolean }) | null> {
  const sample = SAMPLE_POSTS.find(p => String(p.id) === id);
  if (sample) return { post: sample, comments: [], sample: true };
  const d = await get<PostDetail>(`/posts/${encodeURIComponent(id)}`, 30);
  return d ? { post: clean(d.post), comments: d.comments } : null;
}

export async function getUserCommunities(): Promise<Community[]> {
  const list = await get<Community[]>("/communities", 300);
  return (list ?? []).map(c => ({ ...c, name: c.name.replace(/^r\//i, ""), kind: c.kind ?? "user" }));
}

export async function findCommunity(slug: string): Promise<Community | null> {
  const s = decodeURIComponent(slug).toLowerCase();
  const builtin = BUILTIN_COMMUNITIES.find(c => c.name.toLowerCase() === s);
  if (builtin) return builtin;
  return (await getUserCommunities()).find(c => c.name.toLowerCase() === s) ?? null;
}

/** For the sitemap: every real post */
export async function getAllPosts(): Promise<Post[]> {
  return ((await get<Post[]>("/posts", 3600)) ?? []).map(clean);
}

/** Public profile for /u/[username]. In demo mode, built from the sample posts. */
export async function getUserProfile(username: string): Promise<UserProfile | null> {
  const name = decodeURIComponent(username).replace(/^u\//i, "");
  if (DEMO) {
    const posts = SAMPLE_POSTS.filter(p => p.author.toLowerCase() === name.toLowerCase());
    if (!posts.length) return null;
    return {
      username: posts[0].author, isBot: false, flair: null, joinedAt: null, goldEarned: 0,
      postCount: posts.length, commentCount: 0, blockedByMe: false, isMe: false, posts, comments: [],
    };
  }
  const p = await get<UserProfile>(`/users/${encodeURIComponent(name)}`, 120);
  return p ? { ...p, posts: p.posts.map(clean) } : null;
}

export async function searchPosts(q: string): Promise<Post[]> {
  if (q.trim().length < 2) return [];
  if (DEMO) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return SAMPLE_POSTS.filter(p => terms.every(t => `${p.title} ${p.body ?? ""} ${p.community}`.toLowerCase().includes(t)));
  }
  return ((await get<Post[]>(`/search?q=${encodeURIComponent(q)}`, 60)) ?? []).map(clean);
}
