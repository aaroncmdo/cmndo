// Server Component — no interactivity needed (der Ask-Slot bringt seine eigene
// Client-Insel mit).
// Shown when the Basic SV has completed onboarding (abgeschlossen=true) or has
// no remaining phases.
//
// P5 T8-Fix (04.08.): Dieser Screen ist nach dem finalize der EINZIG erreichbare
// Abschluss-Moment (revalidate ersetzt den Wizard-Completed-Screen serverseitig)
// — der Netzwerkpartner-Ask wird deshalb HIER gerendert. Zusaetzlich ist der
// Text jetzt zustandsbewusst: seit der Auto-Freigabe (Aaron 29.07.) ist der
// Normalfall "sofort freigeschaltet"; der alte 48h-Pruef-Text gilt nur noch
// fuer den Geo-Guard-Fallback (Standort fehlt -> manuelle Freigabe-Queue).

import type { ReactNode } from 'react'
import Link from 'next/link'
import { Card } from '@/components/primitives'

export function SvBasicPendingReview({
  freigeschaltet = false,
  netzwerkAsk = null,
}: {
  /** portal_zugang_freigeschaltet — Auto-Freigabe durch (true) vs. Geo-Guard-Fallback (false). */
  freigeschaltet?: boolean
  /** Optionaler Netzwerkpartner-Ask (null = zahlend/Preis-Config fehlt). */
  netzwerkAsk?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full space-y-5">
        <Card p={6} radius="lg" shadow="md">
          <div className="flex flex-col items-center text-center gap-4">
            {/* Trust-marker checkmark — emerald is allowed per AGENTS.md */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M20 6 9 17l-5-5"
                  stroke="#059669"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            <div>
              <h1 className="text-2xl font-extrabold text-claimondo-navy tracking-tight">
                Geschafft!
              </h1>
              {freigeschaltet ? (
                <p className="mt-3 text-claimondo-navy/70 text-[15px] leading-relaxed">
                  Dein Profil ist freigeschaltet — dein Portal ist bereit und du
                  kannst ab sofort Aufträge erhalten.
                </p>
              ) : (
                <p className="mt-3 text-claimondo-navy/70 text-[15px] leading-relaxed">
                  Wir prüfen dein Profil und schalten dich innerhalb von 48 Stunden
                  frei. Du bekommst eine E-Mail, sobald es losgeht.
                </p>
              )}
            </div>

            {freigeschaltet ? (
              <Link
                href="/gutachter"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-ios-lg bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-shield transition-colors"
              >
                Zum Portal
              </Link>
            ) : null}
          </div>
        </Card>

        {netzwerkAsk}
      </div>
    </div>
  )
}
