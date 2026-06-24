import { useState } from 'react';
import HlsPlayer, { HLS_SRC } from './components/HlsPlayer';
import type { StreamStatus as StreamStatusType } from './components/HlsPlayer';
import StreamStatusView from './components/StreamStatus';
import { Play, Radio, Smartphone } from 'lucide-react';
// Custom inline-SVG icons
import { DiscordIcon } from './components/DiscordIcon';
import { PlayCircleIcon } from './components/PlayCircleIcon';
import { Badge4KIcon } from './components/Badge4KIcon';
import { titleCase } from './utils/titleCase';

export default function App() {
  const [openFs, setOpenFs] = useState(false);
  // Real-time status from the live preview player — drives the status pill
  // next to the Start Watching button. Starts in 'connecting' so the very
  // first paint already shows progress (no idle/blank state).
  const [streamStatus, setStreamStatus] = useState<StreamStatusType>('connecting');

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-zinc-950 to-black text-white relative overflow-x-hidden">
      {/* Ambient background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[480px] h-[480px] rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full bg-indigo-600/15 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 w-[420px] h-[420px] rounded-full bg-fuchsia-600/15 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Header — logo removed. Wordmark "RevStream" + subline "4K Streaming"
            sit on the left with a slow breathing animation (same style as the footer). */}
        <header className="px-5 sm:px-10 py-5 sm:py-6 flex items-center justify-between anim-slide-down">
          <button
            type="button"
            onClick={() => window.location.reload()}
            aria-label="Refresh page"
            className="group flex flex-col items-start leading-tight active:scale-[0.97] transition-transform duration-200 logo-hover"
          >
            <span className="header-wordmark header-breath">RevStream</span>
            <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-white/55 header-sub transition-colors duration-300 group-hover:text-white/85">
              {titleCase('4K Streaming')}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {/* Discord icon — plain, no outline / no iOS glass chrome. */}
            <a
              href="https://discord.gg/EttmFjhhq5"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Join us on Discord"
              className="text-white/80 hover:text-white transition-colors duration-200 anim-fade-in dc-icon-anim"
            >
              <DiscordIcon size={20} />
            </a>

            {/* Stream online pill — desktop only */}
            <div className="hidden md:flex items-center gap-2 ios-pill px-3 py-1.5 rounded-full text-xs text-white/80 anim-fade-in">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 anim-pulse-live" />
              {titleCase('Stream Online')}
            </div>
          </div>
        </header>

        {/* Main */}
        <main className="flex-1 flex items-center justify-center px-5 sm:px-10 py-6 sm:py-8">
          {/* Top section — pill, h1, description, button + (right) preview card.
              Features row below spans the full width and follows the page's
              left/right margin instead of being nested inside the CTA column. */}
          <div className="max-w-5xl w-full">
            <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
              {/* Left — copy + CTA */}
              <div className="space-y-5 sm:space-y-6 anim-slide-up" style={{ animationDelay: '60ms' }}>
                <div
                  className="inline-flex items-center gap-2 ios-pill px-3 py-1.5 rounded-full text-xs font-medium text-white/90 anim-fade-in"
                  style={{ animationDelay: '180ms' }}
                >
                  <span className="text-amber-300">✦</span>
                  {titleCase('Adaptive Bitrate • Up to 4K')}
                </div>

                {/* H1 — gradient title + subtitle, same block. Slightly reduced size
                    (text-3xl / sm:text-4xl / lg:text-5xl) so it's not oversized. */}
                <h1
                  className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight leading-[1.1] anim-fade-in"
                  style={{ animationDelay: '260ms' }}
                >
                  <span className="bg-gradient-to-br from-violet-300 via-fuchsia-300 to-pink-300 bg-clip-text text-transparent">
                    {titleCase('Start Watching')}
                  </span>{' '}
                  <br className="hidden sm:block" />
                  {titleCase('Watch Crystal-Clear Live Stream Anywhere.')}
                </h1>

                <p
                  className="text-white/55 text-sm sm:text-base max-w-xl leading-relaxed anim-fade-in"
                  style={{ animationDelay: '380ms' }}
                >
                  {titleCase('A Minimal, Modern 4K FIFA Streaming Experience Powered By Team NoScope eSports. Delivering Next-Gen Visuals and Silky Adaptive Playback. Developed By ')}
                  <span className="rev-credit">{titleCase('Rev71')}</span>
                  {titleCase('.')}
                </p>

                <div
                  className="flex flex-row items-center gap-2 sm:gap-3 pt-1 anim-scale-in"
                  style={{ animationDelay: '460ms' }}
                >
                  {/* Smaller button on phones (px-4 py-2.5), scales up on sm+.
                      On hover: subtle scale-up + the play pill turns violet with
                      a soft glow that pulses to draw the eye. */}
                  <button
                    onClick={() => setOpenFs(true)}
                    className="group cta-hover relative inline-flex items-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl bg-white text-black font-semibold text-xs sm:text-sm transition-all duration-300 active:scale-[0.98] shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] hover:shadow-[0_18px_50px_-12px_rgba(167,139,250,0.55)]"
                  >
                    {/* Black pill on rest, violet pill on hover. Two soft
                        ping/pulse rings stay constant. Solid play triangle. */}
                    <span className="play-pill relative w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-black flex items-center justify-center transition-colors duration-300 group-hover:bg-[#7c3aed]">
                      <span className="absolute inset-0 rounded-full bg-current opacity-40 animate-ping" />
                      <span className="absolute inset-0 rounded-full bg-current opacity-20 animate-pulse" />
                      <PlayCircleIcon
                        className="relative z-10 text-white w-3 h-3 sm:w-3.5 sm:h-3.5"
                      />
                    </span>
                    {titleCase('Start Watching')}
                  </button>

                  {/* Live stream-fetch status — sits right of the button, same row */}
                  <StreamStatusView status={streamStatus} />
                </div>
              </div>

              {/* Right — inline preview card (PC + tablet only) */}
              <div
                className="relative hidden md:block anim-scale-in"
                style={{ animationDelay: '180ms' }}
              >
                <PreviewCard
                  onPlay={() => setOpenFs(true)}
                  onStatusChange={setStreamStatus}
                />
              </div>
            </div>

            {/* Features row — full width, follows page left/right margin.
                Margin-top keeps it visually grouped with the CTA, not glued. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 sm:mt-10">
              <div className="anim-slide-left" style={{ animationDelay: '120ms' }}>
                <Feature
                  icon={<Badge4KIcon size={16} />}
                  title={titleCase('Experience')}
                  desc={titleCase('Low-Latency 4K Streaming')}
                />
              </div>
              <div className="anim-slide-up" style={{ animationDelay: '200ms' }}>
                <Feature
                  icon={<Radio size={16} strokeWidth={2.4} />}
                  title={titleCase('Live')}
                  desc={titleCase('Phone, Tablet, PC')}
                />
              </div>
              <div className="anim-slide-right" style={{ animationDelay: '280ms' }}>
                <Feature
                  icon={<Smartphone size={16} strokeWidth={2.4} />}
                  title={titleCase('Cross-Device')}
                  desc={titleCase('iOS, Android & Desktop')}
                />
              </div>
            </div>
          </div>
        </main>

        {/* Footer — single line "Powered By NoScope eSports" with a minimal
            hover. 30px breathing room above the bottom edge. */}
        <footer
          className="mt-auto anim-fade-in"
          style={{ animationDelay: '600ms' }}
        >
          <div className="footer-plain">
            <div className="mx-auto max-w-5xl w-full px-5 sm:px-10 pt-3 pb-[30px] flex items-center justify-center text-center">
              <span className="footer-hover">
                {titleCase('Powered By NoScope eSports')}
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Fullscreen player overlay — fixed inset, fills viewport edge-to-edge so
          the top/bottom control bands sit flush with no black gap. */}
      {openFs && (
        <div className="fixed inset-0 z-50 w-screen h-screen bg-black">
          <HlsPlayer
            src={HLS_SRC}
            title="FIFA World Cup 2026"
            startFullscreen
            onClose={() => setOpenFs(false)}
          />
        </div>
      )}
    </div>
  );
}



