// English → Nigerian Pidgin. English text is the key, so untranslated strings
// fall back to English. Have native Pidgin speakers review these before launch.
// To add Yoruba, Hausa or Igbo, add another dictionary in the same shape and a
// language option in LANGUAGES; no other code needs to change.

export type Lang = "en" | "pcm";

export const LANGUAGES: { code: Lang; label: string; short: string; htmlLang: string }[] = [
  { code: "en", label: "English", short: "ENG", htmlLang: "en-NG" },
  { code: "pcm", label: "Pidgin", short: "PID", htmlLang: "pcm" },
];

const PCM: Record<string, string> = {
  // Header & navigation
  "Search Threadit": "Find Wetin Dey Sup",
  "Create": "Yarn",
  "Log In": "Enter",
  "Sign In": "Enter",
  "Sign Up": "Join",
  "Sign out": "Comot",
  "Home": "Area",
  "Feeds": "Updates",
  "Popular": "Wetin Cast",
  "All": "Evrytin",
  "Communities": "Hoods",
  "States": "States",
  "Campuses": "Campus",
  "Interests": "Wetin You Like",
  "Show all communities": "Show all hoods",
  "Show fewer": "Show small",
  "Create Community": "Start New Hood",
  "Create Post": "Start New Yarn",
  "Notifications": "Notice",
  "Mark all as read": "I don see all",
  "No notifications yet.": "No notice yet.",
  "Data saver": "Save data",
  "Data saver is on: images and reels load only when you tap them.": "Save data dey on: pictures and reels go show only when you tap am.",
  "Switch to Pidgin": "Change to Pidgin",
  "Switch to English": "Change to English",
  "Switch to light mode": "Change to light",
  "Switch to dark mode": "Change to dark",
  "Search": "Find",
  "Alerts": "Notice",
  "Profile": "Profile",
  "Choose feed or community": "Choose updates or hood",

  // Feed
  "Hot": "Hot",
  "Top": "Top",
  "New": "New",
  "Rising": "Dey Rise",
  "Scam alerts": "Scam alerts",
  "Loading posts…": "Posts dey load…",
  "You're all caught up.": "You don see everything finish.",
  "No posts matching": "We no see anything for",
  "Join a few communities to fill your Home feed.": "Join some hoods make your Area full.",
  "No posts in this community yet.": "Nobody don post for dis hood yet.",
  "Explore": "Check",
  "Sample post": "Example post",
  "Sample posts are shown until real posts arrive.": "Na example posts be dis until real posts land.",
  "Pinned": "Pinned",
  "Local Trends": "Wetin Dey Trend",
  "State Activity": "Wetin Dey Happen for States",
  "Posts this week": "Posts dis week",

  // Posts
  "Posted by": "Dropped by",
  "Comments": "Talks",
  "Share": "Send",
  "Save": "Keep",
  "Saved": "Kept",
  "Show less": "Hide small",
  "Read more": "Read wella",
  "Award": "Dash",
  "Report": "Report",
  "Hidden while moderators review reports.": "We hide am while moderators dey check the reports.",
  "Tap to load image": "Tap make picture show",
  "Share post": "Send dis post",
  "Share to WhatsApp": "Send am for WhatsApp",
  "Copy link": "Copy link",
  "Link copied": "Link don copy",
  "Back to feed": "Go back",
  "Upvote": "Gbe am up",
  "Downvote": "Push am down",
  "Sign in to vote": "Enter make you vote",

  // Comments
  "Top Comments": "Top Talks",
  "What are your thoughts?": "Wetin you think?",
  "Comment": "Talk",
  "Reply": "Answer",
  "Cancel": "Leave am",
  "No comments yet. Start the conversation.": "Nobody don talk yet. Start the yarn.",
  "Sign in to comment": "Enter make you talk",
  "Loading comments…": "Talks dey load…",

  // Gold
  "Your Gold": "Your Gold",
  "Sign in to earn gold": "Enter make you earn gold",
  "Earn gold": "Earn gold",
  "Gold shop": "Gold shop",
  "Give an award": "Dash award",
  "Profile flair": "Profile badge",
  "Buy flair": "Buy badge",
  "Not enough gold": "Your gold no reach",
  "View profile": "See profile",
  "Publish a post": "Drop a post",
  "Each upvote you receive": "Every upvote wey you get",
  "Found a community": "Start a hood",
  "Awards you receive": "Awards wey you get",
  "Balance": "Wetin remain",

  // Communities & moderation
  "Join": "Join",
  "Joined": "You don join",
  "members": "guys",
  "All posts": "All posts",
  "Mod queue": "Mod queue",
  "Approve": "Allow am",
  "Remove": "Comot am",
  "Nothing to review.": "Nothing to check.",
  "Why are you reporting this?": "Why you dey report dis?",
  "Scam or fraud": "Scam or wayo",
  "Hate or ethnic attacks": "Hate or tribe attack",
  "False information": "Fake news",
  "Spam": "Spam",
  "Harassment": "Disturbing person",
  "Something else": "Another thing",
  "Send report": "Send report",
  "Thanks. Moderators will review it.": "Thank you. Moderators go check am.",

  // Create post
  "Choose a community": "Choose a hood",
  "Title": "Title",
  "Text (optional)": "Text (if you like)",
  "Flair": "Tag",
  "No flair": "No tag",
  "Post & Earn Gold": "Post & Earn Gold",
  "Sign in to post": "Enter make you post",
  "Original audio only. Videos that use copyrighted music will be removed.": "Na your own sound only. We go comot videos wey use other people music.",
  "Reels hidden to save data.": "We hide reels to save data.",
  "Show reels": "Show reels",
  "Original sound": "Original sound",
};

const DICTS: Record<Lang, Record<string, string>> = { en: {}, pcm: PCM };

export function makeT(lang: Lang) {
  const dict = DICTS[lang] ?? {};
  return (key: string) => dict[key] ?? key;
}

export type T = ReturnType<typeof makeT>;
