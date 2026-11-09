import { useState } from "react";
import { MessageSquare, Share2, Bookmark, Pin, Gift, Flag, EyeOff, Pencil, Trash2, Ban } from "lucide-react";
import { useApp } from "./context";
import { VoteWidget, Carousel, FlairChip, UserFlair, BotBadge, Linkify, MoreMenu, ConfirmBar, AuthorLink, type OnVote, type MenuItem } from "./ui";
import { PostGoldIndicator } from "./GoldSystem";
import { AWARDS, communityLabel } from "../data";
import { formatNumber } from "../lib";
import type { Post, AwardKind } from "../types";

export function AwardsRow({ awards }: { awards?: Post["awards"] }) {
  const entries = Object.entries(awards ?? {}).filter(([, n]) => (n ?? 0) > 0) as [AwardKind, number][];
  if (!entries.length) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {entries.map(([k, n]) => (
        <span key={k} title={`${AWARDS[k].label} award${n > 1 ? ` ×${n}` : ""}`} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-muted-foreground">
          <span aria-hidden="true">{AWARDS[k].icon}</span>{n > 1 ? n : ""}
          <span className="sr-only">{AWARDS[k].label} award ×{n}</span>
        </span>
      ))}
    </span>
  );
}

/** The ⋯ menu for a post: edit and delete your own; block and report others */
export function usePostMenu(post: Post, onReport: (p: Post) => void) {
  const { t, userId, isSignedIn, editPost, deletePost, toggleBlock, isBlocked, requireAuth } = useApp();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = !!userId && post.authorId === userId;
  const items: MenuItem[] = [];
  if (!post.sample) {
    if (mine) {
      items.push({ label: "Edit post", icon: <Pencil size={14} />, onSelect: () => editPost(post) });
      items.push({ label: "Delete post", icon: <Trash2 size={14} />, danger: true, onSelect: () => setConfirming(true) });
    } else {
      if (post.author !== "[deleted]") {
        items.push({
          label: isBlocked(post.author) ? `Unblock ${post.author}` : `Block ${post.author}`, icon: <Ban size={14} />,
          onSelect: () => (isSignedIn ? toggleBlock(post.author) : requireAuth("Sign in to block people")),
        });
      }
      items.push({ label: t("Report"), icon: <Flag size={14} />, onSelect: () => onReport(post) });
    }
  }
  const confirmBar = confirming ? (
    <ConfirmBar
      text="Delete this post? This can't be undone."
      confirmLabel="Delete"
      busy={busy}
      onCancel={() => setConfirming(false)}
      onConfirm={async () => { setBusy(true); try { await deletePost(post); } finally { setBusy(false); setConfirming(false); } }}
    />
  ) : null;
  return { items, confirmBar };
}

export function PostCard({
  post, onVote, onAward, onReport,
}: {
  post: Post;
  onVote: OnVote;
  onAward: (p: Post) => void;
  onReport: (p: Post) => void;
}) {
  const { t, openPost, openCommunity, openUser, sharePost, findCommunity, hrefForPost, hrefForCommunity, hrefForUser } = useApp();
  const menu = usePostMenu(post, onReport);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const community = findCommunity(post.community);

  const action = "flex items-center gap-1.5 px-3 h-10 rounded text-xs font-semibold transition-colors shrink-0";

  return (
    <article
      onClick={() => openPost(post)}
      className={`bg-card border rounded hover:border-primary/30 transition-colors group cursor-pointer flex gap-0 ${post.pinned ? "border-primary/40" : "border-border"}`}
    >
      <div className="flex flex-col items-center pt-2 bg-muted/20 border-r border-border w-12 shrink-0">
        <VoteWidget initialVotes={post.votes} initialVote={post.userVote ?? null} vertical onVote={onVote} />
      </div>

      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1.5 text-xs">
          {post.pinned && (
            <span className="flex items-center gap-1 font-semibold text-primary">
              <Pin size={12} /> {t("Pinned")}
            </span>
          )}
          <a
            href={hrefForCommunity(post.community)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openCommunity(post.community); }}
            className="font-semibold hover:underline"
          >
            {communityLabel(community)}
          </a>
          <span className="text-muted-foreground" aria-hidden="true">•</span>
          <span className="text-muted-foreground inline-flex items-center gap-1">
            {t("Posted by")} {post.sample ? <span className="font-medium">{post.author}</span> : <AuthorLink name={post.author} href={hrefForUser(post.author)} onOpen={() => openUser(post.author)} />} {post.isBot ? <BotBadge /> : <UserFlair flair={post.authorFlair} />}
          </span>
          <span className="text-muted-foreground">{post.timeAgo}{post.editedAt ? " · edited" : ""}</span>
          {post.flair && <FlairChip flair={post.flair} color={post.flairColor} />}
          {post.sample && (
            <span className="px-1.5 py-px rounded border border-dashed border-border text-[10px] font-semibold text-muted-foreground">
              {t("Sample post")}
            </span>
          )}
          <PostGoldIndicator votes={post.votes} />
          <AwardsRow awards={post.awards} />
        </div>

        {post.hidden && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
            <EyeOff size={13} /> {t("Hidden while moderators review reports.")}
          </p>
        )}

        <h2 className="text-base font-semibold leading-snug mb-2 group-hover:text-primary transition-colors">
          <a
            href={hrefForPost(post)}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); openPost(post); }}
            className="focus-visible:underline"
          >
            {post.title}
          </a>
        </h2>

        {post.body && (
          <div className="mb-2">
            <p className={`text-sm text-foreground/80 leading-relaxed whitespace-pre-line break-words ${expanded ? "" : "line-clamp-2"}`}><Linkify text={post.body} /></p>
            {post.body.length > 140 && (
              <button type="button" className="text-xs text-primary mt-1 hover:underline" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                {expanded ? t("Show less") : t("Read more")}
              </button>
            )}
          </div>
        )}

        {post.images && <Carousel images={post.images} title={post.title} />}

        {menu.confirmBar && <div className="mt-1 mb-1">{menu.confirmBar}</div>}
        <div className="flex items-center mt-1 -ml-2">
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-nowrap flex-1 min-w-0">
          <button type="button" onClick={(e) => { e.stopPropagation(); openPost(post); }} className={`${action} text-muted-foreground hover:bg-muted`}>
            <MessageSquare size={14} /> <span>{formatNumber(post.comments)} {t("Comments")}</span>
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); sharePost(post); }} className={`${action} text-muted-foreground hover:bg-muted`}>
            <Share2 size={14} /> <span>{t("Share")}</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSaved(!saved); }}
            aria-pressed={saved}
            className={`${action} ${saved ? "text-primary" : "text-muted-foreground hover:bg-muted"}`}
          >
            <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
            <span>{saved ? t("Saved") : t("Save")}</span>
          </button>
          {!post.sample && post.authorId && !post.isBot && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onAward(post); }} className={`${action} text-muted-foreground hover:bg-muted`}>
              <Gift size={14} /> <span>{t("Award")}</span>
            </button>
          )}
        </div>
        <MoreMenu items={menu.items} label="More options for this post" />
        </div>
      </div>
    </article>
  );
}
