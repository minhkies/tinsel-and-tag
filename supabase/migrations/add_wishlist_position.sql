-- Add a position column to wishlist_items for user-defined ordering.
-- Defaults to 0; the app assigns incrementing values on insert and reorder.
ALTER TABLE wishlist_items
  ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- Back-fill existing rows so they sort in the same order as before (by created_at).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY created_at) AS rn
  FROM wishlist_items
)
UPDATE wishlist_items
SET position = ranked.rn
FROM ranked
WHERE wishlist_items.id = ranked.id;
