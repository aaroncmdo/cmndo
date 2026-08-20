'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { leiteAb, type Massnahme } from '@/lib/levelup/massnahmen'
import { baueGespraech, type Gespraech } from '@/lib/levelup/gespraech'
import type { ModulErgebnis } from '@/lib/levelup/messmaschine'
import type { Befund, Fehlstelle } from '@/lib/levelup/modul-vertrag'

type ModulKachel = {
  id: string
  titel: string
  istPunkte: number
  maxPunkte: number
  fehlstellen: number
}

type LeadZeile = {
  id: string
  firma: string | null
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
  website_url: string | null
  claim_status: string | null
  konvertiert_zu_sv_id: string | null
  kontakt_quelle: string | null
  angereichert_am: string | null
}

type Props = {
  firmenname: string | null
  ort: string | null
  modus: string
  score: number | null
  keinScore: boolean
  punkteErhebbar: number | null
  erhobenAm: string | null
  websiteUrl: string | null
  checkToken: string
  module: ModulKachel[]
  befunde: Record<string, ModulErgebnis>
  fehlstellen: Record<string, Fehlstelle[]>
  massnahmen: Massnahme[]
  gespraech: Gespraech
  lead: LeadZeile | null
  terminAm: string | null
  terminTelefon: string | null
  funnel: Record<string, string> | null
}

type Ansicht = 'gesamt' | 'plan' | 'gespraech'

const AMPEL_FARBE: Record<string, string> = {
  gruen: 'bg-good',
  gelb: 'bg-warn',
  rot: 'bg-critical',
  offen: 'bg-white/25',
}

