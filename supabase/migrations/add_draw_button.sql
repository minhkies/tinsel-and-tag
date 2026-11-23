-- Deferred draw: rooms are created WITHOUT matches and the organizer draws
-- names later via the Draw Names button.
alter table public.rooms
  add column if not exists is_drawn boolean not null default false;

-- Existing rooms already have assignments — mark them as drawn so this
-- update doesn't change their behavior.
update public.rooms
set is_drawn = true
where exists (
  select 1
  from public.participants p
  where p.room_id = public.rooms.id
    and p.assignee_id is not null
);
