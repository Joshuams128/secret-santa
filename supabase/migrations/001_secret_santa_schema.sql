-- Already applied to the `secret-santa` Supabase project. Kept for reference / re-creation.
create table public.ss_settings (
  id int primary key default 1 check (id = 1),
  notes text not null default 'Budget: TBD — the organizer will update this.',
  drawn boolean not null default false
);
insert into public.ss_settings (id) values (1);

create table public.ss_participants (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  wishlist text not null,
  notes text not null default '',
  date text not null,
  give_to uuid references public.ss_participants(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index ss_participants_name_key on public.ss_participants (lower(name));

alter table public.ss_settings enable row level security;
alter table public.ss_participants enable row level security;
revoke all on public.ss_settings, public.ss_participants from anon, authenticated;

create or replace function public.ss_join(p_name text, p_wishlist text, p_notes text, p_date text, p_code text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if (select drawn from ss_settings where id = 1 for share) then raise exception 'DRAWN'; end if;
  insert into ss_participants (name, wishlist, notes, date, code) values (p_name, p_wishlist, p_notes, p_date, p_code);
end $$;

create or replace function public.ss_draw()
returns void language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  perform 1 from ss_settings where id = 1 for update;
  if (select drawn from ss_settings where id = 1) then raise exception 'DRAWN'; end if;
  select count(*) into n from ss_participants;
  if n < 3 then raise exception 'TOO_FEW'; end if;
  with o as materialized (select id, row_number() over (order by random()) rn from ss_participants)
  update ss_participants p set give_to = t.id
  from o s join o t on t.rn = (s.rn % n) + 1 where p.id = s.id;
  update ss_settings set drawn = true where id = 1;
end $$;

create or replace function public.ss_reset()
returns void language sql security invoker set search_path = public as $$
  delete from ss_participants;
  update ss_settings set drawn = false where id = 1;
$$;

revoke all on function public.ss_join(text,text,text,text,text), public.ss_draw(), public.ss_reset() from public, anon, authenticated;
grant execute on function public.ss_join(text,text,text,text,text), public.ss_draw(), public.ss_reset() to service_role;
grant select, insert, update, delete on public.ss_settings, public.ss_participants to service_role;
