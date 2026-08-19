'use client'

import { useEffect, useState } from 'react'
import { funnelSpeichern, planHolen, slotsHolen, terminWaehlen } from './actions'
import type { Massnahme } from '@/lib/levelup/massnahmen'

/**
 * Der Wortlaut MUSS mit `EINWILLIGUNG_TEXT` in `lib/levelup/termin.ts`
 * uebereinstimmen — dort wird er gespeichert. Ein Nachweis, der einen anderen
 * Text festhaelt als der Nutzer gelesen hat, ist keiner.
 */
const EINWILLIGUNG_ANZEIGE =
  'Ich bin damit einverstanden, dass Claimondo mich unter der angegebenen Nummer zu diesem ' +
  'Termin und zu meiner Auswertung kontaktiert. Die Einwilligung kann ich jederzeit widerrufen.'

const FRAGEN = [
  {
    id: 'jahreErfahrung' as const,
    frage: 'Wie lange sind Sie schon als Sachverständiger tätig?',
    optionen: ['unter 2 Jahre', '2 bis 5 Jahre', '5 bis 10 Jahre', 'über 10 Jahre'],
  },
  {
    id: 'kiNutzung' as const,
    frage: 'Nutzen Sie bereits KI-Werkzeuge im Büro?',
    optionen: ['noch gar nicht', 'vereinzelt', 'regelmäßig'],
  },
  {
    id: 'marketingPartner' as const,
    frage: 'Arbeiten Sie mit einer Marketing-Agentur zusammen?',
    optionen: ['nein', 'ja', 'früher einmal'],
  },
]

type Schritt = 'termin' | 'funnel' | 'plan'

export function TerminClient(p: { token: string; hatTermin: boolean; hatFunnel: boolean }) {
  const [schritt, setSchritt] = useState<Schritt>(
    p.hatTermin ? (p.hatFunnel ? 'plan' : 'funnel') : 'termin',
  )

  if (schritt === 'termin') return <Terminwahl token={p.token} weiter={() => setSchritt('funnel')} />
  if (schritt === 'funnel') return <Funnel token={p.token} weiter={() => setSchritt('plan')} />
  return <Plan token={p.token} />
}

function Terminwahl(p: { token: string; weiter: () => void }) {
  const [slots, setSlots] = useState<{ start: string; label: string }[] | null>(null)
  const [gewaehlt, setGewaehlt] = useState<string | null>(null)
  const [telefon, setTelefon] = useState('')
  const [einwilligung, setEinwilligung] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    let aktiv = true
    slotsHolen().then((s) => { if (aktiv) setSlots(s) })
    return () => { aktiv = false }
  }, [])

  async function absenden() {
    if (!gewaehlt) return
    setLaeuft(true)
    setFehler(null)
    const r = await terminWaehlen(p.token, gewaehlt, telefon, einwilligung)
    setLaeuft(false)
    if (!r.ok) { setFehler(r.error ?? 'Nicht gespeichert.'); return }
    p.weiter()
  }

  return (
    <section className="mt-10 rounded-[20px] border border-linie bg-flaeche p-6">
      <h2 className="display text-[1.6rem] text-ink">Was diese Zahlen für Sie bedeuten</h2>
      <p className="mt-3 max-w-[64ch]">
        Die Befunde oben zeigen, wo es klemmt. Was konkret zu tun ist — und in welcher
        Reihenfolge es sich lohnt — besprechen wir in einem Gespräch. Es dauert rund 20 Minuten
        und kostet nichts.
      </p>

      <h3 className="display mt-7 text-sm tracking-[0.16em] text-muted">Wann passt es Ihnen?</h3>
      {slots === null ? (
        <p className="mt-3 text-muted">Termine werden geladen …</p>
      ) : slots.length === 0 ? (
        <p className="mt-3 text-serious">
          Zurzeit lassen sich keine Termine anzeigen. Bitte versuchen Sie es später erneut.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {slots.map((s) => (
            <button
              key={s.start}
              type="button"
              onClick={() => setGewaehlt(s.start)}
              className={[
                'rounded-[12px] border px-4 py-3 text-left transition',
                gewaehlt === s.start
                  ? 'border-signal bg-signal/5 text-ink'
                  : 'border-linie hover:border-linie-stark',
              ].join(' ')}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 max-w-[34rem]">
        <label htmlFor="telefon" className="block text-sm text-ink">
          Ihre Telefonnummer <span className="text-signal">*</span>
        </label>
        <input
          id="telefon"
          value={telefon}
          onChange={(e) => setTelefon(e.target.value)}
          inputMode="tel"
          autoComplete="tel"
          placeholder="0251 123456"
          className="mt-2 w-full rounded-[12px] border border-linie-stark px-4 py-3 focus:border-signal focus:outline-none"
        />
      </div>

      {/* Der Wortlaut steht ausgeschrieben da — und genau er wird gespeichert. */}
      <label className="mt-5 flex max-w-[64ch] cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={einwilligung}
          onChange={(e) => setEinwilligung(e.target.checked)}
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--signal)]"
        />
        <span className="text-sm leading-relaxed">{EINWILLIGUNG_ANZEIGE}</span>
      </label>

      {fehler && <p role="alert" className="mt-4 text-sm text-critical">{fehler}</p>}

      <button
        type="button"
        onClick={absenden}
        disabled={laeuft || !gewaehlt || !telefon.trim() || !einwilligung}
        className="display mt-6 rounded-[12px] bg-signal px-7 py-3.5 text-white transition hover:bg-signal-tief disabled:cursor-not-allowed disabled:opacity-50"
      >
        {laeuft ? 'Wird gespeichert …' : 'Termin anfragen'}
      </button>

      {!einwilligung && (
        <p className="mt-2 text-xs text-muted">
          Ohne Ihre Einwilligung dürfen wir Sie nicht anrufen — der Knopf bleibt bis dahin gesperrt.
        </p>
      )}
    </section>
  )
}

function Funnel(p: { token: string; weiter: () => void }) {
  const [antworten, setAntworten] = useState<Record<string, string>>({})
  const [laeuft, setLaeuft] = useState(false)

  async function speichern() {
    setLaeuft(true)
    await funnelSpeichern(p.token, antworten)
    setLaeuft(false)
    p.weiter()
  }

  return (
    <section className="mt-10 rounded-[20px] border border-linie bg-flaeche p-6">
      <p className="display text-sm tracking-[0.16em] text-good">Termin ist notiert</p>
      <h2 className="display mt-2 text-[1.6rem] text-ink">Drei Fragen, damit das Gespräch sitzt</h2>
      <p className="mt-3 max-w-[64ch]">
        Jede davon können Sie überspringen. Sie helfen uns nur, im Gespräch nicht bei null
        anzufangen.
      </p>

      {FRAGEN.map((f) => (
        <fieldset key={f.id} className="mt-6">
          <legend className="text-ink">{f.frage}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {f.optionen.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setAntworten((a) => ({ ...a, [f.id]: o }))}
                className={[
                  'rounded-full border px-4 py-2 text-sm transition',
                  antworten[f.id] === o
                    ? 'border-signal bg-signal/5 text-ink'
                    : 'border-linie hover:border-linie-stark',
                ].join(' ')}
              >
                {o}
              </button>
            ))}
          </div>
        </fieldset>
      ))}

      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={speichern}
          disabled={laeuft}
          className="display rounded-[12px] bg-signal px-7 py-3.5 text-white transition hover:bg-signal-tief disabled:opacity-60"
        >
          {laeuft ? 'Einen Moment …' : 'Weiter zum Plan'}
        </button>
        <button
          type="button"
          onClick={p.weiter}
          className="rounded-[12px] border border-linie-stark px-6 py-3.5 text-ink transition hover:border-signal"
        >
          Überspringen
        </button>
      </div>
    </section>
  )
}

