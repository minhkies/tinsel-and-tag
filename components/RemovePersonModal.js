'use client';

import { Loader2, Shuffle, Trash2, X } from 'lucide-react';

function getInitials(name) {
    return (name || '')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || '')
        .join('');
}

/**
 * Confirmation modal for removing a participant. Once names are drawn the
 * organizer picks what happens to the removed person's assignment
 * ('rebridge' | 'redraw'). Renders nothing while `target` is null.
 */
export default function RemovePersonModal({
    target,
    roomIsDrawn,
    mode,
    onModeChange,
    error,
    removing,
    onCancel,
    onConfirm,
    t,
}) {
    if (!target) return null;

    return (
        <div
            className="fixed inset-0 z-50 bg-[#1C1917]/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => !removing && onCancel()}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 border border-[#E7E5E0] shadow-2xl"
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-[#C84B31]/15 text-[#C84B31] flex items-center justify-center font-bold text-sm">
                            {getInitials(target.name)}
                        </div>
                        <div>
                            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8C6D46]">
                                {t('removePersonModal.badge')}
                            </span>
                            <h3 className="text-xl font-bold text-[#1C1917]">
                                {t('removePersonModal.modalTitle', { name: target.name })}
                            </h3>
                        </div>
                    </div>

                    <button
                        type="button"
                        disabled={removing}
                        onClick={onCancel}
                        className="p-2 rounded-xl text-[#78716C] hover:bg-[#FAF9F6] cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Warning */}
                <div className="p-3.5 rounded-2xl bg-[#FDF2F0] border border-[#F5D0C8] text-xs text-[#9E3B24] flex items-start gap-2.5 mb-5">
                    <Trash2 className="w-4 h-4 shrink-0 mt-0.5 text-[#C84B31]" />
                    <span>{t('removePersonModal.warning', { name: target.name })}</span>
                </div>

                {/* Reassignment options — only relevant once names are drawn */}
                {roomIsDrawn && (
                    <div className="space-y-2.5 mb-5">
                        <button
                            type="button"
                            onClick={() => onModeChange('rebridge')}
                            disabled={removing}
                            className={`w-full text-left p-4 rounded-2xl border-2 transition cursor-pointer ${mode === 'rebridge'
                                    ? 'border-[#1B4332] bg-[#1B4332]/5'
                                    : 'border-[#E7E5E0] bg-white hover:border-[#D4A373]'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <span
                                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${mode === 'rebridge' ? 'border-[#1B4332]' : 'border-[#D6D3D1]'
                                        }`}
                                >
                                    {mode === 'rebridge' && (
                                        <span className="w-2 h-2 rounded-full bg-[#1B4332]" />
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-sm text-[#1C1917]">
                                            {t('removePersonModal.optionRebridgeTitle')}
                                        </span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1B4332]/10 text-[#1B4332]">
                                            {t('removePersonModal.recommendedBadge')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#57534E] mt-1">
                                        {t('removePersonModal.optionRebridgeDesc', { name: target.name })}
                                    </p>
                                </div>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => onModeChange('redraw')}
                            disabled={removing}
                            className={`w-full text-left p-4 rounded-2xl border-2 transition cursor-pointer ${mode === 'redraw'
                                    ? 'border-[#1B4332] bg-[#1B4332]/5'
                                    : 'border-[#E7E5E0] bg-white hover:border-[#D4A373]'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <span
                                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${mode === 'redraw' ? 'border-[#1B4332]' : 'border-[#D6D3D1]'
                                        }`}
                                >
                                    {mode === 'redraw' && (
                                        <span className="w-2 h-2 rounded-full bg-[#1B4332]" />
                                    )}
                                </span>
                                <div className="min-w-0">
                                    <span className="font-bold text-sm text-[#1C1917]">
                                        {t('removePersonModal.optionRedrawTitle')}
                                    </span>
                                    <p className="text-xs text-[#57534E] mt-1">
                                        {t('removePersonModal.optionRedrawDesc')}
                                    </p>
                                    <p className="text-[11px] text-[#9E3B24] mt-1.5 flex items-center gap-1">
                                        <Shuffle className="w-3 h-3 shrink-0" />
                                        <span>{t('removePersonModal.optionRedrawNote')}</span>
                                    </p>
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {error && (
                    <p className="text-center text-xs font-semibold text-[#C84B31] mb-4">
                        {error}
                    </p>
                )}

                <div className="flex gap-2.5 pt-1">
                    <button
                        type="button"
                        disabled={removing}
                        onClick={onCancel}
                        className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm bg-[#FAF9F6] hover:bg-[#F2EFE9] text-[#57534E] border border-[#E7E5E0] transition cursor-pointer"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={removing}
                        className="flex-1 py-3 px-4 rounded-xl font-bold text-sm bg-[#C84B31] hover:bg-[#9E3B24] disabled:bg-[#E7E5E0] disabled:text-[#A8A29E] text-[#FAF9F6] transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                        {removing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Trash2 className="w-4 h-4" />
                        )}
                        <span>
                            {removing
                                ? t('removePersonModal.removingBtn')
                                : t('removePersonModal.confirmBtn')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}
