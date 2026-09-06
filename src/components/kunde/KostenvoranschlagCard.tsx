'use client'

// KVA-Loop (Kunde-Seite) — Kostenvoranschlag-Card fuer die Kunde-Fallakte.
// Zeigt den von der Werkstatt hochgeladenen Kostenvoranschlag (Betrag + PDF)
// und laesst den Kunden die Reparaturkosten freigeben
// (-> claims.reparatur_freigegeben_am via genehmigeKvaPortal).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileTextIcon } from 'lucide-react'

import { formatBerlin } from '@/lib/google-calendar/timezone'
import { genehmigeKvaPortal, lehneKvaAbPortal } from '@/app/kunde/faelle/[id]/kva-freigabe-actions'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, Button } from '@/components/primitives'
import SignaturePadInput from '@/components/SignaturePadInput'

export type KostenvoranschlagCardProps = {
  claimId: string
  kostenvoranschlagNetto: number | null
  kostenvoranschlagBrutto: number | null
  freigegebenAm: string | null
  pdfUrl?: string | null
  // AV8: von der Werkstatt beim KVA-Upload angegebene Reparaturdauer (Tage).
  reparaturdauerTage?: number | null
  // R1: Kunde-KVA-Ablehnung — Zeitpunkt + Grund. Gesetzt => „Abgelehnt, Werkstatt überarbeitet".
  abgelehntAm?: string | null
  abgelehntGrund?: string | null
}

function formatEuro(n: number): string {
  return n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
}

