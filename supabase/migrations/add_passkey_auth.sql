-- WebAuthn passkey support for participants (Face ID, Touch ID, Windows Hello,
-- Android fingerprint). All rows are accessed exclusively through the server
-- service-role client (same as the rest of the schema), so no RLS policies are
-- required here.

-- One row per passkey a participant registers on any device.
-- public_key / credential_id / transports are stored as base64url strings.
create table if not exists public.participant_credentials (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter integer not null default 0,
  transports text[] not null default '{}',
  device_type text not null default 'singleDevice',
  created_at timestamptz not null default now()
);

create index if not exists participant_credentials_participant_idx
  on public.participant_credentials (participant_id);

-- Single-use, short-lived challenges for registration & authentication ceremonies.
create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  challenge text not null,
  participant_id uuid not null references public.participants(id) on delete cascade,
  purpose text not null check (purpose in ('registration', 'authentication')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists webauthn_challenges_expires_idx
  on public.webauthn_challenges (expires_at);
