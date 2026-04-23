// Shared-Avatar für Kunden/Kontakte mit Initials-Fallback.
// Ersetzt Duplikate in Chat-UI (FAB, Bubble, Inbox-Item).

type KundeAvatarProps = {
  name: string
  size?: number
  /** Tailwind-Klassen für Hintergrund + Textfarbe. Default = Claimondo-Navy. */
  colorCls?: string
  className?: string
}

export function toInitials(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function KundeAvatar({
  name,
  size = 32,
  colorCls = 'bg-claimondo-navy text-white',
  className = '',
}: KundeAvatarProps) {
  const initials = toInitials(name)
  const fontSize = Math.max(10, Math.round(size * 0.38))

  return (
    <div
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${colorCls} ${className}`}
      style={{ width: size, height: size, fontSize }}
      aria-label={name}
      title={name}
    >
      {initials || '?'}
    </div>
  )
}
