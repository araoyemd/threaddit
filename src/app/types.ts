// Shared types for the app, the preview backend and the Next.js site.

export type VoteDir = "up" | "down";

export type AwardKind = "helpful" | "gold";

export interface Post {
  id: string | number;
  community: string;
  communityIcon?: string;
  author: string;
  authorId?: string;
  authorFlair?: string | null;
  /** Posted by one of Threadit's labeled bot accounts */
  isBot?: boolean;
  /** For bot news posts: where the story came from */
  source?: { outlet: string; url: string };
  timeAgo: string;
  createdAt?: string;
  title: string;
  body?: string;
  images?: string[];
  votes: number;
  comments: number;
  flair?: string | null;
  flairColor?: string | null;
  pinned?: boolean;
  /** Sample content shown only while the server has no real posts */
  sample?: boolean;
  /** Hidden from feeds after several reports, until a moderator reviews it */
  hidden?: boolean;
  awards?: Partial<Record<AwardKind, number>>;
  /** Present when the server knows the signed-in user's vote */
  userVote?: VoteDir | null;
  editedAt?: string;
  /** The viewer has blocked this author */
  blocked?: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  author: string;
  authorId?: string;
  authorFlair?: string | null;
  isBot?: boolean;
  body: string;
  createdAt: string;
  timeAgo: string;
  votes: number;
  hidden?: boolean;
  /** Deleted by its author but kept as a placeholder because it has replies */
  deleted?: boolean;
  /** The viewer has blocked this author */
  blocked?: boolean;
  editedAt?: string;
}

export interface UserProfile {
  username: string;
  isBot: boolean;
  flair: string | null;
  joinedAt: string | null;
  goldEarned: number;
  postCount: number;
  commentCount: number;
  blockedByMe: boolean;
  isMe: boolean;
  posts: Post[];
  comments: (Comment & { postTitle: string; postCommunity: string })[];
}

export type CommunityKind = "national" | "state" | "city" | "campus" | "interest" | "user";

export interface Community {
  /** URL-safe identifier, letters/numbers/underscores (e.g. "AkwaIbom") */
  name: string;
  /** Display name when it differs from `name` (e.g. "Akwa Ibom") */
  label?: string;
  icon: string;
  description: string;
  color: string;
  kind: CommunityKind;
  /** Real member count from the server, when known */
  members?: number;
}

export type NotificationType = "comment" | "reply" | "milestone" | "award" | "community";

export interface AppNotification {
  id: string;
  type: NotificationType;
  text: string;
  postId?: string;
  community?: string;
  createdAt: string;
  read: boolean;
}

export interface Gold {
  posts: number;
  votes: number;
  communities: number;
  /** Gold received from other people's awards */
  awards: number;
  /** Gold spent on awards and flair */
  spent: number;
}

export const EMPTY_GOLD: Gold = { posts: 0, votes: 0, communities: 0, awards: 0, spent: 0 };

export const goldBalance = (g: Gold) => g.posts + g.votes + g.communities + g.awards - g.spent;
export const goldEarned = (g: Gold) => g.posts + g.votes + g.communities + g.awards;

export type ReportReason = "scam" | "hate" | "misinformation" | "spam" | "harassment" | "other";

export interface ModItem {
  targetType: "post" | "comment";
  targetId: string;
  postId: string;
  community: string;
  title: string;
  excerpt: string;
  author: string;
  reports: { reason: ReportReason; count: number }[];
  hidden: boolean;
}

export interface BotRunReport {
  ranAt: string;
  paused: boolean;
  news: { posted: number; skipped: Record<string, number>; feeds: { outlet: string; ok: boolean; items: number; error?: string }[] };
  gist: { posted: number };
  welcome: { commented: number };
  /** Missing from runs recorded before AnswerBot existed */
  answer?: { answered: number; skipped: number; failed: number };
  helper: { commented: number };
  retiredCommunities: string[];
}

export interface BotStatus {
  paused: boolean;
  enabled: boolean;
  /** True when ANTHROPIC_API_KEY is set, so news posts get summaries */
  summaries: boolean;
  /** True when ANTHROPIC_API_KEY is set, so AnswerBot answers questions */
  answers?: boolean;
  /** False in the hosted preview, which can't reach news sites */
  canFetchNews?: boolean;
  history: BotRunReport[];
}

export interface PostDetail {
  post: Post;
  comments: Comment[];
}
