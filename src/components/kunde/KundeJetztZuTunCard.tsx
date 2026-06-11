// AAR-432 (Child 3 von AAR-429): „Jetzt zu tun"-Card für das Kunden-Portal.
// Rendert genau eine Aktion aus `getKundenJetztZuTun`. Drei Varianten:
//   - default → Claimondo-Navy Accent mit CTA-Button
//   - live    → Ping-Indikator rechts oben (Termin läuft gerade)
//   - info    → gedämpft grau, kein CTA
//
// AAR-727 Kandidat 2: nutzt shared `TodoCard` + `TodoCardActionBody` für
// konsistente Hülle (glass-light / severity border-l / iOS-Radius).

import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { KundeAktion } from '@/lib/kunde/jetzt-zu-tun'
import {
  resolveAktionTexte,
  type JetztZuTunTranslator,
} from '@/lib/kunde/jetzt-zu-tun-i18n'
import {
  TodoCard,
  TodoCardActionBody,
  type TodoCardSeverity,
} from '@/components/shared/TodoCard'

type Props = { aktion: KundeAktion | null }

function mapSeverity(
  aktion: KundeAktion,
): { severity: TodoCardSeverity; passive: boolean } {
  if (aktion.variant === 'info') return { severity: 'info', passive: true }
  if (aktion.variant === 'live' && aktion.severity === 'success')
    return { severity: 'success', passive: false }
  if (aktion.severity === 'critical') return { severity: 'critical', passive: false }
  if (aktion.severity === 'warning') return { severity: 'warning', passive: false }
  return { severity: 'default', passive: false }
}

const CTA_BG: Record<TodoCardSeverity, string> = {
  default: 'bg-claimondo-navy hover:bg-claimondo-ondo',
  info: 'bg-claimondo-navy hover:bg-claimondo-ondo',
  warning: 'bg-warning hover:bg-warning-strong',
  critical: 'bg-danger hover:bg-danger-strong',
  success: 'bg-success hover:bg-success-strong',
}

export default async function KundeJetztZuTunCard({ aktion }: Props) {
  if (!aktion) return null
  // Portal-i18n: Server-Component → getTranslations. Namespace `jetztZuTun`,
  // dynamische State-Keys via resolveAktionTexte (t.has-guard + de-Fallback).
  const t = await getTranslations('jetztZuTun')
  const tt = t as unknown as JetztZuTunTranslator
  const texte = resolveAktionTexte(aktion, tt)

  // kein-aktionsbedarf → minimale Info-Card
  if (aktion.state === 'kein-aktionsbedarf') {
    return (
      <TodoCard
        label={t('statusLabel')}
        severity="info"
        passive
        className="mb-4"
      >
        <div className="space-y-0.5">
          <p className="text-sm text-claimondo-navy">{texte.titel}</p>
          <p className="text-xs text-claimondo-ondo">{texte.beschreibung}</p>
        </div>
      </TodoCard>
    )
  }

  const { severity, passive } = mapSeverity(aktion)
  const isLive = aktion.variant === 'live'
  const deadlineText = aktion.deadline_am ? formatDeadline(aktion.deadline_am) : null

  return (
    <TodoCard
      severity={severity}
      passive={passive}
      className="mb-4 relative"
    >
      {isLive && (
        <span
          aria-hidden
          className="absolute top-3 right-3 inline-flex h-3 w-3"
        >
          <span className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping bg-claimondo-ondo" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-claimondo-ondo" />
        </span>
      )}
      <TodoCardActionBody
        title={texte.titel}
        description={texte.beschreibung}
        deadline={deadlineText}
        severity={severity}
        cta={
          aktion.cta?.href ? (
            <Link
              href={aktion.cta.href}
              className={`inline-flex items-center gap-1 text-sm font-medium rounded-ios-md px-4 min-h-[44px] text-white transition-colors ${CTA_BG[severity]}`}
            >
              {texte.ctaLabel ?? aktion.cta.label}
              <span aria-hidden>→</span>
            </Link>
          ) : null
        }
      />
    </TodoCard>
  )
}

function formatDeadline(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
