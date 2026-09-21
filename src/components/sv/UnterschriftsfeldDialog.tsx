'use client'

// Hülle um den UnterschriftsfeldEditor: lädt das Dokument (Vorschau-Link + Seitenmaße +
// bereits gesetzte Position) und speichert die neue Position. Beide Wege kommen als Props
// herein, weil derselbe Dialog in zwei Welten läuft:
//   - Gutachter-Portal (Wizard, Nachweise)  → holeSvDokumentVorschau / setzeSvUnterschriftsfeld
//   - Admin-Akte                            → holeAdminDokumentVorschau / setzeAdminUnterschriftsfeld
// Auth und Zielstatus stecken jeweils in der Action, nicht hier.
//
// Aaron 20.09.2026: „ja aber das Unterschriftsfeld muss gesetzt werden."

import { useCallback, useEffect, useState } from 'react'
import { Modal, Button } from '@/components/primitives'
import { UnterschriftsfeldEditor } from './UnterschriftsfeldEditor'
import type { PdfMasse, SignaturKonfig, SignaturPosition } from '@/lib/sv/unterschriftsfeld'

export type VorschauAntwort =
  | { ok: true; slot_id: string; status: string | null; signed_url: string; masse: PdfMasse; position: SignaturPosition | null }
  | { ok: false; error: string }

export type SpeichernAntwort = { ok: true; slot_id: string; status: string } | { ok: false; error: string }

export function UnterschriftsfeldDialog({
  offen,
  slotId,
  slotLabel,
  laden,
  speichern,
  onSchliessen,
  onGespeichert,
}: {
  offen: boolean
  slotId: string
  slotLabel: string
  laden: (slotId: string) => Promise<VorschauAntwort>
  speichern: (slotId: string, position: SignaturKonfig) => Promise<SpeichernAntwort>
  onSchliessen: () => void
  onGespeichert?: () => void
}) {
  const [zustand, setZustand] = useState<'laedt' | 'bereit' | 'fehler'>('laedt')
  const [fehler, setFehler] = useState<string | null>(null)
  const [daten, setDaten] = useState<{ url: string; masse: PdfMasse; position: SignaturPosition | null } | null>(null)

  const nachladen = useCallback(async () => {
    setZustand('laedt')
    setFehler(null)
    try {
      const res = await laden(slotId)
      if (!res.ok) {
        setFehler(res.error)
        setZustand('fehler')
        return
      }
      setDaten({ url: res.signed_url, masse: res.masse, position: res.position })
      setZustand('bereit')
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Dokument konnte nicht geladen werden.')
      setZustand('fehler')
    }
  }, [laden, slotId])

  useEffect(() => {
    if (!offen) return
    void nachladen()
  }, [offen, nachladen])

  async function speichereUndSchliesse(konfig: SignaturKonfig) {
    const res = await speichern(slotId, konfig)
    if (!res.ok) return res
    onGespeichert?.()
    // Kurz stehen lassen, damit „Gespeichert" sichtbar wird, dann zu.
    setTimeout(() => onSchliessen(), 700)
    return { ok: true as const }
  }

  return (
    <Modal open={offen} onClose={onSchliessen} maxWidth={820} ariaLabel={`Unterschriftsfeld für ${slotLabel} setzen`}>
      {zustand === 'laedt' && (
        <div className="flex min-h-[220px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-claimondo-ondo border-t-transparent" />
        </div>
      )}

      {zustand === 'fehler' && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-claimondo-navy">Dokument konnte nicht geöffnet werden</p>
          <p className="rounded-ios-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger-strong">{fehler}</p>
          <div className="flex gap-2">
            <Button variant="navy" onClick={() => void nachladen()}>
              Erneut versuchen
            </Button>
            <Button variant="ghost" onClick={onSchliessen}>
              Schließen
            </Button>
          </div>
        </div>
      )}

      {zustand === 'bereit' && daten && (
        <UnterschriftsfeldEditor
          pdfUrl={daten.url}
          masse={daten.masse}
          slotLabel={slotLabel}
          initial={daten.position}
          onSpeichern={speichereUndSchliesse}
          onAbbrechen={onSchliessen}
        />
      )}
    </Modal>
  )
}
