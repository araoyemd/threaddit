import { useState, useEffect, useRef, Fragment, type ReactNode } from "react";
import { X, ArrowUp, ArrowDown, ImageIcon, ChevronDown, Bot, MoreHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useApp, useEscape } from "./context";
import { formatNumber } from "../lib";
import type { VoteDir } from "../types";

// ─── Modal ────────────────────────────────────────────────────────────────────

export function Modal({
  children, onClose, wide, label,
}: { children: ReactNode; onClose: () => void; wide?: boolean; label?: string }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ y: 24 }}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className={`bg-card w-full rounded-t-2xl sm:rounded shadow-xl border border-border overflow-hidden relative max-h-[92vh] overflow-y-auto ${wide ? "sm:max-w-xl" : "sm:max-w-lg"}`}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-2.5 right-2.5 w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors z-10">
          <X size={18} />
        </button>
        {children}
      </motion.div>
    </div>
  );
}

// ─── Vote widget ──────────────────────────────────────────────────────────────
// onVote returns:
//   null      → not allowed (signed out); nothing changes
//   undefined → local-only vote (sample posts)
//   a Promise → server vote; updates instantly, syncs, and rolls back on failure

type VoteResult = { votes: number; userVote: VoteDir | null };
export type OnVote = (dir: VoteDir) => Promise<VoteResult> | null | undefined;

export function VoteWidget({
  initialVotes, initialVote = null, vertical = false, small = false, onVote,
}: {
  initialVotes: number;
  initialVote?: VoteDir | null;
  vertical?: boolean;
  small?: boolean;
  onVote?: OnVote;
}) {
  const { t } = useApp();
  const [vote, setVote] = useState<VoteDir | null>(initialVote);
  const [count, setCount] = useState(initialVotes);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(0);

  const weight = (v: VoteDir | null) => (v === "up" ? 1 : v === "down" ? -1 : 0);

  const handle = async (e: React.MouseEvent, dir: VoteDir) => {
    e.stopPropagation();
    if (busy) return;
    const result = onVote ? onVote(dir) : undefined;
    if (result === null) return;
    const prevVote = vote;
    const prevCount = count;
    const next = vote === dir ? null : dir;
    setVote(next);
    setCount(c => c + weight(next) - weight(prevVote));
    setPop(p => p + 1);
    if (result) {
      setBusy(true);
      try {
        const res = await result;
        setCount(res.votes);
        setVote(res.userVote ?? null);
      } catch (err: any) {
        setVote(prevVote);
        setCount(prevCount);
        toast.error(err?.message?.includes("Sign in") ? err.message : "Your vote didn't go through. Check your connection and try again.");
      } finally {
        setBusy(false);
      }
    }
  };

  const upCls = vote === "up" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-black/5 dark:hover:bg-white/5";
  const downCls = vote === "down" ? "text-blue-600 dark:text-blue-400 bg-blue-500/10" : "text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:bg-black/5 dark:hover:bg-white/5";
  const countCls = vote === "up" ? "text-primary" : vote === "down" ? "text-blue-600 dark:text-blue-400" : vertical ? "text-foreground" : "text-muted-foreground";
  const btn = `${small ? "w-9 h-9" : "w-10 h-10"} flex items-center justify-center rounded-full transition-colors active:scale-90`;

  return (
    <div className={vertical ? "flex flex-col items-center gap-0.5 shrink-0" : "flex items-center gap-0.5"}>
      <button type="button" aria-label={t("Upvote")} aria-pressed={vote === "up"} onClick={(e) => handle(e, "up")} className={`${btn} ${upCls}`}>
        <ArrowUp size={small ? 15 : 18} />
      </button>
      <motion.span
        key={pop}
        initial={pop === 0 ? false : { scale: 1.4 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 15 }}
        className={`inline-block text-xs font-semibold font-mono tabular-nums leading-none min-w-[2ch] text-center ${countCls}`}
        aria-live="polite"
      >
        {formatNumber(count)}
      </motion.span>
      <button type="button" aria-label={t("Downvote")} aria-pressed={vote === "down"} onClick={(e) => handle(e, "down")} className={`${btn} ${downCls}`}>
        <ArrowDown size={small ? 15 : 18} />
      </button>
    </div>
  );
}

// ─── Images that respect Data saver ───────────────────────────────────────────

export function SmartImage({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const { dataSaver, t } = useApp();
  const [show, setShow] = useState(false);
  if (dataSaver && !show) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setShow(true); }}
        className={`w-full h-40 flex flex-col items-center justify-center gap-1.5 rounded bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/70 transition-colors ${className}`}
      >
        <ImageIcon size={20} /> {t("Tap to load image")}
      </button>
    );
  }
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />;
}

