import { createAdminClient } from '@/lib/supabase/admin'
import { ladeCheck } from '@/lib/levelup/check'
import { leiteAb } from '@/lib/levelup/massnahmen'
import { pruefePlanlink, vermerkeAufruf } from '@/lib/levelup/praesentation'
import { modulNachId, type ModulId } from '@/lib/levelup/registry'
import type { ModulErgebnis } from '@/lib/levelup/messmaschine'
import type { Befund, Fehlstelle } from '@/lib/levelup/modul-vertrag'
import type { Db } from '@/lib/anreicherung/schreiben'

import type { Metadata } from 'next'

/**
 * ⚠ NICHT INDEXIEREN. Diese Seite traegt Befund und Massnahmenplan eines namentlich genannten
 * Betriebs und ist nur durch einen Token geschuetzt. Ein geteilter Link genuegt
 * sonst, damit ein fremder Befund in der Suche auftaucht.
 *
 * Zweite Ebene neben `app/robots.ts`: eine robots.txt ist eine Bitte, dieser
 * Kopf ist eine Anweisung. Beide zusammen, weil die eine ausfallen kann.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

/**
 * ⚠ Kein Zwischenspeicher. Der Aufrufzaehler und vor allem der WIDERRUF
 * muessen sofort greifen — ein zwischengespeicherter Plan bliebe nach dem
 * Zurueckziehen weiter abrufbar.
 */
export const dynamic = 'force-dynamic'

const AMPEL: Record<string, string> = {
  gruen: 'bg-good',
  gelb: 'bg-warning',
  rot: 'bg-critical',
  offen: 'bg-linie-stark',
}

