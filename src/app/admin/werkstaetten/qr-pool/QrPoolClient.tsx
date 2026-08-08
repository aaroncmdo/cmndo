'use client'

// Admin-QR-Pool: neue Charge erzeugen + Druck-Links + Code einer Werkstatt
// zuweisen (Scanner/manuell) + Liste. Gedruckte Codes werden als Sticker
// verteilt; die Zuweisung verknuepft einen Code mit einer Werkstatt.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/primitives'
import { SectionCard } from '@/components/shared/SectionCard'
import PageHeader from '@/components/shared/PageHeader'
import { StatusBadge, type StatusBadgeTone } from '@/components/shared/StatusBadge'
import { PoolQrScanner } from '@/components/werkstatt/PoolQrScanner'
import { QrCodeDownloads, BulkDownloads } from '@/components/werkstatt/QrPoolDownload'
import { generateQrPoolBatch, weiseQrPoolCodeZu } from '../qr-pool-actions'

export type PoolCode = {
  id: string
  token: string
  status: string
  charge: string | null
  created_at: string
}

const STATUS_TONE: Record<string, StatusBadgeTone> = {
  frei: 'success',
  zugewiesen: 'info',
  gesperrt: 'neutral',
}

export function QrPoolClient({
  codes,
  werkstaetten,
  onDataChange,
}: {
  codes: PoolCode[]
  werkstaetten: { id: string; name: string }[]
  onDataChange?: () => void
}) {
  const router = useRouter()
  const [anzahl, setAnzahl] = useState(50)
  const [charge, setCharge] = useState('')
  const [laden, setLaden] = useState(false)
  const [zielWerkstatt, setZielWerkstatt] = useState('')
  const [zuweisLaden, setZuweisLaden] = useState(false)

  const frei = codes.filter((c) => c.status === 'frei').length
  const zugewiesen = codes.filter((c) => c.status === 'zugewiesen').length
  const chargen = Array.from(new Set(codes.map((c) => c.charge).filter((c): c is string => !!c)))
  const freeTokens = codes.filter((c) => c.status === 'frei').map((c) => c.token)

  async function erzeuge() {
    if (anzahl < 1 || anzahl > 200) {
      toast.error('Anzahl muss zwischen 1 und 200 liegen.')
      return
    }
    setLaden(true)
    const result = await generateQrPoolBatch(anzahl, charge.trim() || undefined)
    setLaden(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success(`${result.tokens.length} QR-Codes erzeugt.`)
    if (onDataChange) onDataChange(); else router.refresh()
  }

  async function handleZuweisung(token: string) {
    if (!zielWerkstatt) {
      toast.error('Bitte zuerst eine Werkstatt wählen.')
      return
    }
    setZuweisLaden(true)
    const result = await weiseQrPoolCodeZu(zielWerkstatt, token)
    setZuweisLaden(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Zuweisung fehlgeschlagen.')
      return
    }
    const name = werkstaetten.find((w) => w.id === zielWerkstatt)?.name ?? 'die Werkstatt'
    toast.success(`${token} wurde ${name} zugewiesen.`)
    if (onDataChange) onDataChange(); else router.refresh()
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <header>
        <PageHeader
          title="QR-Code-Pool"
          description={
            <>
              Erzeuge vorgedruckte QR-Codes zum Mitnehmen. Bei der Werkstatt-Registrierung
              weist du einen davon zu — statt pro Werkstatt einen zu generieren.
              <span className="mt-2 block text-claimondo-navy">
                <strong className="tabular-nums">{frei}</strong> frei ·{' '}
                <strong className="tabular-nums">{zugewiesen}</strong> zugewiesen ·{' '}
                <span className="tabular-nums">{codes.length}</span> gesamt
              </span>
            </>
          }
          size="lg"
        />
      </header>

      <SectionCard title="Neue Charge erzeugen">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-body-xs text-claimondo-ondo">Anzahl (1–200)</span>
            <input
              type="number"
              min={1}
              max={200}
              value={anzahl}
              onChange={(e) => setAnzahl(Number(e.target.value))}
              className="w-28 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-body-xs text-claimondo-ondo">Charge-Label (optional)</span>
            <input
              value={charge}
              onChange={(e) => setCharge(e.target.value)}
              placeholder="z.B. Messe-Juli"
              className="w-48 rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy"
            />
          </label>
          <Button variant="navy" size="sm" loading={laden} onClick={erzeuge}>
            Erzeugen
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Code einer Werkstatt zuweisen">
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-body-xs text-claimondo-ondo">Werkstatt</span>
            <select
              value={zielWerkstatt}
              onChange={(e) => setZielWerkstatt(e.target.value)}
              className="w-full max-w-sm rounded-ios-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-body-sm text-claimondo-navy"
            >
              <option value="">— Werkstatt wählen —</option>
              {werkstaetten.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-body-xs text-claimondo-ondo">
            Dann den Pool-QR scannen oder den Code manuell eingeben.
          </p>
          <PoolQrScanner onToken={handleZuweisung} disabled={!zielWerkstatt || zuweisLaden} />
        </div>
      </SectionCard>

      <SectionCard title="QR-Codes anzeigen & herunterladen">
        <div className="space-y-3">
          <a
            href="/admin/vertrieb/werkstaetten/qr-pool/drucken?status=frei"
            target="_blank"
            rel="noreferrer"
            className="inline-flex text-body-sm font-medium text-claimondo-ondo underline"
          >
            Alle freien QRs anzeigen →
          </a>
          <BulkDownloads tokens={freeTokens} />
          {chargen.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-body-xs text-claimondo-ondo">Nach Charge anzeigen:</p>
              <div className="flex flex-wrap gap-2">
                {chargen.map((ch) => (
                  <a
                    key={ch}
                    href={`/admin/vertrieb/werkstaetten/qr-pool/drucken?charge=${encodeURIComponent(ch)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-ios-lg border border-claimondo-border px-3 py-1.5 text-body-sm text-claimondo-navy hover:border-claimondo-ondo"
                  >
                    {ch}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={`Codes (${codes.length})`}>
        <div className="max-h-96 space-y-1 overflow-auto">
          {codes.length === 0 ? (
            <p className="text-body-sm text-claimondo-ondo">Noch keine Codes — erzeuge oben eine Charge.</p>
          ) : (
            codes.slice(0, 150).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 border-b border-claimondo-border/50 py-1 last:border-0"
              >
                <span className="font-mono text-body-sm text-claimondo-navy">{c.token}</span>
                <span className="flex-1 truncate text-body-xs text-claimondo-ondo">{c.charge ?? '—'}</span>
                <StatusBadge tone={STATUS_TONE[c.status] ?? 'neutral'} size="xs">
                  {c.status}
                </StatusBadge>
                <QrCodeDownloads token={c.token} />
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  )
}
