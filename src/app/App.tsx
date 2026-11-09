import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { AuthModal, NewPasswordModal } from "./components/AuthModal";
import { GoldBadge, GoldCoin } from "./components/GoldSystem";
import { AppProvider, type AppCtx } from "./components/context";
import { CommunityAvatar, type OnVote } from "./components/ui";
import { PostCard } from "./components/PostCard";
import { PostDetail } from "./components/PostDetail";
import { ShareSheet, ReportDialog, AwardDialog, ModQueueDialog } from "./components/Dialogs";
import { CreatePostModal, CreateCommunityModal, EditPostModal } from "./components/Create";
import { UserPage } from "./components/UserPage";
import { ProfileModal, NotificationsPanel } from "./components/Profile";
import { CommunityHeader, CommunitySidebar, CommunityBrowser } from "./components/Communities";
import {
  Search, Bell, ChevronDown, Flame, TrendingUp, Sparkles, Award, Plus, Hash, X, Moon, Sun, Globe,
  Home, User, Coins, Loader2, ShieldAlert, Gauge, Users, Video,
} from "lucide-react";
import { motion } from "motion/react";
import { toast, Toaster } from "sonner";
import { supabase } from "../../utils/supabase/client";
import * as api from "./api";
import {
  BUILTIN_COMMUNITIES, SAMPLE_POSTS, LOCAL_TRENDS, SCAM_ALERT, communityLabel, communityPath, postPath,
  userPath,
} from "./data";
import { makeT, LANGUAGES, type Lang } from "./i18n";
import { sortPosts, loadPref, savePref, isSamplePost, shareUrlFor, prefersDataSaver, type Routing } from "./lib";
import {
  EMPTY_GOLD, goldBalance, type UserProfile, type Post, type Comment, type Community, type Gold, type AppNotification, type PostDetail as PostDetailData,
} from "./types";

const CommunityHeatmap = lazy(() => import("./components/CommunityHeatmap"));
const VideoReels = lazy(() => import("./components/VideoReels"));

type FeedName = "Home" | "Popular" | "All";

const BOT_AUTHOR = "ThreaditBot";
/** Sample posts are shown until there are at least this many real ones */
const MIN_REAL_POSTS = 3;

const SORT_OPTIONS = [
  { label: "Hot", icon: Flame },
  { label: "Top", icon: TrendingUp },
  { label: "New", icon: Sparkles },
  { label: "Rising", icon: Award },
];

