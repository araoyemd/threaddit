"use client";

// The full interactive app, shared with the Figma Make project (../../src).
// Server pages pass it the data they rendered so the first paint matches.
import App, { type AppProps } from "../../src/app/App";

export default function ClientApp(props: AppProps) {
  return <App {...props} routing="paths" />;
}
