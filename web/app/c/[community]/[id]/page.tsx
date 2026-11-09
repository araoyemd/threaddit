import { notFound, permanentRedirect } from "next/navigation";
import { getPostDetail } from "../../../../lib/server-data";
import { postPath } from "../../../../../src/app/data";

// /c/lagos/ID without the title slug → the full canonical address
export default async function PostIdRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getPostDetail(decodeURIComponent(id));
  if (!d) notFound();
  permanentRedirect(postPath(d.post));
}
