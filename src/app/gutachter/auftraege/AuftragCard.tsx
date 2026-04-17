'use client'

// AAR-408: Eine Card pro SV-Auftrag mit Kunden-/Schadens-Info, Termin-Status
// und Primär-Aktion (Termin vorschlagen, Gegenvorschlag entscheiden, Termin
// öffnen). Termin-Actions werden über das geteilte TerminVorschlagModal
// (Phase 0.6) + terminAnnehmen abgewickelt.

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  CalendarIcon,
  MapPinIcon,
  UserIcon,
  ClockIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  ChevronRightIcon,
  Loader2Icon,
  FileTextIcon,
} from 'lucide-react'
import TerminVorschlagModal, {
  type TerminVorschlagMode,
} from '@/components/fall/TerminVorschlagModal'
import { terminAnnehmen } from '@/lib/actions/termin-actions'
import { formatDatum } from '@/lib/format'

export type AuftragCardProps = {
  fall: {
    id: string
    fall_nummer: string | null
    status: string
    schadens_ursache: string | null
    schadens_ort: string | null
    schadens_datum: string | null
  }
  kunde: {
    vorname: string | null
    nachname: string | null
  } | null
  aktiverTermin: {
    id: string
    status: string
    start_zeit: string | null
    vorgeschlagenes_datum: string | null
    gegenvorschlag_von: 'sv' | 'kunde' | null
  } | null
  ursacheLabel: string
  statusLabel: string
}

type PrimaryAction =
  | { type: 'vorschlagen'; label: string; mode: 'erstvorschlag' }
  | {
      type: 'gegenvorschlag-vom-kunden'
      label: string
      mode: 'gegenvorschlag'
      datum: string
    }
  | { type: 'warten'; label: string; subLabel: string }
  | { type: 'bestaetigt'; label: string; datum: string }
  | { type: 'offen'; label: string; href: string }

function derivePrimary(props: AuftragCardProps): PrimaryAction {
  const t = props.aktiverTermin
  if (!t || t.status === 'storniert' || t.status === 'abgelehnt') {
    if (props.fall.status === 'sv-zugewiesen') {
      return {
        type: 'vorschlagen',
        label: 'Termin vorschlagen',
        mode: 'erstvorschlag',
      }
    }
    return {
      type: 'offen',
      label: 'Fall öffnen',
      href: `/gutachter/fall/${props.fall.id}`,
    }
  }
  if (t.status === 'gegenvorschlag' && t.gegenvorschlag_von === 'kunde') {
    return {
      type: 'gegenvorschlag-vom-kunden',
      label: 'Der Kunde hat einen anderen Termin vorgeschlagen',
      mode: 'gegenvorschlag',
      datum: t.vorgeschlagenes_datum ?? t.start_zeit ?? '',
    }
  }
  if (t.status === 'reserviert' || t.status === 'gegenvorschlag') {
    return {
      type: 'warten',
      label: 'Termin-Vorschlag gesendet',
      subLabel: 'Wartet auf Bestätigung des Kunden.',
    }
  }
  if (t.status === 'bestaetigt') {
    return {
      type: 'bestaetigt',
      label: 'Termin bestätigt',
      datum: t.start_zeit ?? '',
    }
  }
  return {
    type: 'offen',
    label: 'Fall öffnen',
    href: `/gutachter/fall/${props.fall.id}`,
  }
}

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AuftragCard(props: AuftragCardProps) {
  const router = useRouter()
  const [modal, setModal] = useState<{ open: boolean; mode: TerminVorschlagMode }>({
    open: false,
    mode: 'erstvorschlag',
  })
  const [isPending, startTransition] = useTransition()

  const kundeName =
    props.kunde?.vorname || props.kunde?.nachname
      ? `${props.kunde.vorname ?? ''} ${props.kunde.nachname ?? ''}`.trim()
      : '—'

  const action = derivePrimary(props)

  function handleAcceptKunde() {
    startTransition(async () => {
      const r = await terminAnnehmen({ source: 'sv_portal', fallId: props.fall.id })
      if (r.success) {
        toast.success('Termin angenommen')
        router.refresh()
      } else {
        toast.error(r.error ?? 'Fehler')
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-3 hover:border-gray-300 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            href={`/gutachter/fall/${props.fall.id}`}
            className="text-[#4573A2] hover:text-[#1E3A5F] font-mono text-xs"
          >
            {props.fall.fall_nummer ?? props.fall.id.slice(0, 8)}
          </Link>
          <p className="text-sm font-semibold text-[#0D1B3E] mt-0.5 flex items-center gap-1.5">
            <UserIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{kundeName}</span>
          </p>
        </div>
        <span className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 whitespace-nowrap">
          {props.statusLabel}
        </span>
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex items-center gap-1.5">
          <FileTextIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span>{props.ursacheLabel}</span>
        </div>
        {props.fall.schadens_ort && (
          <div className="flex items-center gap-1.5">
            <MapPinIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{props.fall.schadens_ort}</span>
          </div>
        )}
        {props.fall.schadens_datum && (
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>Schaden: {formatDatum(props.fall.schadens_datum)}</span>
          </div>
        )}
      </div>

      {/* Action Zone */}
      <div className="pt-2 border-t border-gray-100">
        {action.type === 'vorschlagen' && (
          <button
            type="button"
            onClick={() => setModal({ open: true, mode: 'erstvorschlag' })}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold"
          >
            <CalendarIcon className="w-4 h-4" />
            {action.label}
          </button>
        )}

        {action.type === 'gegenvorschlag-vom-kunden' && (
          <div className="space-y-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircleIcon className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <p className="font-medium">{action.label}</p>
                  <p className="mt-0.5">{fmtDateShort(action.datum)}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAcceptKunde}
                disabled={isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
              >
                {isPending && <Loader2Icon className="w-3.5 h-3.5 animate-spin" />}
                Annehmen
              </button>
              <button
                type="button"
                onClick={() => setModal({ open: true, mode: 'gegenvorschlag' })}
                disabled={isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-[#4573A2] text-[#4573A2] hover:bg-[#4573A2]/5 text-xs font-semibold disabled:opacity-50"
              >
                Gegenvorschlag
              </button>
            </div>
          </div>
        )}

        {action.type === 'warten' && (
          <div className="flex items-start gap-2 text-xs text-gray-600">
            <ClockIcon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-gray-700">{action.label}</p>
              <p className="mt-0.5">{action.subLabel}</p>
            </div>
          </div>
        )}

        {action.type === 'bestaetigt' && (
          <Link
            href={`/gutachter/fall/${props.fall.id}`}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-800 text-xs"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2Icon className="w-4 h-4 text-emerald-600 shrink-0" />
              <div>
                <p className="font-medium">{action.label}</p>
                <p className="mt-0.5">{fmtDateShort(action.datum)}</p>
              </div>
            </div>
            <ChevronRightIcon className="w-4 h-4" />
          </Link>
        )}

        {action.type === 'offen' && (
          <Link
            href={action.href}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium"
          >
            {action.label}
            <ChevronRightIcon className="w-4 h-4" />
          </Link>
        )}
      </div>

      <TerminVorschlagModal
        fallId={props.fall.id}
        mode={modal.mode}
        open={modal.open}
        onClose={() => setModal((s) => ({ ...s, open: false }))}
        existingTermin={props.aktiverTermin}
      />
    </div>
  )
}
