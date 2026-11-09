// Built-in communities, sample posts and site-wide constants.
// Shared by the app, the preview backend and the Next.js site.
// The server keeps its own copy of BUILTIN_COMMUNITY_NAMES (supabase/functions/server/index.tsx).

import type { Community, Post, AwardKind } from "./types";

export const SITE_NAME = "Threadit";

/** Cloudflare Turnstile site key for the sign-up check. Leave empty to turn it off.
 *  If you set it, also set TURNSTILE_SECRET_KEY on the Supabase function. */
export const TURNSTILE_SITE_KEY = "";

export const userPath = (username: string) => `/u/${encodeURIComponent(username.replace(/^u\//i, ""))}`;
export const SITE_TAGLINE = "Nigeria's communities, in one place";

const PALETTE = ["#0b8a5a", "#4fa3e0", "#c77dff", "#e0a100", "#ff6a3d", "#2bb3a3", "#e05a8a", "#7a8cff", "#8fb339"];
const color = (i: number) => PALETTE[i % PALETTE.length];

// ─── 36 states + FCT ──────────────────────────────────────────────────────────

const STATES: [name: string, label: string, capital: string, abbr: string][] = [
  ["Abia", "Abia", "Umuahia", "AB"], ["Adamawa", "Adamawa", "Yola", "AD"],
  ["AkwaIbom", "Akwa Ibom", "Uyo", "AK"], ["Anambra", "Anambra", "Awka", "AN"],
  ["Bauchi", "Bauchi", "Bauchi", "BA"], ["Bayelsa", "Bayelsa", "Yenagoa", "BY"],
  ["Benue", "Benue", "Makurdi", "BE"], ["Borno", "Borno", "Maiduguri", "BO"],
  ["CrossRiver", "Cross River", "Calabar", "CR"], ["Delta", "Delta", "Asaba", "DE"],
  ["Ebonyi", "Ebonyi", "Abakaliki", "EB"], ["Edo", "Edo", "Benin City", "ED"],
  ["Ekiti", "Ekiti", "Ado-Ekiti", "EK"], ["Enugu", "Enugu", "Enugu", "EN"],
  ["Gombe", "Gombe", "Gombe", "GO"], ["Imo", "Imo", "Owerri", "IM"],
  ["Jigawa", "Jigawa", "Dutse", "JI"], ["Kaduna", "Kaduna", "Kaduna", "KD"],
  ["Kano", "Kano", "Kano", "KN"], ["Katsina", "Katsina", "Katsina", "KT"],
  ["Kebbi", "Kebbi", "Birnin Kebbi", "KE"], ["Kogi", "Kogi", "Lokoja", "KO"],
  ["Kwara", "Kwara", "Ilorin", "KW"], ["Lagos", "Lagos", "Ikeja", "LA"],
  ["Nasarawa", "Nasarawa", "Lafia", "NA"], ["Niger", "Niger", "Minna", "NI"],
  ["Ogun", "Ogun", "Abeokuta", "OG"], ["Ondo", "Ondo", "Akure", "ON"],
  ["Osun", "Osun", "Osogbo", "OS"], ["Oyo", "Oyo", "Ibadan", "OY"],
  ["Plateau", "Plateau", "Jos", "PL"], ["Rivers", "Rivers", "Port Harcourt", "RI"],
  ["Sokoto", "Sokoto", "Sokoto", "SO"], ["Taraba", "Taraba", "Jalingo", "TA"],
  ["Yobe", "Yobe", "Damaturu", "YO"], ["Zamfara", "Zamfara", "Gusau", "ZA"],
];

export const STATE_COMMUNITIES: Community[] = [
  {
    name: "Abuja", label: "Abuja (FCT)", icon: "FC", kind: "state", color: color(0),
    description: "The Federal Capital Territory: news, gist and help for people in and from Abuja.",
  },
  ...STATES.map(([name, label, capital, abbr], i): Community => ({
    name, label, icon: abbr, kind: "state", color: color(i + 1),
    description: `${label} State, capital ${capital}: local news, questions and gist from people in and from ${label}.`,
  })),
];

