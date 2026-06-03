'use client'

import { openConsentPreferences } from '@/components/analytics/ConsentManager'

export function ConsentSettingsLink({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentPreferences} className={className ?? 'underline hover:text-claimondo-navy'}>
      Cookie-Einstellungen
    </button>
  )
}
