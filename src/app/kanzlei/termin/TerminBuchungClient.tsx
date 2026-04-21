'use client'

// AAR-kanzlei-termin: Buchungs-Formular + eigene Termin-Liste.
//
// Slot-Picker: Datepicker + Time-Select mit 30-Min-Raster. Belegte Slots des
// ausgewählten Admins werden aus `adminBelegungen` ermittelt (eigene Tabelle).
// Google-Calendar-externe Termine (persönliche Admin-Events) sind ohne
// FreeBusy-API nicht sichtbar — Backlog-Item für Folge-PR.

import { useMemo, useState, useTransition } from 'react'
import { CalendarIcon, VideoIcon, MapPinIcon, ExternalLinkIcon, XIcon, Building2Icon } from 'lucide-react'
import { createKanzleiAdminTermin, cancelKanzleiAdminTermin } from './actions'

export interface AdminAuswahl {
  id: string
  name: string
  email: string | null
  google_verbunden: boolean
}

export interface EigenerTermin {
  id: string
  start_zeit: string
  end_zeit: string
  typ: 'video' | 'vor_ort'
  titel: string
  beschreibung: string | null
  status: 'gebucht' | 'abgesagt' | 'durchgefuehrt'
  google_meet_link: string | null
  admin_name: string
  fall_id: string | null
}

export interface AdminBelegung {
  admin_user_id: string
  start_zeit: string
  end_zeit: string
}

const DAUER_OPTIONEN = [30, 45, 60, 90, 120] as const

