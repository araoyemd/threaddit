import { ogImage, OG_SIZE } from "../../../../og";
import { findCommunity, getPostDetail } from "../../../../../lib/server-data";
import { communityLabel } from "../../../../../../src/app/data";
import { formatNumber } from "../../../../../../src/app/lib";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Threadit post";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const d = await getPostDetail(decodeURIComponent((await params).id));
  if (!d) return ogImage({ kicker: "Threadit", title: "This post isn't available", footer: "threadit" });
  const c = await findCommunity(d.post.community);
  return ogImage({
    kicker: c ? communityLabel(c) : d.post.community,
    title: d.post.title,
    footer: `${formatNumber(d.post.votes)} upvotes · ${formatNumber(d.post.comments)} comments · ${d.post.author}`,
  });
}
