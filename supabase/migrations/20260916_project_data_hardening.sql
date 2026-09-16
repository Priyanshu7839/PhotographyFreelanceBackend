-- Apply through the Supabase SQL editor or migration runner before deploying
-- the matching backend release. Each statement is idempotent for existing data.

alter table public.clients add column if not exists event_date date;
alter table public.clients add column if not exists event_end_date date;
alter table public.clients add column if not exists event_location text;

alter table public.project_steps add column if not exists scheduled_time timestamptz;
alter table public.moodboard_songs add column if not exists artist text;
alter table public.moodboard_songs add column if not exists notes text;

-- Preserve the existing separate date/time representation while progressively
-- filling the canonical timestamp used by edits and API responses.
update public.project_steps
set scheduled_time = (step_date::text || ' ' || step_time::text)::timestamptz
where scheduled_time is null and step_date is not null and step_time is not null;

create index if not exists project_steps_client_id_idx on public.project_steps (client_id);
create index if not exists files_client_id_idx on public.files (client_id);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists gears_assigned_client_member_idx on public.gears_assigned (client_id, member_id);

alter table public.clients add column if not exists vendor_media_consent boolean not null default false;
alter table public.clients add column if not exists vendor_media_consent_at timestamptz;

create table if not exists public.vendors (
  vendor_id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.clients(client_id) on delete cascade,
  vendor_name text not null,
  vendor_type text not null,
  contact_email text,
  contact_phone text,
  created_by bigint references public.members(member_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vendors_client_id_idx on public.vendors(client_id);
alter table public.files add column if not exists vendor_id uuid references public.vendors(vendor_id) on delete set null;
create index if not exists files_vendor_id_idx on public.files(vendor_id);

-- Keep the file/vendor relationship valid at the database boundary too. Existing
-- rows are untouched; the trigger applies to new vendor-share assignments.
create or replace function public.validate_vendor_shared_file()
returns trigger
language plpgsql
as $$
declare
  vendor_client_id public.clients.client_id%type;
begin
  if coalesce(new.is_vendor_shared, false) then
    if new.vendor_id is null then
      raise exception 'vendor_id is required when is_vendor_shared is true';
    end if;

    select client_id into vendor_client_id
    from public.vendors
    where vendor_id = new.vendor_id;

    if vendor_client_id is null or vendor_client_id <> new.client_id then
      raise exception 'vendor must belong to the same client as the file';
    end if;
  else
    new.vendor_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists files_validate_vendor_shared_file on public.files;
create trigger files_validate_vendor_shared_file
before insert or update of is_vendor_shared, vendor_id on public.files
for each row execute function public.validate_vendor_shared_file();
