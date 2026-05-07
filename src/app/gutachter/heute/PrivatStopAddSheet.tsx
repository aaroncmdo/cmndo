'use client'

// AAR-872: Modal-Sheet zum Hinzufuegen eines Privat-Stops aus den heutigen
// GCal/CalDAV-Events. Zwei Pfade pro Event:
//   - location vorhanden → ein Klick auf „Hinzufuegen" geocoded die Adresse
//     serverseitig + persistiert in `sv_private_stops`
//   - location leer → Inline-Places-Autocomplete-Input, nach Auswahl wird
//     direkt mit lat/lng/place_id gespeichert (kein Geocoding-Roundtrip)

import { useEffect, useState, useTransition } from 'react'
import {
  XIcon,
  CalendarClockIcon,
  MapPinIcon,
  PlusCircleIcon,
  Loader2Icon,
  CheckCircle2Icon,
} from 'lucide-react'
import { toast } from 'sonner'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { listPrivateEventsToday, type PrivatEventEntry } from './private-events-actions'
import { addPrivatStop, type PrivatStopRow } from './private-stops-actions'

type Props = {
  open: boolean
  onClose: () => void
  /** Externe IDs der bereits gespeicherten Stops — verhindert Doppel-Add. */
  existingExternalIds: ReadonlySet<string>
  onAdded: (stop: PrivatStopRow) => void
}

