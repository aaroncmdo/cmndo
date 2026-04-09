'use client'

import { useState } from 'react'
import { UserIcon, Building2Icon, UserPlusIcon, GraduationCapIcon, UsersIcon } from 'lucide-react'
import SoloAnlegenWizard from './SoloAnlegenWizard'
import BueroAnlegenWizard from './BueroAnlegenWizard'
import SubSvHinzufuegenForm from './SubSvHinzufuegenForm'

// ARCH-1 Phase 2 (BLOCK C): Tab-Switcher fuer die Admin-Anlegen-Page.
// 5 Modi, 2 davon (Akademie + Community) sind disabled bis KFZ-152 Phase 2/3 durch ist.

type TabKey = 'solo' | 'buero' | 'sub' | 'akademie' | 'community'

const TABS: { key: TabKey; label: string; icon: typeof UserIcon; disabled: boolean; disabledHint?: string }[] = [
  { key: 'solo', label: 'Solo-SV', icon: UserIcon, disabled: false },
  { key: 'buero', label: 'Buero', icon: Building2Icon, disabled: false },
  { key: 'sub', label: 'Sub-SV hinzufuegen', icon: UserPlusIcon, disabled: false },
  { key: 'akademie', label: 'Akademie', icon: GraduationCapIcon, disabled: true, disabledHint: 'KFZ-152 Phase 2' },
  { key: 'community', label: 'Community', icon: UsersIcon, disabled: true, disabledHint: 'KFZ-152 Phase 3' },
]

export default function AnlegenTabs({ organisationen }: {
  organisationen: Array<{ id: string; name: string }>
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
      {active === 'solo' && <SoloAnlegenWizard />}
      {active === 'buero' && <BueroAnlegenWizard />}
      {active === 'sub' && <SubSvHinzufuegenForm organisationen={organisationen} />}
    </div>
  )
}