export default function KostenvoranschlagCard({
  claimId,
  kostenvoranschlagNetto,
  kostenvoranschlagBrutto,
  freigegebenAm,
  pdfUrl,
  reparaturdauerTage,
  abgelehntAm,
  abgelehntGrund,
}: KostenvoranschlagCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  // AV6: der Kunde unterschreibt den Reparaturauftrag (PNG data URI), bevor er freigibt.
  const [signature, setSignature] = useState<string | null>(null)
  // R1: Ablehn-Formular (Grund optional) — aufklappbar unter der Freigabe.
  const [showReject, setShowReject] = useState(false)
  const [rejectGrund, setRejectGrund] = useState('')

  // Betrag: brutto bevorzugt, sonst netto. Defensiver Guard — der Parent
  // rendert die Card nur bei vorhandenem KVA, aber falls doch beide null sind
  // zeigen wir keinen Betrag (Card bleibt trotzdem als Freigabe-Trigger sinnvoll).
  const betrag = kostenvoranschlagBrutto ?? kostenvoranschlagNetto ?? null
  const betragLabel = kostenvoranschlagBrutto != null ? 'brutto' : 'netto'

  const freigegeben = !!freigegebenAm
  // R1: „abgelehnt"-State nur solange NICHT (neu) freigegeben. Die Werkstatt resettet beim
  // KVA-Re-Upload sowohl kva_abgelehnt_am als auch reparatur_freigegeben_am → die Card kehrt in
  // den Freigabe-Modus zurück (mit dem neuen Betrag).
  const abgelehnt = !!abgelehntAm && !freigegeben

  async function handleFreigeben() {
    if (!signature) {
      toast.error('Bitte unterschreibe den Reparaturauftrag.')
      return
    }
    const res = await genehmigeKvaPortal(claimId, signature)
    if (!res.ok) {
      toast.error(res.error ?? 'Fehler')
      return
    }
    toast.success('Reparaturauftrag freigegeben.')
    startTransition(() => router.refresh())
  }

  async function handleAblehnen() {
    const res = await lehneKvaAbPortal(claimId, rejectGrund)
    if (!res.ok) {
      toast.error(res.error ?? 'Fehler')
      return
    }
    toast.success('Kostenvoranschlag abgelehnt. Die Werkstatt überarbeitet ihn.')
    setShowReject(false)
    startTransition(() => router.refresh())
  }

  return (
    <Card>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <FileTextIcon className="w-5 h-5 text-claimondo-ondo" />
          <h2 className="text-sm font-semibold text-claimondo-navy">Kostenvoranschlag</h2>
        </div>

        {/* Betrag */}
        {betrag != null && (
          <div>
            <p className="text-2xl font-bold text-claimondo-navy">{formatEuro(betrag)}</p>
            <p className="text-body-sm text-claimondo-ondo">Reparaturkosten ({betragLabel})</p>
          </div>
        )}

        {/* AV8: von der Werkstatt angegebene Reparaturdauer */}
        {reparaturdauerTage != null && (
          <p className="text-body-sm text-claimondo-ondo">
            Voraussichtliche Reparaturdauer: {reparaturdauerTage} Tage
          </p>
        )}

        {/* Freigabe-Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {freigegeben ? (
            <StatusBadge tone="success" size="xs">
              Freigegeben am{' '}
              {formatBerlin(freigegebenAm as string, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </StatusBadge>
          ) : abgelehnt ? (
            <StatusBadge tone="warning" size="xs">
              Abgelehnt am{' '}
              {formatBerlin(abgelehntAm as string, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </StatusBadge>
          ) : (
            <StatusBadge tone="neutral" size="xs">
              Freigabe ausstehend
            </StatusBadge>
          )}
        </div>

        {/* R1: Abgelehnt-State — der Kunde hat den KVA abgelehnt, die Werkstatt überarbeitet ihn. */}
        {abgelehnt && (
          <div className="rounded-ios-lg bg-warning-soft px-3 py-2.5">
            <p className="text-body-sm text-claimondo-navy">
              Sie haben den Kostenvoranschlag abgelehnt. Die Werkstatt wurde benachrichtigt und
              überarbeitet ihn — sobald ein neuer Kostenvoranschlag vorliegt, können Sie ihn hier
              freigeben.
            </p>
            {abgelehntGrund && (
              <p className="text-body-sm text-claimondo-ondo mt-1.5">Ihr Hinweis: „{abgelehntGrund}“</p>
            )}
          </div>
        )}

        {/* Freigabe-/Ablehn-Aktion — nur solange weder freigegeben noch abgelehnt. AV6: per Unterschrift. */}
        {!freigegeben && !abgelehnt && (
          <div className="space-y-3 pt-1">
            <p className="text-body-sm text-claimondo-ondo">
              Prüf den Kostenvoranschlag und erteil den Reparaturauftrag mit Ihrer
              Unterschrift, damit die Werkstatt mit der Reparatur beginnen kann.
            </p>
            <div>
              <p className="text-body-xs uppercase tracking-wider text-claimondo-ondo mb-2">
                Unterschrift
              </p>
              <SignaturePadInput value={signature} onChange={setSignature} />
            </div>
            <Button
              variant="navy"
              size="sm"
              loading={isPending}
              disabled={!signature}
              onClick={handleFreigeben}
            >
              Reparaturauftrag erteilen
            </Button>

            {/* R1: Ablehnen — falls mit dem KVA etwas nicht stimmt (Un-stuck statt sign-or-nothing). */}
            <div className="border-t border-claimondo-border pt-3">
              {!showReject ? (
                <button
                  type="button"
                  onClick={() => setShowReject(true)}
                  className="text-body-sm font-medium text-claimondo-ondo hover:text-claimondo-navy underline underline-offset-2"
                >
                  Kostenvoranschlag ablehnen
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-body-sm text-claimondo-ondo">
                    Was passt am Kostenvoranschlag nicht? Die Werkstatt erhält Ihren Hinweis und
                    überarbeitet den Kostenvoranschlag.
                  </p>
                  <textarea
                    value={rejectGrund}
                    onChange={(e) => setRejectGrund(e.target.value)}
                    placeholder="Grund (optional) — z. B. zu teuer, Zweitmeinung gewünscht"
                    rows={3}
                    className="w-full border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy resize-none focus:outline-none focus:border-claimondo-ondo"
                  />
                  <div className="flex gap-2">
                    <Button variant="danger" size="sm" loading={isPending} onClick={handleAblehnen}>
                      Ablehnung senden
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PDF-Link oder Hinweis auf den Dokumente-Reiter */}
        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-claimondo-navy hover:text-claimondo-ondo"
          >
            <FileTextIcon className="w-4 h-4" />
            Kostenvoranschlag ansehen
          </a>
        ) : (
          <p className="text-body-sm text-claimondo-ondo">
            Das Dokument finden Sie im Reiter „Dokumente“.
          </p>
        )}
      </div>
    </Card>
  )
}
