'use client'

import { useState } from 'react'
import { CLUSTER, seoTextFor } from '@/lib/cluster'
import { vorortAbsatzFor } from '@/lib/seoVorOrt'

interface SeoBodySectionProps {
  stadtSlug: string
  stadtName: string
}

// BRIEF 08b · H3-Katalog: Trigger → Zwischenüberschrift. Reihenfolge = Prioritaet
// (spezifisch vor generisch); jede H3 max. 1x pro Seite, vor dem ERSTEN Treffer.
// Absatz 0 (Intro) bekommt bewusst keine H3.
const H3_CATALOG: { key: string; test: RegExp; h3: (stadt: string) => string }[] = [
  // 08n N9 (Aaron, redaktionell): vorher 'Hochwasser-Schäden: Erfahrung aus
  // 2021' — wortgleicher Erfahrungs-Claim auf beiden Hubs, unbelegt; in Köln
  // feuerte /Hochwasser/ zudem auf einem VERKEHRS-Absatz ("Hochwasser bremst
  // den Verkehr aus") und verdraengte dessen Brennpunkte-H3. Jetzt: sachliche
  // Themen-H3 ohne Erfahrungs-/Jahres-Claim + Trigger nur auf echte
  // Flutschaden-Begriffe (Koeln-Hub matcht nicht mehr, Aachen-Hub weiter).
  { key: 'hochwasser', test: /Hochwasser-?Schäden|Sturzflut|Wassergutachten|Wasserschaden/, h3: () => 'Wasser- und Hochwasserschäden am Fahrzeug' },
  { key: 'ausland', test: /Grüne Karte|ausländisch|niederländisch|belgisch/, h3: () => 'Unfall mit ausländischer Beteiligung' },
  { key: 'rechte', test: /§ ?249|Gegengutachten|kürzt/, h3: () => 'Ihre Rechte: 0 € für Sie nach §249 BGB' },
  { key: 'werkstatt', test: /Werkstattwahl|Werkstatt zu wählen|Werkstatt Ihrer Wahl/, h3: () => 'Werkstatt: Ihre Wahl, Ihr Recht' },
  { key: 'brennpunkte', test: /Verkehrsschwerpunkt|Anschlussstelle|Autobahnring|Unfallschwerpunkt/, h3: (s) => `Unfallschwerpunkte in ${s}` },
  // 08l A2: 'vorort' aus dem Katalog entfernt — der Absatz zieht samt H3 in
  // Block 1 der Lokal-Strecke (EinsatzgebietSection, via lib/seoVorOrt).
  { key: 'schritte', test: /Drei Schritte/, h3: () => 'In 3 Schritten zum Gutachten' },
]

/** Pull-Quote (BRIEF 08b A3): erster Satz des 2. Absatzes (= staerkster Lokal-Anker
 *  in allen 18 Texten). Schnitt am ':' wenn frueher als '.' (Texte enden Satz 1 oft
 *  mit Doppelpunkt-Hinfuehrung). KEINE neue Copy — 1:1-Duplikat aus dem Text. */
function pullQuoteFrom(paragraph: string | undefined): string | null {
  if (!paragraph) return null
  const dot = paragraph.indexOf('. ')
  const colon = paragraph.indexOf(':')
  let end = dot === -1 ? paragraph.length : dot
  if (colon > 50 && (dot === -1 || colon < dot)) end = colon
  const sentence = paragraph.slice(0, end).trim()
  return sentence.length >= 40 ? sentence : null
}

