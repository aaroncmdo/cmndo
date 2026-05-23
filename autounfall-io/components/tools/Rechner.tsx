'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NUTZ, SCHMERZ, bsOf, rueckOf, eur } from '@/lib/tools/rechner-data'
import { trackToolComplete } from '@/lib/track'

// 6-in-1 Köder-Rechner · 1:1 portiert aus assets-autounfall/au-rechner.js.
// Felder = idiomatisches React (controlled), Ergebnis = exakt der HTML-String der
// Vorlage (dangerouslySetInnerHTML) → die Beträge/Texte bleiben verifizierbar
// byte-identisch. <b>/<span class="aur-note"> werden per Tailwind-Variant gestylt
// (kein globals.css-Eingriff). KEINE localStorage (Quelle ist zustandslos).

export type RechnerType =
  | 'nutzungsausfall'
  | 'schmerzensgeld'
  | 'sf'
  | 'totalschaden'
  | 'wertminderung'
  | 'verzugszinsen'

type CtaKind = 'gutachter' | 'anwalt' | null

type FieldDef = {
  key: string
  label: string
  kind: 'number' | 'select'
  placeholder?: string
  min?: number
  max?: number
  step?: string
  /** Halbe Breite (2-Spalten-Grid) statt voll. */
  half?: boolean
  options?: { value: string; label: string }[]
}

const NUTZ_OPTS = Object.keys(NUTZ).map((k) => ({ value: k, label: `Klasse ${k}` }))
const SCHMERZ_OPTS = Object.keys(SCHMERZ).map((k) => ({ value: k, label: k }))

type RechnerConfig = {
  title: string
  intro: string
  fields: FieldDef[]
  cta: CtaKind
  defaults?: Record<string, string>
  compute: (s: Record<string, string>) => string | null
}

const num = (v: string | undefined) => Number(v ?? '')

