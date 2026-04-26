'use client'

// AAR-837: VS-Korrespondenz + Claim-Payments Tab in der Admin-Fallakte
// Zwei Sektionen: Korrespondenz-Chronik oben, Zahlungs-Übersicht unten

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  MailIcon,
  PhoneIcon,
  FileTextIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EuroIcon,
  CheckCircleIcon,
  ArchiveIcon,
  PlusIcon,
  AlertTriangleIcon,
} from 'lucide-react'
import { VsKorrespondenzStatusBadge } from '@/components/shared/vs-korrespondenz/VsKorrespondenzStatusBadge'
import { ClaimPaymentStatusBadge } from '@/components/shared/claim-payments/ClaimPaymentStatusBadge'
import { updateKorrespondenzStatus } from '@/lib/vs-korrespondenz/actions'
import { updatePaymentStatus } from '@/lib/claim-payments/actions'
import type { VsKorrespondenz } from '@/lib/vs-korrespondenz/queries'
import type { ClaimPayment } from '@/lib/claim-payments/queries'
import { formatDatum } from '@/lib/format'
import { formatEURausEuro } from '@/lib/format/currency'

const KANAL_ICON: Record<string, React.ElementType> = {
  email:   MailIcon,
  post:    FileTextIcon,
  fax:     FileTextIcon,
  telefon: PhoneIcon,
  portal:  FileTextIcon,
}

type Props = {
  fallId: string
  claimId: string | null
  korrespondenz: VsKorrespondenz[]
  payments: ClaimPayment[]
}

