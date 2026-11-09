import { useMemo, useState } from "react";
import { User, Loader2, Flag, MessageSquare, Pencil, Trash2, Ban } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "./context";
import { VoteWidget, UserFlair, BotBadge, Linkify, MoreMenu, ConfirmBar, AuthorLink, type MenuItem } from "./ui";
import * as api from "../api";
import type { Comment, Post } from "../types";
import { isSamplePost } from "../lib";

const MAX_DEPTH = 5;

function CommentForm({
  post, parentId, onPosted, onCancel, autoFocus,
}: {
  post: Post;
  parentId?: string | null;
  onPosted: (c: Comment) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { t, token, requireAuth } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const id = `comment-${post.id}-${parentId ?? "root"}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) { requireAuth(t("Sign in to comment")); return; }
    if (!text.trim()) return;
    setBusy(true);
    try {
      const c = await api.createComment(token, String(post.id), text.trim(), parentId);
      setText("");
      onPosted(c);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 flex-1 min-w-0">
      <label htmlFor={id} className="sr-only">{t("What are your thoughts?")}</label>
      <textarea
        id={id}
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => { if (!token) requireAuth(t("Sign in to comment")); }}
        placeholder={t("What are your thoughts?")}
        rows={parentId ? 2 : 3}
        maxLength={10000}
        className="w-full bg-input-background border border-border rounded p-2.5 text-sm outline-none focus:border-primary resize-y"
      />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 px-4 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted">
            {t("Cancel")}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || (!!token && !text.trim())}
          className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {token ? (parentId ? t("Reply") : t("Comment")) : t("Sign in to comment")}
        </button>
      </div>
    </form>
  );
}

function CommentNode({
  comment, childrenOf, post, depth, onPosted, onReport, onRemoved,
}: {
  comment: Comment;
  childrenOf: Map<string, Comment[]>;
  post: Post;
  depth: number;
  onPosted: (c: Comment) => void;
  onReport: (c: Comment) => void;
  onRemoved?: () => void;
}) {
  const { t, token, requireAuth, userId, openUser, hrefForUser, isBlocked, toggleBlock } = useApp();
  const [c, setC] = useState(comment);
  const [gone, setGone] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const replies = childrenOf.get(comment.id) ?? [];
  if (gone) return null;

  const mine = !!userId && c.authorId === userId && !c.deleted;
  const blocked = !!c.blocked || (!c.deleted && isBlocked(c.author));
  const items: MenuItem[] = [];
  if (mine) {
    items.push({ label: "Edit comment", icon: <Pencil size={14} />, onSelect: () => { setDraft(c.body); setEditing(true); } });
    items.push({ label: "Delete comment", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirming(true) });
  } else if (!c.deleted) {
    items.push({ label: blocked ? `Unblock ${c.author}` : `Block ${c.author}`, icon: <Ban size={14} />, onSelect: () => (token ? toggleBlock(c.author) : requireAuth("Sign in to block people")) });
    items.push({ label: t("Report"), icon: <Flag size={14} />, onSelect: () => onReport(c) });
  }

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !draft.trim()) return;
    setBusy(true);
    try { setC(await api.editComment(token, c.id, draft.trim())); setEditing(false); }
    catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const r = await api.deleteComment(token, c.id);
      if (r.placeholder) setC({ ...c, deleted: true, body: "", author: "[deleted]", authorId: undefined });
      else { setGone(true); onRemoved?.(); }
      toast.success("Comment deleted");
    } catch (err: any) { toast.error(err.message); }
    finally { setBusy(false); setConfirming(false); }
  };

  return (
    <li className="flex gap-2">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand thread" : "Collapse thread"}
        aria-expanded={!collapsed}
        className="w-3 shrink-0 flex justify-center group"
      >
        <span className="w-px h-full bg-border group-hover:bg-primary transition-colors" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground mb-1">
          <span className="font-semibold" id={`comment-${c.id}`}><AuthorLink name={c.author} href={hrefForUser(c.author)} onOpen={() => openUser(c.author)} /></span>
          {c.isBot ? <BotBadge /> : <UserFlair flair={c.authorFlair} />}
          <span>· {c.timeAgo}{c.editedAt ? " · edited" : ""}</span>
          {collapsed && replies.length > 0 && <span>· {replies.length} more</span>}
        </div>
        {!collapsed && (
          <>
            {c.deleted ? (
              <p className="text-sm italic text-muted-foreground mb-1">This comment was deleted.</p>
            ) : c.hidden ? (
              <p className="text-sm italic text-muted-foreground mb-1">{t("Hidden while moderators review reports.")}</p>
            ) : blocked && !reveal ? (
              <p className="text-sm italic text-muted-foreground mb-1">
                Comment from someone you blocked.{" "}
                {c.body && <button type="button" onClick={() => setReveal(true)} className="not-italic text-primary font-semibold hover:underline">Show</button>}
              </p>
            ) : editing ? (
              <form onSubmit={saveEdit} className="flex flex-col gap-2 mb-1">
                <label htmlFor={`edit-${c.id}`} className="sr-only">Edit your comment</label>
                <textarea id={`edit-${c.id}`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={10000} autoFocus
                  className="w-full bg-input-background border border-border rounded p-2.5 text-sm outline-none focus:border-primary resize-y" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditing(false)} className="h-9 px-4 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted">{t("Cancel")}</button>
                  <button type="submit" disabled={busy || !draft.trim()} className="h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" />} Save
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line break-words mb-1"><Linkify text={c.body} /></p>
            )}
            {confirming && (
              <div className="mb-1">
                <ConfirmBar text="Delete this comment?" confirmLabel="Delete" busy={busy} onConfirm={remove} onCancel={() => setConfirming(false)} />
              </div>
            )}
            <div className="flex items-center gap-1 -ml-2">
              <VoteWidget
                small
                initialVotes={comment.votes}
                onVote={(dir) => {
                  if (!token) { requireAuth(t("Sign in to vote")); return null; }
                  return api.voteComment(token, comment.id, dir);
                }}
              />
              {depth < MAX_DEPTH && (
                <button type="button" onClick={() => (token ? setReplying(!replying) : requireAuth(t("Sign in to comment")))} className="h-9 px-3 rounded-full text-xs font-semibold text-muted-foreground hover:bg-muted flex items-center gap-1">
                  <MessageSquare size={13} /> {t("Reply")}
                </button>
              )}
              <MoreMenu small items={items} label="More options for this comment" />
            </div>
            {replying && (
              <div className="mt-2 mb-3">
                <CommentForm post={post} parentId={comment.id} autoFocus onCancel={() => setReplying(false)} onPosted={(c) => { setReplying(false); onPosted(c); }} />
              </div>
            )}
            {replies.length > 0 && (
              <ul className="mt-2 flex flex-col gap-3">
                {replies.map(r => (
                  <CommentNode key={r.id} comment={r} childrenOf={childrenOf} post={post} depth={depth + 1} onPosted={onPosted} onReport={onReport} onRemoved={onRemoved} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export function CommentsSection({
  post, comments, loading, onPosted, onReport, onRemoved,
}: {
  post: Post;
  comments: Comment[];
  loading: boolean;
  onPosted: (c: Comment) => void;
  onReport: (c: Comment) => void;
  onRemoved?: () => void;
}) {
  const { t } = useApp();

  // Top-level by votes; replies oldest first so conversations read in order
  const { roots, childrenOf } = useMemo(() => {
    const map = new Map<string, Comment[]>();
    const top: Comment[] = [];
    for (const c of comments) {
      if (c.parentId && comments.some(x => x.id === c.parentId)) {
        map.set(c.parentId, [...(map.get(c.parentId) ?? []), c]);
      } else top.push(c);
    }
    top.sort((a, b) => b.votes - a.votes || a.createdAt.localeCompare(b.createdAt));
    return { roots: top, childrenOf: map };
  }, [comments]);

  if (isSamplePost(post)) {
    return <p className="text-sm text-muted-foreground">{t("Sample posts are shown until real posts arrive.")}</p>;
  }

  return (
    <section aria-label={t("Comments")} className="flex flex-col gap-5">
      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
          <User size={16} />
        </div>
        <CommentForm post={post} onPosted={onPosted} />
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">{t("Top Comments")} <span className="text-muted-foreground font-normal">({comments.length})</span></h3>
        {loading && comments.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> {t("Loading comments…")}</p>
        ) : roots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("No comments yet. Start the conversation.")}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {roots.map(c => (
              <CommentNode key={c.id} comment={c} childrenOf={childrenOf} post={post} depth={1} onPosted={onPosted} onReport={onReport} onRemoved={onRemoved} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
