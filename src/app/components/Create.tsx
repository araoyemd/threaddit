import { useState } from "react";
import { Coins, Loader2, Music2 } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./context";
import { Modal } from "./ui";
import { GoldCoin } from "./GoldSystem";
import { FLAIRS, SCAM_ALERT, communityLabel } from "../data";
import type { Community, Post } from "../types";
import * as api from "../api";

const GROUPS: { kind: Community["kind"][]; label: string }[] = [
  { kind: ["national", "interest", "user"], label: "Communities" },
  { kind: ["state"], label: "States" },
  { kind: ["campus"], label: "Campuses" },
];

export function CreatePostModal({
  onClose, communities, defaultCommunity, onCreated,
}: {
  onClose: () => void;
  communities: Community[];
  defaultCommunity?: string | null;
  onCreated: (p: Post) => void;
}) {
  const { t, token, requireAuth } = useApp();
  const [tab, setTab] = useState<"Text" | "Link" | "Media">("Text");
  const [community, setCommunity] = useState(defaultCommunity ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [flair, setFlair] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const linkValid = !link || /^https?:\/\/\S+\.\S+/.test(link.trim());

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { requireAuth(t("Sign in to post")); return; }
    if (!title.trim() || !community || !linkValid) return;
    setSubmitting(true);
    try {
      const comm = communities.find(c => c.name === community);
      const f = FLAIRS.find(x => x.name === flair);
      const fullBody = [link.trim(), body.trim()].filter(Boolean).join("\n\n");
      // The server saves the post and awards the +10 gold
      const post = await api.createPost(token, {
        community,
        communityIcon: comm?.icon,
        title: title.trim(),
        body: fullBody,
        flair: f?.name ?? null,
        flairColor: f?.color ?? null,
      });
      onCreated(post);
      toast.success("+10 Gold", { description: "Post published — nice one!", icon: "🪙" });
      onClose();
    } catch (err: any) {
      toast.error(`Couldn't publish: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const field = "bg-input-background border border-border rounded p-2.5 text-sm text-foreground outline-none focus:border-primary w-full";

  return (
    <Modal onClose={onClose} label={t("Create Post")}>
      <form onSubmit={handlePost}>
        <div className="p-4 border-b border-border flex items-center justify-between pr-14 gap-2">
          <h2 className="text-lg font-bold">{t("Create Post")}</h2>
          <div className="flex items-center gap-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2.5 py-1">
            <GoldCoin size={12} />
            <span className="text-xs font-bold text-amber-700 dark:text-[#f5c542]">+10 gold</span>
          </div>
        </div>
        <div role="tablist" className="flex gap-1 px-2 border-b border-border overflow-x-auto">
          {(["Text", "Link", "Media"] as const).map(lbl => (
            <button key={lbl} type="button" role="tab" aria-selected={tab === lbl} onClick={() => setTab(lbl)}
              className={`text-sm h-11 px-3 border-b-2 font-semibold transition-colors ${tab === lbl ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {lbl === "Media" ? "Images & Video" : lbl}
            </button>
          ))}
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label htmlFor="new-post-community" className="sr-only">{t("Choose a community")}</label>
          <select id="new-post-community" value={community} onChange={e => setCommunity(e.target.value)} className={field} required>
            <option value="">{t("Choose a community")}</option>
            {GROUPS.map(g => (
              <optgroup key={g.label} label={t(g.label)}>
                {communities.filter(c => g.kind.includes(c.kind)).map(c => <option key={c.name} value={c.name}>{communityLabel(c)}</option>)}
              </optgroup>
            ))}
          </select>

          <label htmlFor="new-post-title" className="sr-only">{t("Title")}</label>
          <input id="new-post-title" value={title} onChange={e => setTitle(e.target.value)} type="text" placeholder={t("Title")} maxLength={300} required className={field} />

          {tab === "Link" && (
            <>
              <label htmlFor="new-post-link" className="sr-only">Link</label>
              <input id="new-post-link" value={link} onChange={e => setLink(e.target.value)} type="url" inputMode="url" placeholder="https://" className={field} />
              {!linkValid && <p className="text-xs text-destructive -mt-1">Enter a full web address starting with https://</p>}
            </>
          )}
          {tab === "Media" ? (
            <div className="border-2 border-dashed border-border rounded p-5 text-sm text-muted-foreground flex flex-col gap-2">
              <p>Photo and video uploads are coming soon. For now, add a link to your image or video in the Link tab.</p>
              <p className="flex items-start gap-2 text-xs"><Music2 size={14} className="shrink-0 mt-0.5" /> {t("Original audio only. Videos that use copyrighted music will be removed.")}</p>
            </div>
          ) : (
            <>
              <label htmlFor="new-post-body" className="sr-only">{t("Text (optional)")}</label>
              <textarea id="new-post-body" value={body} onChange={e => setBody(e.target.value)} placeholder={t("Text (optional)")} maxLength={20000} className={`${field} h-32 resize-y`} />
            </>
          )}

          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Flair")}>
            <span className="text-xs text-muted-foreground w-full">{t("Flair")}</span>
            {[{ name: "", color: "#818590" }, ...FLAIRS].map(f => (
              <button key={f.name || "none"} type="button" role="radio" aria-checked={flair === f.name} onClick={() => setFlair(f.name)}
                className={`h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${flair === f.name ? "border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
                style={flair === f.name ? { backgroundColor: `${f.color}2a`, color: `color-mix(in srgb, ${f.color} 68%, var(--foreground))` } : undefined}>
                {f.name ? t(f.name) : t("No flair")}
              </button>
            ))}
          </div>
          {flair === SCAM_ALERT && (
            <p className="text-xs text-muted-foreground -mt-1">Scam alerts appear in the Scam alerts filter. Describe what happened, but don't share anyone's phone number or address.</p>
          )}

          <div className="flex items-center gap-2 bg-yellow-500/8 border border-yellow-500/15 rounded-lg p-3">
            <Coins size={16} className="text-amber-600 dark:text-[#f5c542] shrink-0" />
            <p className="text-xs text-muted-foreground">
              Publishing earns you <span className="font-bold text-amber-700 dark:text-[#f5c542]">+10 gold</span>, plus 1 gold for each upvote from someone else.
            </p>
          </div>
          {!token && <p className="text-xs text-muted-foreground text-center">You need to sign in before you can post. Your draft stays here while you do.</p>}
          <div className="flex justify-end pt-1">
            <button type="submit" disabled={submitting || (!!token && (!title.trim() || !community || !linkValid))}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 h-11 rounded text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting && <Loader2 size={13} className="animate-spin" />}
              {token ? t("Post & Earn Gold") : t("Sign in to post")}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function CreateCommunityModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Community) => void }) {
  const { t, token, requireAuth } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const validName = /^[A-Za-z0-9_]{3,21}$/.test(name);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { requireAuth(t("Sign in to earn gold")); return; }
    if (!validName) return;
    setSubmitting(true);
    try {
      const community = await api.createCommunity(token, { name, description: description.trim() });
      onCreated(community);
      toast.success("+50 Gold", { description: `${community.name} is live — founding bonus earned!`, icon: "🪙" });
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose} label={t("Create Community")}>
      <form onSubmit={handleCreate}>
        <div className="p-4 border-b border-border pr-14">
          <h2 className="text-lg font-bold">{t("Create Community")}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Start a new community. You'll be its moderator.</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-xl p-4 bg-yellow-500/10 border border-yellow-500/25">
            <Coins size={22} className="text-amber-600 dark:text-[#f5c542] shrink-0" />
            <div>
              <div className="text-sm font-bold text-amber-700 dark:text-[#f5c542]">+50 Gold Founding Bonus</div>
              <div className="text-xs text-muted-foreground">Paid when your community goes live.</div>
            </div>
          </div>
          <div>
            <label htmlFor="new-community-name" className="text-xs text-muted-foreground mb-1 block">Community name</label>
            <input id="new-community-name" type="text" value={name} onChange={e => setName(e.target.value.replace(/\s/g, ""))} placeholder="AbaTraders" maxLength={21}
              className="w-full bg-input-background border border-border rounded p-2.5 text-sm text-foreground outline-none focus:border-primary" />
            <p className="text-xs text-muted-foreground mt-1">3–21 characters: letters, numbers and underscores. You can found one new community per day.</p>
          </div>
          <div>
            <label htmlFor="new-community-description" className="text-xs text-muted-foreground mb-1 block">Description</label>
            <textarea id="new-community-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is your community about?" maxLength={300}
              className="bg-input-background border border-border rounded p-2.5 text-sm text-foreground h-20 resize-none outline-none focus:border-primary w-full" />
          </div>
          <button type="submit" disabled={submitting || (!!token && !validName)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded font-semibold text-sm bg-[#f5c542] text-black disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Coins size={15} />}
            {token ? "Create Community & Earn 50 Gold" : t("Sign in to earn gold")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const TITLE_EDIT_WINDOW_MS = 15 * 60 * 1000;

/** Edit your own post. Titles can change for 15 minutes; text and flair any time. */
export function EditPostModal({ post, onClose, onSaved }: { post: Post; onClose: () => void; onSaved: (p: Post) => void }) {
  const { t, token } = useApp();
  const titleEditable = !!post.createdAt && Date.now() - new Date(post.createdAt).getTime() < TITLE_EDIT_WINDOW_MS;
  const [title, setTitle] = useState(post.title);
  const [body, setBody] = useState(post.body ?? "");
  const [flair, setFlair] = useState(post.flair ?? "");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    try {
      const f = FLAIRS.find(x => x.name === flair);
      const updated = await api.editPost(token, String(post.id), {
        ...(titleEditable ? { title: title.trim() } : {}),
        body,
        flair: f?.name ?? null,
        flairColor: f?.color ?? null,
      });
      onSaved(updated);
      toast.success("Post updated");
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fieldCls = "bg-input-background border border-border rounded p-2.5 text-sm text-foreground outline-none focus:border-primary w-full";
  return (
    <Modal onClose={onClose} label="Edit post">
      <form onSubmit={save}>
        <div className="p-4 border-b border-border pr-14">
          <h2 className="text-lg font-bold">Edit post</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Edited posts show “edited” next to the time.</p>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <label htmlFor="edit-post-title" className="text-xs text-muted-foreground">{t("Title")}</label>
          <input id="edit-post-title" value={title} onChange={e => setTitle(e.target.value)} disabled={!titleEditable} maxLength={300} required
            className={`${fieldCls} disabled:opacity-60`} />
          {!titleEditable && <p className="text-xs text-muted-foreground -mt-2">Titles can only be changed in the first 15 minutes after posting.</p>}
          <label htmlFor="edit-post-body" className="text-xs text-muted-foreground">Text</label>
          <textarea id="edit-post-body" value={body} onChange={e => setBody(e.target.value)} maxLength={20000} className={`${fieldCls} h-40 resize-y`} />
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Flair")}>
            {[{ name: "", color: "#818590" }, ...FLAIRS].map(f => (
              <button key={f.name || "none"} type="button" role="radio" aria-checked={flair === f.name} onClick={() => setFlair(f.name)}
                className={`h-9 px-3 rounded-full text-xs font-semibold border transition-colors ${flair === f.name ? "border-transparent" : "border-border text-muted-foreground hover:bg-muted"}`}
                style={flair === f.name ? { backgroundColor: `${f.color}2a`, color: `color-mix(in srgb, ${f.color} 68%, var(--foreground))` } : undefined}>
                {f.name ? t(f.name) : t("No flair")}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-11 px-5 rounded text-sm font-semibold hover:bg-muted">{t("Cancel")}</button>
            <button type="submit" disabled={busy || !title.trim()} className="flex items-center gap-2 bg-primary text-primary-foreground font-semibold px-5 h-11 rounded text-sm disabled:opacity-50">
              {busy && <Loader2 size={13} className="animate-spin" />} Save changes
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
