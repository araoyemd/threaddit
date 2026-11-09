import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Post, Gold, Community } from "../types";
import type { T, Lang } from "../i18n";

// Everything most components need, so it doesn't have to be passed down by hand.
export interface AppCtx {
  t: T;
  lang: Lang;
  token: string | null;
  username: string | null;
  isSignedIn: boolean;
  /** Opens sign-in; optional message is shown as a toast first */
  requireAuth: (message?: string) => void;
  dataSaver: boolean;
  gold: Gold;
  refreshGold: () => void;
  /** Communities this user moderates ("*" = all) */
  moderates: string[];
  openPost: (p: Post) => void;
  openCommunity: (name: string) => void;
  sharePost: (p: Post) => void;
  findCommunity: (name: string) => Community;
  /** Real links for crawlers and "open in new tab"; clicks are handled in-app */
  hrefForPost: (p: Post) => string;
  hrefForCommunity: (name: string) => string;
  hrefForUser: (username: string) => string;
  openUser: (username: string) => void;
  /** Signed-in user's id, to show Edit/Delete on their own content */
  userId: string | null;
  isBlocked: (username: string) => boolean;
  toggleBlock: (username: string) => void;
  editPost: (p: Post) => void;
  deletePost: (p: Post) => Promise<void>;
}

export const AppContext = createContext<AppCtx | null>(null);

export function AppProvider({ value, children }: { value: AppCtx; children: ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}

export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