const CONFIG: Record<RechnerType, RechnerConfig> = {
  nutzungsausfall: {
    title: 'Nutzungsausfall schätzen',
    intro: 'Pauschale nach Fahrzeugklasse (Sanden-Danner-Größenordnung). §249 BGB / §287 ZPO.',
    fields: [
      { key: 'k', label: 'Fahrzeugklasse', kind: 'select', half: true, options: NUTZ_OPTS },
      { key: 't', label: 'Ausfalltage', kind: 'number', half: true, min: 1, placeholder: '14' },
    ],
    cta: 'gutachter',
    compute: (s) => {
      const kv = s.k
      const tv = num(s.t)
      if (!kv || !tv) return null
      const r = NUTZ[kv]
      return (
        `Geschätzt: <b>${eur(r[0] * tv)}–${eur(r[1] * tv)} €</b> (${r[0]}–${r[1]} €/Tag × ${tv} Tage).` +
        `<span class="aur-note">Richtwert — exakte Klasse + Tage aus dem Gutachten.</span>`
      )
    },
  },
  schmerzensgeld: {
    title: 'Schmerzensgeld einordnen',
    intro: 'Größenordnung je Verletzung — Einzelfall weicht stark ab. §253 BGB.',
    fields: [{ key: 'v', label: 'Verletzung', kind: 'select', options: SCHMERZ_OPTS }],
    cta: 'anwalt',
    compute: (s) => {
      if (!s.v) return null
      const r = SCHMERZ[s.v]
      return (
        `Größenordnung: <b>${eur(r[0])}–${eur(r[1])} €</b>.` +
        `<span class="aur-note">Grobe Orientierung, kein Anspruch — Höhe bestimmt der Einzelfall (Anwalt).</span>`
      )
    },
  },
  sf: {
    title: 'SF-Rückstufung: selbst zahlen oder Versicherung?',
    intro: 'Grobe Orientierung — Rückstufung ist versichererabhängig.',
    fields: [
      { key: 'sf', label: 'Aktuelle SF-Klasse', kind: 'number', half: true, min: 0, max: 35, placeholder: '20' },
      { key: 'be', label: 'Jahresbeitrag €', kind: 'number', half: true, min: 0, placeholder: '320' },
      { key: 'sch', label: 'Schadenshöhe €', kind: 'number', min: 0, placeholder: '700' },
    ],
    cta: null,
    compute: (s) => {
      const sfv = num(s.sf)
      const b = num(s.be)
      const sch = num(s.sch)
      if (!sfv || !b || !sch) return null
      const sn = rueckOf(sfv)
      const bn = b * (bsOf(sn) / bsOf(sfv))
      const j = Math.max(1, sfv - sn)
      const d = bn - b
      const lo = Math.round((d * j * 0.5) / 10) * 10
      const hi = Math.round((d * j) / 10) * 10
      const rec =
        sch < lo
          ? 'Tendenz: <b>selbst zahlen</b> — der Schaden liegt unter dem geschätzten Mehrbeitrag.'
          : sch > hi * 1.2
            ? 'Tendenz: <b>Versicherung nutzen</b> — der Schaden übersteigt den Mehrbeitrag deutlich.'
            : '<b>Grenzfall</b> — beim Versicherer den genauen Wiederaufstiegs-Effekt anfragen (kostenlos). Faustregel: Schaden unter ~800 € bei hoher SF → eher selbst zahlen.'
      return (
        `Rückstufung ca. SF ${sfv} → SF ${sn}. Mehrbeitrag über ~${j} Jahre: <b>${eur(lo)}–${eur(hi)} €</b>. ${rec}` +
        `<span class="aur-note">Richtwert — exakt nur über deinen Versicherer.</span>`
      )
    },
  },
  totalschaden: {
    title: 'Reparatur oder Totalschaden?',
    intro:
      'Wiederbeschaffungswert (WBW), Restwert und Reparaturkosten aus dem Gutachten. §249 BGB / 130-%-Regel.',
    fields: [
      { key: 'w', label: 'WBW €', kind: 'number', half: true, min: 0, placeholder: '12000' },
      { key: 'r', label: 'Restwert €', kind: 'number', half: true, min: 0, placeholder: '4000' },
      { key: 'rep', label: 'Reparaturkosten €', kind: 'number', min: 0, placeholder: '14000' },
    ],
    cta: 'gutachter',
    compute: (s) => {
      const W = num(s.w)
      const R0 = num(s.r)
      const P = num(s.rep)
      if (!W || !P) return null
      let t: string
      if (P <= W) {
        t = '<b>Reparatur</b> — die Kosten liegen unter dem WBW und werden voll erstattet.'
      } else if (P <= 1.3 * W) {
        t =
          '<b>130-%-Regel</b> — Reparatur möglich, wenn fachgerecht repariert und das Auto mind. 6 Monate weitergenutzt wird.'
      } else {
        const ers = W - (R0 || 0)
        t = `<b>Wirtschaftlicher Totalschaden</b> — Reparatur über 130 % WBW. Ersatz = WBW − Restwert = <b>${eur(ers)} €</b>.`
      }
      return t + '<span class="aur-note">Maßgeblich sind die Gutachten-Werte; Richtwert.</span>'
    },
  },
  wertminderung: {
    title: 'Merkantile Wertminderung — relevant?',
    intro:
      'Ob nach der Reparatur ein Minderwert bleibt, hängt v. a. von Alter, Laufleistung und Schadenhöhe ab. §251 BGB. Den exakten Betrag ermittelt nur das Gutachten.',
    fields: [
      { key: 'w', label: 'Wiederbeschaffungswert €', kind: 'number', half: true, min: 0, placeholder: '15000' },
      { key: 'rep', label: 'Reparaturkosten €', kind: 'number', half: true, min: 0, placeholder: '4000' },
      { key: 'a', label: 'Fahrzeugalter (Jahre)', kind: 'number', half: true, min: 0, placeholder: '3' },
      { key: 'km', label: 'Laufleistung (km)', kind: 'number', half: true, min: 0, placeholder: '60000' },
    ],
    cta: 'gutachter',
    compute: (s) => {
      const W = num(s.w)
      const P = num(s.rep)
      const A = num(s.a)
      const K = num(s.km)
      if (!W || !P || !s.a) return null
      const rel = A <= 5 && K <= 100000 && P >= 0.1 * W
      if (rel) {
        const lo = Math.round((P * 0.05) / 50) * 50
        const hi = Math.round((P * 0.15) / 50) * 50
        return (
          `Merkantile Wertminderung ist hier <b>wahrscheinlich relevant</b>. Sehr grobe Hausnummer: <b>${eur(lo)}–${eur(hi)} €</b>.` +
          `<span class="aur-note">Nur ein Anhaltspunkt — den belastbaren Betrag liefert ausschließlich das Gutachten.</span>`
        )
      }
      return (
        'Merkantile Wertminderung ist hier <b>eher nicht relevant</b> (älteres/höher gelaufenes Fahrzeug oder kleiner Schaden).' +
        '<span class="aur-note">Im Zweifel klärt das Gutachten es eindeutig.</span>'
      )
    },
  },
  verzugszinsen: {
    title: 'Verzugszinsen-Rechner (Richtwert)',
    intro:
      'Ab Verzug: 5 Prozentpunkte über dem Basiszinssatz (§288 BGB). Der Basiszins ändert sich halbjährlich — aktuellen Wert eintragen.',
    fields: [
      { key: 'f', label: 'Offene Forderung €', kind: 'number', half: true, min: 0, placeholder: '5000' },
      { key: 't', label: 'Tage im Verzug', kind: 'number', half: true, min: 0, placeholder: '60' },
      {
        key: 'bz',
        label: 'Basiszinssatz % (Beispiel — aktuellen Wert eintragen)',
        kind: 'number',
        step: '0.01',
      },
    ],
    cta: 'anwalt',
    defaults: { bz: '3.37' },
    compute: (s) => {
      const F = num(s.f)
      const T = num(s.t)
      const B = num(s.bz)
      if (!F || !T) return null
      const satz = (isNaN(B) ? 3.37 : B) + 5
      const z = F * (satz / 100) * (T / 365)
      return (
        `Verzugszinssatz: <b>${satz.toFixed(2).replace('.', ',')} %</b> p.a. · Verzugszinsen: <b>${eur(z)} €</b> (auf ${T} Tage) — die kannst du zusätzlich fordern.` +
        `<span class="aur-note">Richtwert; maßgeblich ist der Verzugsbeginn im Einzelfall.</span>`
      )
    },
  },
}

