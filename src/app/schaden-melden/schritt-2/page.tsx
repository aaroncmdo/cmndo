import { getTranslations } from 'next-intl/server'
import { FlowShell } from '../_components/FlowShell'
import { Schritt2aGuard } from './Schritt2aGuard'

// AAR-471 C5: Schritt 2a — Fahrzeug-Skizze + Foto-Upload.
// Server-Shell rendert FlowShell + Client-Guard. Der eigentliche Guard
// (leadId-Check) ist client-seitig, weil leadId in sessionStorage liegt.

export default async function Schritt2Page() {
  const t = await getTranslations('flow.step2a')

  return (
    <FlowShell step={2}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-claimondo-navy">{t('heading')}</h1>
        <p className="mt-2 text-slate-600">{t('sub')}</p>
      </div>
      <Schritt2aGuard />
    </FlowShell>
  )
}
