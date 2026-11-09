// Turns dist-preview/index.html (a full HTML document) into the page body the
// artifact host expects: no <!doctype>, <html>, <head> or <body> wrapper.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist-preview/index.html", "utf8");
const head = /<head>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? "";
const body = /<body>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? "";

const title = /<title>[\s\S]*?<\/title>/i.exec(head)?.[0] ?? "<title>Threadit</title>";
const rest = head
  .replace(/<title>[\s\S]*?<\/title>/i, "")
  .replace(/<meta charset[^>]*>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "");

writeFileSync("dist-preview/threadit.html", `${title}\n${rest.trim()}\n${body.trim()}\n`);
console.log("wrote dist-preview/threadit.html");
