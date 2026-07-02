'use client'
import { useRouter } from 'next/navigation'
import KalenderConnectStep from '@/components/KalenderConnectStep'
import type { OnboardingFeld } from '../types'

export function CalendarConnectField({ feld, onChange }: {
  feld: OnboardingFeld; value: string; onChange: (v: string) => void; disabled?: boolean
}) {
  const router = useRouter()
  const opt = (k: string) => feld.optionen?.find((o) => o.value === k)?.label ?? ''
  return (
    <KalenderConnectStep gcalConnected={opt('gcal') === 'true'} caldavConnected={opt('caldav') === 'true'}
      onDone={() => { onChange(new Date().toISOString()); router.refresh() }} />
  )
}
