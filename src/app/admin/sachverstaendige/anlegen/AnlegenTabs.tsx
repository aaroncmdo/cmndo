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

// AAR-198: Typ-Farben konsistent mit KarteHubClient TYP_COLORS:
//   kfz-gutachter → #3b82f6 (blau) — Solo-SV + Sub-SV (beides kfz-gutachter)
//   gutachterbuero → #a855f7 (violett) — Büro
//   akademie → #22c55e (grün) — Akademie
//   community → #0ea5e9 (sky) — Community (in Karte als eigener Layer, hier
//     als dezenter Sky-Ton)
// Aktiver Tab: volle Farbe + Weiß. Inaktiv: dezenter Tint + Text in Farbe.
const TAB_COLORS: Record<TabKey, { active: string; idle: string }> = {
  solo:      { active: 'bg-[#3b82f6] text-white border-[#3b82f6]', idle: 'bg-[#3b82f6]/5 text-[#3b82f6] border-[#3b82f6]/20 hover:bg-[#3b82f6]/10' },
  buero:     { active: 'bg-[#a855f7] text-white border-[#a855f7]', idle: 'bg-[#a855f7]/5 text-[#a855f7] border-[#a855f7]/20 hover:bg-[#a855f7]/10' },
  akademie:  { active: 'bg-[#22c55e] text-white border-[#22c55e]', idle: 'bg-[#22c55e]/5 text-[#22c55e] border-[#22c55e]/20 hover:bg-[#22c55e]/10' },
  community: { active: 'bg-[#0ea5e9] text-white border-[#0ea5e9]', idle: 'bg-[#0ea5e9]/5 text-[#0ea5e9] border-[#0ea5e9]/20 hover:bg-[#0ea5e9]/10' },
}

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
          const colors = TAB_COLORS[t.key]
          return (
            <button
              key={t.key}
              onClick={() => !t.disabled && setActive(t.key)}
              disabled={t.disabled}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap border ${
                t.disabled
                  ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                  : isActive
                  ? colors.active
                  : colors.idle
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.disabled && t.disabledHint && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-600 font-medium">
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
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Communities werden separat verwaltet</h2>
          <p className="text-sm text-gray-500 mb-5">
            Communities haben ein gemeinsames Einsatzgebiet und einen eigenen Mitglieder-Pool.
            Verwaltung erfolgt im dedizierten Communities-Bereich.
          </p>
          <Link
            href="/admin/partner/communities"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold"
          >
            <UsersIcon className="w-4 h-4" /> Zu /admin/communities
          </Link>
        </div>
      )}
    </div>
  )
}
