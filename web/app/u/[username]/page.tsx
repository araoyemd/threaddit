import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ClientApp from "../../ClientApp";
import { getFeed, getUserProfile } from "../../../lib/server-data";
import { alternatesFor, langFrom, absolute, JsonLd, breadcrumbJsonLd } from "../../../lib/seo";
import { userPath, SITE_NAME } from "../../../../src/app/data";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const revalidate = 120;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const profile = await getUserProfile((await params).username);
  if (!profile) return { title: "Profile not found", robots: { index: false } };
  const path = userPath(profile.username);
  const description = profile.isBot
    ? `${profile.username} is an automated account run by ${SITE_NAME}.`
    : `${profile.postCount} posts and ${profile.commentCount} comments by ${profile.username} on ${SITE_NAME}.`;
  return {
    title: profile.username,
    description,
    alternates: alternatesFor(path, langFrom(await searchParams)),
    // Thin profiles and bots aren't worth indexing
    robots: profile.isBot || profile.postCount + profile.commentCount === 0 ? { index: false, follow: true } : undefined,
    openGraph: { type: "profile", title: `${profile.username} on ${SITE_NAME}`, description, url: absolute(path) },
  };
}

export default async function UserProfilePage({ params, searchParams }: Props) {
  const profile = await getUserProfile((await params).username);
  if (!profile) notFound();
  const url = absolute(userPath(profile.username));
  return (
    <>
      <JsonLd data={{
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        url,
        ...(profile.joinedAt ? { dateCreated: profile.joinedAt } : {}),
        mainEntity: {
          "@type": "Person",
          name: profile.username,
          interactionStatistic: [
            { "@type": "InteractionCounter", interactionType: "https://schema.org/WriteAction", userInteractionCount: profile.postCount + profile.commentCount },
          ],
        },
      }} />
      <JsonLd data={breadcrumbJsonLd([{ name: SITE_NAME, url: absolute("/") }, { name: profile.username, url }])} />
      <ClientApp
        initialPosts={await getFeed()}
        initialUser={profile.username}
        initialProfile={profile}
        initialLang={langFrom(await searchParams)}
      />
    </>
  );
}
