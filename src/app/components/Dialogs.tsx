import { useEffect, useState } from "react";
import { MessageSquare, Link2, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./context";
import { Modal } from "./ui";
import { GoldBadge } from "./GoldSystem";
import { AWARDS } from "../data";
import { goldBalance, type AwardKind, type Post, type ReportReason, type ModItem } from "../types";
import * as api from "../api";

// ─── Share ────────────────────────────────────────────────────────────────────

export function ShareSheet({ post, url, onClose }: { post: Post; url: string; onClose: () => void }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${post.title}\n${url}`)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("Link copied"));
      setTimeout(onClose, 600);
    } catch {
      toast.error("Couldn't copy the link. Select it below and copy it instead.");
    }
  };

  return (
    <Modal onClose={onClose} label={t("Share post")}>
      <div className="p-4 pr-12 border-b border-border">
        <h2 className="text-lg font-bold">{t("Share post")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.title}</p>
      </div>
      <div className="p-4 flex flex-col gap-2">
        <a href={whatsapp} target="_blank" rel="noopener noreferrer" onClick={onClose}
          className="flex items-center justify-center gap-2 h-12 rounded font-semibold text-sm text-white" style={{ backgroundColor: "#167a46" }}>
          <MessageSquare size={16} /> {t("Share to WhatsApp")}
        </a>
        <button type="button" onClick={copy} className="flex items-center justify-center gap-2 h-12 rounded border border-border font-semibold text-sm hover:bg-muted transition-colors">
          {copied ? <Check size={16} /> : <Link2 size={16} />} {t("Copy link")}
        </button>
        <p className="text-xs text-muted-foreground break-all select-all bg-muted/50 rounded p-2 mt-1">{url}</p>
      </div>
    </Modal>
  );
}

// ─── Report ───────────────────────────────────────────────────────────────────

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "scam", label: "Scam or fraud" },
  { value: "hate", label: "Hate or ethnic attacks" },
  { value: "misinformation", label: "False information" },
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "other", label: "Something else" },
];

export function ReportDialog({
  targetType, targetId, preview, onClose, onReported,
}: {
  targetType: "post" | "comment";
  targetId: string;
  preview: string;
  onClose: () => void;
  onReported?: (hidden: boolean) => void;
}) {
  const { t, token, requireAuth } = useApp();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { requireAuth(); return; }
    if (!reason) return;
    setBusy(true);
    try {
      const r = await api.report(token, targetType, targetId, reason);
      toast.success(t("Thanks. Moderators will review it."));
      onReported?.(!!r.hidden);
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label={t("Report")}>
      <form onSubmit={submit}>
        <div className="p-4 pr-12 border-b border-border">
          <h2 className="text-lg font-bold">{t("Why are you reporting this?")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview}</p>
        </div>
        <fieldset className="p-4 flex flex-col gap-1.5">
          <legend className="sr-only">{t("Why are you reporting this?")}</legend>
          {REASONS.map(r => (
            <label key={r.value} htmlFor={`reason-${r.value}`} className={`flex items-center gap-3 h-11 px-3 rounded border cursor-pointer text-sm transition-colors ${reason === r.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}>
              <input id={`reason-${r.value}`} type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="accent-[var(--primary)]" />
              {t(r.label)}
            </label>
          ))}
          <p className="text-xs text-muted-foreground mt-1">Posts reported by three different people are hidden until a moderator reviews them.</p>
          <button type="submit" disabled={!reason || busy} className="mt-2 h-11 rounded bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" />} {token ? t("Send report") : t("Sign In")}
          </button>
        </fieldset>
      </form>
    </Modal>
  );
}

// ─── Award ────────────────────────────────────────────────────────────────────

