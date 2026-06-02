// Server Component — no interactivity needed.
// Shown when the Basic SV has completed onboarding (abgeschlossen=true)
// or has no remaining phases and is awaiting admin review.

import { Card } from '@/components/primitives'

export function SvBasicPendingReview() {
  return (
    <div className="min-h-screen bg-claimondo-bg flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
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
              <p className="mt-3 text-claimondo-navy/70 text-[15px] leading-relaxed">
                Wir prüfen dein Profil und schalten dich innerhalb von 48 Stunden
                frei. Du bekommst eine E-Mail, sobald es losgeht.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
