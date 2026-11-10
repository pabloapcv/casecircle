-- Let PostgREST embed the public profile (handle, reputation) when the server reads your account row.
alter table public.accounts add constraint accounts_profile_fk
  foreign key (user_id) references public.profiles(id) on delete cascade;
