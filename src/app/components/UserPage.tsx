import { useEffect, useState } from "react";
import { ArrowLeft, Ban, Loader2, User, MessageSquare } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useApp } from "./context";
import { BotBadge, UserFlair, Linkify } from "./ui";
import { TierBadge } from "./GoldSystem";
import { PostCard } from "./PostCard";
import type { OnVote } from "./ui";
import type { Post, UserProfile } from "../types";
import * as api from "../api";

// A person's public page: their posts and comments, with a Block button.
export function UserPage({
  username, initialProfile, onBack, voteFor, onAward, onReport, headingLevel = 1,
}: {
  username: string;
  initialProfile?: UserProfile | null;
  onBack: () => void;
  voteFor: (p: Post) => OnVote;
  onAward: (p: Post) => void;
  onReport: (p: Post) => void;
  headingLevel?: 1 | 2;
}) {
  const { token, isBlocked, toggleBlock, requireAuth, openPost, hrefForPost } = useApp();
  const [profile, setProfile] = useState<UserProfile | null>(initialProfile ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const Heading = headingLevel === 1 ? "h1" : "h2";

  useEffect(() => {
    let cancelled = false;
    setError(null);
    api.getUser(username, token)
      .then(p => { if (!cancelled) setProfile(p); })
      .catch(err => { if (!cancelled) { setError(err.message); if (!initialProfile) setProfile(null); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, token]);

  if (!profile) {
    return (
      <section className="bg-card border border-border rounded p-6 text-center text-sm text-muted-foreground">
        {error ? (
          <>
            <p className="mb-3">{error}</p>
            <button type="button" onClick={onBack} className="h-10 px-4 rounded-full border border-border text-sm font-semibold hover:bg-muted">Back to the feed</button>
          </>
        ) : <p className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading profile…</p>}
      </section>
    );
  }

  const blocked = isBlocked(profile.username) || profile.blockedByMe;
  const joined = profile.joinedAt ? new Date(profile.joinedAt).toLocaleDateString("en-NG", { month: "long", year: "numeric" }) : null;

  return (
    <>
      <motion.section initial={{ y: 8 }} animate={{ y: 0 }} className="bg-card border border-border rounded overflow-hidden">
        <div className="h-14 bg-gradient-to-r from-[#0b8a5a] to-primary" />
        <div className="p-4 -mt-8">
          <div className="flex items-end gap-3 mb-2">
            <span className="w-14 h-14 rounded-full border-4 border-card bg-muted flex items-center justify-center shrink-0" aria-hidden="true"><User size={26} className="text-muted-foreground" /></span>
            <div className="min-w-0 flex-1">
              <Heading className="text-lg font-bold truncate flex items-center gap-2">{profile.username} {profile.isBot && <BotBadge />}</Heading>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>
                  {[
                    joined && `Joined ${joined}`,
                    `${profile.postCount} ${profile.postCount === 1 ? "post" : "posts"}`,
                    `${profile.commentCount} ${profile.commentCount === 1 ? "comment" : "comments"}`,
                  ].filter(Boolean).join(" · ")}
                </span>
                <UserFlair flair={profile.flair} />
                {!profile.isBot && <TierBadge gold={profile.goldEarned} />}
              </p>
            </div>
          </div>
          {profile.isBot && <p className="text-sm text-muted-foreground mb-3">An automated account run by Threadit to keep communities active while they grow. It steps back as real members join.</p>}
          <div className="flex flex-wrap gap-2">
            {!profile.isMe && (
              <button type="button" aria-pressed={blocked}
                onClick={() => { if (!token) { requireAuth("Sign in to block people"); return; } toggleBlock(profile.username); setProfile({ ...profile, blockedByMe: !blocked }); }}
                className={`h-10 px-4 rounded-full text-sm font-semibold flex items-center gap-1.5 ${blocked ? "bg-destructive/10 text-destructive" : "border border-border hover:bg-muted"}`}>
                <Ban size={14} /> {blocked ? "Unblock" : "Block"}
              </button>
            )}
            <button type="button" onClick={onBack} className="h-10 px-4 rounded-full text-sm font-semibold text-muted-foreground hover:bg-muted flex items-center gap-1.5 ml-auto">
              <ArrowLeft size={14} /> Back to the feed
            </button>
          </div>
          {blocked && <p className="text-xs text-muted-foreground mt-2">You won't see their posts or comments in feeds, and their replies won't notify you. They aren't told.</p>}
        </div>
      </motion.section>

      <div role="tablist" className="bg-card border border-border rounded px-2 py-1.5 flex gap-1">
        {(["posts", "comments"] as const).map(k => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`px-4 h-10 rounded text-xs font-semibold ${tab === k ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {k === "posts" ? `Posts (${profile.postCount})` : `Comments (${profile.commentCount})`}
          </button>
        ))}
      </div>

      {tab === "posts" ? (
        profile.posts.length === 0 ? (
          <p className="bg-card border border-border rounded p-6 text-center text-sm text-muted-foreground">No posts yet.</p>
        ) : profile.posts.map(p => (
          <PostCard key={String(p.id)} post={p} onVote={voteFor(p)} onAward={onAward} onReport={onReport} />
        ))
      ) : profile.comments.length === 0 ? (
        <p className="bg-card border border-border rounded p-6 text-center text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profile.comments.map(c => {
            const post = { id: c.postId, community: c.postCommunity, title: c.postTitle, author: "", timeAgo: "", votes: 0, comments: 0 } as Post;
            return (
              <li key={c.id} className="bg-card border border-border rounded p-3">
                <a href={hrefForPost(post)} onClick={(e) => { e.preventDefault(); openPost(post); }} className="text-xs font-semibold text-muted-foreground hover:underline flex items-center gap-1.5">
                  <MessageSquare size={12} /> on “{c.postTitle}” · {c.timeAgo}
                </a>
                <p className="text-sm mt-1 whitespace-pre-line break-words line-clamp-4"><Linkify text={c.body} /></p>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p className="text-xs text-muted-foreground" role="status">Couldn't load the latest activity, so this may be out of date.</p>}
    </>
  );
}

export function useToastError() {
  return (err: unknown) => toast.error((err as Error)?.message ?? "Something went wrong.");
}