function Plan(p: { token: string }) {
  const [phasen, setPhasen] = useState<{ nr: number; massnahmen: Massnahme[] }[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    planHolen(p.token).then((r) => {
      if (!aktiv) return
      if (r.ok) setPhasen(r.phasen)
      else setFehler(r.error === 'kein_termin'
        ? 'Der Plan wird nach dem Terminwunsch freigegeben.'
        : 'Der Plan konnte nicht geladen werden.')
    })
    return () => { aktiv = false }
  }, [p.token])

  if (fehler) {
    return (
      <section className="mt-10 rounded-[20px] border border-linie bg-flaeche p-6">
        <p className="text-serious">{fehler}</p>
      </section>
    )
  }

  if (phasen === null) {
    return <p className="mt-10 text-muted">Der Plan wird zusammengestellt …</p>
  }

  const gesamt = phasen.reduce((s, ph) => s + ph.massnahmen.length, 0)
  const punkte = phasen.reduce((s, ph) => s + ph.massnahmen.reduce((t, m) => t + m.p, 0), 0)

  return (
    <section className="mt-10">
      <p className="display text-sm tracking-[0.16em] text-signal">Ihr Plan</p>
      <h2 className="display mt-2 text-[1.9rem] text-ink">
        {gesamt === 0 ? 'Nichts Dringendes gefunden' : `${gesamt} Schritte, ${punkte} erreichbare Punkte`}
      </h2>

      {gesamt === 0 ? (
        <p className="mt-3 max-w-[64ch]">
          Aus den erhobenen Werten ergibt sich kein Handlungsbedarf — entweder war alles bereits
          in Ordnung, oder die betroffenen Bereiche ließen sich nicht messen. Im Gespräch gehen
          wir das gemeinsam durch.
        </p>
      ) : (
        <p className="mt-3 max-w-[64ch]">
          In dieser Reihenfolge: was viel bringt und wenig kostet, steht vorn. Die Punkte sind
          die, die Ihr Befund heute liegen lässt.
        </p>
      )}

      {phasen.map((ph) => (
        <div key={ph.nr} className="mt-8">
          <h3 className="display text-sm tracking-[0.16em] text-muted">
            Phase {ph.nr}
            <span className="ml-3 font-normal tracking-normal">
              {ph.massnahmen.length} {ph.massnahmen.length === 1 ? 'Schritt' : 'Schritte'}
            </span>
          </h3>

          <ol className="mt-3 space-y-3">
            {ph.massnahmen.map((m, i) => (
              <li key={`${ph.nr}-${i}`} className="rounded-[12px] border border-linie bg-flaeche p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-medium text-ink">{m.t}</span>
                  <span className="text-sm text-muted">
                    +{m.p} {m.p === 1 ? 'Punkt' : 'Punkte'} · {m.a} · Wirkung {m.wi}
                  </span>
                </div>
                <p className="mt-2 max-w-[70ch] text-sm leading-relaxed">{m.w}</p>
                {/* R-A: auch eine Maßnahme nennt, worauf sie sich stützt. */}
                <p className="mt-2 text-[11px] text-muted">Aus: {m.q}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}

      <p className="mt-8 max-w-[64ch] text-sm text-muted">
        Wir melden uns zum vereinbarten Termin unter der angegebenen Nummer.
      </p>
    </section>
  )
}
