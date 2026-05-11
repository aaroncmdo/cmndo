'use client'

// AAR-500 N5: Shared-Form für Benachrichtigungs-Präferenzen. Wird in den
// Settings-Sections aller Rollen verwendet (Kunde/SV/Makler). Drei Bereiche:
//   1) Ruhezeiten (Quiet-Hours + Zeitzone)
//   2) Kanäle (Channel-Level-Opt-Outs)
//   3) Feintuning (Event-Kategorie × Channel Matrix)
//
// urgent-Events (z. B. termin.sv_angekommen, eskalation.vs_frist) umgehen
// Quiet-Hours — das wird im UI als Hinweis gezeigt.

import { useMemo, useState, useTransition } from 'react'
import { BellIcon, MoonIcon, CheckCircle2Icon, AlertTriangleIcon, Loader2Icon, SaveIcon } from 'lucide-react'
import { updateNotificationPreferences } from '@/lib/actions/notification-preferences'
import type { Channel, EventType } from '@/lib/notifications/types'

type Role = 'kunde' | 'sachverstaendiger' | 'makler' | 'kundenbetreuer' | 'admin'

export type NotificationPreferencesFormValue = {
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  timezone: string
  channel_opt_outs: Channel[]
  event_opt_outs: Partial<Record<EventType, Channel[]>>
}

type CategoryDef = {
  id: string
  label: string
  events: EventType[]
}

// Pro Rolle gruppierte Kategorien. Events die für die Rolle keine Default-Channels
// haben (laut EVENT_MATRIX) sollten hier einfach weggelassen werden.
const CATEGORIES_BY_ROLE: Record<Role, CategoryDef[]> = {
  kunde: [
    {
      id: 'fall',
      label: 'Fall-Fortschritt',
      events: ['fall.created', 'fall.sv_assigned', 'fall.status_changed', 'fall.storniert'],
    },
    {
      id: 'sa',
      label: 'Vollmacht',
      events: ['sa.flow_sent', 'sa.signed'],
    },
    {
      id: 'termin',
      label: 'Termine',
      events: [
        'termin.sv_bestaetigt',
        'termin.sv_abgelehnt',
        'termin.sv_gegenvorschlag',
        'termin.sv_storniert',
        'termin.erinnerung',
        'termin.sv_unterwegs',
        'termin.sv_verspaetet',
        'termin.sv_angekommen',
      ],
    },
    {
      id: 'videocall',
      label: 'Video-Termine',
      events: ['videocall.geplant', 'videocall.erinnerung'],
    },
    {
      id: 'gutachten',
      label: 'Gutachten',
      events: ['gutachten.fertig', 'gutachten.nachbesserung'],
    },
    {
      id: 'kanzlei',
      label: 'Kanzlei & Regulierung',
      events: [
        'kanzlei.uebergabe',
        'kanzlei.as_gesendet',
        'regulierung.ergebnis',
        'regulierung.ruege_gesendet',
        'eskalation.vs_frist',
        'auszahlung.veranlasst',
      ],
    },
    {
      id: 'task_dok',
      label: 'Aufgaben & Dokumente',
      events: ['task.created', 'task.due', 'dokument.fehlt', 'dokument.hochgeladen'],
    },
    {
      id: 'nachricht',
      label: 'Nachrichten',
      events: ['nachricht.received'],
    },
  ],
  sachverstaendiger: [
    {
      id: 'fall',
      label: 'Fall-Zuweisung & Status',
      events: ['fall.sv_assigned', 'fall.status_changed', 'fall.storniert'],
    },
    {
      id: 'termin',
      label: 'Termine',
      events: ['termin.sv_storniert', 'termin.erinnerung', 'termin.sv_abgeschlossen'],
    },
    {
      id: 'gutachten',
      label: 'Gutachten',
      events: ['gutachten.nachbesserung'],
    },
    {
      id: 'task_dok',
      label: 'Aufgaben & Dokumente',
      events: ['task.created', 'task.due', 'dokument.fehlt', 'dokument.hochgeladen'],
    },
    {
      id: 'nachricht',
      label: 'Nachrichten',
      events: ['nachricht.received'],
    },
  ],
  makler: [
    {
      id: 'makler',
      label: 'Leads & Provisionen',
      events: ['makler.lead_eingegangen', 'makler.provision_status'],
    },
    {
      id: 'fall',
      label: 'Fall-Fortschritt',
      events: ['fall.created', 'fall.status_changed', 'fall.storniert', 'sa.signed'],
    },
    {
      id: 'kanzlei',
      label: 'Kanzlei & Regulierung',
      events: ['kanzlei.uebergabe', 'regulierung.ergebnis', 'regulierung.ruege_gesendet'],
    },
    {
      id: 'sonstige',
      label: 'Sonstige',
      events: ['gutachten.fertig', 'nachricht.received', 'dokument.hochgeladen'],
    },
  ],
  kundenbetreuer: [],
  admin: [],
}

