-- Late joiner support (already applied to the project).
-- After the draw the organizer can open the door for ONE more player. They are spliced into the circle:
-- A -> B becomes A -> N -> B. Only A's match changes (flagged with rematched=true so they get a heads-up).
alter table public.ss_settings add column late_open boolean not null default false;
alter table public.ss_participants add column rematched boolean not null default false;

create or replace function public.ss_join(p_name text, p_wishlist text, p_notes text, p_date text, p_code text)
returns void language plpgsql security invoker set search_path = public as $$
declare d boolean; l boolean; nid uuid; a uuid; b uuid;
begin
  select drawn, late_open into d, l from ss_settings where id = 1 for update;
  if d and not l then raise exception 'DRAWN'; end if;

  insert into ss_participants (name, wishlist, notes, date, code)
  values (p_name, p_wishlist, p_notes, p_date, p_code) returning id into nid;

  if d then
    select id, give_to into a, b from ss_participants
      where id <> nid and give_to is not null order by random() limit 1;
    if a is null then raise exception 'NO_CIRCLE'; end if;
    update ss_participants set give_to = nid, rematched = true where id = a;
    update ss_participants set give_to = b where id = nid;
    update ss_settings set late_open = false where id = 1;
  end if;
end $$;

create or replace function public.ss_set_late(p_open boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_open and not (select drawn from ss_settings where id = 1) then raise exception 'NOT_DRAWN'; end if;
  update ss_settings set late_open = p_open where id = 1;
end $$;

create or replace function public.ss_reset()
returns void language sql security invoker set search_path = public as $$
  delete from ss_participants where true;
  update ss_settings set drawn = false, late_open = false where id = 1;
$$;

revoke all on function public.ss_set_late(boolean) from public, anon, authenticated;
grant execute on function public.ss_set_late(boolean) to service_role;

-- ---- 006 (applied as migration 'secret_santa_protect_bought'): protect people who already bought a gift ----
alter table public.ss_participants add column keep_match boolean not null default false;

create or replace function public.ss_set_keep(p_names text[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  update ss_participants set keep_match = lower(name) = any (select lower(x) from unnest(p_names) x);
  if (select late_open from ss_settings where id = 1)
     and not exists (select 1 from ss_participants where not keep_match) then
    raise exception 'NO_ELIGIBLE';
  end if;
end $$;

create or replace function public.ss_set_late(p_open boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_open and not (select drawn from ss_settings where id = 1) then raise exception 'NOT_DRAWN'; end if;
  if p_open and not exists (select 1 from ss_participants where not keep_match) then raise exception 'NO_ELIGIBLE'; end if;
  update ss_settings set late_open = p_open where id = 1;
end $$;

create or replace function public.ss_join(p_name text, p_wishlist text, p_notes text, p_date text, p_code text)
returns void language plpgsql security invoker set search_path = public as $$
declare d boolean; l boolean; nid uuid; a uuid; b uuid;
begin
  select drawn, late_open into d, l from ss_settings where id = 1 for update;
  if d and not l then raise exception 'DRAWN'; end if;
  insert into ss_participants (name, wishlist, notes, date, code)
  values (p_name, p_wishlist, p_notes, p_date, p_code) returning id into nid;
  if d then
    select id, give_to into a, b from ss_participants
      where id <> nid and give_to is not null and not keep_match order by random() limit 1;
    if a is null then raise exception 'NO_ELIGIBLE'; end if;
    update ss_participants set give_to = nid, rematched = true where id = a;
    update ss_participants set give_to = b where id = nid;
    update ss_settings set late_open = false where id = 1;
  end if;
end $$;

revoke all on function public.ss_set_keep(text[]) from public, anon, authenticated;
grant execute on function public.ss_set_keep(text[]) to service_role;
