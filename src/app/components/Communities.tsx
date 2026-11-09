import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Check, Plus, Search, ShieldCheck } from "lucide-react";
import { useApp } from "./context";
import { Modal, CommunityAvatar } from "./ui";
import { communityLabel, FEATURED_COMMUNITY_NAMES } from "../data";
import type { Community } from "../types";

// ─── Header shown on a community page ─────────────────────────────────────────

export function CommunityHeader({
  community, joined, onToggleJoin, onBack, onCreatePost, onOpenModQueue, headingLevel = 1,
}: {
  /** 2 when a post is open on top, so the post title is the page's only h1 */
  headingLevel?: 1 | 2;
  community: Community;
  joined: boolean;
  onToggleJoin: () => void;
  onBack: () => void;
  onCreatePost: () => void;
  onOpenModQueue?: () => void;
}) {
  const { t } = useApp();
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <motion.section key={community.name} initial={{ y: 8 }} animate={{ y: 0 }} className="bg-card border border-border rounded overflow-hidden">
      <div className="h-14" style={{ background: `linear-gradient(135deg, ${community.color} 0%, ${community.color}88 100%)` }} />
      <div className="p-4 -mt-8">
        <div className="flex items-end gap-3 mb-2">
          <span className="rounded-full border-4 border-card bg-card"><CommunityAvatar icon={community.icon} color={community.color} size={52} /></span>
          <div className="min-w-0 flex-1">
            <Heading className="text-lg font-bold truncate">{communityLabel(community)}</Heading>
            {(community.members ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">{community.members!.toLocaleString()} {t("members")}</p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{community.description}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onToggleJoin} aria-pressed={joined}
            className={`h-10 px-5 rounded-full text-sm font-semibold transition-colors ${joined ? "border border-border hover:bg-muted" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
            {joined ? <span className="flex items-center gap-1.5"><Check size={14} /> {t("Joined")}</span> : t("Join")}
          </button>
          <button type="button" onClick={onCreatePost} className="h-10 px-4 rounded-full text-sm font-semibold border border-border hover:bg-muted transition-colors flex items-center gap-1.5">
            <Plus size={14} /> {t("Create Post")}
          </button>
          {onOpenModQueue && (
            <button type="button" onClick={onOpenModQueue} className="h-10 px-4 rounded-full text-sm font-semibold border border-border hover:bg-muted transition-colors flex items-center gap-1.5">
              <ShieldCheck size={14} /> {t("Mod queue")}
            </button>
          )}
          <button type="button" onClick={onBack} className="h-10 px-4 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1.5 ml-auto">
            <ArrowLeft size={14} /> {t("All posts")}
          </button>
        </div>
      </div>
    </motion.section>
  );
}

// ─── Grouped community list (sidebar and browser) ─────────────────────────────

const SECTIONS: { label: string; kinds: Community["kind"][] }[] = [
  { label: "Interests", kinds: ["national", "interest", "user"] },
  { label: "States", kinds: ["state"] },
  { label: "Campuses", kinds: ["campus"] },
];

function CommunityRow({ c, active, joined, onOpen, onToggleJoin }: {
  c: Community; active: boolean; joined: boolean; onOpen: () => void; onToggleJoin?: () => void;
}) {
  const { t, hrefForCommunity } = useApp();
  return (
    <li className={`flex items-center gap-2 pr-2 transition-colors ${active ? "bg-muted" : "hover:bg-muted"}`}>
      <a href={hrefForCommunity(c.name)} onClick={(e) => { e.preventDefault(); onOpen(); }} aria-current={active ? "page" : undefined}
        className="flex-1 min-w-0 flex items-center gap-2.5 pl-3 py-2">
        <CommunityAvatar icon={c.icon} color={c.color} size={24} />
        <span className={`text-sm truncate ${active ? "text-foreground font-semibold" : "text-muted-foreground"}`}>{communityLabel(c)}</span>
      </a>
      {onToggleJoin ? (
        <button type="button" onClick={onToggleJoin} aria-pressed={joined}
          className={`h-8 px-3 rounded-full text-xs font-semibold shrink-0 ${joined ? "border border-border text-muted-foreground" : "bg-primary text-primary-foreground"}`}>
          {joined ? t("Joined") : t("Join")}
        </button>
      ) : joined ? <Check size={12} className="text-primary shrink-0" aria-label={t("Joined")} /> : null}
    </li>
  );
}

export function CommunitySidebar({
  communities, active, isJoined, onOpen, onCreate, onBrowse,
}: {
  communities: Community[];
  active: string | null;
  isJoined: (name: string) => boolean;
  onOpen: (name: string) => void;
  onCreate: () => void;
  onBrowse: () => void;
}) {
  const { t } = useApp();
  const shown = useMemo(() => {
    const joined = communities.filter(c => isJoined(c.name));
    const featured = FEATURED_COMMUNITY_NAMES.map(n => communities.find(c => c.name === n)).filter(Boolean) as Community[];
    const seen = new Set<string>();
    return [...joined, ...featured].filter(c => (seen.has(c.name) ? false : (seen.add(c.name), true))).slice(0, 10);
  }, [communities, isJoined]);

  return (
    <div className="bg-card border border-border rounded overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {t("Communities")}
        <button type="button" onClick={onCreate} aria-label={t("Create Community")} className="w-8 h-8 -mr-1 flex items-center justify-center rounded hover:bg-muted">
          <Plus size={14} />
        </button>
      </div>
      <ul>
        {shown.map(c => (
          <CommunityRow key={c.name} c={c} active={active?.toLowerCase() === c.name.toLowerCase()} joined={isJoined(c.name)} onOpen={() => onOpen(c.name)} />
        ))}
      </ul>
      <button type="button" onClick={onBrowse} className="w-full px-3 py-2.5 text-left text-xs font-semibold text-primary hover:bg-muted border-t border-border">
        {t("Show all communities")} ({communities.length})
      </button>
    </div>
  );
}

export function CommunityBrowser({
  communities, active, isJoined, onOpen, onToggleJoin, onClose, onCreate,
}: {
  communities: Community[];
  active: string | null;
  isJoined: (name: string) => boolean;
  onOpen: (name: string) => void;
  onToggleJoin: (name: string) => void;
  onClose: () => void;
  onCreate: () => void;
}) {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const match = (c: Community) => !query || communityLabel(c).toLowerCase().includes(query) || c.description.toLowerCase().includes(query);

  return (
    <Modal onClose={onClose} wide label={t("Communities")}>
      <div className="p-4 pr-14 border-b border-border flex flex-col gap-3">
        <h2 className="text-lg font-bold">{t("Communities")}</h2>
        <div className="flex items-center gap-2 rounded px-3 h-10 border border-border bg-input-background focus-within:border-primary">
          <Search size={15} className="text-muted-foreground shrink-0" />
          <label htmlFor="community-search" className="sr-only">Find a community</label>
          <input id="community-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a state, campus or topic" className="flex-1 min-w-0 bg-transparent text-sm outline-none" />
        </div>
      </div>
      <div className="py-2">
        {SECTIONS.map(s => {
          const list = communities.filter(c => s.kinds.includes(c.kind) && match(c));
          if (!list.length) return null;
          return (
            <section key={s.label} className="py-1">
              <h3 className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t(s.label)} <span className="font-normal">({list.length})</span></h3>
              <ul>
                {list.map(c => (
                  <CommunityRow key={c.name} c={c} active={active?.toLowerCase() === c.name.toLowerCase()} joined={isJoined(c.name)}
                    onOpen={() => { onClose(); onOpen(c.name); }} onToggleJoin={() => onToggleJoin(c.name)} />
                ))}
              </ul>
            </section>
          );
        })}
        <div className="px-4 pt-2 pb-3">
          <button type="button" onClick={() => { onClose(); onCreate(); }} className="h-10 px-4 rounded-full border border-border text-sm font-semibold hover:bg-muted flex items-center gap-1.5">
            <Plus size={14} /> {t("Create Community")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
