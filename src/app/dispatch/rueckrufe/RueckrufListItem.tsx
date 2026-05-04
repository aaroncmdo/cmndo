'use client'

// Einzelne Zeile in der Rückrufe-Liste. Klick auf den Namen oder den
// Termin-Button öffnet ein Modal mit dem vollständigen RueckrufTerminPanel
// (inkl. bearbeitbarer Notiz, Anruf-Aktivität, Verlauf, Dispatch-Link).

import { useState } from 'react'
import { Modal } from '@/components/primitives/Modal'
import PhoneButton from '@/components/shared/PhoneButton'
import RueckrufTerminPanel, {
  type RueckrufInitialData,
} from '@/app/dispatch/leads/[id]/RueckrufTerminPanel'
import { CalendarClockIcon, XIcon } from 'lucide-react'

type Props = {
  terminId: string
  startZeit: string
  notizen: string | null
  isNew: boolean
  /** Wenn true, ist das Popover initial offen (Deeplink via ?open=). */
  defaultOpen?: boolean
  lead: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    qualifizierungs_phase: string | null
    anruf_versuche: number | null
    letzter_anruf_am: string | null
    letzter_anruf_status: string | null
  }
}

export default function RueckrufListItem({ terminId, startZeit, notizen, isNew, lead, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  const isOverdue = new Date(startZeit) < new Date()

  const initial: RueckrufInitialData = {
    startZeit,
    notizen,
    terminStatus: 'offen',
    anrufVersuche: lead.anruf_versuche ?? 0,
    letzterAnrufAm: lead.letzter_anruf_am,
    letzterAnrufStatus: lead.letzter_anruf_status,
    qualifizierungsPhase: lead.qualifizierungs_phase,
  }

  const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || 'Unbekannt'

  return (
    <>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isNew && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0"
                aria-label="Neu, noch nicht angesehen"
              />
            )}
            {/* Name öffnet Popover */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm font-medium text-claimondo-navy hover:text-claimondo-ondo text-left"
            >
              {name}
            </button>
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-claimondo-ondo flex-wrap">
            {lead.telefon && (
              <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
            )}
            {/* Termin-Zeit — klickbar → öffnet Popover */}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={`flex items-center gap-1 hover:underline ${isOverdue ? 'text-red-600 font-medium' : ''}`}
            >
              <CalendarClockIcon className="w-3.5 h-3.5 shrink-0" />
              {new Date(startZeit).toLocaleString('de-DE', {
                timeZone: 'Europe/Berlin',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {isOverdue && ' (überfällig)'}
            </button>
          </div>

          {/* Notiz — vollständig, kein truncate */}
          {notizen && (
            <p className="text-xs text-claimondo-ondo/70 mt-1 whitespace-pre-line">{notizen}</p>
          )}

          <div className="flex items-center gap-3 mt-1 text-[10px] text-claimondo-ondo/70">
            <span>Versuche: {lead.anruf_versuche ?? 0}</span>
            {lead.letzter_anruf_am && (
              <span>
                Letzter:{' '}
                {new Date(lead.letzter_anruf_am).toLocaleDateString('de-DE', {
                  timeZone: 'Europe/Berlin',
                })}{' '}
                ({lead.letzter_anruf_status ?? '?'})
              </span>
            )}
          </div>
        </div>

        {/* Termin-Detail-Button */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Termin öffnen"
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-claimondo-border text-claimondo-navy text-xs font-medium hover:border-claimondo-ondo hover:bg-[#f8f9fb] transition-colors"
        >
          <CalendarClockIcon className="w-3.5 h-3.5" />
          Termin
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        maxWidth={520}
        ariaLabel={`Rückruftermin ${name}`}
        placement="bottom-sheet"
      >
        <div className="space-y-1 mb-4 pr-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-base font-semibold text-claimondo-navy">{name}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-claimondo-ondo/60 hover:text-claimondo-ondo"
              aria-label="Schließen"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
          {lead.telefon && (
            <p className="text-xs text-claimondo-ondo">{lead.telefon}</p>
          )}
        </div>

        <RueckrufTerminPanel
          leadId={lead.id}
          initial={initial}
          onActionDone={() => setOpen(false)}
        />
      </Modal>
    </>
  )
}
