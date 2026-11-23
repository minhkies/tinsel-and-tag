-- Bind organizer privileges to a person. The organizer is a named identity
-- with their own 4-digit PIN, and may optionally be linked to a participant
-- spot in the exchange (or not participate at all).
alter table public.rooms
  add column if not exists organizer_name text,
  add column if not exists organizer_pin_hash text,
  add column if not exists organizer_participant_id uuid
    references public.participants(id) on delete set null;
