-- After the draw, players may still edit their wish list and notes (name, date and matches stay locked).
-- Already applied to the project.
create or replace function public.ss_update(p_code text, p_name text, p_wishlist text, p_notes text, p_date text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if (select drawn from ss_settings where id = 1 for share) then
    update ss_participants set wishlist = p_wishlist, notes = p_notes where code = p_code;
  else
    update ss_participants set name = p_name, wishlist = p_wishlist, notes = p_notes, date = p_date where code = p_code;
  end if;
  if not found then raise exception 'NOT_FOUND'; end if;
end $$;
