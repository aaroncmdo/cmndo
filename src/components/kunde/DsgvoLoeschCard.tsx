'use client'

// DSGVO Art. 17 — Self-Service-Account-Löschung im Kunde-Portal.
// Idempotent gegen Doppel-Antraege; zeigt Status wenn bereits gestellt.

import { useState, useTransition } from 'react'
import { ShieldAlertIcon, CheckIcon, XIcon, ClockIcon } from 'lucide-react'
import {
  stelleLoeschAntrag,
  storniereLoeschAntrag,
} from '@/lib/actions/dsgvo-loeschung'

type ExistingAuftrag = {
  id: string
  status: 'eingereicht' | 'bestaetigt' | 'ausgefuehrt'
  eingereicht_am: string
  bestaetigt_am: string | null
  grund: string | null
} | null

type Props = {
  bestehenderAuftrag: ExistingAuftrag
}

export default function DsgvoLoeschCard({ bestehenderAuftrag }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [grund, setGrund] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [auftrag, setAuftrag] = useState<ExistingAuftrag>(bestehenderAuftrag)

  function antragStellen() {
    setError(null)
    startTransition(async () => {
      const r = await stelleLoeschAntrag(grund || undefined)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setAuftrag({
        id: r.auftragId,
        status: 'eingereicht',
        eingereicht_am: new Date().toISOString(),
        bestaetigt_am: null,
        grund: grund || null,
      })
      setIsOpen(false)
    })
  }

  function antragStornieren(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await storniereLoeschAntrag(id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setAuftrag(null)
    })
  }

  // Bereits eingereichter Antrag → Status anzeigen
  if (auftrag) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <ClockIcon width={18} height={18} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-900">
              Lösch-Antrag liegt vor
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Eingereicht am{' '}
              {new Date(auftrag.eingereicht_am).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
              . Status:{' '}
              {auftrag.status === 'eingereicht' && (
                <strong>wartet auf Admin-Prüfung</strong>
              )}
              {auftrag.status === 'bestaetigt' && (
                <strong>
                  bestätigt — wird in 14 Tagen ausgeführt
                </strong>
              )}
              {auftrag.status === 'ausgefuehrt' && <strong>ausgeführt</strong>}
            </p>
            {auftrag.status !== 'ausgefuehrt' && (
              <button
                type="button"
                onClick={() => antragStornieren(auftrag.id)}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              >
                <XIcon width={12} height={12} />
                {pending ? 'wird storniert …' : 'Antrag stornieren'}
              </button>
            )}
            {error && (
              <p className="mt-2 text-xs text-red-700">{error}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Initial-Zustand: Button zum Antrag stellen
  if (!isOpen) {
    return (
      <div className="rounded-xl border border-claimondo-border bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
            <ShieldAlertIcon width={18} height={18} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-claimondo-navy">
              Account und Daten löschen
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-claimondo-ondo">
              Nach DSGVO Art. 17 können Sie jederzeit die Löschung Ihres Accounts
              und Ihrer personenbezogenen Daten beantragen. Aktive Mandate werden
              dabei mit Ihren Versicherungs-Daten anonymisiert — die Korrespondenz
              mit der Versicherung bleibt aus rechtlichen Gründen 10 Jahre erhalten,
              ohne Bezug zu Ihrer Person.
            </p>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
            >
              Lösch-Antrag stellen
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirm-Form mit optionaler Grund-Angabe
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
          <ShieldAlertIcon width={18} height={18} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-claimondo-navy">
            Sind Sie sicher?
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-claimondo-ondo">
            Nach Bestätigung durch unser Team beginnt eine 14-Tage-Karenz, in der
            Sie den Antrag noch stornieren können. Danach werden Ihre Daten
            anonymisiert und Ihr Login entfernt.
          </p>
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
              Grund (optional)
            </span>
            <textarea
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Warum möchten Sie Ihre Daten löschen lassen?"
              className="mt-1 w-full rounded-lg border border-claimondo-border bg-white p-2 text-xs"
            />
          </label>
          {error && (
            <p className="mt-2 text-xs text-red-700">{error}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={antragStellen}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
            >
              <CheckIcon width={12} height={12} />
              {pending ? 'wird gestellt …' : 'Ja, Antrag stellen'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setGrund('')
                setError(null)
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-claimondo-border bg-white px-3.5 py-1.5 text-xs font-semibold text-claimondo-navy hover:bg-claimondo-bg disabled:opacity-50"
            >
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
