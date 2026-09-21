'use client'

// Onboarding-Feldtyp 'sv-dokumente' — der optionale Dokumenten-Schritt im Basic-SV-Wizard.
//
// Aaron 19.09.2026: „er muss die Dokumente hochladen können im Onboarding, weil das ist ja
// wichtig für die Sicherungsabtretungsunterzeichnung, Datenschutzerklärung etc." — und:
// „wenn Dokumente fehlen, soll der Sachverständige trotzdem angezeigt werden und sogar auch
// buchbar sein." Deshalb: sechs Slots, jeder einzeln hochladbar, KEINER Pflicht. Der Wizard
// lässt „Weiter" immer zu (pflicht=false, siehe src/lib/onboarding/sv-dokumente-phase.ts).
//
// Aaron 20.09.2026: „ja aber das Unterschriftsfeld muss gesetzt werden." Für die vier
// Unterlagen, die der Kunde mit-signiert, öffnet sich direkt nach dem Upload der Editor:
// erst mit gesetztem Feld legen wir das Dokument dem Kunden vor. Der Schritt bleibt trotzdem
// unblockierend — „Später setzen" schließt den Editor, der Wizard läuft weiter.
//
// Self-persisting wie CalendarConnectField: der Upload läuft über uploadSvPflichtdokument
// (Storage fall-dokumente/sv-pflicht/<svId>/<slot>/ + Zeile in pflichtdokumente). onChange
// setzt nur einen Marker. Den aktuellen Stand je Slot bringt der Loader als `optionen` mit
// (value = slotId, label = Zustand aus dokumentZustand()).

