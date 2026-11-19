'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { createRoom } from './actions.js';

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

export default function CreateRoomPage() {
  const router = useRouter();

  const [eventName, setEventName] = useState('');
  const [budget, setBudget] = useState('$50');
  const [exchangeDate, setExchangeDate] = useState('2026-12-20');
  const [participants, setParticipants] = useState([
    { id: 'temp-1', name: 'Alex', exclusions: [] },
    { id: 'temp-2', name: 'Sam', exclusions: [] },
    { id: 'temp-3', name: 'Jordan', exclusions: [] },
  ]);
  const [newParticipantName, setNewParticipantName] = useState('');
  const [showExclusions, setShowExclusions] = useState(false);
  const [exclusionPersonA, setExclusionPersonA] = useState('temp-1');
  const [exclusionPersonB, setExclusionPersonB] = useState('temp-2');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddParticipant = (e) => {
    e.preventDefault();
    const trimmed = newParticipantName.trim();
    if (!trimmed) return;

    if (
      participants.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
    ) {
      setError(`"${trimmed}" is already on the list.`);
      return;
    }

    const next = [
      ...participants,
      { id: `temp-${Date.now()}`, name: trimmed, exclusions: [] },
    ];
    setParticipants(next);
    setNewParticipantName('');
    setError('');
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
    setError('');
  };

  const handleAddExclusion = () => {
    if (
      !exclusionPersonA ||
      !exclusionPersonB ||
      exclusionPersonA === exclusionPersonB
    ) {
      setError('Select two different people to block.');
      return;
    }
    setError('');
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
      setError('Please enter a group or event name.');
      return;
    }
    if (participants.length < 3) {
      setError('Add at least 3 participants.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const result = await createRoom({
      name: eventName,
      budget,
      exchangeDate,
      participants,
    });

    if (result?.error) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    // Store admin token in localStorage so organizer can reset PINs later
    if (typeof window !== 'undefined' && result.adminToken) {
      localStorage.setItem(`ss_admin_${result.slug}`, result.adminToken);
    }

    router.push(`/room/${result.slug}`);
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1C1917] pb-16">
      {/* Header */}
      <header className="max-w-3xl mx-auto px-4 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
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
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 mt-2 space-y-6">
        {/* Event Details Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-xs font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5" /> No emails. No phone numbers.
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1C1917]">
            Start a Secret Santa Room
          </h2>
          <p className="text-sm sm:text-base text-[#57534E] mt-1.5">
            Add your group below to generate one shareable link. Everyone picks
            their name and locks it with a 4-digit PIN.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                Group or Event Name
              </label>
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder="e.g., Holiday Gift Exchange 2026"
                className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                Gift Budget
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-[#78716C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder="$50"
                  className="w-full pl-9 pr-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                Exchange Date
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-[#78716C] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={exchangeDate}
                  onChange={(e) => setExchangeDate(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Participants Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-xs">
          <div className="mb-4">
            <h3 className="text-lg font-bold text-[#1C1917] flex items-center gap-2">
              <Users className="w-5 h-5 text-[#1B4332]" />
              Participants ({participants.length})
            </h3>
            <p className="text-xs text-[#78716C] mt-0.5">
              Just enter names—everyone sets their own 4-digit PIN when they
              join.
            </p>
          </div>

          <form onSubmit={handleAddParticipant} className="flex gap-2 mb-5">
            <input
              type="text"
              value={newParticipantName}
              onChange={(e) => setNewParticipantName(e.target.value)}
              placeholder="Enter a person's name..."
              className="flex-1 px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition"
            />
            <button
              type="submit"
              className="px-5 py-3 rounded-xl bg-[#1B4332] hover:bg-[#143326] text-[#FAF9F6] font-semibold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {participants.map((person, idx) => (
              <div
                key={person.id}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-[#FAF9F6] border border-[#E7E5E0]"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${AVATAR_PALETTES[idx % AVATAR_PALETTES.length]
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

          {/* Exclusions Drawer */}
          <div className="mt-6 pt-5 border-t border-[#E7E5E0]">
            <button
              type="button"
              onClick={() => setShowExclusions(!showExclusions)}
              className="w-full flex items-center justify-between text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#C84B31]" />
                <span className="text-sm font-bold text-[#1C1917]">
                  Exclusion Rules (Couples / Housemates)
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-[#FAF9F6] border border-[#E7E5E0] text-[#57534E]">
                  {getExclusionPairs().length} active
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
                    cannot draw
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
                    Block Pair
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
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-[#FDF2F0] border border-[#F5D0C8] text-[#C84B31] text-sm font-medium flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-4 px-6 rounded-2xl bg-[#1B4332] hover:bg-[#143326] disabled:opacity-60 text-[#FAF9F6] font-bold text-base shadow-md transition flex items-center justify-center gap-2.5 cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin text-[#D4A373]" />
              <span>Drawing Names...</span>
            </>
          ) : (
            <>
              <Shuffle className="w-5 h-5 text-[#D4A373]" />
              <span>Create Room &amp; Draw Names</span>
            </>
          )}
        </button>
      </main>
    </div>
  );
}