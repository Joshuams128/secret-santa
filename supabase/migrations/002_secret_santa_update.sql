create or replace function public.ss_update(p_code text, p_name text, p_wishlist text, p_notes text, p_date text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if (select drawn from ss_settings where id = 1 for share) then raise exception 'DRAWN'; end if;
  update ss_participants set name = p_name, wishlist = p_wishlist, notes = p_notes, date = p_date where code = p_code;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;

revoke all on function public.ss_update(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.ss_update(text,text,text,text,text) to service_role;
