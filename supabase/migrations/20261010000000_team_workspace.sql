-- Teknodoz HMAP · team workspace foundation
-- Teams share places (candidates / businesses) and saved routes. Access is enforced by RLS.

create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.team_members (
  team_id     uuid not null references public.teams(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

create table public.places (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  kind        text not null default 'talent' check (kind in ('talent', 'business')),
  name        text not null default '' check (char_length(name) <= 200),
  role        text not null default '' check (char_length(role) <= 200),
  skills      text[] not null default '{}' check (cardinality(skills) <= 50),
  sector      text not null default '' check (char_length(sector) <= 120),
  status      text not null default 'radar' check (status in ('radar', 'contacted', 'interview', 'closed')),
  contact     text not null default '' check (char_length(contact) <= 300),
  address     text not null default '' check (char_length(address) <= 400),
  notes       text not null default '' check (char_length(notes) <= 4000),
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index places_team_idx on public.places (team_id);
create index places_team_status_idx on public.places (team_id, status);

create table public.routes (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references public.teams(id) on delete cascade,
  name        text not null default 'Saha Güzergahı' check (char_length(name) <= 160),
  place_ids   uuid[] not null default '{}' check (cardinality(place_ids) <= 500),  -- visiting order
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
create index routes_team_idx on public.routes (team_id);

-- keep updated_at fresh
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
create trigger routes_touch before update on public.routes for each row execute function public.touch_updated_at();

-- Membership helpers. SECURITY DEFINER avoids infinite RLS recursion on team_members.
create function public.is_team_member(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members m where m.team_id = t and m.user_id = (select auth.uid()))
$$;

create function public.can_edit_team(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t and m.user_id = (select auth.uid()) and m.role in ('owner', 'editor')
  )
$$;

create function public.is_team_owner(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = t and m.user_id = (select auth.uid()) and m.role = 'owner'
  )
$$;

revoke all on function public.is_team_member(uuid), public.can_edit_team(uuid), public.is_team_owner(uuid) from public, anon;
grant execute on function public.is_team_member(uuid), public.can_edit_team(uuid), public.is_team_owner(uuid) to authenticated;

-- creator becomes owner automatically
create function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_members (team_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end $$;
revoke all on function public.add_owner_member() from public, anon, authenticated;

create trigger teams_add_owner after insert on public.teams for each row execute function public.add_owner_member();

alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.places       enable row level security;
alter table public.routes       enable row level security;

-- teams
-- owner_id check: INSERT ... RETURNING is evaluated against this policy before the membership trigger has run
create policy teams_select on public.teams for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_team_member(id));
create policy teams_insert on public.teams for insert to authenticated with check (owner_id = (select auth.uid()));
create policy teams_update on public.teams for update to authenticated
  using (public.is_team_owner(id)) with check (public.is_team_owner(id));
create policy teams_delete on public.teams for delete to authenticated using (public.is_team_owner(id));

-- team_members: members see their team; only owners manage membership (owner row is created by trigger)
create policy members_select on public.team_members for select to authenticated using (public.is_team_member(team_id));
create policy members_insert on public.team_members for insert to authenticated with check (public.is_team_owner(team_id));
create policy members_update on public.team_members for update to authenticated
  using (public.is_team_owner(team_id)) with check (public.is_team_owner(team_id));
create policy members_delete on public.team_members for delete to authenticated
  using (public.is_team_owner(team_id) or user_id = (select auth.uid()));

-- places / routes: members read, editors+owners write
create policy places_select on public.places for select to authenticated using (public.is_team_member(team_id));
create policy places_insert on public.places for insert to authenticated with check (public.can_edit_team(team_id));
create policy places_update on public.places for update to authenticated
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));
create policy places_delete on public.places for delete to authenticated using (public.can_edit_team(team_id));

create policy routes_select on public.routes for select to authenticated using (public.is_team_member(team_id));
create policy routes_insert on public.routes for insert to authenticated with check (public.can_edit_team(team_id));
create policy routes_update on public.routes for update to authenticated
  using (public.can_edit_team(team_id)) with check (public.can_edit_team(team_id));
create policy routes_delete on public.routes for delete to authenticated using (public.can_edit_team(team_id));