export default async function PlanSeite(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params
  const db = createAdminClient() as unknown as Db
  const jetzt = new Date()

  const pruefung = await pruefePlanlink(db, token, jetzt)
  if (!pruefung.ok) return <Abgelehnt grund={pruefung.grund} />

  const { data: checkZeile } = await db
    .from('levelup_checks')
    .select('token')
    .eq('id', pruefung.checkId)
    .maybeSingle()

  const check = checkZeile ? await ladeCheck(db, (checkZeile as { token: string }).token) : null
  if (!check) return <Abgelehnt grund="unbekannt" />

  await vermerkeAufruf(db, token, pruefung.aufrufe, jetzt)

  const befunde = (check.befunde ?? {}) as Record<string, ModulErgebnis>
  const fehlstellen = (check.fehlstellen ?? {}) as Record<string, Fehlstelle[]>
  const massnahmen = leiteAb(befunde)
  const phasen = [1, 2, 3].map((nr) => ({ nr, liste: massnahmen.filter((m) => m.ph === nr) }))

  const modulIds = [...new Set([...Object.keys(befunde), ...Object.keys(fehlstellen)])] as ModulId[]

  return (
    <main className="min-h-dvh bg-flaeche text-ink">
      <div className="mx-auto max-w-[900px] px-6 py-14">
        <p className="display text-sm tracking-[0.16em] text-signal">Ihr Maßnahmenplan</p>
        <h1 className="display mt-2" style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)' }}>
          {check.firmenname ?? 'Ihr Büro'}
        </h1>
        <p className="mt-2 text-muted">
          {check.standort_ort ?? ''}
          {check.erhoben_am && ` · gemessen am ${new Date(check.erhoben_am).toLocaleDateString('de-DE')}`}
        </p>

        <div className="mt-8 rounded-[18px] border border-linie bg-white p-6">
          <p className="text-xs uppercase tracking-wider text-muted">Ergebnis</p>
          <p className="display mt-1" style={{ fontSize: 'clamp(1.8rem, 3.6vw, 2.4rem)' }}>
            {check.kein_score || check.score === null ? 'Teilbefund' : `${check.score} von 100`}
          </p>
          <p className="mt-2 max-w-[64ch] leading-relaxed">
            {check.kein_score
              ? `Es waren ${check.punkte_erhebbar ?? 0} Punkte erhebbar — zu wenig für einen belastbaren Gesamtwert. Die einzelnen Befunde unten stehen trotzdem, jeder mit Quelle und Datum.`
              : 'Jede Zahl unten ist gemessen und nennt, woher sie stammt. Was sich nicht messen ließ, steht als solches da — und nicht als Null.'}
          </p>
        </div>

        {/* Befunde je Modul */}
        {modulIds.map((id) => {
          const modul = befunde[id]
          const luecken = fehlstellen[id] ?? []
          return (
            <section key={id} className="mt-6 rounded-[18px] border border-linie bg-white p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="display text-[1.15rem]">{modulNachId(id)?.titel ?? id}</h2>
                {modul && modul.maxPunkte > 0 && (
                  <span className="text-sm text-muted">
                    {modul.istPunkte} von {modul.maxPunkte} Punkten
                  </span>
                )}
              </div>

              {(modul?.befunde ?? []).map((b) => <BefundZeile key={b.schluessel} b={b} />)}

              {luecken.map((f, i) => (
                <p key={`${f.schluessel}-${i}`} className="mt-3 rounded-[10px] bg-linie/40 px-3 py-2 text-sm">
                  <span className="text-muted">Nicht erhoben — </span>
                  {f.grund}
                </p>
              ))}
            </section>
          )
        })}

        {/* Maßnahmen */}
        {massnahmen.length > 0 && (
          <div className="mt-12">
            <h2 className="display" style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>
              {massnahmen.length} Schritte, {massnahmen.reduce((s, m) => s + m.p, 0)} erreichbare Punkte
            </h2>
            <p className="mt-2 max-w-[64ch] leading-relaxed">
              In dieser Reihenfolge: was viel bringt und wenig kostet, steht vorn. Sie können jeden
              Schritt selbst gehen — alles, was dafür nötig ist, steht dabei.
            </p>

            {phasen.filter((ph) => ph.liste.length > 0).map((ph) => (
              <div key={ph.nr} className="mt-8">
                <h3 className="display text-sm tracking-[0.16em] text-muted">
                  Phase {ph.nr}
                  <span className="ml-3 font-normal tracking-normal">
                    {ph.liste.length} {ph.liste.length === 1 ? 'Schritt' : 'Schritte'} ·{' '}
                    {ph.liste.reduce((s, m) => s + m.p, 0)} Punkte
                  </span>
                </h3>
                <ol className="mt-3 space-y-3">
                  {ph.liste.map((m, i) => (
                    <li key={`${ph.nr}-${i}`} className="rounded-[14px] border border-linie bg-white p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <span className="font-medium">{m.t}</span>
                        <span className="text-sm text-muted">
                          +{m.p} {m.p === 1 ? 'Punkt' : 'Punkte'} · {m.a} · Wirkung {m.wi}
                        </span>
                      </div>
                      <p className="mt-2 max-w-[70ch] text-sm leading-relaxed">{m.w}</p>
                      <p className="mt-2 text-[11px] text-muted">Aus: {m.q}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}

        <footer className="mt-14 border-t border-linie pt-6 text-sm text-muted">
          <p className="max-w-[64ch] leading-relaxed">
            Fragen zu einem der Schritte? Melden Sie sich einfach — wir gehen das gemeinsam durch.
          </p>
          <p className="mt-3">
            Dieser Plan ist bis zum{' '}
            {new Date(pruefung.gueltigBis).toLocaleDateString('de-DE')} abrufbar.
          </p>
        </footer>
      </div>
    </main>
  )
}

function BefundZeile({ b }: { b: Befund }) {
  const offen = b.wert === null
  return (
    <div className="mt-4 border-t border-linie pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${AMPEL[b.ampel] ?? 'bg-linie-stark'}`} />
          {b.label}
        </span>
        <span className="text-sm text-muted">
          {offen ? 'nicht erhoben' : String(b.wert)}
          {b.maximum > 0 && ` · ${b.punkte}/${b.maximum}`}
        </span>
      </div>
      {(b.einordnung || b.grund) && (
        <p className="mt-1.5 max-w-[72ch] text-sm leading-relaxed">{b.einordnung ?? b.grund}</p>
      )}
      {/* R-A: Herkunft und Zeitpunkt gehoeren an jede Zahl — auch hier. */}
      <p className="mt-1 text-[11px] text-muted">
        {b.quelle} · {new Date(b.erhoben).toLocaleDateString('de-DE')}
      </p>
    </div>
  )
}

/**
 * Der Link geht nicht (mehr) auf.
 *
 * ⚠ Der Grund wird benannt, aber nur so weit, wie er dem Empfaenger hilft:
 * „abgelaufen" laedt zum Nachfragen ein, „zurueckgezogen" sagt, dass Nachfragen
 * nichts aendert. Ein unbekannter Token bekommt dieselbe Antwort wie ein
 * ungueltiger — sonst waere die Seite ein Orakel zum Erraten gueltiger Links.
 */
function Abgelehnt({ grund }: { grund: 'unbekannt' | 'abgelaufen' | 'widerrufen' }) {
  const texte = {
    unbekannt: {
      titel: 'Dieser Link führt ins Leere',
      text: 'Bitte prüfen Sie, ob die Adresse vollständig kopiert wurde. Falls ja, fragen Sie einfach nach einem neuen Link.',
    },
    abgelaufen: {
      titel: 'Dieser Plan ist abgelaufen',
      text: 'Pläne sind 30 Tage abrufbar. Melden Sie sich kurz, dann bekommen Sie einen neuen Link — die Messung dahinter ist noch da.',
    },
    widerrufen: {
      titel: 'Dieser Plan wurde zurückgezogen',
      text: 'Der Link ist nicht mehr gültig. Wenn Sie den Plan noch brauchen, sprechen Sie uns an.',
    },
  }[grund]

  return (
    <main className="min-h-dvh bg-flaeche text-ink">
      <div className="mx-auto max-w-[560px] px-6 py-24">
        <p className="display text-sm tracking-[0.16em] text-signal">SV-LevelUp</p>
        <h1 className="display mt-3 text-[1.8rem]">{texte.titel}</h1>
        <p className="mt-4 leading-relaxed">{texte.text}</p>
      </div>
    </main>
  )
}
