import { useState, useEffect, useRef } from "react";
import {
  Heart, MessageCircle, Share2, Bookmark, Music2,
  X, Play, Plus, ChevronUp, ChevronDown, Volume2, VolumeX,
  type LucideIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface Reel {
  id: string;
  community: string;
  author: string;
  caption: string;
  audio: string;
  thumbnail: string;
  duration: string;
  likes: string;
  comments: string;
  shares: string;
  views: string;
  tags: string[];
  isLive?: boolean;
}

const REELS: Reel[] = [
  {
    id: "r1",
    community: "Lagos",
    author: "@NaijaEats",
    caption: "Best suya spot in Surulere 🔥 The smoke hits different at night. You have to try this before you die.",
    audio: "Original sound — NaijaEats",
    thumbnail: "https://images.unsplash.com/photo-1765584829902-51939816637c?w=400&h=700&fit=crop&auto=format",
    duration: "0:43",
    likes: "12.4k",
    comments: "891",
    shares: "2.1k",
    views: "124k",
    tags: ["#LagosFoodScene", "#Suya", "#NaijaEats"],
  },
  {
    id: "r2",
    community: "TechNigeria",
    author: "@dev_naija",
    caption: "Yaba tech hub energy ⚡ The future is here.",
    audio: "Original sound — dev_naija",
    thumbnail: "https://images.unsplash.com/photo-1652095319417-4bf8a0de1a3d?w=400&h=700&fit=crop&auto=format",
    duration: "1:12",
    likes: "8.9k",
    comments: "512",
    shares: "1.4k",
    views: "89k",
    tags: ["#TechNaija", "#Yaba", "#BuildingNaija"],
  },
  {
    id: "r3",
    community: "Abuja",
    author: "@CapitalVibes",
    caption: "Abuja at night never disappoints ✨ The city lights are unreal. Where should I go next?",
    audio: "Original sound — CapitalVibes",
    thumbnail: "https://images.unsplash.com/photo-1756721501657-639c90be59ec?w=400&h=700&fit=crop&auto=format",
    duration: "0:28",
    likes: "45.2k",
    comments: "3.2k",
    shares: "8.9k",
    views: "210k",
    tags: ["#AbujaCity", "#NigeriaVibes"],
  },
  {
    id: "r4",
    community: "Naija",
    author: "@CloutAfrica",
    caption: "Naija fashion is unmatched 💚 Ankara fits hitting different this season. Drop your fits below 👇",
    audio: "Original sound — CloutAfrica",
    thumbnail: "https://images.unsplash.com/photo-1640080878866-938a9766ef55?w=400&h=700&fit=crop&auto=format",
    duration: "0:55",
    likes: "98.1k",
    comments: "7.8k",
    shares: "22.4k",
    views: "1.2M",
    tags: ["#NaijaFashion", "#Ankara", "#AfricaStyle"],
  },
  {
    id: "r5",
    community: "Rivers",
    author: "@ph_connect",
    caption: "Bole and fish on the PH waterfront 🐟 The best combo in the south south. No cap.",
    audio: "Original sound — ph_connect",
    thumbnail: "https://images.unsplash.com/photo-1579998120708-682dd8a5624f?w=400&h=700&fit=crop&auto=format",
    duration: "1:05",
    likes: "6.3k",
    comments: "402",
    shares: "890",
    views: "63k",
    tags: ["#PHCity", "#BoleAndFish", "#SouthSouth"],
  },
  {
    id: "r6",
    community: "Naija",
    author: "@WanderNaija",
    caption: "Market scenes hit different in the morning light 🌅 This is home. This is us.",
    audio: "Original sound — WanderNaija",
    thumbnail: "https://images.unsplash.com/photo-1734255026082-82fdc81991f0?w=400&h=700&fit=crop&auto=format",
    duration: "0:38",
    likes: "31.7k",
    comments: "2.1k",
    shares: "5.6k",
    views: "317k",
    tags: ["#Naija", "#AfricaVibes", "#MarketDay"],
  },
  {
    id: "r7",
    community: "Naija",
    author: "@AfroArtist",
    caption: "Our first live show in Lagos 🎤 The energy was insane. Nigeria to the world!",
    audio: "Original sound — AfroArtist",
    thumbnail: "https://images.unsplash.com/photo-1643370857818-d3705b0a1ec1?w=400&h=700&fit=crop&auto=format",
    duration: "2:10",
    likes: "204k",
    comments: "18.4k",
    shares: "67k",
    views: "4.1M",
    tags: ["#Afrobeats", "#Nigeria2TheWorld"],
    isLive: false,
  },
];

// ─── Spinning Disc ─────────────────────────────────────────────────────────────
function SpinningDisc({ src, size = 44 }: { src: string; size?: number }) {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      className="rounded-full border-2 border-white/30 overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      <img src={src} alt="audio" className="w-full h-full object-cover" />
      <div className="absolute inset-0 rounded-full border-[3px] border-transparent" style={{ background: "radial-gradient(circle, rgba(0,0,0,0.5) 30%, transparent 70%)" }} />
    </motion.div>
  );
}

