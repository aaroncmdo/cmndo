import { SITE } from '@/lib/site'
import { getAllArticles } from '@/lib/articles'
import { getAllRestPages } from '@/lib/rest'
import { getAllDecoders } from '@/lib/decoders'

// llms.txt / llms-full.txt werden — wie app/sitemap.ts — datengetrieben aus den
// Content-Quellen erzeugt. Neue Seiten (Artikel/Rest/Decoder) erscheinen damit
// automatisch in der KI-Sitemap; KEINE Handpflege. Gerendert via Route-Handler
// app/llms.txt/route.ts + app/llms-full.txt/route.ts.

type Entry = { url: string; title: string; desc: string; full?: string }

const u = (route: string) => `${SITE.url}${route}`
const oneLine = (s?: string) => (s ?? '').replace(/\s+/g, ' ').trim()
const stripMd = (s?: string) =>
  oneLine((s ?? '').replace(/\]\(\/[^)]*\)/g, ']').replace(/[*_`>#[\]]/g, ''))
const stripHtml = (s?: string) => oneLine((s ?? '').replace(/<[^>]+>/g, ''))

function groups(): { label: string; items: Entry[] }[] {
  const rest = getAllRestPages()
  const articles = getAllArticles()
  const decoders = getAllDecoders()
  const seg0 = (r: string) => r.replace(/^\/+|\/+$/g, '').split('/')[0]
  const pillars = rest.filter((p) => p.kind === 'pillar')
  const sf = rest.filter((p) => seg0(p.route) === 'schadenfreiheitsklasse')
  const verg = rest.filter((p) => seg0(p.route) === 'vergleich')
  const claimed = new Set([...pillars, ...sf, ...verg].map((p) => p.route))
  const otherRest = rest.filter((p) => !claimed.has(p.route))
  const fromRest = (p: (typeof rest)[number]): Entry => ({
    url: u(p.route),
    title: p.title,
    desc: oneLine(p.description),
    full: stripMd((p.quickAnswer ?? []).join(' ')),
  })
  return [
    { label: 'Themen-Pillars (Cornerstone)', items: pillars.map(fromRest) },
    {
      label: 'Ratgeber-Artikel',
      items: articles.map((a) => ({
        url: u('/' + a.slug),
        title: a.title,
        desc: oneLine(a.description),
        full: stripMd((a.quickAnswer ?? []).join(' ')),
      })),
    },
    { label: 'Hubs & Themenseiten', items: otherRest.map(fromRest) },
    {
      label: 'Versicherer-Decoder',
      items: [
        {
          url: u('/versicherer-decoder'),
          title: 'Versicherer-Decoder (Übersicht)',
          desc: 'Standard-Floskeln und Kürzungen der Kfz-Versicherung entschlüsselt — mit Musterbriefen.',
        },
        ...decoders.map((d) => ({
          url: u('/versicherer-decoder/' + d.slug),
          title: d.crumbLast,
          desc: oneLine(d.metaDesc),
          full: stripHtml(d.tldr),
        })),
      ],
    },
    { label: 'Schadenfreiheitsklasse', items: sf.map(fromRest) },
    { label: 'Anbieter-Vergleiche', items: verg.map(fromRest) },
    {
      label: 'Tools & Rechner',
      items: [
        { url: u('/gutachter-finden'), title: 'Gutachter finden', desc: 'qualifizierte Kfz-Sachverständige in Ihrer Nähe finden.' },
        { url: u('/rechner'), title: 'Rechner-Übersicht', desc: 'Interaktive Rechner rund um den Unfallschaden.' },
        { url: u('/kuerzungs-checker'), title: 'Kürzungs-Checker', desc: 'Prüfen, ob die Versicherung Ihren Anspruch unzulässig gekürzt hat.' },
        { url: u('/unfallbericht'), title: 'Unfallbericht-Assistent', desc: 'Strukturierte Beweissicherung direkt nach dem Unfall.' },
        { url: u('/schadenfreiheitsklasse/rechner'), title: 'SF-Klasse-Rechner', desc: 'Schadenfreiheitsklasse und Versicherungsbeitrag berechnen.' },
      ],
    },
    {
      label: 'Rechtliches',
      items: [
        { url: u('/impressum'), title: 'Impressum', desc: 'Anbieterkennzeichnung gemäß § 5 DDG.' },
        { url: u('/datenschutz'), title: 'Datenschutzerklärung', desc: 'Datenverarbeitung und Betroffenenrechte (DSGVO).' },
      ],
    },
  ].filter((g) => g.items.length > 0)
}

const INTRO = `# autounfall.io

> Unabhängige Unfall-Assistance: verständliche Ratgeber, Decoder und Rechner rund um den Kfz-Unfallschaden in Deutschland. Redaktionelles Angebot der Kitta & Sprafke UG (haftungsbeschränkt), fachlich begleitet von unserer Verkehrsrechts-Partnerkanzlei.`

const HINWEISE = `## Hinweise
- Allgemeines Informations- und Ratgeber-Angebot, ersetzt keine individuelle Rechtsberatung.
- Inhalte quellenbasiert (BGH-Rechtsprechung, § 249 BGB), werbefrei.
- Reichweitenmessung cookielos (Plausible Analytics), keine Tracking- oder Marketing-Cookies.`

const INTRO_FULL = `# autounfall.io — Wissens-Hub für Unfall-Geschädigte

> Unabhängiges, redaktionelles Informationsangebot rund um den Kfz-Unfallschaden in Deutschland. Erklärt verständlich, welche Ansprüche Geschädigte nach einem unverschuldeten Verkehrsunfall haben (§ 249 BGB), wie Versicherer-Kürzungen funktionieren und wie sich typische Beträge berechnen. Betreiber: Kitta & Sprafke UG (haftungsbeschränkt), Köln. Fachliche Begleitung: unsere Verkehrsrechts-Partnerkanzlei.

## Über dieses Angebot
autounfall.io ist ein allgemeines Ratgeber-Angebot und ersetzt keine individuelle Rechtsberatung. Die Inhalte sind quellenbasiert (u. a. BGH-Rechtsprechung, § 249 BGB) und werbefrei. Reichweitenmessung erfolgt cookielos über Plausible Analytics; es werden keine Tracking- oder Marketing-Cookies gesetzt. Schriftarten werden lokal ausgeliefert.`

export function buildLlmsTxt(): string {
  const body = groups()
    .map((g) => `## ${g.label}\n${g.items.map((e) => `- [${e.title}](${e.url}): ${e.desc}`).join('\n')}`)
    .join('\n\n')
  return `${INTRO}\n\n${body}\n\n${HINWEISE}\n`
}

export function buildLlmsFullTxt(): string {
  const body = groups()
    .map((g) => {
      const items = g.items
        .map((e) => {
          const head = `- [${e.title}](${e.url}): ${e.desc}`
          return e.full ? `${head}\n  ${e.full}` : head
        })
        .join('\n')
      return `## ${g.label}\n${items}`
    })
    .join('\n\n')
  return `${INTRO_FULL}\n\n${body}\n`
}
