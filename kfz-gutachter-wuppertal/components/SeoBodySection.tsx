'use client'

import { useState } from 'react'
import { CLUSTER, seoBodyFor, type SeoAbsatz } from '@/lib/cluster'

interface SeoBodySectionProps {
  stadtSlug: string
  stadtName: string
}

/* 08o O6 · H3s sind EDITORIAL an ihre Absaetze gebunden (SEO_BODY-Datenfeld
   in lib/cluster: h3/text/liste/vorort je Absatz). Der fruehere Trigger-
   Katalog (Regex -> Ueberschrift, BRIEF 08b) ist abgeschafft — er erzeugte
   Fehlpaarungen (N9 Hochwasser/Koeln, O6 Leverkusen: Rechte-H3 ueber dem
   A1-Sanierungs-Absatz). Leistungs-Aufzaehlungen rendern als kompakte Liste. */

/** Pull-Quote (BRIEF 08b A3): erster Satz des 2. sichtbaren Absatzes (=
 *  staerkster Lokal-Anker). Schnitt am ':' wenn frueher als '.'. KEINE neue
 *  Copy — 1:1-Duplikat aus dem Text. */
function pullQuoteFrom(paragraph: string | undefined): string | null {
  if (!paragraph) return null
  const dot = paragraph.indexOf('. ')
  const colon = paragraph.indexOf(':')
  let end = dot === -1 ? paragraph.length : dot
  if (colon > 50 && (dot === -1 || colon < dot)) end = colon
  const sentence = paragraph.slice(0, end).trim()
  return sentence.length >= 40 ? sentence : null
}

// Editorial-SEO-Body (BRIEF 07 + 08b + 08o O6): 720px-Editorial-Spalte,
// gebundene H3-Gliederung, Fakten-Chips, Pull-Quote, Mobile-Collapse (<768px;
// Content bleibt VOLL im DOM — Server-gerendert via RSC-SSR, kein display:none
// auf Absaetzen, kein Lazy-Inject).
export function SeoBodySection({ stadtSlug, stadtName }: SeoBodySectionProps) {
  const [open, setOpen] = useState(false)

  // 08l A2: Der "Vor Ort"-Absatz rendert in Block 1 (Einsatzgebiet) — hier
  // ueberspringen (Markierung editorial via vorort-Flag, 08o O6).
  const items = seoBodyFor(stadtSlug).filter((a) => !a.vorort)
  if (items.length === 0) return null

  const quote = pullQuoteFrom(items[1]?.text)
  const chips = [
    '0 € für Sie',
    'Gutachten in 48h',
    '§249 BGB',
    `${CLUSTER.cities.length} Städte im Einsatzgebiet`,
  ]

  const renderItem = (a: SeoAbsatz, idx: number) => (
    <div key={idx}>
      {a.h3 && (
        <h3 className="font-display font-bold text-[20px] md:text-[22px] leading-snug text-ink mt-9 mb-3 flex items-center gap-2.5">
          <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-amber flex-none" />
          {a.h3}
        </h3>
      )}
      <p className="mt-4 first:mt-0">{a.text}</p>
      {a.liste && (
        <ul className="mt-3 mb-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 list-none p-0">
          {a.liste.map((li) => (
            <li key={li} className="flex items-start gap-2.5 text-[15.5px] leading-snug">
              <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-amber flex-none mt-[7px]" />
              {li}
            </li>
          ))}
        </ul>
      )}
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
