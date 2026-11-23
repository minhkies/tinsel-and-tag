'use client';

import { useEffect } from 'react';
import Clarity from '@microsoft/clarity';

/**
 * Initializes Microsoft Clarity (session recordings & heatmaps).
 * Tracks only production builds, and no-ops when
 * NEXT_PUBLIC_CLARITY_PROJECT_ID is not set.
 */
export default function ClarityTracking() {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') return;
        const projectId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
        if (!projectId) return;
        try {
            Clarity.init(projectId);
        } catch (err) {
            console.error('Clarity init failed:', err);
        }
    }, []);

    return null;
}
