'use client';

import { useState } from 'react';
import { Gift, Loader2, Plus, Sparkles, X } from 'lucide-react';

/**
 * Modal for adding a person to a room, optionally with an exclusion rule
 * (the new person can't draw a chosen existing participant).
 * `onAdd(name, exclusionParticipantId)` performs the server call and returns
 * `{ error }` on failure; on success the modal closes itself.
 * Mount it conditionally so its internal state resets on close.
 */
export default function AddPersonModal({ participants, onClose, onAdd, t }) {
    const [name, setName] = useState('');
    const [exclusionId, setExclusionId] = useState('');
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed || adding) return;

        setAdding(true);
        setError('');

        const res = await onAdd(trimmed, exclusionId || null);

        setAdding(false);

        if (res?.error) {
            setError(res.error);
            return;
        }

        onClose();
    };

    return (
        <div
            className="fixed inset-0 z-40 bg-[#1C1917]/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !adding && onClose()}
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
                        disabled={adding}
                        onClick={onClose}
                        className="p-2 rounded-xl text-[#78716C] hover:bg-[#FAF9F6] cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <p className="text-sm text-[#57534E] mb-5">
                    {t('addPersonModal.modalDesc')}
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5">
                            {t('addPersonModal.personNameLabel')}
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                if (error) setError('');
                            }}
                            autoFocus
                            placeholder={t('addPersonModal.personNamePlaceholder')}
                            className="w-full px-4 py-3 rounded-xl bg-[#FAF9F6] border border-[#E7E5E0] text-[#1C1917] font-medium focus:bg-white focus:border-[#1B4332] focus:ring-4 focus:ring-[#1B4332]/10 outline-none transition text-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-[#57534E] mb-1.5 flex items-center justify-between">
                            <span>{t('addPersonModal.preventDrawingLabel')}</span>
                            <span className="text-[11px] font-normal text-[#78716C]">
                                {t('addPersonModal.preventDrawingHint')}
                            </span>
                        </label>
                        <select
                            value={exclusionId}
                            onChange={(e) => setExclusionId(e.target.value)}
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
                        <span>{t('addPersonModal.safeNotice')}</span>
                    </div>

                    {error && (
                        <p className="text-center text-xs font-semibold text-[#C84B31]">{error}</p>
                    )}

                    <div className="flex gap-2.5 pt-2">
                        <button
                            type="button"
                            disabled={adding}
                            onClick={onClose}
                            className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#57534E] border border-[#E7E5E0] transition cursor-pointer"
                        >
                            {t('addPersonModal.cancelBtn')}
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || adding}
                            className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-[#1B4332] hover:bg-[#143326] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] transition flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {adding ? (
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
    );
}
