-- The single table that holds all Threadit data (created originally by Figma Make).
-- Safe to run on the existing project: it does nothing if the table already exists.
create table if not exists public.kv_store_8937b06c (
  key text not null primary key,
  value jsonb not null
);

-- Only the server (service role) reads or writes it; the browser never queries it directly.
alter table public.kv_store_8937b06c enable row level security;
