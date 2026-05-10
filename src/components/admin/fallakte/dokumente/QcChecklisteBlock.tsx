'use client'

// AAR-755 (Phase D): aus dem DokumenteTab-Monolithen extrahiert.
// AAR-170 QC-Checkliste (Filmcheck). 9 Tri-State-Checkboxen (null/true/
// false) + Kommentar + 3 Actions (Speichern, Bestanden, Nachbesserung).
// Bestanden triggert den Kanzlei-Übergabe-Flow server-seitig.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheckIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  qcBestanden,
  qcNachbesserung,
  upsertQcCheckliste,
} from '../../../../app/faelle/[id]/_actions'

// AAR-170: die 9 Prüf-Felder entsprechen 1:1 den Spalten in `qc_checkliste`
// (information_schema-verifiziert).
export type QcCheckliste = {
  id?: string
  fall_id?: string
  gutachten_vorhanden?: boolean | null
  gutachten_vollstaendig?: boolean | null
  fin_17_zeichen?: boolean | null
  schadenspositionen_erfasst?: boolean | null
  fotos_ausreichend?: boolean | null
  sa_vorhanden?: boolean | null
  vollmacht_vorhanden?: boolean | null
  kundendaten_vollstaendig?: boolean | null
  vorschaeden_beruecksichtigt?: boolean | null
  kommentar?: string | null
  status?: string | null
  geprueft_von?: string | null
  geprueft_am?: string | null
}

const QC_FIELDS: { key: keyof QcCheckliste; label: string }[] = [
  { key: 'gutachten_vorhanden', label: 'Gutachten hochgeladen' },
  { key: 'gutachten_vollstaendig', label: 'Gutachten vollständig' },
  { key: 'fin_17_zeichen', label: 'FIN 17 Zeichen' },
  { key: 'schadenspositionen_erfasst', label: 'Positionen erfasst' },
  { key: 'fotos_ausreichend', label: 'Fotos ausreichend' },
  { key: 'sa_vorhanden', label: 'SA vorhanden' },
  { key: 'vollmacht_vorhanden', label: 'Vollmacht vorhanden' },
  { key: 'kundendaten_vollstaendig', label: 'Kundendaten komplett' },
  { key: 'vorschaeden_beruecksichtigt', label: 'Vorschäden berücksichtigt' },
]

type Props = {
  fallId: string
  qcCheckliste: QcCheckliste | null
}

export function QcChecklisteBlock({ fallId, qcCheckliste }: Props) {
  const router = useRouter()
  const [qcState, setQcState] = useState<Record<string, boolean | null>>(() => {
    const init: Record<string, boolean | null> = {}
    for (const { key } of QC_FIELDS) {
      init[key as string] = (qcCheckliste?.[key] as boolean | null | undefined) ?? null
    }
    return init
  })
  const [qcKommentar, setQcKommentar] = useState<string>(qcCheckliste?.kommentar ?? '')
  const [qcPending, startQcTransition] = useTransition()
  const qcStatus = qcCheckliste?.status ?? null

  function toggleQc(key: string) {
    setQcState((prev) => ({
      ...prev,
      [key]: prev[key] === true ? false : prev[key] === false ? null : true,
    }))
  }

  function handleSpeichern() {
    startQcTransition(async () => {
      try {
        await upsertQcCheckliste(fallId, { ...qcState, kommentar: qcKommentar || null })
        toast.success('QC-Checkliste gespeichert')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
      }
    })
  }

  function handleBestanden() {
    startQcTransition(async () => {
      try {
        await upsertQcCheckliste(fallId, qcState)
        await qcBestanden(fallId, qcKommentar)
        toast.success('QC bestanden — Kanzlei-Übergabe läuft')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'QC-Bestanden fehlgeschlagen')
      }
    })
  }

  function handleNachbesserung() {
    if (!qcKommentar.trim()) {
      toast.error('Kommentar erforderlich — Sachverständiger braucht Anmerkungen')
      return
    }
    startQcTransition(async () => {
      try {
        await upsertQcCheckliste(fallId, qcState)
        await qcNachbesserung(fallId, qcKommentar)
        toast.success('Nachbesserung angefordert — Task für SV erstellt')
        router.refresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Nachbesserung fehlgeschlagen')
      }
    })
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-claimondo-border flex items-center justify-between bg-claimondo-bg">
        <h3 className="text-xs font-semibold text-claimondo-ondo uppercase tracking-wider flex items-center gap-2">
          <ClipboardCheckIcon className="w-3.5 h-3.5" /> QC-Checkliste (Filmcheck)
        </h3>
        {qcStatus && (
          <StatusBadge
            tone={
              qcStatus === 'bestanden'
                ? 'success'
                : qcStatus === 'nachbesserung'
                  ? 'warning'
                  : 'neutral'
            }
          >
            {qcStatus === 'bestanden'
              ? 'Bestanden'
              : qcStatus === 'nachbesserung'
                ? 'Nachbesserung'
                : qcStatus}
          </StatusBadge>
        )}
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QC_FIELDS.map(({ key, label }) => {
            const v = qcState[key as string]
            const badge =
              v === true
                ? {
                    bg: 'bg-emerald-50 border-emerald-200 text-emerald-700',
                    txt: 'Ja',
                  }
                : v === false
                  ? { bg: 'bg-red-50 border-red-200 text-red-700', txt: 'Nein' }
                  : {
                      bg: 'bg-claimondo-bg border-claimondo-border text-claimondo-ondo',
                      txt: '—',
                    }
            return (
              <button
                key={key as string}
                type="button"
                onClick={() => toggleQc(key as string)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-colors hover:border-claimondo-ondo ${badge.bg}`}
              >
                <span className="text-claimondo-navy">{label}</span>
                <span className="ml-2 text-[10px]">{badge.txt}</span>
              </button>
            )
          })}
        </div>
        <div>
          <label className="block text-[10px] text-claimondo-ondo uppercase tracking-wider mb-1">
            Kommentar / Anmerkungen
          </label>
          <textarea
            value={qcKommentar}
            onChange={(e) => setQcKommentar(e.target.value)}
            rows={3}
            placeholder="Bei Nachbesserung: konkrete Hinweise für Sachverständigen"
            className="w-full px-3 py-2 text-xs border border-claimondo-border rounded-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSpeichern}
            disabled={qcPending}
            className="px-3 py-1.5 rounded-md bg-white border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50"
          >
            Zwischenstand speichern
          </button>
          <button
            type="button"
            onClick={handleBestanden}
            disabled={qcPending}
            className="px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
          >
            QC bestanden → Kanzlei übergeben
          </button>
          <button
            type="button"
            onClick={handleNachbesserung}
            disabled={qcPending}
            className="px-3 py-1.5 rounded-md bg-orange-600 text-white text-xs font-medium hover:bg-orange-700 disabled:opacity-50"
          >
            Nachbesserung anfordern
          </button>
        </div>
        <p className="text-[10px] text-claimondo-ondo/70">
          Klick auf ein Feld zykelt zwischen — / Ja / Nein. Bestanden speichert
          automatisch + löst Filmcheck-Flow aus (Kanzlei-Paket, AS-Sendedatum).
        </p>
      </div>
    </div>
  )
}
