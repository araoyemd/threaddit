import { ogImage, OG_SIZE } from "../../og";
import { findCommunity } from "../../../lib/server-data";
import { communityLabel } from "../../../../src/app/data";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Threadit community";

export default async function Image({ params }: { params: Promise<{ community: string }> }) {
  const c = await findCommunity((await params).community);
  return ogImage({
    kicker: c ? communityLabel(c) : "Community",
    title: c?.description ?? "A Threadit community",
    footer: "Join the conversation on Threadit",
  });
}
