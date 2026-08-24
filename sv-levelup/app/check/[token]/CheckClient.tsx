'use client'

import { useCallback, useEffect, useState } from 'react'
import { befundHolen, fortschritt, messungStarten, umfangSetzen, websiteNachtragen } from './actions'
import type { BefundAntwort } from '@/lib/levelup/befund'
import type { Modulzustand } from '@/lib/levelup/messung'
import { TerminClient } from './TerminClient'

const GRUPPEN = [
  { id: 'auftritt', titel: 'Ihr Auftritt' },
  { id: 'umfeld', titel: 'Ihr Umfeld' },
  { id: 'nachfrage', titel: 'Die Nachfrage' },
  { id: 'markt', titel: 'Der Markt' },
] as const

export type Kachel = {
  id: string
  titel: string
  punkte: number
  dauerMin: number
  gruppe: string
  gesperrt: string | null
}

type Props = {
  token: string
  modus: 'aufbau' | 'bestand'
  status: 'neu' | 'laeuft' | 'fertig' | 'fehler'
  hatWebsite: boolean
  websiteUrl: string | null
  ort: string | null
  kacheln: Kachel[]
  vorausgewaehlt: string[]
  gewaehlt: string[]
  /** Vom Server geladen, wenn der Check beim Aufruf schon fertig war. */
  ersterBefund: BefundAntwort | null
  hatTermin: boolean
  hatFunnel: boolean
}

const AMPEL_FARBE: Record<string, string> = {
  gruen: 'bg-good',
  gelb: 'bg-warning',
  rot: 'bg-critical',
  offen: 'bg-muted',
}

