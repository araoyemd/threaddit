import { useEffect, useState } from "react";
import { User, LogOut, Loader2, Check, Bell, MessageSquare, TrendingUp, Gift, Users, Bot, Play, Pause, Download, Trash2, Ban, Copy } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./context";
import { Modal } from "./ui";
import { GoldProfilePanel, GoldBadge, TierBadge } from "./GoldSystem";
import { PROFILE_FLAIRS, PROFILE_FLAIR_COST, AWARDS } from "../data";
import { goldBalance, goldEarned, type AppNotification, type BotStatus, type BotRunReport } from "../types";
import * as api from "../api";

// ─── Profile + gold shop ──────────────────────────────────────────────────────

// ─── Bot controls (admins only) ───────────────────────────────────────────────

function RunSummary({ r }: { r: BotRunReport }) {
  const when = new Date(r.ranAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  if (r.paused) return <p className="text-xs text-muted-foreground">{when}: skipped, bots were paused.</p>;
  const failed = r.news.feeds.filter(f => !f.ok);
  return (
    <div className="text-xs text-muted-foreground flex flex-col gap-0.5">
      <p><span className="font-semibold text-foreground">{when}</span> · {r.news.posted} news · {r.gist.posted} discussions · {r.welcome.commented} welcomes · {r.answer?.answered ?? 0} answers · {r.helper.commented} answer nudges</p>
      {(r.answer?.failed ?? 0) > 0 && <p>AnswerBot couldn't reach Claude for {r.answer!.failed} question{r.answer!.failed === 1 ? "" : "s"}; it will retry next run.</p>}
      {r.news.feeds.length > 0 && (
        <p>Feeds: {r.news.feeds.filter(f => f.ok).length} of {r.news.feeds.length} reachable{failed.length ? ` (failed: ${failed.map(f => f.outlet).join(", ")})` : ""}</p>
      )}
      {r.retiredCommunities.length > 0 && <p>Stepped back in: {r.retiredCommunities.join(", ")}</p>}
    </div>
  );
}

export function BotPanel() {
  const { token } = useApp();
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [busy, setBusy] = useState<"run" | "pause" | null>(null);

  const load = () => { if (token) api.getBotStatus(token).then(setStatus).catch(err => toast.error(err.message)); };
  useEffect(load, [token]);

  const run = async () => {
    if (!token) return;
    setBusy("run");
    try {
      const r = await api.runBots(token);
      toast.success("Bots ran", { description: r.paused ? "They're paused, so nothing was posted." : `${r.news.posted} news, ${r.gist.posted} discussions, ${r.welcome.commented} welcomes, ${r.answer?.answered ?? 0} answers, ${r.helper.commented} nudges` });
      load();
    } catch (err: any) { toast.error(err.message); } finally { setBusy(null); }
  };
  const togglePause = async () => {
    if (!token || !status) return;
    setBusy("pause");
    try { await api.setBotsPaused(token, !status.paused); load(); } catch (err: any) { toast.error(err.message); } finally { setBusy(null); }
  };

  return (
    <section aria-labelledby="bots-heading" className="rounded border border-border p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="bots-heading" className="text-sm font-bold flex items-center gap-1.5"><Bot size={15} /> Site bots</h3>
        {status && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${status.paused || !status.enabled ? "bg-muted text-muted-foreground" : "bg-[#0b8a5a]/15 text-[#0b8a5a] dark:text-[#46d39a]"}`}>
            {!status.enabled ? "Turned off" : status.paused ? "Paused" : "Active"}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        NaijaNewsBot, GistStarterBot, WelcomeBot and AnswerBot post as labeled bots. News and discussion bots step back in each community once it has 15 real posts in a week.
        {status && !status.summaries && status.canFetchNews !== false && " Add an ANTHROPIC_API_KEY to the server to turn on AnswerBot and give news posts short summaries."}
        {status?.canFetchNews === false && " The preview can't reach news sites or Claude, so only the discussion, welcome and answer-nudge bots run here."}
      </p>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={run} disabled={!!busy || !status?.enabled} className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
          {busy === "run" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Run now
        </button>
        <button type="button" onClick={togglePause} disabled={!!busy || !status} className="h-9 px-4 rounded-full border border-border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted disabled:opacity-50">
          {busy === "pause" ? <Loader2 size={13} className="animate-spin" /> : status?.paused ? <Play size={13} /> : <Pause size={13} />} {status?.paused ? "Resume" : "Pause"}
        </button>
      </div>
      {status?.history?.length ? (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
          {status.history.slice(0, 3).map(r => <RunSummary key={r.ranAt} r={r} />)}
        </div>
      ) : status ? <p className="text-xs text-muted-foreground">No runs yet.</p> : null}
    </section>
  );
}

// ─── Your account: blocked people, download your data, delete the account ────

function AccountSection({ onDeleted }: { onDeleted: () => void }) {
  const { token, toggleBlock } = useApp();
  const [blocks, setBlocks] = useState<{ id: string; username: string }[] | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteContent, setDeleteContent] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (token) api.getBlocks(token).then(setBlocks).catch(() => setBlocks([])); }, [token]);

  const doExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const data = JSON.stringify(await api.exportAccount(token), null, 2);
      setExported(data);
      try {
        const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `threadit-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch { /* some browsers block downloads; the text below still works */ }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const doDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || confirmText.toLowerCase() !== "delete") return;
    setBusy(true);
    try {
      await api.deleteAccount(token, deleteContent, confirmText);
      toast.success("Your account was deleted");
      onDeleted();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-2">
      <h3 id="account-heading" className="text-sm font-bold">Your account</h3>

      <div className="rounded border border-border p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5"><Ban size={13} /> Blocked people</p>
        {blocks === null ? <p className="text-xs text-muted-foreground">Loading…</p>
          : blocks.length === 0 ? <p className="text-xs text-muted-foreground">You haven't blocked anyone. Use the ⋯ menu on a post or comment to block someone.</p>
          : (
            <ul className="flex flex-col gap-1">
              {blocks.map(b => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{b.username}</span>
                  <button type="button" onClick={() => { toggleBlock(b.username); setBlocks(blocks.filter(x => x.id !== b.id)); }}
                    className="h-8 px-3 rounded-full border border-border text-xs font-semibold hover:bg-muted">Unblock</button>
                </li>
              ))}
            </ul>
          )}
      </div>

      <div className="rounded border border-border p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5"><Download size={13} /> Download your data</p>
        <p className="text-xs text-muted-foreground">A file with your account details, posts, comments, gold, communities and notifications.</p>
        <button type="button" onClick={doExport} disabled={exporting} className="self-start h-9 px-4 rounded-full border border-border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted disabled:opacity-50">
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download my data
        </button>
        {exported && (
          <>
            <label htmlFor="export-text" className="text-xs text-muted-foreground">If the download didn't start, copy your data from here:</label>
            <textarea id="export-text" readOnly value={exported} rows={5} className="w-full font-mono text-[11px] bg-input-background border border-border rounded p-2" onFocus={(e) => e.currentTarget.select()} />
            <button type="button" onClick={() => navigator.clipboard.writeText(exported).then(() => toast.success("Copied")).catch(() => toast.error("Select the text and copy it instead."))}
              className="self-start h-8 px-3 rounded-full border border-border text-xs font-semibold flex items-center gap-1.5 hover:bg-muted">
              <Copy size={12} /> Copy
            </button>
          </>
        )}
      </div>

      <div className="rounded border border-destructive/30 p-3 flex flex-col gap-2">
        <p className="text-xs font-semibold flex items-center gap-1.5 text-destructive"><Trash2 size={13} /> Delete account</p>
        {!deleting ? (
          <>
            <p className="text-xs text-muted-foreground">Permanently deletes your login, gold, flair and notifications. This can't be undone.</p>
            <button type="button" onClick={() => setDeleting(true)} className="self-start h-9 px-4 rounded-full border border-destructive/40 text-destructive text-xs font-semibold hover:bg-destructive/10">Delete my account…</button>
          </>
        ) : (
          <form onSubmit={doDelete} className="flex flex-col gap-2">
            <label htmlFor="delete-content" className="flex items-start gap-2 text-xs cursor-pointer">
              <input id="delete-content" type="checkbox" checked={deleteContent} onChange={(e) => setDeleteContent(e.target.checked)} className="mt-0.5 accent-[var(--destructive)]" />
              <span>Also delete my posts and comments. If you leave this unticked, they stay up with the author shown as “[deleted]”.</span>
            </label>
            <label htmlFor="delete-confirm" className="text-xs text-muted-foreground">Type <span className="font-semibold text-foreground">delete</span> to confirm</label>
            <input id="delete-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off"
              className="bg-input-background border border-border rounded px-3 h-10 text-sm outline-none focus:border-destructive" />
            <div className="flex gap-2">
              <button type="submit" disabled={busy || confirmText.toLowerCase() !== "delete"} className="h-9 px-4 rounded-full bg-destructive text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40">
                {busy && <Loader2 size={13} className="animate-spin" />} Permanently delete
              </button>
              <button type="button" onClick={() => { setDeleting(false); setConfirmText(""); }} className="h-9 px-4 rounded-full text-xs font-semibold hover:bg-muted">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export function ProfileModal({ onClose, onSignOut, onDeleted, onViewProfile }: {
  onClose: () => void; onSignOut: () => void; onDeleted: () => void; onViewProfile: () => void;
}) {
  const { t, token, username, gold, refreshGold, moderates } = useApp();
  const [flair, setFlair] = useState<string | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const balance = goldBalance(gold);

  useEffect(() => {
    if (!token) return;
    api.getProfile(token).then(p => { setFlair(p.flair); setOwned(p.flairsOwned ?? []); }).catch(() => {});
  }, [token]);

  const choose = async (f: string | null) => {
    if (!token) return;
    setBusy(f ?? "none");
    try {
      const r = await api.setProfileFlair(token, f);
      setFlair(r.flair);
      if (r.owned) setOwned(r.owned);
      refreshGold();
      toast.success(f ? `Flair set to “${f}”` : "Flair removed", { description: f ? "It shows next to your name on new posts and comments." : undefined });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal onClose={onClose} wide label={t("Profile")}>
      <div className="h-20 bg-gradient-to-r from-[#0b8a5a] to-primary" />
      <div className="px-5 pb-5 relative -mt-10 flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div className="w-20 h-20 bg-card border-4 border-card rounded-full flex items-center justify-center" aria-hidden="true">
            <User size={38} className="text-muted-foreground" />
          </div>
          <TierBadge gold={goldEarned(gold)} className="mb-1" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{username}</h2>
          <button type="button" onClick={onViewProfile} className="text-xs font-semibold text-primary hover:underline">View your public profile</button>
          {flair && <p className="text-xs text-muted-foreground">Flair: <span className="font-semibold text-foreground">{flair}</span></p>}
        </div>

        <GoldProfilePanel gold={balance} breakdown={gold} />

        <section aria-labelledby="shop-heading" className="flex flex-col gap-2">
          <h3 id="shop-heading" className="text-sm font-bold">{t("Gold shop")}</h3>
          <div className="rounded border border-border p-3 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{t("Profile flair")}</span> · {PROFILE_FLAIR_COST} gold each, yours to switch between once bought.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROFILE_FLAIRS.map(f => {
                const has = owned.includes(f);
                const active = flair === f;
                const canBuy = has || balance >= PROFILE_FLAIR_COST;
                return (
                  <button key={f} type="button" disabled={!!busy || !canBuy} onClick={() => choose(f)} aria-pressed={active}
                    className={`h-9 px-3 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-colors disabled:opacity-40 ${active ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"}`}>
                    {busy === f ? <Loader2 size={12} className="animate-spin" /> : active ? <Check size={12} /> : null}
                    {f}
                    {!has && <GoldBadge amount={PROFILE_FLAIR_COST} size="xs" />}
                  </button>
                );
              })}
              {flair && (
                <button type="button" disabled={!!busy} onClick={() => choose(null)} className="h-9 px-3 rounded-full text-xs font-semibold text-muted-foreground hover:bg-muted">
                  Remove flair
                </button>
              )}
            </div>
            {balance < PROFILE_FLAIR_COST && owned.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("Not enough gold")}: you have {balance}. Post, get upvoted and start communities to earn more.</p>
            )}
          </div>
          <div className="rounded border border-border p-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Awards</span> · Give {Object.values(AWARDS).map(a => `${a.icon} ${a.label} (${a.cost} gold)`).join(" or ")} from the Award button on any post. The author receives half.
          </div>
        </section>

        {moderates.includes("*") && <BotPanel />}

        <AccountSection onDeleted={onDeleted} />

        {confirmSignOut ? (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">Sign out of Threadit on this device?</span>
            <button type="button" onClick={onSignOut} className="h-10 px-4 rounded-full bg-destructive text-white text-sm font-semibold">{t("Sign out")}</button>
            <button type="button" onClick={() => setConfirmSignOut(false)} className="h-10 px-4 rounded-full text-sm font-semibold hover:bg-muted">{t("Cancel")}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmSignOut(true)} className="self-start h-10 px-4 rounded-full border border-border text-sm font-semibold flex items-center gap-2 hover:bg-muted">
            <LogOut size={14} /> {t("Sign out")}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ─── Notifications ────────────────────────────────────────────────────────────

const ICONS: Record<AppNotification["type"], typeof Bell> = {
  comment: MessageSquare, reply: MessageSquare, milestone: TrendingUp, award: Gift, community: Users,
};

export function NotificationsPanel({
  items, onClose, onOpen, onMarkAll,
}: {
  items: AppNotification[];
  onClose: () => void;
  onOpen: (n: AppNotification) => void;
  onMarkAll: () => void;
}) {
  const { t } = useApp();
  const unread = items.filter(n => !n.read).length;
  return (
    <Modal onClose={onClose} label={t("Notifications")}>
      <div className="p-4 pr-14 border-b border-border flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">{t("Notifications")}</h2>
        {unread > 0 && (
          <button type="button" onClick={onMarkAll} className="text-xs font-semibold text-primary hover:underline">{t("Mark all as read")}</button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-sm text-muted-foreground text-center">{t("No notifications yet.")} Replies, upvote milestones and awards show up here.</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(n => {
            const Icon = ICONS[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button type="button" onClick={() => onOpen(n)} className={`w-full text-left flex gap-3 p-3 hover:bg-muted transition-colors ${n.read ? "" : "bg-primary/5"}`}>
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${n.read ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
                    <Icon size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm leading-snug">{n.text}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{new Date(n.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</span>
                  </span>
                  {!n.read && <span className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" aria-label="Unread" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
