-- Booking requests from the website booking flow.
-- Safe to run more than once. Additive only: it does not touch existing tables.

create table if not exists public.booking_requests (
  booking_id        uuid primary key default gen_random_uuid(),
  reference         text not null unique,                 -- e.g. MID-7K3Q9P, shown to the client
  status            text not null default 'new'
                    check (status in ('new', 'contacted', 'call_scheduled', 'confirmed', 'declined', 'cancelled')),

  -- What they chose (server-validated)
  category          text not null check (category in ('wedding', 'multi_event_wedding', 'small_event')),
  package_id        text not null,
  package_name      text not null,
  extra_hours       integer not null default 0 check (extra_hours between 0 and 24),
  addons            text[] not null default '{}',
  quote             jsonb not null,                       -- line items exactly as calculated by the server
  quoted_total      numeric(10,2) not null check (quoted_total >= 0),
  catalog_version   text not null,

  -- Event
  event_type        text,
  event_date        date not null,
  event_end_date    date,
  start_time        time,
  venue             text,
  city              text,
  is_outdoor        boolean not null default false,
  guest_count       integer check (guest_count is null or guest_count between 0 and 5000),
  message           text,

  -- Contact
  full_name         text not null,
  email             text not null,
  phone             text,
  preferred_contact text check (preferred_contact in ('email', 'phone', 'text')),
  referral_source   text,

  -- Consultation call (Calendly)
  call_event_uri    text,                                 -- Calendly scheduled event URI
  call_invitee_uri  text,
  call_booked_at    timestamptz,                          -- when the client picked a call slot
  call_start_at     timestamptz,                          -- call start time (filled when CALENDLY_API_TOKEN is set)

  -- Admin
  admin_notes       text,
  client_id         bigint references public.clients(client_id) on delete set null,
  manage_token_hash text not null,                         -- lets the browser that created it attach the Calendly call
  user_agent        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists booking_requests_status_idx on public.booking_requests (status, created_at desc);
create index if not exists booking_requests_event_date_idx on public.booking_requests (event_date);
create index if not exists booking_requests_email_idx on public.booking_requests (lower(email));
create index if not exists booking_requests_client_id_idx on public.booking_requests (client_id);

-- Only the backend (service role) reads or writes this table.
alter table public.booking_requests enable row level security;
revoke all on public.booking_requests from anon, authenticated;

create or replace function public.booking_requests_touch_updated_at()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists booking_requests_touch on public.booking_requests;
create trigger booking_requests_touch before update on public.booking_requests
for each row execute function public.booking_requests_touch_updated_at();
