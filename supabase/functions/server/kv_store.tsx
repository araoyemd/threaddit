// ─── Key-value storage ────────────────────────────────────────────────────────
// All forum data lives in one Postgres table, kv_store_8937b06c (key text, value
// jsonb), created by Figma Make. This file replaces Make's generated helper with
// the same API, so the server can be deployed from GitHub with the Supabase CLI.
//
// Difference from Make's version: getByPrefix pages through results, so lists
// aren't silently cut off at Supabase's 1,000-row response limit.

import { createClient } from "npm:@supabase/supabase-js";

const TABLE = "kv_store_8937b06c";
const PAGE = 1000;

const client = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const set = async (key: string, value: any): Promise<void> => {
  const { error } = await client().from(TABLE).upsert({ key, value });
  if (error) throw new Error(error.message);
};

export const get = async (key: string): Promise<any> => {
  const { data, error } = await client().from(TABLE).select("value").eq("key", key).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.value;
};

export const del = async (key: string): Promise<void> => {
  const { error } = await client().from(TABLE).delete().eq("key", key);
  if (error) throw new Error(error.message);
};

export const mset = async (keys: string[], values: any[]): Promise<void> => {
  const { error } = await client().from(TABLE).upsert(keys.map((k, i) => ({ key: k, value: values[i] })));
  if (error) throw new Error(error.message);
};

export const mget = async (keys: string[]): Promise<any[]> => {
  const { data, error } = await client().from(TABLE).select("key, value").in("key", keys);
  if (error) throw new Error(error.message);
  const byKey = new Map((data ?? []).map((d: any) => [d.key, d.value]));
  return keys.map(k => byKey.get(k));
};

export const mdel = async (keys: string[]): Promise<void> => {
  const { error } = await client().from(TABLE).delete().in("key", keys);
  if (error) throw new Error(error.message);
};

/** Values of every key starting with `prefix`, in key order. */
export const getByPrefix = async (prefix: string): Promise<any[]> => {
  const db = client();
  // Escape LIKE wildcards so a prefix containing % or _ matches literally
  const pattern = prefix.replace(/[\\%_]/g, m => `\\${m}`) + "%";
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(TABLE).select("key, value").like("key", pattern)
      .order("key").range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) out.push(d.value);
    if (!data || data.length < PAGE) break;
  }
  return out;
};
