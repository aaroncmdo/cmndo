'use client'

// WerkstattIntakeSignatur — Signatur-only-Flaeche fuer den werkstatt-getriebenen Haftpflicht-Intake.
// Die Werkstatt hat alle Falldaten gefuellt; hier sieht der Kunde eine Read-only-Zusammenfassung
// und unterschreibt nur die Sicherungsabtretung (via <SaSignaturStep>). Laeuft entweder auf dem
// Werkstatt-Geraet (primaer, Kunde vor Ort) oder auf dem Kunden-Geraet (per Link). Nach der
// Signatur wird der Kunden-Account automatisch angelegt (createKundeAccount, idempotent).
//
// i18n-Follow-up: die INFORMATIONELLEN Labels/Texte hier sind DE-Literale (Primaerfall = Kunde
// vor Ort in einer deutschen Werkstatt). Der rechtlich kritische SA-Text ist via SaSignaturStep
// (t('step_sa.*')) voll uebersetzt (alle 6 Locales). Volle i18n der Intake-Labels = Follow-up.

import { useState, useEffect } from 'react'
import { CheckIcon } from 'lucide-react'
import { Card } from '@/components/primitives'
import SaSignaturStep from './SaSignaturStep'
import { createKundeAccount } from './actions'

interface WerkstattIntakeSignaturProps {
  token: string
  leadId: string
  flowLinkId: string | null
  // Derselbe (narrow) Type wie SaSignaturStep/FlowWizardKfz — NICHT ReturnType<getAllLegalDocs>
  // (das zieht `server-only` in den Client-Bundle).
  legalDocs?: {
    datenschutz?: { titel: string; markdown: string }
    agb?: { titel: string; markdown: string }
  }
  // Read-only-Zusammenfassung dessen, was die Werkstatt eingegeben hat.
  zusammenfassung: {
    vorname: string
    nachname: string
    fahrzeug: string
    kennzeichen: string
    unfalldatum: string | null
    unfallort: string | null
    unfallhergang: string | null
    gegnerName: string | null
    gegnerVersicherung: string | null
  }
  kundeEmail: string
  kundeVorname: string
  kundeNachname: string
  kundeTelefon: string
}

export default function WerkstattIntakeSignatur({
  token,
  leadId,
  flowLinkId,
  legalDocs,
  zusammenfassung,
  kundeEmail,
  kundeVorname,
  kundeNachname,
  kundeTelefon,
}: WerkstattIntakeSignaturProps) {
  const [fallId, setFallId] = useState<string | null>(null)
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [accountDone, setAccountDone] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)

  // Nach der SA-Signatur (onSigned -> fallId) automatisch den Kunden-Account anlegen.
  // Spiegelt den Account-Step des FlowWizardKfz (createKundeAccount, idempotent, F1-Token-Bindung).
  useEffect(() => {
    if (!fallId || accountDone || creatingAccount) return
    let cancelled = false
    void (async () => {
      setCreatingAccount(true)
      const r = await createKundeAccount(
        fallId,
        token,
        kundeEmail,
        kundeVorname,
        kundeNachname,
        kundeTelefon || null,
      )
      if (cancelled) return
      setCreatingAccount(false)
      if (r.success) setAccountDone(true)
      else setAccountError(r.error ?? 'Konto konnte nicht angelegt werden.')
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallId])

  const fmtDatum = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
      : null

  // ─── Erfolgs-Screen (nach der Signatur) ────────────────────────────────────
  if (fallId) {
    return (
      <div className="min-h-screen bg-claimondo-bg flex items-center justify-center p-4">
        <Card p={8} shadow="lg" className="max-w-md text-center">
          <div className="w-14 h-14 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-4">
            <CheckIcon className="w-7 h-7 text-success" />
          </div>
          <h1 className="text-xl font-bold text-claimondo-navy mb-2">Vielen Dank — dein Auftrag ist eingegangen</h1>
          <p className="text-claimondo-ondo text-sm">
            {accountError
              ? 'Deine Unterschrift ist gespeichert. Wir richten deinen Zugang in Kürze ein und melden uns bei dir.'
              : creatingAccount
                ? 'Wir richten deinen persönlichen Zugang ein …'
                : 'Wir haben dir einen Zugang per E-Mail geschickt. Dein Gutachter wird zugewiesen und meldet sich zeitnah bei dir.'}
          </p>
        </Card>
      </div>
    )
  }

  // ─── Signatur-Flaeche: Read-only-Zusammenfassung + SA-Signatur ─────────────
  const name = [zusammenfassung.vorname, zusammenfassung.nachname].filter(Boolean).join(' ')
  const fahrzeugZeile = [zusammenfassung.fahrzeug, zusammenfassung.kennzeichen].filter(Boolean).join(' · ')
  const unfallZeile = [fmtDatum(zusammenfassung.unfalldatum), zusammenfassung.unfallort].filter(Boolean).join(' · ')
  const gegnerZeile = [zusammenfassung.gegnerName, zusammenfassung.gegnerVersicherung].filter(Boolean).join(' · ')

  return (
    <div className="min-h-screen bg-claimondo-bg py-6 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold text-claimondo-navy mb-1 text-center">Bitte bestätigen &amp; unterschreiben</h1>
        <p className="text-claimondo-ondo text-sm mb-6 text-center">
          Deine Werkstatt hat deinen Vorgang vorbereitet. Bitte prüf die Angaben und unterschreib
          die Sicherungsabtretung.
        </p>

        {/* Read-only-Zusammenfassung der Werkstatt-Eingaben */}
        <Card p={5} className="mb-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-claimondo-ondo/70">Deine Angaben</p>
          <SummaryRow label="Name" value={name || '–'} />
          <SummaryRow label="Fahrzeug" value={fahrzeugZeile || '–'} />
          <SummaryRow label="Unfall" value={unfallZeile || '–'} />
          {zusammenfassung.unfallhergang && <SummaryRow label="Hergang" value={zusammenfassung.unfallhergang} />}
          {gegnerZeile && <SummaryRow label="Unfallgegner" value={gegnerZeile} />}
        </Card>

        {/* SA-Signatur (geteilte Komponente; kein SV-Consent, kein Feld-Lock) */}
        <Card p={5}>
          <SaSignaturStep
            token={token}
            leadId={leadId}
            flowLinkId={flowLinkId}
            gutachterAnzeige={null}
            legalDocs={legalDocs}
            onSigned={setFallId}
          />
        </Card>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-claimondo-ondo shrink-0">{label}</span>
      <span className="text-claimondo-navy text-right font-medium">{value}</span>
    </div>
  )
}
