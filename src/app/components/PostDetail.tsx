import { useEffect, useState } from "react";
import { ArrowLeft, Share2, Gift, EyeOff, Pin, Ban } from "lucide-react";
import { useApp } from "./context";
import { VoteWidget, Carousel, FlairChip, UserFlair, CommunityAvatar, BotBadge, Linkify, MoreMenu, AuthorLink, type OnVote } from "./ui";
import { CommentsSection } from "./Comments";
import { AwardsRow, usePostMenu } from "./PostCard";
import { communityLabel } from "../data";
import { isSamplePost } from "../lib";
import * as api from "../api";
import type { Post, Comment } from "../types";

export function PostDetail({
  post: initialPost, initialComments, onClose, onVote, onAward, onReport, onPostChange,
}: {
  post: Post;
  initialComments?: Comment[];
  onClose: () => void;
  onVote: OnVote;
  onAward: (p: Post) => void;
  onReport: (target: { type: "post"; post: Post } | { type: "comment"; comment: Comment }) => void;
  onPostChange?: (p: Post) => void;
}) {
  const { t, token, sharePost, openCommunity, openUser, findCommunity, hrefForCommunity, hrefForUser, isBlocked } = useApp();
  const [post, setPost] = useState(initialPost);
  const [comments, setComments] = useState<Comment[]>(initialComments ?? []);
  const [loading, setLoading] = useState(!initialComments && !isSamplePost(initialPost));
  const community = findCommunity(post.community);
  const menu = usePostMenu(post, (p) => onReport({ type: "post", post: p }));
  const [revealBlocked, setRevealBlocked] = useState(false);
  const blockedAuthor = !!post.blocked || isBlocked(post.author);

  useEffect(() => { setPost(initialPost); }, [initialPost]);

  // Load the latest comments (and counts) from the server
  useEffect(() => {
    if (isSamplePost(initialPost)) return;
    let cancelled = false;
    setLoading(true);
    api.getPost(String(initialPost.id), token)
      .then(d => {
        if (cancelled) return;
        setPost(d.post);
        setComments(d.comments);
        onPostChange?.(d.post);
      })
      .catch(() => { /* keep what we have; the card stays usable offline */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPost.id, token]);

  const addComment = (c: Comment) => {
    setComments(prev => [...prev, c]);
    const next = { ...post, comments: post.comments + 1 };
    setPost(next);
    onPostChange?.(next);
  };

  const iconBtn = "w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors";

  return (
    // A thread is its own page in the main column, not a pop-up over the feed
    <div className="bg-card border border-border rounded flex flex-col">
        <div className="sticky top-14 bg-card border-b border-border flex items-center justify-between p-2 z-10 rounded-t">
          <button onClick={onClose} className="h-10 pl-2 pr-3 flex items-center gap-1.5 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft size={18} /> {t("Back to feed")}
          </button>
          <a
            href={hrefForCommunity(post.community)}
            onClick={(e) => { e.preventDefault(); openCommunity(post.community); }}
            className="font-semibold text-sm truncate px-2 flex items-center gap-2 hover:underline min-w-0"
          >
            <CommunityAvatar icon={community.icon} color={community.color} size={22} />
            {communityLabel(community)}
          </a>
          <button onClick={() => sharePost(post)} aria-label={t("Share post")} className={iconBtn}><Share2 size={18} /></button>
        </div>

        <article className="p-4 flex flex-col gap-4">
          <div>
            <div className="flex items-center gap-1.5 flex-wrap mb-2 text-xs text-muted-foreground">
              {post.pinned && <span className="flex items-center gap-1 font-semibold text-primary"><Pin size={12} /> {t("Pinned")}</span>}
              <span>{t("Posted by")} {post.sample ? <span className="font-medium text-foreground">{post.author}</span> : <AuthorLink name={post.author} href={hrefForUser(post.author)} onOpen={() => openUser(post.author)} />}</span>
              {post.isBot ? <BotBadge /> : <UserFlair flair={post.authorFlair} />}
              <span>· <time dateTime={post.createdAt}>{post.timeAgo}</time>{post.editedAt && <> · <span title={new Date(post.editedAt).toLocaleString("en-NG")}>edited</span></>}</span>
              {post.flair && <FlairChip flair={post.flair} color={post.flairColor} />}
              <AwardsRow awards={post.awards} />
            </div>
            {post.hidden && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2"><EyeOff size={13} /> {t("Hidden while moderators review reports.")}</p>
            )}
            {blockedAuthor && !revealBlocked && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground mb-2 flex-wrap">
                <Ban size={13} /> You blocked {post.author}.
                <button type="button" onClick={() => setRevealBlocked(true)} className="text-primary font-semibold hover:underline">Show post anyway</button>
              </p>
            )}
            <h1 id={`post-title-${post.id}`} className="text-xl font-bold mb-2 leading-snug" style={{ textWrap: "balance" } as any}>{post.title}</h1>
            {(!blockedAuthor || revealBlocked) && (
              <>
                {post.body && <p className="text-sm text-foreground/85 leading-relaxed mb-3 whitespace-pre-wrap break-words"><Linkify text={post.body} /></p>}
                {post.images && <Carousel images={post.images} title={post.title} />}
              </>
            )}
            {menu.confirmBar && <div className="mb-2">{menu.confirmBar}</div>}
            <div className="flex items-center gap-1 flex-wrap -ml-2">
              <VoteWidget initialVotes={post.votes} initialVote={post.userVote ?? null} onVote={onVote} />
              {!isSamplePost(post) && post.authorId && !post.isBot && (
                <button type="button" onClick={() => onAward(post)} className="h-10 px-3 rounded-full text-xs font-semibold text-muted-foreground hover:bg-muted flex items-center gap-1.5">
                  <Gift size={14} /> {t("Award")}
                </button>
              )}
              <MoreMenu items={menu.items} label="More options for this post" />
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <CommentsSection
              post={post}
              comments={comments}
              loading={loading}
              onPosted={addComment}
              onRemoved={() => { const next = { ...post, comments: Math.max(0, post.comments - 1) }; setPost(next); onPostChange?.(next); }}
              onReport={(comment) => onReport({ type: "comment", comment })}
            />
          </div>
        </article>
    </div>
  );
}
