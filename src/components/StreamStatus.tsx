import { useEffect, useState, useRef } from 'react';
import { titleCase } from '../utils/titleCase';
import type { StreamStatus as StreamStatusType } from './HlsPlayer';

/**
 * Stream-fetch status indicator shown next to the Start Watching button.
 * The status is driven by the HlsPlayer events (real network state) but
 * a minimum 4-second hold is enforced per phase so the user can read each
 * label even on fast connections.
 *
 * Phases:
 *   idle        → "Idle"                          (gray)
 *   connecting  → "Connecting"                    (amber)
 *   fetching    → "Check Stream Fetching Or Not"  (amber, animated dot)
 *   live        → "4K Stream Fetched"             (emerald)
 *   failed      → "Stream Fetch Failed"           (red)
 */
export default function StreamStatus({
  status = 'idle',
}: {
  status?: StreamStatusType;
}) {
  const [phase, setPhase] = useState<StreamStatusType>(status);
  const enterRef = useRef<number>(performance.now());
  const desiredRef = useRef<StreamStatusType>(status);

  // Whenever the desired status changes, record the time. We won't switch
  // the visible phase until at least 4 seconds have passed since we last
  // switched — UNLESS the new status is "failed", which we show immediately.
  useEffect(() => {
    desiredRef.current = status;
    const MIN_HOLD_MS = 4000;
    const elapsed = performance.now() - enterRef.current;

    if (status === 'failed') {
      // Surface failures immediately — don't sit on a stale "fetching" pill.
      setPhase('failed');
      enterRef.current = performance.now();
      return;
    }

    if (elapsed >= MIN_HOLD_MS) {
      // Enough time has passed; switch right away.
      if (phase !== status) {
        setPhase(status);
        enterRef.current = performance.now();
      }
      return;
    }

    // Otherwise schedule the switch for the end of the current hold.
    const t = setTimeout(() => {
      setPhase((cur) => {
        if (desiredRef.current === cur) return cur;
        enterRef.current = performance.now();
        return desiredRef.current;
      });
    }, MIN_HOLD_MS - elapsed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    /* No pill outline, no border, no rounded background — just the inner
       indicator + label + progress dots in a clean inline row. */
    <div className="status-row anim-fade-in" style={{ animationDelay: '560ms' }}>
      {phase === 'connecting' && <DotPulse />}
      {phase === 'fetching' && <Spinner />}
      {phase === 'live' && <Tick />}
      {phase === 'failed' && <Cross />}

      <div className="text-[13px] sm:text-sm font-semibold tracking-wide whitespace-nowrap">
        <span
          className={
            phase === 'live'
              ? 'text-emerald-300'
              : phase === 'failed'
                ? 'text-red-300'
                : phase === 'connecting' || phase === 'fetching'
                  ? 'text-white/95'
                  : 'text-white/75'
          }
        >
          {phase === 'connecting' && titleCase('Connecting')}
          {phase === 'fetching' && titleCase('Check Stream Fetching Or Not')}
          {phase === 'live' && titleCase('4K Stream Fetched')}
          {phase === 'failed' && titleCase('Stream Fetch Failed')}
        </span>
      </div>

      {/* Subtle progress dots — color matches the current phase */}
      <ProgressDots phase={phase} />
    </div>
  );
}

/* ---------------- 1. Connecting (amber dot pulse) ----------------
   Slower (2.4s) for a calmer feel. Halo is gentler, no glow flare. */
function DotPulse() {
  return (
    <span className="relative inline-flex w-4 h-4 items-center justify-center" aria-hidden>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(251,191,36,0.32) 0%, rgba(251,191,36,0) 70%)',
          animation: 'dotHalo 2.4s ease-in-out infinite',
        }}
      />
      <span
        className="relative w-2 h-2 rounded-full"
        style={{
          backgroundColor: '#fbbf24',
          boxShadow: '0 0 4px rgba(251,191,36,0.45)',
          animation: 'dotCore 2.4s ease-in-out infinite',
        }}
      />
    </span>
  );
}

/* ---------------- 2. Fetching (violet spinner) ----------------
   Slower (1.8s) for a calmer rotation; gentler gradient stop. */
function Spinner() {
  return (
    <span className="relative inline-flex w-4 h-4 items-center justify-center" aria-hidden>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(167,139,250,0) 0deg, rgba(167,139,250,0.85) 270deg, rgba(167,139,250,0) 360deg)',
          animation: 'spinnerSpin 1.8s linear infinite',
          mask: 'radial-gradient(circle, transparent 55%, black 56%)',
          WebkitMask: 'radial-gradient(circle, transparent 55%, black 56%)',
        }}
      />
    </span>
  );
}

/* ---------------- 3. Live (emerald tick inside filled circle) ----------------
   Filled emerald circle with a white tick — clear success badge.
   Pop-in animation slowed to 380ms, gentler glow. */
function Tick() {
  return (
    <span className="relative inline-flex w-4 h-4 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 16 16" className="absolute inset-0 w-full h-full">
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="#10b981"
          style={{
            filter: 'drop-shadow(0 0 3px rgba(16, 185, 129, 0.4))',
            transformOrigin: '8px 8px',
            transform: 'scale(0)',
            animation: 'tickRingPop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          }}
        />
      </svg>
      <svg viewBox="0 0 16 16" className="relative w-full h-full" fill="none">
        <path
          d="M4.5 8.3 L7 10.7 L11.5 5.5"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="14"
          strokeDashoffset="14"
          style={{
            animation: 'tickDraw 600ms cubic-bezier(0.22, 1, 0.36, 1) 260ms forwards',
          }}
        />
      </svg>
    </span>
  );
}

/* ---------------- 4. Failed (red cross inside filled circle) ---------------- */
function Cross() {
  return (
    <span className="relative inline-flex w-4 h-4 items-center justify-center" aria-hidden>
      <svg viewBox="0 0 16 16" className="absolute inset-0 w-full h-full">
        <circle
          cx="8"
          cy="8"
          r="7"
          fill="#ef4444"
          style={{
            filter: 'drop-shadow(0 0 3px rgba(239, 68, 68, 0.4))',
            transformOrigin: '8px 8px',
            transform: 'scale(0)',
            animation: 'tickRingPop 380ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
          }}
        />
      </svg>
      <svg viewBox="0 0 16 16" className="relative w-full h-full" fill="none">
        <path
          d="M5.5 5.5 L10.5 10.5"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="8"
          strokeDashoffset="8"
          style={{
            animation: 'tickDraw 360ms cubic-bezier(0.22, 1, 0.36, 1) 260ms forwards',
          }}
        />
        <path
          d="M10.5 5.5 L5.5 10.5"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="8"
          strokeDashoffset="8"
          style={{
            animation: 'tickDraw 360ms cubic-bezier(0.22, 1, 0.36, 1) 460ms forwards',
          }}
        />
      </svg>
    </span>
  );
}

/* ---------------- Progress dots (color tracks phase) ---------------- */
function ProgressDots({ phase }: { phase: StreamStatusType }) {
  const color =
    phase === 'live'
      ? '#34d399'
      : phase === 'failed'
        ? '#f87171'
        : phase === 'fetching'
          ? '#a78bfa'
          : phase === 'connecting'
            ? '#fbbf24'
            : 'rgba(255,255,255,0.5)';

  return (
    <span className="flex items-center gap-1 ml-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1 h-1 rounded-full"
          style={{
            backgroundColor: color,
            opacity: 0.6,
            /* Progress dots now blink indefinitely in every phase, 
               keeping the status line feeling alive. */
            animation: `dotBlink 1.6s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}
