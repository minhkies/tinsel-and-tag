'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import {
    ArrowLeft,
    Check,
    Copy,
    KeyRound,
    Loader2,
    Plus,
    Shuffle,
    Trash2,
    Unlock,
    X,
} from 'lucide-react';
import PinInput from '@/components/PinInput';
import AddPersonModal from '@/components/AddPersonModal';
import RemovePersonModal from '@/components/RemovePersonModal';
import { useLanguage, LanguageToggle } from '@/lib/LanguageContext';
import {
    getRoomLobby,
    verifyOrganizerPin,
    organizerResetPin,
    addParticipantToRoom,
    removeParticipant,
    getRoomExclusions,
    addExclusionRule,
    removeExclusionRule,
    drawNames,
    redrawNames,
    claimOrganizer,
    unlinkOrganizerParticipant,
} from '@/app/actions';

export default function AdminPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen bg-white flex items-center justify-center text-[#1B4332]">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            }
        >
            <AdminPageContent />
        </Suspense>
    );
}

function AdminPageContent() {
    const params = useParams();
    const slug = params?.slug;
    const { t } = useLanguage();

    // Organizer token (read from localStorage or query param)
    const [adminToken, setAdminToken] = useState(() => {
        if (typeof window !== 'undefined' && slug) {
            const urlParams = new URLSearchParams(window.location.search);
            return urlParams.get('admin') || localStorage.getItem(`ss_admin_${slug}`) || '';
        }
        return '';
    });

    // Room & organizer state
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [room, setRoom] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [organizerInfo, setOrganizerInfo] = useState(null); // { claimed, name, participantId } | null
    const [activeOrganizer, setActiveOrganizer] = useState(false);

    // Organizer unlock (PIN verify / claim) state
    const [unlockClaimMode, setUnlockClaimMode] = useState(false);
    const [organizerNameInput, setOrganizerNameInput] = useState('');
    const [organizerClaimPinBuffer, setOrganizerClaimPinBuffer] = useState('');
    const [organizerLinkParticipantId, setOrganizerLinkParticipantId] = useState('');
    const [claimingOrganizer, setClaimingOrganizer] = useState(false);
    const [organizerPinBuffer, setOrganizerPinBuffer] = useState('');
    const [organizerPinError, setOrganizerPinError] = useState('');
    const [verifyingOrganizerPin, setVerifyingOrganizerPin] = useState(false);

    // Draw names state
    const [drawingNames, setDrawingNames] = useState(false);
    const [drawError, setDrawError] = useState('');
    const [redrawingNames, setRedrawingNames] = useState(false);
    const [redrawError, setRedrawError] = useState('');
    const [confirmingRedraw, setConfirmingRedraw] = useState(false);

    // Add person state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [quickAddName, setQuickAddName] = useState('');
    const [isQuickAdding, setIsQuickAdding] = useState(false);

    // Remove participant modal state
    const [removeTarget, setRemoveTarget] = useState(null);
    const [removeMode, setRemoveMode] = useState('rebridge');
    const [removingParticipant, setRemovingParticipant] = useState(false);
    const [removeError, setRemoveError] = useState('');

    // Exclusion rules state
    const [exclusionPairs, setExclusionPairs] = useState([]);
    const [exclusionA, setExclusionA] = useState('');
    const [exclusionB, setExclusionB] = useState('');
    const [savingExclusion, setSavingExclusion] = useState(false);
    const [exclusionError, setExclusionError] = useState('');

    const [toastMessage, setToastMessage] = useState('');
    const initializedRef = useRef(false);

    const showToast = (msg) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage((prev) => (prev === msg ? '' : prev)), 3000);
    };

    const loadRoomData = useCallback(async () => {
        if (!slug) return;
        const lobbyRes = await getRoomLobby(slug);
        if (lobbyRes.error) {
            setLoadError(lobbyRes.error);
            setLoading(false);
            return;
        }

        const activeOrg = Boolean(lobbyRes.activeOrganizer);

        setRoom(lobbyRes.room);
        setParticipants(lobbyRes.participants);
        setOrganizerInfo(lobbyRes.organizer || null);
        setActiveOrganizer(activeOrg);

        // Load exclusion rules once the organizer session is unlocked — the
        // panel is the only place they're shown, so they're fetched here too
        // (not just after unlocking) for organizers with a saved session.
        if (activeOrg) {
            const exclRes = await getRoomExclusions({ slug });
            if (!exclRes.error) {
                setExclusionPairs(exclRes.pairs || []);
            }
        }

        // Pick the right unlock screen the first time data arrives
        if (!initializedRef.current) {
            initializedRef.current = true;
            if (!activeOrg && !lobbyRes.organizer?.claimed) {
                setUnlockClaimMode(true);
            }
        }

        setLoading(false);
    }, [slug]);

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

        // Auto-refresh interval (every 3 seconds) so PIN claims and room
        // changes show up while the organizer has this page open
        const intervalId = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                loadRoomData();
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, [slug, loadRoomData]);

    const handleOrganizerPinSubmit = async (submittedPin = organizerPinBuffer) => {
        if (submittedPin.length !== 4 || verifyingOrganizerPin) return;
        setVerifyingOrganizerPin(true);
        setOrganizerPinError('');

        try {
            const result = await verifyOrganizerPin({ slug, pin: submittedPin });
            if (result.error) {
                if (result.error === 'ORGANIZER_UNCLAIMED') {
                    setUnlockClaimMode(true);
                    setOrganizerPinBuffer('');
                } else {
                    setOrganizerPinError(result.error);
                    setOrganizerPinBuffer('');
                }
            } else {
                setActiveOrganizer(true);
                setOrganizerInfo({ claimed: true, ...result.organizer });
                loadExclusions();
            }
        } catch {
            setOrganizerPinError('Something went wrong.');
            setOrganizerPinBuffer('');
        }
        setVerifyingOrganizerPin(false);
    };

    const handleClaimOrganizer = async () => {
        if (claimingOrganizer) return;

        if (!organizerNameInput.trim()) {
            setOrganizerPinError(t('organizerModal.nameRequired'));
            return;
        }
        if (organizerClaimPinBuffer.length !== 4) {
            setOrganizerPinError(t('organizerModal.pinRequired'));
            return;
        }

        setClaimingOrganizer(true);
        setOrganizerPinError('');

        const res = await claimOrganizer({
            slug,
            name: organizerNameInput,
            pin: organizerClaimPinBuffer,
            participantId: organizerLinkParticipantId || null,
            adminToken,
        });

        setClaimingOrganizer(false);

        if (res.error) {
            setOrganizerPinError(res.error);
            return;
        }

        setActiveOrganizer(true);
        setOrganizerInfo({ claimed: true, ...res.organizer });
        loadExclusions();
    };

    const handleUnlinkOrganizer = async () => {
        const res = await unlinkOrganizerParticipant({ slug });
        if (res.error) {
            showToast(res.error);
            return;
        }
        showToast(t('organizerModal.unlinkToast'));
        await loadRoomData();
    };

    const handleCopyOrganizerLink = () => {
        if (typeof window !== 'undefined' && adminToken) {
            const organizerUrl = `${window.location.origin}/admin/${slug}?admin=${adminToken}`;
            navigator.clipboard?.writeText(organizerUrl).catch(() => { });
            showToast(t('room.organizerLinkToast'));
        }
    };

    const handleAddPerson = async (name, exclusionParticipantId) => {
        const res = await addParticipantToRoom({
            slug,
            name,
            exclusionParticipantId,
        });
        if (res.error) {
            return res;
        }
        showToast(res.notice || `Added ${name} to the room!`);
        await loadRoomData();
        return {};
    };

    const handleQuickAdd = async (e) => {
        e.preventDefault();
        const trimmed = quickAddName.trim();
        if (!trimmed || isQuickAdding) return;

        setIsQuickAdding(true);
        const res = await addParticipantToRoom({
            slug,
            name: trimmed,
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

    const handleResetPin = async (participantId, personName) => {
        const res = await organizerResetPin({
            slug,
            participantId,
        });
        if (res.error) {
            showToast(res.error);
            return;
        }
        showToast(`Reset PIN for ${personName}.`);
        await loadRoomData();
    };

    const handleConfirmRemove = async () => {
        if (!removeTarget || removingParticipant) return;

        setRemovingParticipant(true);
        setRemoveError('');

        const res = await removeParticipant({
            slug,
            participantId: removeTarget.id,
            mode: removeMode,
        });

        setRemovingParticipant(false);

        if (res.error) {
            setRemoveError(res.error);
            return;
        }

        const removedName = removeTarget.name;
        setRemoveTarget(null);
        setRemoveMode('rebridge');

        if (res.mode === 'redraw') {
            showToast(t('removePersonModal.removedRedrawToast', { name: removedName }));
        } else if (res.mode === 'none') {
            showToast(t('removePersonModal.removedSimpleToast', { name: removedName }));
        } else {
            showToast(t('removePersonModal.removedRebridgeToast', { name: removedName }));
        }
        await loadRoomData();
        await loadExclusions();
    };

    const loadExclusions = async () => {
        const res = await getRoomExclusions({ slug });
        if (!res.error) {
            setExclusionPairs(res.pairs || []);
        }
    };

    const handleAddExclusion = async () => {
        if (!exclusionA || !exclusionB || exclusionA === exclusionB || savingExclusion) return;

        setSavingExclusion(true);
        setExclusionError('');

        const res = await addExclusionRule({
            slug,
            participantIdA: exclusionA,
            participantIdB: exclusionB,
        });

        setSavingExclusion(false);

        if (res.error) {
            setExclusionError(res.error);
            return;
        }

        showToast(res.notice || t('room.exclusionAddedToast'));
        setExclusionA('');
        setExclusionB('');
        setExclusionError('');
        await loadExclusions();
        await loadRoomData();
    };

    const handleRemoveExclusion = async (idA, idB) => {
        const res = await removeExclusionRule({
            slug,
            participantIdA: idA,
            participantIdB: idB,
        });
        if (res.error) {
            showToast(res.error);
            return;
        }
        showToast(res.notice || t('room.exclusionRemovedToast'));
        await loadExclusions();
    };

    const handleDrawNames = async () => {
        if (drawingNames) return;

        setDrawingNames(true);
        setDrawError('');

        const res = await drawNames({ slug });

        setDrawingNames(false);

        if (res.error) {
            setDrawError(res.error);
            return;
        }

        showToast(res.notice || t('room.drawNamesToast'));
        await loadRoomData();
    };

    const handleRedrawNames = async () => {
        if (redrawingNames) return;

        setRedrawingNames(true);
        setRedrawError('');

        const res = await redrawNames({ slug });

        setRedrawingNames(false);

        if (res.error) {
            setRedrawError(res.error);
            return;
        }

        setConfirmingRedraw(false);
        showToast(res.notice || t('room.redrawNamesToast'));
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
            <header className="max-w-3xl mx-auto px-4 pt-8 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

                <div className="flex items-center justify-between w-full sm:w-auto gap-2">
                    <Link
                        href={`/room/${slug}`}
                        className="text-xs font-semibold text-[#8C6D46] hover:text-[#1C1917] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] transition cursor-pointer"
                    >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>{t('room.backToRoom')}</span>
                    </Link>
                    <LanguageToggle />
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 mt-2">
                {!activeOrganizer ? (
                    /* ============================================================
                       UNLOCK SCREEN — verify PIN or claim organizer access
                    ============================================================ */
                    <div className="max-w-md mx-auto bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
                        <div className="flex items-center gap-3 mb-5">
                            <span className="w-11 h-11 rounded-2xl bg-[#D4A373]/20 text-[#8C6D46] flex items-center justify-center shrink-0">
                                <KeyRound className="w-5 h-5" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-xl font-bold text-[#1C1917] truncate">
                                    {unlockClaimMode
                                        ? t('organizerModal.setupTitle')
                                        : t('room.organizerPinTitle')}
                                </h2>
                                <p className="text-xs text-[#78716C] mt-0.5 truncate">
                                    {room.name}
                                </p>
                            </div>
                        </div>

                        {unlockClaimMode ? (
                            adminToken ? (
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleClaimOrganizer();
                                    }}
                                    className="space-y-4"
                                >
                                    <p className="text-sm text-[#57534E]">
                                        {t('organizerModal.setupDesc')}
                                    </p>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                                            {t('organizerModal.nameLabel')}
                                        </label>
                                        <input
                                            type="text"
                                            value={organizerNameInput}
                                            onChange={(e) => {
                                                setOrganizerNameInput(e.target.value);
                                                if (organizerPinError) setOrganizerPinError('');
                                            }}
                                            autoFocus
                                            placeholder={t('organizerModal.namePlaceholder')}
                                            className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition text-sm"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-2.5">
                                            {t('organizerModal.pinLabel')}
                                        </label>
                                        <PinInput
                                            value={organizerClaimPinBuffer}
                                            onChange={(val) => {
                                                setOrganizerClaimPinBuffer(val);
                                                if (organizerPinError) setOrganizerPinError('');
                                            }}
                                            hasError={Boolean(organizerPinError)}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                                            {t('organizerModal.participantLinkLabel')}
                                        </label>
                                        <select
                                            value={organizerLinkParticipantId}
                                            onChange={(e) => setOrganizerLinkParticipantId(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm text-[#1C1917] outline-none focus:border-[#1B4332] cursor-pointer"
                                        >
                                            <option value="">
                                                {t('organizerModal.notParticipatingOpt')}
                                            </option>
                                            {participants.map((p) => (
                                                <option key={p.id} value={p.id}>
                                                    {p.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {organizerPinError && (
                                        <p className="text-center text-xs font-semibold text-[#C84B31]">
                                            {organizerPinError}
                                        </p>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={claimingOrganizer}
                                        className="w-full py-3 rounded-xl font-bold text-sm bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] transition flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        {claimingOrganizer ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>{t('organizerModal.settingUp')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Unlock className="w-4 h-4" />
                                                <span>{t('organizerModal.saveUnlockBtn')}</span>
                                            </>
                                        )}
                                    </button>
                                </form>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-sm text-[#57534E]">
                                        {t('organizerModal.needLinkNotice')}
                                    </p>
                                    <Link
                                        href={`/room/${slug}`}
                                        className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#57534E] border border-[#E7E5E0] transition flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        <ArrowLeft className="w-4 h-4" />
                                        <span>{t('room.backToRoom')}</span>
                                    </Link>
                                </div>
                            )
                        ) : (
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleOrganizerPinSubmit();
                                }}
                                className="space-y-4"
                            >
                                <p className="text-sm text-[#57534E]">
                                    {t('room.organizerPinDesc')}
                                </p>

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

                                {adminToken && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setUnlockClaimMode(true);
                                            setOrganizerPinBuffer('');
                                            setOrganizerPinError('');
                                        }}
                                        className="w-full text-xs font-semibold text-[#8C6D46] hover:underline cursor-pointer"
                                    >
                                        {t('organizerModal.reclaimLink')}
                                    </button>
                                )}
                            </form>
                        )}
                    </div>
                ) : (
                    /* ============================================================
                       ADMIN PANEL
                    ============================================================ */
                    <div className="space-y-5">
                        {/* Room header + organizer identity */}
                        <div className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E5E0] shadow-xs">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6D46]">
                                        {t('room.organizerControls')}
                                    </span>
                                    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1C1917] truncate">
                                        {room.name}
                                    </h2>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-xs font-semibold text-[#57534E] flex items-center gap-1.5">
                                        <KeyRound className="w-3.5 h-3.5 text-[#8C6D46]" />
                                        <span className="truncate max-w-40">
                                            {t('organizerModal.drawerBadge', {
                                                name: organizerInfo?.name || '',
                                            })}
                                        </span>
                                    </span>
                                    {organizerInfo?.participantId && (
                                        <button
                                            type="button"
                                            onClick={handleUnlinkOrganizer}
                                            className="text-[11px] font-semibold text-[#C84B31] hover:underline cursor-pointer"
                                        >
                                            {t('organizerModal.unlinkBtn')}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Draw Names (undrawn) / Re-draw Names (drawn) */}
                        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E5E0] shadow-xs space-y-3">
                            {room.isDrawn ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <Shuffle className="w-4 h-4 text-[#C84B31]" />
                                        <span className="text-sm font-bold text-[#1C1917]">
                                            {t('room.redrawNamesTitle')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#57534E]">
                                        {t('room.redrawNamesDesc')}
                                    </p>
                                    {confirmingRedraw ? (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setConfirmingRedraw(false);
                                                    setRedrawError('');
                                                }}
                                                disabled={redrawingNames}
                                                className="flex-1 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-[#57534E] text-sm font-semibold transition cursor-pointer"
                                            >
                                                {t('common.cancel')}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleRedrawNames}
                                                disabled={participants.length < 2 || redrawingNames}
                                                className="flex-1 py-2.5 rounded-xl bg-[#C84B31] hover:bg-[#9E3B24] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                                            >
                                                {redrawingNames ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Shuffle className="w-4 h-4" />
                                                )}
                                                <span>
                                                    {redrawingNames
                                                        ? t('room.redrawingNames')
                                                        : t('room.confirmRedrawBtn')}
                                                </span>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setConfirmingRedraw(true);
                                                setRedrawError('');
                                            }}
                                            disabled={participants.length < 2 || redrawingNames}
                                            className="w-full py-2.5 rounded-xl bg-[#C84B31] hover:bg-[#9E3B24] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                                        >
                                            <Shuffle className="w-4 h-4" />
                                            <span>{t('room.redrawNamesBtn')}</span>
                                        </button>
                                    )}
                                    {participants.length < 2 && (
                                        <p className="text-[11px] text-[#A8A29E]">
                                            {t('room.drawNamesMinPeople')}
                                        </p>
                                    )}
                                    {redrawError && (
                                        <p className="text-xs font-semibold text-[#C84B31]">
                                            {redrawError}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <Shuffle className="w-4 h-4 text-[#1B4332]" />
                                        <span className="text-sm font-bold text-[#1C1917]">
                                            {t('room.drawNamesTitle')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#57534E]">
                                        {t('room.drawNamesDesc')}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={handleDrawNames}
                                        disabled={participants.length < 2 || drawingNames}
                                        className="w-full py-2.5 rounded-xl bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:cursor-not-allowed"
                                    >
                                        {drawingNames ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-[#D4A373]" />
                                        ) : (
                                            <Shuffle className="w-4 h-4 text-[#D4A373]" />
                                        )}
                                        <span>
                                            {drawingNames
                                                ? t('room.drawingNames')
                                                : t('room.drawNamesBtn')}
                                        </span>
                                    </button>
                                    {participants.length < 2 && (
                                        <p className="text-[11px] text-[#A8A29E]">
                                            {t('room.drawNamesMinPeople')}
                                        </p>
                                    )}
                                    {drawError && (
                                        <p className="text-xs font-semibold text-[#C84B31]">
                                            {drawError}
                                        </p>
                                    )}
                                </>
                            )}
                        </section>

                        {/* Add Person */}
                        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E5E0] shadow-xs">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                                    {t('room.addPersonToRoom')}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="text-xs text-[#8C6D46] hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <span>{t('room.customExclusions')}</span>
                                    <ArrowLeft className="w-3 h-3 rotate-180" />
                                </button>
                            </div>
                            <form onSubmit={handleQuickAdd} className="flex flex-col sm:flex-row gap-2">
                                <input
                                    type="text"
                                    value={quickAddName}
                                    onChange={(e) => setQuickAddName(e.target.value)}
                                    placeholder={t('room.newParticipantPlaceholder')}
                                    className="w-full sm:flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm outline-none focus:border-[#1B4332]"
                                />
                                <button
                                    type="submit"
                                    disabled={!quickAddName.trim() || isQuickAdding}
                                    className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shrink-0"
                                >
                                    {isQuickAdding ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="w-3.5 h-3.5" />
                                    )}
                                    <span>{t('common.add')}</span>
                                </button>
                            </form>
                        </section>

                        {/* PIN Resets */}
                        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E5E0] shadow-xs">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#57534E] block mb-2">
                                {t('room.resetPinsTitle')}
                            </span>
                            <div className="divide-y divide-[#E7E5E0] max-h-72 overflow-y-auto pr-1">
                                {participants.map((p) => (
                                    <div
                                        key={p.id}
                                        className="py-2 flex items-center justify-between text-sm"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-medium text-[#1C1917] truncate">
                                                {p.name}
                                            </span>
                                            {p.isClaimed ? (
                                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1B4332]/10 text-[#1B4332] font-medium shrink-0">
                                                    {t('room.pinSetBadge')} {p.pinHint ? `(${p.pinHint})` : ''}
                                                    {p.hasRevealed ? ` • ${t('room.openedBadge')}` : ''}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E7E5E0]/70 text-[#78716C] shrink-0">
                                                    {t('room.unclaimedBadge')}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            {p.isClaimed && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetPin(p.id, p.name)}
                                                    className="text-xs font-semibold text-[#C84B31] hover:underline cursor-pointer"
                                                >
                                                    {t('room.resetPinBtn')}
                                                </button>
                                            )}
                                            {p.id !== organizerInfo?.participantId && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setRemoveTarget(p);
                                                        setRemoveMode('rebridge');
                                                        setRemoveError('');
                                                    }}
                                                    disabled={participants.length <= 3}
                                                    title={
                                                        participants.length <= 3
                                                            ? t('room.minParticipantsTooltip')
                                                            : t('room.removeParticipantBtn')
                                                    }
                                                    aria-label={t('room.removeParticipantBtn')}
                                                    className="p-1.5 rounded-lg text-[#A8A29E] hover:text-[#C84B31] hover:bg-[#FDF2F0] transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#A8A29E]"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Exclusion Rules */}
                        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E5E0] shadow-xs">
                            <span className="text-xs font-bold uppercase tracking-wider text-[#57534E] block mb-3">
                                {t('room.exclusionRulesTitle')}
                            </span>

                            {room.isDrawn && (
                                <p className="text-[11px] text-[#A8A29E] mb-3 flex items-center gap-1">
                                    <Shuffle className="w-3 h-3" />
                                    <span>{t('room.exclusionsApplyOnRedraw')}</span>
                                </p>
                            )}

                            {exclusionPairs.length > 0 ? (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    {exclusionPairs.map((pair) => (
                                        <span
                                            key={`${pair.idA}-${pair.idB}`}
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FDF2F0] border border-[#F5D0C8] text-[#9E3B24] text-xs font-medium"
                                        >
                                            <span>
                                                {pair.nameA} ↔ {pair.nameB}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveExclusion(pair.idA, pair.idB)}
                                                title={t('room.removeExclusionBtn')}
                                                aria-label={t('room.removeExclusionBtn')}
                                                className="hover:text-[#1C1917] cursor-pointer"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-[#A8A29E] mb-3">
                                    {t('room.noExclusions')}
                                </p>
                            )}

                            <div className="flex flex-col gap-2">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                    <select
                                        value={exclusionA}
                                        onChange={(e) => {
                                            setExclusionA(e.target.value);
                                            if (exclusionError) setExclusionError('');
                                        }}
                                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm font-medium text-[#1C1917] outline-none focus:border-[#1B4332] cursor-pointer"
                                    >
                                        <option value="">{t('room.selectPerson')}</option>
                                        {participants.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="text-xs font-semibold text-[#78716C] shrink-0 text-center sm:text-left">
                                        {t('onboarding.cannotDraw')}
                                    </span>
                                    <select
                                        value={exclusionB}
                                        onChange={(e) => {
                                            setExclusionB(e.target.value);
                                            if (exclusionError) setExclusionError('');
                                        }}
                                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm font-medium text-[#1C1917] outline-none focus:border-[#1B4332] cursor-pointer"
                                    >
                                        <option value="">{t('room.selectPerson')}</option>
                                        {participants.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddExclusion}
                                    disabled={
                                        !exclusionA || !exclusionB || exclusionA === exclusionB || savingExclusion
                                    }
                                    className="w-full px-4 py-2.5 rounded-xl border border-[#E7E5E0] bg-[#FAF9F6] hover:bg-[#F2EFE9] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-sm font-semibold text-[#1C1917] transition cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {savingExclusion
                                        ? t('room.savingExclusion')
                                        : t('onboarding.blockPairBtn')}
                                </button>
                            </div>

                            {exclusionError && (
                                <p className="text-xs font-semibold text-[#C84B31] mt-2">
                                    {exclusionError}
                                </p>
                            )}
                        </section>

                        {/* Secret Organizer Link */}
                        <section className="bg-white rounded-3xl p-5 sm:p-6 border border-[#E7E5E0] shadow-xs flex items-center justify-between gap-2">
                            <span className="text-xs text-[#78716C] min-w-0 truncate">
                                {t('room.saveOrganizerLink')}
                            </span>
                            <button
                                type="button"
                                onClick={handleCopyOrganizerLink}
                                className="text-xs font-semibold text-[#8C6D46] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                            >
                                <Copy className="w-3 h-3" />
                                <span>{t('room.copyOrganizerLink')}</span>
                            </button>
                        </section>
                    </div>
                )}
            </main>

            {/* Add Person Modal */}
            {isAddModalOpen && (
                <AddPersonModal
                    participants={participants}
                    onClose={() => setIsAddModalOpen(false)}
                    onAdd={handleAddPerson}
                    t={t}
                />
            )}

            {/* Remove Participant Modal */}
            <RemovePersonModal
                target={removeTarget}
                roomIsDrawn={Boolean(room?.isDrawn)}
                mode={removeMode}
                onModeChange={setRemoveMode}
                error={removeError}
                removing={removingParticipant}
                onCancel={() => setRemoveTarget(null)}
                onConfirm={handleConfirmRemove}
                t={t}
            />
        </div>
    );
}
