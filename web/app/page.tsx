import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import ClientApp from "./ClientApp";
import { getFeed, getPostDetail } from "../lib/server-data";
import { alternatesFor, langFrom } from "../lib/seo";
import { postPath, SITE_NAME, SITE_TAGLINE } from "../../src/app/data";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const lang = langFrom(await searchParams);
  return {
    title: { absolute: `${SITE_NAME}: ${SITE_TAGLINE}` },
    alternates: alternatesFor("/", lang),
  };
}

export const revalidate = 60;

export default async function HomePage({ searchParams }: Props) {
  const sp = await searchParams;
  // Old share links from the Make app used ?post=ID; send them to the real page
  if (typeof sp.post === "string") {
    const d = await getPostDetail(sp.post);
    if (d) permanentRedirect(postPath(d.post));
  }
  if (typeof sp.c === "string") permanentRedirect(`/c/${encodeURIComponent(sp.c.toLowerCase())}`);
  const posts = await getFeed();
  return <ClientApp initialPosts={posts} initialLang={langFrom(sp)} />;
}