const EVENT_LABELS: Partial<Record<EventType, string>> = {
  'fall.created': 'Fall eröffnet',
  'fall.sv_assigned': 'Gutachter zugewiesen',
  'fall.status_changed': 'Status geändert',
  'fall.storniert': 'Fall storniert',
  'sa.flow_sent': 'Vollmacht-Link versendet',
  'sa.signed': 'Vollmacht unterschrieben',
  'termin.sv_bestaetigt': 'Termin bestätigt',
  'termin.sv_abgelehnt': 'Termin abgelehnt',
  'termin.sv_gegenvorschlag': 'Gegenvorschlag',
  'termin.sv_storniert': 'Termin storniert',
  'termin.erinnerung': 'Termin-Erinnerung',
  'termin.sv_unterwegs': 'Gutachter unterwegs',
  'termin.sv_verspaetet': 'Verspätung',
  'termin.sv_angekommen': 'Gutachter angekommen',
  'termin.sv_abgeschlossen': 'Termin abgeschlossen',
  'videocall.geplant': 'Video-Termin vereinbart',
  'videocall.erinnerung': 'Video-Termin startet',
  'gutachten.fertig': 'Gutachten fertig',
  'gutachten.nachbesserung': 'Nachbesserung nötig',
  'kanzlei.uebergabe': 'Übergabe an Kanzlei',
  'kanzlei.as_gesendet': 'Anwaltsschreiben gesendet',
  'regulierung.ergebnis': 'Regulierungs-Ergebnis',
  'regulierung.ruege_gesendet': 'Rüge gesendet',
  'eskalation.vs_frist': 'Eskalationsfrist',
  'auszahlung.veranlasst': 'Auszahlung veranlasst',
  'task.created': 'Neue Aufgabe',
  'task.due': 'Aufgabe fällig',
  'dokument.fehlt': 'Dokument fehlt',
  'dokument.hochgeladen': 'Dokument hochgeladen',
  'nachricht.received': 'Neue Nachricht',
  'makler.lead_eingegangen': 'Neuer Lead',
  'makler.provision_status': 'Provisions-Status',
}

const CHANNEL_LABELS: Record<Channel, { short: string; long: string }> = {
  whatsapp: { short: 'WA', long: 'WhatsApp' },
  web_push: { short: 'Push', long: 'Browser-Push' },
  email: { short: 'E-Mail', long: 'E-Mail' },
  in_app: { short: 'App', long: 'In-App-Inbox' },
  native_push: { short: 'Native', long: 'App-Push' },
}

const CHANNELS_FOR_UI: Channel[] = ['whatsapp', 'web_push', 'email']

type SaveState = { status: 'idle' | 'saving' | 'success' | 'error'; msg?: string }