export const CAMPUS_COMMUNITIES: Community[] = [
  ["UNILAG", "University of Lagos"], ["UI", "University of Ibadan"],
  ["OAU", "Obafemi Awolowo University"], ["UNN", "University of Nigeria, Nsukka"],
  ["ABU", "Ahmadu Bello University"], ["UNIBEN", "University of Benin"],
  ["LASU", "Lagos State University"], ["FUTA", "Federal University of Technology, Akure"],
  ["Covenant", "Covenant University"],
].map(([name, label], i) => ({
  name, label, icon: name.slice(0, 2).toUpperCase(), kind: "campus" as const, color: color(i + 3),
  description: `Students, staff and alumni of ${label}: lectures, hostels, exams and campus gist.`,
}));

export const INTEREST_COMMUNITIES: Community[] = [
  { name: "Nigeria", icon: "🇳🇬", kind: "national", color: "#0b8a5a", description: "The community for Nigerians at home and in the diaspora. Weekly fuel price check-ins live here." },
  { name: "AskNaija", label: "Ask Naija", icon: "❓", kind: "interest", color: color(1), description: "Ask anything about life in Nigeria and get answers from people who know." },
  { name: "TechNigeria", label: "Tech Nigeria", icon: "💻", kind: "interest", color: color(2), description: "Startups, developers, product and remote work across the Nigerian tech scene." },
  { name: "NYSC", icon: "🎒", kind: "interest", color: color(3), description: "Corps members and prospective corpers: postings, camp, PPA and allowances." },
  { name: "Jobs", icon: "💼", kind: "interest", color: color(4), description: "Job openings, interview tips and career questions. Never pay to get a job." },
  { name: "Japa", icon: "✈️", kind: "interest", color: color(5), description: "Studying, working and settling abroad, plus life in the diaspora." },
  { name: "Nollywood", icon: "🎬", kind: "interest", color: color(6), description: "Films, series, actors and behind-the-scenes talk." },
  { name: "SuperEagles", label: "Super Eagles", icon: "⚽", kind: "interest", color: color(7), description: "Nigerian football: national teams, NPFL and Nigerians abroad." },
  { name: "Owambe", icon: "🎉", kind: "interest", color: color(8), description: "Weddings, parties, aso-ebi and event planning." },
  { name: "NaijaFood", label: "Naija Food", icon: "🍲", kind: "interest", color: color(0), description: "Recipes, street food and where to eat, state by state." },
];

export const BUILTIN_COMMUNITIES: Community[] = [
  ...INTEREST_COMMUNITIES,
  ...STATE_COMMUNITIES,
  ...CAMPUS_COMMUNITIES,
];

/** The communities shown first in sidebars and pickers */
export const FEATURED_COMMUNITY_NAMES = ["Nigeria", "Lagos", "Abuja", "AskNaija", "TechNigeria", "Kano", "Rivers", "NYSC"];

export const communityLabel = (c: Pick<Community, "name" | "label">) => c.label ?? c.name;

// ─── Post flairs ──────────────────────────────────────────────────────────────

export const FLAIRS: { name: string; color: string }[] = [
  { name: "News", color: "#4fa3e0" },
  { name: "Ask", color: "#2fb37f" },
  { name: "Discussion", color: "#a66bff" },
  { name: "Scam Alert", color: "#e53e3e" },
  { name: "Event", color: "#ff7a29" },
  { name: "Jobs", color: "#c89400" },
  { name: "Gist", color: "#e0a100" },
];
export const SCAM_ALERT = "Scam Alert";

// ─── Gold shop ────────────────────────────────────────────────────────────────

export const AWARDS: Record<AwardKind, { label: string; cost: number; toAuthor: number; icon: string; description: string }> = {
  helpful: { label: "Helpful", cost: 20, toAuthor: 10, icon: "🤝", description: "For a post that actually helped someone." },
  gold: { label: "Gold", cost: 100, toAuthor: 50, icon: "🏅", description: "For the best of the best." },
};