/* Inline preview card — minimal: video gets a soft gaussian blur + a centered
   play icon button. The blur sits above the video so the streamed frames
   stay muted in the background, making the card feel "player-like" instead
   of raw video. */
function PreviewCard({
  onPlay,
  onStatusChange,
}: {
  onPlay: () => void;
  onStatusChange: (s: StreamStatusType) => void;
}) {
  return (
    <div
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onPlay();
      }}
      className="relative aspect-video rounded-3xl overflow-hidden cursor-pointer group bg-black"
    >
      {/* The live muted preview video sits underneath. */}
      <div
        className="absolute inset-0"
        style={{
          filter: 'blur(6px) saturate(110%)',
          transform: 'scale(1.06)', // avoid blur-edge bleeding
          transition: 'filter 300ms ease, transform 300ms ease',
        }}
      >
        <HlsPlayer
          src={HLS_SRC}
          title="FIFA World Cup 2026"
          autoplayMuted
          inline
          hideControls
          onStatusChange={onStatusChange}
        />
      </div>

      {/* Subtle dark veil on top of the blurred video for contrast */}
      <div className="absolute inset-0 bg-black/25 transition-opacity duration-300 group-hover:bg-black/15" />

      {/* Centered play button — slight gaussian backdrop blur so it feels iOS-ish */}
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          aria-label="Start watching"
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-white transition-all duration-300 group-hover:scale-105 group-hover:bg-white/25"
          style={{
            backdropFilter: 'blur(10px) saturate(180%)',
            WebkitBackdropFilter: 'blur(10px) saturate(180%)',
          }}
        >
          <Play size={28} strokeWidth={2.2} fill="white" className="ml-0.5 drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]" />
        </button>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    /* Hover grows the card by 5% (scale 1.05) on every device that supports hover. */
    <div className="ios-glass rounded-2xl p-3.5 flex items-start gap-3 transition-transform duration-300 ease-out hover:scale-105">
      <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-xs text-white/60 truncate">{desc}</div>
      </div>
    </div>
  );
}
