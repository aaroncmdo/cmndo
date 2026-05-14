'use client'

// CMM-32 Polish: Kunde-Card fuer den eigene-Kanzlei-Pfad. Erscheint im
// Begutachtungs-Detail-Panel sobald `kanzlei_wunsch='eigene_kanzlei'`
// gesetzt ist (durch KB) und das Gutachten freigegeben wurde.
//
// Workflow:
//   1. Kunde traegt Email + optional Name + Telefon der externen Kanzlei ein
//   2. Klickt „Kanzleipaket versenden" → versendeKanzleiPaketAnEigeneKanzlei
//   3. Action sendet Email an die externe Kanzlei + setzt
//      claim.kanzlei_uebergeben_am + claim.status='an_externe_kanzlei_uebergeben'
//   4. Lifecycle springt automatisch auf Abschluss — wir kuemmern uns ab
//      hier nicht mehr um die Kommunikation.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircleIcon, MailIcon, SendIcon } from 'lucide-react'
import {
  updateKanzleiAnsprechpartner,
  versendeKanzleiPaketAnEigeneKanzlei,
} from '@/lib/kanzlei-wunsch/actions'

type Props = {
  claimId: string
  kanzleiName: string | null
  kanzleiEmail: string | null
  kanzleiTelefon: string | null
  /** TRUE wenn das Paket bereits versendet wurde — Bestaetigungs-State. */
  bereitsVersendet: boolean
  uebergebenAm: string | null
  /** TRUE wenn das Gutachten QC-freigegeben ist. Ohne Freigabe kein Versand. */
  gutachtenFreigegeben: boolean
}

export default function EigeneKanzleiPaketCard({
  claimId,
  kanzleiName,
  kanzleiEmail,
  kanzleiTelefon,
  bereitsVersendet,
  uebergebenAm,
  gutachtenFreigegeben,
}: Props) {
  const router = useRouter()
  const [name, setName] = useState(kanzleiName ?? '')
  const [email, setEmail] = useState(kanzleiEmail ?? '')
  const [telefon, setTelefon] = useState(kanzleiTelefon ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pendingSave, startSave] = useTransition()
  const [pendingSend, startSend] = useTransition()

  if (bereitsVersendet) {
    const datum = uebergebenAm
      ? new Date(uebergebenAm).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        })
      : null
    return (
      <div className="rounded-ios-lg bg-claimondo-ondo/[0.06] border border-claimondo-ondo/30 p-3 text-xs text-claimondo-navy flex items-start gap-2">
        <CheckCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Kanzleipaket versendet</p>
          <p>
            {datum ? `Am ${datum} an ` : 'An '}
            <span className="font-medium">{kanzleiEmail ?? 'deine Kanzlei'}</span>
            {kanzleiName ? ` (${kanzleiName})` : ''}. Ab hier läuft alles
            zwischen dir und deiner Kanzlei — wir sind raus.
          </p>
        </div>
      </div>
    )
  }

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())

  function handleSave() {
    setError(null)
    startSave(async () => {
      const r = await updateKanzleiAnsprechpartner(claimId, {
        name: name.trim() || null,
        email: email.trim() || null,
        telefon: telefon.trim() || null,
      })
      if (!r.ok) setError(r.error ?? 'Speichern fehlgeschlagen')
      else router.refresh()
    })
  }

  function handleSend() {
    setError(null)
    if (!validEmail) {
      setError('Bitte eine gueltige Email der Kanzlei eintragen.')
      return
    }
    if (!gutachtenFreigegeben) {
      setError('Gutachten ist noch nicht freigegeben — Versand nicht moeglich.')
      return
    }
    startSend(async () => {
      // Erst speichern damit der aktuelle Stand der Eingabe persistiert ist
      const saveResult = await updateKanzleiAnsprechpartner(claimId, {
        name: name.trim() || null,
        email: email.trim() || null,
        telefon: telefon.trim() || null,
      })
      if (!saveResult.ok) {
        setError(saveResult.error ?? 'Speichern fehlgeschlagen')
        return
      }
      const r = await versendeKanzleiPaketAnEigeneKanzlei(claimId)
      if (!r.ok) setError(r.error ?? 'Versand fehlgeschlagen')
      else router.refresh()
    })
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-ondo/50 bg-white p-3 space-y-3">
      <div className="flex items-start gap-2">
        <MailIcon className="w-4 h-4 text-claimondo-navy shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-claimondo-navy">
            Du hast eine eigene Kanzlei beauftragt
          </p>
          <p className="text-[11px] text-claimondo-ondo mt-0.5">
            Trag die Email-Adresse deiner Kanzlei ein. Wir schicken ihr das vollständige
            Kanzleipaket (Gutachten + Stammdaten). Danach läuft alles direkt zwischen dir und
            deiner Kanzlei — wir sind raus.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo">Kanzlei (Name)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z.B. Kanzlei Müller & Partner"
            className="mt-1 w-full rounded-ios-md border border-claimondo-border px-2.5 py-1.5 text-xs focus:border-claimondo-ondo focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
            Email *
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kanzlei@beispiel.de"
            className="mt-1 w-full rounded-ios-md border border-claimondo-border px-2.5 py-1.5 text-xs focus:border-claimondo-ondo focus:outline-none"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
            Telefon (optional)
          </span>
          <input
            type="tel"
            value={telefon}
            onChange={(e) => setTelefon(e.target.value)}
            placeholder="+49 ..."
            className="mt-1 w-full rounded-ios-md border border-claimondo-border px-2.5 py-1.5 text-xs focus:border-claimondo-ondo focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-ios-md px-2 py-1">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={pendingSave || pendingSend}
          className="text-xs text-claimondo-ondo hover:text-claimondo-navy px-3 py-1.5 disabled:opacity-50"
        >
          {pendingSave ? 'Speichere…' : 'Speichern'}
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={pendingSave || pendingSend || !validEmail || !gutachtenFreigegeben}
          className="inline-flex items-center gap-1.5 rounded-ios-md bg-claimondo-navy hover:bg-claimondo-navy disabled:bg-claimondo-ondo/60 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
          title={
            !gutachtenFreigegeben
              ? 'Gutachten muss zuerst freigegeben sein'
              : !validEmail
                ? 'Gültige Email eintragen'
                : 'Kanzleipaket per Email versenden'
          }
        >
          <SendIcon className="w-3.5 h-3.5" />
          {pendingSend ? 'Wird versendet…' : 'Kanzleipaket versenden'}
        </button>
      </div>
    </div>
  )
}