const fieldCls =
  'w-full min-w-0 box-border rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-3 py-3 text-base text-au-ink focus-visible:border-au-amber focus-visible:outline-2 focus-visible:outline-au-amber'
const labelCls =
  'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wider text-au-ink-soft'

function CtaLink({ kind }: { kind: Exclude<CtaKind, null> }) {
  const cls =
    'mt-3.5 inline-flex items-center gap-2 rounded-ios-sm bg-au-amber px-[18px] py-2.5 text-[15px] font-bold text-au-surface transition-opacity hover:opacity-90'
  if (kind === 'gutachter') {
    return (
      <Link href="/gutachter-finden#anfrage" className={cls}>
        Exakt durch Gutachter — anfragen →
      </Link>
    )
  }
  return (
    <a href="https://lex-drive.com" rel="noopener" target="_blank" className={cls}>
      Mit Anwalt durchsetzen (LexDrive) →
    </a>
  )
}

export function Rechner({ type }: { type: RechnerType }) {
  const cfg = CONFIG[type]
  const [state, setState] = useState<Record<string, string>>(() => ({ ...(cfg.defaults ?? {}) }))
  const html = cfg.compute(state)
  const firedRef = useRef(false)

  useEffect(() => {
    if (html && !firedRef.current) {
      firedRef.current = true
      trackToolComplete(`rechner-${type}`)
    } else if (!html) {
      firedRef.current = false
    }
  }, [html, type])

  const set = (key: string, value: string) => setState((s) => ({ ...s, [key]: value }))

  return (
    <div className="my-5 rounded-ios-md border border-au-sand-dark bg-au-paper-warm p-[18px] font-body">
      <h3 className="mb-1 font-display text-[19px] text-au-ink">{cfg.title}</h3>
      <p className="mb-3 mt-0.5 text-sm leading-relaxed text-au-ink-soft">{cfg.intro}</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cfg.fields.map((f) => (
          <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
            <label htmlFor={`aur-${type}-${f.key}`} className={labelCls}>
              {f.label}
            </label>
            {f.kind === 'select' ? (
              <select
                id={`aur-${type}-${f.key}`}
                className={fieldCls}
                value={state[f.key] ?? ''}
                onChange={(e) => set(f.key, e.target.value)}
              >
                <option value="">wählen…</option>
                {f.options!.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={`aur-${type}-${f.key}`}
                type="number"
                inputMode="decimal"
                className={fieldCls}
                value={state[f.key] ?? ''}
                min={f.min}
                max={f.max}
                step={f.step}
                placeholder={f.placeholder}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>

      {html ? (
        <div
          className="mt-3 rounded-ios-sm border border-au-sand-dark bg-au-surface px-3.5 py-3 text-base leading-relaxed text-au-ink [&_.aur-note]:mt-1.5 [&_.aur-note]:block [&_.aur-note]:text-[13px] [&_.aur-note]:text-au-muted [&_b]:font-semibold [&_b]:text-au-amber"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}

      {cfg.cta ? <CtaLink kind={cfg.cta} /> : null}
    </div>
  )
}