function formatHHmm(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function PrivatStopAddSheet({
  open,
  onClose,
  existingExternalIds,
  onAdded,
}: Props) {
  const [events, setEvents] = useState<PrivatEventEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingAddId, setPendingAddId] = useState<string | null>(null)
  const [manualForId, setManualForId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Laden beim ersten Open. Re-fetch wenn Sheet erneut geoeffnet wird,
  // damit aktuelle Kalender-Aenderungen sichtbar sind.
  useEffect(() => {
    if (!open) return
    setEvents(null)
    setLoadError(null)
    startTransition(async () => {
      try {
        const list = await listPrivateEventsToday()
        setEvents(list)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Fehler beim Laden')
      }
    })
  }, [open])

  if (!open) return null

  async function handleAddWithLocation(ev: PrivatEventEntry) {
    if (!ev.location) return
    setPendingAddId(ev.external_event_id)
    const res = await addPrivatStop({
      source: ev.source,
      external_event_id: ev.external_event_id,
      titel: ev.titel,
      start_zeit: ev.start_zeit,
      end_zeit: ev.end_zeit ?? new Date(new Date(ev.start_zeit).getTime() + 60 * 60_000).toISOString(),
      address: ev.location,
    })
    setPendingAddId(null)
    if (!res.ok) {
      toast.error(`Stop konnte nicht hinzugefuegt werden: ${res.error}`)
      return
    }
    toast.success(`Stop „${ev.titel ?? 'Privat-Termin'}" hinzugefuegt`)
    onAdded(res.data)
  }

  async function handleAddWithManual(ev: PrivatEventEntry, place: PlaceResult) {
    setPendingAddId(ev.external_event_id)
    const res = await addPrivatStop({
      source: ev.source,
      external_event_id: ev.external_event_id,
      titel: ev.titel,
      start_zeit: ev.start_zeit,
      end_zeit: ev.end_zeit ?? new Date(new Date(ev.start_zeit).getTime() + 60 * 60_000).toISOString(),
      address: place.adresse,
      lat: place.lat,
      lng: place.lng,
      place_id: place.place_id,
    })
    setPendingAddId(null)
    if (!res.ok) {
      toast.error(`Stop konnte nicht hinzugefuegt werden: ${res.error}`)
      return
    }
    toast.success(`Stop „${ev.titel ?? 'Privat-Termin'}" hinzugefuegt`)
    setManualForId(null)
    onAdded(res.data)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[480px] sm:max-h-[80vh] max-h-[85vh] rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-claimondo-border">
          <div>
            <h3 className="text-sm font-semibold text-claimondo-navy">Stop hinzufügen</h3>
            <p className="text-[11px] text-claimondo-ondo">Privat-Termine aus deinem Kalender</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-claimondo-ondo hover:text-claimondo-navy p-1"
            aria-label="Schliessen"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {!events && !loadError && (
            <div className="flex items-center justify-center py-10 text-xs text-claimondo-ondo gap-2">
              <Loader2Icon className="w-4 h-4 animate-spin" /> Lade Events …
            </div>
          )}
          {loadError && (
            <div className="px-4 py-6 text-xs text-red-600">
              {loadError}
            </div>
          )}
          {events && events.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-claimondo-ondo italic">
              Keine privaten Termine heute gefunden.<br />
              <span className="text-[10px]">
                (GCal + CalDAV werden gelesen — wenn keiner verbunden ist:
                {' '}<a href="/gutachter/einstellungen/kalender" className="underline">Kalender verbinden</a>)
              </span>
            </div>
          )}
          {events && events.length > 0 && (
            <ul className="divide-y divide-claimondo-border">
              {events.map((ev) => {
                const alreadyAdded = existingExternalIds.has(ev.external_event_id)
                const isPending = pendingAddId === ev.external_event_id
                const showManual = manualForId === ev.external_event_id
                const startZeit = formatHHmm(ev.start_zeit)
                const endZeit = ev.end_zeit ? formatHHmm(ev.end_zeit) : null
                return (
                  <li key={`${ev.source}:${ev.external_event_id}`} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        <CalendarClockIcon className="w-4 h-4 text-claimondo-ondo" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-claimondo-navy truncate">
                            {ev.titel ?? '(ohne Titel)'}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-claimondo-ondo/10 text-claimondo-ondo">
                            {ev.source}
                          </span>
                          {ev.bereitsTermin && (
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              SV-Termin
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-claimondo-ondo mt-0.5">
                          {startZeit}{endZeit ? `–${endZeit}` : ''}
                        </p>
                        {ev.location && (
                          <p className="text-[11px] text-claimondo-ondo flex items-start gap-1 mt-1">
                            <MapPinIcon className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="truncate">{ev.location}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="mt-2 ml-7">
                      {alreadyAdded ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700">
                          <CheckCircle2Icon className="w-3 h-3" /> Schon in Tagesroute
                        </span>
                      ) : ev.location && !showManual ? (
                        <button
                          type="button"
                          disabled={isPending || ev.bereitsTermin}
                          onClick={() => handleAddWithLocation(ev)}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-claimondo-navy hover:bg-claimondo-ondo disabled:opacity-50 px-2.5 py-1.5 rounded-lg"
                        >
                          {isPending ? (
                            <Loader2Icon className="w-3 h-3 animate-spin" />
                          ) : (
                            <PlusCircleIcon className="w-3 h-3" />
                          )}
                          Hinzufügen
                        </button>
                      ) : (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-claimondo-ondo">
                            {ev.location ? 'Adresse korrigieren:' : 'Keine Location im Termin — bitte Adresse eingeben:'}
                          </p>
                          <GooglePlaceAutocomplete
                            placeholder="Adresse eingeben..."
                            onSelect={(place) => handleAddWithManual(ev, place)}
                          />
                        </div>
                      )}
                      {ev.location && !showManual && !alreadyAdded && (
                        <button
                          type="button"
                          className="text-[10px] text-claimondo-ondo hover:text-claimondo-navy underline ml-2"
                          onClick={() => setManualForId(ev.external_event_id)}
                        >
                          oder andere Adresse
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-claimondo-border bg-[#f8f9fb] text-[10px] text-claimondo-ondo">
          Quelle: GCal (Google) + CalDAV (Apple/Nextcloud/Fastmail) — verbinde unter{' '}
          <a href="/gutachter/einstellungen/kalender" className="underline">Einstellungen → Kalender</a>.
        </div>
      </div>
    </div>
  )
}