function KorrespondenzZeile({ k }: { k: VsKorrespondenz }) {
  const [isPending, startTransition] = useTransition()
  const KanalIcon = KANAL_ICON[k.kanal] ?? FileTextIcon
  const eingehend = k.richtung === 'eingehend'

  function handleArchivieren() {
    startTransition(async () => {
      const res = await updateKorrespondenzStatus(k.id, 'archiviert')
      if (res.ok) toast.success('Archiviert')
      else toast.error(res.error ?? 'Fehler')
    })
  }

  function handleBeantwortet() {
    startTransition(async () => {
      const res = await updateKorrespondenzStatus(k.id, 'beantwortet')
      if (res.ok) toast.success('Als beantwortet markiert')
      else toast.error(res.error ?? 'Fehler')
    })
  }

  return (
    <div className="flex gap-3 py-3 border-b border-[#E2E8F3] last:border-0">
      {/* Richtungs-Indikator */}
      <div className={`mt-0.5 shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${eingehend ? 'bg-[#4573A2]/10' : 'bg-[#0D1B3E]/10'}`}>
        {eingehend
          ? <ArrowDownIcon className="w-3.5 h-3.5 text-[#4573A2]" />
          : <ArrowUpIcon   className="w-3.5 h-3.5 text-[#0D1B3E]" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#0D1B3E]">
            {k.betreff ?? (eingehend ? 'Eingehend' : 'Ausgehend')}
          </span>
          <VsKorrespondenzStatusBadge status={k.status} />
          {k.typ && (
            <span className="text-[10px] bg-[#7BA3CC]/20 text-[#4573A2] px-1.5 py-0.5 rounded-full uppercase tracking-wide">
              {k.typ}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-[#7BA3CC]">
          <span className="flex items-center gap-1">
            <KanalIcon className="w-3 h-3" />
            {k.kanal}
          </span>
          {k.versicherung && <span>{k.versicherung}</span>}
          {k.aktenzeichen && <span>Az: {k.aktenzeichen}</span>}
          <span>{formatDatum(k.datum)}</span>
          {k.wartet_auf_antwort_bis && (
            <span className="flex items-center gap-1 text-amber-600">
              <AlertTriangleIcon className="w-3 h-3" />
              Frist: {formatDatum(k.wartet_auf_antwort_bis)}
            </span>
          )}
        </div>

        {k.notiz && (
          <p className="mt-1 text-xs text-[#4573A2] line-clamp-2">{k.notiz}</p>
        )}

        <div className="flex gap-2 mt-2">
          {k.status === 'wartet_auf_antwort' && (
            <button
              type="button"
              onClick={handleBeantwortet}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-medium hover:bg-emerald-800 disabled:opacity-50 transition-colors"
            >
              <CheckCircleIcon className="w-3 h-3" />
              Beantwortet
            </button>
          )}
          {k.status !== 'archiviert' && k.status !== 'beantwortet' && (
            <button
              type="button"
              onClick={handleArchivieren}
              disabled={isPending}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E2E8F3] text-[#7BA3CC] text-[11px] hover:bg-[#f8f9fb] disabled:opacity-50 transition-colors"
            >
              <ArchiveIcon className="w-3 h-3" />
              Archivieren
            </button>
          )}
          {k.attachment_url && (
            <a
              href={k.attachment_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#E2E8F3] text-[#4573A2] text-[11px] hover:bg-[#f8f9fb] transition-colors"
            >
              <FileTextIcon className="w-3 h-3" />
              Anhang
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function PaymentZeile({ p }: { p: ClaimPayment }) {
  const [isPending, startTransition] = useTransition()

  const NAECHSTER: Record<string, string> = {
    ausstehend: 'erhalten',
    teilweise:  'erhalten',
    erhalten:   'final',
  }
  const naechsterStatus = NAECHSTER[p.status]

  const differenz = p.differenz_betrag ?? 0
  const differenzPositiv = differenz > 0

  function handleWeiterschalten() {
    if (!naechsterStatus) return
    startTransition(async () => {
      const res = await updatePaymentStatus(
        p.id,
        naechsterStatus as Parameters<typeof updatePaymentStatus>[1],
        { zahlungseingangAm: new Date().toISOString() },
      )
      if (res.ok) toast.success(`Zahlung auf „${naechsterStatus}" gesetzt`)
      else toast.error(res.error ?? 'Fehler')
    })
  }

  return (
    <div className="border border-[#E2E8F3] rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <EuroIcon className="w-4 h-4 text-[#4573A2] shrink-0" />
          <span className="text-sm font-medium text-[#0D1B3E]">
            {p.zahlungsreferenz ? `Ref: ${p.zahlungsreferenz}` : `Zahlung ${p.id.slice(0, 8)}`}
          </span>
        </div>
        <ClaimPaymentStatusBadge status={p.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5">Forderung</p>
          <p className="text-[#0D1B3E] font-medium">{p.forderungsbetrag != null ? formatEURausEuro(p.forderungsbetrag) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5">Erhalten</p>
          <p className="text-[#0D1B3E] font-medium">{p.erhaltener_betrag != null ? formatEURausEuro(p.erhaltener_betrag) : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-[#7BA3CC] mb-0.5">Differenz</p>
          <p className={`font-medium ${differenzPositiv ? 'text-red-600' : differenz < 0 ? 'text-emerald-600' : 'text-[#0D1B3E]'}`}>
            {p.differenz_betrag != null ? formatEURausEuro(p.differenz_betrag) : '—'}
          </p>
        </div>
      </div>

      {p.zahlungseingang_am && (
        <p className="text-xs text-[#7BA3CC]">Eingang: {formatDatum(p.zahlungseingang_am)}</p>
      )}

      {naechsterStatus && (
        <button
          type="button"
          onClick={handleWeiterschalten}
          disabled={isPending}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0D1B3E] text-white text-sm font-medium hover:bg-[#1a2d5a] disabled:opacity-50 transition-colors"
        >
          <CheckCircleIcon className="w-4 h-4" />
          {isPending ? 'Wird gespeichert…' : `Als „${naechsterStatus}" markieren`}
        </button>
      )}
    </div>
  )
}

export default function VsKorrespondenzTab({ fallId, claimId, korrespondenz, payments }: Props) {
  const [sektion, setSektion] = useState<'korrespondenz' | 'zahlungen'>('korrespondenz')

  if (!claimId) {
    return <div className="text-sm text-[#7BA3CC] py-8 text-center">Kein Claim für diesen Fall angelegt.</div>
  }

  const aktiveKorrespondenz = korrespondenz.filter((k) => k.status !== 'archiviert')
  const archiviert          = korrespondenz.filter((k) => k.status === 'archiviert')

  return (
    <div className="space-y-4">
      {/* Sub-Navigation */}
      <div className="flex gap-1 bg-[#f8f9fb] rounded-xl p-1 w-fit">
        {(['korrespondenz', 'zahlungen'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSektion(s)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              sektion === s
                ? 'bg-white text-[#0D1B3E] shadow-sm'
                : 'text-[#7BA3CC] hover:text-[#4573A2]'
            }`}
          >
            {s === 'korrespondenz' ? `Korrespondenz (${korrespondenz.length})` : `Zahlungen (${payments.length})`}
          </button>
        ))}
      </div>

      {sektion === 'korrespondenz' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              disabled
              title="Eintrag hinzufügen — kommt in nächstem Sprint"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium opacity-40 cursor-not-allowed"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Eintrag hinzufügen
            </button>
          </div>

          {korrespondenz.length === 0 ? (
            <div className="border-2 border-dashed border-[#E2E8F3] rounded-xl py-10 text-center text-sm text-[#7BA3CC]">
              Noch keine Korrespondenz erfasst
            </div>
          ) : (
            <div className="border border-[#E2E8F3] rounded-xl bg-white px-4">
              {aktiveKorrespondenz.map((k) => <KorrespondenzZeile key={k.id} k={k} />)}
              {archiviert.length > 0 && (
                <details className="group">
                  <summary className="py-2 text-xs text-[#7BA3CC] cursor-pointer hover:text-[#4573A2] list-none flex items-center gap-1">
                    <span>{archiviert.length} archivierte Einträge</span>
                  </summary>
                  <div className="opacity-60">
                    {archiviert.map((k) => <KorrespondenzZeile key={k.id} k={k} />)}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {sektion === 'zahlungen' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              disabled
              title="Zahlung erfassen — kommt in nächstem Sprint"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D1B3E] text-white text-xs font-medium opacity-40 cursor-not-allowed"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              Zahlung erfassen
            </button>
          </div>

          {payments.length === 0 ? (
            <div className="border-2 border-dashed border-[#E2E8F3] rounded-xl py-10 text-center text-sm text-[#7BA3CC]">
              Noch keine Zahlung erfasst
            </div>
          ) : (
            payments.map((p) => <PaymentZeile key={p.id} p={p} />)
          )}
        </div>
      )}
    </div>
  )
}