export function CheckClient(p: Props) {
  const [status, setStatus] = useState(p.status)
  const [auswahl, setAuswahl] = useState<string[]>(
    p.gewaehlt.length > 0 ? p.gewaehlt : p.vorausgewaehlt,
  )
  const [zustaende, setZustaende] = useState<{ id: string; zustand: Modulzustand }[]>([])
  const [befund, setBefund] = useState<BefundAntwort | null>(p.ersterBefund)
  const [fehler, setFehler] = useState<string | null>(null)
  const [laeuftAktion, setLaeuftAktion] = useState(false)

  const offen = p.kacheln.filter((k) => !k.gesperrt)
  const punkte = offen.filter((k) => auswahl.includes(k.id)).reduce((s, k) => s + k.punkte, 0)
  const dauer = offen.filter((k) => auswahl.includes(k.id)).reduce((s, k) => s + k.dauerMin, 0)

  const holeBefund = useCallback(async () => {
    const r = await befundHolen(p.token)
    if (r.ok) setBefund(r.befund)
    else setFehler(r.error)
  }, [p.token])

  // F-04: hoechstens alle zwei Sekunden (Vertrag), und nur solange es laeuft.
  useEffect(() => {
    if (status !== 'laeuft') return
    let aktiv = true

    const takt = setInterval(async () => {
      const r = await fortschritt(p.token)
      if (!aktiv || !r.ok) return
      setZustaende(r.module)
      if (r.status !== 'laeuft') {
        setStatus(r.status)
        if (r.status === 'fertig') void holeBefund()
      }
    }, 2000)

    return () => { aktiv = false; clearInterval(takt) }
  }, [status, p.token, holeBefund])

  async function starten() {
    setLaeuftAktion(true)
    setFehler(null)
    const u = await umfangSetzen(p.token, auswahl)
    if (!u.ok) {
      setFehler(u.error === 'kein_modul' || u.error === 'kein_modul_messbar'
        ? 'Bitte wählen Sie mindestens ein Modul, das jetzt messbar ist.'
        : 'Der Prüfumfang konnte nicht gespeichert werden.')
      setLaeuftAktion(false)
      return
    }
    const m = await messungStarten(p.token)
    setLaeuftAktion(false)
    if (!m.ok) { setFehler('Die Messung konnte nicht gestartet werden.'); return }
    setStatus(m.status)
  }

  return (
    <main className="min-h-dvh bg-flaeche-2 text-text">
      <header className="border-b border-linie bg-nacht">
        <div className="mx-auto flex max-w-[1120px] items-baseline justify-between px-[26px] py-6">
          <span className="display text-sm tracking-[0.16em] text-signal">SV-LevelUp</span>
          <span className="text-xs text-white/45">
            {p.modus === 'aufbau' ? 'Weg: Aufbau' : 'Weg: Bestand'}
            {p.ort ? ` · ${p.ort}` : ''}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1120px] px-[26px] py-10">
        {status === 'neu' && (
          <Auswahl
            {...p}
            auswahl={auswahl}
            setAuswahl={setAuswahl}
            punkte={punkte}
            dauer={dauer}
            fehler={fehler}
            laeuft={laeuftAktion}
            onStart={starten}
          />
        )}

        {status === 'laeuft' && <Pruefliste kacheln={p.kacheln} auswahl={auswahl} zustaende={zustaende} />}

        {status === 'fertig' && (befund
          ? (
            <>
              <Befundansicht befund={befund} modus={p.modus} />
              {/* Zustaende 5-7: Termin, Funnel, Plan */}
              <TerminClient token={p.token} hatTermin={p.hatTermin} hatFunnel={p.hatFunnel} />
            </>
          )
          : <p className="text-muted">Der Befund wird geladen …</p>)}

        {status === 'fehler' && (
          <div className="rounded-[20px] border border-critical/30 bg-critical/5 p-8">
            <h2 className="display text-[1.6rem] text-ink">Die Messung wurde abgebrochen</h2>
            <p className="mt-3 max-w-[60ch]">
              Der Lauf hat die Zeitgrenze überschritten. Sie können den Check über denselben Link
              erneut starten — die bereits erhobenen Werte bleiben erhalten.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function Auswahl(p: Props & {
  auswahl: string[]
  setAuswahl: (a: string[]) => void
  punkte: number
  dauer: number
  fehler: string | null
  laeuft: boolean
  onStart: () => void
}) {
  const [website, setWebsite] = useState('')
  const [nachtragFehler, setNachtragFehler] = useState<string | null>(null)

  function umschalten(id: string) {
    p.setAuswahl(p.auswahl.includes(id) ? p.auswahl.filter((x) => x !== id) : [...p.auswahl, id])
  }

  return (
    <>
      <h1 className="display text-[2.2rem] text-ink">Was soll geprüft werden?</h1>
      <p className="mt-3 max-w-[64ch]">
        Alles, was jetzt messbar ist, ist vorausgewählt. Was gesperrt ist, steht mit dem Grund
        dabei — Sie sehen also auch, was Ihnen fehlt.
      </p>

      {!p.hatWebsite && (
        <div className="mt-6 rounded-[20px] border border-linie bg-flaeche p-5">
          <p className="text-sm">
            <strong className="text-ink">Ohne Website-Adresse</strong> entfallen unten mehrere
            Module. Sie können sie jetzt nachtragen — die betroffenen Module kommen dann zurück.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="mein-sachverstaendigenbuero.de"
              className="flex-1 rounded-[12px] border border-linie-stark bg-flaeche px-4 py-2.5 focus:border-signal focus:outline-none"
            />
            <button
              type="button"
              onClick={async () => {
                const r = await websiteNachtragen(p.token, website)
                if (!r.ok) setNachtragFehler(r.error ?? 'Nicht gespeichert.')
                else window.location.reload()
              }}
              className="rounded-[12px] border border-linie-stark px-5 py-2.5 text-ink transition hover:border-signal"
            >
              Nachtragen
            </button>
          </div>
          {nachtragFehler && <p className="mt-2 text-sm text-critical">{nachtragFehler}</p>}
        </div>
      )}

      {GRUPPEN.map((g) => {
        const inGruppe = p.kacheln.filter((k) => k.gruppe === g.id)
        if (inGruppe.length === 0) return null
        return (
          <section key={g.id} className="mt-8">
            <h2 className="display text-sm tracking-[0.16em] text-muted">{g.titel}</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {inGruppe.map((k) => {
                const an = p.auswahl.includes(k.id) && !k.gesperrt
                return (
                  <div
                    key={k.id}
                    className={[
                      'rounded-[12px] border p-4 transition',
                      k.gesperrt
                        ? 'border-linie bg-flaeche-3/60'
                        : an
                          ? 'border-signal bg-flaeche'
                          : 'border-linie bg-flaeche',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className={k.gesperrt ? 'text-muted' : 'font-medium text-ink'}>{k.titel}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {k.punkte > 0 ? `${k.punkte} Punkte · ` : 'ohne Punktwertung · '}
                          rund {k.dauerMin} min
                        </p>
                      </div>

                      {k.gesperrt ? (
                        <span className="shrink-0 rounded-full bg-flaeche-3 px-3 py-1 text-[11px] text-muted">
                          gesperrt
                        </span>
                      ) : (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={an}
                          aria-label={`${k.titel} ${an ? 'abwählen' : 'auswählen'}`}
                          onClick={() => umschalten(k.id)}
                          className={[
                            'h-6 w-11 shrink-0 rounded-full transition',
                            an ? 'bg-signal' : 'bg-linie-stark',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'block h-5 w-5 rounded-full bg-white transition-transform',
                              an ? 'translate-x-[22px]' : 'translate-x-0.5',
                            ].join(' ')}
                          />
                        </button>
                      )}
                    </div>

                    {/* Der Sperrgrund steht im Klartext auf der Kachel — ein Modul
                        wird nie nur ausgegraut (GESAMTSPEC §2). */}
                    {k.gesperrt && <p className="mt-2 text-xs text-serious">{k.gesperrt}</p>}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="sticky bottom-0 mt-10 border-t border-linie bg-flaeche-2/95 py-5 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm">
            <strong className="text-ink">{p.punkte} Punkte</strong> erhebbar ·{' '}
            {p.auswahl.filter((a) => p.kacheln.some((k) => k.id === a && !k.gesperrt)).length} Module ·
            rund {p.dauer} min
          </p>
          <button
            type="button"
            onClick={p.onStart}
            disabled={p.laeuft}
            className="display rounded-[12px] bg-signal px-7 py-3.5 text-white transition hover:bg-signal-tief disabled:opacity-60"
          >
            {p.laeuft ? 'Startet …' : 'Messung starten'}
          </button>
        </div>
        {p.fehler && <p role="alert" className="mt-3 text-sm text-critical">{p.fehler}</p>}
      </div>
    </>
  )
}

function Pruefliste(p: {
  kacheln: Kachel[]
  auswahl: string[]
  zustaende: { id: string; zustand: Modulzustand }[]
}) {
  const text: Record<Modulzustand, string> = {
    wartet: 'wartet', laeuft: 'läuft', fertig: 'fertig', fehler: 'nicht erhoben',
  }
  const farbe: Record<Modulzustand, string> = {
    wartet: 'text-muted', laeuft: 'text-signal', fertig: 'text-good', fehler: 'text-serious',
  }

  return (
    <>
      <h1 className="display text-[2.2rem] text-ink">Es wird gemessen</h1>
      <p className="mt-3 max-w-[64ch]">
        Jedes Modul ruft echte Quellen ab — Ihre Website, die Kartensuche, Verzeichnisse. Das
        dauert einen Moment; die Seite hält sich selbst auf dem Laufenden.
      </p>

      <ul className="mt-8 divide-y divide-linie rounded-[20px] border border-linie bg-flaeche">
        {p.auswahl.map((id) => {
          const k = p.kacheln.find((x) => x.id === id)
          const z = p.zustaende.find((x) => x.id === id)?.zustand ?? 'wartet'
          return (
            <li key={id} className="flex items-center justify-between px-5 py-4">
              <span className="text-ink">{k?.titel ?? id}</span>
              <span className={`text-sm ${farbe[z]}`}>{text[z]}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

function Befundansicht(p: { befund: BefundAntwort; modus: 'aufbau' | 'bestand' }) {
  const b = p.befund
  return (
    <>
      <p className="display text-sm tracking-[0.16em] text-signal">
        {p.modus === 'aufbau' ? 'Das Feld, in das Sie eintreten' : 'Wo Sie im Feld stehen'}
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        {b.keinScore ? (
          <h1 className="display text-[2.2rem] text-ink">Teilbefund</h1>
        ) : (
          <h1 className="display text-[3.4rem] text-ink">
            {b.score}
            <span className="text-[1.4rem] text-muted"> von 100</span>
          </h1>
        )}
        {b.position && (
          <p className="text-[1.1rem] text-ink">
            Position im Umkreis: <strong>{b.position}</strong>
          </p>
        )}
      </div>

      {b.keinScore && (
        <p className="mt-2 max-w-[64ch] text-sm text-serious">
          Es waren {b.punkteErhebbar} Punkte erhebbar — zu wenig für einen belastbaren Gesamtwert.
          Ein auf ein Drittel der Kriterien normierter Wert sähe aus wie eine Messung und wäre
          keine. Die Einzelbefunde unten stehen trotzdem.
        </p>
      )}

      <p className="mt-4 text-sm text-muted">
        {b.istPunkte} von {b.punkteErhebbar} erhebbaren Punkten
        {b.erhobenAm ? ` · erhoben am ${new Date(b.erhobenAm).toLocaleDateString('de-DE')}` : ''}
      </p>

      {b.module.map((m) => (
        <section key={m.id} className="mt-8 rounded-[20px] border border-linie bg-flaeche p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-[1.35rem] text-ink">{m.titel}</h2>
            <span className="text-sm text-muted">
              {m.maximum > 0 ? `${m.punkte} von ${m.maximum} Punkten` : 'ohne Punktwertung'}
            </span>
          </div>

          <ul className="mt-4 divide-y divide-linie">
            {m.befunde.map((x) => (
              <li key={x.schluessel} className="py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${AMPEL_FARBE[x.ampel] ?? 'bg-muted'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="text-ink">{x.label}</span>
                      <span className={x.wert === null ? 'text-muted' : 'font-medium text-ink'}>
                        {/* R-B: nicht erhoben ist KEIN Balken auf 0 */}
                        {x.wert === null ? 'nicht erhoben' : String(x.wert)}
                      </span>
                    </div>
                    {x.grund && <p className="mt-1 text-sm text-serious">{x.grund}</p>}
                    {x.einordnung && <p className="mt-1 text-sm text-muted">{x.einordnung}</p>}
                    {/* R-A: Quelle und Datum stehen an jedem Wert */}
                    <p className="mt-1 text-[11px] text-muted">
                      Quelle: {x.quelle} · {new Date(x.erhoben).toLocaleDateString('de-DE')}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {m.fehlstellen.length > 0 && (
            <div className="mt-4 rounded-[12px] bg-flaeche-3 p-4">
              <p className="text-xs font-medium text-ink">Nicht erhoben</p>
              <ul className="mt-1 space-y-1">
                {m.fehlstellen.map((f) => (
                  <li key={f.schluessel} className="text-sm text-muted">{f.grund}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}

      {/* Der Tresor nennt AUSSCHLIESSLICH Anzahl und Aufwand — die Massnahmen
          selbst sind nicht Teil dieser Antwort (R-E). */}
      <section className="mt-8 rounded-[20px] border border-linie-stark bg-nacht p-6 text-chrom">
        <h2 className="display text-[1.35rem] text-white">Was sich daraus ableiten lässt</h2>
        {b.tresor.anzahl === 0 ? (
          <p className="mt-3 max-w-[64ch] text-white/70">
            Aus diesem Befund lassen sich Maßnahmen ableiten. Sie werden im Gespräch besprochen und
            sind nicht Teil dieser Auswertung.
          </p>
        ) : (
          <>
            <p className="mt-3 text-white/70">
              <strong className="text-white">{b.tresor.anzahl} Maßnahmen</strong> in{' '}
              {b.tresor.phasen.length} Phasen.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-white/70">
              {b.tresor.phasen.map((ph) => (
                <li key={ph.nr}>
                  Phase {ph.nr}: {ph.anzahl} Maßnahmen · rund {ph.aufwand}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  )
}
