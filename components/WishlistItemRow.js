'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, Trash2, ExternalLink, Link2, GripVertical } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

function getDomainLabel(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch {
        return 'Link';
    }
}

/**
 * A single wishlist item row that can be dragged to reorder.
 * The entire row is draggable (pointer + touch), while its buttons
 * and link keep working for taps/clicks.
 */
export default function WishlistItemRow({ item, index, onEdit, onDelete }) {
    const { t } = useLanguage();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        // Allow native page scrolling on touch; drag activates after the
        // TouchSensor's hold delay instead of blocking scroll immediately.
        touchAction: 'manipulation',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`p-3.5 rounded-2xl bg-[#FAF9F6] border flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing select-none transition-shadow ${isDragging
                    ? 'border-[#1B4332] shadow-xl opacity-90 relative z-10 cursor-grabbing'
                    : 'border-[#E7E5E0] shadow-2xs'
                }`}
        >
            <div className="min-w-0 flex-1 flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1B4332]/10 text-[#1B4332] text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {index + 1}
                </span>
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
            </div>

            <div className="flex items-center gap-1 shrink-0">
                <button
                    type="button"
                    onClick={() => onEdit(item)}
                    title={t('dashboard.editItem')}
                    aria-label={t('dashboard.editItem')}
                    className="p-2 rounded-xl text-[#78716C] hover:text-[#1C1917] hover:bg-white cursor-pointer"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(item.id)}
                    title={t('dashboard.deleteItem')}
                    aria-label={t('dashboard.deleteItem')}
                    className="p-2 rounded-xl text-[#78716C] hover:text-[#C84B31] hover:bg-[#FDF2F0] cursor-pointer"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
                <GripVertical
                    className="w-4 h-4 text-[#A8A29E] mr-0.5"
                    aria-hidden="true"
                />
            </div>
        </div>
    );
}