// Editorial-SEO-Body (BRIEF 07 + 08b): 720px-Editorial-Spalte, H3-Gliederung,
// Fakten-Chips, Pull-Quote, Mobile-Collapse (<768px; Content bleibt VOLL im DOM —
// Server-gerendert via RSC-SSR, kein display:none auf Absaetzen, kein Lazy-Inject).
export function SeoBodySection({ stadtSlug, stadtName }: SeoBodySectionProps) {
  const [open, setOpen] = useState(false)
  const text = seoTextFor(stadtSlug)

  if (!text || text.trim() === '' || text.includes('PLATZHALTER')) {
    return null
  }

  // 08l A2: Der "Vor Ort"-Absatz rendert in Block 1 (Einsatzgebiet) — hier
  // ausschliessen, damit die Copy nicht doppelt erscheint (byte-identisch dort).
  const vorort = vorortAbsatzFor(stadtSlug)
  const paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .filter((p, idx) => idx === 0 || p !== vorort)

  // H3-Zuordnung: ab Absatz 1, jede H3 nur einmal (used-Set).
  const used = new Set<string>()
  const h3For = (p: string, idx: number): string | null => {
    if (idx === 0) return null
    for (const entry of H3_CATALOG) {
      if (used.has(entry.key)) continue
      if (entry.test.test(p)) {
        used.add(entry.key)
        return entry.h3(stadtName)
      }
    }
    return null
  }
  const items = paragraphs.map((p, idx) => ({ p, h3: h3For(p, idx) }))

  const quote = pullQuoteFrom(paragraphs[1])
  const chips = [
    '0 € für Sie',
    'Gutachten in 48h',
    '§249 BGB',
    `${CLUSTER.cities.length} Städte im Einsatzgebiet`,
  ]

  const renderItem = ({ p, h3 }: { p: string; h3: string | null }, idx: number) => (
    <div key={idx}>
      {h3 && (
        <h3 className="font-display font-bold text-[20px] md:text-[22px] leading-snug text-ink mt-9 mb-3 flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-amber flex-none" />
          {h3}
        </h3>
      )}
      <p className="mt-4 first:mt-0">{p}</p>
    </div>
  )

  // Mobile-Collapse: Chips + erste 2 Absaetze sichtbar, Rest im .seo-rest-Wrapper
  // (CSS grid-rows-Collapse, initial zu — kein CLS; Desktop immer offen).
  const visible = items.slice(0, 2)
  const rest = items.slice(2)

  return (
    <section className="bg-petrol-tint py-12 md:py-16" aria-labelledby="seo-body-heading">
      <div className="max-w-[720px] mx-auto px-4">
        <h2
          id="seo-body-heading"
          className="font-display font-bold text-section-h2 text-ink mb-5 md:mb-6"
        >
          Kfz-Gutachter in {stadtName} — was Sie wissen sollten
        </h2>

        {/* Fakten-Chips (BRIEF 08b A2) — Akzent-Token-Light, keine neuen Farben. */}
        <ul className="flex flex-wrap gap-2 mb-7 list-none p-0" aria-label="Fakten im Überblick">
          {chips.map((c) => (
            <li
              key={c}
              className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold bg-[color-mix(in_srgb,var(--amber)_14%,white)] text-[var(--amber-aa)] border border-[color-mix(in_srgb,var(--amber)_32%,white)]"
            >
              {c}
            </li>
          ))}
        </ul>

        <div className="text-[17px] md:text-[18px] leading-[1.65] text-secondary">
          {visible.map(renderItem)}

          {/* Pull-Quote nach Absatz 2 — bestehender Satz, Akzent-Border (A3). */}
          {quote && (
            <blockquote className="seo-rest-quote border-l-4 border-[var(--amber)] pl-4 my-7 font-display font-semibold text-[19px] md:text-[21px] leading-snug text-ink">
              {quote}
            </blockquote>
          )}

          <div id="seo-body-rest" className={`seo-rest${open ? ' seo-rest-open' : ''}`}>
            <div>{rest.map((it, i) => renderItem(it, i + 2))}</div>
          </div>

          <button
            type="button"
            className="seo-more-btn mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-cta border-[1.5px] border-[var(--amber-aa)] text-[var(--amber-aa)] bg-white font-display font-semibold text-[15px] active:scale-[.98] transition"
            aria-expanded={open}
            aria-controls="seo-body-rest"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Weniger anzeigen' : `Mehr zu Kfz-Gutachter in ${stadtName} lesen`}
            <svg
              className={`w-4 h-4 stroke-current fill-none transition-transform ${open ? 'rotate-180' : ''}`}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
