import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const nm = (p) => path.join(here, "node_modules", p);

// The app's components live in ../src (shared with the Figma Make app).
// Point their library imports at this site's own packages. React itself is
// already pinned by Next.js, so it isn't listed here.
const SHARED_PACKAGES = ["motion", "sonner", "lucide-react", "recharts", "@supabase/supabase-js"];

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { externalDir: true },
  // Pages import shared code from the folder above this one
  outputFileTracingRoot: path.join(here, ".."),
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      ...Object.fromEntries(SHARED_PACKAGES.map((p) => [p, nm(p)])),
    };
    return config;
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      ],
    }];
  },
};

export default nextConfig;
