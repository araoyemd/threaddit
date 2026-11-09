import type { Metadata } from "next";
import ClientApp from "../ClientApp";
import { searchPosts } from "../../lib/server-data";
import { langFrom } from "../../lib/seo";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q) : "";
  return {
    title: q ? `Search: ${q}` : "Search",
    // Search result pages shouldn't be indexed
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const results = q ? await searchPosts(q) : null;
  return <ClientApp initialPosts={results && results.length ? results : null} initialSearch={q} initialLang={langFrom(sp)} />;
}
