'use client'

// AAR-838: Mietwagen-Tab in der Admin-Fallakte
// Liste aller claim_mietwagen-Einträge mit Status-Übergängen + Erstattungs-Info

import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  CarIcon,
  CalendarIcon,
  EuroIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  PlusIcon,
  FileTextIcon,
} from 'lucide-react'
import { ClaimMietwagenStatusBadge } from '@/components/shared/claim-mietwagen/ClaimMietwagenStatusBadge'
import { updateMietwagenStatus } from '@/lib/claim-mietwagen/actions'
import type { ClaimMietwagen } from '@/lib/claim-mietwagen/queries'
import { formatDatum } from '@/lib/format'
import { formatEURausEuro } from '@/lib/format/currency'

type Props = {
  fallId: string
  claimId: string | null
  mietwagen: ClaimMietwagen[]
}

const NAECHSTER: Record<string, { ziel: string; label: string }> = {
  beantragt: { ziel: 'genehmigt', label: 'Genehmigen' },
  genehmigt: { ziel: 'aktiv',     label: 'Anmietung starten' },
  aktiv:     { ziel: 'beendet',   label: 'Anmietung beenden' },
}

function MietwagenZeile({ m }: { m: ClaimMietwagen }) {
  const [isPending, startTransition] = useTransition()
  const naechster = NAECHSTER[m.status]

  // SLA-Warnung: aktiv + Tage bisher > erstattbar_max_tage
  const tageBisher =
    m.status === 'aktiv' && m.beginn_datum
      ? Math.floor((Date.now() - new Date(m.beginn_datum).getTime()) / (1000 * 60 * 60 * 24))
      : null
  const slaVerletzt =
    tageBisher !== null && m.erstattbar_max_tage !== null && tageBisher > (m.erstattbar_max_tage ?? 0)

  function handleWeiterschalten() {
    if (!naechster) return
    startTransition(async () => {
      const extra =
        naechster.ziel === 'beendet'
          ? { tatsaechlichesEnde: new Date().toISOString().slice(0, 10) }
          : undefined
      const res = await updateMietwagenStatus(m.id, naechster.ziel as Parameters<typeof updateMietwagenStatus>[1], extra)
      if (res.ok) toast.success(`Status auf „${naechster.ziel}" gesetzt`)
      else toast.error(res.error ?? 'Fehler')
    })
  }

  function handleStornieren() {
    startTransition(async () => {
      const res = await updateMietwagenStatus(m.id, 'storniert')
      if (res.ok) toast.success('Storniert')
      else toast.error(res.error ?? 'Fehler')
    })
  }

  return (
    <div className="border border-[#E2E8F3] rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <CarIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
          <span className="text-sm font-medium text-[#0D1B3E] truncate">
            {m.anbieter ?? 'Mietwagen'}
            {m.fahrzeugklasse && <span className="text-[#7BA3CC] font-normal"> · {m.fahrzeugklasse}</span>}
          </span>
        </div>
        <ClaimMietwagenStatusBadge status={m.status} />
      </div>

      {m.mietvertrag_nr && (
        <div className="text-xs text-[#7BA3CC]">Vertrag: {m.mietvertrag_nr}</div>
      )}

      {/* Termine */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" /> Beginn
          </p>
          <p className="text-[#0D1B3E]">{m.beginn_datum ? formatDatum(m.beginn_datum) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" /> Ende geplant
          </p>
          <p className="text-[#0D1B3E]">{m.ende_datum ? formatDatum(m.ende_datum) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5 flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" /> Tatsächlich
          </p>
          <p className="text-[#0D1B3E]">{m.tatsaechliches_ende ? formatDatum(m.tatsaechliches_ende) : '—'}</p>
        </div>
      </div>

      {/* Kosten + Tage */}
      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5">Tage</p>
          <p className="text-[#0D1B3E] font-medium">
            {m.tage_gesamt ?? '—'}
            {m.erstattbar_max_tage !== null && (
              <span className="text-[#7BA3CC] font-normal text-xs"> / {m.erstattbar_max_tage} max.</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5">Tagespreis</p>
          <p className="text-[#0D1B3E] font-medium">{m.tagespreis_netto != null ? formatEURausEuro(m.tagespreis_netto) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5 flex items-center gap-1">
            <EuroIcon className="w-3 h-3" /> Gesamt netto
          </p>
          <p className="text-[#0D1B3E] font-medium">{m.gesamtkosten_netto != null ? formatEURausEuro(m.gesamtkosten_netto) : '—'}</p>
        </div>
      </div>

      {/* Erstattung */}
      {m.erstattet_durch_vs && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-700" />
          <span className="text-emerald-900">
            Erstattet: {m.erstattungsbetrag != null ? formatEURausEuro(m.erstattungsbetrag) : '—'}
            {m.erstattung_am && ` am ${formatDatum(m.erstattung_am)}`}
          </span>
        </div>
      )}

      {/* SLA-Warnung */}
      {slaVerletzt && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs flex items-center gap-2">
          <AlertTriangleIcon className="w-3.5 h-3.5 text-amber-700" />
          <span className="text-amber-900">
            Anmietung läuft seit {tageBisher} Tagen — überschreitet erstattbares Maximum von {m.erstattbar_max_tage} Tagen
          </span>
        </div>
      )}

      {/* Rechnung */}
      {m.rechnung_url && (
        <a
          href={m.rechnung_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E2E8F3] text-[#4573A2] text-[11px] hover:bg-[#f8f9fb] transition-colors"
        >
          <FileTextIcon className="w-3 h-3" />
          Rechnung
        </a>
      )}

      {m.notiz && (
        <p className="text-xs text-[#4573A2] border-t border-[#E2E8F3] pt-2">{m.notiz}</p>
      )}

      {/* Aktionen */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-[#E2E8F3]">
        {naechster && (
          <button
            type="button"
            onClick={handleWeiterschalten}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium hover:bg-[#1a2d5a] disabled:opacity-50 transition-colors"
          >
            <CheckCircleIcon className="w-3.5 h-3.5" />
            {isPending ? 'Wird gespeichert…' : naechster.label}
          </button>
        )}
        {m.status !== 'beendet' && m.status !== 'abgelehnt' && m.status !== 'storniert' && (
          <button
            type="button"
            onClick={handleStornieren}
            disabled={isPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#E2E8F3] text-[#7BA3CC] text-xs hover:bg-[#f8f9fb] disabled:opacity-50 transition-colors"
          >
            Stornieren
          </button>
        )}
      </div>
    </div>
  )
}

export default function MietwagenTab({ claimId, mietwagen }: Props) {
  if (!claimId) {
    return <div className="text-sm text-[#7BA3CC] py-8 text-center">Kein Claim für diesen Fall angelegt.</div>
  }

  const aktiv      = mietwagen.filter((m) => m.status === 'beantragt' || m.status === 'genehmigt' || m.status === 'aktiv')
  const beendet    = mietwagen.filter((m) => m.status === 'beendet')
  const archiviert = mietwagen.filter((m) => m.status === 'abgelehnt' || m.status === 'storniert')

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          disabled
          title="Mietwagen anlegen — kommt in nächstem Sprint"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium opacity-40 cursor-not-allowed"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          Mietwagen anlegen
        </button>
      </div>

      {mietwagen.length === 0 ? (
        <div className="border-2 border-dashed border-[#E2E8F3] rounded-xl py-10 text-center text-sm text-[#7BA3CC]">
          Noch kein Mietwagen erfasst
        </div>
      ) : (
        <>
          {aktiv.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-medium text-[#7BA3CC] uppercase tracking-wide">Aktiv ({aktiv.length})</h3>
              {aktiv.map((m) => <MietwagenZeile key={m.id} m={m} />)}
            </section>
          )}

          {beendet.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-medium text-[#7BA3CC] uppercase tracking-wide">Beendet ({beendet.length})</h3>
              {beendet.map((m) => <MietwagenZeile key={m.id} m={m} />)}
            </section>
          )}

          {archiviert.length > 0 && (
            <section className="space-y-3 opacity-60">
              <h3 className="text-xs font-medium text-[#7BA3CC] uppercase tracking-wide">Abgelehnt / Storniert ({archiviert.length})</h3>
              {archiviert.map((m) => <MietwagenZeile key={m.id} m={m} />)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
