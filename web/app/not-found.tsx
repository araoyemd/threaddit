import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, textAlign: "center" }} className="bg-background text-foreground">
      <h1 className="text-2xl font-bold">We can't find that page</h1>
      <p className="text-muted-foreground max-w-md">The post may have been removed, or the link was mistyped.</p>
      <Link href="/" className="h-11 px-5 rounded-full bg-primary text-primary-foreground font-semibold flex items-center">Go to the home feed</Link>
    </main>
  );
}
