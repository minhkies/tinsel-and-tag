'use server';

import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
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
 * Reads and verifies the current participantId from the room's HttpOnly cookie.
 * If requirePin is true, also verifies that the participant still has an active PIN
 * (pin_hash is not null). If their PIN was reset by the organizer, clears the cookie.
 */
async function getAuthenticatedParticipantId(slug, requirePin = false) {
  const cookieStore = await cookies();
  const token = cookieStore.get(`ss_session_${slug}`)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload.slug !== slug) return null;
    const participantId = payload.participantId || null;
    if (!participantId) return null;

    if (requirePin) {
      const { data: p } = await supabaseAdmin
        .from('participants')
        .select('pin_hash')
        .eq('id', participantId)
        .single();
      if (!p || !p.pin_hash) {
        cookieStore.delete(`ss_session_${slug}`);
        return null;
      }
    }

    return participantId;
  } catch {
    return null;
  }
}

// ============================================================================
// 1b. WEBAUTHN (PASSKEY) HELPERS
// ============================================================================

const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Derives the WebAuthn relying-party config from the incoming request so the
 * same code works on localhost (http://localhost:3000) and any production
 * HTTPS domain — no hardcoded URLs. rpID is the host without a port.
 */
async function getWebAuthnConfig() {
  const headerStore = await headers();
  const host = (
    headerStore.get('x-forwarded-host') ||
    headerStore.get('host') ||
    'localhost:3000'
  ).trim();
  const proto = (headerStore.get('x-forwarded-proto') || 'http').split(',')[0].trim();
  const rpID = host.split(':')[0].toLowerCase();
  const origin = `${proto}://${host}`;
  return { rpID, origin };
}

/**
 * Stores a fresh challenge for a participant + purpose. Replaces any previous
 * challenge of the same kind and opportunistically prunes expired rows.
 */
async function saveWebAuthnChallenge(participantId, purpose, challenge) {
  await supabaseAdmin
    .from('webauthn_challenges')
    .delete()
    .eq('participant_id', participantId)
    .eq('purpose', purpose);

  await supabaseAdmin
    .from('webauthn_challenges')
    .delete()
    .lt('expires_at', new Date().toISOString());

  const { error } = await supabaseAdmin.from('webauthn_challenges').insert({
    participant_id: participantId,
    purpose,
    challenge,
    expires_at: new Date(Date.now() + WEBAUTHN_CHALLENGE_TTL_MS).toISOString(),
  });

  if (error) throw error;
}

/**
 * Fetches and consumes (deletes) the latest challenge for a participant +
 * purpose. Returns null if none exists or it has expired — challenges are
 * single-use, so a used one can never be replayed.
 */
async function consumeWebAuthnChallenge(participantId, purpose) {
  const { data, error } = await supabaseAdmin
    .from('webauthn_challenges')
    .select('challenge, expires_at')
    .eq('participant_id', participantId)
    .eq('purpose', purpose)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;

  await supabaseAdmin
    .from('webauthn_challenges')
    .delete()
    .eq('participant_id', participantId)
    .eq('purpose', purpose);

  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.challenge;
}

/**
 * Whether a room's Secret Santa draw has happened. Defaults to true when the
 * column can't be read (e.g., migration not applied yet), which matches the
 * behavior of rooms that predate the deferred-draw feature.
 */
async function getRoomDrawnStatus(roomId) {
  try {
    const { data } = await supabaseAdmin
      .from('rooms')
      .select('is_drawn')
      .eq('id', roomId)
      .single();
    return data ? Boolean(data.is_drawn) : true;
  } catch (err) {
    console.error('rooms.is_drawn fetch error:', err);
    return true;
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
 * Creates a new Secret Santa room. Matches are NOT drawn at creation anymore —
 * participants are inserted without assignments and the organizer draws names
 * later via drawNames().
 */
export async function createRoom({ name, budget, exchangeDate, participants = [] }) {
  try {
    if (!name?.trim()) {
      return { error: 'Please enter a group or event name.' };
    }

    const safeParticipants = Array.isArray(participants) ? participants : [];

    // Generate real UUIDs upfront so we can map exclusion rules cleanly
    const prepared = safeParticipants.map((p) => ({
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

    const slug = generateSlug(6);
    const adminToken = crypto.randomBytes(24).toString('hex');

    // 1. Insert Room (undrawn — the organizer draws names when ready)
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .insert({
        slug,
        name: name.trim(),
        budget: budget?.trim() || 'No limit',
        exchange_date: exchangeDate || null,
        admin_token: adminToken,
        is_drawn: false,
      })
      .select('id, slug')
      .single();

    if (roomError) throw roomError;

    // 2. Insert Participants (if any provided) without assignments
    if (nodes.length > 0) {
      const rowsToInsert = nodes.map((node) => ({
        id: node.id,
        room_id: room.id,
        name: node.name,
        exclusions: node.exclusions,
        assignee_id: null,
        dislikes: '',
        has_revealed: false,
      }));

      const { error: partError } = await supabaseAdmin
        .from('participants')
        .insert(rowsToInsert);

      if (partError) throw partError;
    }

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

    const isDrawn = await getRoomDrawnStatus(room.id);

    const { data: participants, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, name, pin_hash, pin_hint, has_revealed')
      .eq('room_id', room.id)
      .order('name', { ascending: true });

    if (partError) throw partError;

    // Which participants have registered passkeys? Fetched separately and
    // guarded so the lobby still loads if the passkey migration hasn't run yet.
    const passkeyOwners = new Set();
    try {
      const { data: creds } = await supabaseAdmin
        .from('participant_credentials')
        .select('participant_id')
        .in('participant_id', participants.map((p) => p.id));
      for (const c of creds || []) passkeyOwners.add(c.participant_id);
    } catch (err) {
      console.error('participant_credentials fetch error:', err);
    }

    let activeParticipantId = await getAuthenticatedParticipantId(slug, false);
    if (activeParticipantId) {
      const activeP = participants.find((p) => p.id === activeParticipantId);
      // If the participant no longer exists or their PIN was reset, revoke session
      if (!activeP || !activeP.pin_hash) {
        const cookieStore = await cookies();
        cookieStore.delete(`ss_session_${slug}`);
        activeParticipantId = null;
      }
    }

    return {
      room: {
        id: room.id,
        slug: room.slug,
        name: room.name,
        budget: room.budget,
        exchangeDate: room.exchange_date,
        isDrawn,
      },
      participants: participants.map((p) => ({
        id: p.id,
        name: p.name,
        isClaimed: Boolean(p.pin_hash),
        pinHint: p.pin_hint || '',
        hasRevealed: Boolean(p.has_revealed),
        hasPasskey: passkeyOwners.has(p.id),
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
    const participantId = await getAuthenticatedParticipantId(slug, true);
    if (!participantId) {
      return { error: 'PIN_RESET', message: 'Session locked. Please enter your 4-digit PIN.' };
    }

    // 1. Fetch active participant
    const { data: me, error: meError } = await supabaseAdmin
      .from('participants')
      .select('id, name, assignee_id, dislikes, has_revealed, pin_hash, room_id')
      .eq('id', participantId)
      .single();

    if (meError || !me || !me.pin_hash) {
      const cookieStore = await cookies();
      cookieStore.delete(`ss_session_${slug}`);
      return { error: 'PIN_RESET', message: 'PIN was reset. Session locked.' };
    }

    // Has the organizer drawn names yet? Defaults to true (drawn) if the
    // deferred-draw migration hasn't been applied.
    let roomDrawn = true;
    if (me.room_id) {
      roomDrawn = await getRoomDrawnStatus(me.room_id);
    }

    // Does this participant have any registered passkeys? Guarded so the
    // dashboard still loads if the passkey migration hasn't run yet.
    let hasPasskey = false;
    try {
      const { data: myCredentials } = await supabaseAdmin
        .from('participant_credentials')
        .select('id')
        .eq('participant_id', me.id)
        .limit(1);
      hasPasskey = Boolean(myCredentials && myCredentials.length > 0);
    } catch (err) {
      console.error('participant_credentials fetch error:', err);
    }

    // 2. Fetch my structured wishlist items
    const { data: myWishlist } = await supabaseAdmin
      .from('wishlist_items')
      .select('id, title, url, note, position')
      .eq('participant_id', me.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    // 3. Fetch assigned recipient + their wishlist items
    const { data: recipient } = await supabaseAdmin
      .from('participants')
      .select('id, name, dislikes')
      .eq('id', me.assignee_id)
      .single();

    const { data: recipientWishlist } = await supabaseAdmin
      .from('wishlist_items')
      .select('id, title, url, note, position')
      .eq('participant_id', me.assignee_id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });

    return {
      roomDrawn,
      me: {
        id: me.id,
        name: me.name,
        dislikes: me.dislikes || '',
        hasRevealed: Boolean(me.has_revealed),
        hasPasskey,
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
  const participantId = await getAuthenticatedParticipantId(slug, true);
  if (!participantId) return { error: 'PIN_RESET' };

  await supabaseAdmin
    .from('participants')
    .update({ has_revealed: true })
    .eq('id', participantId);

  return { success: true };
}

// ============================================================================
// 3b. WEBAUTHN (PASSKEY) SERVER ACTIONS
// ============================================================================

/**
 * Step 1 of passkey registration. Requires an active unlocked session for the
 * participant (they just verified their PIN), then returns registration
 * options for the browser's navigator.credentials.create() call.
 */
export async function generatePasskeyRegistrationOptions(slug, participantId) {
  try {
    const sessionId = await getAuthenticatedParticipantId(slug, true);
    if (!sessionId) return { error: 'PIN_RESET' };
    if (sessionId !== participantId) return { error: 'Unauthorized.' };

    const { data: participant, error: fetchError } = await supabaseAdmin
      .from('participants')
      .select('id, name, participant_credentials(credential_id, transports)')
      .eq('id', participantId)
      .single();

    if (fetchError || !participant) return { error: 'Participant not found.' };

    const { rpID } = await getWebAuthnConfig();
    const existing = participant.participant_credentials || [];

    const options = await generateRegistrationOptions({
      rpName: 'Tinsel & Tag',
      rpID,
      userID: new TextEncoder().encode(participantId),
      userName: participant.name,
      userDisplayName: participant.name,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      // Encourage platform biometrics (Face ID / Touch ID / Windows Hello /
      // Android fingerprint) while still allowing security keys.
      preferredAuthenticatorType: 'localDevice',
      excludeCredentials: existing.map((c) => ({
        id: c.credential_id,
        transports: c.transports || undefined,
      })),
      supportedAlgorithmIDs: [-7, -257], // ES256, RS256
    });

    await saveWebAuthnChallenge(participantId, 'registration', options.challenge);
    return { options };
  } catch (err) {
    console.error('generatePasskeyRegistrationOptions error:', err);
    return { error: 'Failed to start passkey setup. Please try again.' };
  }
}

/**
 * Step 2 of passkey registration. Verifies the attestation response from the
 * browser and persists the credential. Also requires the active PIN session.
 */
export async function verifyPasskeyRegistration(slug, participantId, registrationResponse) {
  try {
    const sessionId = await getAuthenticatedParticipantId(slug, true);
    if (!sessionId) return { error: 'PIN_RESET' };
    if (sessionId !== participantId) return { error: 'Unauthorized.' };

    if (!registrationResponse || typeof registrationResponse !== 'object') {
      return { error: 'Invalid passkey response.' };
    }

    const { rpID, origin } = await getWebAuthnConfig();
    const challenge = await consumeWebAuthnChallenge(participantId, 'registration');
    if (!challenge) {
      return { error: 'Passkey setup expired. Please try again.' };
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: registrationResponse,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
      });
    } catch (err) {
      console.error('verifyRegistrationResponse error:', err);
      return { error: 'Passkey verification failed. Please try again.' };
    }

    if (!verification.verified || !verification.registrationInfo) {
      return { error: 'Passkey verification failed. Please try again.' };
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    const { error: insertError } = await supabaseAdmin
      .from('participant_credentials')
      .insert({
        participant_id: participantId,
        credential_id: credential.id,
        public_key: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        device_type: credentialDeviceType || 'singleDevice',
      });

    if (insertError) {
      console.error('participant_credentials insert error:', insertError);
      return { error: 'Failed to save passkey. Please try again.' };
    }

    return { success: true };
  } catch (err) {
    console.error('verifyPasskeyRegistration error:', err);
    return { error: 'Failed to save passkey. Please try again.' };
  }
}

/**
 * Step 1 of passkey login. No session required yet (the participant is still
 * locked out). Returns authentication options listing the participant's
 * registered credentials.
 */
export async function generatePasskeyAuthenticationOptions(slug, participantId) {
  try {
    const { data: credentials, error: fetchError } = await supabaseAdmin
      .from('participant_credentials')
      .select('credential_id, transports')
      .eq('participant_id', participantId);

    if (fetchError) return { error: 'Passkey login unavailable.' };
    if (!credentials || credentials.length === 0) return { error: 'NO_PASSKEY' };

    const { rpID } = await getWebAuthnConfig();

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: credentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports || undefined,
      })),
      userVerification: 'preferred',
    });

    await saveWebAuthnChallenge(participantId, 'authentication', options.challenge);
    return { options };
  } catch (err) {
    console.error('generatePasskeyAuthenticationOptions error:', err);
    return { error: 'Failed to start passkey login. Please try again.' };
  }
}

/**
 * Step 2 of passkey login. Verifies the biometric assertion, updates the
 * signature counter, and — on success — sets the same session cookie and
 * returns the same dashboard payload as a successful PIN unlock.
 */
export async function verifyPasskeyAuthentication(slug, participantId, authenticationResponse) {
  try {
    if (!authenticationResponse || typeof authenticationResponse !== 'object') {
      return { error: 'Invalid passkey response.' };
    }

    const credentialId = authenticationResponse.id;
    const { data: credential, error: credError } = await supabaseAdmin
      .from('participant_credentials')
      .select('credential_id, public_key, counter, transports')
      .eq('participant_id', participantId)
      .eq('credential_id', credentialId)
      .single();

    if (credError || !credential) {
      return { error: 'This passkey is not registered for this participant.' };
    }

    const { rpID, origin } = await getWebAuthnConfig();
    const challenge = await consumeWebAuthnChallenge(participantId, 'authentication');
    if (!challenge) {
      return { error: 'Passkey login expired. Please try again.' };
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: authenticationResponse,
        expectedChallenge: challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credential.credential_id,
          publicKey: isoBase64URL.toBuffer(credential.public_key),
          counter: credential.counter,
          transports: credential.transports || undefined,
        },
        requireUserVerification: true,
      });
    } catch (err) {
      console.error('verifyAuthenticationResponse error:', err);
      return { error: 'Passkey verification failed. Please use your PIN.' };
    }

    if (!verification.verified || !verification.authenticationInfo) {
      return { error: 'Passkey verification failed. Please use your PIN.' };
    }

    // Update the signature counter to prevent replay of older signatures
    await supabaseAdmin
      .from('participant_credentials')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('credential_id', credential.credential_id)
      .eq('participant_id', participantId);

    // The spot must still be claimed (PIN set) — after an organizer PIN reset,
    // passkey login is disabled until the participant sets a new PIN.
    const { data: participant, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, pin_hash')
      .eq('id', participantId)
      .single();

    if (partError || !participant || !participant.pin_hash) {
      return { error: 'Passkey login unavailable. Please use your PIN.' };
    }

    await setRoomSessionCookie(slug, participant.id);
    return await getUnlockedDashboard(slug);
  } catch (err) {
    console.error('verifyPasskeyAuthentication error:', err);
    return { error: 'Passkey login failed. Please use your PIN.' };
  }
}

/**
 * Adds a new structured wishlist item (with optional link & note)
 */
export async function addWishlistItem(slug, { title, url, note }) {
  const participantId = await getAuthenticatedParticipantId(slug, true);
  if (!participantId) return { error: 'PIN_RESET' };
  if (!title?.trim()) return { error: 'Item title is required.' };

  // Determine next position value
  const { data: lastItem } = await supabaseAdmin
    .from('wishlist_items')
    .select('position')
    .eq('participant_id', participantId)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (lastItem?.position ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from('wishlist_items')
    .insert({
      participant_id: participantId,
      title: title.trim(),
      url: normalizeUrl(url),
      note: (note || '').trim(),
      position: nextPosition,
    })
    .select('id, title, url, note, position')
    .single();

  if (error) {
    console.error('addWishlistItem insert error:', error);
    return { error: 'Failed to add wishlist item.' };
  }
  return { item: data };
}

/**
 * Updates an existing wishlist item owned by the signed-in participant
 */
export async function updateWishlistItem(slug, itemId, { title, url, note }) {
  const participantId = await getAuthenticatedParticipantId(slug, true);
  if (!participantId) return { error: 'PIN_RESET' };
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
    .select('id, title, url, note, position')
    .single();

  if (error) return { error: 'Failed to update item.' };
  return { item: data };
}

/**
 * Deletes a wishlist item owned by the signed-in participant
 */
export async function deleteWishlistItem(slug, itemId) {
  const participantId = await getAuthenticatedParticipantId(slug, true);
  if (!participantId) return { error: 'PIN_RESET' };

  const { error } = await supabaseAdmin
    .from('wishlist_items')
    .delete()
    .eq('id', itemId)
    .eq('participant_id', participantId); // Ownership check

  if (error) return { error: 'Failed to delete item.' };
  return { success: true };
}

/**
 * Reorders the signed-in participant's wishlist so it matches the order
 * of IDs provided (top to bottom). Every ID must be owned by the
 * participant and the list must contain their complete current wishlist.
 */
export async function reorderWishlistItems(slug, orderedIds) {
  const participantId = await getAuthenticatedParticipantId(slug, true);
  if (!participantId) return { error: 'PIN_RESET' };

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'Nothing to reorder.' };
  }

  const uniqueIds = new Set(orderedIds);
  if (uniqueIds.size !== orderedIds.length) {
    return { error: 'Invalid wishlist order.' };
  }

  // Fetch the participant's current item ids to enforce ownership & completeness
  const { data: owned, error: fetchError } = await supabaseAdmin
    .from('wishlist_items')
    .select('id')
    .eq('participant_id', participantId);

  if (fetchError) return { error: 'Failed to reorder your wishlist. Please try again.' };

  const ownedIds = new Set((owned || []).map((item) => item.id));
  const allOwned = orderedIds.every((id) => ownedIds.has(id));
  const isComplete = ownedIds.size === uniqueIds.size;

  if (!allOwned || !isComplete) {
    return { error: 'Wishlist order is out of date. Refresh and try again.' };
  }

  // Persist each item's new position (1-based, top to bottom)
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabaseAdmin
        .from('wishlist_items')
        .update({ position: index + 1 })
        .eq('id', id)
        .eq('participant_id', participantId)
    )
  );

  if (results.some((r) => r.error)) {
    return { error: 'Failed to reorder your wishlist. Please try again.' };
  }

  return { success: true };
}

/**
 * Updates the signed-in participant's allergies / dislikes
 */
export async function updateDislikes(slug, dislikes) {
  const participantId = await getAuthenticatedParticipantId(slug, true);
  if (!participantId) return { error: 'PIN_RESET' };

  const { error } = await supabaseAdmin
    .from('participants')
    .update({ dislikes: dislikes || '' })
    .eq('id', participantId);

  if (error) return { error: 'Failed to update dislikes.' };
  return { success: true };
}

/**
 * Clears the HttpOnly session cookie (used when navigating back to lobby)
 */
export async function lockParticipantSession(slug) {
  const cookieStore = await cookies();
  cookieStore.delete(`ss_session_${slug}`);
  return { success: true };
}

/**
 * Verifies a 4-digit PIN against all claimed participants in the room.
 * If any participant's PIN matches, returns the room's admin token so the
 * caller can access organizer tools.
 */
export async function verifyOrganizerPin({ slug, pin }) {
  try {
    if (!/^\d{4}$/.test(String(pin))) {
      return { error: 'PIN must be exactly 4 digits.' };
    }

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, admin_token')
      .eq('slug', slug)
      .single();

    if (!room) return { error: 'Room not found.' };

    // Fetch every claimed participant (those with a pin_hash)
    const { data: claimed } = await supabaseAdmin
      .from('participants')
      .select('id, pin_hash')
      .eq('room_id', room.id)
      .not('pin_hash', 'is', null);

    for (const p of claimed || []) {
      if (verifyPin(pin, p.pin_hash)) {
        return { success: true, adminToken: room.admin_token };
      }
    }

    return { error: 'Incorrect PIN.' };
  } catch (err) {
    console.error('verifyOrganizerPin error:', err);
    return { error: 'Unable to verify PIN.' };
  }
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

  // A PIN reset wipes all access to the spot: remove registered passkeys so
  // the previous holder cannot unlock with biometrics after the reset.
  await supabaseAdmin
    .from('participant_credentials')
    .delete()
    .eq('participant_id', participantId);

  // If the organizer's active session is for this participant, delete the cookie
  const activeParticipantId = await getAuthenticatedParticipantId(slug, false);
  if (activeParticipantId === participantId) {
    const cookieStore = await cookies();
    cookieStore.delete(`ss_session_${slug}`);
  }

  return { success: true };
}

/**
 * Organizer-only action: removes a participant from the room.
 *
 * mode === 'rebridge': re-link only the affected pair — the person buying
 *   for the removed participant (A) now buys for the person the removed
 *   participant was buying for (C). Everyone else keeps their match.
 *   Automatically falls back to 'redraw' when the re-link would break
 *   exclusion rules or an edge of the chain is missing.
 * mode === 'redraw': remove the participant and re-run the draw for everyone
 *   remaining (any changed envelopes are reset so they reveal again).
 *
 * Cleanup: strips the removed participant from all exclusion lists, clears
 * any assignee references pointing at them, and deletes their wishlist
 * items, passkey credentials, and WebAuthn challenges before deleting the
 * participant row, so no foreign-key constraint is violated.
 */
export async function removeParticipant({ slug, adminToken, participantId, mode }) {
  try {
    if (!['rebridge', 'redraw'].includes(mode)) {
      return { error: 'Invalid removal mode.' };
    }

    // 1. Fetch room and verify organizer token
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, slug, admin_token')
      .eq('slug', slug)
      .single();

    if (roomError || !room) return { error: 'Room not found.' };
    if (!adminToken || room.admin_token !== adminToken) {
      return { error: 'Invalid organizer token.' };
    }

    // 2. Fetch participants
    const { data: participants, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, name, exclusions, assignee_id, has_revealed')
      .eq('room_id', room.id);

    if (partError) throw partError;

    const target = participants.find((p) => p.id === participantId);
    if (!target) return { error: 'Participant not found.' };

    // 3. Prevent self-removal (the organizer's own unlocked session)
    const sessionParticipantId = await getAuthenticatedParticipantId(slug, false);
    if (sessionParticipantId === participantId) {
      return { error: 'You cannot remove yourself.' };
    }

    // 4. Minimum participant guard (at least 3 must remain)
    if (participants.length <= 3) {
      return { error: 'At least 3 participants must remain in the room.' };
    }

    // Undrawn rooms have no matches to fix — skip rebridge/redraw entirely
    const isDrawn = await getRoomDrawnStatus(room.id);

    const remaining = participants.filter((p) => p.id !== participantId);

    // 5. Strip the removed participant from everyone's exclusion lists
    const exclusionCleanup = [];
    for (const p of remaining) {
      const exclusions = Array.isArray(p.exclusions) ? p.exclusions : [];
      if (exclusions.includes(participantId)) {
        exclusionCleanup.push(
          supabaseAdmin
            .from('participants')
            .update({ exclusions: exclusions.filter((id) => id !== participantId) })
            .eq('id', p.id)
        );
      }
    }
    await Promise.all(exclusionCleanup);

    let effectiveMode = mode;

    if (isDrawn) {
      if (mode === 'rebridge') {
      // A = the person buying for the removed participant; C = their recipient
      const giver = participants.find((p) => p.assignee_id === participantId);
      const recipient = giver ? remaining.find((p) => p.id === target.assignee_id) : null;

      const relinkValid =
        giver &&
        recipient &&
        giver.id !== recipient.id &&
        !(giver.exclusions || []).includes(recipient.id) &&
        !(recipient.exclusions || []).includes(giver.id);

      if (relinkValid) {
        // Re-link A -> C; A's envelope changes, so reset it if it was opened
        await supabaseAdmin
          .from('participants')
          .update({
            assignee_id: recipient.id,
            ...(giver.has_revealed ? { has_revealed: false } : {}),
          })
          .eq('id', giver.id);

        // Defensive: clear any other rows still pointing at the removed participant
        await supabaseAdmin
          .from('participants')
          .update({ assignee_id: null })
          .eq('assignee_id', participantId)
          .neq('id', giver.id);
      } else {
        // A missing edge or exclusion rules block the re-link — redraw instead
        effectiveMode = 'redraw';
      }
    }

    if (effectiveMode === 'redraw') {
      const nodes = remaining.map((p) => ({
        id: p.id,
        exclusions: (p.exclusions || []).filter((id) => id !== participantId),
      }));

      const newAssignments = generateSecretSantaMatches(nodes);
      if (!newAssignments) {
        return {
          error:
            'Could not remove this participant: no valid draw exists for the remaining participants.',
        };
      }

      // Clear all references to the removed participant, then apply new assignments
      await supabaseAdmin
        .from('participants')
        .update({ assignee_id: null })
        .eq('assignee_id', participantId);

      for (const p of remaining) {
        const newAssignee = newAssignments[p.id] || null;
        if (newAssignee !== p.assignee_id) {
          await supabaseAdmin
            .from('participants')
            .update({
              assignee_id: newAssignee,
              ...(p.has_revealed ? { has_revealed: false } : {}),
            })
            .eq('id', p.id);
        }
      }
      }
    }

    // 6. Delete everything tied to the removed participant
    await supabaseAdmin.from('wishlist_items').delete().eq('participant_id', participantId);
    await supabaseAdmin
      .from('participant_credentials')
      .delete()
      .eq('participant_id', participantId);
    await supabaseAdmin
      .from('webauthn_challenges')
      .delete()
      .eq('participant_id', participantId);

    // 7. Delete the participant row
    const { error: delError } = await supabaseAdmin
      .from('participants')
      .delete()
      .eq('id', participantId)
      .eq('room_id', room.id);

    if (delError) {
      console.error('removeParticipant delete error:', delError);
      return { error: 'Failed to remove the participant.' };
    }

    return { success: true, mode: isDrawn ? effectiveMode : 'none', name: target.name };
  } catch (err) {
    console.error('removeParticipant error:', err);
    return { error: 'Failed to remove the participant. Please try again.' };
  }
}

/**
 * Organizer-only: returns the room's current exclusion pairs.
 */
export async function getRoomExclusions({ slug, adminToken }) {
  try {
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, admin_token')
      .eq('slug', slug)
      .single();

    if (!room || room.admin_token !== adminToken) {
      return { error: 'Invalid organizer token.' };
    }

    const { data: participants, error } = await supabaseAdmin
      .from('participants')
      .select('id, name, exclusions')
      .eq('room_id', room.id)
      .order('name', { ascending: true });

    if (error) throw error;

    const pairs = [];
    const seen = new Set();
    for (const p of participants) {
      for (const exId of p.exclusions || []) {
        const key = [p.id, exId].sort().join('::');
        if (seen.has(key)) continue;
        seen.add(key);
        const other = participants.find((x) => x.id === exId);
        if (other) {
          pairs.push({ idA: p.id, nameA: p.name, idB: other.id, nameB: other.name });
        }
      }
    }

    return { pairs };
  } catch (err) {
    console.error('getRoomExclusions error:', err);
    return { error: 'Unable to load exclusion rules.' };
  }
}

/**
 * Organizer-only: blocks two participants from drawing each other (mutual
 * exclusion). If the current draw violates the new rule, matches are redrawn
 * to respect it (changed envelopes are reset). Rejects the rule entirely if
 * no valid draw exists with it.
 */
export async function addExclusionRule({ slug, adminToken, participantIdA, participantIdB }) {
  try {
    if (!participantIdA || !participantIdB || participantIdA === participantIdB) {
      return { error: 'Select two different participants.' };
    }

    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, admin_token')
      .eq('slug', slug)
      .single();

    if (!room || room.admin_token !== adminToken) {
      return { error: 'Invalid organizer token.' };
    }

    // Exclusion rules are only editable before the draw
    if (await getRoomDrawnStatus(room.id)) {
      return { error: 'Names have already been drawn. Exclusion rules are locked.' };
    }

    const { data: participants, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, name, exclusions, assignee_id, has_revealed')
      .eq('room_id', room.id);

    if (partError) throw partError;

    const a = participants.find((p) => p.id === participantIdA);
    const b = participants.find((p) => p.id === participantIdB);
    if (!a || !b) return { error: 'Participant not found.' };

    if (
      (a.exclusions || []).includes(b.id) ||
      (b.exclusions || []).includes(a.id)
    ) {
      return { error: 'This pair is already blocked.' };
    }

    // Tentative mutual exclusion
    const withRule = participants.map((p) => {
      if (p.id === a.id) return { ...p, exclusions: [...(p.exclusions || []), b.id] };
      if (p.id === b.id) return { ...p, exclusions: [...(p.exclusions || []), a.id] };
      return p;
    });

    // Does the current draw violate the new rule?
    const violatesCurrentDraw = a.assignee_id === b.id || b.assignee_id === a.id;

    if (violatesCurrentDraw) {
      const newAssignments = generateSecretSantaMatches(
        withRule.map((p) => ({ id: p.id, exclusions: p.exclusions }))
      );

      if (!newAssignments) {
        return {
          error:
            'Blocking this pair makes a valid draw impossible. Remove another rule first.',
        };
      }

      // Save the rule and the redrawn assignments (reset changed envelopes)
      for (const p of withRule) {
        const changed = newAssignments[p.id] !== p.assignee_id;
        const needsExclusionUpdate = p.id === a.id || p.id === b.id;

        if (changed || needsExclusionUpdate) {
          await supabaseAdmin
            .from('participants')
            .update({
              ...(changed
                ? {
                  assignee_id: newAssignments[p.id],
                  ...(p.has_revealed ? { has_revealed: false } : {}),
                }
                : {}),
              ...(needsExclusionUpdate ? { exclusions: p.exclusions } : {}),
            })
            .eq('id', p.id);
        }
      }

      return {
        success: true,
        redrew: true,
        notice: `${a.name} and ${b.name} can no longer draw each other. Matches were redrawn to respect the new rule.`,
      };
    }

    // No draw change needed — just save the mutual exclusion
    await supabaseAdmin
      .from('participants')
      .update({ exclusions: withRule.find((p) => p.id === a.id).exclusions })
      .eq('id', a.id);
    await supabaseAdmin
      .from('participants')
      .update({ exclusions: withRule.find((p) => p.id === b.id).exclusions })
      .eq('id', b.id);

    return {
      success: true,
      redrew: false,
      notice: `${a.name} and ${b.name} can no longer draw each other.`,
    };
  } catch (err) {
    console.error('addExclusionRule error:', err);
    return { error: 'Failed to add exclusion rule. Please try again.' };
  }
}

/**
 * Organizer-only: removes the mutual exclusion between two participants.
 * Removing a rule only relaxes constraints, so the current draw always
 * remains valid and no redraw is needed.
 */
export async function removeExclusionRule({ slug, adminToken, participantIdA, participantIdB }) {
  try {
    const { data: room } = await supabaseAdmin
      .from('rooms')
      .select('id, admin_token')
      .eq('slug', slug)
      .single();

    if (!room || room.admin_token !== adminToken) {
      return { error: 'Invalid organizer token.' };
    }

    // Exclusion rules are only editable before the draw
    if (await getRoomDrawnStatus(room.id)) {
      return { error: 'Names have already been drawn. Exclusion rules are locked.' };
    }

    const { data: participants, error } = await supabaseAdmin
      .from('participants')
      .select('id, exclusions')
      .eq('room_id', room.id);

    if (error) throw error;

    const a = participants.find((p) => p.id === participantIdA);
    const b = participants.find((p) => p.id === participantIdB);
    if (!a || !b) return { error: 'Participant not found.' };

    await supabaseAdmin
      .from('participants')
      .update({ exclusions: (a.exclusions || []).filter((id) => id !== b.id) })
      .eq('id', a.id);
    await supabaseAdmin
      .from('participants')
      .update({ exclusions: (b.exclusions || []).filter((id) => id !== a.id) })
      .eq('id', b.id);

    return { success: true };
  } catch (err) {
    console.error('removeExclusionRule error:', err);
    return { error: 'Failed to remove exclusion rule. Please try again.' };
  }
}

/**
 * Organizer-only: runs the Secret Santa draw for a room that hasn't been
 * drawn yet. Requires at least 2 participants and a valid draw under the
 * room's exclusion rules. Sets is_drawn = true and resets all envelopes.
 */
export async function drawNames({ slug, adminToken }) {
  try {
    // 1. Fetch room and verify organizer token
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, admin_token')
      .eq('slug', slug)
      .single();

    if (roomError || !room) return { error: 'Room not found.' };
    if (!adminToken || room.admin_token !== adminToken) {
      return { error: 'Invalid organizer token.' };
    }

    // 2. Only draw once
    if (await getRoomDrawnStatus(room.id)) {
      return { error: 'Names have already been drawn.' };
    }

    // 3. Fetch participants
    const { data: participants, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, name, exclusions')
      .eq('room_id', room.id);

    if (partError) throw partError;

    if (participants.length < 2) {
      return { error: 'Add at least 2 participants before drawing names.' };
    }

    // 4. Compute assignments (mutual pair for 2 people, backtracking for 3+)
    let assignments;
    if (participants.length === 2) {
      const [p1, p2] = participants;
      if (
        (p1.exclusions || []).includes(p2.id) ||
        (p2.exclusions || []).includes(p1.id)
      ) {
        return {
          error:
            'The 2 participants are blocked from drawing each other. Remove the exclusion or add a participant.',
        };
      }
      assignments = {
        [p1.id]: p2.id,
        [p2.id]: p1.id,
      };
    } else {
      assignments = generateSecretSantaMatches(participants);
      if (!assignments) {
        return {
          error:
            'No valid draw exists with these exclusion rules. Remove an exclusion or add a participant.',
        };
      }
    }

    // 5. Save assignments and reset envelopes
    for (const p of participants) {
      await supabaseAdmin
        .from('participants')
        .update({ assignee_id: assignments[p.id], has_revealed: false })
        .eq('id', p.id);
    }

    // 6. Mark the room as drawn
    await supabaseAdmin.from('rooms').update({ is_drawn: true }).eq('id', room.id);

    return { success: true, notice: 'Names have been drawn!' };
  } catch (err) {
    console.error('drawNames error:', err);
    return { error: 'Failed to draw names. Please try again.' };
  }
}

/**
 * Adds a new participant to an existing room and integrates them into
 * the Secret Santa match assignments.
 *
 * Algorithm & Integrity:
 * - Prefers splicing into an unrevealed edge (U -> V) so that NO participant
 *   who has already opened their envelope has their recipient changed.
 * - If all unrevealed edges are blocked or all participants have revealed,
 *   safely splices an edge and resets the single affected giver's envelope.
 * - As a last resort, executes backtracking matcher to rebalance assignments.
 * - Atomically updates assignments and mutual exclusion rules.
 */
export async function addParticipantToRoom({
  slug,
  name,
  exclusionParticipantId = null,
  adminToken = null,
}) {
  try {
    const trimmedName = (name || '').trim();
    if (!trimmedName) {
      return { error: 'Please enter a name for the participant.' };
    }

    // 1. Fetch room
    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .select('id, slug, admin_token')
      .eq('slug', slug)
      .single();

    if (roomError || !room) {
      return { error: 'Room not found.' };
    }

    // 2. Fetch existing participants
    const { data: participants, error: partError } = await supabaseAdmin
      .from('participants')
      .select('id, name, exclusions, assignee_id, has_revealed, pin_hash')
      .eq('room_id', room.id);

    if (partError) throw partError;

    // Check for duplicate name (case-insensitive)
    if (
      participants.some(
        (p) => p.name.trim().toLowerCase() === trimmedName.toLowerCase()
      )
    ) {
      return { error: `"${trimmedName}" is already in this room.` };
    }

    const newParticipantId = crypto.randomUUID();
    const newExclusions = exclusionParticipantId ? [exclusionParticipantId] : [];

    // Undrawn rooms: just add the participant without touching assignments —
    // the organizer draws names later. Apply the requested exclusion, if any.
    if (!(await getRoomDrawnStatus(room.id))) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('participants')
        .insert({
          id: newParticipantId,
          room_id: room.id,
          name: trimmedName,
          exclusions: newExclusions,
          assignee_id: null,
          dislikes: '',
          has_revealed: false,
        })
        .select('id, name')
        .single();

      if (insertError) throw insertError;

      if (exclusionParticipantId) {
        const otherPerson = participants.find((p) => p.id === exclusionParticipantId);
        if (otherPerson) {
          const updatedExclusions = Array.from(
            new Set([...(otherPerson.exclusions || []), newParticipantId])
          );
          await supabaseAdmin
            .from('participants')
            .update({ exclusions: updatedExclusions })
            .eq('id', otherPerson.id);
        }
      }

      return {
        success: true,
        participant: inserted,
        notice: `Added ${trimmedName} to the room. Draw names whenever you're ready!`,
      };
    }

    // Helper to evaluate if a directed edge U -> V can accept the new participant
    const canInsertIntoEdge = (giver, recipient) => {
      if (!giver || !recipient) return false;
      if (giver.id === newParticipantId || recipient.id === newParticipantId) return false;
      if ((giver.exclusions || []).includes(newParticipantId)) return false;
      if (newExclusions.includes(giver.id)) return false;
      if (newExclusions.includes(recipient.id)) return false;
      if ((recipient.exclusions || []).includes(newParticipantId)) return false;
      return true;
    };

    let chosenEdge = null;
    let isResettingGiverReveal = false;
    let notice = '';

    if (participants.length === 0) {
      // First person in empty room
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('participants')
        .insert({
          id: newParticipantId,
          room_id: room.id,
          name: trimmedName,
          exclusions: newExclusions,
          assignee_id: null,
          dislikes: '',
          has_revealed: false,
        })
        .select('id, name')
        .single();

      if (insertError) throw insertError;
      return { success: true, participant: inserted, notice: `Added ${trimmedName} to the room.` };
    }

    if (participants.length === 1) {
      // Second person: create mutual 2-person pair
      const p1 = participants[0];
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('participants')
        .insert({
          id: newParticipantId,
          room_id: room.id,
          name: trimmedName,
          exclusions: newExclusions,
          assignee_id: p1.id,
          dislikes: '',
          has_revealed: false,
        })
        .select('id, name')
        .single();

      if (insertError) throw insertError;

      await supabaseAdmin
        .from('participants')
        .update({ assignee_id: newParticipantId })
        .eq('id', p1.id);

      return { success: true, participant: inserted, notice: `Added ${trimmedName} to the gift exchange!` };
    }

    // Build directed edges from current assignments
    const edges = participants
      .map((p) => ({
        giver: p,
        recipient: participants.find((r) => r.id === p.assignee_id),
      }))
      .filter((e) => e.recipient);

    // Strategy A: Preferred - unrevealed edges (safest, preserves all opened envelopes)
    const validUnrevealedEdges = edges.filter(
      ({ giver, recipient }) => !giver.has_revealed && canInsertIntoEdge(giver, recipient)
    );

    if (validUnrevealedEdges.length > 0) {
      // Pick random valid unrevealed edge
      const randomIndex = Math.floor(Math.random() * validUnrevealedEdges.length);
      chosenEdge = validUnrevealedEdges[randomIndex];
    } else {
      // Strategy B: All unrevealed edges are blocked or all participants revealed
      const validAnyEdges = edges.filter(({ giver, recipient }) =>
        canInsertIntoEdge(giver, recipient)
      );

      if (validAnyEdges.length > 0) {
        const randomIndex = Math.floor(Math.random() * validAnyEdges.length);
        chosenEdge = validAnyEdges[randomIndex];
        isResettingGiverReveal = Boolean(chosenEdge.giver.has_revealed);
        if (isResettingGiverReveal) {
          notice = `${chosenEdge.giver.name}'s envelope was reset so they can reveal their new match.`;
        }
      }
    }

    if (chosenEdge) {
      // 1. Insert new participant (gives to chosenEdge.recipient)
      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from('participants')
        .insert({
          id: newParticipantId,
          room_id: room.id,
          name: trimmedName,
          exclusions: newExclusions,
          assignee_id: chosenEdge.recipient.id,
          dislikes: '',
          has_revealed: false,
        })
        .select('id, name')
        .single();

      if (insertErr) throw insertErr;

      // 2. Update giver (now gives to newParticipant)
      const giverUpdate = {
        assignee_id: newParticipantId,
        ...(isResettingGiverReveal ? { has_revealed: false } : {}),
      };

      const { error: giverUpdateErr } = await supabaseAdmin
        .from('participants')
        .update(giverUpdate)
        .eq('id', chosenEdge.giver.id);

      if (giverUpdateErr) throw giverUpdateErr;

      // 3. If exclusion was selected, add mutual exclusion to the other participant
      if (exclusionParticipantId) {
        const otherPerson = participants.find((p) => p.id === exclusionParticipantId);
        if (otherPerson) {
          const updatedExclusions = Array.from(
            new Set([...(otherPerson.exclusions || []), newParticipantId])
          );
          await supabaseAdmin
            .from('participants')
            .update({ exclusions: updatedExclusions })
            .eq('id', otherPerson.id);
        }
      }

      return {
        success: true,
        participant: inserted,
        notice: notice || `Added ${trimmedName} to the gift exchange!`,
      };
    }

    // Strategy C: Full backtracking fallback if no single edge could be spliced
    const allNodes = [
      ...participants.map((p) => ({
        id: p.id,
        name: p.name,
        exclusions: [
          ...(p.exclusions || []),
          ...(p.id === exclusionParticipantId ? [newParticipantId] : []),
        ],
      })),
      {
        id: newParticipantId,
        name: trimmedName,
        exclusions: newExclusions,
      },
    ];

    const newAssignments = generateSecretSantaMatches(allNodes);
    if (!newAssignments) {
      return {
        error:
          'Could not add participant: No valid Secret Santa draw exists with these exclusion rules.',
      };
    }

    // Insert new participant with its new assignment
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('participants')
      .insert({
        id: newParticipantId,
        room_id: room.id,
        name: trimmedName,
        exclusions: newExclusions,
        assignee_id: newAssignments[newParticipantId],
        dislikes: '',
        has_revealed: false,
      })
      .select('id, name')
      .single();

    if (insertErr) throw insertErr;

    // Update existing participants whose assignments or exclusions changed
    for (const p of participants) {
      const changedAssignee = newAssignments[p.id] !== p.assignee_id;
      const needsExclusionUpdate = p.id === exclusionParticipantId;

      if (changedAssignee || needsExclusionUpdate) {
        const updatePayload = {};
        if (changedAssignee) {
          updatePayload.assignee_id = newAssignments[p.id];
          if (p.has_revealed) {
            updatePayload.has_revealed = false;
          }
        }
        if (needsExclusionUpdate) {
          updatePayload.exclusions = Array.from(
            new Set([...(p.exclusions || []), newParticipantId])
          );
        }

        await supabaseAdmin
          .from('participants')
          .update(updatePayload)
          .eq('id', p.id);
      }
    }

    return {
      success: true,
      participant: inserted,
      notice: `Added ${trimmedName} and rebalanced the draw.`,
    };
  } catch (err) {
    console.error('addParticipantToRoom error:', err);
    return { error: 'Failed to add participant. Please try again.' };
  }
}
