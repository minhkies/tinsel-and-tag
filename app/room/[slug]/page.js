'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
    Gift,
    Lock,
    Unlock,
    Copy,
    Check,
    Plus,
    Trash2,
    Sparkles,
    Calendar,
    DollarSign,
    ArrowLeft,
    Eye,
    EyeOff,
    Heart,
    Ban,
    ChevronDown,
    ChevronUp,
    UserCheck,
    KeyRound,
    Info,
    X,
    ExternalLink,
    Link2,
    Pencil,
    Tag,
    Loader2,
} from 'lucide-react';
import PinInput from '@/components/PinInput';
import {
    getRoomLobby,
    claimOrUnlockParticipant,
    getUnlockedDashboard,
    markEnvelopeRevealed,
    addWishlistItem,
    updateWishlistItem,
    deleteWishlistItem,
    updateDislikes,
    lockParticipantSession,
    organizerResetPin,
} from '@/app/actions';

const AVATAR_PALETTES = [
    'bg-[#1B4332] text-[#FAF9F6]',
    'bg-[#C84B31] text-[#FAF9F6]',
    'bg-[#8C6D46] text-[#FAF9F6]',
    'bg-[#2D5A4C] text-[#FAF9F6]',
    'bg-[#9E3B24] text-[#FAF9F6]',
    'bg-[#4A5D4E] text-[#FAF9F6]',
];

function getInitials(name) {
    return (name || '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('');
}

function getDomainLabel(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return 'Link';
    }
}

