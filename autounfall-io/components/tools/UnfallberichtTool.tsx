'use client'

import { useEffect, useRef, useState } from 'react'
import { trackToolComplete } from '@/lib/track'

// Interaktiver Unfallbericht · 1:1 portiert aus assets-autounfall/unfallbericht-widget.js.
// EU-Unfallbericht-Formular mit Feld-Anleitung + Druck/PDF (window.print). State
// in localStorage 'au-unfallbericht-v1' · KEIN Backend (rein lokal, §3 Datenschutz).
// Print-Isolierung per komponenten-lokalem @media-print-Style (nur auf dieser Route
// im DOM, betrifft keine andere Seite).

const STORAGE_KEY = 'au-unfallbericht-v1'

// Hergang-Optionen (an EU-Unfallbericht angelehnt, vereinfacht) — Reihenfolge 1:1.
const HERGANG = [
  'parkte / hielt am Fahrbahnrand',
  'verließ einen Parkplatz / eine Grundstücksausfahrt',
  'fuhr in einen Parkplatz / eine Grundstücksausfahrt',
  'fuhr in einen Kreisverkehr ein',
  'fuhr im Kreisverkehr',
  'fuhr hinten auf (gleiche Richtung, gleiche Spur)',
  'fuhr in gleicher Richtung auf anderer Spur',
  'wechselte die Fahrspur',
  'überholte',
  'bog rechts ab',
  'bog links ab',
  'setzte zurück',
  'missachtete die Vorfahrt / ein Verkehrszeichen',
  'öffnete eine Fahrzeugtür',
]

const PRINT_CSS = `
@media print {
  body * { visibility: hidden !important; }
  #auub-report, #auub-report * { visibility: visible !important; }
  #auub-report { display: block !important; position: absolute; left: 0; top: 0; width: 100%; padding: 8mm; }
  .auub-noprint { display: none !important; }
}`

type FormState = Record<string, string | boolean>

const labelCls =
  'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wide text-au-ink-soft'
const inputCls =
  'w-full box-border rounded-[10px] border-[1.5px] border-au-sand-dark bg-au-surface px-3 py-2.5 text-[15px] text-au-ink focus-visible:border-au-amber-dark focus-visible:outline-2 focus-visible:outline-au-amber-dark'

