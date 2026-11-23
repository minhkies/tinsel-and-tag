'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
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
import { useLanguage, LanguageToggle } from '@/lib/LanguageContext';
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
    verifyOrganizerPin,
    organizerResetPin,
    addParticipantToRoom,
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
    const { t, language } = useLanguage();

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

    // Keep refs to avoid stale closures in polling interval
    const viewRef = useRef(view);
    const dashboardRef = useRef(dashboard);

    useEffect(() => {
        viewRef.current = view;
        dashboardRef.current = dashboard;
    }, [view, dashboard]);

    // Organizer token (read from localStorage or query param)
    const [adminToken, setAdminToken] = useState(() => {
        if (typeof window !== 'undefined' && slug) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('admin') || localStorage.getItem(`ss_admin_${slug}`) || '';
        }
        return '';
    });
    const [showOrganizerDrawer, setShowOrganizerDrawer] = useState(false);

    // Add Person Modal & quick add state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addNameInput, setAddNameInput] = useState('');
    const [addExclusionInput, setAddExclusionInput] = useState('');
    const [addError, setAddError] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [quickAddName, setQuickAddName] = useState('');
    const [isQuickAdding, setIsQuickAdding] = useState(false);

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

    // Organizer PIN modal state
    const [isOrganizerPinModalOpen, setIsOrganizerPinModalOpen] = useState(false);
    const [organizerPinBuffer, setOrganizerPinBuffer] = useState('');
    const [organizerPinError, setOrganizerPinError] = useState('');
    const [verifyingOrganizerPin, setVerifyingOrganizerPin] = useState(false);

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

        const currentView = viewRef.current;
        const currentDash = dashboardRef.current;

        // If currently inside the dashboard view, verify the active session is still valid
        if (currentView === 'dashboard' && currentDash) {
            const currentMyId = currentDash.me.id;
            const currentParticipantInLobby = lobbyRes.participants.find((p) => p.id === currentMyId);

            // If PIN was reset or participant spot is no longer claimed or cookie is gone
            if (!lobbyRes.activeParticipantId || !currentParticipantInLobby?.isClaimed) {
                setActiveParticipantId(null);
                setDashboard(null);
                setIsCardRevealed(false);
                setView('lobby');
                showToast(t('room.pinResetNotice'));
            } else {
                setActiveParticipantId(lobbyRes.activeParticipantId);
            }
        } else {
            // When in the lobby, participant is always locked out
            setActiveParticipantId(null);
            setDashboard(null);
        }

        setLoading(false);
    }, [slug, t]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadRoomData();

        if (typeof window !== 'undefined' && slug) {
            const urlParams = new URLSearchParams(window.location.search);
            const queryAdmin = urlParams.get('admin');
            if (queryAdmin) {
                localStorage.setItem(`ss_admin_${slug}`, queryAdmin);
                // Strip the admin parameter from the visible URL bar for safety
                const cleanUrl = window.location.pathname;
                window.history.replaceState({}, '', cleanUrl);
            }
        }

        // Auto-refresh interval (every 3 seconds) to detect PIN resets and room updates in real time
        const intervalId = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                loadRoomData();
            }
        }, 3000);

        const handleVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                loadRoomData();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [slug, loadRoomData]);

    const formatDate = (isoDate) => {
        if (!isoDate) return t('common.tbd');
        const [y, m, d] = isoDate.split('-').map(Number);
        if (!y || !m || !d) return isoDate;
        if (language === 'vi') {
            return `${d}/${m}/${y}`;
        }
        return new Date(y, m - 1, d).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const handleCopyInviteLink = () => {
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.delete('admin');
            navigator.clipboard?.writeText(url.toString()).catch(() => { });
        }
        setCopiedLink(true);
        showToast(t('room.copiedLink'));
        setTimeout(() => setCopiedLink(false), 2500);
    };

    const handleCopyOrganizerLink = () => {
        if (typeof window !== 'undefined' && adminToken) {
            const organizerUrl = `${window.location.origin}/room/${slug}?admin=${adminToken}`;
            navigator.clipboard?.writeText(organizerUrl).catch(() => { });
            showToast(t('room.organizerLinkToast'));
        }
    };

    const handleAddParticipant = async (e) => {
        if (e) e.preventDefault();
        const trimmed = addNameInput.trim();
        if (!trimmed || isAdding) return;

        setIsAdding(true);
        setAddError('');

        const res = await addParticipantToRoom({
            slug,
            name: trimmed,
            exclusionParticipantId: addExclusionInput || null,
            adminToken: adminToken || null,
        });

        setIsAdding(false);

        if (res.error) {
            setAddError(res.error);
            return;
        }

        showToast(res.notice || `Added ${trimmed} to the room!`);
        setIsAddModalOpen(false);
        setAddNameInput('');
        setAddExclusionInput('');
        await loadRoomData();
    };

    const handleQuickAdd = async (e) => {
        e.preventDefault();
        const trimmed = quickAddName.trim();
        if (!trimmed || isQuickAdding) return;

        setIsQuickAdding(true);
        const res = await addParticipantToRoom({
            slug,
            name: trimmed,
            adminToken: adminToken || null,
        });
        setIsQuickAdding(false);

        if (res.error) {
            showToast(res.error);
            return;
        }

        showToast(res.notice || `Added ${trimmed} to the room!`);
        setQuickAddName('');
        await loadRoomData();
    };

    // ==========================================================================
    // PIN CLAIM / UNLOCK
    // ==========================================================================
    const handleSelectParticipant = (person) => {
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
            if (res.error === 'PIN_RESET') {
                setActiveParticipantId(null);
                setDashboard(null);
                setIsCardRevealed(false);
                setView('lobby');
                showToast(t('room.pinResetNotice'));
                return;
            }
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
            if (res.error === 'PIN_RESET') {
                setActiveParticipantId(null);
                setDashboard(null);
                setIsCardRevealed(false);
                setView('lobby');
                showToast(t('room.pinResetNotice'));
                return;
            }
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
            if (res.error === 'PIN_RESET') {
                setActiveParticipantId(null);
                setDashboard(null);
                setIsCardRevealed(false);
                setView('lobby');
                showToast(t('room.pinResetNotice'));
                return;
            }
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
        if (res?.error === 'PIN_RESET') {
            setActiveParticipantId(null);
            setDashboard(null);
            setIsCardRevealed(false);
            setView('lobby');
            showToast(t('room.pinResetNotice'));
            return;
        }
        if (!res?.error) {
            triggerSavedBadge();
        }
    };

    const handleBackToLobby = async () => {
        await lockParticipantSession(slug);
        setActiveParticipantId(null);
        setDashboard(null);
        setIsCardRevealed(false);
        setView('lobby');
    };

    // ==========================================================================
    // ORGANIZER PIN UNLOCK
    // ==========================================================================
    const handleOrganizerControlsClick = () => {
        if (adminToken) {
            setShowOrganizerDrawer((prev) => !prev);
        } else {
            setOrganizerPinBuffer('');
            setOrganizerPinError('');
            setIsOrganizerPinModalOpen(true);
        }
    };

    const handleOrganizerPinSubmit = async (submittedPin = organizerPinBuffer) => {
        if (submittedPin.length !== 4 || verifyingOrganizerPin) return;
        setVerifyingOrganizerPin(true);
        setOrganizerPinError('');

        try {
            const result = await verifyOrganizerPin({ slug, pin: submittedPin });
            if (result.error) {
                setOrganizerPinError(result.error);
                setOrganizerPinBuffer('');
            } else {
                setAdminToken(result.adminToken);
                if (typeof window !== 'undefined') {
                    localStorage.setItem(`ss_admin_${slug}`, result.adminToken);
                }
                setIsOrganizerPinModalOpen(false);
                setShowOrganizerDrawer(true);
            }
        } catch {
            setOrganizerPinError('Something went wrong.');
            setOrganizerPinBuffer('');
        }
        setVerifyingOrganizerPin(false);
    };

    const handleResetPin = async (participantId, personName) => {
        const isCurrentActive =
            activeParticipantId === participantId || dashboard?.me?.id === participantId;

        const res = await organizerResetPin({
            slug,
            adminToken,
            participantId,
        });
        if (res.error) {
            showToast(res.error);
            return;
        }

        if (isCurrentActive) {
            await lockParticipantSession(slug);
            setActiveParticipantId(null);
            setDashboard(null);
            setIsCardRevealed(false);
            setView('lobby');
            showToast(t('room.pinResetNotice'));
        } else {
            showToast(`Reset PIN for ${personName}.`);
        }
        await loadRoomData();
    };

    // ==========================================================================
    // RENDER STATES
    // ==========================================================================
    if (loading) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center text-[#1B4332]">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (loadError || !room) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 text-center relative">
                <div className="absolute top-6 right-6">
                    <LanguageToggle />
                </div>
                <h2 className="text-2xl font-bold text-[#1C1917] mb-2 font-title">
                    {t('room.roomNotFound')}
                </h2>
                <p className="text-sm text-[#57534E] mb-6">
                    {loadError || t('room.roomNotFoundDesc')}
                </p>
                <Link
                    href="/"
                    className="px-5 py-3 rounded-2xl bg-[#1B4332] text-[#FAF9F6] font-semibold text-sm"
                >
                    {t('room.createRoomBtn')}
                </Link>
            </div>
        );
    }

    const claimedCount = participants.filter((p) => p.isClaimed).length;

    return (
        <div className="min-h-screen bg-white text-[#1C1917] pb-16">
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
            <header className="max-w-3xl mx-auto px-4 pt-8 pb-4 flex items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2.5 group">
                    <Image
                        src="/logo.png"
                        alt={t('common.appName')}
                        width={42}
                        height={34}
                        className="w-9 h-auto object-contain group-hover:scale-105 transition"
                        priority
                    />
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-[#1C1917] leading-none font-title">
                            {t('common.appName')}
                        </h1>
                        <p className="text-xs text-[#78716C] mt-0.5">
                            {t('common.tagline')}
                        </p>
                    </div>
                </Link>

                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono bg-white border border-[#E7E5E0] px-3 py-1.5 rounded-full text-[#57534E]">
                        /room/{room.slug}
                    </span>
                    <LanguageToggle />
                </div>
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
                                            <Check className="w-3.5 h-3.5" /> {participants.length >= 2 ? t('room.namesDrawn') : t('room.setupMode')}
                                        </span>
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] text-[#57534E] text-xs font-medium">
                                            <DollarSign className="w-3.5 h-3.5 text-[#D4A373]" />
                                            {t('room.budgetPrefix')} {room.budget}
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
                                        {t('room.lobbySubtitle')}
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
                                            <span>{t('room.copiedLink')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4 text-[#1B4332]" />
                                            <span>{t('room.copyInviteLink')}</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Progress + Organizer Controls */}
                            <div className="mt-6 pt-5 border-t border-[#E7E5E0] flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-[#57534E]">
                                        {t('room.claimedProgress', { claimed: claimedCount, total: participants.length })}
                                    </span>
                                    <div className="w-28 h-2 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] overflow-hidden">
                                        <div
                                            className="h-full bg-[#1B4332] transition-all duration-500"
                                            style={{
                                                width: `${participants.length > 0 ? (claimedCount / participants.length) * 100 : 0}%`,
                                            }}
                                        />
                                    </div>
                                </div>

                                    <button
                                        type="button"
                                        onClick={handleOrganizerControlsClick}
                                        className="text-xs font-semibold text-[#8C6D46] hover:text-[#1C1917] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#D4A373]/15 transition cursor-pointer"
                                    >
                                        <KeyRound className="w-3.5 h-3.5" />
                                        <span>{t('room.organizerControls')}</span>
                                        {showOrganizerDrawer ? (
                                            <ChevronUp className="w-3.5 h-3.5" />
                                        ) : (
                                            <ChevronDown className="w-3.5 h-3.5" />
                                        )}
                                    </button>
                            </div>

                            {showOrganizerDrawer && (
                                <div className="mt-4 p-5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] space-y-4">
                                    {/* Quick Add Person */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                                                {t('room.addPersonToRoom')}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsAddModalOpen(true);
                                                    setAddNameInput('');
                                                    setAddExclusionInput('');
                                                    setAddError('');
                                                }}
                                                className="text-xs text-[#8C6D46] hover:underline flex items-center gap-1 cursor-pointer"
                                            >
                                                <span>{t('room.customExclusions')}</span>
                                                <ChevronDown className="w-3 h-3 -rotate-90" />
                                            </button>
                                        </div>
                                        <form onSubmit={handleQuickAdd} className="flex gap-2">
                                            <input
                                                type="text"
                                                value={quickAddName}
                                                onChange={(e) => setQuickAddName(e.target.value)}
                                                placeholder={t('room.newParticipantPlaceholder')}
                                                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                            />
                                            <button
                                                type="submit"
                                                disabled={!quickAddName.trim() || isQuickAdding}
                                                className="px-4 py-2.5 rounded-xl bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                                            >
                                                {isQuickAdding ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <Plus className="w-3.5 h-3.5" />
                                                )}
                                                <span>{t('common.add')}</span>
                                            </button>
                                        </form>
                                    </div>

                                    {/* PIN Resets */}
                                    <div className="pt-3 border-t border-[#E7E5E0]">
                                        <span className="text-xs font-bold uppercase tracking-wider text-[#57534E] block mb-2">
                                            {t('room.resetPinsTitle')}
                                        </span>
                                        <div className="divide-y divide-[#E7E5E0] max-h-48 overflow-y-auto pr-1">
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
                                                                {t('room.pinSetBadge')} {p.pinHint ? `(${p.pinHint})` : ''}
                                                                {p.hasRevealed ? ` • ${t('room.openedBadge')}` : ''}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E7E5E0]/70 text-[#78716C]">
                                                                {t('room.unclaimedBadge')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {p.isClaimed && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleResetPin(p.id, p.name)}
                                                            className="text-xs font-semibold text-[#C84B31] hover:underline cursor-pointer"
                                                        >
                                                            {t('room.resetPinBtn')}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Secret Organizer Link */}
                                    <div className="pt-3 border-t border-[#E7E5E0] flex items-center justify-between">
                                        <span className="text-xs text-[#78716C]">
                                            {t('room.saveOrganizerLink')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleCopyOrganizerLink}
                                            className="text-xs font-semibold text-[#8C6D46] hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                            <Copy className="w-3 h-3" />
                                            <span>{t('room.copyOrganizerLink')}</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Participant Cards */}
                        <div>
                            <div className="flex items-center justify-between mb-3 px-1">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#57534E]">
                                        {t('room.whoAreYou')}
                                    </h3>
                                    <span className="text-xs text-[#78716C] font-normal">
                                        {t('room.totalCount', { n: participants.length })}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsAddModalOpen(true);
                                            setAddNameInput('');
                                            setAddExclusionInput('');
                                            setAddError('');
                                        }}
                                        className="text-xs font-semibold text-[#1B4332] hover:text-[#143326] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1B4332]/10 hover:bg-[#1B4332]/15 transition cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        <span>{t('room.addPersonBtn')}</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {participants.length === 0 && (
                                    <div className="col-span-1 sm:col-span-2 p-6 rounded-2xl bg-white border border-[#E7E5E0] text-center space-y-2">
                                        <div className="w-10 h-10 rounded-2xl bg-[#D4A373]/20 text-[#8C6D46] flex items-center justify-center mx-auto">
                                            <Gift className="w-5 h-5" />
                                        </div>
                                        <h4 className="font-bold text-base text-[#1C1917]">{t('room.noParticipantsTitle')}</h4>
                                        <p className="text-xs text-[#57534E] max-w-sm mx-auto">
                                            {t('room.noParticipantsDesc')}
                                        </p>
                                    </div>
                                )}
                                {participants.map((person, idx) => {
                                    return (
                                        <button
                                            key={person.id}
                                            type="button"
                                            onClick={() => handleSelectParticipant(person)}
                                            className="p-4 rounded-2xl border text-left transition flex items-center justify-between group cursor-pointer bg-white hover:border-[#1B4332] border-[#E7E5E0] shadow-2xs"
                                        >
                                            <div className="flex items-center gap-3.5">
                                                <div
                                                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-sm ${AVATAR_PALETTES[idx % AVATAR_PALETTES.length]}`}
                                                >
                                                    {getInitials(person.name)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-base text-[#1C1917]">
                                                        {person.name}
                                                    </div>
                                                    <div className="mt-0.5">
                                                        {person.isClaimed ? (
                                                            <span className="text-xs text-[#78716C] flex items-center gap-1">
                                                                <Lock className="w-3 h-3 text-[#8C6D46]" />
                                                                {t('room.claimedTap')}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs text-[#1B4332] font-semibold flex items-center gap-1">
                                                                <UserCheck className="w-3.5 h-3.5" />
                                                                {t('room.availableTap')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div
                                                className={`w-8 h-8 rounded-full flex items-center justify-center ${person.isClaimed
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

                                {/* Add Person Card */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAddModalOpen(true);
                                        setAddNameInput('');
                                        setAddExclusionInput('');
                                        setAddError('');
                                    }}
                                    className="p-4 rounded-2xl border-2 border-dashed border-[#E7E5E0] hover:border-[#1B4332] bg-[#FAF9F6]/50 hover:bg-white text-left transition flex items-center justify-between group cursor-pointer"
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-11 h-11 rounded-2xl bg-[#E7E5E0]/60 group-hover:bg-[#1B4332]/10 text-[#78716C] group-hover:text-[#1B4332] flex items-center justify-center font-bold text-sm transition">
                                            <Plus className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-base text-[#1C1917] group-hover:text-[#1B4332] transition">
                                                {t('room.addSomeoneElse')}
                                            </div>
                                            <div className="text-xs text-[#78716C] mt-0.5">
                                                {t('room.someoneMissed')}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-[#FAF9F6] group-hover:bg-[#1B4332]/10 text-[#78716C] group-hover:text-[#1B4332] flex items-center justify-center transition">
                                        <Plus className="w-4 h-4" />
                                    </div>
                                </button>
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
                                onClick={handleBackToLobby}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#57534E] hover:text-[#1C1917] cursor-pointer"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span>{t('dashboard.backToLobby')}</span>
                            </button>


                        </div>

                        {/* Signed-in Banner */}
                        <div className="flex items-center justify-between bg-white px-5 py-4 rounded-2xl border border-[#E7E5E0]">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-[#1B4332] text-[#FAF9F6] flex items-center justify-center font-bold text-sm">
                                    {getInitials(dashboard.me.name)}
                                </div>
                                <div>
                                    <p className="text-xs text-[#78716C]">{t('dashboard.signedInAs')}</p>
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
                                        {t('dashboard.topSecretFor', { name: dashboard.me.name })}
                                    </span>
                                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                                        {t('dashboard.envelopeTitle')}
                                    </h3>
                                    <p className="text-sm text-[#D8E2DC] max-w-md mb-7">
                                        {t('dashboard.envelopeDesc')}
                                    </p>
                                    <span className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-[#D4A373] text-[#1C1917] font-bold text-sm shadow-lg">
                                        <Eye className="w-4 h-4" />
                                        <span>{t('dashboard.envelopeBtn')}</span>
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
                                                {t('dashboard.secretSantaFor')}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIsCardRevealed(false)}
                                            className="text-xs text-[#D8E2DC] hover:text-white flex items-center gap-1 cursor-pointer"
                                        >
                                            <EyeOff className="w-3.5 h-3.5" />
                                            <span>{t('dashboard.hide')}</span>
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
                                                    {t('dashboard.budgetPrefix')} {room.budget} • {t('dashboard.exchangePrefix')}{' '}
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
                                                            {t('dashboard.recipientWishlistTitle', { name: dashboard.recipient.name })}
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
                                                                        <span>{t('dashboard.viewLink')}</span>
                                                                        <ExternalLink className="w-3.5 h-3.5 text-[#D4A373]" />
                                                                    </a>
                                                                ) : (
                                                                    <span className="shrink-0 text-[11px] font-medium text-[#A8A29E] px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#E7E5E0]">
                                                                        {t('dashboard.ideaOnly')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-[#A8A29E] italic py-2">
                                                        {t('dashboard.recipientNoItems', { name: dashboard.recipient.name })}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Recipient Allergies / Avoid */}
                                            <div className="p-4 rounded-2xl bg-[#FDF2F0]/60 border border-[#F5D0C8]">
                                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#9E3B24] mb-2">
                                                    <Ban className="w-4 h-4 text-[#C84B31]" />
                                                    <span>{t('dashboard.allergiesTitle')}</span>
                                                </div>
                                                {dashboard.recipient.dislikes?.trim() ? (
                                                    <p className="text-sm text-[#1C1917] whitespace-pre-line">
                                                        {dashboard.recipient.dislikes}
                                                    </p>
                                                ) : (
                                                    <p className="text-sm text-[#A8A29E] italic">
                                                        {t('dashboard.noDislikesListed')}
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
                                        {t('dashboard.myWishlistTitle')}
                                    </h3>
                                    <p className="text-xs text-[#78716C] mt-0.5">
                                        {t('dashboard.myWishlistSubtitle')}
                                    </p>
                                </div>

                                {savedBadge && (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-xs font-semibold">
                                        <Check className="w-3.5 h-3.5" /> {t('dashboard.saved')}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-2.5">
                                        {t('dashboard.myGiftListCount', { n: dashboard.me.wishlist.length })}
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
                                                                placeholder={t('dashboard.itemNameEditPlaceholder')}
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
                                                                placeholder={t('dashboard.itemNoteEditPlaceholder')}
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
                                                                    placeholder={t('dashboard.itemUrlEditPlaceholder')}
                                                                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none"
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-2 justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditingItemId(null)}
                                                                    className="px-3 py-2 rounded-xl text-xs font-semibold text-[#57534E] cursor-pointer"
                                                                >
                                                                    {t('common.cancel')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSaveEditItem(item.id)}
                                                                    className="px-4 py-2 rounded-xl bg-[#1B4332] text-[#FAF9F6] text-xs font-semibold cursor-pointer"
                                                                >
                                                                    {t('dashboard.saveItem')}
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
                                            <span>{t('dashboard.addItemTitle')}</span>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                            <input
                                                type="text"
                                                value={newItemTitle}
                                                onChange={(e) => setNewItemTitle(e.target.value)}
                                                placeholder={t('dashboard.itemNamePlaceholder')}
                                                className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                            />
                                            <input
                                                type="text"
                                                value={newItemNote}
                                                onChange={(e) => setNewItemNote(e.target.value)}
                                                placeholder={t('dashboard.itemNotePlaceholder')}
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
                                                    placeholder={t('dashboard.itemUrlPlaceholder')}
                                                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={!newItemTitle.trim() || addingItem}
                                                className="px-5 py-2.5 rounded-xl bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-sm font-semibold flex items-center justify-center gap-1.5 transition shrink-0 cursor-pointer"
                                            >
                                                <Plus className="w-4 h-4" />
                                                <span>{addingItem ? t('dashboard.addingItemBtn') : t('dashboard.addItemBtn')}</span>
                                            </button>
                                        </div>
                                    </form>
                                </div>

                                {/* Dislikes / Allergies */}
                                <div className="pt-4 border-t border-[#E7E5E0]">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                                        {t('dashboard.allergiesTitle')}
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={dislikesDraft}
                                        onChange={(e) => setDislikesDraft(e.target.value)}
                                        onBlur={handleSaveDislikes}
                                        placeholder={t('dashboard.myAllergiesPlaceholder')}
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
                                            ? t('pinModal.lockedProfile')
                                            : t('pinModal.claimYourSpot')}
                                    </span>
                                    <h3 className="text-xl font-bold text-[#1C1917]">
                                        {modalTarget.isClaimed
                                            ? t('pinModal.welcomeBack', { name: modalTarget.name })
                                            : t('pinModal.areYou', { name: modalTarget.name })}
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
                                ? t('pinModal.claimedDesc')
                                : t('pinModal.unclaimedDesc')}
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
                                    {t('pinModal.pinHintLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={pinHintInput}
                                    onChange={(e) => setPinHintInput(e.target.value)}
                                    placeholder={t('pinModal.pinHintPlaceholder')}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                />
                            </div>
                        )}

                        {modalTarget.isClaimed && modalTarget.pinHint && (
                            <div className="mb-5 flex items-center justify-center gap-1.5 text-xs text-[#78716C] bg-[#FAF9F6] py-2 px-3 rounded-xl border border-[#E7E5E0]">
                                <Info className="w-3.5 h-3.5 text-[#D4A373]" />
                                <span>{t('pinModal.yourHint', { hint: modalTarget.pinHint })}</span>
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
                                    ? t('pinModal.checkingPin')
                                    : modalTarget.isClaimed
                                        ? t('pinModal.unlockMatch')
                                        : t('pinModal.setPinAndSee')}
                            </span>
                        </button>
                    </div>
                </div>
            )}

            {/* ====================================================================
          ADD PERSON MODAL
      ==================================================================== */}
            {isAddModalOpen && (
                <div
                    className="fixed inset-0 z-40 bg-[#1C1917]/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={() => !isAdding && setIsAddModalOpen(false)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-2xl"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-[#1B4332] text-[#FAF9F6] flex items-center justify-center font-bold text-sm">
                                    <Gift className="w-5 h-5 text-[#D4A373]" />
                                </div>
                                <div>
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6D46]">
                                        {t('addPersonModal.giftExchangeBadge')}
                                    </span>
                                    <h3 className="text-xl font-bold text-[#1C1917]">
                                        {t('addPersonModal.modalTitle')}
                                    </h3>
                                </div>
                            </div>

                            <button
                                type="button"
                                disabled={isAdding}
                                onClick={() => setIsAddModalOpen(false)}
                                className="p-2 rounded-xl text-[#78716C] hover:bg-[#FAF9F6] cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-[#57534E] mb-5">
                            {t('addPersonModal.modalDesc')}
                        </p>

                        <form
                            onSubmit={handleAddParticipant}
                            className="space-y-4"
                        >
                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                                    {t('addPersonModal.personNameLabel')}
                                </label>
                                <input
                                    type="text"
                                    value={addNameInput}
                                    onChange={(e) => {
                                        setAddNameInput(e.target.value);
                                        if (addError) setAddError('');
                                    }}
                                    autoFocus
                                    placeholder={t('addPersonModal.personNamePlaceholder')}
                                    className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5 flex items-center justify-between">
                                    <span>{t('addPersonModal.preventDrawingLabel')}</span>
                                    <span className="text-[11px] font-normal text-[#78716C]">{t('addPersonModal.preventDrawingHint')}</span>
                                </label>
                                <select
                                    value={addExclusionInput}
                                    onChange={(e) => setAddExclusionInput(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm text-[#1C1917] outline-none focus:border-[#1B4332] cursor-pointer"
                                >
                                    <option value="">{t('addPersonModal.noExclusionOpt')}</option>
                                    {participants.map((p) => (
                                        <option key={p.id} value={p.id}>
                                            {t('addPersonModal.cannotDrawOpt', { name: p.name })}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] text-xs text-[#57534E] flex items-start gap-2.5">
                                <Sparkles className="w-4 h-4 text-[#D4A373] shrink-0 mt-0.5" />
                                <span>
                                    {t('addPersonModal.safeNotice')}
                                </span>
                            </div>

                            {addError && (
                                <p className="text-center text-xs font-semibold text-[#C84B31]">
                                    {addError}
                                </p>
                            )}

                            <div className="flex gap-2.5 pt-2">
                                <button
                                    type="button"
                                    disabled={isAdding}
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#57534E] border border-[#E7E5E0] transition cursor-pointer"
                                >
                                    {t('addPersonModal.cancelBtn')}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!addNameInput.trim() || isAdding}
                                    className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] transition flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    {isAdding ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>{t('addPersonModal.addingBtn')}</span>
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            <span>{t('addPersonModal.addToRoomBtn')}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ================================================================
                ORGANIZER PIN MODAL
            ================================================================ */}
            {isOrganizerPinModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="w-10 h-10 rounded-2xl bg-[#D4A373]/20 text-[#8C6D46] flex items-center justify-center">
                                    <KeyRound className="w-5 h-5" />
                                </span>
                                <h3 className="text-xl font-bold text-[#1C1917]">
                                    {t('room.organizerPinTitle')}
                                </h3>
                            </div>
                            <button
                                type="button"
                                disabled={verifyingOrganizerPin}
                                onClick={() => setIsOrganizerPinModalOpen(false)}
                                className="p-2 rounded-xl text-[#78716C] hover:bg-[#FAF9F6] cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-sm text-[#57534E]">
                            {t('room.organizerPinDesc')}
                        </p>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleOrganizerPinSubmit();
                            }}
                            className="space-y-4"
                        >
                            <PinInput
                                value={organizerPinBuffer}
                                onChange={setOrganizerPinBuffer}
                                onComplete={(p) => handleOrganizerPinSubmit(p)}
                                disabled={verifyingOrganizerPin}
                                autoFocus
                            />

                            {organizerPinError && (
                                <p className="text-center text-xs font-semibold text-[#C84B31]">
                                    {organizerPinError}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={organizerPinBuffer.length !== 4 || verifyingOrganizerPin}
                                className="w-full py-3 rounded-xl font-bold text-sm bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] transition flex items-center justify-center gap-2 cursor-pointer"
                            >
                                {verifyingOrganizerPin ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>{t('room.verifyingPin')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Unlock className="w-4 h-4" />
                                        <span>{t('room.unlockOrganizerBtn')}</span>
                                    </>
                                )}
                            </button>
                        </form>
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
                <div className="min-h-screen bg-white flex items-center justify-center text-[#1B4332]">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            }
        >
            <RoomContent />
        </Suspense>
    );
}