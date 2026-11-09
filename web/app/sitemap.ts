import type { MetadataRoute } from "next";
import { SITE_URL, getAllPosts, getUserCommunities } from "../lib/server-data";
import { BUILTIN_COMMUNITIES, communityPath, postPath, userPath } from "../../src/app/data";

export const revalidate = 3600;

// Every community and every real post, with Pidgin alternates
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, userCommunities] = await Promise.all([getAllPosts(), getUserCommunities()]);
  const entry = (path: string, lastModified?: string, priority?: number): MetadataRoute.Sitemap[number] => ({
    url: `${SITE_URL}${path}`,
    lastModified: lastModified ? new Date(lastModified) : undefined,
    priority,
    // Next.js only types common language codes; "pcm" (Nigerian Pidgin) is a valid ISO 639-3 code
    alternates: { languages: { "en-NG": `${SITE_URL}${path}`, pcm: `${SITE_URL}${path}?lang=pcm` } as Record<string, string> as never },
  });
  return [
    entry("/", new Date().toISOString(), 1),
    ...[...BUILTIN_COMMUNITIES, ...userCommunities].map(c => entry(communityPath(c.name), undefined, 0.7)),
    ...posts.filter(p => !p.hidden).slice(0, 45000).map(p => entry(postPath(p), p.createdAt, 0.6)),
    // Profiles of people who have posted (not bots or deleted accounts)
    ...[...new Set(posts.filter(p => !p.isBot && p.author !== "[deleted]").map(p => p.author))].slice(0, 4000).map(a => entry(userPath(a), undefined, 0.3)),
  ];
}
