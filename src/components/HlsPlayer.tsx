import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react';
import { titleCase } from '../utils/titleCase';

/** Real stream-fetch status, derived from HLS / video events. */
export type StreamStatus = 'idle' | 'connecting' | 'fetching' | 'live' | 'failed';

interface HlsPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  onClose?: () => void;
  /** When true, the video autoplays muted (bypasses browser autoplay rules). */
  autoplayMuted?: boolean;
  /** Render inside a small card on the page instead of full-bleed. */
  inline?: boolean;
  /** Hide all UI overlays (controls, badges, etc.) — pure video only. */
  hideControls?: boolean;
  /** When mounted, attempt to enter fullscreen and unmute immediately. */
  startFullscreen?: boolean;
  /** Receive real-time stream status updates. Fires for every transition. */
  onStatusChange?: (s: StreamStatus) => void;
}

const HLS_SRC = 'https://inproviszon.st/tsn4k.m3u8';

export default function HlsPlayer({
  src,
  poster,
  title = 'Live Channel',
  onClose,
  autoplayMuted = false,
  inline = false,
  hideControls = false,
  startFullscreen = false,
  onStatusChange,
}: HlsPlayerProps) {

  // Helper: emit status changes (no-op when no listener is attached).
  // We hold the current status in a ref so we never emit the same value twice
  // and never spam the listener on every event.
  const statusRef = useRef<StreamStatus>('idle');
  const emitStatus = (s: StreamStatus) => {
    if (statusRef.current === s) return;
    statusRef.current = s;
    onStatusChange?.(s);
  };
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimer = useRef<number | null>(null);
  // True once playback has started at least once. Lets us distinguish
  // "initial load" (show "Loading stream…" label) from "re-buffering"
  // (just show the spinner).
  const [hasPlayed, setHasPlayed] = useState(false);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(autoplayMuted);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [, setHasUserInteracted] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [triedRecovery, setTriedRecovery] = useState(false);

  // ---------------- Fullscreen ----------------
  const requestFullscreen = useCallback((el: HTMLElement) => {
    const fn =
      el.requestFullscreen ||
      (el as any).webkitRequestFullscreen ||
      (el as any).webkitEnterFullscreen ||
      (el as any).mozRequestFullScreen ||
      (el as any).msRequestfullscreen;
    if (fn) {
      try {
        const result = fn.call(el);
        if (result instanceof Promise) result.catch(() => {});
      } catch {}
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    const fn =
      document.exitFullscreen ||
      (document as any).webkitExitFullscreen ||
      (document as any).mozCancelFullScreen ||
      (document as any).msExitFullscreen;
    if (fn) {
      try {
        const result = fn.call(document);
        if (result instanceof Promise) result.catch(() => {});
      } catch {}
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container) return;

    const isFs =
      !!document.fullscreenElement ||
      !!(document as any).webkitFullscreenElement ||
      !!(document as any).mozFullScreenElement ||
      !!(document as any).msFullscreenElement;

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS && video && !isFs) {
      try {
        const vf = (video as any).webkitEnterFullscreen;
        if (vf) {
          vf.call(video);
          setIsFullscreen(true);
          return;
        }
      } catch {}
    }

    if (isFs) {
      exitFullscreen();
    } else {
      requestFullscreen(container);
    }
  }, [requestFullscreen, exitFullscreen]);

  useEffect(() => {
    const handler = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement;
      setIsFullscreen(!!fsEl);
    };
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    document.addEventListener('mozfullscreenchange', handler);
    document.addEventListener('MSFullscreenChange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
      document.removeEventListener('mozfullscreenchange', handler);
      document.removeEventListener('MSFullscreenChange', handler);
    };
  }, []);

  // ---------------- HLS Init ----------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = autoplayMuted;
    video.volume = 1;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x5-playsinline', '');
    video.crossOrigin = 'anonymous';

    let hls: Hls | null = null;
    let destroyed = false;

    const setupHls = () => {
      if (destroyed) return;
      if (Hls.isSupported()) {
        /* HLS config tuned for "max quality once buffered":
           - Large forward/back buffers so playback never stalls once primed.
           - startLevel = -1 + capLevelToPlayerSize = false + high default
             bandwidth estimate → hls.js always picks the highest available
             rendition instead of capping to a low resolution.
           - Conservative down-switch (slow live EWMA, fast live EWMA tweaked)
             so brief network dips don't kick us down to a low quality.
           - Recovery retries bumped so flaky networks self-heal without
             forcing the user to tap "retry". */
        hls = new Hls({
          enableWorker: true,
          // Low-latency config: minimal forward buffer so live matches play
          // with as little delay as possible. We still let hls.js prime
          // enough to never stall (≈4s) and pick the top rendition.

          // Buffering — small + low latency.
          backBufferLength: 10,
          maxBufferLength: 12,         // ~12s forward target — enough to never stall, but minimal delay
          maxMaxBufferLength: 30,      // hard ceiling: never buffer more than 30s even on a fast network
          maxBufferSize: 64 * 1000 * 1000, // 64 MB cap on buffered bytes
          maxBufferHole: 0.3,          // tolerate small holes up to 0.3s

          // ABR — pick the highest available level right away, but react quickly
          // to dips so live sports don't stutter on a slow network.
          startLevel: -1,              // -1 = auto (let hls.js pick the highest)
          capLevelToPlayerSize: false, // never cap by player element size — serve the top rendition
          // High default bandwidth estimate so the first quality chosen is high.
          abrEwmaDefaultEstimate: 8_000_000, // ~8 Mbps default — picks 1080p/4K if available
          abrEwmaSlowLive: 5,          // react a bit faster on down-switch (less aggressive staying on top)
          abrEwmaFastLive: 2,          // very fast up-switch back to top after recovery
          abrBandWidthFactor: 0.95,    // be slightly conservative on bandwidth estimate
          abrBandWidthUpFactor: 0.6,   // require standard headroom before switching up

          // Retries — more aggressive so network blips self-heal.
          fragLoadingMaxRetry: 8,
          manifestLoadingMaxRetry: 6,
          levelLoadingMaxRetry: 6,

          // Loader — keep alive to avoid socket thrash on slow networks.
          liveSyncDurationCount: 3,
        });
        hlsRef.current = hls;

        hls.attachMedia(video);
        // We just attached — about to start fetching the manifest.
        emitStatus('connecting');

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          if (destroyed) return;
          hls!.loadSource(src);
        });

        hls.on(Hls.Events.MANIFEST_LOADING, () => {
          if (destroyed) return;
          emitStatus('fetching');
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
          if (destroyed) return;
          setLoading(false);
          setError(null);
          try {
            setIsLive(!!((data as unknown) as { live?: boolean }).live);
          } catch {
            setIsLive(true);
          }

          const tryPlay = () => {
            if (destroyed) return;
            const p = video.play();
            if (p && typeof p.then === 'function') {
              p.catch(() => {});
            }
          };

          // Ensure mute state matches intent at play start
          try {
            video.muted = autoplayMuted;
            video.volume = 1;
          } catch {}
          tryPlay();
        });

        // First-frame playing — we're live.
        hls.on(Hls.Events.FRAG_PARSED, () => {
          if (destroyed) return;
          emitStatus('live');
        });

        hls.on(Hls.Events.ERROR, (_evt, data) => {
          if (destroyed) return;
          if (!data.fatal) return;

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              hls?.recoverMediaError();
            } catch {}
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            try {
              hls?.startLoad();
            } catch {}
            return;
          }

          if (!triedRecovery) {
            setTriedRecovery(true);
            try {
              hls?.destroy();
            } catch {}
            hls = null;
            hlsRef.current = null;
            setTimeout(() => {
              if (!destroyed) setupHls();
            }, 800);
            return;
          }
          setLoading(false);
          setError(titleCase('Playback failed. Tap retry to reload the stream.'));
          emitStatus('failed');
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = src;
        emitStatus('connecting');
        const onLoaded = () => {
          setLoading(false);
          setIsLive(true);
          emitStatus('live');
          const p = video.play();
          if (p && typeof p.then === 'function') p.catch(() => {});
        };
        video.addEventListener('loadedmetadata', onLoaded, { once: true });
        video.addEventListener('error', () => {
          setError(titleCase('Playback error. Tap retry.'));
          emitStatus('failed');
        }, { once: true });
      } else {
        setError(titleCase('Your browser does not support HLS playback.'));
        setLoading(false);
        emitStatus('failed');
      }
    };

    setupHls();

    return () => {
      destroyed = true;
      try {
        hls?.destroy();
      } catch {}
      hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, autoplayMuted]);

  // ---------------- Video element event wiring ----------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onDurationChange = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        setDuration(video.duration);
      } else {
        setDuration(0);
        setIsLive(true);
      }
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => {
      setLoading(false);
      setHasPlayed(true); // any playback at all = past initial load
    };
    const onCanPlay = () => setLoading(false);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('volumechange', onVolumeChange);
    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('volumechange', onVolumeChange);
    };
  }, []);

  // ---------------- Controls auto-hide ----------------
  const resetHideTimer = useCallback(() => {
    if (hideControls) return;
    setShowControls(true);
    if (hideControlsTimer.current) {
      window.clearTimeout(hideControlsTimer.current);
    }
    hideControlsTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false);
      }
    }, 2800);
  }, [hideControls]);

  useEffect(() => {
    if (hideControls) {
      setShowControls(false);
      return;
    }
    if (!playing) {
      setShowControls(true);
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    } else {
      resetHideTimer();
    }
    return () => {
      if (hideControlsTimer.current) window.clearTimeout(hideControlsTimer.current);
    };
  }, [playing, resetHideTimer, hideControls]);

  // ---------------- "Start fullscreen + unmute" mode ----------------
  // When startFullscreen prop is on, immediately request fullscreen AND unmute
  // (this happens inside a user gesture handler, called from parent).
  const startFullscreenAndUnmute = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    setHasUserInteracted(true);
    v.muted = false;
    setMuted(false);
    try {
      await v.play();
    } catch {}
    // Wait one frame so iOS picks up the unmute, then fullscreen
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    toggleFullscreen();
  }, [toggleFullscreen]);

  useEffect(() => {
    if (!startFullscreen) return;
    startFullscreenAndUnmute();
  }, [startFullscreen, startFullscreenAndUnmute]);

  // ---------------- Handlers ----------------
  const togglePlay = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    setHasUserInteracted(true);
    try {
      if (v.paused || v.ended) {
        v.muted = false;
        await v.play();
      } else {
        v.pause();
      }
    } catch {}
    resetHideTimer();
  }, [resetHideTimer]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    setHasUserInteracted(true);
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 1;
    resetHideTimer();
  }, [resetHideTimer]);

  const onVolumeChangeInput = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    setHasUserInteracted(true);
    v.volume = val;
    if (val > 0 && v.muted) v.muted = false;
    if (val === 0 && !v.muted) v.muted = true;
  };

  const onSeek = (val: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (Number.isFinite(v.duration)) {
      v.currentTime = val;
      setCurrentTime(val);
    }
    resetHideTimer();
  };

  const retry = () => {
    setError(null);
    setLoading(true);
    setTriedRecovery(false);
    try {
      hlsRef.current?.destroy();
    } catch {}
    hlsRef.current = null;
    const v = videoRef.current;
    if (v) {
      v.removeAttribute('src');
      v.load();
    }
    setTimeout(() => {
      try {
        if (Hls.isSupported() && v) {
          // Same max-quality config as the initial mount so retry behaves identically.
          const h = new Hls({
            enableWorker: true,
            backBufferLength: 10,
            maxBufferLength: 12,
            maxMaxBufferLength: 30,
            maxBufferSize: 64 * 1000 * 1000,
            maxBufferHole: 0.3,
            startLevel: -1,
            capLevelToPlayerSize: false,
            abrEwmaDefaultEstimate: 8_000_000,
            abrEwmaSlowLive: 5,
            abrEwmaFastLive: 2,
            abrBandWidthFactor: 0.95,
            abrBandWidthUpFactor: 0.6,
            fragLoadingMaxRetry: 8,
            manifestLoadingMaxRetry: 6,
            levelLoadingMaxRetry: 6,
            liveSyncDurationCount: 3,
          });
          hlsRef.current = h;
          h.attachMedia(v);
          h.on(Hls.Events.MEDIA_ATTACHED, () => h.loadSource(src));
          h.on(Hls.Events.MANIFEST_PARSED, () => {
            setLoading(false);
            v.play().catch(() => {});
          });
        }
      } catch {}
    }, 100);
  };

  const fmt = (s: number) => {
    if (!s || !Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  // ---------------- Render ----------------
  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full bg-black overflow-hidden select-none ${inline ? '' : ''}`}
      style={{ touchAction: 'manipulation' }}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain bg-black"
        autoPlay
        playsInline
        {...({ 'webkit-playsinline': 'true', 'x5-playsinline': 'true' } as any)}
        poster={poster}
        onClick={hideControls ? undefined : togglePlay}
        onDoubleClick={hideControls ? undefined : toggleFullscreen}
      />

      {/* Top controls — hidden in inline mode unless in fullscreen */}
      {!hideControls && (
        <div
          className={`absolute top-0 left-0 right-0 z-30 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Top control band — anchored flush to the very top edge so there's
              no black gap. Inner padding handles notch clearance. */}
          <div className="bg-gradient-to-b from-black/85 via-black/45 to-transparent pt-3 pb-4 px-4 sm:px-6">
            <div className="flex items-center justify-between gap-3 anim-slide-down">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {onClose && (
                  <button
                    aria-label="Close"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose();
                    }}
                    className="ios-icon flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white"
                  >
                    <X size={20} strokeWidth={2.2} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {isLive && (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full ios-pill text-[10px] font-semibold tracking-wider text-white">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 anim-pulse-live" />
                        LIVE
                      </span>
                    )}
                    <h1 className="text-white text-sm font-semibold truncate">{title}</h1>
                  </div>
                  <p className="text-white/60 text-xs mt-0.5 truncate">{titleCase('4K Streaming')}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Center play indicator on pause */}
      {!hideControls && !playing && !loading && !error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="pointer-events-auto ios-icon w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-white anim-fade-in"
            aria-label="Play"
          >
            <Play size={36} strokeWidth={2} fill="white" className="ml-1" />
          </button>
        </div>
      )}

      {/* Centered white loading spinner — shown during initial load AND while
          the player is re-buffering during playback. Always white so it reads
          on top of any frame of the live stream. The "Loading stream…" label
          only shows on the very first load — during re-buffering we keep
          just the spinner so it stays out of the way. */}
      {loading && !hideControls && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 anim-fade-in pointer-events-none">
          {/* Soft dark scrim so the white spinner always reads on any frame */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.0) 60%)',
            }}
          />
          <Loader2
            size={56}
            strokeWidth={2}
            className="relative text-white anim-spin drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
          />
          {!hasPlayed && (
            <p className="relative text-white/85 text-sm font-medium tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
              {titleCase('Loading stream…')}
            </p>
          )}
        </div>
      )}

      {/* Error overlay */}
      {!hideControls && error && (
        <div className="absolute inset-0 z-40 flex items-center justify-center anim-fade-in">
          <div className="ios-glass-strong rounded-3xl p-6 mx-6 max-w-sm text-center">
            <p className="text-white text-base font-semibold mb-1">{titleCase('Playback Error')}</p>
            <p className="text-white/70 text-sm mb-4">{error}</p>
            <button
              onClick={retry}
              className="ios-button inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-white text-sm font-semibold"
            >
              <RotateCcw size={16} strokeWidth={2.4} />
              {titleCase('Retry')}
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      {!hideControls && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Bottom control band — flush to the very bottom edge, no black gap.
              Inner padding respects iPhone home-indicator. */}
          <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-4 pb-3 px-4 sm:px-6">
            {!isLive && duration > 0 && (
              <div className="mb-3 anim-slide-up">
                <div className="relative h-1.5 group cursor-pointer">
                  <div className="absolute inset-x-0 top-0 h-1 rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-white/30 transition-all duration-300"
                      style={{ width: `${bufferPct}%` }}
                    />
                  </div>
                  <div className="absolute inset-x-0 top-0 h-1 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white relative transition-all duration-150"
                      style={{ width: `${progressPct}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg" />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => onSeek(parseFloat(e.target.value))}
                    className="range-slider absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {isLive && (
              <div className="mb-2 flex items-center gap-2 anim-slide-up">
                <div className="relative flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-500 via-pink-500 to-red-500"
                    style={{
                      width: '40%',
                      animation: 'pulseLive 2.2s ease-in-out infinite',
                    }}
                  />
                </div>
                <span className="text-white/70 text-[10px] font-semibold tracking-widest">LIVE</span>
              </div>
            )}

            <div className="flex items-center gap-3 sm:gap-4 anim-slide-up">
              <button
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={togglePlay}
                className="ios-button w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-white flex-shrink-0"
              >
                {playing ? (
                  <Pause size={22} strokeWidth={2.4} fill="white" />
                ) : (
                  <Play size={22} strokeWidth={2.4} fill="white" className="ml-0.5" />
                )}
              </button>

              <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
                <button
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  onClick={toggleMute}
                  className="ios-button w-10 h-10 rounded-full flex items-center justify-center text-white"
                >
                  {muted || volume === 0 ? (
                    <VolumeX size={18} strokeWidth={2.2} />
                  ) : (
                    <Volume2 size={18} strokeWidth={2.2} />
                  )}
                </button>
                <div className="relative w-24 h-6 flex items-center">
                  <div className="absolute inset-x-0 h-1 rounded-full bg-white/20">
                    <div
                      className="h-full rounded-full bg-white"
                      style={{ width: `${(muted ? 0 : volume) * 100}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => onVolumeChangeInput(parseFloat(e.target.value))}
                    className="range-slider relative w-full h-full opacity-0 cursor-pointer"
                    aria-label="Volume"
                  />
                </div>
              </div>

              <button
                aria-label={muted ? 'Unmute' : 'Mute'}
                onClick={toggleMute}
                className="sm:hidden ios-button w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
              >
                {muted || volume === 0 ? (
                  <VolumeX size={18} strokeWidth={2.2} />
                ) : (
                  <Volume2 size={18} strokeWidth={2.2} />
                )}
              </button>

              <div className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-white text-sm font-medium tabular-nums truncate">
                  {isLive ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500 anim-pulse-live" />
                      LIVE
                    </span>
                  ) : (
                    `${fmt(currentTime)} / ${fmt(duration)}`
                  )}
                </span>
              </div>

              <button
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                onClick={toggleFullscreen}
                className="ios-button w-10 h-10 rounded-full flex items-center justify-center text-white flex-shrink-0"
              >
                {isFullscreen ? <Minimize size={18} strokeWidth={2.2} /> : <Maximize size={18} strokeWidth={2.2} />}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export { HLS_SRC };
