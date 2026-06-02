'use client'
import AvatarUpload from '@/components/shared/AvatarUpload'
import type { OnboardingFeld } from '../types'

export function AvatarUploadField({ feld, value, onChange }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-claimondo-navy">{feld.label}</p>
      {feld.hint && <p className="text-xs text-claimondo-shield">{feld.hint}</p>}
      <AvatarUpload currentUrl={value || null} initials="SV" size="lg" onChanged={(url) => onChange(url ?? '')} />
    </div>
  )
}
