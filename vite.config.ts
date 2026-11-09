import { defineConfig, type Plugin } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// ─── Preview build helpers ────────────────────────────────────────────────────
// `npm run build:preview` makes one self-contained page for hosting where the
// app can't reach Supabase or Unsplash. Your source files are not changed:
//  • imports of ./api and utils/supabase/client are swapped for src/preview/*
//  • Unsplash photo URLs are swapped for generated placeholder images

const SWATCHES = [
  ["#0b6e4f", "#f2a541"], ["#1d3557", "#e76f51"], ["#3d405b", "#81b29a"],
  ["#5f0f40", "#fb8b24"], ["#264653", "#e9c46a"], ["#2b2d42", "#ef233c"],
  ["#14213d", "#fca311"], ["#335c67", "#e09f3e"], ["#4a4e69", "#c9ada7"],
];

function placeholder(url: string): string {
  let h = 0;
  for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = SWATCHES[h % SWATCHES.length];
  const w = /[?&]w=(\d+)/.exec(url)?.[1] ?? "800";
  const ht = /[?&]h=(\d+)/.exec(url)?.[1] ?? "450";
  const angle = h % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${ht}" viewBox="0 0 ${w} ${ht}">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>` +
    `<pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="28" fill="#fff" fill-opacity=".05"/></pattern></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/><rect width="100%" height="100%" fill="url(#p)"/></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function previewBackend(): Plugin {
  const previewDir = path.resolve(__dirname, "src/preview");
  return {
    name: "threadit-preview",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer || importer.startsWith(previewDir)) return null;
      if (/(^|\/)api$/.test(source) && importer.includes(`${path.sep}src${path.sep}app`)) {
        return path.join(previewDir, "api.ts");
      }
      if (/utils\/supabase\/client$/.test(source)) return path.join(previewDir, "supabase.ts");
      return null;
    },
    transform(code, id) {
      if (!id.includes(`${path.sep}src${path.sep}`) || !/\.(t|j)sx?$/.test(id)) return null;
      if (!code.includes("images.unsplash.com")) return null;
      return code.replace(/https:\/\/images\.unsplash\.com\/[^"'`\s)]+/g, (u) => placeholder(u));
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === "preview" ? [previewBackend(), viteSingleFile()] : []),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  assetsInclude: ["**/*.svg", "**/*.csv"],
  build: { outDir: mode === "preview" ? "dist-preview" : "dist", chunkSizeWarningLimit: 4000 },
}));
