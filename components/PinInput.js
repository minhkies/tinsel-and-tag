'use client';

import React, { useEffect, useRef } from 'react';

/**
 * Reusable 4-Digit Auto-Advancing Numeric PIN Input
 */
export default function PinInput({
  value,
  onChange,
  onComplete,
  hasError,
  autoFocus = true,
}) {
  const inputRefs = useRef([]);

  useEffect(() => {
    if (autoFocus && inputRefs.current[0]) {
      const timer = setTimeout(() => inputRefs.current[0]?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  const digits = [0, 1, 2, 3].map((i) => value[i] || '');

  const handleChange = (index, e) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      const next = [...digits];
      next[index] = '';
      onChange(next.join(''));
      return;
    }

    const chars = raw.slice(0, 4 - index).split('');
    const next = [...digits];
    chars.forEach((c, offset) => {
      if (index + offset < 4) {
        next[index + offset] = c;
      }
    });
    const combined = next.join('');
    onChange(combined);

    const nextFocusIdx = Math.min(index + chars.length, 3);
    inputRefs.current[nextFocusIdx]?.focus();

    if (combined.length === 4 && onComplete) {
      onComplete(combined);
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = '';
        onChange(next.join(''));
        inputRefs.current[index - 1]?.focus();
      } else {
        const next = [...digits];
        next[index] = '';
        onChange(next.join(''));
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 4);
    if (pasted) {
      onChange(pasted);
      const focusIdx = Math.min(pasted.length, 3);
      inputRefs.current[focusIdx]?.focus();
      if (pasted.length === 4 && onComplete) {
        onComplete(pasted);
      }
    }
  };

  return (
    <div className="flex justify-center gap-3">
      {[0, 1, 2, 3].map((idx) => (
        <input
          key={idx}
          ref={(el) => (inputRefs.current[idx] = el)}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          value={digits[idx]}
          onChange={(e) => handleChange(idx, e)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          aria-label={`PIN digit ${idx + 1}`}
          className={`w-14 h-16 sm:w-16 sm:h-18 text-center text-2xl font-bold rounded-2xl border-2 transition-all outline-none bg-[#FAF9F6] text-[#1C1917] ${hasError
              ? 'border-[#C84B31] bg-[#FDF2F0] text-[#C84B31]'
              : digits[idx]
                ? 'border-[#1B4332] bg-white shadow-sm'
                : 'border-[#E7E5E0] focus:border-[#1B4332] focus:bg-white focus:ring-4 focus:ring-[#1B4332]/10'
            }`}
        />
      ))}
    </div>
  );
}