function RoomContent() {
    const params = useParams();
    const slug = params?.slug;

    // Loading & error states
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    // Room lobby state
    const [room, setRoom] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [activeParticipantId, setActiveParticipantId] = useState(null);

    // View mode: 'lobby' | 'dashboard'
    const [view, setView] = useState('lobby');

    // Unlocked private dashboard payload
    const [dashboard, setDashboard] = useState(null);
    const [isCardRevealed, setIsCardRevealed] = useState(false);

    // Organizer token (read from localStorage)
    const [adminToken, setAdminToken] = useState('');
    const [showOrganizerDrawer, setShowOrganizerDrawer] = useState(false);

    // PIN Modal state
    const [modalTarget, setModalTarget] = useState(null);
    const [pinBuffer, setPinBuffer] = useState('');
    const [pinHintInput, setPinHintInput] = useState('');
    const [pinError, setPinError] = useState('');
    const [verifyingPin, setVerifyingPin] = useState(false);

    // Wishlist item creation & inline edit state
    const [newItemTitle, setNewItemTitle] = useState('');
    const [newItemUrl, setNewItemUrl] = useState('');
    const [newItemNote, setNewItemNote] = useState('');
    const [addingItem, setAddingItem] = useState(false);

    const [editingItemId, setEditingItemId] = useState(null);
    const [editItemDraft, setEditItemDraft] = useState({
        title: '',
        url: '',
        note: '',
    });

    // Dislikes controlled text + save indicator
    const [dislikesDraft, setDislikesDraft] = useState('');
    const [savedBadge, setSavedBadge] = useState(false);
    const [copiedLink, setCopiedLink] = useState(false);
    const [toastMessage, setToastMessage] = useState('');

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage((prev) => (prev === msg ? '' : prev)), 3000);
    };

    const triggerSavedBadge = () => {
        setSavedBadge(true);
        setTimeout(() => setSavedBadge(false), 1800);
    };

    const loadRoomData = useCallback(async () => {
        if (!slug) return;
        const lobbyRes = await getRoomLobby(slug);
        if (lobbyRes.error) {
            setLoadError(lobbyRes.error);
            setLoading(false);
            return;
        }

        setRoom(lobbyRes.room);
        setParticipants(lobbyRes.participants);
        setActiveParticipantId(lobbyRes.activeParticipantId);

        // If user already has a valid HttpOnly session cookie, unlock dashboard automatically
        if (lobbyRes.activeParticipantId) {
            const dashRes = await getUnlockedDashboard(slug);
            if (!dashRes.error) {
                setDashboard(dashRes);
                setDislikesDraft(dashRes.me.dislikes || '');
                setIsCardRevealed(dashRes.me.hasRevealed);
                setView('dashboard');
            }
        }

        setLoading(false);
    }, [slug]);

    useEffect(() => {
        loadRoomData();
        if (typeof window !== 'undefined' && slug) {
            const storedToken = localStorage.getItem(`ss_admin_${slug}`);
            if (storedToken) setAdminToken(storedToken);
        }
    }, [slug, loadRoomData]);

    const formatDate = (isoDate) => {
        if (!isoDate) return 'TBD';
        const [y, m, d] = isoDate.split('-').map(Number);
        if (!y || !m || !d) return isoDate;
        return new Date(y, m - 1, d).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const handleCopyInviteLink = () => {
        if (typeof window !== 'undefined') {
            navigator.clipboard?.writeText(window.location.href).catch(() => { });
        }
        setCopiedLink(true);
        showToast('Group invite link copied!');
        setTimeout(() => setCopiedLink(false), 2500);
    };

    // ==========================================================================
    // PIN CLAIM / UNLOCK
    // ==========================================================================
    const handleSelectParticipant = async (person) => {
        if (activeParticipantId === person.id && dashboard) {
            setView('dashboard');
            return;
        }
        setModalTarget(person);
        setPinBuffer('');
        setPinHintInput('');
        setPinError('');
    };

    const handlePinSubmit = async (submittedPin = pinBuffer) => {
        if (!modalTarget || submittedPin.length !== 4 || verifyingPin) return;

        setVerifyingPin(true);
        setPinError('');

        const res = await claimOrUnlockParticipant({
            slug,
            participantId: modalTarget.id,
            pin: submittedPin,
            pinHint: pinHintInput,
        });

        setVerifyingPin(false);

        if (res.error) {
            setPinError(res.error);
            setPinBuffer('');
            return;
        }

        setDashboard(res);
        setDislikesDraft(res.me.dislikes || '');
        setIsCardRevealed(res.me.hasRevealed);
        setActiveParticipantId(res.me.id);
        setModalTarget(null);
        setPinBuffer('');
        setView('dashboard');
        await loadRoomData();
    };

    // ==========================================================================
    // DASHBOARD & WISHLIST ACTIONS
    // ==========================================================================
    const handleRevealCard = async () => {
        if (isCardRevealed) return;
        setIsCardRevealed(true);
        await markEnvelopeRevealed(slug);
    };

    const handleAddWishlistItem = async (e) => {
        e.preventDefault();
        if (!newItemTitle.trim() || addingItem) return;

        setAddingItem(true);
        const res = await addWishlistItem(slug, {
            title: newItemTitle,
            url: newItemUrl,
            note: newItemNote,
        });
        setAddingItem(false);

        if (res.error) {
            showToast(res.error);
            return;
        }

        setDashboard((prev) => ({
            ...prev,
            me: {
                ...prev.me,
                wishlist: [...prev.me.wishlist, res.item],
            },
        }));
        setNewItemTitle('');
        setNewItemUrl('');
        setNewItemNote('');
        triggerSavedBadge();
    };

    const handleSaveEditItem = async (itemId) => {
        if (!editItemDraft.title.trim()) return;

        const res = await updateWishlistItem(slug, itemId, editItemDraft);
        if (res.error) {
            showToast(res.error);
            return;
        }

        setDashboard((prev) => ({
            ...prev,
            me: {
                ...prev.me,
                wishlist: prev.me.wishlist.map((item) =>
                    item.id === itemId ? res.item : item
                ),
            },
        }));
        setEditingItemId(null);
        triggerSavedBadge();
    };

    const handleDeleteItem = async (itemId) => {
        const res = await deleteWishlistItem(slug, itemId);
        if (res.error) {
            showToast(res.error);
            return;
        }

        setDashboard((prev) => ({
            ...prev,
            me: {
                ...prev.me,
                wishlist: prev.me.wishlist.filter((item) => item.id !== itemId),
            },
        }));
        triggerSavedBadge();
    };

    const handleSaveDislikes = async () => {
        const res = await updateDislikes(slug, dislikesDraft);
        if (!res.error) {
            triggerSavedBadge();
        }
    };

    const handleLockSession = async () => {
        await lockParticipantSession(slug);
        setActiveParticipantId(null);
        setDashboard(null);
        setIsCardRevealed(false);
        setView('lobby');
        showToast('Session locked.');
    };

    const handleResetPin = async (participantId, personName) => {
        const res = await organizerResetPin({
            slug,
            adminToken,
            participantId,
        });
        if (res.error) {
            showToast(res.error);
            return;
        }
        showToast(`Reset PIN for ${personName}.`);
        await loadRoomData();
    };

    // ==========================================================================
    // RENDER STATES
    // ==========================================================================
    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center text-[#1B4332]">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (loadError || !room) {
        return (
            <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center p-4 text-center">
                <h2 className="text-2xl font-bold text-[#1C1917] mb-2">
                    Room Not Found
                </h2>
                <p className="text-sm text-[#57534E] mb-6">
                    {loadError || 'Double-check your invite link or create a new room.'}
                </p>
                <Link
                    href="/"
                    className="px-5 py-3 rounded-2xl bg-[#1B4332] text-[#FAF9F6] font-semibold text-sm"
                >
                    Create a New Secret Santa Room
                </Link>
            </div>
        );
    }

    const claimedCount = participants.filter((p) => p.isClaimed).length;

    return (
        <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] pb-16">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
                    <div className="bg-[#1C1917] text-[#FAF9F6] px-4 py-2.5 rounded-full shadow-xl flex items-center gap-2 text-sm font-medium">
                        <Check className="w-4 h-4 text-[#D4A373]" />
                        <span>{toastMessage}</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="max-w-3xl mx-auto px-4 pt-8 pb-4 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-[#1B4332] text-[#FAF9F6] flex items-center justify-center shadow-sm">
                        <Gift className="w-5 h-5 text-[#D4A373]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-[#1C1917] leading-none">
                            Tinsel &amp; Tag
                        </h1>
                        <p className="text-xs text-[#78716C] mt-0.5">
                            Zero-account Secret Santa
                        </p>
                    </div>
                </Link>

                <span className="text-xs font-mono bg-white border border-[#E7E5E0] px-3 py-1.5 rounded-full text-[#57534E]">
                    /room/{room.slug}
                </span>
            </header>

            <main className="max-w-3xl mx-auto px-4 mt-2">
                {/* ==================================================================
            VIEW 1: ROOM LOBBY
        ================================================================== */}
                {view === 'lobby' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-xs font-semibold">
                                            <Check className="w-3.5 h-3.5" /> Names Drawn
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] text-[#57534E] text-xs font-medium">
                                            <DollarSign className="w-3.5 h-3.5 text-[#D4A373]" />
                                            Budget: {room.budget}
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] text-[#57534E] text-xs font-medium">
                                            <Calendar className="w-3.5 h-3.5 text-[#C84B31]" />
                                            {formatDate(room.exchangeDate)}
                                        </span>
                                    </div>
                                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917]">
                                        {room.name}
                                    </h2>
                                    <p className="text-sm text-[#57534E] mt-1">
                                        Tap your name below to set a 4-digit PIN and reveal your
                                        Secret Santa recipient.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCopyInviteLink}
                                    className={`shrink-0 px-4 py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${copiedLink
                                            ? 'bg-[#1B4332] text-[#FAF9F6]'
                                            : 'bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#1C1917] border border-[#E7E5E0]'
                                        }`}
                                >
                                    {copiedLink ? (
                                        <>
                                            <Check className="w-4 h-4 text-[#D4A373]" />
                                            <span>Copied Link!</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4 text-[#1B4332]" />
                                            <span>Copy Group Invite Link</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Progress + Organizer Controls */}
                            <div className="mt-6 pt-5 border-t border-[#E7E5E0] flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-[#57534E]">
                                        {claimedCount} of {participants.length} claimed
                                    </span>
                                    <div className="w-28 h-2 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] overflow-hidden">
                                        <div
                                            className="h-full bg-[#1B4332] transition-all duration-500"
                                            style={{
                                                width: `${(claimedCount / participants.length) * 100}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                {adminToken && (
                                    <button
                                        type="button"
                                        onClick={() => setShowOrganizerDrawer((prev) => !prev)}
                                        className="text-xs font-semibold text-[#8C6D46] hover:text-[#1C1917] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D4A373]/15 transition cursor-pointer"
                                    >
                                        <KeyRound className="w-3.5 h-3.5" />
                                        <span>Organizer Controls</span>
                                        {showOrganizerDrawer ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                                )}
                            </div>

                            {adminToken && showOrganizerDrawer && (
                                <div className="mt-4 p-4 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] space-y-2.5">
                                    <span className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                                        Reset Participant PINs (Without Reshuffling)
                                    </span>
                                    <div className="divide-y divide-[#E7E5E0]">
                                        {participants.map((p) => (
                                            <div
                                                key={p.id}
                                                className="py-2 flex items-center justify-between text-sm"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-[#1C1917]">
                                                        {p.name}
                                                    </span>
                                                    {p.isClaimed ? (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1B4332]/10 text-[#1B4332] font-medium">
                                                            PIN Set {p.pinHint ? `(${p.pinHint})` : ''}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E7E5E0]/70 text-[#78716C]">
                                                            Unclaimed
                                                        </span>
                                                    )}
                                                </div>
                                                {p.isClaimed && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetPin(p.id, p.name)}
                                                        className="text-xs font-semibold text-[#C84B31] hover:underline cursor-pointer"
                                                    >
                                                        Reset PIN
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Participant Cards */}
                        <div>
                            <div className="flex items-center justify-between mb-3 px-1">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-[#57534E]">
                                    Who are you?
                                </h3>
                                {activeParticipantId && dashboard && (
                                    <button
                                        type="button"
                                        onClick={() => setView('dashboard')}
                                        className="text-xs font-semibold text-[#1B4332] hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                        <span>Return to my match</span>
                                        <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {participants.map((person, idx) => {
                                    const isCurrentSession = activeParticipantId === person.id;

                                    return (
                                        <button
                                            key={person.id}
                                            type="button"
                                            onClick={() => handleSelectParticipant(person)}
                                            className={`p-4 rounded-2xl border text-left transition flex items-center justify-between group cursor-pointer ${isCurrentSession
                                                    ? 'bg-[#1B4332] text-[#FAF9F6] border-[#1B4332] shadow-md'
                                                    : 'bg-white hover:border-[#1B4332] border-[#E7E5E0] shadow-2xs'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <div
                                                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${isCurrentSession
                                                            ? 'bg-[#D4A373] text-[#1C1917]'
                                                            : AVATAR_PALETTES[idx % AVATAR_PALETTES.length]
                                                        }`}
                                                >
                                                    {getInitials(person.name)}
                                                </div>
                                                <div>
                                                    <div
                                                        className={`font-bold text-base ${isCurrentSession
                                                                ? 'text-[#FAF9F6]'
                                                                : 'text-[#1C1917]'
                                                            }`}
                                                    >
                                                        {person.name}
                                                    </div>
                                                    <div className="mt-0.5">
                                                        {isCurrentSession ? (
                                                            <span className="text-xs text-[#D8E2DC] font-medium">
                                                                Active session • Tap to open
                                                            </span>
                                                        ) : person.isClaimed ? (
                                                            <span className="text-xs text-[#78716C] flex items-center gap-1">
                                                                <Lock className="w-3 h-3 text-[#8C6D46]" />
                                                                Claimed • Tap to unlock
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-[#1B4332] font-semibold flex items-center gap-1">
                                                                <UserCheck className="w-3.5 h-3.5" />
                                                                Available • Claim spot
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div
                                                className={`w-8 h-8 rounded-full flex items-center justify-center ${isCurrentSession
                                                        ? 'bg-white/15 text-[#FAF9F6]'
                                                        : person.isClaimed
                                                            ? 'bg-[#FAF9F6] text-[#78716C]'
                                                            : 'bg-[#1B4332]/10 text-[#1B4332]'
                                                    }`}
                                            >
                                                {person.isClaimed ? (
                                                    <Lock className="w-4 h-4" />
                                                ) : (
                                                    <Unlock className="w-4 h-4" />
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* ==================================================================
            VIEW 2: UNLOCKED DASHBOARD
        ================================================================== */}
                {view === 'dashboard' && dashboard && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setView('lobby')}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>Back to Lobby</span>
                            </button>

                            <button
                                type="button"
                                onClick={handleLockSession}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white border border-[#E7E5E0] hover:bg-[#FDF2F0] hover:text-[#C84B31] text-xs font-semibold text-[#57534E] transition cursor-pointer"
                            >
                                <Lock className="w-3.5 h-3.5" />
                                <span>Lock &amp; Switch Person</span>
                            </button>
                        </div>

                        {/* Signed-in Banner */}
                        <div className="flex items-center justify-between bg-white px-5 py-4 rounded-2xl border border-[#E7E5E0]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#1B4332] text-[#FAF9F6] flex items-center justify-center font-bold text-sm">
                                    {getInitials(dashboard.me.name)}
                                </div>
                                <div>
                                    <p className="text-xs text-[#78716C]">Signed in as</p>
                                    <p className="font-bold text-[#1C1917]">
                                        {dashboard.me.name}
                                    </p>
                                </div>
                            </div>
                            <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E7E5E0] text-[#78716C]">
                                PIN: ••••
                            </span>
                        </div>

                        {/* Secret Santa Reveal Envelope / Card */}
                        {!isCardRevealed ? (
                            <div
                                onClick={handleRevealCard}
                                className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1B4332] via-[#183A2B] to-[#10281E] text-[#FAF9F6] p-8 sm:p-12 text-center shadow-xl border border-[#2D5A4C] cursor-pointer group"
                            >
                                <div className="absolute inset-3 rounded-2xl border border-[#D4A373]/30 pointer-events-none" />
                                <div className="relative z-10 flex flex-col items-center">
                                    <div className="w-16 h-16 rounded-2xl bg-[#D4A373]/20 border border-[#D4A373]/40 flex items-center justify-center mb-5">
                                        <Gift className="w-8 h-8 text-[#D4A373]" />
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#D4A373] mb-2">
                                        Top Secret • For {dashboard.me.name}’s Eyes Only
                                    </span>
                                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                                        Your Secret Santa Match is Ready
                                    </h3>
                                    <p className="text-sm text-[#D8E2DC] max-w-md mb-7">
                                        Make sure nobody is peeking over your shoulder, then tap
                                        below to open your envelope.
                                    </p>
                                    <span className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#D4A373] text-[#1C1917] font-bold text-sm shadow-lg">
                                        <Eye className="w-4 h-4" />
                                        <span>Tap to Reveal My Match</span>
                                    </span>
                                </div>
                            </div>
                        ) : (
                            dashboard.recipient && (
                                <div className="rounded-3xl bg-white border-2 border-[#1B4332] overflow-hidden shadow-md">
                                    <div className="bg-[#1B4332] text-[#FAF9F6] px-6 py-4 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Sparkles className="w-4 h-4 text-[#D4A373]" />
                                            <span className="text-xs font-bold uppercase tracking-wider text-[#D8E2DC]">
                                                You are Secret Santa for
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsCardRevealed(false)}
                                            className="text-xs text-[#D8E2DC] hover:text-white flex items-center gap-1 cursor-pointer"
                                        >
                                            <EyeOff className="w-3.5 h-3.5" />
                                            <span>Hide</span>
                                        </button>
                                    </div>

                                    <div className="p-6 sm:p-8">
                                        <div className="flex items-center gap-4 pb-6 border-b border-[#E7E5E0]">
                                            <div className="w-16 h-16 rounded-2xl bg-[#C84B31] text-[#FAF9F6] flex items-center justify-center text-2xl font-bold shadow-sm">
                                                {getInitials(dashboard.recipient.name)}
                                            </div>
                                            <div>
                                                <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1C1917]">
                                                    {dashboard.recipient.name}
                                                </h3>
                                                <p className="text-xs text-[#78716C] mt-1">
                                                    Budget: {room.budget} • Exchange:{' '}
                                                    {formatDate(room.exchangeDate)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Recipient Wishlist */}
                                        <div className="mt-6 space-y-4">
                                            <div className="p-4 sm:p-5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0]">
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1B4332]">
                                                        <Heart className="w-4 h-4 text-[#C84B31]" />
                                                        <span>
                                                            What {dashboard.recipient.name} is Wishing For
                                                        </span>
                                                    </div>
                                                </div>

                                                {dashboard.recipient.wishlist.length > 0 ? (
                                                    <div className="space-y-2.5">
                                                        {dashboard.recipient.wishlist.map((item, idx) => (
                                                            <div
                                                                key={item.id}
                                                                className="p-3.5 rounded-xl bg-white border border-[#E7E5E0] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                                            >
                                                                <div className="flex items-start gap-2.5 min-w-0">
                                                                    <span className="w-5 h-5 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                                                        {idx + 1}
                                                                    </span>
                                                                    <div className="min-w-0">
                                                                        <p className="font-semibold text-sm text-[#1C1917]">
                                                                            {item.title}
                                                                        </p>
                                                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                                                            {item.note && (
                                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FAF9F6] border border-[#E7E5E0] text-[#57534E] text-xs font-medium">
                                                                                    <Tag className="w-3 h-3 text-[#D4A373]" />
                                                                                    {item.note}
                                                                                </span>
                                                                            )}
                                                                            {item.url && (
                                                                                <span className="text-[11px] text-[#78716C]">
                                                                                    {getDomainLabel(item.url)}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {item.url ? (
                                                                    <a
                                                                        href={item.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1B4332] hover:bg-[#143326] text-[#FAF9F6] text-xs font-semibold transition"
                                                                    >
                                                                        <span>View Link</span>
                                                                        <ExternalLink className="w-3.5 h-3.5 text-[#D4A373]" />
                                                                    </a>
                                                                ) : (
                                                                    <span className="shrink-0 text-[11px] font-medium text-[#A8A29E] px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E7E5E0]">
                                                                        Idea only
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-[#A8A29E] italic py-2">
                                                        Hasn’t added gift ideas yet—check back later!
                                                    </p>
                                                )}
                                            </div>

                                            {/* Recipient Allergies / Avoid */}
                                            <div className="p-4 rounded-2xl bg-[#FDF2F0]/60 border border-[#F5D0C8]">
                                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#9E3B24] mb-2">
                                                    <Ban className="w-4 h-4 text-[#C84B31]" />
                                                    <span>Allergies &amp; Things to Avoid</span>
                                                </div>
                                                {dashboard.recipient.dislikes?.trim() ? (
                                                    <p className="text-sm text-[#1C1917] whitespace-pre-line">
                                                        {dashboard.recipient.dislikes}
                                                    </p>
                                                ) : (
                                                    <p className="text-sm text-[#A8A29E] italic">
                                                        No dislikes or allergies listed.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        )}

                        {/* My Wishlist Editor */}
                        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h3 className="text-lg font-bold text-[#1C1917]">
                                        My Wishlist &amp; Gift Hints
                                    </h3>
                                    <p className="text-xs text-[#78716C] mt-0.5">
                                        Add gift ideas with optional links. Changes save
                                        immediately for your Secret Santa!
                                    </p>
                                </div>

                                {savedBadge && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-xs font-semibold">
                                        <Check className="w-3.5 h-3.5" /> Saved
                                    </span>
                                )}
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-2.5">
                                        My Gift List ({dashboard.me.wishlist.length})
                                    </label>

                                    {dashboard.me.wishlist.length > 0 && (
                                        <div className="space-y-2.5 mb-4">
                                            {dashboard.me.wishlist.map((item) =>
                                                editingItemId === item.id ? (
                                                    <div
                                                        key={item.id}
                                                        className="p-4 rounded-2xl bg-[#FAF9F6] border-2 border-[#1B4332] space-y-3"
                                                    >
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                            <input
                                                                type="text"
                                                                value={editItemDraft.title}
                                                                onChange={(e) =>
                                                                    setEditItemDraft({
                                                                        ...editItemDraft,
                                                                        title: e.target.value,
                                                                    })
                                                                }
                                                                placeholder="Gift item name *"
                                                                className="sm:col-span-2 px-3 py-2 rounded-xl bg-white border border-[#E7E5E0] text-sm font-medium outline-none"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={editItemDraft.note}
                                                                onChange={(e) =>
                                                                    setEditItemDraft({
                                                                        ...editItemDraft,
                                                                        note: e.target.value,
                                                                    })
                                                                }
                                                                placeholder="Price or note"
                                                                className="px-3 py-2 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none"
                                                            />
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row gap-2.5">
                                                            <div className="relative flex-1">
                                                                <Link2 className="w-4 h-4 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2" />
                                                                <input
                                                                    type="text"
                                                                    value={editItemDraft.url}
                                                                    onChange={(e) =>
                                                                        setEditItemDraft({
                                                                            ...editItemDraft,
                                                                            url: e.target.value,
                                                                        })
                                                                    }
                                                                    placeholder="Optional product link (https://...)"
                                                                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingItemId(null)}
                                                                    className="px-3 py-2 rounded-xl text-xs font-semibold text-[#57534E] cursor-pointer"
                                                                >
                                                                    Cancel
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSaveEditItem(item.id)}
                                                                    className="px-4 py-2 rounded-xl bg-[#1B4332] text-[#FAF9F6] text-xs font-semibold cursor-pointer"
                                                                >
                                                                    Save Item
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        key={item.id}
                                                        className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] flex items-center justify-between gap-3"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="font-semibold text-sm text-[#1C1917]">
                                                                    {item.title}
                                                                </span>
                                                                {item.note && (
                                                                    <span className="px-2 py-0.5 rounded-md bg-white border border-[#E7E5E0] text-[#57534E] text-xs font-medium">
                                                                        {item.note}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {item.url && (
                                                                <a
                                                                    href={item.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332] hover:underline mt-1"
                                                                >
                                                                    <Link2 className="w-3 h-3" />
                                                                    <span>{getDomainLabel(item.url)}</span>
                                                                    <ExternalLink className="w-3 h-3" />
                                                                </a>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setEditingItemId(item.id);
                                                                    setEditItemDraft({
                                                                        title: item.title,
                                                                        url: item.url || '',
                                                                        note: item.note || '',
                                                                    });
                                                                }}
                                                                className="p-2 rounded-xl text-[#78716C] hover:text-[#1C1917] hover:bg-white cursor-pointer"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteItem(item.id)}
                                                                className="p-2 rounded-xl text-[#78716C] hover:text-[#C84B31] hover:bg-[#FDF2F0] cursor-pointer"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}

                                    {/* Add Item Form */}
                                    <form
                                        onSubmit={handleAddWishlistItem}
                                        className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] space-y-2.5"
                                    >
                                        <div className="text-xs font-bold text-[#1C1917] flex items-center gap-1.5">
                                            <Plus className="w-3.5 h-3.5 text-[#1B4332]" />
                                            <span>Add a Wishlist Item</span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <input
                                                type="text"
                                                value={newItemTitle}
                                                onChange={(e) => setNewItemTitle(e.target.value)}
                                                placeholder="Item name (e.g. Ceramic Pour-Over)"
                                                className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                            />
                                            <input
                                                type="text"
                                                value={newItemNote}
                                                onChange={(e) => setNewItemNote(e.target.value)}
                                                placeholder="Price / Size / Color"
                                                className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                            />
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-2.5">
                                            <div className="relative flex-1">
                                                <Link2 className="w-4 h-4 text-[#78716C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    value={newItemUrl}
                                                    onChange={(e) => setNewItemUrl(e.target.value)}
                                                    placeholder="Product link (optional, e.g. amazon.ca/...)"
                                                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={!newItemTitle.trim() || addingItem}
                                                className="px-5 py-2.5 rounded-xl bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-sm font-semibold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
                                            >
                                                <Plus className="w-4 h-4" />
                                                <span>{addingItem ? 'Adding...' : 'Add Item'}</span>
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Dislikes / Allergies */}
                                <div className="pt-4 border-t border-[#E7E5E0]">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                                        Allergies or Things to Avoid
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={dislikesDraft}
                                        onChange={(e) => setDislikesDraft(e.target.value)}
                                        onBlur={handleSaveDislikes}
                                        placeholder="e.g., Nut allergy, no scented candles..."
                                        className="w-full px-4 py-3 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm outline-none focus:bg-white focus:border-[#1B4332] resize-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* ====================================================================
          4-DIGIT PIN MODAL
      ==================================================================== */}
            {modalTarget && (
                <div
                    className="fixed inset-0 z-40 bg-[#1C1917]/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={() => setModalTarget(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-2xl"
                    >
                        <div className="flex items-start justify-between mb-5">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-[#1B4332] text-[#FAF9F6] flex items-center justify-center font-bold text-sm">
                                    {getInitials(modalTarget.name)}
                                </div>
                                <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6D46]">
                                        {modalTarget.isClaimed
                                            ? 'Locked Profile'
                                            : 'Claim Your Spot'}
                                    </span>
                                    <h3 className="text-xl font-bold text-[#1C1917]">
                                        {modalTarget.isClaimed
                                            ? `Welcome back, ${modalTarget.name}`
                                            : `Are you ${modalTarget.name}?`}
                                    </h3>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setModalTarget(null)}
                                className="p-2 rounded-xl text-[#78716C] hover:bg-[#FAF9F6] cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-[#57534E] mb-6">
                            {modalTarget.isClaimed
                                ? 'Enter your 4-digit PIN to unlock your Secret Santa match and edit your wishlist.'
                                : 'Create a quick 4-digit PIN so nobody else in the group chat can peek at who you drew.'}
                        </p>

                        <div className="mb-5">
                            <PinInput
                                value={pinBuffer}
                                onChange={(val) => {
                                    setPinBuffer(val);
                                    if (pinError) setPinError('');
                                }}
                                onComplete={(val) => handlePinSubmit(val)}
                                hasError={Boolean(pinError)}
                            />
                        </div>

                        {!modalTarget.isClaimed && (
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-[#57534E] mb-1">
                                    Optional PIN Reminder (e.g., “Birth year”)
                                </label>
                                <input
                                    type="text"
                                    value={pinHintInput}
                                    onChange={(e) => setPinHintInput(e.target.value)}
                                    placeholder="Optional hint in case you forget..."
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                />
                            </div>
                        )}

                        {modalTarget.isClaimed && modalTarget.pinHint && (
                            <div className="mb-5 flex items-center justify-center gap-1.5 text-xs text-[#78716C] bg-[#FAF9F6] py-2 px-3 rounded-xl border border-[#E7E5E0]">
                                <Info className="w-3.5 h-3.5 text-[#D4A373]" />
                                <span>Your hint: “{modalTarget.pinHint}”</span>
                            </div>
                        )}

                        {pinError && (
                            <p className="text-center text-xs font-semibold text-[#C84B31] mb-4">
                                {pinError}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={() => handlePinSubmit()}
                            disabled={pinBuffer.length !== 4 || verifyingPin}
                            className={`w-full py-3.5 px-5 rounded-2xl font-bold text-sm transition flex items-center justify-center gap-2 ${pinBuffer.length === 4
                                    ? 'bg-[#1B4332] hover:bg-[#143326] text-[#FAF9F6] cursor-pointer'
                                    : 'bg-[#E7E5E0] text-[#A8A29E] cursor-not-allowed'
                                }`}
                        >
                            <Lock className="w-4 h-4" />
                            <span>
                                {verifyingPin
                                    ? 'Checking...'
                                    : modalTarget.isClaimed
                                        ? 'Unlock My Match'
                                        : 'Set PIN & See My Match'}
                            </span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function RoomPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center text-[#1B4332]">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            }
        >
            <RoomContent />
        </Suspense>
    );
}