// ─── Action Button ─────────────────────────────────────────────────────────────
function ActionBtn({
  icon: Icon, count, active, color, onClick,
}: {
  icon: LucideIcon;
  count?: string;
  active?: boolean;
  color?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5"
    >
      <div className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform">
        <Icon
          size={22}
          className={active ? "" : "text-white"}
          fill={active ? (color || "currentColor") : "none"}
          style={active ? { color: color || "white" } : undefined}
        />
      </div>
      {count && <span className="text-white text-[10px] font-semibold">{count}</span>}
    </button>
  );
}

// ─── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="h-[2px] bg-white/20 w-full">
      <motion.div
        className="h-full bg-white"
        style={{ width: `${progress}%` }}
        transition={{ duration: 0.1 }}
      />
    </div>
  );
}

// ─── Reel Modal ────────────────────────────────────────────────────────────────
function ReelModal({
  reel,
  allReels,
  onClose,
}: {
  reel: Reel;
  allReels: Reel[];
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(() => allReels.findIndex((r) => r.id === reel.id));
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(18);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = allReels[currentIndex];

  useEffect(() => {
    setProgress(0);
    setLiked(false);
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          if (intervalRef.current !== null) clearInterval(intervalRef.current);
          return 100;
        }
        return p + 0.4;
      });
    }, 50);
    return () => { if (intervalRef.current !== null) clearInterval(intervalRef.current); };
  }, [currentIndex]);

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };
  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex < allReels.length - 1) setCurrentIndex((i) => i + 1);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-md"
      onClick={onClose}
    >
      {/* Phone-frame container */}
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-[360px] mx-4 rounded-2xl overflow-hidden shadow-2xl"
          style={{ aspectRatio: "9/16", maxHeight: "90vh" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Blurred bg */}
          <img
            src={current.thumbnail}
            alt=""
            className="absolute inset-0 w-full h-full object-cover scale-110"
            style={{ filter: "blur(16px)", opacity: 0.5 }}
          />

          {/* Main thumbnail */}
          <img
            src={current.thumbnail}
            alt={current.caption}
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Top gradient */}
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />

          {/* Bottom gradient */}
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          {/* Progress bar at top */}
          <div className="absolute top-0 inset-x-0">
            <ProgressBar progress={progress} />
          </div>

          {/* Top bar */}
          <div className="absolute top-3 inset-x-0 flex items-center justify-between px-4">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white"
            >
              <X size={16} />
            </button>
            <span className="text-white text-sm font-bold tracking-wide opacity-90">
              {current.community}
            </span>
            <button
              onClick={() => setMuted((m) => !m)}
              className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center text-white"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>

          {/* Center play overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 1, scale: 1 }}
              animate={{ opacity: 0, scale: 1.5 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center"
            >
              <Play size={28} className="text-white fill-white ml-1" />
            </motion.div>
          </div>

          {/* Right action bar */}
          <div className="absolute right-3 bottom-28 flex flex-col items-center gap-5">
            {/* Avatar with follow */}
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center text-white text-sm font-bold border-2 border-white">
                {current.author[1].toUpperCase()}
              </div>
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Plus size={11} className="text-white" strokeWidth={3} />
              </div>
            </div>

            <ActionBtn
              icon={Heart}
              count={liked ? `${(Math.round(parseFloat(current.likes) * 10 + 1) / 10).toFixed(1)}k` : current.likes}
              active={liked}
              color="#ff4500"
              onClick={(e) => { e.stopPropagation(); setLiked((l) => !l); }}
            />
            <ActionBtn icon={MessageCircle} count={current.comments} />
            <ActionBtn icon={Share2} count={current.shares} />
            <ActionBtn
              icon={Bookmark}
              count={current.views}
              active={saved}
              color="#f5c542"
              onClick={(e) => { e.stopPropagation(); setSaved((s) => !s); }}
            />
            <SpinningDisc src={current.thumbnail} size={40} />
          </div>

          {/* Bottom info */}
          <div className="absolute bottom-0 inset-x-0 px-4 pb-4 pr-16">
            <div className="text-white text-sm font-bold mb-1">{current.author}</div>
            <p className="text-white/90 text-xs leading-relaxed line-clamp-3 mb-2">
              {current.caption}
            </p>
            <div className="flex flex-wrap gap-1 mb-3">
              {current.tags.map((tag) => (
                <span key={tag} className="text-[10px] text-primary font-semibold">
                  {tag}
                </span>
              ))}
            </div>
            {/* Audio bar */}
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
              <Music2 size={11} className="text-white shrink-0" />
              <div className="overflow-hidden flex-1">
                <motion.p
                  animate={{ x: [0, -100] }}
                  transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  className="text-[10px] text-white/80 whitespace-nowrap"
                >
                  {current.audio} &nbsp;&nbsp;&nbsp; {current.audio}
                </motion.p>
              </div>
            </div>
          </div>

          {/* Prev / Next nav */}
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-1/2 -translate-x-1/2 top-16 w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <ChevronUp size={24} />
            </button>
          )}
          {currentIndex < allReels.length - 1 && (
            <button
              onClick={goNext}
              className="absolute left-1/2 -translate-x-1/2 bottom-20 w-8 h-8 flex items-center justify-center text-white/50 hover:text-white transition-colors"
            >
              <ChevronDown size={24} />
            </button>
          )}

          {/* Reel counter */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 mt-8 flex items-center gap-1">
            {allReels.map((_, i) => (
              <div
                key={i}
                className="h-[2px] rounded-full transition-all duration-200"
                style={{
                  width: i === currentIndex ? 16 : 4,
                  backgroundColor: i === currentIndex ? "white" : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Reel Card (preview in horizontal scroll) ─────────────────────────────────
function ReelCard({ reel, onOpen }: { reel: Reel; onOpen: () => void }) {
  const [liked, setLiked] = useState(false);

  return (
    <motion.div
      onClick={onOpen}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.97 }}
      className="relative shrink-0 w-[130px] sm:w-[148px] rounded-xl overflow-hidden cursor-pointer group"
      style={{ aspectRatio: "9/16" }}
    >
      <img
        src={reel.thumbnail}
        alt={reel.caption}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/35" />

      {/* Top: duration + views */}
      <div className="absolute top-2 inset-x-2 flex items-center justify-between">
        {reel.isLive ? (
          <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm tracking-wide">
            ● LIVE
          </span>
        ) : (
          <span className="bg-black/50 backdrop-blur-sm text-white text-[9px] font-mono px-1.5 py-0.5 rounded">
            {reel.duration}
          </span>
        )}
        <span className="bg-black/50 backdrop-blur-sm text-white/80 text-[9px] px-1.5 py-0.5 rounded">
          {reel.views}
        </span>
      </div>

      {/* Community tag */}
      <div className="absolute top-8 left-2">
        <span className="text-[8px] text-white/60 font-semibold bg-black/30 px-1 py-0.5 rounded">
          {reel.community}
        </span>
      </div>

      {/* Play button (hover) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm border border-white/30 flex items-center justify-center">
          <Play size={20} className="text-white fill-white ml-0.5" />
        </div>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-0 inset-x-0 p-2">
        <div className="text-[10px] font-bold text-white mb-0.5 truncate">
          {reel.author}
        </div>
        <p className="text-[9px] text-white/70 line-clamp-2 leading-tight mb-2">
          {reel.caption}
        </p>

        {/* Engagement row */}
        <div className="flex items-center justify-between">
          <button
            onClick={(e) => { e.stopPropagation(); setLiked((l) => !l); }}
            className="flex items-center gap-0.5 group/like"
          >
            <Heart
              size={11}
              className="transition-colors"
              fill={liked ? "#ff4500" : "none"}
              style={{ color: liked ? "#ff4500" : "rgba(255,255,255,0.6)" }}
            />
            <span className="text-[9px] text-white/60">{reel.likes}</span>
          </button>

          <div className="flex items-center gap-0.5">
            <MessageCircle size={9} className="text-white/50" />
            <span className="text-[9px] text-white/50">{reel.comments}</span>
          </div>
        </div>

        {/* Audio indicator */}
        <div className="flex items-center gap-1 mt-1.5">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="w-4 h-4 rounded-full border border-white/30 overflow-hidden shrink-0"
          >
            <img src={reel.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" />
          </motion.div>
          <span className="text-[8px] text-white/50 truncate">Original sound</span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Export ───────────────────────────────────────────────────────────────
export function VideoReels() {
  const [activeTab, setActiveTab] = useState("For You");
  const [activeReelId, setActiveReelId] = useState<string | null>(null);

  const activeReel = REELS.find((r) => r.id === activeReelId) ?? null;
  const tabs = ["For You", "Nigeria", "Following"];

  return (
    <>
      <div className="bg-card border border-border rounded overflow-hidden">
        {/* Header with tabs */}
        <div className="border-b border-border">
          <div className="flex items-center gap-4 px-4 pt-3">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2.5 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === tab
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Reels scroll */}
        <div className="flex gap-2.5 p-3 overflow-x-auto snap-x scrollbar-hide">
          {REELS.map((reel) => (
            <div key={reel.id} className="snap-start">
              <ReelCard reel={reel} onOpen={() => setActiveReelId(reel.id)} />
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {REELS.length} reels · Tap to watch
          </p>
          <button className="text-[10px] text-primary font-semibold hover:underline">
            See all →
          </button>
        </div>
      </div>

      {/* Full-screen modal */}
      {activeReel && (
        <ReelModal
          reel={activeReel}
          allReels={REELS}
          onClose={() => setActiveReelId(null)}
        />
      )}
    </>
  );
}

export default VideoReels;