import { useRef, useState } from 'react'
import { CheckCircle2Icon, FileTextIcon, UploadCloudIcon, AlertCircleIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { uploadSvPflichtdokument } from '@/lib/actions/sv-verifizierung-actions'
import { SV_DOKUMENTE_SLOTS, type SvDokumentSlotDef } from '@/lib/onboarding/sv-dokumente-phase'
import { istSignaturSlot, type DokumentZustand } from '@/lib/sv/unterschriftsfeld'
import { SvUnterschriftsfeldKnopf } from '@/components/sv/UnterschriftsfeldKnopf'
import type { OnboardingFeld } from '../types'

const MAX_MB = 15
const ACCEPT = 'application/pdf,image/jpeg,image/png'
const ZUSTAENDE: DokumentZustand[] = ['leer', 'feld_fehlt', 'aktiv_ohne_feld', 'aktiv', 'abgelehnt']

/** Im Kundenflow wirksam (mit oder ohne gesetztes Feld). */
function istVorhanden(zustand: DokumentZustand): boolean {
  return zustand === 'aktiv' || zustand === 'aktiv_ohne_feld'
}

function zustandText(zustand: DokumentZustand): string {
  switch (zustand) {
    case 'aktiv':
      return 'Hochgeladen'
    case 'aktiv_ohne_feld':
      return 'Hochgeladen'
    case 'feld_fehlt':
      return 'Hochgeladen — Unterschriftsfeld fehlt'
    case 'abgelehnt':
      return 'Bitte erneut hochladen'
    default:
      return 'Noch nicht hochgeladen'
  }
}

export function SvDokumenteField({
  feld,
  onChange,
  disabled,
}: {
  feld: OnboardingFeld
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [zustand, setZustand] = useState<Record<string, DokumentZustand>>(() => {
    const initial: Record<string, DokumentZustand> = {}
    for (const s of SV_DOKUMENTE_SLOTS) {
      const raw = feld.optionen?.find((o) => o.value === s.slotId)?.label ?? 'leer'
      initial[s.slotId] = (ZUSTAENDE as string[]).includes(raw) ? (raw as DokumentZustand) : 'leer'
    }
    return initial
  })
  // Zählt je Slot hoch, sobald frisch hochgeladen wurde — remountet den Feld-Knopf, der
  // sich dann selbst öffnet (der Editor kommt direkt nach dem Upload, ohne zweiten Klick).
  const [frisch, setFrisch] = useState<Record<string, number>>({})
  const [laufend, setLaufend] = useState<string | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  async function hochladen(slotId: string, file: File) {
    setFehler(null)
    if (file.size > MAX_MB * 1024 * 1024) {
      setFehler(`Datei zu groß — maximal ${MAX_MB} MB.`)
      return
    }
    setLaufend(slotId)
    try {
      const fd = new FormData()
      fd.append('slot_id', slotId)
      fd.append('datei', file)
      const res = await uploadSvPflichtdokument(fd)
      if (!res.ok) {
        setFehler(res.error)
        return
      }
      setZustand((prev) => ({ ...prev, [slotId]: res.braucht_unterschriftsfeld ? 'feld_fehlt' : 'aktiv' }))
      if (res.braucht_unterschriftsfeld) {
        setFrisch((prev) => ({ ...prev, [slotId]: (prev[slotId] ?? 0) + 1 }))
      }
      onChange(new Date().toISOString())
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setLaufend(null)
    }
  }

  function feldGesetzt(slotId: string) {
    setZustand((prev) => ({ ...prev, [slotId]: 'aktiv' }))
  }

  const nachweise = SV_DOKUMENTE_SLOTS.filter((s) => s.gruppe === 'nachweis')
  const kundenUnterlagen = SV_DOKUMENTE_SLOTS.filter((s) => s.gruppe === 'kunde')
  const anzahlDa = SV_DOKUMENTE_SLOTS.filter((s) => istVorhanden(zustand[s.slotId] ?? 'leer')).length

  return (
    <div className="space-y-5">
      <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-4 py-3 text-sm text-claimondo-navy">
        <p className="font-semibold">Alles optional — Sie sind auch ohne Dokumente sichtbar und buchbar.</p>
        <p className="mt-1 text-xs text-claimondo-ondo">
          {anzahlDa === 0
            ? 'Sie können jeden Punkt jetzt oder später im Portal unter „Nachweise" erledigen.'
            : `${anzahlDa} von ${SV_DOKUMENTE_SLOTS.length} hochgeladen — der Rest lässt sich jederzeit nachreichen.`}
        </p>
      </div>

      <Gruppe
        titel="Nachweise"
        untertitel="Berufshaftpflicht und Gewerbeanmeldung — für Ihre Akte bei Claimondo."
        slots={nachweise}
        zustand={zustand}
        frisch={frisch}
        laufend={laufend}
        disabled={disabled}
        onDatei={hochladen}
        onFeldGesetzt={feldGesetzt}
      />

      <Gruppe
        titel="Unterlagen für Ihre Kunden"
        untertitel="Werden Ihren Kunden im Claimondo-Flow vorgelegt und mit unterschrieben. Nach dem Hochladen setzen Sie einmal die Stelle, an der Ihr Kunde unterschreibt. Sicherungsabtretung oder Honorarvereinbarung — eines reicht."
        slots={kundenUnterlagen}
        zustand={zustand}
        frisch={frisch}
        laufend={laufend}
        disabled={disabled}
        onDatei={hochladen}
        onFeldGesetzt={feldGesetzt}
      />

      {fehler && (
        <div className="flex items-start gap-2 rounded-ios-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger-strong">
          <AlertCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{fehler}</span>
        </div>
      )}
    </div>
  )
}

function Gruppe({
  titel,
  untertitel,
  slots,
  zustand,
  frisch,
  laufend,
  disabled,
  onDatei,
  onFeldGesetzt,
}: {
  titel: string
  untertitel: string
  slots: readonly SvDokumentSlotDef[]
  zustand: Record<string, DokumentZustand>
  frisch: Record<string, number>
  laufend: string | null
  disabled?: boolean
  onDatei: (slotId: string, file: File) => void
  onFeldGesetzt: (slotId: string) => void
}) {
  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-claimondo-navy">{titel}</h3>
        <p className="text-xs text-claimondo-ondo">{untertitel}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {slots.map((def) => (
          <SlotKachel
            key={def.slotId}
            def={def}
            zustand={zustand[def.slotId] ?? 'leer'}
            frisch={frisch[def.slotId] ?? 0}
            laufend={laufend === def.slotId}
            disabled={disabled || (laufend !== null && laufend !== def.slotId)}
            onDatei={(file) => onDatei(def.slotId, file)}
            onFeldGesetzt={() => onFeldGesetzt(def.slotId)}
          />
        ))}
      </div>
    </section>
  )
}

function SlotKachel({
  def,
  zustand,
  frisch,
  laufend,
  disabled,
  onDatei,
  onFeldGesetzt,
}: {
  def: SvDokumentSlotDef
  zustand: DokumentZustand
  frisch: number
  laufend: boolean
  disabled?: boolean
  onDatei: (file: File) => void
  onFeldGesetzt: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const vorhanden = istVorhanden(zustand)
  const dateiDa = vorhanden || zustand === 'feld_fehlt'
  const brauchtFeld = istSignaturSlot(def.slotId) && dateiDa && zustand !== 'aktiv'

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-ios-lg border border-claimondo-border bg-claimondo-bg">
          {vorhanden ? (
            <CheckCircle2Icon className="h-5 w-5 text-success-strong" aria-hidden="true" />
          ) : (
            <FileTextIcon className="h-5 w-5 text-claimondo-ondo" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-claimondo-navy">{def.label}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-claimondo-ondo">{def.beschreibung}</p>
          <p className="mt-1 text-[11px] font-medium text-claimondo-navy" data-slot-status={zustand}>
            {zustandText(zustand)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          aria-label={`${def.label} hochladen`}
          disabled={disabled || laufend}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onDatei(file)
            e.target.value = ''
          }}
        />
        <Button
          variant={dateiDa ? 'ghost' : 'ondo'}
          size="sm"
          loading={laufend}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloudIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {dateiDa ? 'Ersetzen' : 'Hochladen'}
        </Button>
        {!dateiDa && <span className="text-[11px] text-claimondo-ondo">PDF, JPG oder PNG · max. {MAX_MB} MB</span>}
        {brauchtFeld && (
          <SvUnterschriftsfeldKnopf
            key={`${def.slotId}-${frisch}`}
            slotId={def.slotId}
            slotLabel={def.label}
            gesetzt={false}
            bestandOhneFeld={zustand === 'aktiv_ohne_feld'}
            sofortOeffnen={frisch > 0}
            disabled={disabled}
            onGespeichert={onFeldGesetzt}
          />
        )}
      </div>
    </div>
  )
}