export const PROFILE_FLAIRS = ["Eko Native", "Corper", "Techie", "Naija Abroad", "Foodie", "Football Head", "Campus Gist", "Owambe Royalty"];
export const PROFILE_FLAIR_COST = 150;

/** Upvote counts that trigger a "your post hit N upvotes" notification */
export const MILESTONES = [10, 50, 100, 500, 1000];

// ─── Sample posts (shown only until real posts exist) ─────────────────────────

export const SAMPLE_POSTS: Post[] = [
  {
    id: "demo-1", community: "Lagos", author: "EkoHustle", timeAgo: "3 hours ago",
    title: "Lagos commuters: has the Blue Line changed your daily trip?",
    body: "If you ride the Blue Line, how long does your commute take now compared with before? Share your route and times.",
    votes: 1281, comments: 241, flair: "Discussion", flairColor: "#a66bff", pinned: true, sample: true,
  },
  {
    id: "demo-2", community: "Abuja", author: "CapitalVibes", timeAgo: "5 hours ago",
    title: "Beautiful sunset over Aso Rock today. The harmattan haze finally cleared up.",
    images: [
      "https://images.unsplash.com/photo-1618828665011-0abd973f7bb8?w=800&h=420&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=800&h=420&fit=crop&auto=format",
    ],
    votes: 842, comments: 63, flair: "Gist", flairColor: "#e0a100", sample: true,
  },
  {
    id: "demo-3", community: "TechNigeria", author: "AbaBuilds", timeAgo: "7 hours ago",
    title: "I built a payment tool for SMEs in Aba and Kano. Looking for beta testers!",
    body: "It handles transfers, receipts and simple bookkeeping in English and Pidgin. Reply if you run a small business and want to try it.",
    votes: 356, comments: 88, flair: "Discussion", flairColor: "#a66bff", sample: true,
  },
  {
    id: "demo-4", community: "Kano", author: "AncientKano", timeAgo: "9 hours ago",
    title: "The history of the Kano city walls: why we need to preserve our heritage",
    votes: 274, comments: 41, flair: "Discussion", flairColor: "#a66bff", sample: true,
  },
  {
    id: "demo-5", community: "AskNaija", author: "FoodieNG", timeAgo: "12 hours ago",
    title: "What's the street food in your state that every visitor must try?",
    votes: 615, comments: 302, flair: "Ask", flairColor: "#2fb37f", sample: true,
  },
  {
    id: "demo-6", community: "Enugu", author: "CoalCityDev", timeAgo: "1 day ago",
    title: "Startup founders meetup at Polo Park this weekend. Who is coming?",
    votes: 98, comments: 27, flair: "Event", flairColor: "#ff7a29", sample: true,
  },
  {
    id: "demo-7", community: "Jobs", author: "HRWatch", timeAgo: "1 day ago",
    title: "Got a job offer that asks me to pay ₦25,000 for 'training materials' first. Is this legit?",
    body: "They found me on WhatsApp and the interview was only by chat. Has anyone heard of this company?",
    votes: 433, comments: 129, flair: "Scam Alert", flairColor: "#e53e3e", sample: true,
  },
];

export const LOCAL_TRENDS = [
  { tag: "#FuelPrice", query: "fuel" },
  { tag: "#NYSC", query: "nysc" },
  { tag: "#ScamAlert", query: "scam" },
  { tag: "#TechNaija", query: "tech" },
];

// ─── URLs ─────────────────────────────────────────────────────────────────────

export function slugify(text: string): string {
  const full = text
    .toLowerCase()
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/₦/g, "naira ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length <= 70) return full || "post";
  // Keep at most 70 characters, ending on a whole word
  const cut = full.slice(0, 71);
  const lastDash = cut.lastIndexOf("-");
  return (lastDash > 20 ? cut.slice(0, lastDash) : full.slice(0, 70)).replace(/-+$/, "");
}

export const communityPath = (name: string) => `/c/${encodeURIComponent(name.toLowerCase())}`;
export const postPath = (p: Pick<Post, "id" | "community" | "title">) =>
  `${communityPath(p.community)}/${encodeURIComponent(String(p.id))}/${slugify(p.title)}`;
