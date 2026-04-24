'use client'

// AAR-162 / W2: SLA-Alerts — Countdown-Timer für aktive SLAs im Fall.
// Die SLA-Config (lib/fall/sla-config.ts) liefert die Zeit-Werte, die
// tatsächliche Breach-Logik lebt in lib/sla/tracker.ts. Hier zeigen wir nur
// dringende/überfällige Items an — Details kommen in W4 sobald alle Quellen
// (fall.sv_termin, as_versendet_am, technische_stellungnahme_beauftragt_am,
// nachbesichtigung_angefordert_am) konsistent befüllt werden.

import { TimerIcon, AlertCircleIcon } from 'lucide-react'
import { useFall } from '../FallContext'
import { SLA_CONFIG } from '@/lib/fall/sla-config'

type Alert = {
  label: string
  remainingMs: number
  critical: boolean
}

function computeAlerts(fall: Record<string, unknown>): Alert[] {
  const now = Date.now()
  const alerts: Alert[] = []

  // Vollmacht-Reminder (Pfad A, SA unterschrieben, Vollmacht fehlt)
  const abgetretenAm = fall.abtretung_signiert_am as string | null
  const vollmachtAm = fall.vollmacht_signiert_am as string | null
  if (abgetretenAm && !vollmachtAm && fall.service_typ === 'komplett') {
    const elapsed = now - new Date(abgetretenAm).getTime()
    const remaining = SLA_CONFIG.vollmacht.hardLimit - elapsed
    alerts.push({
      label: 'Vollmacht ausstehend',
      remainingMs: remaining,
      critical: remaining < SLA_CONFIG.vollmacht.reminderSecond,
    })
  }

  // Technische Stellungnahme (falls beauftragt, Deadline 72h)
  const stellungnahmeBeauftragt = fall.technische_stellungnahme_beauftragt_am as string | null
  const stellungnahmeStatus = fall.technische_stellungnahme_status as string | null
  if (stellungnahmeBeauftragt && stellungnahmeStatus !== 'hochgeladen' && stellungnahmeStatus !== 'freigegeben') {
    const elapsed = now - new Date(stellungnahmeBeauftragt).getTime()
    const remaining = SLA_CONFIG.technischeStellungnahme.deadlineHours * 60 * 60 * 1000 - elapsed
    alerts.push({
      label: 'Techn. Stellungnahme SV',
      remainingMs: remaining,
      critical: remaining < 0,
    })
  }

  return alerts
}

function fmtRemaining(ms: number): string {
  if (ms < 0) {
    const hours = Math.round(-ms / (60 * 60 * 1000))
    return `überfällig seit ${hours}h`
  }
  const hours = Math.floor(ms / (60 * 60 * 1000))
  const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))
  if (hours > 0) return `noch ${hours}h ${mins}m`
  return `noch ${mins}m`
}

export default function SlaAlerts() {
  const { fall } = useFall()
  const alerts = computeAlerts(fall)
  if (alerts.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-claimondo-border p-3 space-y-2">
      <p className="text-[9px] font-semibold text-claimondo-ondo uppercase flex items-center gap-1">
        <TimerIcon className="w-3 h-3" /> SLA-Alerts
      </p>
      <div className="space-y-1.5">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={`rounded-md p-2 border text-[11px] ${
              a.critical ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center gap-1 font-medium">
              {a.critical && <AlertCircleIcon className="w-3 h-3" />}
              {a.label}
            </div>
            <p className="text-[10px] mt-0.5">{fmtRemaining(a.remainingMs)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
