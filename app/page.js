'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Gift,
  Users,
  Plus,
  Trash2,
  ShieldAlert,
  Sparkles,
  Calendar,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Shuffle,
  X,
  Loader2,
  ArrowRight,
  ArrowLeft,
  LogIn,
  Check,
} from 'lucide-react';
import { createRoom } from './actions.js';
import { useLanguage, LanguageToggle } from '@/lib/LanguageContext';

const AVATAR_PALETTES = [
  'bg-[#1B4332] text-[#FAF9F6]',
  'bg-[#C84B31] text-[#FAF9F6]',
  'bg-[#8C6D46] text-[#FAF9F6]',
  'bg-[#2D5A4C] text-[#FAF9F6]',
  'bg-[#9E3B24] text-[#FAF9F6]',
  'bg-[#4A5D4E] text-[#FAF9F6]',
];

function getInitials(name) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function extractRoomSlug(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return '';
  // Match room URL pattern e.g. /room/abc123 or https://.../room/abc123
  const urlMatch = trimmed.match(/room\/([a-zA-Z0-9_-]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  // Otherwise strip non-alphanumeric
  return trimmed.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export default function OnboardingPage() {
  const router = useRouter();
  const { t } = useLanguage();

  // Onboarding step: 1 (Welcome), 2 (Event Details), 3 (Participants)
  const [step, setStep] = useState(1);

  // Step 1: Join Room State
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinError, setJoinError] = useState('');

  // Step 2: Event Details
  const [eventName, setEventName] = useState('');
  const [budget, setBudget] = useState('$50');
  const [exchangeDate, setExchangeDate] = useState('2026-12-24');
  const [detailsError, setDetailsError] = useState('');

  // Step 3: Participants (empty by default - example participants removed)
  const [participants, setParticipants] = useState([]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [showExclusions, setShowExclusions] = useState(false);
  const [exclusionPersonA, setExclusionPersonA] = useState('');
  const [exclusionPersonB, setExclusionPersonB] = useState('');
  const [participantError, setParticipantError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handle joining an existing room
  const handleJoinRoom = (e) => {
    e.preventDefault();
    const slug = extractRoomSlug(roomCodeInput);
    if (!slug) {
      setJoinError(t('onboarding.joinRoomError'));
      return;
    }
    setJoinError('');
    router.push(`/room/${slug}`);
  };

  // Step 2 validation -> Next
  const handleProceedToParticipants = (e) => {
    e?.preventDefault();
    if (!eventName.trim()) {
      setDetailsError(t('onboarding.errorEventName'));
      return;
    }
    setDetailsError('');
    setStep(3);
  };

  // Step 3 participant management
  const handleAddParticipant = (e) => {
    e.preventDefault();
    const trimmed = newParticipantName.trim();
    if (!trimmed) return;

    if (
      participants.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setParticipantError(t('onboarding.duplicateNameError', { name: trimmed }));
      return;
    }

    const nextId = `temp-${Date.now()}`;
    const next = [
      ...participants,
      { id: nextId, name: trimmed, exclusions: [] },
    ];
    setParticipants(next);
    setNewParticipantName('');
    setParticipantError('');

    // Pre-select exclusion dropdowns if 2+ people
    if (next.length >= 2 && !exclusionPersonA) {
      setExclusionPersonA(next[0].id);
      setExclusionPersonB(next[1].id);
    }
  };

  const handleRemoveParticipant = (id) => {
    setParticipants((prev) =>
      prev
        .filter((p) => p.id !== id)
        .map((p) => ({
          ...p,
          exclusions: p.exclusions.filter((exId) => exId !== id),
        }))
    );
    setParticipantError('');
  };

  const handleAddExclusion = () => {
    if (
      !exclusionPersonA ||
      !exclusionPersonB ||
      exclusionPersonA === exclusionPersonB
    ) {
      setParticipantError(t('onboarding.selectTwoError'));
      return;
    }
    setParticipantError('');
    setParticipants((prev) =>
      prev.map((p) => {
        if (
          p.id === exclusionPersonA &&
          !p.exclusions.includes(exclusionPersonB)
        ) {
          return { ...p, exclusions: [...p.exclusions, exclusionPersonB] };
        }
        if (
          p.id === exclusionPersonB &&
          !p.exclusions.includes(exclusionPersonA)
        ) {
          return { ...p, exclusions: [...p.exclusions, exclusionPersonA] };
        }
        return p;
      })
    );
  };

  const handleRemoveExclusionPair = (idA, idB) => {
    setParticipants((prev) =>
      prev.map((p) => {
        if (p.id === idA) {
          return { ...p, exclusions: p.exclusions.filter((x) => x !== idB) };
        }
        if (p.id === idB) {
          return { ...p, exclusions: p.exclusions.filter((x) => x !== idA) };
        }
        return p;
      })
    );
  };

  const getExclusionPairs = () => {
    const seen = new Set();
    const pairs = [];
    for (const p of participants) {
      for (const exId of p.exclusions) {
        const key = [p.id, exId].sort().join('::');
        if (!seen.has(key)) {
          seen.add(key);
          const other = participants.find((item) => item.id === exId);
          if (other) {
            pairs.push({
              idA: p.id,
              nameA: p.name,
              idB: other.id,
              nameB: other.name,
            });
          }
        }
      }
    }
    return pairs;
  };

  const handleSubmit = async () => {
    if (!eventName.trim()) {
      setStep(2);
      setDetailsError(t('onboarding.errorEventName'));
      return;
    }

    setIsSubmitting(true);
    setParticipantError('');

    const result = await createRoom({
      name: eventName,
      budget,
      exchangeDate,
      participants,
    });

    if (result?.error) {
      setParticipantError(result.error);
      setIsSubmitting(false);
      return;
    }

    if (typeof window !== 'undefined' && result.adminToken) {
      localStorage.setItem(`ss_admin_${result.slug}`, result.adminToken);
    }

    router.push(`/room/${result.slug}`);
  };

  return (
    <div className="min-h-screen bg-white text-[#1C1917] pb-16">
      {/* Header */}
      <header className="max-w-2xl mx-auto px-4 pt-8 pb-4 flex items-center justify-between gap-3">
        <div
          onClick={() => setStep(1)}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <Image
            src="/logo.svg"
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
        </div>

        <div className="flex items-center gap-2.5">
          {/* Step Indicator (Only when in Step 2 or 3) */}
          {step > 1 && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-[#78716C]">
              <span
                onClick={() => setStep(2)}
                className={`px-2.5 py-1 rounded-full cursor-pointer transition ${
                  step === 2
                    ? 'bg-[#1B4332] text-[#FAF9F6]'
                    : 'bg-white border border-[#E7E5E0] hover:border-[#1B4332]'
                }`}
              >
                {t('onboarding.step2Indicator')}
              </span>
              <span>•</span>
              <span
                className={`px-2.5 py-1 rounded-full ${
                  step === 3
                    ? 'bg-[#1B4332] text-[#FAF9F6]'
                    : 'bg-white border border-[#E7E5E0]'
                }`}
              >
                {t('onboarding.step3Indicator')}
              </span>
            </div>
          )}

          {/* Language Toggle */}
          <LanguageToggle />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 mt-2">
        {/* ==============================================================
            STEP 1: WELCOME SCREEN
        ============================================================== */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-10 border border-[#E7E5E0] shadow-xs text-center space-y-6">
              {/* Festive Badge */}
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-[#D4A373]" />
                <span>{t('onboarding.step1Badge')}</span>
              </div>

              {/* Title & Description */}
              <div className="space-y-3 max-w-lg mx-auto">
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1C1917] leading-tight">
                  {t('onboarding.step1Title')}
                </h2>
                <p className="text-sm sm:text-base text-[#57534E] leading-relaxed">
                  {t('onboarding.step1Desc')}
                </p>
              </div>

              {/* Feature Highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-left">
                <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0]/80">
                  <div className="w-8 h-8 rounded-xl bg-[#1B4332]/10 text-[#1B4332] flex items-center justify-center mb-2.5 font-bold">
                    <Check className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-[#1C1917]">
                    {t('onboarding.feat1Title')}
                  </h4>
                  <p className="text-xs text-[#78716C] mt-1">
                    {t('onboarding.feat1Desc')}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0]/80">
                  <div className="w-8 h-8 rounded-xl bg-[#D4A373]/20 text-[#8C6D46] flex items-center justify-center mb-2.5 font-bold">
                    <Shuffle className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-[#1C1917]">
                    {t('onboarding.feat2Title')}
                  </h4>
                  <p className="text-xs text-[#78716C] mt-1">
                    {t('onboarding.feat2Desc')}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0]/80">
                  <div className="w-8 h-8 rounded-xl bg-[#C84B31]/15 text-[#C84B31] flex items-center justify-center mb-2.5 font-bold">
                    <Gift className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-sm text-[#1C1917]">
                    {t('onboarding.feat3Title')}
                  </h4>
                  <p className="text-xs text-[#78716C] mt-1">
                    {t('onboarding.feat3Desc')}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-3">
                {/* Primary: Get Started */}
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="w-full py-4 px-6 rounded-2xl bg-[#1B4332] hover:bg-[#143326] text-[#FAF9F6] font-bold text-base shadow-md transition flex items-center justify-center gap-2 cursor-pointer group"
                >
                  <span>{t('onboarding.getStarted')}</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </button>

                {/* Secondary: Join Existing Room */}
                {!showJoinInput ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowJoinInput(true);
                      setJoinError('');
                    }}
                    className="w-full py-3.5 px-6 rounded-2xl bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#1C1917] font-semibold text-sm border border-[#E7E5E0] transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4 text-[#8C6D46]" />
                    <span>{t('onboarding.haveRoomCode')}</span>
                  </button>
                ) : (
                  <form
                    onSubmit={handleJoinRoom}
                    className="p-4 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] text-left space-y-3 transition"
                  >
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#57534E]">
                        {t('onboarding.joinRoomLabel')}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowJoinInput(false)}
                        className="text-xs text-[#78716C] hover:text-[#1C1917] cursor-pointer"
                      >
                        {t('common.cancel')}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={roomCodeInput}
                        onChange={(e) => {
                          setRoomCodeInput(e.target.value);
                          if (joinError) setJoinError('');
                        }}
                        autoFocus
                        placeholder={t('onboarding.joinRoomPlaceholder')}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white border border-[#E7E5E0] text-sm text-[#1C1917] font-mono outline-none focus:border-[#1B4332]"
                      />
                      <button
                        type="submit"
                        className="px-5 py-2.5 rounded-xl bg-[#1B4332] hover:bg-[#143326] text-[#FAF9F6] text-sm font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                      >
                        <span>{t('onboarding.joinRoomBtn')}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {joinError && (
                      <p className="text-xs font-semibold text-[#C84B31]">
                        {joinError}
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ==============================================================
            STEP 2: ADD EVENT DETAILS
        ============================================================== */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#78716C] hover:text-[#1C1917] mb-5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('onboarding.backToWelcome')}</span>
              </button>

              <div className="mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-[#8C6D46]">
                  {t('onboarding.step2Indicator')}
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917] mt-1">
                  {t('onboarding.step2Title')}
                </h2>
                <p className="text-sm text-[#57534E] mt-1">
                  {t('onboarding.step2Subtitle')}
                </p>
              </div>

              <form onSubmit={handleProceedToParticipants} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                    {t('onboarding.eventNameLabel')} <span className="text-[#C84B31]">*</span>
                  </label>
                  <input
                    type="text"
                    value={eventName}
                    onChange={(e) => {
                      setEventName(e.target.value);
                      if (detailsError) setDetailsError('');
                    }}
                    autoFocus
                    placeholder={t('onboarding.eventNamePlaceholder')}
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition text-sm sm:text-base"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                      {t('onboarding.budgetLabel')}
                    </label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 text-[#78716C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        placeholder={t('onboarding.budgetPlaceholder')}
                        className="w-full pl-9 pr-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition text-sm sm:text-base"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                      {t('onboarding.dateLabel')}
                    </label>
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-[#78716C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="date"
                        value={exchangeDate}
                        onChange={(e) => setExchangeDate(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition text-sm sm:text-base"
                      />
                    </div>
                  </div>
                </div>

                {detailsError && (
                  <div className="p-3.5 rounded-xl bg-[#FDF2F0] border border-[#F5D0C8] text-[#C84B31] text-xs font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{detailsError}</span>
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    className="w-full py-4 px-6 rounded-2xl bg-[#1B4332] hover:bg-[#143326] text-[#FAF9F6] font-bold text-base shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t('onboarding.nextAddPeople')}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ==============================================================
            STEP 3: ADD PARTICIPANTS (OPTIONAL)
        ============================================================== */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#78716C] hover:text-[#1C1917] mb-5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t('onboarding.backToDetails')}</span>
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#8C6D46]">
                    {t('onboarding.step3Indicator')}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917] mt-1">
                    {t('onboarding.step3Title')}
                  </h2>
                  <p className="text-sm text-[#57534E] mt-1">
                    {t('onboarding.step3Subtitle')}
                  </p>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] text-xs font-semibold text-[#57534E] self-start sm:self-auto">
                  <Users className="w-3.5 h-3.5 text-[#1B4332]" />
                  <span>{t('onboarding.peopleAddedCount', { n: participants.length })}</span>
                </div>
              </div>

              {/* Add Participant Input Form */}
              <form onSubmit={handleAddParticipant} className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={newParticipantName}
                  onChange={(e) => {
                    setNewParticipantName(e.target.value);
                    if (participantError) setParticipantError('');
                  }}
                  autoFocus
                  placeholder={t('onboarding.addPersonPlaceholder')}
                  className="flex-1 px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] text-sm focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!newParticipantName.trim()}
                  className="px-5 py-3 rounded-xl bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] font-semibold flex items-center gap-1.5 transition cursor-pointer text-sm shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('onboarding.addBtn')}</span>
                </button>
              </form>

              {/* Participant List or Empty State */}
              {participants.length === 0 ? (
                <div className="p-6 rounded-2xl bg-[#FAF9F6] border border-dashed border-[#E7E5E0] text-center space-y-2 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-[#E7E5E0] text-[#78716C] flex items-center justify-center mx-auto">
                    <Users className="w-5 h-5 text-[#8C6D46]" />
                  </div>
                  <h4 className="font-bold text-sm text-[#1C1917]">
                    {t('onboarding.emptyPeopleTitle')}
                  </h4>
                  <p className="text-xs text-[#78716C] max-w-sm mx-auto">
                    {t('onboarding.emptyPeopleDesc')}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-6">
                  {participants.map((person, idx) => (
                    <div
                      key={person.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0]"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            AVATAR_PALETTES[idx % AVATAR_PALETTES.length]
                          }`}
                        >
                          {getInitials(person.name)}
                        </div>
                        <span className="font-semibold text-sm text-[#1C1917]">
                          {person.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(person.id)}
                        className="p-1.5 text-[#A8A29E] hover:text-[#C84B31] hover:bg-[#FDF2F0] rounded-lg transition cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Exclusion Rules (Couples/Housemates) - Only when >= 2 people */}
              {participants.length >= 2 && (
                <div className="mb-6 pt-5 border-t border-[#E7E5E0]">
                  <button
                    type="button"
                    onClick={() => setShowExclusions(!showExclusions)}
                    className="w-full flex items-center justify-between text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-[#C84B31]" />
                      <span className="text-sm font-bold text-[#1C1917]">
                        {t('onboarding.exclusionsTitle')}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] text-[#57534E]">
                        {t('onboarding.exclusionsActive', { n: getExclusionPairs().length })}
                      </span>
                    </div>
                    {showExclusions ? (
                      <ChevronUp className="w-4 h-4 text-[#78716C]" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-[#78716C]" />
                    )}
                  </button>

                  {showExclusions && (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={exclusionPersonA}
                          onChange={(e) => setExclusionPersonA(e.target.value)}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm font-medium text-[#1C1917] outline-none focus:border-[#1B4332]"
                        >
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <span className="self-center text-xs font-semibold text-[#78716C] px-1">
                          {t('onboarding.cannotDraw')}
                        </span>

                        <select
                          value={exclusionPersonB}
                          onChange={(e) => setExclusionPersonB(e.target.value)}
                          className="flex-1 px-3 py-2.5 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-sm font-medium text-[#1C1917] outline-none focus:border-[#1B4332]"
                        >
                          {participants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={handleAddExclusion}
                          className="px-4 py-2.5 rounded-xl border border-[#E7E5E0] bg-[#FAF9F6] hover:bg-[#F2EFE9] text-sm font-semibold text-[#1C1917] transition cursor-pointer"
                        >
                          {t('onboarding.blockPairBtn')}
                        </button>
                      </div>

                      {getExclusionPairs().length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {getExclusionPairs().map((pair) => (
                            <span
                              key={`${pair.idA}-${pair.idB}`}
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#FDF2F0] border border-[#F5D0C8] text-[#9E3B24] text-xs font-medium"
                            >
                              <span>
                                {pair.nameA} ↔ {pair.nameB}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveExclusionPair(pair.idA, pair.idB)
                                }
                                className="hover:text-[#1C1917] cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Informational reassurance */}
              <div className="p-3.5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0] text-xs text-[#57534E] flex items-start gap-2.5 mb-6">
                <Sparkles className="w-4 h-4 text-[#D4A373] shrink-0 mt-0.5" />
                <span>
                  {participants.length >= 3
                    ? t('onboarding.drawNoticeMulti')
                    : t('onboarding.drawNoticeEmpty')}
                </span>
              </div>

              {participantError && (
                <div className="p-4 rounded-2xl bg-[#FDF2F0] border border-[#F5D0C8] text-[#C84B31] text-sm font-medium flex items-start gap-2.5 mb-6">
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{participantError}</span>
                </div>
              )}

              {/* Submit / Create Room Button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full py-4 px-6 rounded-2xl bg-[#1B4332] hover:bg-[#143326] disabled:opacity-60 text-[#FAF9F6] font-bold text-base shadow-md transition flex items-center justify-center gap-2.5 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-[#D4A373]" />
                    <span>{t('onboarding.creatingRoom')}</span>
                  </>
                ) : participants.length >= 3 ? (
                  <>
                    <Shuffle className="w-5 h-5 text-[#D4A373]" />
                    <span>{t('onboarding.createAndDraw')}</span>
                  </>
                ) : (
                  <>
                    <Gift className="w-5 h-5 text-[#D4A373]" />
                    <span>
                      {participants.length === 0
                        ? t('onboarding.createEmpty')
                        : t('onboarding.createSimple')}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
