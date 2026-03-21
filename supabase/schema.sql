create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  image_url text,
  category text not null default 'その他',
  source text not null default 'manual' check (source in ('manual', 'ai')),
  is_pending boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists knowledge_category_idx on public.knowledge (category);
create index if not exists knowledge_pending_idx on public.knowledge (is_pending, updated_at desc);
create index if not exists knowledge_created_idx on public.knowledge (created_at desc);
create index if not exists knowledge_updated_idx on public.knowledge (updated_at desc);

drop trigger if exists set_knowledge_updated_at on public.knowledge;
create trigger set_knowledge_updated_at
before update on public.knowledge
for each row
execute function public.set_updated_at();

alter table public.knowledge enable row level security;

drop policy if exists "open access knowledge" on public.knowledge;
create policy "open access knowledge"
on public.knowledge
for all
to anon, authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('knowledge-images', 'knowledge-images', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "knowledge images public read" on storage.objects;
create policy "knowledge images public read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'knowledge-images');

drop policy if exists "knowledge images public insert" on storage.objects;
create policy "knowledge images public insert"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'knowledge-images');

drop policy if exists "knowledge images public update" on storage.objects;
create policy "knowledge images public update"
on storage.objects
for update
to anon, authenticated
using (bucket_id = 'knowledge-images')
with check (bucket_id = 'knowledge-images');

drop policy if exists "knowledge images public delete" on storage.objects;
create policy "knowledge images public delete"
on storage.objects
for delete
to anon, authenticated
using (bucket_id = 'knowledge-images');
