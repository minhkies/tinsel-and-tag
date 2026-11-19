'use server';

import crypto from 'crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { supabaseAdmin } from '@/lib/supabase';

// Secret key for signing HttpOnly room session cookies
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-dev-secret-change-in-production'
);

// ============================================================================
// 1. CRYPTO & SESSION COOKIE HELPERS
// ============================================================================

/**
 * Generates a short, readable 6-character room slug (e.g., "x8k9p2")
 */
function generateSlug(length = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(length);
  let slug = '';
  for (let i = 0; i < length; i++) {
    slug += chars[bytes[i] % chars.length];
  }
  return slug;
}

/**
 * Hashes a 4-digit PIN with a random 16-byte salt using Node's native scrypt
 */
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Constant-time verification of a 4-digit PIN against a stored salt:hash
 */
function verifyPin(pin, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, key] = storedHash.split(':');
  const keyBuffer = Buffer.from(key, 'hex');
  const derivedKey = crypto.scryptSync(String(pin), salt, 64);
  if (keyBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(keyBuffer, derivedKey);
}

/**
 * Normalizes optional product URLs to always include https://
 */
function normalizeUrl(rawUrl) {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Sets a signed HttpOnly cookie scoped to a specific room slug
 */
async function setRoomSessionCookie(slug, participantId) {
  const token = await new SignJWT({ slug, participantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(`ss_session_${slug}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

/**
 * Reads and verifies the current participantId from the room's HttpOnly cookie
 */
async function getAuthenticatedParticipantId(slug) {
  const cookieStore = await cookies();
  const token = cookieStore.get(`ss_session_${slug}`)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.slug !== slug) return null;
    return payload.participantId || null;
  } catch {
    return null;
  }
}

// ============================================================================
// 2. BACKTRACKING SECRET SANTA MATCHER
// ============================================================================

function generateSecretSantaMatches(participants) {
  const n = participants.length;
  if (n < 2) return null;

  const validTargets = new Map();
  for (const giver of participants) {
    const blocked = new Set([giver.id, ...(giver.exclusions || [])]);
    const candidates = participants
      .map((p) => p.id)
      .filter((id) => !blocked.has(id));

    if (candidates.length === 0) return null;
    validTargets.set(giver.id, candidates);
  }

  // Most Constrained Variable heuristic: assign people with fewest options first
  const orderedGivers = [...participants].sort(
    (a, b) =>
      (validTargets.get(a.id)?.length ?? 0) -
      (validTargets.get(b.id)?.length ?? 0)
  );

  const assignments = {};
  const assignedRecipients = new Set();

  function backtrack(index) {
    if (index === n) return true;

    const giver = orderedGivers[index];
    const candidates = [...(validTargets.get(giver.id) ?? [])];

    // Fisher-Yates shuffle for unbiased randomness
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    for (const candidateId of candidates) {
      if (!assignedRecipients.has(candidateId)) {
        assignments[giver.id] = candidateId;
        assignedRecipients.add(candidateId);

        if (backtrack(index + 1)) return true;

        delete assignments[giver.id];
        assignedRecipients.delete(candidateId);
      }
    }

    return false;
  }

  return backtrack(0) ? assignments : null;
}

// ============================================================================
// 3. PUBLIC & AUTHENTICATED SERVER ACTIONS
// ============================================================================

/**
 * Creates a new Secret Santa room, inserts participants with UUIDs,
 * computes a valid draw respecting exclusion rules, and returns { slug, adminToken }.
 */
export async function createRoom({ name, budget, exchangeDate, participants }) {
  try {
    if (!name?.trim()) {
      return { error: 'Please enter a group or event name.' };
    }
    if (!Array.isArray(participants) || participants.length < 3) {
      return { error: 'Please add at least 3 participants.' };
    }

    // Generate real UUIDs upfront so we can map exclusion rules & assignments cleanly
    const prepared = participants.map((p) => ({
      tempId: p.id,
      id: crypto.randomUUID(),
      name: p.name.trim(),
      rawExclusions: p.exclusions || [],
    }));

    const tempToRealId = new Map(prepared.map((p) => [p.tempId, p.id]));

    const nodes = prepared.map((p) => ({
      id: p.id,
      name: p.name,
      exclusions: p.rawExclusions
        .map((exTempId) => tempToRealId.get(exTempId))
        .filter(Boolean),
    }));

    const assignments = generateSecretSantaMatches(nodes);
    if (!assignments) {
      return {
        error:
          'No valid draw exists with these exclusion rules. Remove an exclusion or add another person.',
      };
    }

    const slug = generateSlug(6);
    const adminToken = crypto.randomBytes(24).toString('hex');

    // 1. Insert Room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .insert({
        slug,
        name: name.trim(),
        budget: budget?.trim() || 'No limit',
        exchange_date: exchangeDate || null,
        admin_token: adminToken,
      })
      .select('id, slug')
      .single();

    if (roomError) throw roomError;

    // 2. Insert Participants (with assignee_id populated)
    const rowsToInsert = nodes.map((node) => ({
      id: node.id,
      room_id: room.id,
      name: node.name,
      exclusions: node.exclusions,
      assignee_id: assignments[node.id],
    }));

    const { error: partError } = await supabaseAdmin
      .from('participants')
      .insert(rowsToInsert);

    if (partError) throw partError;

    return { slug: room.slug, adminToken };
  } catch (err) {
    console.error('createRoom error:', err);
    return { error: 'Failed to create room. Please try again.' };
  }
}

/**
 * Fetches safe public lobby metadata for /room/[slug].
 * Strictly omits `assignee_id` and `pin_hash` so matches cannot be inspected in DevTools.
 */
export async function getRoomLobby(slug) {
  try {
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, slug, name, budget, exchange_date')
      .eq('slug', slug)
      .single();

    if (roomError || !room) {
      return { error: 'Room not found.' };
    }

    const { data: participants, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, name, pin_hash, pin_hint')
      .eq('room_id', room.id)
      .order('name', { ascending: true });

    if (partError) throw partError;

    const activeParticipantId = await getAuthenticatedParticipantId(slug);

    return {
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        budget: room.budget,
        exchangeDate: room.exchange_date,
      },
      participants: participants.map((p) => ({
        id: p.id,
        name: p.name,
        isClaimed: Boolean(p.pin_hash),
        pinHint: p.pin_hint || '',
      })),
      activeParticipantId,
    };
  } catch (err) {
    console.error('getRoomLobby error:', err);
    return { error: 'Unable to load room.' };
  }
}

/**
 * Claims an unclaimed spot with a new 4-digit PIN, OR verifies an existing PIN,
 * sets an HttpOnly session cookie, and returns the unlocked dashboard payload.
 */
export async function claimOrUnlockParticipant({
  slug,
  participantId,
  pin,
  pinHint = '',
}) {
  try {
    if (!/^\d{4}$/.test(String(pin))) {
      return { error: 'PIN must be exactly 4 digits.' };
    }

    const { data: participant, error: fetchError } = await supabaseAdmin
      .from('participants')
      .select('id, room_id, name, pin_hash, assignee_id, dislikes, has_revealed')
      .eq('id', participantId)
      .single();

    if (fetchError || !participant) {
      return { error: 'Participant not found.' };
    }

    if (!participant.pin_hash) {
      // First-time claim: hash and store the new 4-digit PIN
      const newHash = hashPin(pin);
      const { error: updateError } = await supabaseAdmin
        .from('participants')
        .update({
          pin_hash: newHash,
          pin_hint: pinHint.trim(),
        })
        .eq('id', participant.id);

      if (updateError) throw updateError;
    } else {
      // Existing claim: verify PIN
      const isValid = verifyPin(pin, participant.pin_hash);
      if (!isValid) {
        return {
          error: 'Incorrect PIN. Try again or ask the organizer to reset it.',
        };
      }
    }

    await setRoomSessionCookie(slug, participant.id);
    return await getUnlockedDashboard(slug);
  } catch (err) {
    console.error('claimOrUnlockParticipant error:', err);
    return { error: 'Something went wrong verifying your PIN.' };
  }
}

/**
 * Fetches the authenticated participant's own wishlist + their Secret Santa match's
 * name, structured wishlist links, and dislikes.
 */
export async function getUnlockedDashboard(slug) {
  try {
    const participantId = await getAuthenticatedParticipantId(slug);
    if (!participantId) {
      return { error: 'Session locked. Please enter your 4-digit PIN.' };
    }

    // 1. Fetch active participant
    const { data: me, error: meError } = await supabaseAdmin
      .from('participants')
      .select('id, name, assignee_id, dislikes, has_revealed')
      .eq('id', participantId)
      .single();

    if (meError || !me) return { error: 'Participant not found.' };

    // 2. Fetch my structured wishlist items
    const { data: myWishlist } = await supabaseAdmin
      .from('wishlist_items')
      .select('id, title, url, note')
      .eq('participant_id', me.id)
      .order('created_at', { ascending: true });

    // 3. Fetch assigned recipient + their wishlist items
    const { data: recipient } = await supabaseAdmin
      .from('participants')
      .select('id, name, dislikes')
      .eq('id', me.assignee_id)
      .single();

    const { data: recipientWishlist } = await supabaseAdmin
      .from('wishlist_items')
      .select('id, title, url, note')
      .eq('participant_id', me.assignee_id)
      .order('created_at', { ascending: true });

    return {
      me: {
        id: me.id,
        name: me.name,
        dislikes: me.dislikes || '',
        hasRevealed: Boolean(me.has_revealed),
        wishlist: myWishlist || [],
      },
      recipient: recipient
        ? {
          id: recipient.id,
          name: recipient.name,
          dislikes: recipient.dislikes || '',
          wishlist: recipientWishlist || [],
        }
        : null,
    };
  } catch (err) {
    console.error('getUnlockedDashboard error:', err);
    return { error: 'Failed to load your match details.' };
  }
}

/**
 * Marks that the user has opened their reveal envelope
 */
export async function markEnvelopeRevealed(slug) {
  const participantId = await getAuthenticatedParticipantId(slug);
  if (!participantId) return { error: 'Unauthorized' };

  await supabaseAdmin
    .from('participants')
    .update({ has_revealed: true })
    .eq('id', participantId);

  return { success: true };
}

/**
 * Adds a new structured wishlist item (with optional link & note)
 */
export async function addWishlistItem(slug, { title, url, note }) {
  const participantId = await getAuthenticatedParticipantId(slug);
  if (!participantId) return { error: 'Unauthorized' };
  if (!title?.trim()) return { error: 'Item title is required.' };

  const { data, error } = await supabaseAdmin
    .from('wishlist_items')
    .insert({
      participant_id: participantId,
      title: title.trim(),
      url: normalizeUrl(url),
      note: (note || '').trim(),
    })
    .select('id, title, url, note')
    .single();

  if (error) return { error: 'Failed to add wishlist item.' };
  return { item: data };
}

/**
 * Updates an existing wishlist item owned by the signed-in participant
 */
export async function updateWishlistItem(slug, itemId, { title, url, note }) {
  const participantId = await getAuthenticatedParticipantId(slug);
  if (!participantId) return { error: 'Unauthorized' };
  if (!title?.trim()) return { error: 'Item title is required.' };

  const { data, error } = await supabaseAdmin
    .from('wishlist_items')
    .update({
      title: title.trim(),
      url: normalizeUrl(url),
      note: (note || '').trim(),
    })
    .eq('id', itemId)
    .eq('participant_id', participantId) // Ownership check
    .select('id, title, url, note')
    .single();

  if (error) return { error: 'Failed to update item.' };
  return { item: data };
}

/**
 * Deletes a wishlist item owned by the signed-in participant
 */
export async function deleteWishlistItem(slug, itemId) {
  const participantId = await getAuthenticatedParticipantId(slug);
  if (!participantId) return { error: 'Unauthorized' };

  const { error } = await supabaseAdmin
    .from('wishlist_items')
    .delete()
    .eq('id', itemId)
    .eq('participant_id', participantId); // Ownership check

  if (error) return { error: 'Failed to delete item.' };
  return { success: true };
}

/**
 * Updates the signed-in participant's allergies / dislikes
 */
export async function updateDislikes(slug, dislikes) {
  const participantId = await getAuthenticatedParticipantId(slug);
  if (!participantId) return { error: 'Unauthorized' };

  const { error } = await supabaseAdmin
    .from('participants')
    .update({ dislikes: dislikes || '' })
    .eq('id', participantId);

  if (error) return { error: 'Failed to update dislikes.' };
  return { success: true };
}

/**
 * Clears the HttpOnly session cookie ("Lock & Switch Person")
 */
export async function lockParticipantSession(slug) {
  const cookieStore = await cookies();
  cookieStore.delete(`ss_session_${slug}`);
  return { success: true };
}

/**
 * Organizer-only action: resets a participant's PIN without reshuffling matches
 */
export async function organizerResetPin({ slug, adminToken, participantId }) {
  const { data: room } = await supabaseAdmin
    .from('rooms')
    .select('id, admin_token')
    .eq('slug', slug)
    .single();

  if (!room || room.admin_token !== adminToken) {
    return { error: 'Invalid organizer token.' };
  }

  const { error } = await supabaseAdmin
    .from('participants')
    .update({ pin_hash: null, pin_hint: '' })
    .eq('id', participantId)
    .eq('room_id', room.id);

  if (error) return { error: 'Failed to reset PIN.' };
  return { success: true };
}