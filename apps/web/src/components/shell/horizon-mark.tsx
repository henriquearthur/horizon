/**
 * The Horizon mark: a sun about to clear the horizon line. It is drawn rather
 * than lettered so the tile keeps its optical balance at 24px, which the bare
 * "H" never did.
 */
export function HorizonMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false" className={className}>
      <rect width="24" height="24" rx="7" fill="var(--primary)" />
      <circle cx="12" cy="13" r="4.25" fill="var(--primary-foreground)" fillOpacity="0.95" />
      <path
        d="M4 15.25h16"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.55"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M6.5 18h11"
        stroke="var(--primary-foreground)"
        strokeOpacity="0.3"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}
