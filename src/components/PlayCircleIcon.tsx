/**
 * Clean, geometric play triangle (Lucide-style "Play") used inside the
 * Start Watching button. Same shape as the original Lucide `Play` icon —
 * a filled triangle pointing right — but rendered as a custom inline SVG
 * so we control its optical centering exactly.
 *
 * The triangle is intentionally drawn on a 24×24 viewBox with a slight
 * right-shift (-1 / +1) so its visual mass sits in the geometric center
 * of the containing square.
 */
export function PlayCircleIcon({
  size = 16,
  className,
  style,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Solid play triangle — apex slightly right of center for visual balance */}
      <path d="M8 5.5 v13 a0.6 0.6 0 0 0 0.92 0.5 l10 -6.5 a0.6 0.6 0 0 0 0 -1 l-10 -6.5 A0.6 0.6 0 0 0 8 5.5 z" />
    </svg>
  );
}
