// AAR-369: Nur-Lese-Avatar mit Initialen-Fallback.
// Wird auf Kunden-Seite (Mein Betreuer, Meine Kanzlei, Gutachter-Karte) genutzt.

type Props = {
  url: string | null | undefined
  name: string | null | undefined
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  xs: 'w-8 h-8 text-xs',
  sm: 'w-10 h-10 text-sm',
  md: 'w-14 h-14 text-base',
  lg: 'w-20 h-20 text-2xl',
}

function computeInitials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ url, name, size = 'md', className = '' }: Props) {
  const boxClass = SIZE_CLASS[size]
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? 'Profilbild'}
        className={`${boxClass} rounded-full object-cover bg-gray-100 ${className}`}
      />
    )
  }
  return (
    <div
      className={`${boxClass} rounded-full bg-[#4573A2]/10 text-[#0D1B3E] flex items-center justify-center font-semibold ${className}`}
    >
      {computeInitials(name)}
    </div>
  )
}
