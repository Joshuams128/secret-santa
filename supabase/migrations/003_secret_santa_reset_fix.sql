-- Supabase's API blocks DELETE without a WHERE clause ("DELETE requires a WHERE clause"),
-- which made "Reset everything" fail with a server error. Already applied to the project.
create or replace function public.ss_reset()
returns void language sql security invoker set search_path = public as $$
  delete from ss_participants where true;
  update ss_settings set drawn = false where id = 1;
$$;
