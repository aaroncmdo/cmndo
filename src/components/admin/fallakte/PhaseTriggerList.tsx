'use client'

// AAR-538 (C1): Trigger-Felder-Liste für den PhaseHeader.
// Zeigt welche Felder wann gesetzt wurden + von welcher Quelle.
// Source-Enum inkl. manual_kb/manual_sv/manual_kunde (Erweiterung 6).

import type { TriggerField, TriggerSource } from '@/lib/fall/subphase-resolver'

const SOURCE_LABEL: Record<TriggerSource, string> = {
  manual: 'Manuell',
  webhook: 'Webhook',
  cron: 'Cron',
  ocr: 'OCR',
  manual_admin: 'Admin',
  manual_kb: 'KB',
  manual_sv: 'SV',
  manual_kunde: 'Kunde',
}

const SOURCE_COLOR: Record<TriggerSource, string> = {
  manual: 'bg-claimondo-bg text-claimondo-navy',
  webhook: 'bg-claimondo-ondo/[0.10] text-claimondo-navy',
  cron: 'bg-amber-100 text-amber-800',
  ocr: 'bg-claimondo-bg text-claimondo-navy',
  manual_admin: 'bg-claimondo-ondo/[0.06] text-claimondo-navy',
  manual_kb: 'bg-green-100 text-green-800',
  manual_sv: 'bg-claimondo-navy/[0.10] text-claimondo-navy',
  manual_kunde: 'bg-claimondo-light-blue/[0.25] text-claimondo-navy',
}

function fmtValue(v: string | number | boolean | null): string {
  if (v === null) return '—'
  if (typeof v === 'boolean') return v ? 'gesetzt' : 'nicht gesetzt'
  if (typeof v === 'number') return v.toLocaleString('de-DE')
  return v
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function PhaseTriggerList({ fields }: { fields: TriggerField[] }) {
  if (fields.length === 0) {
    return <p className="text-xs text-claimondo-ondo italic">Keine Trigger-Felder erkannt.</p>
  }
  return (
    <ul className="space-y-1 text-xs">
      {fields.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium ${SOURCE_COLOR[f.source]}`}>
            {SOURCE_LABEL[f.source]}
          </span>
          <span className="font-mono text-claimondo-navy">{f.name}</span>
          <span className="text-claimondo-ondo">=</span>
          <span className="text-claimondo-navy font-medium">{fmtValue(f.value)}</span>
          {f.set_at && <span className="text-claimondo-ondo/70">· {fmtDate(f.set_at)}</span>}
        </li>
      ))}
    </ul>
  )
}
