'use client'

import { useState } from 'react'
import { UserIcon, Building2Icon, GraduationCapIcon, UsersIcon } from 'lucide-react'
import SoloAnlegenWizard from './SoloAnlegenWizard'
import BueroAnlegenWizard from './BueroAnlegenWizard'
import AkademieAnlegenWizard from './AkademieAnlegenWizard'
import Link from 'next/link'

// KFZ-152 Phase 2+3: Tab-Switcher mit allen Onboarding-Modi.
// AAR-235: Sub-SV-Tab entfernt — Sub-SVs werden nicht im Onboarding-Flow
// angelegt, sondern direkt aus der Büro/Akademie/Community-Detailseite
// als "Mitarbeiter hinzufügen". Community bleibt als Verlinkungs-Tab.

type TabKey = 'solo' | 'buero' | 'akademie' | 'community'

// Tab-Farben vereinheitlicht auf Claimondo-Tokens (Token-Audit: keine
// bracket-hex/raw-Accents mehr). Die Tab-Leiste braucht keine vier
// Regenbogenfarben — die SV-Typ-Farben (#3b82f6/#a855f7/#22c55e/#0ea5e9)
// leben weiterhin in der Karte (KarteHubClient TYP_COLORS), hier reicht
// aktiv=Navy, inaktiv=dezenter Ondo-Tint mit Ondo-Text.
const TAB_ACTIVE = 'bg-claimondo-navy text-white border-claimondo-navy'
const TAB_IDLE = 'bg-claimondo-ondo/5 text-claimondo-ondo border-claimondo-border hover:bg-claimondo-ondo/10'

const TABS: { key: TabKey; label: string; icon: typeof UserIcon; disabled: boolean; disabledHint?: string }[] = [
  { key: 'solo', label: 'Solo-SV', icon: UserIcon, disabled: false },
  { key: 'buero', label: 'Büro', icon: Building2Icon, disabled: false },
  { key: 'akademie', label: 'Akademie', icon: GraduationCapIcon, disabled: false },
  { key: 'community', label: 'Community', icon: UsersIcon, disabled: false },
]

export default function AnlegenTabs({ onSuccess }: {
  // AAR-235: organisationen-Prop entfernt (wurde nur für Sub-SV gebraucht)
  onSuccess?: (info: { name: string; email: string }) => void
}) {
  const [active, setActive] = useState<TabKey>('solo')

  return (
    <div>
      {/* Tab-Bar */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              onClick={() => !t.disabled && setActive(t.key)}
              disabled={t.disabled}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-ios-xl text-sm font-medium transition-colors whitespace-nowrap border ${
                t.disabled
                  ? 'bg-claimondo-bg text-claimondo-ondo/50 border-claimondo-border cursor-not-allowed'
                  : isActive
                  ? TAB_ACTIVE
                  : TAB_IDLE
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.disabled && t.disabledHint && (
                <span className="text-caption px-1.5 py-0.5 rounded-full bg-warning-soft text-warning font-medium">
                  {t.disabledHint}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Aktiver Tab */}
      {active === 'solo' && <SoloAnlegenWizard onSuccess={onSuccess} />}
      {active === 'buero' && <BueroAnlegenWizard onSuccess={onSuccess} />}
      {active === 'akademie' && <AkademieAnlegenWizard onSuccess={onSuccess} />}
      {active === 'community' && (
        <div className="bg-white border border-claimondo-border rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-claimondo-navy mb-2">Communities werden separat verwaltet</h2>
          <p className="text-sm text-claimondo-ondo mb-5">
            Communities haben ein gemeinsames Einsatzgebiet und einen eigenen Mitglieder-Pool.
            Verwaltung erfolgt im dedizierten Communities-Bereich.
          </p>
          <Link
            href="/admin/partner/communities"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-ios-xl bg-claimondo-shield hover:bg-claimondo-ondo text-white text-sm font-semibold"
          >
            <UsersIcon className="w-4 h-4" /> Zu /admin/communities
          </Link>
        </div>
      )}
    </div>
  )
}
