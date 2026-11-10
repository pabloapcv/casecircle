-- Case twins: opt-in matching on form + USCIS office + filing month (never the day, never a receipt/A-number).
-- Each opted-in user owns their rows (RLS); nobody can read anyone else's rows. Other people only ever come back
-- through public.my_case_twins(), a SECURITY DEFINER function that returns, for the caller's own cohorts only,
-- a rough count of the others (0 when fewer than 2, so a single other person is never revealed) and up to 9
-- public handles. Turning it off deletes the row, so the person drops out of matching immediately.

create table public.twin_optins (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  form text not null check (form ~ '^[A-Z]{1,3}-[0-9]{2,4}[A-Z]?$'),
  office_id text not null check (office_id ~ '^[a-z0-9][a-z0-9-]{1,23}$' and office_id <> 'unsure'),
  filed_month date not null check (filed_month = date_trunc('month', filed_month)::date and filed_month >= date '2000-01-01'),
  created_at timestamptz not null default now(),
  primary key (user_id, form)
);
create index twin_optins_cohort_idx on public.twin_optins (form, office_id, filed_month);

-- No future months, at most 6 cohorts per person; created_at is always the server's.
create function private.twin_optins_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.filed_month > date_trunc('month', now())::date then
    raise exception 'cc:invalid' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    if (select count(*) from public.twin_optins where user_id = new.user_id) >= 6 then
      raise exception 'cc:rate' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger twin_optins_check before insert or update on public.twin_optins
  for each row execute function private.twin_optins_check();
revoke all on function private.twin_optins_check() from public, anon, authenticated;

revoke all on public.twin_optins from anon, authenticated;
alter table public.twin_optins enable row level security;
grant select, delete on public.twin_optins to authenticated;
grant insert (form, office_id, filed_month) on public.twin_optins to authenticated;
grant update (form, office_id, filed_month) on public.twin_optins to authenticated;
create policy "read own twin opt-ins" on public.twin_optins for select to authenticated
  using (user_id = (select auth.uid()));
create policy "opt in yourself" on public.twin_optins for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "change own opt-ins" on public.twin_optins for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "opt out yourself" on public.twin_optins for delete to authenticated
  using (user_id = (select auth.uid()));

-- The caller's cohorts with aggregates only: others (0 if < 2; exact 2–9; then 10, 20, 30, 40; 50 = "50+"),
-- plus = true when the real number is higher than shown, and up to 9 handles (only when others >= 2).
-- Placeholder handles of unfinished Google sign-ups are skipped.
create function public.my_case_twins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  result jsonb;
begin
  if uid is null then raise exception 'cc:auth' using errcode = 'P0001'; end if;
  select coalesce(jsonb_agg(row_ order by row_ ->> 'form'), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'form', m.form,
      'office_id', m.office_id,
      'filed_month', to_char(m.filed_month, 'YYYY-MM'),
      'others', case when t.n < 2 then 0 when t.n < 10 then t.n when t.n < 50 then (t.n / 10) * 10 else 50 end,
      'plus', t.n >= 10 and t.n % 10 <> 0 or t.n > 50,
      'handles', case when t.n >= 2 then t.handles else '[]'::jsonb end
    ) as row_
    from public.twin_optins m
    cross join lateral (
      select count(*)::int as n,
             coalesce(jsonb_agg(h.handle order by h.created_at desc) filter (where h.rn <= 9), '[]'::jsonb) as handles
      from (
        select p.handle, o.created_at, row_number() over (order by o.created_at desc) as rn
        from public.twin_optins o
        join public.profiles p on p.id = o.user_id
        where o.form = m.form and o.office_id = m.office_id and o.filed_month = m.filed_month
          and o.user_id <> uid
          and p.handle !~ '^user_[0-9a-f]{10}$'
      ) h
    ) t
    where m.user_id = uid
  ) cohorts;
  return result;
end $$;
revoke all on function public.my_case_twins() from public, anon;
grant execute on function public.my_case_twins() to authenticated;
