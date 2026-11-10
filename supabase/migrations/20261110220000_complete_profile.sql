-- "Continue with Google": finish the profile once.
-- A Google sign-up has no handle in its user metadata, so private.handle_new_user() gives it the placeholder
-- 'user_' || first 10 hex digits of its id (and an accounts row). Users cannot update profiles.handle or
-- accounts.trial_started_at themselves (no grants), so this SECURITY DEFINER function does exactly one thing:
-- while the caller still has their placeholder handle (or no profile at all), set the chosen handle, groups,
-- locale and case profiles, and start the 3-day trial now. Afterwards it refuses ('cc:already').
-- Called by the server as POST /rest/v1/rpc/complete_profile with the user's own JWT.

create function public.complete_profile(p_handle text, p_locale text default 'en', p_spaces text[] default '{}',
                                        p_case_profiles jsonb default '[]'::jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  placeholder text;
  current_handle text;
  reserved text[] := array['uscis','dhs','ice','cbp','official','admin','moderator','notario','casecircle',
    'support','deleted','apple','google'];
  picked text[];
  cases jsonb := case when jsonb_typeof(p_case_profiles) = 'array' then p_case_profiles else '[]'::jsonb end;
begin
  if uid is null then raise exception 'cc:auth' using errcode = 'P0001'; end if;
  placeholder := 'user_' || substr(replace(uid::text, '-', ''), 1, 10);
  select handle into current_handle from public.profiles where id = uid;
  if current_handle is not null and current_handle <> placeholder then
    raise exception 'cc:already' using errcode = 'P0001';
  end if;
  if p_handle is null or p_handle !~ '^[A-Za-z0-9_]{3,20}$' or p_handle ~* '^user_[0-9a-f]{10}$' then
    raise exception 'cc:invalid' using errcode = 'P0001';
  end if;
  if lower(p_handle) = any(reserved)
     or exists (select 1 from unnest(string_to_array(lower(p_handle), '_')) p where p = any(reserved)) then
    raise exception 'cc:reserved' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct s), '{}') into picked from (
    select s from unnest(coalesce(p_spaces, '{}')) as s where s ~ '^[a-z0-9][a-z0-9-]{1,23}$' limit 12) q;
  if cardinality(picked) = 0 then picked := array['i-485']; end if;
  begin
    if current_handle is null then
      insert into public.profiles (id, handle) values (uid, p_handle);
      insert into public.accounts (user_id, locale, spaces, case_profiles, trial_started_at)
        values (uid, case when p_locale = 'es' then 'es' else 'en' end, picked, cases, now());
    else
      update public.profiles set handle = p_handle where id = uid;
      update public.accounts
        set locale = case when p_locale = 'es' then 'es' else 'en' end, spaces = picked,
            case_profiles = case when jsonb_array_length(cases) > 0 then cases else case_profiles end,
            trial_started_at = now()
        where user_id = uid;
    end if;
  exception when unique_violation then
    raise exception 'cc:taken' using errcode = 'P0001';
  end;
end $$;

revoke all on function public.complete_profile(text, text, text[], jsonb) from public, anon;
grant execute on function public.complete_profile(text, text, text[], jsonb) to authenticated;
