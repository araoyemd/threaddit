import { Coins, Crown, Medal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";

// ─── Tier definitions ─────────────────────────────────────────────────────────

export interface Tier {
  name: string;
  label: string;
  min: number;
  max: number;
  color: string;
  emoji: string;
}

export const TIERS: Tier[] = [
  { name: "rookie",   label: "Rookie",   min: 0,      max: 99,       color: "#818590", emoji: "🌱" },
  { name: "bronze",   label: "Bronze",   min: 100,    max: 499,      color: "#cd7f32", emoji: "🥉" },
  { name: "silver",   label: "Silver",   min: 500,    max: 1999,     color: "#a8a8b3", emoji: "🥈" },
  { name: "gold",     label: "Gold",     min: 2000,   max: 9999,     color: "#f5c542", emoji: "🥇" },
  { name: "platinum", label: "Platinum", min: 10000,  max: 49999,    color: "#67e8f9", emoji: "💎" },
  { name: "legend",   label: "Legend",   min: 50000,  max: Infinity, color: "#ff4500", emoji: "👑" },
];

export function getTier(gold: number): Tier {
  return TIERS.find((t) => gold >= t.min && gold <= t.max) ?? TIERS[0];
}

export function getNextTier(gold: number): Tier | null {
  const idx = TIERS.findIndex((t) => gold >= t.min && gold <= t.max);
  return idx >= 0 && idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

// ─── Gold Coin icon ───────────────────────────────────────────────────────────

export function GoldCoin({ size = 14 }: { size?: number }) {
  return <Coins size={size} className="text-amber-600 dark:text-[#f5c542]" />;
}

// ─── Inline gold amount display ───────────────────────────────────────────────

export function GoldBadge({
  amount,
  size = "sm",
  className = "",
}: {
  amount: number;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizeMap = { xs: "text-[10px]", sm: "text-xs", md: "text-sm", lg: "text-base" };
  const iconSize = { xs: 10, sm: 12, md: 14, lg: 18 }[size];
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold tabular-nums text-amber-700 dark:text-[#f5c542] ${sizeMap[size]} ${className}`}
    >
      <GoldCoin size={iconSize} />
      {amount.toLocaleString()}
    </span>
  );
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

export function TierBadge({
  gold,
  showIcon = true,
  className = "",
}: {
  gold: number;
  showIcon?: boolean;
  className?: string;
}) {
  const tier = getTier(gold);
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${className}`}
      style={{
        color: tier.color,
        backgroundColor: `${tier.color}22`,
        border: `1px solid ${tier.color}44`,
      }}
    >
      {showIcon && tier.emoji} {tier.label}
    </span>
  );
}

// ─── Gold coin indicator on high-vote posts ───────────────────────────────────

export function PostGoldIndicator({ votes }: { votes: number }) {
  if (votes < 1000) return null;
  const count = votes >= 10000 ? 3 : votes >= 5000 ? 2 : 1;
  return (
    <span
      className="inline-flex items-center gap-px"
      title={`Gold awarded — ${votes.toLocaleString()} upvotes`}
    >
      {Array.from({ length: count }, (_, i) => (
        <Coins key={i} size={11} className="text-amber-600 dark:text-[#f5c542]" />
      ))}
    </span>
  );
}

// ─── Floating +X gold animation ──────────────────────────────────────────────

export function GoldPopup({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 1200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{ opacity: 0, y: -28, scale: 1.15 }}
      transition={{ duration: 1.1, ease: "easeOut" }}
      className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 font-bold text-xs z-50 select-none drop-shadow"
      style={{ color: "#f5c542" }}
    >
      <Coins size={11} style={{ color: "#f5c542" }} />
      +{amount}
    </motion.div>
  );
}

// ─── Gold Profile Panel (used inside the profile modal) ───────────────────────

export function GoldProfilePanel({
  gold,
  breakdown,
}: {
  /** Current balance (earned minus spent) */
  gold: number;
  breakdown: { posts: number; votes: number; communities: number; awards?: number; spent?: number };
}) {
  const earned = breakdown.posts + breakdown.votes + breakdown.communities + (breakdown.awards ?? 0);
  const tier = getTier(earned);
  const next = getNextTier(earned);
  const progress = next
    ? Math.min(100, ((earned - tier.min) / (next.min - tier.min)) * 100)
    : 100;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="rounded-xl p-4 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tier.color}18 0%, ${tier.color}06 100%)`,
          border: `1px solid ${tier.color}30`,
        }}
      >
        <div className="absolute -right-4 -top-4 opacity-10" style={{ color: tier.color }} aria-hidden="true">
          <Coins size={80} />
        </div>

        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">Gold balance</div>
            <div className="flex items-center gap-1.5">
              <GoldCoin size={22} />
              <span className="tabular-nums text-amber-700 dark:text-[#f5c542]" style={{ fontSize: "1.75rem", fontWeight: 800, lineHeight: 1 }}>
                {gold.toLocaleString()}
              </span>
            </div>
          </div>
          <TierBadge gold={earned} />
        </div>

        {next && (
          <div>
            <div className="flex justify-between text-[11px] text-muted-foreground mb-1.5">
              <span>{tier.emoji} {tier.label}</span>
              <span>{next.emoji} {next.label} at {next.min.toLocaleString()} earned</span>
            </div>
            <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                className="h-full rounded-full"
                style={{ backgroundColor: tier.color }}
              />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {(next.min - earned).toLocaleString()} more gold earned to reach {next.label}. Spending gold doesn't lower your tier.
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "From posts", value: breakdown.posts, icon: "📝" },
          { label: "From upvotes", value: breakdown.votes, icon: "⬆️" },
          { label: "From awards", value: breakdown.awards ?? 0, icon: "🏅" },
          { label: "Founding", value: breakdown.communities, icon: "🏘️" },
        ].map(({ label, value, icon }) => (
          <div key={label} className="bg-muted/60 rounded-lg p-2.5 text-center">
            <div className="text-base mb-0.5" aria-hidden="true">{icon}</div>
            <GoldBadge amount={value} size="xs" />
            <div className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</div>
          </div>
        ))}
      </div>
      {(breakdown.spent ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">Spent on awards and flair: {(breakdown.spent ?? 0).toLocaleString()} gold</p>
      )}
    </div>
  );
}
