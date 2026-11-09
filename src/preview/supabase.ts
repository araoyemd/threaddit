// ─── Preview stand-in for utils/supabase/client ───────────────────────────────
// Implements only the auth calls the app uses: getSession, onAuthStateChange,
// signInWithPassword and signOut. Accounts live in this browser.

import { read, write, remove, users, publicUser, delay } from "./store";

type Session = { access_token: string; user: ReturnType<typeof publicUser> };
type Listener = (event: string, session: Session | null) => void;

const listeners = new Set<Listener>();

function currentSession(): Session | null {
  const id = read<string | null>("session", null);
  if (!id) return null;
  const u = Object.values(users()).find(x => x.id === id);
  return u ? { access_token: `preview-${u.id}`, user: publicUser(u) } : null;
}

function emit(event: string) {
  const s = currentSession();
  listeners.forEach(l => l(event, s));
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: currentSession() }, error: null };
    },

    onAuthStateChange(cb: Listener) {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    },

    async signInWithPassword({ email, password }: { email: string; password: string }) {
      await delay();
      const u = users()[email.trim().toLowerCase()];
      if (!u || u.password !== password) {
        return { data: { user: null, session: null }, error: { message: "Wrong email or password. Check both and try again, or sign up." } };
      }
      write("session", u.id);
      const session = currentSession()!;
      emit("SIGNED_IN");
      return { data: { user: session.user, session }, error: null };
    },

    // The preview can't send email, so a reset acts as if the link was clicked
    // straight away: it signs the person in and asks for a new password.
    async resetPasswordForEmail(email: string, _opts?: { redirectTo?: string }) {
      await delay();
      const u = users()[email.trim().toLowerCase()];
      if (u) {
        write("session", u.id);
        setTimeout(() => emit("PASSWORD_RECOVERY"), 400);
      }
      return { data: {}, error: null };
    },

    async updateUser({ password }: { password?: string }) {
      await delay();
      const id = read<string | null>("session", null);
      const all = users();
      const entry = Object.entries(all).find(([, u]) => u.id === id);
      if (!entry) return { data: { user: null }, error: { message: "Your reset link has expired. Request a new one." } };
      if (password) {
        if (password.length < 8) return { data: { user: null }, error: { message: "Use a password of at least 8 characters." } };
        all[entry[0]] = { ...entry[1], password };
        write("users", all);
      }
      emit("USER_UPDATED");
      return { data: { user: publicUser(entry[1]) }, error: null };
    },

    async signOut() {
      remove("session");
      emit("SIGNED_OUT");
      return { error: null };
    },
  },
};
