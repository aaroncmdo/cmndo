'use client'

// AAR-755 (Phase D): aus dem DokumenteTab-Monolithen extrahiert.
// AAR-170 QC-Checkliste (Filmcheck). 9 Tri-State-Checkboxen (null/true/
// false) + Kommentar + 3 Actions (Speichern, Bestanden, Nachbesserung).
// Bestanden triggert den Kanzlei-Übergabe-Flow server-seitig.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheckIcon, FileTextIcon, AlertTriangleIcon } from 'lucide-react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  qcBestanden,
  qcNachbesserung,
  upsertQcCheckliste,
} from '../../../../app/faelle/[id]/_actions'
import { qcChecklisteVollstaendig } from '@/lib/qc/checkliste-validation'
import { useFall } from '@/app/faelle/[id]/FallContext'
import { can } from '@/lib/permissions/helpers'
// Filmcheck QC-Anomalie-Erkennung: reine (server-import-freie) Logik, hier nur der Typ.
import type { GutachtenAnomalie } from '@/lib/qc/anomalien'

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

/**
 * Filmcheck Phase 3 (P3a): read-only-Kurzansicht der per OCR aus dem Gutachten
 * extrahierten Kern-Werte. KB prueft die Zahlen direkt beim Abhaken; Editieren
 * bleibt der admin-only GutachtenOcrCard vorbehalten. Alle Felder null -> nichts
 * rendern (historisch 0 OCR-Laeufe).
 */
export type QcOcrWerte = {
  reparaturkosten_netto: number | null
  restwert: number | null
  wiederbeschaffungswert: number | null
  minderwert: number | null
  gesamt_schadensbetrag: number | null
  totalschaden: boolean | null
}

type Props = {
  fallId: string
  qcCheckliste: QcCheckliste | null
  /** Filmcheck #7: aus Falldaten auto-vorbefuellte Checks (KB-Wert gewinnt). */
  autoChecks?: Record<string, boolean>
  /** Filmcheck #7: Gutachten-PDF zur Inline-Pruefung. */
  gutachtenUrl?: string | null
  /** Filmcheck Phase 3: read-only OCR-Kern-Werte fuer den KB (keine Edit-Rechte). */
  qcOcrWerte?: QcOcrWerte | null
  /**
   * Filmcheck QC-Anomalien (02.07.): geflaggte Widersprueche in den OCR-Werten. Leer/
   * undefined -> kein Pruef-Hinweise-Block. Berechnet in page.tsx via
   * berechneGutachtenAnomalien().
   */
  qcAnomalien?: GutachtenAnomalie[]
}

const formatEuro = (n: number | null) =>
  n == null ? '–' : n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

