'use client'

import { useEffect, useState } from 'react'
import { Modal } from '@/components/primitives/Modal'
import { Button } from '@/components/primitives/Button'
import { toast } from 'sonner'
import { getKorrekturVorschauAction, korrigierePartnerGutschriftAction } from '@/lib/finance/partner-billing-actions'

type OriginalBetraege = {
  nettoCent: number
  ustSatz: number | null
  ustBetragCent: number | null
  bruttoCent: number
  nr: string
}

function fmtEur(cent: number): string {
  return (cent / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

/**
 * Admin-Modal: eine ausgestellte Partner-Gutschrift korrigieren (Storno + korrigierte Neuausstellung).
 * Netto + USt-Satz editierbar (vorbelegt mit dem Recompute aus aktuellen Daten); USt-Betrag + Brutto
 * werden daraus abgeleitet. Bestaetigen ist gesperrt, wenn nichts geaendert wurde.
 */
export function GutschriftKorrekturModal({
  open,
  onClose,
  ledgerTabelle,
  ledgerId,
}: {
  open: boolean
  onClose: () => void
  ledgerTabelle: string
  ledgerId: string
}) {
  const [laden, setLaden] = useState(false)
  const [original, setOriginal] = useState<OriginalBetraege | null>(null)
  const [nettoEur, setNettoEur] = useState('')
  const [ustSatz, setUstSatz] = useState('')
  const [grund, setGrund] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setLaden(true)
    setOriginal(null)
    setGrund('')
    getKorrekturVorschauAction(ledgerTabelle, ledgerId).then((res) => {
      setLaden(false)
      if (!res.ok) {
        toast.error(res.error)
        onClose()
        return
      }
      setOriginal(res.original)
      setNettoEur((res.recompute.nettoCent / 100).toFixed(2))
      setUstSatz(res.recompute.ustSatz === null ? '' : String(res.recompute.ustSatz))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ledgerTabelle, ledgerId])

  const nettoCent = Math.round((parseFloat(nettoEur.replace(',', '.')) || 0) * 100)
  const satz = ustSatz.trim() === '' ? null : Number(ustSatz.replace(',', '.'))
  const ustBetragCent = satz === null || Number.isNaN(satz) ? null : Math.round((nettoCent * satz) / 100)
  const bruttoCent = nettoCent + (ustBetragCent ?? 0)

  const keineAenderung = original !== null && nettoCent === original.nettoCent && satz === original.ustSatz
  const disabled =
    pending || laden || original === null || keineAenderung || grund.trim() === '' || satz === null || Number.isNaN(satz) || nettoCent <= 0

  const absenden = async () => {
    if (disabled || satz === null) return
    setPending(true)
    const res = await korrigierePartnerGutschriftAction(ledgerTabelle, ledgerId, grund.trim(), {
      nettoCent,
      ustSatz: satz,
    })
    setPending(false)
    if (res.ok) {
      toast.success(`Korrigiert — Storno ${res.stornoNummer}, neue Gutschrift ${res.korrekturNummer}`)
      onClose()
    } else {
      toast.error(res.error ?? 'Korrektur fehlgeschlagen')
    }
  }

  const inputCls =
    'mb-3 w-full rounded-ios-md border border-claimondo-border px-3 py-2 text-sm text-claimondo-navy'

  return (
    <Modal open={open} onClose={onClose} maxWidth={460} ariaLabel="Gutschrift korrigieren">
      <h3 className="mb-1 text-sm font-semibold text-claimondo-navy">Gutschrift korrigieren</h3>
      {laden && <p className="text-xs text-claimondo-ondo">Lädt …</p>}
      {original && (
        <>
          <p className="mb-4 text-xs text-claimondo-ondo">
            Storniert die aktive Gutschrift <span className="font-medium">{original.nr}</span> und stellt eine
            korrigierte neu aus. Die Beträge sind aus den aktuellen Daten vorbelegt — bei Bedarf anpassen.
          </p>

          <div className="mb-4 rounded-ios-md bg-claimondo-bg p-3 text-xs text-claimondo-ondo">
            <div className="mb-1 font-medium text-claimondo-navy">Aktuell (Original {original.nr})</div>
            <div>
              Netto {fmtEur(original.nettoCent)} · USt {original.ustSatz ?? '—'} %
              {' '}({original.ustBetragCent === null ? '—' : fmtEur(original.ustBetragCent)}) · Brutto {fmtEur(original.bruttoCent)}
            </div>
          </div>

          <label className="mb-1 block text-xs text-claimondo-ondo" htmlFor="korr-netto">Netto (EUR)</label>
          <input
            id="korr-netto"
            type="number"
            step="0.01"
            min="0"
            value={nettoEur}
            onChange={(e) => setNettoEur(e.target.value)}
            className={inputCls}
          />

          <label className="mb-1 block text-xs text-claimondo-ondo" htmlFor="korr-ust">USt-Satz (%)</label>
          <input
            id="korr-ust"
            type="number"
            step="1"
            min="0"
            value={ustSatz}
            onChange={(e) => setUstSatz(e.target.value)}
            className={inputCls}
          />

          <div className="mb-3 text-xs text-claimondo-navy">
            Neu: Netto {fmtEur(nettoCent)} · USt {satz === null || Number.isNaN(satz) ? '—' : satz} %
            {' '}({ustBetragCent === null ? '—' : fmtEur(ustBetragCent)}) ·{' '}
            <span className="font-semibold">Brutto {fmtEur(bruttoCent)}</span>
          </div>

          <label className="mb-1 block text-xs text-claimondo-ondo" htmlFor="korr-grund">Grund der Korrektur</label>
          <input
            id="korr-grund"
            type="text"
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            placeholder="z. B. USt-Status nachträglich korrigiert"
            className="mb-4 w-full rounded-ios-md border border-claimondo-border px-3 py-2 text-sm text-claimondo-navy"
          />

          {keineAenderung && (
            <p className="mb-3 text-xs text-claimondo-ondo">Keine Änderung — nichts zu korrigieren.</p>
          )}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>
              Abbrechen
            </Button>
            <Button size="sm" variant="navy" loading={pending} disabled={disabled} onClick={absenden}>
              Korrigieren
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
