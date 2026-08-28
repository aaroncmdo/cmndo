'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/primitives'
import { bucheBeratungOnline } from './actions'

type Slot = { startIso: string; datum: string; uhrzeit: string }

function formatTag(datum: string): string {
  // datum = 'YYYY-MM-DD' (Berlin) — Mittag als DST-sicherer Anker.
  return new Date(`${datum}T12:00:00`).toLocaleDateString('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
  })
}

export function BeratungBuchenClient({
  leadId,
  exp,
  sig,
  firma,
  slots,
}: {
  leadId: string
  exp: string
  sig: string
  firma: string | null
  slots: Slot[]
}) {
  const [gewaehlt, setGewaehlt] = useState<Slot | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [gebucht, setGebucht] = useState<{ startIso: string; videoLink: string | null } | null>(null)
  const [pending, startTransition] = useTransition()

  const tage = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots) {
      const list = map.get(s.datum) ?? []
      list.push(s)
      map.set(s.datum, list)
    }
    return Array.from(map.entries())
  }, [slots])

  function buchen() {
    if (!gewaehlt) return
    setFehler(null)
    startTransition(async () => {
      const res = await bucheBeratungOnline({ leadId, exp, sig, startIso: gewaehlt.startIso })
      if (res.ok) setGebucht({ startIso: res.startIso, videoLink: res.videoLink })
      else setFehler(res.error)
    })
  }

  if (gebucht) {
    const wann = new Date(gebucht.startIso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    return (
      <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 text-center sm:p-8">
        <h2 className="text-xl font-bold text-claimondo-navy">Termin gebucht!</h2>
        <p className="mt-3 text-sm text-claimondo-shield">
          Ihr Beratungsgespräch{firma ? ` für ${firma}` : ''} ist bestätigt:
        </p>
        <p className="mt-2 text-lg font-semibold text-claimondo-navy">{wann} Uhr</p>
        <p className="mt-3 text-sm text-claimondo-shield">
          Die Kalender-Einladung {gebucht.videoLink ? 'mit Google-Meet-Link ' : ''}kommt per E-Mail.
        </p>
        {gebucht.videoLink ? (
          <a
            href={gebucht.videoLink}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center justify-center rounded-ios-lg bg-claimondo-navy px-6 py-3 text-sm font-semibold text-white hover:bg-claimondo-shield"
          >
            Google-Meet-Link öffnen
          </a>
        ) : null}
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 text-center sm:p-8">
        <p className="text-sm text-claimondo-shield">
          Aktuell sind keine freien Termine verfügbar — bitte versuchen Sie es später erneut oder
          fragen Sie eine Beratung an:
        </p>
        <a
          href="https://claimondo.de/beratung-anfragen"
          className="mt-4 inline-flex items-center justify-center rounded-ios-lg bg-claimondo-navy px-5 py-2.5 text-sm font-semibold text-white"
        >
          Beratung anfragen
        </a>
      </div>
    )
  }

  return (
    <div className="rounded-ios-lg border border-claimondo-border bg-white p-6 sm:p-8">
      <div className="space-y-5 max-h-[26rem] overflow-y-auto pr-1">
        {tage.map(([datum, tagSlots]) => (
          <div key={datum}>
            <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">
              {formatTag(datum)}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {tagSlots.map((s) => {
                const aktiv = gewaehlt?.startIso === s.startIso
                return (
                  <button
                    key={s.startIso}
                    type="button"
                    onClick={() => setGewaehlt(s)}
                    aria-pressed={aktiv}
                    className={`rounded-ios-md border px-3 py-1.5 text-sm transition-colors ${
                      aktiv
                        ? 'border-claimondo-ondo bg-claimondo-ondo/10 font-semibold text-claimondo-navy'
                        : 'border-claimondo-border text-claimondo-navy hover:border-claimondo-ondo/60'
                    }`}
                  >
                    {s.uhrzeit}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {fehler ? <p className="mt-4 text-sm text-danger-strong">{fehler}</p> : null}

      <div className="mt-6">
        <Button onClick={buchen} loading={pending} disabled={!gewaehlt} fullWidth>
          {gewaehlt
            ? `Termin bestätigen — ${formatTag(gewaehlt.datum)}, ${gewaehlt.uhrzeit} Uhr`
            : 'Bitte einen Termin wählen'}
        </Button>
      </div>
      <p className="mt-3 text-center text-xs text-claimondo-shield">
        30 Minuten · Google Meet · kostenlos &amp; unverbindlich
      </p>
    </div>
  )
}
