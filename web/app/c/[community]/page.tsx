import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import ClientApp from "../../ClientApp";
import { findCommunity, getFeed } from "../../../lib/server-data";
import { alternatesFor, langFrom, absolute, JsonLd, breadcrumbJsonLd } from "../../../lib/seo";
import { communityLabel, SITE_NAME } from "../../../../src/app/data";

type Props = {
  params: Promise<{ community: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 60;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { community } = await params;
  const c = await findCommunity(community);
  if (!c) return { title: "Community not found", robots: { index: false } };
  const label = communityLabel(c);
  const path = `/c/${c.name.toLowerCase()}`;
  return {
    title: `${label}: news, questions and gist`,
    description: c.description,
    alternates: alternatesFor(path, langFrom(await searchParams)),
    openGraph: { title: `${label} on ${SITE_NAME}`, description: c.description, url: absolute(path) },
  };
}

export default async function CommunityPage({ params, searchParams }: Props) {
  const { community } = await params;
  const c = await findCommunity(community);
  if (!c) notFound();
  if (community !== c.name.toLowerCase()) permanentRedirect(`/c/${c.name.toLowerCase()}`);
  const posts = await getFeed(c.name);
  const path = absolute(`/c/${c.name.toLowerCase()}`);
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ name: SITE_NAME, url: absolute("/") }, { name: communityLabel(c), url: path }])} />
      <ClientApp initialPosts={posts} initialCommunity={c.name} initialLang={langFrom(await searchParams)} />
    </>
  );
}
