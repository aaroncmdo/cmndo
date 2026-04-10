'use client'

import { useState } from 'react'
import { UserIcon, Building2Icon, UserPlusIcon, GraduationCapIcon, UsersIcon } from 'lucide-react'
import SoloAnlegenWizard from './SoloAnlegenWizard'
import BueroAnlegenWizard from './BueroAnlegenWizard'
import SubSvHinzufuegenForm from './SubSvHinzufuegenForm'
import AkademieAnlegenWizard from './AkademieAnlegenWizard'
import Link from 'next/link'

// KFZ-152 Phase 2+3: Tab-Switcher mit allen 5 Modi aktiviert.
// Community wird ueber /admin/communities verwaltet (eigenes Listing) statt
// als Tab hier — Admin klickt 'Community' Tab und wird verlinkt.

type TabKey = 'solo' | 'buero' | 'sub' | 'akademie' | 'community'

const TABS: { key: TabKey; label: string; icon: typeof UserIcon; disabled: boolean; disabledHint?: string }[] = [
  { key: 'solo', label: 'Solo-SV', icon: UserIcon, disabled: false },
  { key: 'buero', label: 'Büro', icon: Building2Icon, disabled: false },
  { key: 'sub', label: 'Sub-SV hinzufügen', icon: UserPlusIcon, disabled: false },
  { key: 'akademie', label: 'Akademie', icon: GraduationCapIcon, disabled: false },
  { key: 'community', label: 'Community', icon: UsersIcon, disabled: false },
]

export default function AnlegenTabs({ organisationen, onSuccess }: {
  organisationen: Array<{ id: string; name: string }>
  // ARCH-1 POLISH Befund 4: optionaler Callback fuer den Drawer-Use-Case.
  // Wenn gesetzt, ruft der jeweilige Wizard nach erfolgreichem Anlegen
  // diesen Callback auf — der Drawer kann dann zumachen + Toast feuern.
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
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                t.disabled
                  ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : isActive
                  ? 'bg-[#1E3A5F] text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
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
      {active === 'sub' && <SubSvHinzufuegenForm organisationen={organisationen} onSuccess={onSuccess} />}
      {active === 'akademie' && <AkademieAnlegenWizard onSuccess={onSuccess} />}
      {active === 'community' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Communities werden separat verwaltet</h2>
          <p className="text-sm text-gray-500 mb-5">
            Communities haben ein gemeinsames Einsatzgebiet und einen eigenen Mitglieder-Pool.
            Verwaltung erfolgt im dedizierten Communities-Bereich.
          </p>
          <Link
            href="/admin/communities"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold"
          >
            <UsersIcon className="w-4 h-4" /> Zu /admin/communities
          </Link>
        </div>
      )}
    </div>
  )
}
