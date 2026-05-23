// <Logo/> · Inline-SVG-Wortmarke „autounfall.io" mit orangenem Punkt.
// Vorlage: Prototyp-Header (mask „auLogo", tspan-Punkt). Mark + Wortmarke in
// `currentColor` (folgt der Textfarbe: Ink im Header, Weiss im dunklen Footer),
// nur der Punkt traegt die Brand-Accent-Farbe (#C04920 via Token).

interface LogoProps {
  className?: string
  /** Mask-ID-Suffix — eindeutig halten, falls mehrere Logos pro Seite (Header/Footer). */
  idSuffix?: string
  title?: string
}

export function Logo({
  className = 'block h-9 w-auto',
  idSuffix = 'h',
  title = 'autounfall.io',
}: LogoProps) {
  const maskId = `auLogo-${idSuffix}`
  return (
    <svg
      className={className}
      viewBox="0 0 246 44"
      fill="none"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <rect x="2" y="2" width="40" height="40" rx="12" fill="#fff" />
        <circle cx="17.7" cy="22" r="9.3" fill="#000" />
        <rect x="24.1" y="12.7" width="5" height="18.6" rx="2.5" fill="#000" />
        <circle cx="17.7" cy="22.7" r="3.9" fill="#fff" />
        <circle cx="32" cy="29.8" r="3.2" fill="#000" />
      </mask>
      <rect x="2" y="2" width="40" height="40" rx="12" fill="currentColor" mask={`url(#${maskId})`} />
      <text
        x="54"
        y="29.5"
        fontWeight="800"
        fontSize="25"
        letterSpacing="-0.5"
        fill="currentColor"
        style={{ fontFamily: 'var(--font-fraunces), Georgia, serif' }}
      >
        autounfall
        <tspan fill="var(--color-au-amber, #C04920)">.</tspan>
        io
      </text>
    </svg>
  )
}
