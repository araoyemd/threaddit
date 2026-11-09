import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "../../src/app/data";

// Lets people install Threadit on their phone's home screen like an app
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#0d0e10",
    theme_color: "#16181c",
    lang: "en-NG",
    categories: ["social", "news"],
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
