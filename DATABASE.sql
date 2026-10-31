-- Run the whole file in the Supabase SQL Editor (nothing selected). Safe to re-run.
-- Each invitation (family) gets a private code / link, is invited to some of
-- the 3 events, and may bring up to max_guests people to each event.
-- Tables are not readable or writable through the API; guests can only call
-- the two validated functions near the bottom.
begin;

-- Remove the earlier name-lookup functions (tables are left untouched).
drop function if exists public.find_rsvp_party(text);
drop function if exists public.submit_rsvp(uuid, jsonb, text, text);

create table if not exists public.events (
  id smallint primary key,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  event_date date,
  venue text check (venue is null or char_length(venue) <= 300),
  details text check (details is null or char_length(details) <= 1000)
);

insert into public.events (id, name) values (1, 'Day 1'), (2, 'Day 2'), (3, 'Day 3')
on conflict (id) do nothing;

-- 10 characters from an alphabet without look-alikes (no 0/O, 1/I/L): ~50 bits of randomness.
create or replace function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  -- Bytes 6 and 8 of a v4 UUID contain fixed version/variant bits, so skip them.
  select string_agg(
           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', (get_byte(b, i) % 31) + 1, 1), ''
           order by i
         )
    from (select uuid_send(gen_random_uuid()) as b) r,
         unnest(array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11]) as i;
$$;

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default public.generate_invite_code()
    check (code ~ '^[A-Z0-9]{6,20}$'),
  family_name text not null check (char_length(btrim(family_name)) between 1 and 200),
  max_guests integer not null check (max_guests between 1 and 50),
  message text check (message is null or char_length(message) <= 2000),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.invitation_events (
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  event_id smallint not null references public.events (id) on delete cascade,
  attending_count integer check (attending_count between 0 and 50),
  primary key (invitation_id, event_id)
);

alter table public.events enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_events enable row level security;
revoke all on table public.events, public.invitations, public.invitation_events
  from anon, authenticated;
revoke all on function public.generate_invite_code() from public, anon, authenticated;

-- Admin helper (SQL Editor only): creates an invitation and returns its code.
create or replace function public.add_invitation(
  p_family_name text,
  p_max_guests integer,
  p_event_ids smallint[]
)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  new_id uuid;
  new_code text;
begin
  if p_event_ids is null or cardinality(p_event_ids) = 0 then
    raise exception 'Invite % to at least one event, e.g. array[1,2,3].', p_family_name;
  end if;
  if exists (select unnest(p_event_ids) except select id from public.events) then
    raise exception 'Unknown event id in % for %. Valid ids are in the events table.', p_event_ids, p_family_name;
  end if;

  insert into public.invitations (family_name, max_guests)
  values (btrim(p_family_name), p_max_guests)
  returning id, code into new_id, new_code;

  insert into public.invitation_events (invitation_id, event_id)
  select new_id, e from (select distinct unnest(p_event_ids) as e) d;

  return new_code;
end;
$$;
revoke all on function public.add_invitation(text, integer, smallint[]) from public, anon, authenticated;

-- Guest: load an invitation by its code.
create or replace function public.get_invitation(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  clean_code text := upper(btrim(coalesce(p_code, '')));
  inv public.invitations;
begin
  if clean_code !~ '^[A-Z0-9]{6,20}$' then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into inv from public.invitations i where i.code = clean_code;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'found',
    'invitation', jsonb_build_object(
      'familyName', inv.family_name,
      'maxGuests', inv.max_guests,
      'message', inv.message,
      'submittedAt', inv.submitted_at,
      'events', coalesce((
        select jsonb_agg(
                 jsonb_build_object(
                   'id', e.id,
                   'name', e.name,
                   'date', e.event_date,
                   'venue', e.venue,
                   'details', e.details,
                   'attendingCount', ie.attending_count
                 )
                 order by e.event_date nulls last, e.id
               )
          from public.invitation_events ie
          join public.events e on e.id = ie.event_id
         where ie.invitation_id = inv.id
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- Guest: save how many people attend each invited event (every event must be answered).
create or replace function public.submit_invitation_rsvp(
  p_code text,
  p_responses jsonb,
  p_message text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_code text := upper(btrim(coalesce(p_code, '')));
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
  inv public.invitations;
  expected_count integer;
  provided_count integer;
  distinct_count integer;
  matched_count integer;
begin
  if clean_code !~ '^[A-Z0-9]{6,20}$' then
    return jsonb_build_object('status', 'not_found');
  end if;

  if p_responses is null
     or jsonb_typeof(p_responses) <> 'array'
     or jsonb_array_length(p_responses) not between 1 and 20
     or char_length(coalesce(clean_message, '')) > 2000 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into inv from public.invitations i where i.code = clean_code for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_responses) r
     where jsonb_typeof(r) <> 'object'
        or jsonb_typeof(r -> 'eventId') is distinct from 'number'
        or jsonb_typeof(r -> 'attendingCount') is distinct from 'number'
        or (r ->> 'eventId') !~ '^[0-9]{1,4}$'
        or (r ->> 'attendingCount') !~ '^[0-9]{1,2}$'
        or (r ->> 'attendingCount')::integer > inv.max_guests
  ) then
    return jsonb_build_object('status', 'invalid');
  end if;

  select count(*) into expected_count
    from public.invitation_events ie where ie.invitation_id = inv.id;

  select count(*), count(distinct (r ->> 'eventId')::integer), count(ie.event_id)
    into provided_count, distinct_count, matched_count
    from jsonb_array_elements(p_responses) r
    left join public.invitation_events ie
      on ie.invitation_id = inv.id and ie.event_id = (r ->> 'eventId')::integer;

  if provided_count <> expected_count
     or distinct_count <> expected_count
     or matched_count <> expected_count then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.invitation_events ie
     set attending_count = (r ->> 'attendingCount')::integer
    from jsonb_array_elements(p_responses) r
   where ie.invitation_id = inv.id
     and ie.event_id = (r ->> 'eventId')::integer;

  update public.invitations i
     set message = clean_message,
         submitted_at = now()
   where i.id = inv.id;

  return jsonb_build_object('status', 'saved');
end;
$$;

revoke all on function public.get_invitation(text) from public, anon, authenticated;
revoke all on function public.submit_invitation_rsvp(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
grant execute on function public.submit_invitation_rsvp(text, jsonb, text) to anon, authenticated;

commit;
