import Link from 'next/link'
import { getAllAssets } from '@/lib/content/claimondo-mdx'
import { SnippetText } from './SnippetText'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const
const MAX_ZIELE = 4

/**
 * Brücke von einem /wissen-Artikel in den Fach-Cluster.
 *
 * Gemessen 23.08.2026 auf prod: die 69 veröffentlichten Wissen-Artikel waren
 * **vollständige Sackgassen** — 0 Links nach /haftpflicht/, 0 nach /decoder/,
 * 0 zu anderen Artikeln, bei ~200 KB Seiteninhalt. Wer einen News-Beitrag zu Ende
 * las, hatte keinen Weg zum eigentlichen Fachinhalt.
 *
 * Gesteuert wird über `tags`, NICHT über `cluster`:
 *   tags    → geschlossene Menge, 7 Werte über alle 69 Artikel
 *   cluster → Freitext, ~20 Varianten, teils Dubletten („Schadengutachten" vs.
 *             „Schadengutachten & Fahrzeugbewertung"), teils Quellennamen
 *             („Captain-HUK", „Versicherungsbote", „KÜS"). Als Zuordnungsschlüssel
 *             unbrauchbar — die Artikel sind KI-generiert, das Feld ist mitgewachsen.
 *
 * Die Map ist bewusst kuratiert und klein statt automatisch: ein Keyword-Matching
 * über Titel läge bei News-Überschriften regelmäßig daneben, und ein falscher
 * „Verwandtes Thema"-Verweis ist schlechter als keiner.
 */
const TAG_ZIELE: Record<string, string[]> = {
  Werkstatt: [
    '/haftpflicht/reparaturkosten',
    '/haftpflicht/beilackierung',
    '/haftpflicht/ersatzteil-qualitaet',
    '/haftpflicht/adas-kalibrierung',
  ],
  Gutachten: [
    '/haftpflicht/sv-kosten',
    '/haftpflicht/wertminderung',
    '/haftpflicht/reparaturbestaetigung',
  ],
  Schadenregulierung: [
    '/haftpflicht/4-wochen-frist',
    '/haftpflicht/verzug-bgb286',
    '/haftpflicht/anwaltskosten-erstattung',
    '/haftpflicht/nutzungsausfall',
  ],
  'Recht & Urteile': [
    '/haftpflicht/beweislast',
    '/haftpflicht/anscheinsbeweis',
    '/haftpflicht/verschulden-bgb823',
  ],
  Versicherer: [
    '/decoder/wir-pruefen-sachverhalt',
    '/decoder/pauschal-abgeltung',
    '/decoder/werkstatt-netz',
  ],
  // 'Markt & News' und 'Tools' stehen bewusst NICHT hier: für einen fachlichen
  // Spoke-Verweis sind sie zu unspezifisch — ein Branchennews-Artikel passt nicht
  // zu '/haftpflicht/beilackierung'. Sie greifen stattdessen auf FALLBACK_ZIELE.
}

/**
 * Greift nur, wenn KEINES der Artikel-Tags fachliche Ziele liefert.
 *
 * Bewusst nicht als weiterer TAG_ZIELE-Eintrag: dort stünden die allgemeinen
 * Einstiegsseiten gleichrangig neben den Spokes und würden bei gemischt getaggten
 * Artikeln ('Markt & News' + 'Gutachten') zwei fachliche Ziele verdrängen — der
 * Verweis würde unschärfer, nicht besser. Als Fallback ändert sich für die 67
 * fachlich getaggten Artikel nichts.
 *
 * Anlass: der Regel-4-Smoke nach #5528 fand 1 von 68 Artikeln ohne jeden
 * Weiterweg (nur 'Markt & News' getaggt) — also weiterhin eine Sackgasse,
 * genau das, was die Sektion beenden sollte.
 *
 * ⚠ Bewusst NICHT '/ratgeber', obwohl es der zweite Cornerstone ist: die Seite
 * canonicalisiert auf '/unfall-was-tun-als-geschaedigter' (Stream B.5 — Ranking-
 * Signal bündeln statt kannibalisieren). Ein interner Link auf die konsolidierte
 * Dublette arbeitet gegen genau diese Absicht. Beide Ziele hier sind self-canonical
 * und stehen in der Sitemap; '/sachverstaendige/pruefdienstleister' trifft
 * Branchen-/Markt-Themen zudem inhaltlich besser als ein Geschädigten-Ratgeber.
 */
const FALLBACK_ZIELE = ['/kfz-haftpflicht-schaden', '/sachverstaendige/pruefdienstleister']

export function WissenVerwandteThemen({ tags }: { tags: string[] | null }) {
  if (!tags?.length) return null

  // Reihenfolge der Artikel-Tags bestimmt die Priorität; pro Tag reihum ein Ziel,
  // damit bei mehreren Tags nicht ein einziger Tag alle Plätze belegt.
  const fachlich = tags.map((t) => TAG_ZIELE[t] ?? []).filter((l) => l.length > 0)
  const proTag = fachlich.length > 0 ? fachlich : [FALLBACK_ZIELE]
  const urls: string[] = []
  for (let runde = 0; urls.length < MAX_ZIELE; runde++) {
    const vorher = urls.length
    for (const liste of proTag) {
      if (urls.length >= MAX_ZIELE) break
      const u = liste[runde]
      if (u && !urls.includes(u)) urls.push(u)
    }
    if (urls.length === vorher) break // keine Liste liefert mehr etwas
  }

  const alle = getAllAssets()
  const ziele = urls.map((u) => alle.find((a) => a.url === u)).filter((a) => Boolean(a))
  if (ziele.length === 0) return null

  return (
    <aside className="mt-14 border-t border-claimondo-border pt-8">
      <h2 style={HEAD_FONT} className="mb-5 text-xl font-bold text-claimondo-navy">
        Passend zum Thema
      </h2>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {ziele.map((s) => (
          <li key={s!.url}>
            <Link
              href={s!.url}
              className="block h-full rounded-ios-md border border-claimondo-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm"
            >
              <span style={HEAD_FONT} className="block font-bold leading-snug text-claimondo-navy">
                {s!.title}
              </span>
              {s!.snippet && (
                <span className="mt-1 block line-clamp-2 text-[0.8125rem] text-claimondo-shield/70">
                  <SnippetText>{s!.snippet}</SnippetText>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
