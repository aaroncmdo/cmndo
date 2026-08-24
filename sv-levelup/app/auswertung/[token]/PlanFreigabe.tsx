'use client'

import { useState } from 'react'
import { planFreigeben, planZurueckziehen } from './actions'

export type PlanStand = {
  token: string
  gueltigBis: string
  widerrufenAm: string | null
  aufrufe: number
  letzterAufruf: string | null
  /**
   * ⚠ Vom SERVER berechnet, nicht hier. `Date.now()` waehrend des Renders ist
   * nicht deterministisch: Server und Browser sehen verschiedene Zeitpunkte,
   * und die Hydration bricht. Die neue Lint-Regel „Cannot call impure function
   * during render" hat es gefangen — der Build lief vorher gruen durch.
   */
  abgelaufen: boolean
} | null

/**
 * Freigabe des Plans, den der Sachverstaendige bekommt.
 *
 * ⚠ Die Aufrufzahl steht sichtbar dabei. Sie ist die einzige Rueckmeldung
 * darueber, ob der Plan ueberhaupt angesehen wurde — im Protokoll waere sie
 * fuer den, der sie braucht, nicht auffindbar.
 */
export function PlanFreigabe(p: {
  checkId: string
  auswertungsToken: string
  stand: PlanStand
  basis: string
}) {
  const [stand, setStand] = useState<PlanStand>(p.stand)
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [kopiert, setKopiert] = useState(false)

  const abgelaufen = stand?.abgelaufen ?? false
  const tot = !stand || Boolean(stand.widerrufenAm) || abgelaufen
  const adresse = stand ? `${p.basis}/plan/${stand.token}` : ''

  async function freigeben() {
    setLaeuft(true); setFehler(null)
    const r = await planFreigeben(p.checkId, p.auswertungsToken)
    setLaeuft(false)
    if (!r.ok) { setFehler(r.error); return }
    setStand({
      token: r.token, gueltigBis: r.gueltigBis, widerrufenAm: null,
      aufrufe: 0, letzterAufruf: null, abgelaufen: false,
    })
  }

  async function zurueckziehen() {
    if (!stand) return
    setLaeuft(true); setFehler(null)
    const r = await planZurueckziehen(stand.token, p.auswertungsToken)
    setLaeuft(false)
    if (!r.ok) { setFehler(r.error ?? 'Nicht zurückgezogen.'); return }
    setStand({ ...stand, widerrufenAm: new Date().toISOString() })
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(adresse)
      setKopiert(true)
      setTimeout(() => setKopiert(false), 2000)
    } catch {
      // Ohne Zwischenablage-Recht bleibt die Adresse lesbar daneben stehen.
      setFehler('Die Adresse ließ sich nicht kopieren — bitte von Hand markieren.')
    }
  }

  return (
    <section className="mt-10 rounded-[18px] border border-white/12 bg-white/[0.03] p-6">
      <h3 className="display text-[1.1rem] text-white">Plan freigeben</h3>
      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-white/65">
        Der Sachverständige bekommt Befund und Maßnahmenplan — ohne Gesprächsleitfaden, ohne
        Einwände. Der Link gilt 30 Tage und lässt sich jederzeit zurückziehen.
      </p>

      {tot ? (
        <>
          {stand?.widerrufenAm && (
            <p className="mt-4 text-sm text-white/55">
              Zurückgezogen am {new Date(stand.widerrufenAm).toLocaleDateString('de-DE')}
              {stand.aufrufe > 0 && ` · vorher ${stand.aufrufe}-mal geöffnet`}
            </p>
          )}
          {stand && !stand.widerrufenAm && abgelaufen && (
            <p className="mt-4 text-sm text-white/55">
              Der bisherige Link ist abgelaufen
              {stand.aufrufe > 0 && ` · ${stand.aufrufe}-mal geöffnet`}
            </p>
          )}
          <button
            type="button"
            onClick={freigeben}
            disabled={laeuft}
            className="display mt-4 rounded-[12px] bg-signal px-6 py-2.5 text-sm text-white transition hover:bg-signal-tief disabled:opacity-60"
          >
            {laeuft ? 'Einen Moment …' : stand ? 'Neu freigeben' : 'Plan freigeben'}
          </button>
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="flex-1 break-all rounded-[10px] bg-nacht px-4 py-2.5 text-sm text-white/85">
              {adresse}
            </code>
            <button
              type="button"
              onClick={kopieren}
              className="rounded-[10px] border border-white/25 px-4 py-2.5 text-sm text-white transition hover:border-signal"
            >
              {kopiert ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>

          <p className="mt-3 text-sm text-white/55">
            Gültig bis {new Date(stand.gueltigBis).toLocaleDateString('de-DE')} ·{' '}
            {stand.aufrufe === 0
              ? 'noch nicht geöffnet'
              : `${stand.aufrufe}-mal geöffnet${
                  stand.letzterAufruf
                    ? `, zuletzt am ${new Date(stand.letzterAufruf).toLocaleDateString('de-DE')}`
                    : ''
                }`}
          </p>

          <button
            type="button"
            onClick={zurueckziehen}
            disabled={laeuft}
            className="mt-4 text-sm text-white/45 underline underline-offset-4 transition hover:text-critical disabled:opacity-60"
          >
            {laeuft ? 'Einen Moment …' : 'Zurückziehen'}
          </button>
        </>
      )}

      {fehler && <p role="alert" className="mt-3 text-sm text-critical">{fehler}</p>}
    </section>
  )
}