function isoDateStr(d: Date): string {
  // YYYY-MM-DD in Europe/Berlin — date-input erwartet lokale Zeit
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function slotBelegt(
  startISO: string,
  dauerMin: number,
  belegungen: AdminBelegung[],
): boolean {
  const s = new Date(startISO).getTime()
  const e = s + dauerMin * 60 * 1000
  return belegungen.some((b) => {
    const bs = new Date(b.start_zeit).getTime()
    const be = new Date(b.end_zeit).getTime()
    return s < be && e > bs
  })
}

export default function TerminBuchungClient({
  verfuegbareAdmins,
  alleAdminsCount,
  eigeneTermine,
  adminBelegungen,
}: {
  verfuegbareAdmins: AdminAuswahl[]
  alleAdminsCount: number
  eigeneTermine: EigenerTermin[]
  adminBelegungen: AdminBelegung[]
}) {
  const morgen = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d
  }, [])
  const minDateStr = isoDateStr(new Date())

  const [adminId, setAdminId] = useState(verfuegbareAdmins[0]?.id ?? '')
  const [datum, setDatum] = useState(isoDateStr(morgen))
  const [uhrzeit, setUhrzeit] = useState('10:00')
  const [dauer, setDauer] = useState<number>(30)
  const [typ, setTyp] = useState<'video' | 'vor_ort'>('video')
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  const startISO = useMemo(() => {
    if (!datum || !uhrzeit) return null
    const d = new Date(`${datum}T${uhrzeit}:00`)
    if (isNaN(d.getTime())) return null
    return d.toISOString()
  }, [datum, uhrzeit])

  const adminSpecificBelegung = useMemo(
    () => adminBelegungen.filter((b) => b.admin_user_id === adminId),
    [adminBelegungen, adminId],
  )

  const slotKollision =
    startISO !== null &&
    adminId !== '' &&
    slotBelegt(startISO, dauer, adminSpecificBelegung)

  const kannBuchen =
    !pending &&
    !slotKollision &&
    !!adminId &&
    !!startISO &&
    titel.trim().length >= 3

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!kannBuchen || !startISO) return
    setFeedback(null)
    startTransition(async () => {
      const r = await createKanzleiAdminTermin({
        adminUserId: adminId,
        startISO,
        dauerMinuten: dauer,
        typ,
        titel: titel.trim(),
        beschreibung: beschreibung.trim() || undefined,
      })
      if (r.success) {
        setFeedback({
          ok: true,
          text: r.meetLink
            ? `Termin gebucht — Meet-Link: ${r.meetLink}`
            : 'Termin gebucht.',
        })
        setTitel('')
        setBeschreibung('')
      } else {
        setFeedback({ ok: false, text: r.error })
      }
    })
  }

  function handleCancel(terminId: string) {
    if (!confirm('Termin wirklich absagen? Der Google-Kalender-Eintrag wird gelöscht.')) return
    startTransition(async () => {
      const r = await cancelKanzleiAdminTermin(terminId)
      if (!r.success) {
        setFeedback({ ok: false, text: r.error ?? 'Fehler beim Absagen' })
      } else {
        setFeedback({ ok: true, text: 'Termin abgesagt.' })
      }
    })
  }

  if (alleAdminsCount === 0 || verfuegbareAdmins.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Aktuell ist kein Admin für Online-Buchungen verfügbar (kein verbundener
        Google-Kalender). Bitte meldet euch direkt per Mail, bis ein Admin
        seinen Kalender verbindet.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* BUCHUNGS-FORMULAR */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-[#e4e7ef] bg-white p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-[#4573A2]" />
          <h2 className="text-sm font-semibold text-[#0D1B3E]">Neuen Termin buchen</h2>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">
            Admin
          </label>
          <select
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            className="w-full rounded-md border border-[#e4e7ef] px-3 py-2 text-sm bg-white"
            required
          >
            {verfuegbareAdmins.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">
            Termin-Typ
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTyp('video')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                typ === 'video'
                  ? 'bg-[#4573A2] text-white border-[#4573A2]'
                  : 'bg-white text-gray-700 border-[#e4e7ef] hover:border-gray-300'
              }`}
            >
              <VideoIcon className="w-3.5 h-3.5" />
              Video + Meet
            </button>
            <button
              type="button"
              onClick={() => setTyp('vor_ort')}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
                typ === 'vor_ort'
                  ? 'bg-[#4573A2] text-white border-[#4573A2]'
                  : 'bg-white text-gray-700 border-[#e4e7ef] hover:border-gray-300'
              }`}
            >
              <MapPinIcon className="w-3.5 h-3.5" />
              Vor Ort
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-gray-500">
              Datum
            </label>
            <input
              type="date"
              value={datum}
              min={minDateStr}
              onChange={(e) => setDatum(e.target.value)}
              className="w-full rounded-md border border-[#e4e7ef] px-3 py-2 text-sm"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-gray-500">
              Uhrzeit
            </label>
            <input
              type="time"
              value={uhrzeit}
              step={900}
              onChange={(e) => setUhrzeit(e.target.value)}
              className="w-full rounded-md border border-[#e4e7ef] px-3 py-2 text-sm"
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">
            Dauer
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {DAUER_OPTIONEN.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDauer(d)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
                  dauer === d
                    ? 'bg-[#0D1B3E] text-white border-[#0D1B3E]'
                    : 'bg-white text-gray-700 border-[#e4e7ef]'
                }`}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">
            Titel
          </label>
          <input
            type="text"
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder="z. B. Absprache Mandat CLM-20260421-007"
            className="w-full rounded-md border border-[#e4e7ef] px-3 py-2 text-sm"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-gray-500">
            Notiz (optional)
          </label>
          <textarea
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            rows={3}
            placeholder="Worum geht es? Stichworte reichen."
            className="w-full rounded-md border border-[#e4e7ef] px-3 py-2 text-sm resize-none"
          />
        </div>

        {slotKollision && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            Dieser Slot ist bei dem Admin bereits belegt. Bitte eine andere Zeit wählen.
          </p>
        )}

        {feedback && (
          <p
            className={`text-xs rounded p-2 break-all ${
              feedback.ok
                ? 'text-green-800 bg-green-50 border border-green-200'
                : 'text-red-800 bg-red-50 border border-red-200'
            }`}
          >
            {feedback.text}
          </p>
        )}

        <button
          type="submit"
          disabled={!kannBuchen}
          className="w-full px-4 py-2.5 rounded-lg bg-[#4573A2] text-white text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Bucht …' : 'Termin verbindlich buchen'}
        </button>
        <p className="text-[10px] text-gray-500 italic">
          Der Admin erhält eine Benachrichtigung + Google-Kalender-Einladung.
          Ihr bekommt ebenfalls eine Kalender-Einladung per Email.
        </p>
      </form>

      {/* EIGENE TERMINE */}
      <div className="rounded-xl border border-[#e4e7ef] bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Building2Icon className="w-4 h-4 text-[#4573A2]" />
          <h2 className="text-sm font-semibold text-[#0D1B3E]">Eure kommenden Termine</h2>
        </div>
        {eigeneTermine.length === 0 && (
          <p className="text-xs text-gray-500 italic">
            Noch keine Termine gebucht.
          </p>
        )}
        <div className="space-y-2">
          {eigeneTermine.map((t) => {
            const start = new Date(t.start_zeit)
            const end = new Date(t.end_zeit)
            const dateStr = start.toLocaleDateString('de-DE', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
            })
            const timeStr = `${start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
            return (
              <div
                key={t.id}
                className="rounded-lg border border-[#e4e7ef] p-3 hover:border-[#4573A2] transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[11px] text-gray-500">
                      {dateStr} · {timeStr}
                    </p>
                    <p className="text-sm font-semibold text-[#0D1B3E] truncate">
                      {t.titel}
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      mit {t.admin_name}{' '}
                      <span className="text-gray-400">
                        · {t.typ === 'video' ? 'Video' : 'Vor Ort'}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancel(t.id)}
                    className="shrink-0 p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-700"
                    aria-label="Absagen"
                    title="Termin absagen"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
                {t.google_meet_link && (
                  <a
                    href={t.google_meet_link}
                    target="_blank"
                    rel="noopener"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#4573A2] hover:underline"
                  >
                    <VideoIcon className="w-3 h-3" />
                    Meet-Link öffnen
                    <ExternalLinkIcon className="w-3 h-3" />
                  </a>
                )}
                {t.beschreibung && (
                  <p className="mt-2 text-[11px] text-gray-500 italic line-clamp-2">
                    {t.beschreibung}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
