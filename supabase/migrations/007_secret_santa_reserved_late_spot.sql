-- Reserved late-signup spot (already applied to the project).
-- ss_reserve_late('Giver', 'Newcomer') opens the late door for ONE named newcomer, who is slotted in
-- right after the named giver (Giver -> Newcomer -> Giver's old match). Others get 'RESERVED'.
alter table public.ss_settings add column late_after uuid references public.ss_participants(id) on delete set null;
alter table public.ss_settings add column late_name text;

create or replace function public.ss_reserve_late(p_giver text, p_newcomer text)
returns void language plpgsql security invoker set search_path = public as $$
declare g uuid;
begin
  if not (select drawn from ss_settings where id = 1) then raise exception 'NOT_DRAWN'; end if;
  select id into g from ss_participants where lower(name) = lower(trim(p_giver));
  if g is null then raise exception 'GIVER_NOT_FOUND'; end if;
  if trim(coalesce(p_newcomer, '')) = '' then raise exception 'NEWCOMER_REQUIRED'; end if;
  update ss_settings set late_open = true, late_after = g, late_name = trim(p_newcomer) where id = 1;
end $$;

create or replace function public.ss_set_late(p_open boolean)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_open and not (select drawn from ss_settings where id = 1) then raise exception 'NOT_DRAWN'; end if;
  if p_open and not exists (select 1 from ss_participants where not keep_match) then raise exception 'NO_ELIGIBLE'; end if;
  update ss_settings set late_open = p_open, late_after = null, late_name = null where id = 1;
end $$;

create or replace function public.ss_join(p_name text, p_wishlist text, p_notes text, p_date text, p_code text)
returns void language plpgsql security invoker set search_path = public as $$
declare d boolean; l boolean; r_name text; r_after uuid; nid uuid; a uuid; b uuid;
begin
  select drawn, late_open, late_name, late_after into d, l, r_name, r_after from ss_settings where id = 1 for update;
  if d and not l then raise exception 'DRAWN'; end if;
  if d and r_name is not null and lower(trim(p_name)) not like lower(r_name) || '%' then raise exception 'RESERVED'; end if;
  insert into ss_participants (name, wishlist, notes, date, code)
  values (p_name, p_wishlist, p_notes, p_date, p_code) returning id into nid;
  if d then
    if r_after is not null then
      select id, give_to into a, b from ss_participants where id = r_after and give_to is not null;
    else
      select id, give_to into a, b from ss_participants
        where id <> nid and give_to is not null and not keep_match order by random() limit 1;
    end if;
    if a is null then raise exception 'NO_ELIGIBLE'; end if;
    update ss_participants set give_to = nid, rematched = true where id = a;
    update ss_participants set give_to = b where id = nid;
    update ss_settings set late_open = false, late_after = null, late_name = null where id = 1;
  end if;
end $$;

create or replace function public.ss_reset()
returns void language sql security invoker set search_path = public as $$
  delete from ss_participants where true;
  update ss_settings set drawn = false, late_open = false, late_after = null, late_name = null where id = 1;
$$;

revoke all on function public.ss_reserve_late(text, text) from public, anon, authenticated;
grant execute on function public.ss_reserve_late(text, text) to service_role;
