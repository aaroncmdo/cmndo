'use client'

// Onboarding-Feldtyp 'sv-dokumente' — der optionale Dokumenten-Schritt im Basic-SV-Wizard.
//
// Aaron 19.09.2026: „er muss die Dokumente hochladen können im Onboarding, weil das ist ja
// wichtig für die Sicherungsabtretungsunterzeichnung, Datenschutzerklärung etc." — und:
// „wenn Dokumente fehlen, soll der Sachverständige trotzdem angezeigt werden und sogar auch
// buchbar sein." Deshalb: fünf Slots, jeder einzeln hochladbar, KEINER Pflicht. Der Wizard
// lässt „Weiter" immer zu (pflicht=false, siehe src/lib/onboarding/sv-dokumente-phase.ts).
//
// Self-persisting wie CalendarConnectField: der Upload läuft über uploadSvPflichtdokument
// (Storage fall-dokumente/sv-pflicht/<svId>/<slot>/ + Zeile in pflichtdokumente, Status
// 'hochgeladen' — sofort wirksam im Kundenflow). onChange setzt nur einen Marker.
// Den aktuellen Stand je Slot bringt der Loader als `optionen` mit (value=slotId, label=status).

import { useRef, useState } from 'react'
import { CheckCircle2Icon, FileTextIcon, UploadCloudIcon, AlertCircleIcon } from 'lucide-react'
import { Button } from '@/components/primitives'
import { uploadSvPflichtdokument } from '@/lib/actions/sv-verifizierung-actions'
import { SV_DOKUMENTE_SLOTS, type SvDokumentSlotDef } from '@/lib/onboarding/sv-dokumente-phase'
import type { OnboardingFeld } from '../types'

const MAX_MB = 15
const ACCEPT = 'application/pdf,image/jpeg,image/png'

type SlotStatus = 'leer' | 'hochgeladen' | 'geprueft' | 'abgelehnt' | 'ausstehend'

function istVorhanden(status: SlotStatus): boolean {
  return status === 'hochgeladen' || status === 'geprueft'
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
  const [status, setStatus] = useState<Record<string, SlotStatus>>(() => {
    const initial: Record<string, SlotStatus> = {}
    for (const s of SV_DOKUMENTE_SLOTS) {
      const raw = feld.optionen?.find((o) => o.value === s.slotId)?.label ?? 'leer'
      initial[s.slotId] = (['hochgeladen', 'geprueft', 'abgelehnt', 'ausstehend'].includes(raw) ? raw : 'leer') as SlotStatus
    }
    return initial
  })
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
      setStatus((prev) => ({ ...prev, [slotId]: 'hochgeladen' }))
      onChange(new Date().toISOString())
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Upload fehlgeschlagen.')
    } finally {
      setLaufend(null)
    }
  }

  const nachweise = SV_DOKUMENTE_SLOTS.filter((s) => s.gruppe === 'nachweis')
  const kundenUnterlagen = SV_DOKUMENTE_SLOTS.filter((s) => s.gruppe === 'kunde')
  const anzahlDa = SV_DOKUMENTE_SLOTS.filter((s) => istVorhanden(status[s.slotId])).length

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
        status={status}
        laufend={laufend}
        disabled={disabled}
        onDatei={hochladen}
      />

      <Gruppe
        titel="Unterlagen für Ihre Kunden"
        untertitel="Werden Ihren Kunden im Claimondo-Flow vorgelegt und mit unterschrieben, sobald sie hochgeladen sind. Sicherungsabtretung oder Honorarvereinbarung — eines reicht."
        slots={kundenUnterlagen}
        status={status}
        laufend={laufend}
        disabled={disabled}
        onDatei={hochladen}
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
  status,
  laufend,
  disabled,
  onDatei,
}: {
  titel: string
  untertitel: string
  slots: readonly SvDokumentSlotDef[]
  status: Record<string, SlotStatus>
  laufend: string | null
  disabled?: boolean
  onDatei: (slotId: string, file: File) => void
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
            status={status[def.slotId] ?? 'leer'}
            laufend={laufend === def.slotId}
            disabled={disabled || (laufend !== null && laufend !== def.slotId)}
            onDatei={(file) => onDatei(def.slotId, file)}
          />
        ))}
      </div>
    </section>
  )
}

function SlotKachel({
  def,
  status,
  laufend,
  disabled,
  onDatei,
}: {
  def: SvDokumentSlotDef
  status: SlotStatus
  laufend: boolean
  disabled?: boolean
  onDatei: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const vorhanden = istVorhanden(status)

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
          <p className="mt-1 text-[11px] font-medium text-claimondo-navy" data-slot-status={status}>
            {vorhanden ? 'Hochgeladen' : status === 'abgelehnt' ? 'Bitte erneut hochladen' : 'Noch nicht hochgeladen'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
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
          variant={vorhanden ? 'ghost' : 'ondo'}
          size="sm"
          loading={laufend}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <UploadCloudIcon className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {vorhanden ? 'Ersetzen' : 'Hochladen'}
        </Button>
        <span className="text-[11px] text-claimondo-ondo">PDF, JPG oder PNG · max. {MAX_MB} MB</span>
      </div>
    </div>
  )
}