export function Carousel({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  if (!images || images.length === 0) return null;
  if (images.length === 1) return <SmartImage src={images[0]} alt={title} className="w-full object-cover max-h-72 rounded" />;

  const go = (d: number) => setIndex(i => (i + d + images.length) % images.length);
  return (
    <div
      className="relative mb-2 rounded overflow-hidden bg-muted group"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      <SmartImage src={images[index]} alt={`${title} (image ${index + 1} of ${images.length})`} className="w-full object-cover max-h-72" />
      <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full font-mono">
        {index + 1}/{images.length}
      </div>
      <button
        type="button"
        aria-label="Previous image"
        onClick={(e) => { e.stopPropagation(); go(-1); }}
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <ChevronDown className="rotate-90" size={18} />
      </button>
      <button
        type="button"
        aria-label="Next image"
        onClick={(e) => { e.stopPropagation(); go(1); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-black/50 hover:bg-black/70 text-white rounded-full sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <ChevronDown className="-rotate-90" size={18} />
      </button>
    </div>
  );
}

// ─── Community avatar (2-letter badge or emoji) ───────────────────────────────

export function CommunityAvatar({ icon, color, size = 24 }: { icon: string; color: string; size?: number }) {
  const isText = /^[A-Za-z]{1,3}$/.test(icon);
  return (
    <span
      aria-hidden="true"
      className="rounded-full flex items-center justify-center shrink-0 font-bold"
      style={{
        width: size, height: size, fontSize: isText ? Math.round(size * 0.38) : Math.round(size * 0.5),
        backgroundColor: `${color}2e`, color: `color-mix(in srgb, ${color} 70%, var(--foreground))`,
      }}
    >
      {icon}
    </span>
  );
}

export function FlairChip({ flair, color }: { flair: string; color?: string | null }) {
  const c = color ?? "#818590";
  return (
    <span className="px-2 py-0.5 rounded-full font-semibold text-[11px]" style={{ backgroundColor: `${c}24`, color: `color-mix(in srgb, ${c} 68%, var(--foreground))` }}>
      {flair}
    </span>
  );
}

export function UserFlair({ flair }: { flair?: string | null }) {
  if (!flair) return null;
  return <span className="px-1.5 py-px rounded bg-muted text-[10px] font-semibold text-muted-foreground">{flair}</span>;
}

/** Marks posts and comments from Threadit's bot accounts */
export function BotBadge() {
  return (
    <span title="Automated account run by Threadit" className="inline-flex items-center gap-0.5 px-1.5 py-px rounded bg-[#4fa3e0]/15 text-[10px] font-bold uppercase tracking-wide" style={{ color: "color-mix(in srgb, #4fa3e0 70%, var(--foreground))" }}>
      <Bot size={10} aria-hidden="true" /> Bot
    </span>
  );
}

/** Turns web addresses in plain text into links (marked as user content for search engines) */
export function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}
            className="text-primary underline underline-offset-2 break-all">
            {part.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}{part.replace(/^https?:\/\/(www\.)?/, "").length > 60 ? "…" : ""}
          </a>
        ) : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}

// ─── "More" menu (⋯) for posts and comments ───────────────────────────────────

export interface MenuItem { label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean }

export function MoreMenu({ items, label = "More options", small = false }: { items: MenuItem[]; label?: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`${small ? "w-9 h-9" : "w-10 h-10"} flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted`}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 bottom-full mb-1 sm:bottom-auto sm:top-full sm:mt-1 sm:mb-0 z-30 min-w-44 bg-popover border border-border rounded-lg shadow-xl py-1">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" onClick={() => { setOpen(false); it.onSelect(); }}
              className={`w-full flex items-center gap-2.5 px-3 h-10 text-sm text-left hover:bg-muted ${it.danger ? "text-destructive" : ""}`}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline "are you sure?" bar (the artifact host blocks window.confirm) */
export function ConfirmBar({ text, confirmLabel, onConfirm, onCancel, busy }: {
  text: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap rounded border border-destructive/30 bg-destructive/5 px-3 py-2" onClick={(e) => e.stopPropagation()}>
      <span className="text-sm flex-1 min-w-40">{text}</span>
      <button type="button" disabled={busy} onClick={onConfirm} className="h-9 px-4 rounded-full bg-destructive text-white text-xs font-semibold disabled:opacity-50">{confirmLabel}</button>
      <button type="button" onClick={onCancel} className="h-9 px-4 rounded-full text-xs font-semibold hover:bg-muted">Cancel</button>
    </div>
  );
}

/** Author name that links to their profile */
export function AuthorLink({ name, href, onOpen }: { name: string; href: string; onOpen: () => void }) {
  if (name === "[deleted]") return <span className="font-medium text-muted-foreground">[deleted]</span>;
  return (
    <a href={href} onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpen(); }} className="font-medium text-foreground hover:underline">
      {name}
    </a>
  );
}