export function AuswertungClient(p: Props) {
  const [ansicht, setAnsicht] = useState<Ansicht>('gesamt')
  const [aus, setAus] = useState<Set<string>>(new Set())

  const anIst = (id: string) => !aus.has(id)
  function schalte(id: string) {
    setAus((v) => {
      const n = new Set(v)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  // ⚠ EINE Filterung fuer ALLE drei Ansichten. Wer ein Modul abwaehlt, soll es
  // auch im Leitfaden nicht mehr sehen — sonst nennt man im Gespraech eine
  // Zahl, die man gerade ausgeblendet hat.
  //
  // ⭐ Abgeleitet wird mit DENSELBEN Funktionen wie auf dem Server, nur mit der
  // kleineren Befundmenge. Die Alternative — die fertigen Listen des Servers
  // nachtraeglich filtern — braeuchte eine zweite Zuordnungslogik von Massnahme
  // zu Modul, die es sonst nirgends gibt. Zwei Wege zur selben Aussage sind
  // zwei Gelegenheiten, dass sie auseinanderlaufen.
  const gefiltert = useMemo(() => {
    const befunde: Record<string, ModulErgebnis> = {}
    for (const [id, m] of Object.entries(p.befunde)) if (!aus.has(id)) befunde[id] = m

    const massnahmen = leiteAb(befunde)
    const gespraech = baueGespraech(befunde, massnahmen)
    return { befunde, massnahmen, gespraech }
  }, [aus, p.befunde])

  const istPunkte = Object.values(gefiltert.befunde).reduce((s, m) => s + m.istPunkte, 0)
  const maxPunkte = Object.values(gefiltert.befunde).reduce((s, m) => s + m.maxPunkte, 0)
  const gefiltertScore = maxPunkte > 0 ? Math.round((istPunkte / maxPunkte) * 100) : null
  const etwasAbgewaehlt = aus.size > 0

  return (
    <main className="min-h-dvh bg-nacht text-chrom">
      <div className="mx-auto max-w-[1180px] px-[26px] py-12">
        {/* Kopf */}
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="display text-sm tracking-[0.16em] text-signal">Interne Auswertung</p>
            <h1 className="display mt-2 text-white" style={{ fontSize: 'clamp(1.7rem, 3.6vw, 2.5rem)' }}>
              {p.firmenname ?? 'Büro ohne Namen'}
            </h1>
            <p className="mt-1 text-sm text-white/55">
              {p.ort ?? 'Ort unbekannt'} · Weg {p.modus === 'aufbau' ? 'Aufbau' : 'Bestand'}
              {p.erhobenAm && ` · gemessen am ${new Date(p.erhobenAm).toLocaleDateString('de-DE')}`}
            </p>
          </div>
          <Link href="/auswertung" className="text-sm text-white/50 underline underline-offset-4 hover:text-white/80">
            Zur Übersicht
          </Link>
        </div>

        {/* Reiter */}
        <div className="mt-8 flex flex-wrap gap-2">
          {([['gesamt', 'Gesamtauswertung'], ['plan', 'Maßnahmenplan'], ['gespraech', 'Verkaufsgespräch']] as const).map(
            ([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setAnsicht(id)}
                className={[
                  'rounded-[12px] border px-4 py-2 text-sm transition',
                  ansicht === id ? 'border-signal bg-signal/10 text-white' : 'border-white/15 text-white/60 hover:border-white/35',
                ].join(' ')}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {/* Modulleiste — filtert alle drei Ansichten zugleich */}
        <div className="mt-5 rounded-[16px] border border-white/12 bg-white/[0.03] p-4">
          <p className="text-xs uppercase tracking-wider text-white/40">
            Module — abgewählte verschwinden aus allen drei Ansichten
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.module.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => schalte(m.id)}
                className={[
                  'rounded-full border px-3 py-1.5 text-xs transition',
                  anIst(m.id) ? 'border-white/25 text-white' : 'border-white/10 text-white/30 line-through',
                ].join(' ')}
              >
                {m.titel}
                <span className="ml-2 text-white/45">
                  {m.maxPunkte > 0 ? `${m.istPunkte}/${m.maxPunkte}` : m.fehlstellen > 0 ? 'offen' : '—'}
                </span>
              </button>
            ))}
          </div>
        </div>

        {ansicht === 'gesamt' && (
          <Gesamt
            score={etwasAbgewaehlt ? gefiltertScore : p.score}
            keinScore={p.keinScore && !etwasAbgewaehlt}
            istPunkte={istPunkte}
            maxPunkte={maxPunkte}
            gefiltert={etwasAbgewaehlt}
            module={p.module.filter((m) => anIst(m.id))}
            befunde={gefiltert.befunde}
            fehlstellen={p.fehlstellen}
            lead={p.lead}
            terminAm={p.terminAm}
            terminTelefon={p.terminTelefon}
            funnel={p.funnel}
            checkToken={p.checkToken}
            websiteUrl={p.websiteUrl}
          />
        )}

        {ansicht === 'plan' && <Plan massnahmen={gefiltert.massnahmen} />}

        {ansicht === 'gespraech' && (
          <GespraechsAnsicht
            g={gefiltert.gespraech}
            module={Object.keys(gefiltert.befunde).length}
          />
        )}
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function Gesamt(p: {
  score: number | null
  keinScore: boolean
  istPunkte: number
  maxPunkte: number
  gefiltert: boolean
  module: ModulKachel[]
  befunde: Record<string, ModulErgebnis>
  fehlstellen: Record<string, Fehlstelle[]>
  lead: LeadZeile | null
  terminAm: string | null
  terminTelefon: string | null
  funnel: Record<string, string> | null
  checkToken: string
  websiteUrl: string | null
}) {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div>
        <div className="rounded-[18px] border border-white/12 bg-white/[0.03] p-6">
          <p className="text-xs uppercase tracking-wider text-white/40">
            {p.gefiltert ? 'Ergebnis der gewählten Module' : 'Gesamtergebnis'}
          </p>
          <p className="display mt-2 text-white" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)' }}>
            {p.keinScore || p.score === null ? 'Teilbefund' : `${p.score} von 100`}
          </p>
          <p className="mt-2 text-sm text-white/60">
            {p.istPunkte} von {p.maxPunkte} erhebbaren Punkten
            {p.keinScore && ' — zu wenig für einen belastbaren Gesamtwert'}
          </p>
        </div>

        {p.module.map((m) => {
          const modul = p.befunde[m.id]
          const luecken = p.fehlstellen[m.id] ?? []
          return (
            <section key={m.id} className="mt-5 rounded-[18px] border border-white/12 bg-white/[0.03] p-6">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="display text-[1.15rem] text-white">{m.titel}</h2>
                <span className="text-sm text-white/55">
                  {m.maxPunkte > 0 ? `${m.istPunkte} von ${m.maxPunkte}` : 'ohne Punktwertung'}
                </span>
              </div>

              {(modul?.befunde ?? []).map((b) => <BefundZeile key={b.schluessel} b={b} />)}

              {luecken.map((f, i) => (
                <p key={`${f.schluessel}-${i}`} className="mt-3 rounded-[10px] bg-white/[0.04] px-3 py-2 text-sm text-white/60">
                  <span className="text-white/45">Nicht erhoben — </span>{f.grund}
                </p>
              ))}
            </section>
          )
        })}
      </div>

      <aside className="space-y-5">
        <div className="rounded-[18px] border border-white/12 bg-white/[0.03] p-5">
          <p className="text-xs uppercase tracking-wider text-white/40">Kontakt</p>
          {!p.lead ? (
            <p className="mt-3 text-sm text-white/55">
              Dieser Check ist keinem Lead zugeordnet — er kam über die öffentliche Seite.
            </p>
          ) : (
            <dl className="mt-3 space-y-2.5 text-sm">
              <Feld k="Firma" v={p.lead.firma} />
              <Feld k="Person" v={[p.lead.vorname, p.lead.nachname].filter(Boolean).join(' ') || null} />
              <Feld k="E-Mail" v={p.lead.email} />
              <Feld k="Telefon" v={p.lead.telefon} />
              {p.lead.kontakt_quelle && (
                <div className="border-t border-white/10 pt-2.5">
                  <dt className="text-white/40">Herkunft der Angaben</dt>
                  <dd className="mt-0.5 break-words text-white/70">{p.lead.kontakt_quelle}</dd>
                  {p.lead.angereichert_am && (
                    <dd className="mt-0.5 text-xs text-white/40">
                      ermittelt am {new Date(p.lead.angereichert_am).toLocaleDateString('de-DE')}
                    </dd>
                  )}
                </div>
              )}
            </dl>
          )}
        </div>

        {p.terminAm && (
          <div className="rounded-[18px] border border-signal/40 bg-signal/[0.07] p-5">
            <p className="text-xs uppercase tracking-wider text-signal">Terminwunsch</p>
            <p className="mt-2 text-white">
              {new Date(p.terminAm).toLocaleString('de-DE', {
                weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {p.terminTelefon && <p className="mt-1 text-sm text-white/70">{p.terminTelefon}</p>}
          </div>
        )}

        {p.funnel && Object.keys(p.funnel).length > 0 && (
          <div className="rounded-[18px] border border-white/12 bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-wider text-white/40">Vor dem Gespräch gesagt</p>
            <dl className="mt-3 space-y-2 text-sm">
              {Object.entries(p.funnel).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-white/40">{FUNNEL_LABEL[k] ?? k}</dt>
                  <dd className="text-white/80">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <Konvertierung lead={p.lead} />

        <div className="rounded-[18px] border border-white/12 bg-white/[0.03] p-5 text-sm">
          <p className="text-xs uppercase tracking-wider text-white/40">Links</p>
          <a
            href={`/check/${p.checkToken}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 block text-white/70 underline underline-offset-4 hover:text-white"
          >
            Kundensicht öffnen
          </a>
          {p.websiteUrl && (
            <a
              href={p.websiteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block break-words text-white/70 underline underline-offset-4 hover:text-white"
            >
              {p.websiteUrl.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
      </aside>
    </div>
  )
}

const FUNNEL_LABEL: Record<string, string> = {
  jahreErfahrung: 'Jahre als Sachverständiger',
  kiNutzung: 'KI-Werkzeuge im Büro',
  marketingPartner: 'Marketing-Agentur',
}

function Feld({ k, v }: { k: string; v: string | null }) {
  return (
    <div>
      <dt className="text-white/40">{k}</dt>
      <dd className={v ? 'break-words text-white/85' : 'text-white/30'}>{v ?? 'nicht bekannt'}</dd>
    </div>
  )
}

function BefundZeile({ b }: { b: Befund }) {
  const offen = b.wert === null
  return (
    <div className="mt-4 border-t border-white/8 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2 text-white/90">
          <span className={`inline-block h-2 w-2 rounded-full ${AMPEL_FARBE[b.ampel] ?? 'bg-white/25'}`} />
          {b.label}
        </span>
        <span className="text-sm text-white/60">
          {offen ? 'nicht erhoben' : String(b.wert)}
          {b.maximum > 0 && ` · ${b.punkte}/${b.maximum}`}
        </span>
      </div>
      {(b.einordnung || b.grund) && (
        <p className="mt-1.5 max-w-[74ch] text-sm leading-relaxed text-white/65">{b.einordnung ?? b.grund}</p>
      )}
      {/* R-A: jede Zahl nennt Herkunft und Zeitpunkt — im Gespräch die erste Rückfrage. */}
      <p className="mt-1 text-[11px] text-white/35">
        {b.quelle} · {new Date(b.erhoben).toLocaleDateString('de-DE')}
      </p>
    </div>
  )
}

function Konvertierung({ lead }: { lead: LeadZeile | null }) {
  if (!lead) return null

  const konvertiert = Boolean(lead.konvertiert_zu_sv_id)
  const offen = lead.claim_status === 'offen'

  return (
    <div className="rounded-[18px] border border-white/12 bg-white/[0.03] p-5">
      <p className="text-xs uppercase tracking-wider text-white/40">Zu Partner machen</p>

      {konvertiert ? (
        <p className="mt-3 text-sm text-good">Bereits konvertiert — dieser Lead ist ein Partner.</p>
      ) : !offen ? (
        <p className="mt-3 text-sm text-white/60">
          Status „{lead.claim_status ?? 'unbekannt'}“ — eine Beanspruchung läuft bereits oder ist abgelehnt.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-relaxed text-white/70">
            Der Lead ist beanspruchbar. Die Anlage läuft über das Partner-Portal — dort liegt der
            gehärtete Weg samt Rücknahme bei Fehlern.
          </p>
          <a
            href="https://claimondo.de/de/gutachter-partner"
            target="_blank"
            rel="noreferrer"
            className="display mt-4 block rounded-[12px] bg-signal px-4 py-2.5 text-center text-sm text-white transition hover:bg-signal-tief"
          >
            Im Partner-Portal beanspruchen
          </a>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            Dort nach „{lead.firma ?? 'dem Firmennamen'}“ suchen. E-Mail und Telefon stehen oben zum
            Übernehmen.
          </p>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function Plan({ massnahmen }: { massnahmen: Massnahme[] }) {
  const phasen = [1, 2, 3].map((nr) => ({ nr, liste: massnahmen.filter((m) => m.ph === nr) }))
  const gesamt = massnahmen.length
  const punkte = massnahmen.reduce((s, m) => s + m.p, 0)

  if (gesamt === 0) {
    return (
      <div className="mt-8 rounded-[18px] border border-white/12 bg-white/[0.03] p-6">
        <p className="text-white/70">
          Aus den gewählten Modulen ergibt sich kein Handlungsbedarf — entweder war alles in
          Ordnung, oder die betroffenen Bereiche ließen sich nicht messen.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <p className="display text-white" style={{ fontSize: 'clamp(1.4rem, 3vw, 2rem)' }}>
        {gesamt} Schritte, {punkte} erreichbare Punkte
      </p>
      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-white/65">
        Sortiert nach Wirkung je Aufwand. Phase 1 ist das, was im Gespräch besprochen wird — der
        Rest gehört in den Plan, den er mitbekommt.
      </p>

      {phasen.filter((ph) => ph.liste.length > 0).map((ph) => (
        <div key={ph.nr} className="mt-7">
          <h3 className="display text-sm tracking-[0.16em] text-white/45">
            Phase {ph.nr}
            <span className="ml-3 font-normal tracking-normal text-white/35">
              {ph.liste.length} {ph.liste.length === 1 ? 'Schritt' : 'Schritte'} ·{' '}
              {ph.liste.reduce((s, m) => s + m.p, 0)} Punkte
            </span>
          </h3>
          <ol className="mt-3 space-y-3">
            {ph.liste.map((m, i) => (
              <li key={`${ph.nr}-${i}`} className="rounded-[14px] border border-white/12 bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-white">{m.t}</span>
                  <span className="text-sm text-white/55">
                    +{m.p} {m.p === 1 ? 'Punkt' : 'Punkte'} · {m.a} · Wirkung {m.wi}
                  </span>
                </div>
                <p className="mt-2 max-w-[74ch] text-sm leading-relaxed text-white/70">{m.w}</p>
                <p className="mt-2 text-[11px] text-white/35">Aus: {m.q}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function GespraechsAnsicht(p: { g: Gespraech; module: number }) {
  const dreiZahlen = p.g.dreiZahlen
  const phase1 = p.g.phase1
  const phase1Punkte = p.g.phase1Punkte

  return (
    <div className="mt-8">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kachel k="Dauer" v="30" zusatz="min" sub="plus 10 Minuten Puffer" />
        <Kachel k="Ziel des Gesprächs" v="1" sub="Entscheidung über Phase 1 — nicht mehr" />
        <Kachel k="Zahlen im Gespräch" v={String(p.g.zahlenMitQuelle)} sub="alle mit Quelle und Datum" />
      </div>

      <section className="mt-6 rounded-[18px] border border-white/12 bg-white/[0.03] p-6">
        <h2 className="display text-[1.2rem] text-white">Der Minutenplan</h2>
        <p className="mt-1 text-sm text-white/50">
          Wer die Reihenfolge einhält, muss nicht überzeugen — die Zahlen tun es.
        </p>

        <Block zeit="0 – 3 min" titel="Ankommen und Rahmen setzen"
          hinweis="Kein Smalltalk über das Wetter. Sagen Sie, was gleich passiert und wie lange es dauert. Der Sachverständige soll wissen, dass er nichts kaufen muss.">
          <Sag>
            Ich habe Ihr Umfeld gemessen — {p.module} Module, alles öffentlich zugängliche Daten. Ich
            gehe die drei wichtigsten Zahlen mit Ihnen durch, dann sage ich Ihnen, was ich an Ihrer
            Stelle zuerst machen würde. Dreißig Minuten. Am Ende bekommen Sie den Plan, egal wie Sie
            sich entscheiden.
          </Sag>
        </Block>

        <Block zeit="3 – 8 min" titel="Die Lage — ohne Wertung"
          hinweis={'Erst das Feld, dann seine Position. Nie umgekehrt: Wer mit „Sie sind auf Platz 38“ anfängt, bekommt sofort eine Rechtfertigung statt eines Gesprächs.'}>
          <Sag>{p.g.lage}</Sag>
        </Block>

        <Block zeit="8 – 18 min" titel="Die drei Zahlen, die zählen"
          hinweis="Nicht alle Befunde. Drei. Nach jeder Zahl eine Frage stellen und die Antwort abwarten — das ist der Teil, in dem Sie erfahren, was er wirklich braucht.">
          {dreiZahlen.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">
              Mit der aktuellen Modulauswahl bleibt keine Zahl übrig. Wählen Sie oben Module hinzu.
            </p>
          ) : (
            dreiZahlen.map((z) => (
              <div key={z.schluessel} className="mt-4 rounded-[12px] border border-white/12 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                  <span className="text-white">{z.label}</span>
                  <span className="text-sm text-white/55">{z.wert} · {z.luecke} Punkte liegen brach</span>
                </div>
                {z.einordnung && <p className="mt-1.5 text-sm leading-relaxed text-white/65">{z.einordnung}</p>}
                <p className="mt-1 text-[11px] text-white/35">Quelle: {z.quelle}</p>
                <div className="mt-3 rounded-[0_10px_10px_0] border-l-[3px] border-warn bg-warn/[0.08] px-4 py-3 text-sm">
                  <b className="block text-white/85">Wahrscheinlicher Einwand</b>
                  <span className="mt-1 block text-white/70">{z.einwand}</span>
                  <b className="mt-2.5 block text-white/85">Ihre Antwort</b>
                  <span className="mt-1 block leading-relaxed text-white/70">{z.antwort}</span>
                </div>
              </div>
            ))
          )}
        </Block>

        <Block zeit="18 – 25 min" titel="Der Plan — nur Phase 1"
          hinweis="Zeigen Sie nicht alle Maßnahmen. Zeigen Sie die erste Phase und sagen Sie, was sie bringt und was sie kostet. Der Rest kommt im Plan, den er mitbekommt.">
          {phase1.length === 0 ? (
            <p className="mt-3 text-sm text-white/50">Keine Maßnahmen in Phase 1.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {phase1.map((m, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 rounded-[10px] bg-white/[0.04] px-4 py-2.5 text-sm">
                  <span className="text-white/85">{m.t}</span>
                  <span className="text-white/50">+{m.p} · {m.a}</span>
                </li>
              ))}
            </ul>
          )}
          {phase1.length > 0 && (
            <p className="mt-3 text-sm text-white/60">
              Zusammen {phase1Punkte} Punkte in etwa {p.g.phase1Dauer}.
            </p>
          )}
        </Block>

        <Block zeit="25 – 30 min" titel="Die Entscheidung"
          hinweis="Eine Frage, kein Angebotspaket. Wer nein sagt, bekommt trotzdem den Plan — und ruft in vier Monaten von selbst an, wenn die Zahlen sich nicht bewegt haben.">
          <Sag>
            Sie haben jetzt zwei Wege. Entweder Sie machen Phase 1 selbst — der Plan reicht dafür,
            alles steht drin. Oder wir machen sie zusammen, dann sind Sie in {p.g.phase1Dauer} durch
            statt in drei Monaten. Was ist Ihnen lieber?
          </Sag>
          <div className="mt-3 rounded-[0_10px_10px_0] border-l-[3px] border-warn bg-warn/[0.08] px-4 py-3 text-sm">
            <b className="block text-white/85">Wenn er zögert</b>
            <span className="mt-1 block leading-relaxed text-white/70">
              Nicht nachlegen. Fragen Sie: „Was müsste passieren, damit es sich für Sie lohnt?“ — die
              Antwort ist entweder ein echter Einwand, den Sie ausräumen können, oder ein Nein, das
              Sie akzeptieren.
            </span>
          </div>
        </Block>
      </section>
    </div>
  )
}

function Kachel({ k, v, zusatz, sub }: { k: string; v: string; zusatz?: string; sub: string }) {
  return (
    <div className="rounded-[14px] border border-white/12 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wider text-white/40">{k}</p>
      <p className="display mt-1 text-[2rem] text-white">
        {v}
        {zusatz && <span className="text-[0.42em] font-semibold text-white/50"> {zusatz}</span>}
      </p>
      <p className="mt-0.5 text-xs text-white/45">{sub}</p>
    </div>
  )
}

function Block({ zeit, titel, hinweis, children }: {
  zeit: string; titel: string; hinweis: string; children: React.ReactNode
}) {
  return (
    <div className="mt-6 grid gap-4 border-t border-white/8 pt-5 sm:grid-cols-[7rem_1fr]">
      <div className="text-sm text-signal">{zeit}</div>
      <div>
        <h4 className="text-white">{titel}</h4>
        <p className="mt-1 max-w-[72ch] text-sm leading-relaxed text-white/55">{hinweis}</p>
        {children}
      </div>
    </div>
  )
}

function Sag({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-[10px] border-l-[3px] border-signal bg-signal/[0.07] px-4 py-3 text-sm leading-relaxed text-white/85">
      {children}
    </div>
  )
}