export function UnfallberichtTool() {
  const [s, setS] = useState<FormState>({})
  const [showReport, setShowReport] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const reportRef = useRef<HTMLDivElement>(null)

  // localStorage erst nach Mount (kein Hydration-Mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setS(JSON.parse(raw) as FormState)
    } catch {
      /* ignore */
    }
  }, [])

  function update(next: FormState, msg?: string) {
    setS(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
    if (msg !== undefined) setSavedMsg(msg)
  }

  const setText = (k: string, v: string) =>
    update({ ...s, [k]: v }, `Automatisch gespeichert · ${new Date().toLocaleTimeString('de-DE')}`)
  const setCheck = (k: string, v: boolean) =>
    update({ ...s, [k]: v }, `Automatisch gespeichert · ${new Date().toLocaleTimeString('de-DE')}`)

  function reset() {
    if (!window.confirm('Alle Eingaben löschen?')) return
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setS({})
    setShowReport(false)
    setSavedMsg('')
  }

  function printReport() {
    update(s, 'Bericht erzeugt.')
    setShowReport(true)
    trackToolComplete('unfallbericht')
    // Nach Render scrollen + drucken (wie Vorlage: setTimeout 250 ms).
    setTimeout(() => {
      reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.print()
    }, 250)
  }

  const str = (k: string) => (typeof s[k] === 'string' ? (s[k] as string) : '')
  const bool = (k: string) => s[k] === true

  function Field({
    name,
    label,
    hint,
    type = 'text',
    textarea,
  }: {
    name: string
    label: string
    hint?: string
    type?: string
    textarea?: boolean
  }) {
    return (
      <div className="flex flex-col">
        <label htmlFor={`auub-${name}`} className={labelCls}>
          {label}
        </label>
        {textarea ? (
          <textarea
            id={`auub-${name}`}
            rows={2}
            placeholder={hint}
            className={inputCls}
            value={str(name)}
            onChange={(e) => setText(name, e.target.value)}
          />
        ) : (
          <input
            id={`auub-${name}`}
            type={type}
            placeholder={hint}
            className={inputCls}
            value={str(name)}
            onChange={(e) => setText(name, e.target.value)}
          />
        )}
      </div>
    )
  }

  function VehicleCol({ side, title }: { side: 'a' | 'b'; title: string }) {
    return (
      <div>
        <h4 className="mb-2 border-b-2 border-au-amber-dark pb-1 font-mono text-[11px] font-bold uppercase tracking-wider text-au-amber-dark">
          {title}
        </h4>
        <div className="flex flex-col gap-3">
          <Field name={`${side}_halter`} label="Halter / Fahrer" hint="Vor- und Nachname" />
          <Field name={`${side}_kennz`} label="Kennzeichen" hint="z. B. K-AB 1234" />
          <Field name={`${side}_fzg`} label="Fahrzeug" hint="Marke, Modell" />
          <Field name={`${side}_vers`} label="Haftpflicht-Versicherung" hint="Versicherer" />
          <Field name={`${side}_schein`} label="Versicherungsschein-Nr." hint="falls bekannt" />
        </div>
        <div className="mb-1 mt-2.5 text-[13px] font-bold text-au-ink">
          Hergang (Zutreffendes ankreuzen)
        </div>
        <div className="flex flex-col">
          {HERGANG.map((h, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-2.5 py-1.5 text-sm text-au-ink">
              <input
                type="checkbox"
                checked={bool(`${side}_h${i}`)}
                onChange={(e) => setCheck(`${side}_h${i}`, e.target.checked)}
                className="mt-0.5 h-[17px] w-[17px] shrink-0 accent-au-amber-dark"
              />
              <span>{h}</span>
            </label>
          ))}
        </div>
        <div className="mt-2">
          <Field name={`${side}_schaden`} label="Sichtbare Schäden" hint="kurz beschreiben" textarea />
        </div>
      </div>
    )
  }

  const hergangOf = (side: 'a' | 'b') => {
    const out = HERGANG.filter((_, i) => bool(`${side}_h${i}`))
    return out.length ? out.join('; ') : '—'
  }

  const VehicleReportTable = ({ side }: { side: 'a' | 'b' }) => (
    <table className="my-2.5 w-full border-collapse text-[13px]">
      <tbody>
        {[
          ['Halter / Fahrer', str(`${side}_halter`)],
          ['Kennzeichen', str(`${side}_kennz`)],
          ['Fahrzeug', str(`${side}_fzg`)],
          ['Versicherung', str(`${side}_vers`)],
          ['Schein-Nr.', str(`${side}_schein`)],
          ['Hergang', hergangOf(side)],
          ['Sichtbare Schäden', str(`${side}_schaden`)],
        ].map(([k, v]) => (
          <tr key={k}>
            <th className="w-[34%] border border-au-ink/30 bg-au-paper p-[7px] text-left align-top font-bold text-au-ink">
              {k}
            </th>
            <td className="border border-au-ink/30 p-[7px] text-left align-top text-au-ink">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="font-body text-au-ink">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="auub-noprint">
        <div className="mb-3.5 rounded-[10px] border border-au-amber-light bg-au-amber-light/30 p-3.5 text-[13px] leading-relaxed text-au-amber-dark">
          <strong>Wichtig:</strong> Der Unfallbericht hält nur den Hergang fest — er ist{' '}
          <strong>kein Schuldanerkenntnis</strong>. Unterschreiben Sie nichts, was eine Schuld zugibt.
          Bei Verletzten oder Streit: Polizei rufen. Daten bleiben nur lokal auf Ihrem Gerät.
        </div>

        <section className="mb-4 rounded-2xl border border-au-sand-dark bg-au-surface p-[18px]">
          <h3 className="mb-0.5 font-display text-[19px] font-bold text-au-ink">1 · Unfall-Eckdaten</h3>
          <p className="mb-3 text-[13px] leading-relaxed text-au-ink-soft">
            Wann und wo ist es passiert? So genau wie möglich.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="datum" label="Datum" type="date" />
            <Field name="zeit" label="Uhrzeit" type="time" />
            <Field name="ort" label="Ort / Straße" hint="Straße, PLZ, Ort" />
            <Field name="land" label="Land" hint="Deutschland" />
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-au-sand-dark bg-au-surface p-[18px]">
          <h3 className="mb-0.5 font-display text-[19px] font-bold text-au-ink">2 · Beteiligte Fahrzeuge</h3>
          <p className="mb-3 text-[13px] leading-relaxed text-au-ink-soft">
            Fahrzeug A ist üblicherweise Ihres. Versicherungsdaten finden Sie auf der eVB- bzw.
            Versicherungskarte.
          </p>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <VehicleCol side="a" title="Fahrzeug A (Sie)" />
            <VehicleCol side="b" title="Fahrzeug B (Gegner)" />
          </div>
        </section>

        <section className="mb-4 rounded-2xl border border-au-sand-dark bg-au-surface p-[18px]">
          <h3 className="mb-0.5 font-display text-[19px] font-bold text-au-ink">3 · Zeugen &amp; Bemerkungen</h3>
          <p className="mb-3 text-[13px] leading-relaxed text-au-ink-soft">
            Zeugen sind Gold wert. Notieren Sie Name und Kontakt, solange sie vor Ort sind.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field name="zeuge_name" label="Zeuge — Name" hint="Vor- und Nachname" />
            <Field name="zeuge_kontakt" label="Zeuge — Kontakt" hint="Telefon / E-Mail" />
          </div>
          <div className="mt-3">
            <Field
              name="bemerkung"
              label="Bemerkungen"
              hint="z. B. Witterung, Lichtverhältnisse, Skizze separat"
              textarea
            />
          </div>
        </section>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={printReport}
            className="inline-flex items-center gap-2 rounded-xl bg-au-ink px-5 py-3 text-[15px] font-bold text-au-surface transition-colors hover:bg-au-amber-dark"
          >
            Bericht anzeigen &amp; drucken / PDF
          </button>
          <button
            type="button"
            onClick={() => update(s, `Gespeichert · ${new Date().toLocaleTimeString('de-DE')}`)}
            className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-au-sand-dark bg-au-surface px-5 py-3 text-[15px] font-bold text-au-ink"
          >
            Zwischenspeichern
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-au-sand-dark bg-au-surface px-5 py-3 text-[15px] font-bold text-au-ink"
          >
            Zurücksetzen
          </button>
        </div>
        <p className="mt-2 font-mono text-xs text-au-ink-soft" aria-live="polite">
          {savedMsg}
        </p>
      </div>

      {/* Druck-/Bildschirm-Bericht (im Normalfall versteckt, bei Druck isoliert sichtbar). */}
      <div
        id="auub-report"
        ref={reportRef}
        aria-live="polite"
        className={showReport ? 'mt-8 block' : 'hidden'}
      >
        <h2 className="mb-1 font-display text-[22px] text-au-ink">Unfallbericht</h2>
        <p className="mb-3.5 text-xs text-au-ink-soft">
          Erstellt mit autounfall.io · {str('datum')}
          {str('zeit') ? ` ${str('zeit')}` : ''} · {str('ort')}
          {str('land') ? `, ${str('land')}` : ''}
        </p>
        <div className="grid grid-cols-1 gap-[18px] sm:grid-cols-2">
          <div>
            <h4 className="mb-1 font-display text-au-amber-dark">Fahrzeug A</h4>
            <VehicleReportTable side="a" />
          </div>
          <div>
            <h4 className="mb-1 font-display text-au-amber-dark">Fahrzeug B</h4>
            <VehicleReportTable side="b" />
          </div>
        </div>
        <table className="my-2.5 w-full border-collapse text-[13px]">
          <tbody>
            <tr>
              <th className="w-[34%] border border-au-ink/30 bg-au-paper p-[7px] text-left align-top font-bold text-au-ink">
                Zeuge
              </th>
              <td className="border border-au-ink/30 p-[7px] text-left align-top text-au-ink">
                {str('zeuge_name')}
                {str('zeuge_kontakt') ? ` (${str('zeuge_kontakt')})` : ''}
              </td>
            </tr>
            <tr>
              <th className="w-[34%] border border-au-ink/30 bg-au-paper p-[7px] text-left align-top font-bold text-au-ink">
                Bemerkungen
              </th>
              <td className="border border-au-ink/30 p-[7px] text-left align-top text-au-ink">
                {str('bemerkung')}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2.5 text-xs text-au-ink-soft">
          Dieser Bericht dokumentiert den Hergang und ist <strong>kein Schuldanerkenntnis</strong>.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-[30px]">
          <div className="border-t border-au-ink pt-1.5 text-xs text-au-ink-soft">
            Unterschrift Fahrzeug A
          </div>
          <div className="border-t border-au-ink pt-1.5 text-xs text-au-ink-soft">
            Unterschrift Fahrzeug B
          </div>
        </div>
      </div>
    </div>
  )
}
