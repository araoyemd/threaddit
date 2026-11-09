import type { Metadata } from "next";
import { SITE_URL } from "./server-data";
import { SITE_NAME } from "../../src/app/data";
import type { Lang } from "../../src/app/i18n";
import type { Post, Comment, Community } from "../../src/app/types";

export const absolute = (path: string) => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export function langFrom(searchParams?: Record<string, string | string[] | undefined>): Lang {
  return searchParams?.lang === "pcm" ? "pcm" : "en";
}

/** Canonical + hreflang for English and Pidgin versions of a page */
export function alternatesFor(path: string, lang: Lang): Metadata["alternates"] {
  const en = absolute(path);
  const pcm = `${en}${en.includes("?") ? "&" : "?"}lang=pcm`;
  return {
    canonical: lang === "pcm" ? pcm : en,
    // "pcm" (Nigerian Pidgin) is valid ISO 639-3 but missing from Next.js's type list
    languages: { "en-NG": en, pcm, "x-default": en } as Record<string, string> as never,
  };
}

export function excerpt(text: string | undefined, max = 155): string {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : s;
}

const iso = (p: { createdAt?: string }) => p.createdAt ?? new Date().toISOString();
const personFor = (name: string) => ({ "@type": "Person", name });

/** schema.org DiscussionForumPosting, which Google uses for "Discussions and forums" results */
export function postJsonLd(post: Post, comments: Comment[], url: string, community: Community) {
  const byParent = new Map<string | null, Comment[]>();
  for (const c of comments.filter(c => !c.hidden)) byParent.set(c.parentId, [...(byParent.get(c.parentId) ?? []), c]);
  const toLd = (c: Comment): Record<string, unknown> => ({
    "@type": "Comment",
    text: c.body,
    datePublished: c.createdAt,
    author: personFor(c.author),
    url: `${url}#comment-${c.id}`,
    interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: Math.max(0, c.votes) },
    ...(byParent.get(c.id)?.length ? { comment: byParent.get(c.id)!.map(toLd) } : {}),
  });

  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: post.title,
    ...(post.body ? { text: post.body } : {}),
    url,
    mainEntityOfPage: url,
    datePublished: iso(post),
    author: personFor(post.author),
    isPartOf: { "@type": "WebPage", name: `${community.label ?? community.name} on ${SITE_NAME}`, url: absolute(`/c/${community.name.toLowerCase()}`) },
    ...(post.images?.length ? { image: post.images } : {}),
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: Math.max(0, post.votes) },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: post.comments },
    ],
    comment: (byParent.get(null) ?? []).map(toLd),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export function JsonLd({ data }: { data: unknown }) {
  // Escape "<" so content can't close the script tag
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