/** Usernames show without a prefix; older records may still start with "u/" */
const bare = (name: string) => name.replace(/^u\//i, "");

const GOLD_RULES = [
  { action: "Publish a post", reward: 10 },
  { action: "Each upvote you receive", reward: 1 },
  { action: "Awards you receive", reward: "10–50" },
  { action: "Found a community", reward: 50 },
];

const POSTING_RULES = [
  "No scams, fake jobs or requests for upfront payment.",
  "No attacks on any tribe, religion or region.",
  "Don't share anyone's phone number, address or photos without consent.",
  "Label rumours as unconfirmed, and link your source for news.",
  "Use the Scam Alert flair to warn others.",
];

export interface AppProps {
  /** Posts rendered on the server (Next.js). Omit in the Make app. */
  initialPosts?: Post[] | null;
  /** A post page rendered on the server, with its comments */
  initialPost?: PostDetailData | null;
  /** A community page rendered on the server */
  initialCommunity?: string | null;
  /** "paths" gives every post and community its own URL (Next.js site) */
  routing?: Routing;
  initialLang?: Lang;
  /** A profile page rendered on the server (/u/name) */
  initialUser?: string | null;
  initialProfile?: UserProfile | null;
  /** A search page rendered on the server (/search?q=) */
  initialSearch?: string;
}

export default function App({
  initialPosts = null, initialPost = null, initialCommunity = null, routing = "query", initialLang = "en",
  initialUser = null, initialProfile = null, initialSearch = "",
}: AppProps = {}) {
  // ── Preferences (loaded after mount so server and first client render match)
  const [lang, setLang] = useState<Lang>(initialLang);
  const [isDark, setIsDark] = useState(true);
  const [dataSaver, setDataSaver] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    setIsDark(loadPref("threadit:dark", true));
    setLang(prev => (initialLang !== "en" ? initialLang : loadPref<Lang>("threadit:lang", loadPref("threadit:pidgin", false) ? "pcm" : prev)));
    setDataSaver(loadPref("threadit:datasaver", prefersDataSaver()));
    setJoined(loadPref<string[]>("threadit:joined", []).map(n => n.replace(/^r\//i, "")));
    setPrefsLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (prefsLoaded) savePref("threadit:dark", isDark); }, [isDark, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) savePref("threadit:lang", lang); }, [lang, prefsLoaded]);
  useEffect(() => { if (prefsLoaded) savePref("threadit:datasaver", dataSaver); }, [dataSaver, prefsLoaded]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.lang = LANGUAGES.find(l => l.code === lang)?.htmlLang ?? "en-NG";
  }, [isDark, lang]);
  const t = useMemo(() => makeT(lang), [lang]);

  // ── Feed state
  const [sort, setSort] = useState("Hot");
  const [search, setSearch] = useState(initialSearch);
  const [searchResults, setSearchResults] = useState<Post[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [viewedUser, setViewedUser] = useState<string | null>(initialUser);
  const [blocks, setBlocks] = useState<{ id: string; username: string }[]>([]);
  const [editTarget, setEditTarget] = useState<Post | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [feed, setFeed] = useState<FeedName>("All");
  const [scamOnly, setScamOnly] = useState(false);
  const [activeCommunity, setActiveCommunity] = useState<string | null>(initialCommunity);
  const [joined, setJoined] = useState<string[]>([]);
  useEffect(() => { if (prefsLoaded) savePref("threadit:joined", joined); }, [joined, prefsLoaded]);
  const [serverCommunities, setServerCommunities] = useState<Community[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [stateStats, setStateStats] = useState<Record<string, number>>({});
  const [showReels, setShowReels] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Modals
  const [activePost, setActivePost] = useState<Post | null>(initialPost?.post ?? null);
  const [activeComments, setActiveComments] = useState<Comment[] | undefined>(initialPost?.comments);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [modQueueFor, setModQueueFor] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<Post | null>(null);
  const [awardTarget, setAwardTarget] = useState<Post | null>(null);
  const [reportTarget, setReportTarget] = useState<{ type: "post" | "comment"; id: string; preview: string } | null>(null);

  // ── Auth
  const [authUser, setAuthUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const username = authUser ? bare(authUser.user_metadata?.username ?? authUser.email?.split("@")[0] ?? "") : null;

  // ── Server data
  const [serverPosts, setServerPosts] = useState<Post[] | null>(initialPosts && initialPosts.length ? initialPosts : null);
  const [postsLoading, setPostsLoading] = useState(!initialPosts);
  const [gold, setGold] = useState<Gold>(EMPTY_GOLD);
  const [moderates, setModerates] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const loadPosts = useCallback(async (token: string | null) => {
    try {
      setPostsLoading(true);
      const posts = await api.getPosts(token);
      setServerPosts(posts.length > 0 ? posts.map(p => ({ ...p, community: p.community.replace(/^r\//i, "") })) : null);
    } catch (e) {
      console.log("Load posts error:", e);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const loadGold = useCallback(async (token: string) => {
    try { setGold({ ...EMPTY_GOLD, ...(await api.getGold(token)) }); } catch (e) { console.log("Load gold error:", e); }
  }, []);

  const loadNotifications = useCallback(async (token: string) => {
    try { setNotifications(await api.getNotifications(token)); } catch { /* offline: keep the last list */ }
  }, []);

  // Session bootstrap + listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: any) => {
      if (session) {
        setAuthUser(session.user);
        setAccessToken(session.access_token);
      } else {
        loadPosts(null);
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
      setAuthUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      // Opened a password-reset link: ask for the new password
      if (event === "PASSWORD_RECOVERY") { setIsAuthOpen(false); setRecoveryOpen(true); }
    });
    api.getCommunities().then(list => setServerCommunities(list.map(c => ({ ...c, name: c.name.replace(/^r\//i, ""), kind: c.kind ?? "user" })))).catch(() => {});
    api.getCommunityCounts().then(setMemberCounts).catch(() => {});
    api.getCommunityStats().then(setStateStats).catch(() => {});
    return () => subscription.unsubscribe();
  }, [loadPosts]);

  // Everything that depends on who is signed in
  useEffect(() => {
    if (!accessToken) { setGold(EMPTY_GOLD); setModerates([]); setNotifications([]); setBlocks([]); return; }
    api.getBlocks(accessToken).then(setBlocks).catch(() => {});
    loadPosts(accessToken);
    loadGold(accessToken);
    loadNotifications(accessToken);
    api.getModerates(accessToken).then(setModerates).catch(() => {});
    // Merge communities joined while signed out into the account
    api.getMemberships(accessToken).then(async (server) => {
      const local = loadPref<string[]>("threadit:joined", []);
      const missing = local.filter(n => !server.some(s => s.toLowerCase() === n.toLowerCase()));
      for (const n of missing) await api.setJoined(accessToken, n, true).catch(() => {});
      setJoined([...server, ...missing]);
    }).catch(() => {});
    const timer = setInterval(() => loadNotifications(accessToken), 60_000);
    return () => clearInterval(timer);
  }, [accessToken, loadPosts, loadGold, loadNotifications]);

  const requireAuth = useCallback((message?: string) => {
    if (message) toast(message);
    setIsAuthOpen(true);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setAuthUser(null);
    setAccessToken(null);
    setIsProfileOpen(false);
    toast.success("Signed out", { duration: 2000 });
  };

  // ── Communities
  const allCommunities: Community[] = useMemo(() => {
    const list = [
      ...BUILTIN_COMMUNITIES,
      ...serverCommunities.filter(s => !BUILTIN_COMMUNITIES.some(c => c.name.toLowerCase() === s.name.toLowerCase())),
    ];
    const counts = Object.fromEntries(Object.entries(memberCounts).map(([k, v]) => [k.toLowerCase(), v]));
    return list.map(c => ({ ...c, members: counts[c.name.toLowerCase()] ?? c.members }));
  }, [serverCommunities, memberCounts]);

  const findCommunity = useCallback((name: string): Community =>
    allCommunities.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? {
      name, icon: name.slice(0, 2).toUpperCase(), description: "A Threadit community.", color: "#2bb3a3", kind: "user",
    }, [allCommunities]);

  const currentCommunity = activeCommunity ? findCommunity(activeCommunity) : null;
  const isJoined = useCallback((name: string) => joined.some(j => j.toLowerCase() === name.toLowerCase()), [joined]);
  const canModerate = (name: string) => moderates.includes("*") || moderates.some(m => m.toLowerCase() === name.toLowerCase());

  const toggleJoin = (name: string) => {
    const was = isJoined(name);
    setJoined(prev => was ? prev.filter(j => j.toLowerCase() !== name.toLowerCase()) : [...prev, findCommunity(name).name]);
    setMemberCounts(prev => {
      const key = Object.keys(prev).find(k => k.toLowerCase() === name.toLowerCase()) ?? findCommunity(name).name;
      return { ...prev, [key]: Math.max(0, (prev[key] ?? 0) + (was ? -1 : 1)) };
    });
    toast.success(was ? `Left ${communityLabel(findCommunity(name))}` : `Joined ${communityLabel(findCommunity(name))}`,
      { description: !was && accessToken ? "You'll be notified about new posts here." : undefined });
    if (accessToken) api.setJoined(accessToken, findCommunity(name).name, !was).catch(() => toast.error("Couldn't save that change. Try again."));
  };

  // ── Blocking
  const isBlocked = useCallback((username: string) =>
    blocks.some(b => bare(b.username).toLowerCase() === bare(username).toLowerCase()), [blocks]);
  const toggleBlock = useCallback(async (username: string) => {
    if (!accessToken) { requireAuth("Sign in to block people"); return; }
    const was = blocks.some(b => bare(b.username).toLowerCase() === bare(username).toLowerCase());
    try {
      setBlocks(await api.setBlocked(accessToken, username, !was));
      toast.success(was ? `Unblocked ${username}` : `Blocked ${username}`, {
        description: was ? undefined : "You won't see their posts or comments, and they can't notify you. They aren't told.",
      });
      if (was) loadPosts(accessToken); // bring their posts back into the feed
    } catch (err: any) {
      toast.error(err.message);
    }
  }, [accessToken, blocks, requireAuth, loadPosts]);

  // ── Search (server-side, so it covers every post, not just the ones loaded)
  useEffect(() => {
    const query = search.trim();
    if (query.replace(/^#/, "").length < 2) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      api.search(query, accessToken, activeCommunity ?? undefined)
        .then(r => setSearchResults(r.map(p => ({ ...p, community: p.community.replace(/^r\//i, "") }))))
        .catch(() => setSearchResults(null)) // offline: fall back to filtering what's loaded
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [search, accessToken, activeCommunity]);

  // ── Feed
  // Until people have written a few posts, keep the samples alongside the
  // weekly bot threads so a new site doesn't look empty.
  const realPostCount = (serverPosts ?? []).filter(p => !p.isBot && p.author !== BOT_AUTHOR).length;
  const showingSamples = realPostCount < MIN_REAL_POSTS;
  const activePosts: Post[] = showingSamples
    ? [...(serverPosts ?? []), ...SAMPLE_POSTS.filter(sp => !(serverPosts ?? []).some(p => String(p.id) === String(sp.id)))]
    : serverPosts!;
  const q = search.trim().toLowerCase().replace(/^#/, "");
  const terms = q.split(/\s+/).filter(Boolean);
  const matches = (p: Post) => terms.every(t => p.title.toLowerCase().includes(t) || p.community.toLowerCase().includes(t) || (p.body ?? "").toLowerCase().includes(t));
  // While searching, use the server's results plus any matching sample posts
  const pool = q && searchResults
    ? [...searchResults, ...activePosts.filter(p => isSamplePost(p) && !searchResults.some(r => String(r.id) === String(p.id)))]
    : activePosts;
  const displayedPosts = sortPosts(
    pool
      .filter(p => !isBlocked(p.author))
      .filter(p => activeCommunity
        ? p.community.toLowerCase() === activeCommunity.toLowerCase()
        : q || feed !== "Home" ? true : isJoined(p.community))
      .filter(p => !scamOnly || p.flair === SCAM_ALERT)
      .filter(p => q === "" || matches(p)),
    sort,
  );

  const updatePost = (next: Post) => {
    setServerPosts(prev => prev ? prev.map(p => String(p.id) === String(next.id) ? { ...p, ...next } : p) : prev);
    setActivePost(prev => prev && String(prev.id) === String(next.id) ? { ...prev, ...next } : prev);
  };

  // ── Navigation (paths on the Next.js site, ?post= elsewhere)
  const scrollTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const push = (url: string, state: Record<string, unknown> = {}) => { try { window.history.pushState(state, "", url); } catch { /* sandboxed */ } };
  const replace = (url: string, state: Record<string, unknown> = {}) => { try { window.history.replaceState(state, "", url); } catch { /* sandboxed */ } };

  const hrefForPost = useCallback((p: Post) => routing === "paths" ? postPath(p) : `?post=${encodeURIComponent(String(p.id))}`, [routing]);
  const hrefForCommunity = useCallback((name: string) => routing === "paths" ? communityPath(name) : `?c=${encodeURIComponent(name)}`, [routing]);
  const hrefForUser = useCallback((name: string) => routing === "paths" ? userPath(name) : `?u=${encodeURIComponent(bare(name))}`, [routing]);

  const openUser = useCallback((name: string) => {
    if (!name || name === "[deleted]") return;
    feedScroll.current = null;
    setViewedUser(bare(name));
    setActiveCommunity(null);
    setActivePost(null);
    setSearch("");
    push(routing === "paths" ? userPath(name) : `?u=${encodeURIComponent(bare(name))}`, { user: bare(name) });
    scrollTop();
  }, [routing]);

  const openCommunity = useCallback((name: string) => {
    feedScroll.current = null;
    setActiveCommunity(findCommunity(name).name);
    setViewedUser(null);
    setSearch("");
    setActivePost(null);
    if (routing === "paths") push(communityPath(name), { community: name });
    scrollTop();
  }, [findCommunity, routing]);

  const openFeed = (f: FeedName) => {
    feedScroll.current = null;
    setActivePost(null);
    setActiveCommunity(null);
    setViewedUser(null);
    setFeed(f === "Popular" ? "All" : f);
    if (f === "Popular") setSort("Top");
    if (routing === "paths") push("/", {});
    scrollTop();
  };

  // Remember where the reader was in the feed, so Back returns them there
  const feedScroll = useRef<number | null>(null);
  useEffect(() => {
    if (activePost) return;
    if (feedScroll.current !== null) {
      const y = feedScroll.current;
      feedScroll.current = null;
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    }
  }, [activePost]);

  const openPost = useCallback((post: Post) => {
    if (!activePost) feedScroll.current = window.scrollY;
    setActiveComments(undefined);
    setActivePost(post);
    window.scrollTo({ top: 0 });
    if (routing === "paths") push(postPath(post), { post: String(post.id) });
    else push(shareUrlFor(post, "query"), { post: String(post.id) });
  }, [routing, activePost]);

  const closePost = useCallback(() => {
    if (window.history.state?.post) { window.history.back(); return; }
    const post = activePost;
    setActivePost(null);
    if (routing === "paths") {
      const url = activeCommunity ? communityPath(activeCommunity) : post ? communityPath(post.community) : "/";
      if (!activeCommunity && post) setActiveCommunity(findCommunity(post.community).name);
      replace(url, {});
    } else {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("post");
        replace(url.toString(), {});
      } catch { /* sandboxed */ }
    }
  }, [activePost, activeCommunity, routing, findCommunity]);

  const postsRef = useRef(activePosts);
  postsRef.current = activePosts;

  // Back/forward buttons
  useEffect(() => {
    const sync = () => {
      const u = routing === "paths"
        ? window.location.pathname.match(/^\/u\/([^/]+)/)?.[1]
        : new URLSearchParams(window.location.search).get("u");
      setViewedUser(u ? bare(decodeURIComponent(u)) : null);
      if (routing === "paths") {
        const m = window.location.pathname.match(/^\/c\/([^/]+)(?:\/([^/]+))?/);
        const comm = m ? decodeURIComponent(m[1]) : null;
        const id = m?.[2] ? decodeURIComponent(m[2]) : null;
        setActiveCommunity(comm ? findCommunity(comm).name : null);
        setActivePost(id ? postsRef.current.find(p => String(p.id) === id) ?? null : null);
      } else {
        const id = new URLSearchParams(window.location.search).get("post");
        setActivePost(id ? postsRef.current.find(p => String(p.id) === id) ?? null : null);
      }
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [routing, findCommunity]);

  // Open ?post= / ?c= links once (Make app and preview)
  const openedFromLink = useRef(false);
  useEffect(() => {
    if (routing === "paths" || openedFromLink.current || postsLoading) return;
    const params = new URLSearchParams(window.location.search);
    const c = params.get("c");
    if (c) setActiveCommunity(findCommunity(c).name);
    const u = params.get("u");
    if (u) setViewedUser(bare(u));
    const id = params.get("post");
    openedFromLink.current = true;
    if (!id) return;
    const found = activePosts.find(p => String(p.id) === id);
    if (found) setActivePost(found);
    else api.getPost(id, accessToken).then(d => { setActivePost(d.post); setActiveComments(d.comments); }).catch(() => {});
  }, [activePosts, postsLoading, routing, findCommunity, accessToken]);

  // ── Actions
  const sharePost = useCallback(async (post: Post) => {
    const url = shareUrlFor(post, routing);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: post.title, text: `${post.title} — on Threadit`, url });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    setShareTarget(post);
  }, [routing]);

  const voteFor = useCallback((post: Post): OnVote => (dir) => {
    if (!accessToken) { requireAuth(t("Sign in to vote")); return null; }
    if (isSamplePost(post)) return undefined;
    return api.votePost(accessToken, String(post.id), dir).then(r => {
      setServerPosts(prev => prev ? prev.map(p => String(p.id) === String(post.id) ? { ...p, votes: r.votes, userVote: r.userVote } : p) : prev);
      return r;
    });
  }, [accessToken, requireAuth, t]);

  const openAward = (p: Post) => { if (!accessToken) { requireAuth(t("Sign in to earn gold")); return; } setAwardTarget(p); };
  const openReport = (target: { type: "post"; post: Post } | { type: "comment"; comment: Comment }) => {
    if (!accessToken) { requireAuth(); return; }
    if (target.type === "post") setReportTarget({ type: "post", id: String(target.post.id), preview: target.post.title });
    else setReportTarget({ type: "comment", id: target.comment.id, preview: target.comment.body });
  };

  const openNotification = async (n: AppNotification) => {
    setIsNotifOpen(false);
    if (accessToken && !n.read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      api.markNotificationsRead(accessToken, [n.id]).catch(() => {});
    }
    if (n.type === "award" || n.type === "milestone") loadGold(accessToken!);
    if (!n.postId) { if (n.community) openCommunity(n.community); return; }
    const known = activePosts.find(p => String(p.id) === n.postId);
    if (known) { openPost(known); return; }
    try {
      const d = await api.getPost(n.postId, accessToken);
      openPost(d.post);
      setActiveComments(d.comments);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const markAllRead = () => {
    if (!accessToken) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    api.markNotificationsRead(accessToken).catch(() => {});
  };

  const unread = notifications.filter(n => !n.read).length;
  const balance = goldBalance(gold);

  const ctx: AppCtx = {
    t, lang, token: accessToken, username, isSignedIn: !!accessToken, requireAuth, dataSaver,
    gold, refreshGold: () => { if (accessToken) loadGold(accessToken); }, moderates,
    openPost, openCommunity, sharePost, findCommunity, hrefForPost, hrefForCommunity,
    hrefForUser, openUser, userId: authUser?.id ?? null, isBlocked, toggleBlock,
    editPost: (p) => setEditTarget(p),
    deletePost: async (p) => {
      if (!accessToken) return;
      try {
        await api.deletePost(accessToken, String(p.id));
        setServerPosts(prev => prev ? prev.filter(x => String(x.id) !== String(p.id)) : prev);
        setSearchResults(prev => prev ? prev.filter(x => String(x.id) !== String(p.id)) : prev);
        if (activePost && String(activePost.id) === String(p.id)) setActivePost(null);
        toast.success("Post deleted");
      } catch (err: any) {
        toast.error(err.message);
      }
    },
  };

  const iconBtn = "w-10 h-10 flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors relative";

  return (
    <AppProvider value={ctx}>
      <div className={`min-h-screen bg-background text-foreground transition-colors duration-200 ${isDark ? "dark" : ""}`} style={{ fontFamily: "'Geist', 'Barlow', system-ui, sans-serif" }}>
        <Toaster position="bottom-center" offset={{ bottom: 24 }} mobileOffset={{ bottom: 116 }} theme={isDark ? "dark" : "light"} />

        {/* ─── Navbar ─────────────────────────────────────────────────────── */}
        <header className="fixed top-0 left-0 right-0 z-40 h-14 bg-card border-b border-border flex items-center px-3 sm:px-4 gap-2 sm:gap-3 shadow-sm">
          <a href="/" onClick={(e) => { e.preventDefault(); openFeed("All"); setSearch(""); }} className="flex items-center gap-2 shrink-0" aria-label="Threadit home">
            <span className="w-8 h-8 bg-primary rounded flex items-center justify-center text-white"><Hash size={18} strokeWidth={2.5} /></span>
            <span className="text-lg font-bold tracking-tight hidden sm:block">THREADIT</span>
          </a>

          <div className="hidden md:flex items-center relative border border-border rounded hover:bg-muted transition-colors min-w-40">
            <select
              aria-label={t("Choose feed or community")}
              value={activeCommunity ?? `feed:${feed}`}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("feed:")) openFeed(v.slice(5) as FeedName); else openCommunity(v);
              }}
              className="appearance-none bg-transparent text-xs text-foreground pl-3 pr-7 h-9 outline-none cursor-pointer w-full"
            >
              <optgroup label={t("Feeds")}>
                {(["Home", "All"] as FeedName[]).map(f => <option key={f} value={`feed:${f}`}>{t(f)}</option>)}
              </optgroup>
              <optgroup label={t("Communities")}>
                {allCommunities.map(c => <option key={c.name} value={c.name}>{communityLabel(c)}</option>)}
              </optgroup>
            </select>
            <ChevronDown size={13} className="absolute right-2 pointer-events-none text-muted-foreground" />
          </div>

          <div className="flex-1 max-w-xl relative flex items-center gap-2 rounded px-3 h-10 border border-border bg-input-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all min-w-0">
            <Search size={16} className="text-muted-foreground shrink-0" />
            <input ref={searchRef} type="search" aria-label={t("Search Threadit")} placeholder={`${t("Search Threadit")}...`}
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            {search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={14} className="text-muted-foreground hover:text-foreground" /></button>}
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1.5 ml-auto shrink-0">
            <button onClick={() => setLang(lang === "pcm" ? "en" : "pcm")} aria-pressed={lang === "pcm"}
              aria-label={lang === "pcm" ? t("Switch to English") : t("Switch to Pidgin")}
              className={`h-10 px-2 rounded flex items-center gap-1 transition-colors ${lang === "pcm" ? "text-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"}`}>
              <Globe size={16} /> <span className="text-xs font-semibold">{LANGUAGES.find(l => l.code === lang)?.short}</span>
            </button>
            <button onClick={() => { setDataSaver(!dataSaver); toast(dataSaver ? "Data saver off" : t("Data saver is on: images and reels load only when you tap them.")); }}
              aria-pressed={dataSaver} aria-label={t("Data saver")} title={t("Data saver")}
              className={`${iconBtn} ${dataSaver ? "!text-primary bg-primary/10" : ""}`}>
              <Gauge size={18} />
            </button>
            <button onClick={() => setIsDark(!isDark)} aria-label={isDark ? t("Switch to light mode") : t("Switch to dark mode")} className={`${iconBtn} hidden sm:flex`}>
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <button onClick={() => authUser ? setIsProfileOpen(true) : setIsAuthOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 h-9 rounded-full border border-yellow-500/30 transition-colors hover:bg-yellow-500/10"
              aria-label={authUser ? `${t("Your Gold")}: ${balance}` : t("Sign in to earn gold")}>
              <GoldCoin size={13} />
              <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-[#f5c542]">{authUser ? balance.toLocaleString() : t("Earn gold")}</span>
            </button>

            <button onClick={() => setIsCreatingPost(true)} className="hidden sm:flex items-center gap-1.5 px-3 h-9 border border-border rounded text-sm hover:bg-muted transition-colors">
              <Plus size={14} /> {t("Create")}
            </button>

            <button onClick={() => authUser ? setIsNotifOpen(true) : requireAuth()} aria-label={`${t("Notifications")}${unread ? ` (${unread} unread)` : ""}`} className={`${iconBtn} hidden sm:flex`}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
            </button>

            {authUser ? (
              <button onClick={() => setIsProfileOpen(true)} className="hidden sm:flex items-center gap-1.5 h-9 pl-1 pr-2 rounded-full hover:bg-muted" aria-label={t("Profile")}>
                <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center"><User size={15} /></span>
                <span className="text-xs font-semibold text-muted-foreground max-w-[90px] truncate">{username}</span>
              </button>
            ) : (
              <button onClick={() => setIsAuthOpen(true)} className="hidden sm:flex items-center gap-2 px-3 h-9 bg-primary text-primary-foreground text-sm font-semibold rounded hover:bg-primary/90 transition-colors">
                {t("Log In")}
              </button>
            )}
          </div>
        </header>

        {/* ─── Main ───────────────────────────────────────────────────────── */}
        <div className="pt-16 pb-32 sm:pb-8 max-w-[1200px] mx-auto px-3 sm:px-4 flex gap-4">

          {/* Left sidebar */}
          <nav aria-label="Feeds and communities" className="w-56 shrink-0 hidden lg:flex flex-col gap-4 [&>*]:shrink-0 sticky top-20 h-[calc(100vh-6rem)] overflow-y-auto pb-4 scrollbar-hide">
            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="px-3 py-2.5 border-b border-border text-xs font-bold uppercase tracking-widest text-muted-foreground">{t("Feeds")}</div>
              {([{ l: "Home", i: Home }, { l: "Popular", i: TrendingUp }, { l: "All", i: Sparkles }] as { l: FeedName; i: typeof Home }[]).map(({ l, i: Icon }) => {
                const active = !activeCommunity && (l === "Popular" ? feed === "All" && sort === "Top" : l === "All" ? feed === "All" && sort !== "Top" : feed === l);
                return (
                  <button key={l} onClick={() => openFeed(l)} aria-current={active ? "page" : undefined}
                    className={`w-full flex items-center gap-2.5 px-3 h-10 text-sm transition-colors ${active ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                    <Icon size={16} /> {t(l)}
                  </button>
                );
              })}
            </div>
            <CommunitySidebar communities={allCommunities} active={activeCommunity} isJoined={isJoined}
              onOpen={openCommunity} onCreate={() => setIsCreatingCommunity(true)} onBrowse={() => setIsBrowsing(true)} />
          </nav>

          {/* Center feed */}
          <main className="flex-1 min-w-0 flex flex-col gap-3">
            {activePost ? (
              <PostDetail
                key={String(activePost.id)}
                post={activePost}
                initialComments={activeComments}
                onClose={closePost}
                onVote={voteFor(activePost)}
                onAward={openAward}
                onReport={openReport}
                onPostChange={updatePost}
              />
            ) : viewedUser ? (
              <UserPage
                key={viewedUser}
                username={viewedUser}
                initialProfile={initialProfile && initialUser?.toLowerCase() === viewedUser.toLowerCase() ? initialProfile : null}
                onBack={() => openFeed("All")}
                voteFor={voteFor}
                onAward={openAward}
                onReport={(p) => openReport({ type: "post", post: p })}
                headingLevel={activePost ? 2 : 1}
              />
            ) : (
            <>
            {currentCommunity ? (
              <CommunityHeader
                community={currentCommunity}
                headingLevel={activePost ? 2 : 1}
                joined={isJoined(currentCommunity.name)}
                onToggleJoin={() => toggleJoin(currentCommunity.name)}
                onBack={() => openFeed("All")}
                onCreatePost={() => setIsCreatingPost(true)}
                onOpenModQueue={canModerate(currentCommunity.name) ? () => setModQueueFor(currentCommunity.name) : undefined}
              />
            ) : dataSaver && !showReels ? (
              <div className="bg-card border border-border rounded px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground flex items-center gap-2"><Video size={16} /> {t("Reels hidden to save data.")}</p>
                <button type="button" onClick={() => setShowReels(true)} className="h-9 px-4 rounded-full border border-border text-sm font-semibold hover:bg-muted">{t("Show reels")}</button>
              </div>
            ) : (
              <Suspense fallback={<div className="bg-card border border-border rounded h-[310px]" aria-hidden="true" />}>
                <VideoReels />
              </Suspense>
            )}

            <div role="toolbar" aria-label="Sort and filter posts" className="bg-card border border-border rounded px-2 py-1.5 flex items-center gap-1 overflow-x-auto scrollbar-hide flex-nowrap">
              {SORT_OPTIONS.map(({ label, icon: Icon }) => (
                <button key={label} aria-pressed={sort === label} onClick={() => setSort(label)}
                  className={`flex items-center gap-1.5 px-3 h-10 rounded text-xs font-semibold transition-colors shrink-0 ${sort === label ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <Icon size={14} /> {t(label)}
                </button>
              ))}
              <span className="w-px h-6 bg-border mx-1 shrink-0" aria-hidden="true" />
              <button aria-pressed={scamOnly} onClick={() => setScamOnly(!scamOnly)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded text-xs font-semibold transition-colors shrink-0 ${scamOnly ? "bg-destructive/15 text-destructive" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                <ShieldAlert size={14} /> {t("Scam alerts")}
              </button>
            </div>

            {postsLoading && !serverPosts && (
              <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">{t("Loading posts…")}</span>
              </div>
            )}
            {q && (
              <div className="flex items-center justify-between gap-2 px-1 text-sm" role="status">
                <span className="text-muted-foreground">
                  {searching ? "Searching…" : `${displayedPosts.length} ${displayedPosts.length === 1 ? "result" : "results"} for “${search.trim()}”${currentCommunity ? ` in ${communityLabel(currentCommunity)}` : ""}`}
                </span>
                <button type="button" onClick={() => setSearch("")} className="text-xs font-semibold text-primary hover:underline">Clear search</button>
              </div>
            )}
            {!postsLoading && !q && showingSamples && displayedPosts.length > 0 && (
              <p className="text-xs text-muted-foreground px-1">{t("Sample posts are shown until real posts arrive.")}</p>
            )}
            {!postsLoading && displayedPosts.length === 0 && (
              <div className="bg-card border border-border rounded p-8 text-center text-muted-foreground">
                {q ? (
                  <><Search size={32} className="mx-auto mb-3 opacity-50" /><p className="text-sm">{t("No posts matching")} &ldquo;{search}&rdquo;</p></>
                ) : feed === "Home" && !activeCommunity ? (
                  <>
                    <p className="text-sm mb-4">{t("Join a few communities to fill your Home feed.")}</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {allCommunities.slice(0, 6).map(c => (
                        <button key={c.name} onClick={() => openCommunity(c.name)} className="h-10 px-4 rounded-full border border-border text-sm text-foreground hover:bg-muted flex items-center gap-2">
                          <CommunityAvatar icon={c.icon} color={c.color} size={20} /> {communityLabel(c)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm mb-4">{scamOnly ? "No scam alerts here yet." : t("No posts in this community yet.")}</p>
                    <button onClick={() => setIsCreatingPost(true)} className="h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold">{t("Create Post")}</button>
                  </>
                )}
              </div>
            )}
            {!postsLoading && displayedPosts.map((post, i) => (
              <motion.div key={`${sort}-${activeCommunity ?? feed}-${scamOnly}-${post.id}`} initial={{ y: 12 }} animate={{ y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.04 }}>
                <PostCard post={post} onVote={voteFor(post)} onAward={openAward} onReport={(p) => openReport({ type: "post", post: p })} />
              </motion.div>
            ))}

            {!postsLoading && displayedPosts.length > 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">
                <p className="mb-3">{t("You're all caught up.")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {allCommunities.filter(c => c.name !== currentCommunity?.name && c.kind !== "campus").slice(0, 3).map(c => (
                    <a key={c.name} href={hrefForCommunity(c.name)} onClick={(e) => { e.preventDefault(); openCommunity(c.name); }}
                      className="h-10 px-4 rounded-full border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors flex items-center">
                      {t("Explore")} {communityLabel(c)}
                    </a>
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </main>

          {/* Right sidebar */}
          <aside className="w-[300px] shrink-0 hidden xl:flex flex-col gap-4 [&>*]:shrink-0 sticky top-20 h-[calc(100vh-6rem)] overflow-y-auto pb-4 scrollbar-hide">
            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="h-14" style={{ background: "linear-gradient(135deg, #0b8a5a 0%, #12b878 100%)" }} />
              <div className="p-4 -mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="rounded-full border-4 border-card bg-card text-xl w-12 h-12 flex items-center justify-center" aria-hidden="true">🇳🇬</span>
                  <a href={hrefForCommunity("Nigeria")} onClick={(e) => { e.preventDefault(); openCommunity("Nigeria"); }} className="mt-4 hover:underline">
                    <div className="text-base font-bold">Nigeria</div>
                    <div className="text-xs text-muted-foreground">Weekly fuel price check-ins</div>
                  </a>
                </div>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">The community for Nigerians at home and in the diaspora, with every state, campus and topic one tap away.</p>
                <div className="flex gap-2">
                  <button onClick={() => setIsCreatingPost(true)} className="flex-1 bg-primary text-primary-foreground text-sm font-semibold h-10 rounded hover:bg-primary/90 transition-colors">{t("Create Post")}</button>
                  <button onClick={() => setIsCreatingCommunity(true)} title="Create community — earn +50 gold"
                    className="flex items-center gap-1.5 px-3 h-10 border border-yellow-500/30 rounded text-xs font-semibold hover:bg-muted transition-colors text-amber-700 dark:text-[#f5c542]">
                    <Coins size={13} /> +50
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GoldCoin size={15} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-amber-700 dark:text-[#f5c542]">{t("Your Gold")}</h3>
                </div>
                {authUser && <button onClick={() => setIsProfileOpen(true)} className="text-xs text-primary hover:underline">{t("Gold shop")}</button>}
              </div>
              <div className="p-4">
                {authUser ? (
                  <div className="flex items-baseline justify-between">
                    <GoldBadge amount={balance} size="lg" />
                    <span className="text-xs text-muted-foreground">{t("Balance")}</span>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-3">Earn gold when people upvote and award your posts, then spend it on awards and profile flair.</p>
                    <button onClick={() => setIsAuthOpen(true)} className="w-full h-10 rounded bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">{t("Sign in to earn gold")}</button>
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                  {GOLD_RULES.map(({ action, reward }) => (
                    <div key={action} className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground">{t(action)}</span>
                      <span className="font-semibold tabular-nums text-amber-700 dark:text-[#f5c542]">+{reward}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Suspense fallback={<div className="bg-card border border-border rounded h-[280px]" aria-hidden="true" />}>
              {dataSaver ? (
                <div className="bg-card border border-border rounded p-4 text-sm text-muted-foreground">State activity map hidden to save data.</div>
              ) : (
                <CommunityHeatmap counts={stateStats} onOpen={openCommunity} />
              )}
            </Suspense>

            <div className="bg-card border border-border rounded overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <TrendingUp size={16} className="text-primary" />
                <h3 className="text-sm font-bold uppercase tracking-wider">{t("Local Trends")}</h3>
              </div>
              <div className="divide-y divide-border">
                {LOCAL_TRENDS.map((trend) => (
                  <button key={trend.tag} type="button" onClick={() => { setActiveCommunity(null); setFeed("All"); setSearch(trend.query); scrollTop(); }}
                    className="w-full text-left px-4 h-12 hover:bg-muted transition-colors flex justify-between items-center">
                    <span className="text-sm font-semibold text-primary">{trend.tag}</span>
                    <ChevronDown size={14} className="text-muted-foreground -rotate-90" />
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-card border border-border rounded p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider mb-2">Posting rules</h3>
              <ol className="list-decimal pl-4 space-y-1.5 text-xs text-muted-foreground">
                {POSTING_RULES.map(r => <li key={r}>{r}</li>)}
              </ol>
            </div>
          </aside>
        </div>

        {/* ─── Mobile bottom nav ──────────────────────────────────────────── */}
        <button onClick={() => setIsCreatingPost(true)} aria-label={t("Create Post")}
          className="md:hidden fixed right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-lg hover:bg-primary/90 transition-transform active:scale-95 z-40"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>
          <Plus size={24} />
        </button>

        <nav aria-label="Main" className="md:hidden fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border z-40 flex flex-col pb-safe">
          <button type="button" onClick={() => authUser ? setIsProfileOpen(true) : setIsAuthOpen(true)}
            className="flex items-center justify-center gap-1.5 py-1.5 border-b border-yellow-500/20 bg-yellow-500/5 w-full">
            <Coins size={12} className="text-amber-700 dark:text-[#f5c542]" />
            <span className="text-xs font-bold tabular-nums text-amber-700 dark:text-[#f5c542]">{authUser ? `${balance.toLocaleString()} gold` : t("Sign in to earn gold")}</span>
            {authUser && <span className="text-xs text-muted-foreground ml-1">· {username}</span>}
          </button>
          <div className="flex items-center justify-around h-14">
            {[
              { Icon: Home, label: t("Home"), action: () => openFeed("Home"), badge: 0 },
              { Icon: Search, label: t("Search"), action: () => { scrollTop(); setTimeout(() => searchRef.current?.focus(), 300); }, badge: 0 },
              { Icon: Users, label: t("Communities"), action: () => setIsBrowsing(true), badge: 0 },
              { Icon: Bell, label: t("Alerts"), action: () => authUser ? setIsNotifOpen(true) : requireAuth(), badge: unread },
              { Icon: User, label: authUser ? t("Profile") : t("Sign In"), action: () => authUser ? setIsProfileOpen(true) : setIsAuthOpen(true), badge: 0 },
            ].map(({ Icon, label, action, badge }) => (
              <button key={label} onClick={action} className="relative flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-muted-foreground hover:text-primary active:scale-90 transition-all">
                <Icon size={20} />
                {badge > 0 && <span className="absolute top-1.5 left-1/2 ml-1 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">{badge > 9 ? "9+" : badge}</span>}
                <span className="text-[11px] font-medium leading-none">{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* ─── Modals ─────────────────────────────────────────────────────── */}
        {isCreatingPost && (
          <CreatePostModal
            onClose={() => setIsCreatingPost(false)}
            communities={allCommunities}
            defaultCommunity={currentCommunity?.name}
            onCreated={(p) => {
              setServerPosts(prev => [{ ...p, userVote: "up" }, ...(prev ?? [])]);
              if (accessToken) loadGold(accessToken);
            }}
          />
        )}
        {isCreatingCommunity && (
          <CreateCommunityModal
            onClose={() => setIsCreatingCommunity(false)}
            onCreated={(c) => {
              setServerCommunities(prev => [...prev, c]);
              setJoined(prev => [...prev, c.name]);
              setModerates(prev => [...prev, c.name]);
              setMemberCounts(prev => ({ ...prev, [c.name]: 1 }));
              if (accessToken) loadGold(accessToken);
              openCommunity(c.name);
            }}
          />
        )}
        {isBrowsing && (
          <CommunityBrowser communities={allCommunities} active={activeCommunity} isJoined={isJoined}
            onOpen={openCommunity} onToggleJoin={toggleJoin} onClose={() => setIsBrowsing(false)} onCreate={() => setIsCreatingCommunity(true)} />
        )}
        {isProfileOpen && authUser && (
          <ProfileModal
            onClose={() => setIsProfileOpen(false)}
            onSignOut={handleSignOut}
            onViewProfile={() => { setIsProfileOpen(false); if (username) openUser(username); }}
            onDeleted={() => {
              setIsProfileOpen(false);
              setAuthUser(null);
              setAccessToken(null);
              supabase.auth.signOut().catch(() => {});
              loadPosts(null);
            }}
          />
        )}
        {editTarget && (
          <EditPostModal post={editTarget} onClose={() => setEditTarget(null)} onSaved={(p) => {
            updatePost(p);
            setSearchResults(prev => prev ? prev.map(x => String(x.id) === String(p.id) ? { ...x, ...p } : x) : prev);
          }} />
        )}
        {recoveryOpen && <NewPasswordModal onDone={() => setRecoveryOpen(false)} />}
        {isNotifOpen && <NotificationsPanel items={notifications} onClose={() => setIsNotifOpen(false)} onOpen={openNotification} onMarkAll={markAllRead} />}
        {modQueueFor && <ModQueueDialog community={modQueueFor} onClose={() => setModQueueFor(null)} onChanged={() => loadPosts(accessToken)} />}
        {shareTarget && <ShareSheet post={shareTarget} url={shareUrlFor(shareTarget, routing)} onClose={() => setShareTarget(null)} />}
        {awardTarget && (
          <AwardDialog post={awardTarget} onClose={() => setAwardTarget(null)} onAwarded={(awards) => updatePost({ ...awardTarget, awards })} />
        )}
        {reportTarget && (
          <ReportDialog
            targetType={reportTarget.type}
            targetId={reportTarget.id}
            preview={reportTarget.preview}
            onClose={() => setReportTarget(null)}
            onReported={(hidden) => {
              if (hidden && reportTarget.type === "post") setServerPosts(prev => prev ? prev.filter(p => String(p.id) !== reportTarget.id) : prev);
            }}
          />
        )}
        {isAuthOpen && (
          <AuthModal
            onClose={() => setIsAuthOpen(false)}
            onSuccess={(user, token) => {
              setAuthUser(user);
              setAccessToken(token);
              setIsAuthOpen(false);
              toast.success(`Welcome, ${user.user_metadata?.username ?? ""}! 🎉`);
            }}
          />
        )}
      </div>
    </AppProvider>
  );
}
