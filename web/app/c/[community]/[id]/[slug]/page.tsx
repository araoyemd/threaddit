import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ClientApp from "../../../../ClientApp";
import { findCommunity, getFeed, getPostDetail } from "../../../../../lib/server-data";
import { alternatesFor, langFrom, absolute, excerpt, JsonLd, postJsonLd, breadcrumbJsonLd } from "../../../../../lib/seo";
import { communityLabel, postPath, SITE_NAME } from "../../../../../../src/app/data";

type Props = {
  params: Promise<{ community: string; id: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 30;

async function load(id: string) {
  const d = await getPostDetail(decodeURIComponent(id));
  if (!d) return null;
  const c = (await findCommunity(d.post.community)) ?? {
    name: d.post.community, icon: "", description: "", color: "#2bb3a3", kind: "user" as const,
  };
  return { ...d, community: c };
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { id } = await params;
  const d = await load(id);
  if (!d) return { title: "Post not found", robots: { index: false } };
  const { post, community } = d;
  const path = postPath(post);
  const description = excerpt(post.body) || `${post.comments} comments in ${communityLabel(community)} on ${SITE_NAME}.`;
  return {
    title: post.title,
    description,
    alternates: alternatesFor(path, langFrom(await searchParams)),
    // Sample and hidden posts shouldn't appear in search results
    robots: d.sample || post.hidden ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: absolute(path),
      publishedTime: post.createdAt,
      authors: [post.author],
      section: communityLabel(community),
    },
    twitter: { card: "summary_large_image", title: post.title, description },
  };
}

export default async function PostPage({ params, searchParams }: Props) {
  const { community: slugCommunity, id, slug } = await params;
  const d = await load(id);
  if (!d) notFound();
  const canonical = postPath(d.post);
  if (`/c/${slugCommunity}/${id}/${slug}` !== canonical) permanentRedirect(canonical);

  const url = absolute(canonical);
  const feed = await getFeed(d.community.name);
  return (
    <>
      {!d.sample && <JsonLd data={postJsonLd(d.post, d.comments, url, d.community)} />}
      <JsonLd data={breadcrumbJsonLd([
        { name: SITE_NAME, url: absolute("/") },
        { name: communityLabel(d.community), url: absolute(`/c/${d.community.name.toLowerCase()}`) },
        { name: d.post.title, url },
      ])} />
      <ClientApp
        initialPosts={feed}
        initialCommunity={d.community.name}
        initialPost={{ post: d.post, comments: d.comments }}
        initialLang={langFrom(await searchParams)}
      />
    </>
  );
}
