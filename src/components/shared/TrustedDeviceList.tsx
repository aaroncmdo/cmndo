'use client'

// A (AAR-audit-trusted-devices): Liste + Einzel-Widerruf der vertrauten Geraete.
// Client-Teil (Revoke-Aktion + Refresh); die Daten kommen server-seitig aus
// VertrauteGeraeteSection. Widerruf laeuft ueber die ownership-gegatete
// Server-Action revokeMyTrustedDevice (kein IDOR).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SmartphoneIcon, MonitorIcon, Trash2Icon } from 'lucide-react'
import { revokeMyTrustedDevice } from '@/lib/auth/twofa/remember-me'
import { Button } from '@/components/primitives'

export type TrustedDevice = {
  id: string
  device_name: string | null
  ip_address: string | null
  last_used_at: string | null
  created_at: string
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default function TrustedDeviceList({ devices }: { devices: TrustedDevice[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function widerrufen(id: string) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      const r = await revokeMyTrustedDevice(id)
      setBusyId(null)
      if (!r.success) {
        setError(r.error ?? 'Widerruf fehlgeschlagen')
        return
      }
      router.refresh()
    })
  }

  if (devices.length === 0) {
    return (
      <p className="text-sm text-claimondo-ondo/70">
        Keine vertrauten Geräte. Beim Login können Sie „Diesem Gerät vertrauen" wählen, um die
        Zwei-Faktor-Abfrage auf diesem Gerät für eine Weile zu überspringen.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {error && (
        <div className="bg-danger-soft border border-danger/30 rounded-ios-md px-3 py-2 text-danger-strong text-xs">
          {error}
        </div>
      )}
      {devices.map((d) => {
        const mobil = (d.device_name ?? '').toLowerCase().includes('mobil')
        return (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3 rounded-ios-md border border-claimondo-border bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              {mobil ? (
                <SmartphoneIcon className="w-5 h-5 text-claimondo-ondo shrink-0" />
              ) : (
                <MonitorIcon className="w-5 h-5 text-claimondo-ondo shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-claimondo-navy truncate">
                  {d.device_name ?? 'Unbekanntes Gerät'}
                  {d.ip_address ? <span className="text-claimondo-ondo/60 font-normal"> · {d.ip_address}</span> : null}
                </p>
                <p className="text-xs text-claimondo-ondo/70">
                  Vertraut seit {fmt(d.created_at)} · zuletzt genutzt {fmt(d.last_used_at)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Trash2Icon className="w-4 h-4" />}
              onClick={() => widerrufen(d.id)}
              loading={pending && busyId === d.id}
              disabled={pending}
              className="shrink-0 text-danger-strong"
            >
              Widerrufen
            </Button>
          </div>
        )
      })}
    </div>
  )
}