export function AwardDialog({ post, onClose, onAwarded }: { post: Post; onClose: () => void; onAwarded: (awards: Post["awards"]) => void }) {
  const { t, token, requireAuth, gold, refreshGold } = useApp();
  const [busy, setBusy] = useState<AwardKind | null>(null);
  const balance = goldBalance(gold);

  const give = async (kind: AwardKind) => {
    if (!token) { requireAuth(t("Sign in to earn gold")); return; }
    setBusy(kind);
    try {
      const r = await api.giveAward(token, String(post.id), kind);
      onAwarded(r.awards);
      refreshGold();
      toast.success(`${AWARDS[kind].label} award sent`, { description: `${post.author} receives ${AWARDS[kind].toAuthor} gold.` });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} label={t("Give an award")}>
      <div className="p-4 pr-12 border-b border-border">
        <h2 className="text-lg font-bold">{t("Give an award")}</h2>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.title}</p>
      </div>
      <div className="p-4 flex flex-col gap-2">
        {(Object.keys(AWARDS) as AwardKind[]).map(kind => {
          const a = AWARDS[kind];
          const affordable = !token || balance >= a.cost;
          return (
            <button
              key={kind}
              type="button"
              disabled={!!busy || (token ? !affordable : false)}
              onClick={() => give(kind)}
              className="flex items-center gap-3 p-3 rounded border border-border text-left hover:bg-muted transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span className="text-2xl" aria-hidden="true">{a.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">{a.label}</span>
                <span className="block text-xs text-muted-foreground">{a.description} The author gets {a.toAuthor} gold.</span>
              </span>
              {busy === kind ? <Loader2 size={16} className="animate-spin" /> : <GoldBadge amount={a.cost} size="sm" />}
            </button>
          );
        })}
        {token && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            {t("Balance")}: <GoldBadge amount={balance} size="xs" />
            {balance < AWARDS.helpful.cost && <span>· {t("Not enough gold")}</span>}
          </p>
        )}
      </div>
    </Modal>
  );
}

// ─── Moderator queue ──────────────────────────────────────────────────────────

const REASON_LABELS: Record<string, string> = Object.fromEntries(REASONS.map(r => [r.value, r.label]));

export function ModQueueDialog({ community, onClose, onChanged }: { community: string; onClose: () => void; onChanged?: () => void }) {
  const { t, token, openPost } = useApp();
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getModQueue(token, community).then(setItems).catch(err => { toast.error(err.message); setItems([]); });
  }, [token, community]);

  const act = async (item: ModItem, action: "approve" | "remove") => {
    if (!token) return;
    setBusy(item.targetId);
    try {
      await api.moderate(token, item.targetType, item.targetId, action);
      setItems(prev => (prev ?? []).filter(i => i.targetId !== item.targetId));
      toast.success(action === "approve" ? "Approved and visible again" : "Removed");
      onChanged?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} wide label={t("Mod queue")}>
      <div className="p-4 pr-12 border-b border-border">
        <h2 className="text-lg font-bold flex items-center gap-2"><ShieldCheck size={18} /> {t("Mod queue")}: {community}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Reported posts and comments. Approve to keep them up, or remove them.</p>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {items === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("Nothing to review.")}</p>
        ) : items.map(item => (
          <div key={item.targetId} className="border border-border rounded p-3 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
              <span className="font-semibold uppercase tracking-wide">{item.targetType}</span>
              <span>by {item.author}</span>
              {item.hidden && <span className="px-1.5 py-px rounded bg-destructive/10 text-destructive font-semibold">Hidden</span>}
            </div>
            <button type="button" onClick={() => { onClose(); openPost({ id: item.postId, community: item.community, title: item.title, author: "", timeAgo: "", votes: 0, comments: 0 }); }} className="text-left text-sm font-semibold hover:underline">
              {item.title}
            </button>
            {item.targetType === "comment" && <p className="text-sm text-foreground/80 line-clamp-3">{item.excerpt}</p>}
            <div className="flex flex-wrap gap-1.5">
              {item.reports.map(r => (
                <span key={r.reason} className="text-[11px] px-2 py-0.5 rounded-full bg-muted font-semibold">{t(REASON_LABELS[r.reason] ?? r.reason)} ×{r.count}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" disabled={busy === item.targetId} onClick={() => act(item, "approve")} className="h-10 px-4 rounded-full border border-border text-sm font-semibold hover:bg-muted disabled:opacity-50">{t("Approve")}</button>
              <button type="button" disabled={busy === item.targetId} onClick={() => act(item, "remove")} className="h-10 px-4 rounded-full bg-destructive text-white text-sm font-semibold disabled:opacity-50">{t("Remove")}</button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