export function NotificationPreferencesForm({
  role,
  initial,
}: {
  role: Role
  initial: NotificationPreferencesFormValue
}) {
  const [quietStart, setQuietStart] = useState<string>(timeHM(initial.quiet_hours_start) ?? '')
  const [quietEnd, setQuietEnd] = useState<string>(timeHM(initial.quiet_hours_end) ?? '')
  const [timezone] = useState<string>(initial.timezone || 'Europe/Berlin')
  const [channelOptOuts, setChannelOptOuts] = useState<Set<Channel>>(
    new Set(initial.channel_opt_outs),
  )
  const [eventOptOuts, setEventOptOuts] = useState<Partial<Record<EventType, Channel[]>>>(
    { ...initial.event_opt_outs },
  )
  const [saveState, setSaveState] = useState<SaveState>({ status: 'idle' })
  const [isPending, startTransition] = useTransition()

  const categories = useMemo(() => CATEGORIES_BY_ROLE[role] ?? [], [role])

  function toggleChannelOptOut(channel: Channel) {
    setChannelOptOuts((prev) => {
      const next = new Set(prev)
      if (next.has(channel)) next.delete(channel)
      else next.add(channel)
      return next
    })
  }

  function isEventChannelEnabled(eventType: EventType, channel: Channel): boolean {
    const optOuts = eventOptOuts[eventType]
    if (!optOuts) return true
    return !optOuts.includes(channel)
  }

  function toggleEventChannel(eventType: EventType, channel: Channel) {
    setEventOptOuts((prev) => {
      const current = prev[eventType] ?? []
      const has = current.includes(channel)
      const next = has ? current.filter((c) => c !== channel) : [...current, channel]
      const copy = { ...prev }
      if (next.length === 0) delete copy[eventType]
      else copy[eventType] = next
      return copy
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaveState({ status: 'saving' })
    startTransition(async () => {
      const res = await updateNotificationPreferences({
        quiet_hours_start: quietStart ? quietStart : null,
        quiet_hours_end: quietEnd ? quietEnd : null,
        timezone,
        channel_opt_outs: Array.from(channelOptOuts),
        event_opt_outs: eventOptOuts,
      })
      if (res.success) {
        setSaveState({ status: 'success' })
        setTimeout(() => setSaveState({ status: 'idle' }), 2500)
      } else {
        setSaveState({ status: 'error', msg: res.error })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Ruhezeiten */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <MoonIcon width={14} height={14} className="text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Ruhezeiten</h3>
        </div>
        <p className="text-xs text-claimondo-ondo mb-3">
          In diesem Zeitfenster werden normale Nachrichten nicht gesendet. Wichtige
          Nachrichten (z.&nbsp;B. Gutachter-Ankunft, Eskalationsfrist) erreichen Sie
          auch in Ruhezeiten.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-claimondo-ondo font-medium">Von</span>
            <input
              type="time"
              value={quietStart}
              onChange={(e) => setQuietStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-claimondo-ondo font-medium">Bis</span>
            <input
              type="time"
              value={quietEnd}
              onChange={(e) => setQuietEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-claimondo-ondo/40"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-claimondo-ondo font-medium">Zeitzone</span>
            <input
              type="text"
              value={timezone}
              readOnly
              className="mt-1 w-full rounded-lg border border-claimondo-border bg-claimondo-bg px-3 py-2 text-sm text-claimondo-ondo"
            />
          </label>
        </div>
        {quietStart && !quietEnd ? (
          <p className="mt-2 text-xs text-amber-700">Bitte auch „Bis"-Zeit setzen.</p>
        ) : null}
      </section>

      {/* Kanäle */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <BellIcon width={14} height={14} className="text-claimondo-ondo" />
          <h3 className="text-sm font-semibold text-claimondo-navy">Kanäle komplett abschalten</h3>
        </div>
        <p className="text-xs text-claimondo-ondo mb-3">
          Deaktiviert alle Benachrichtigungen für diesen Kanal — unabhängig vom Event-Typ.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CHANNELS_FOR_UI.map((channel) => {
            const isOptedOut = channelOptOuts.has(channel)
            return (
              <label
                key={channel}
                className="flex items-center gap-3 p-3 rounded-lg border border-claimondo-border bg-claimondo-bg hover:bg-white cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!isOptedOut}
                  onChange={() => toggleChannelOptOut(channel)}
                  className="w-4 h-4 rounded border-claimondo-border text-claimondo-navy focus:ring-claimondo-ondo/40"
                />
                <span className="text-sm text-claimondo-navy">{CHANNEL_LABELS[channel].long}</span>
              </label>
            )
          })}
        </div>
      </section>

      {/* Feintuning */}
      {categories.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold text-claimondo-navy mb-2">Feintuning pro Ereignis</h3>
          <p className="text-xs text-claimondo-ondo mb-3">
            Welche Ereignisse sollen auf welchem Kanal ankommen? Haken = ja, leer = nein.
          </p>
          <div className="space-y-4">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="rounded-xl border border-claimondo-border overflow-hidden"
              >
                <div className="px-4 py-2 bg-claimondo-bg border-b border-claimondo-border">
                  <h4 className="text-xs font-semibold text-claimondo-navy uppercase tracking-wider">
                    {cat.label}
                  </h4>
                </div>
                <div className="divide-y divide-claimondo-border">
                  {cat.events.map((eventType) => (
                    <div
                      key={eventType}
                      className="px-4 py-2.5 grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center gap-2"
                    >
                      <span className="text-sm text-claimondo-navy">
                        {EVENT_LABELS[eventType] ?? eventType}
                      </span>
                      <div className="flex items-center gap-3">
                        {CHANNELS_FOR_UI.map((channel) => {
                          const disabledByChannelOptOut = channelOptOuts.has(channel)
                          const enabled = isEventChannelEnabled(eventType, channel)
                          return (
                            <label
                              key={channel}
                              className={`flex items-center gap-1.5 text-xs ${disabledByChannelOptOut ? 'opacity-40' : 'text-claimondo-navy'}`}
                            >
                              <input
                                type="checkbox"
                                checked={enabled && !disabledByChannelOptOut}
                                disabled={disabledByChannelOptOut}
                                onChange={() => toggleEventChannel(eventType, channel)}
                                className="w-3.5 h-3.5 rounded border-claimondo-border text-claimondo-navy focus:ring-claimondo-ondo/40"
                              />
                              <span>{CHANNEL_LABELS[channel].short}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Save */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending || saveState.status === 'saving'}
          className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-claimondo-navy text-white text-sm font-semibold hover:bg-claimondo-shield disabled:opacity-50"
        >
          {isPending || saveState.status === 'saving' ? (
            <Loader2Icon width={14} height={14} className="animate-spin" />
          ) : (
            <SaveIcon width={14} height={14} />
          )}
          Speichern
        </button>
        {saveState.status === 'success' ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
            <CheckCircle2Icon width={12} height={12} />
            Gespeichert
          </span>
        ) : null}
        {saveState.status === 'error' ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
            <AlertTriangleIcon width={12} height={12} />
            {saveState.msg ?? 'Fehler'}
          </span>
        ) : null}
      </div>
    </form>
  )
}

function timeHM(value: string | null): string | null {
  if (!value) return null
  const parts = value.split(':')
  if (parts.length < 2) return null
  return `${parts[0]}:${parts[1]}`
}