export function QcChecklisteBlock({ fallId, qcCheckliste, autoChecks, gutachtenUrl, qcOcrWerte, qcAnomalien }: Props) {
  const router = useRouter()
  const [qcState, setQcState] = useState<Record<string, boolean | null>>(() => {
    const init: Record<string, boolean | null> = {}
    for (const { key } of QC_FIELDS) {
      // Filmcheck #7: gespeicherter KB-Wert gewinnt, sonst Auto-Ableitung, sonst offen.
      const saved = qcCheckliste?.[key] as boolean | null | undefined
      init[key as string] = saved ?? autoChecks?.[key as string] ?? null
    }
    return init
  })
  const [qcKommentar, setQcKommentar] = useState<string>(qcCheckliste?.kommentar ?? '')
  const [qcPending, startQcTransition] = useTransition()
  // Die QC-Server-Actions gaten auf 'dokumente.qc' (admin + kundenbetreuer; dispatch
  // darf ausdruecklich NICHT — src/lib/permissions/matrix.test.ts). Ohne dieselbe
  // Pruefung hier sah dispatch die Aktionen und bekam beim Klick garantiert
  // "Keine Berechtigung für die QC-Prüfung". Lesen bleibt erlaubt.
  const { userRolle } = useFall()
  const darfQc = can(userRolle, 'dokumente.qc')
  const qcStatus = qcCheckliste?.status ?? null
  // Filmcheck-Audit 29.06.2026: "Bestanden" erst freigeben, wenn alle Pflicht-Checks
  // auf "Ja" stehen (Server-Action erzwingt es zusaetzlich hart).
  const alleChecksOk = qcChecklisteVollstaendig(qcState)

  function toggleQc(key: string) {
    setQcState((prev) => ({
      ...prev,
      [key]: prev[key] === true ? false : prev[key] === false ? null : true,
    }))
  }

  function handleSpeichern() {
    startQcTransition(async () => {
      const result = await upsertQcCheckliste(fallId, { ...qcState, kommentar: qcKommentar || null })
      if (!result.success) {
        toast.error(result.error ?? 'Speichern fehlgeschlagen')
        return
      }
      toast.success('QC-Checkliste gespeichert')
      router.refresh()
    })
  }

  function handleBestanden() {
    startQcTransition(async () => {
      const upsertResult = await upsertQcCheckliste(fallId, qcState)
      if (!upsertResult.success) {
        toast.error(upsertResult.error ?? 'QC-Bestanden fehlgeschlagen')
        return
      }
      const bestandenResult = await qcBestanden(fallId, qcKommentar)
      if (!bestandenResult.success) {
        toast.error(bestandenResult.error ?? 'QC-Bestanden fehlgeschlagen')
        return
      }
      toast.success('QC bestanden — Kanzlei-Übergabe läuft')
      router.refresh()
    })
  }

  function handleNachbesserung() {
    if (!qcKommentar.trim()) {
      toast.error('Kommentar erforderlich — Sachverständiger braucht Anmerkungen')
      return
    }
    startQcTransition(async () => {
      const upsertResult = await upsertQcCheckliste(fallId, qcState)
      if (!upsertResult.success) {
        toast.error(upsertResult.error ?? 'Nachbesserung fehlgeschlagen')
        return
      }
      const nachbesserungResult = await qcNachbesserung(fallId, qcKommentar)
      if (!nachbesserungResult.success) {
        toast.error(nachbesserungResult.error ?? 'Nachbesserung fehlgeschlagen')
        return
      }
      toast.success('Nachbesserung angefordert — Task für SV erstellt')
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-claimondo-border rounded-ios-xl overflow-hidden">
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
        {gutachtenUrl && (
          <a
            href={gutachtenUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-ios-lg border border-claimondo-ondo/30 bg-claimondo-ondo/[0.06] text-xs font-medium text-claimondo-navy hover:border-claimondo-ondo"
          >
            <span className="flex items-center gap-2">
              <FileTextIcon className="w-3.5 h-3.5" /> Gutachten öffnen (zur Prüfung)
            </span>
            <span className="text-claimondo-ondo">↗</span>
          </a>
        )}
        <QcOcrWerteBlock werte={qcOcrWerte} />
        <QcAnomalienBlock anomalien={qcAnomalien} />
        {autoChecks && Object.keys(autoChecks).length > 0 && (
          <p className="text-[10px] text-claimondo-ondo/70">
            Einige Felder sind aus den Falldaten vorbefüllt — bitte prüfen, die offenen („—") selbst beurteilen.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {QC_FIELDS.map(({ key, label }) => {
            const v = qcState[key as string]
            const badge =
              v === true
                ? {
                    bg: 'bg-success-soft border-success/30 text-success-strong',
                    txt: 'Ja',
                  }
                : v === false
                  ? { bg: 'bg-danger-soft border-danger/30 text-danger-strong', txt: 'Nein' }
                  : {
                      bg: 'bg-claimondo-bg border-claimondo-border text-claimondo-ondo',
                      txt: '—',
                    }
            return (
              <button
                key={key as string}
                type="button"
                onClick={() => toggleQc(key as string)}
                disabled={!darfQc}
                className={`flex items-center justify-between px-3 py-2 rounded-ios-lg border text-xs font-medium transition-colors hover:border-claimondo-ondo ${badge.bg}`}
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
            className="w-full px-3 py-2 text-xs border border-claimondo-border rounded-ios-lg focus:outline-none focus:ring-1 focus:ring-claimondo-ondo"
          />
        </div>
        {!darfQc && (
          <p className="text-[10px] text-claimondo-ondo/70">
            Nur Lesezugriff — die QC-Prüfung übernimmt der Kundenbetreuer oder ein Admin.
          </p>
        )}
        <div className={`flex flex-wrap gap-2 ${darfQc ? '' : 'hidden'}`}>
          <button
            type="button"
            onClick={handleSpeichern}
            disabled={qcPending || !darfQc}
            className="px-3 py-1.5 rounded-ios-md bg-white border border-claimondo-border text-claimondo-navy text-xs font-medium hover:bg-claimondo-bg disabled:opacity-50"
          >
            Zwischenstand speichern
          </button>
          <button
            type="button"
            onClick={handleBestanden}
            disabled={qcPending || !alleChecksOk || !darfQc}
            title={alleChecksOk ? undefined : 'Erst alle Pflicht-Checks auf „Ja" setzen'}
            className="px-3 py-1.5 rounded-ios-md bg-success text-white text-xs font-medium hover:bg-success-strong disabled:opacity-50"
          >
            QC bestanden → Kanzlei übergeben
          </button>
          <button
            type="button"
            onClick={handleNachbesserung}
            disabled={qcPending || !darfQc}
            className="px-3 py-1.5 rounded-ios-md bg-warning text-white text-xs font-medium hover:bg-warning-strong disabled:opacity-50"
          >
            Nachbesserung anfordern
          </button>
        </div>
        <p className="text-[10px] text-claimondo-ondo/70">
          Klick auf ein Feld zykelt zwischen — / Ja / Nein. Bestanden speichert
          automatisch + löst Filmcheck-Flow aus (Kanzlei-Paket, AS-Sendedatum).
        </p>
        {!alleChecksOk && (
          <p className="text-[10px] text-warning-strong">
            Kanzlei-Übergabe gesperrt, bis alle Pflicht-Checks auf „Ja" stehen.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Filmcheck Phase 3 (P3a): read-only OCR-Kern-Werte im Filmcheck. Nur zur Ansicht
 * fuer den KB — Editieren bleibt der admin-only GutachtenOcrCard vorbehalten.
 * Rendert nichts, wenn alle Werte null sind (historisch 0 OCR-Laeufe).
 */
function QcOcrWerteBlock({ werte }: { werte?: QcOcrWerte | null }) {
  if (!werte) return null
  const eurFelder: { key: keyof QcOcrWerte; label: string }[] = [
    { key: 'reparaturkosten_netto', label: 'Reparaturkosten netto' },
    { key: 'wiederbeschaffungswert', label: 'Wiederbeschaffungswert' },
    { key: 'restwert', label: 'Restwert' },
    { key: 'minderwert', label: 'Minderwert' },
    { key: 'gesamt_schadensbetrag', label: 'Gesamt-Schadensbetrag' },
  ]
  const hatEur = eurFelder.some((f) => werte[f.key] != null)
  const hatTotalschaden = werte.totalschaden != null
  // Alle Werte null -> nichts rendern (kein leerer Kasten).
  if (!hatEur && !hatTotalschaden) return null

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-claimondo-bg/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo/70 font-semibold mb-2">
        Gutachten-Werte (aus OCR · nur Ansicht)
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {eurFelder.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-2">
            <dt className="text-claimondo-ondo/80">{f.label}</dt>
            <dd className="text-claimondo-navy font-medium text-right">{formatEuro(werte[f.key] as number | null)}</dd>
          </div>
        ))}
        {hatTotalschaden && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-claimondo-ondo/80">Totalschaden</dt>
            <dd className="text-claimondo-navy font-medium text-right">{werte.totalschaden ? 'Ja' : 'Nein'}</dd>
          </div>
        )}
      </dl>
    </div>
  )
}

/**
 * Filmcheck QC-Anomalien (02.07.): flaggt Widersprueche in den OCR-Werten, damit der KB
 * WARNUNGEN prueft statt blind abzuhaken. warnung -> danger-Tokens, hinweis -> warning-
 * Tokens. Rendert nichts, wenn keine Anomalien vorliegen (kein leerer Kasten).
 */
function QcAnomalienBlock({ anomalien }: { anomalien?: GutachtenAnomalie[] }) {
  if (!anomalien || anomalien.length === 0) return null
  return (
    <div className="rounded-ios-lg border border-warning/40 bg-warning-soft/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-warning-strong font-semibold mb-2 flex items-center gap-1.5">
        <AlertTriangleIcon className="w-3 h-3" /> Prüf-Hinweise ({anomalien.length})
      </p>
      <ul className="space-y-1.5">
        {anomalien.map((a) => {
          const cls =
            a.schwere === 'warnung'
              ? 'bg-danger-soft border-danger/30 text-danger-strong'
              : 'bg-warning-soft border-warning/30 text-warning-strong'
          return (
            <li
              key={a.code}
              className={`flex items-start gap-2 px-2.5 py-1.5 rounded-ios-md border text-xs ${cls}`}
            >
              <AlertTriangleIcon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{a.text}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
