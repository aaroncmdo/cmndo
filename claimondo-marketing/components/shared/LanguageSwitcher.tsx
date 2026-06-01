'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import { useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { useRouter, usePathname } from '@/i18n/navigation'
import { LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/locales'

// i18n-SEO: Sprach-Switcher navigiert jetzt auf die Locale-URL (als-needed:
// de prefix-frei, en/tr/ar/ru/pl praefixiert) statt nur ein Cookie zu setzen.
// Das aktive Locale kommt aus next-intl useLocale() (URL-Segment) — kein Prop
// mehr noetig (vorher kam es als LandingPage-Prop aus getLocaleCookie und war
// auf Nicht-Home-Seiten ungesetzt -> Switcher zeigte faelschlich 'de').

const FLAGS: Record<Locale, string> = {
  de: '🇩🇪',
  en: '🇬🇧',
  tr: '🇹🇷',
  ar: '🇦🇪',
  ru: '🇷🇺',
  pl: '🇵🇱',
}

const LABELS: Record<Locale, string> = {
  de: 'Deutsch',
  en: 'English',
  tr: 'Türkçe',
  ar: 'العربية',
  ru: 'Русский',
  pl: 'Polski',
}

type Props = {
  variant?: 'compact' | 'full'
  className?: string
}

export function LanguageSwitcher({ variant = 'compact', className }: Props) {
  const activeRaw = useLocale()
  const active: Locale = isLocale(activeRaw) ? activeRaw : DEFAULT_LOCALE
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Click-outside schließt Dropdown.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleSelect(newLocale: Locale) {
    setOpen(false)
    if (newLocale === active) return
    // Navigiert auf denselben Pfad in der Ziel-Locale (de prefix-frei).
    startTransition(() => {
      router.replace(pathname, { locale: newLocale })
    })
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-ios-lg border border-claimondo-border bg-claimondo-card px-3 py-2 text-sm text-claimondo-navy hover:bg-claimondo-bg"
        aria-label="Sprache wählen"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={isPending}
      >
        <span aria-hidden="true">{FLAGS[active]}</span>
        {variant === 'full' && <span>{LABELS[active]}</span>}
        <ChevronDown className="h-4 w-4 opacity-60" aria-hidden="true" />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Sprachauswahl"
          className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-ios-lg border border-claimondo-border bg-claimondo-card shadow-[var(--shadow-claimondo-md)]"
        >
          {LOCALES.map((code) => {
            const isActive = code === active
            return (
              <li key={code} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onClick={() => handleSelect(code)}
                  disabled={isPending}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-sm text-claimondo-navy hover:bg-claimondo-bg',
                    isActive && 'bg-claimondo-bg font-semibold',
                  )}
                >
                  <span aria-hidden="true">{FLAGS[code]}</span>
                  <span>{LABELS[code]}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
