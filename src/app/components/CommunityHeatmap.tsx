import { useState } from "react";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { Activity } from "lucide-react";
import { STATE_COMMUNITIES, communityLabel } from "../data";

// Real activity: posts in each state community over the last 7 days, from
// GET /stats/communities. Nothing here is invented.

function heat(ratio: number, opacity = 1): string {
  // From muted slate at 0 to the brand orange at 1
  const r = Math.round(58 + (255 - 58) * ratio);
  const g = Math.round(62 + (69 - 62) * ratio);
  const b = Math.round(72 + (0 - 72) * ratio);
  return `rgba(${r},${g},${b},${opacity})`;
}

interface Cell { name: string; label: string; icon: string; posts: number; size: number; ratio: number }

function TileContent(props: any) {
  const { x = 0, y = 0, width = 0, height = 0, label = "", posts = 0, ratio = 0 } = props;
  const showName = width > 46 && height > 26;
  return (
    <g>
      <rect x={x + 1} y={y + 1} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={3}
        style={{ fill: heat(ratio), stroke: "rgba(0,0,0,0.25)", strokeWidth: 1 }} />
      {showName && (
        <>
          <text x={x + 6} y={y + 15} style={{ fontSize: 10, fill: "#fff", fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.03em" }}>
            {label.length > 12 ? label.slice(0, 11) + "…" : label}
          </text>
          {height > 36 && (
            <text x={x + 6} y={y + 28} style={{ fontSize: 9, fill: "rgba(255,255,255,0.8)", fontFamily: "'Geist Mono', monospace" }}>
              {posts}
            </text>
          )}
        </>
      )}
    </g>
  );
}

function TipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: Cell = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded shadow-lg px-3 py-2 text-xs">
      <div className="font-bold text-foreground mb-0.5">{d.label}</div>
      <div className="text-muted-foreground">{d.posts} {d.posts === 1 ? "post" : "posts"} in the last 7 days</div>
    </div>
  );
}

export function CommunityHeatmap({ counts, onOpen }: { counts: Record<string, number>; onOpen?: (name: string) => void }) {
  const [view, setView] = useState<"map" | "list">("map");
  const lower = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k.toLowerCase(), v]));
  const rows = STATE_COMMUNITIES.map(s => ({ name: s.name, label: communityLabel(s).replace(" (FCT)", ""), icon: s.icon, posts: lower[s.name.toLowerCase()] ?? 0 }));
  const max = Math.max(0, ...rows.map(r => r.posts));
  const active = rows.filter(r => r.posts > 0).sort((a, b) => b.posts - a.posts);
  const cells: Cell[] = active.map(r => ({ ...r, size: r.posts, ratio: max ? r.posts / max : 0 }));
  const total = active.reduce((n, r) => n + r.posts, 0);

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-primary" />
          <h3 className="text-sm font-bold uppercase tracking-wider">State activity</h3>
        </div>
        {active.length > 0 && (
          <div className="flex items-center gap-1 bg-muted rounded p-0.5" role="tablist">
            {(["map", "list"] as const).map(v => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                className={`text-[11px] font-semibold px-2.5 h-7 rounded transition-colors ${view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {v === "map" ? "Map" : "List"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No state posts in the last 7 days yet. Activity appears here as people post in state communities.
          </p>
        ) : view === "map" ? (
          <ResponsiveContainer width="100%" height={200}>
            <Treemap data={cells} dataKey="size" aspectRatio={4 / 3} isAnimationActive={false} content={<TileContent />}
              onClick={(node: any) => node?.name && onOpen?.(node.name)}>
              <Tooltip content={<TipContent />} />
            </Treemap>
          </ResponsiveContainer>
        ) : (
          <ol className="flex flex-col gap-1">
            {active.slice(0, 12).map(r => (
              <li key={r.name}>
                <button type="button" onClick={() => onOpen?.(r.name)} className="w-full flex items-center gap-2 text-xs hover:bg-muted rounded px-1 py-1">
                  <span className="w-24 truncate text-left font-semibold">{r.label}</span>
                  <span className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <span className="block h-full rounded-full" style={{ width: `${(r.posts / max) * 100}%`, backgroundColor: heat(r.posts / max) }} />
                  </span>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">{r.posts}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {active.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2 text-center">
            {total.toLocaleString()} posts in {active.length} of the 36 states and the FCT · last 7 days
          </p>
        )}
      </div>
    </div>
  );
}

export default CommunityHeatmap;
