'use client';

import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

type InfoTipProps = {
    label: string;
};

export function InfoTip({ label }: InfoTipProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!isOpen) {
            return;
        }

        const handleOutsideClick = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node | null;
            if (!containerRef.current || !target) {
                return;
            }
            if (!containerRef.current.contains(target)) {
                setIsOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('touchstart', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('touchstart', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen]);

    return (
        <div ref={containerRef} className="relative inline-block align-middle">
            <button
                type="button"
                onClick={() => setIsOpen((previous) => !previous)}
                className="cursor-pointer rounded-full border border-slate-300 bg-white p-1 text-slate-500 transition-colors hover:border-teal-300 hover:text-teal-700"
                aria-label="Show field description"
                aria-expanded={isOpen}
            >
                <Info className="h-3.5 w-3.5" />
            </button>
            {isOpen && (
                <div className="absolute left-0 top-7 z-30 w-72 rounded-lg border border-slate-200 bg-white p-2 text-[10px] leading-relaxed text-slate-700 shadow-xl">
                    {label}
                </div>
            )}
        </div>
    );
}
