import { ogImage, OG_SIZE } from "./og";
import { SITE_TAGLINE } from "../../src/app/data";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Threadit";

export default function Image() {
  return ogImage({ kicker: "Nigeria", title: SITE_TAGLINE, footer: "36 states + FCT · campuses · English & Pidgin" });
}
