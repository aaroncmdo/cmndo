import type { RestPage } from '@/lib/rest-types'
import { restPages as generatedRestPages } from '@/content/rest-pages.generated'
import { manualRestPages } from '@/content/rest-pages.manual'
import { deepGenerifyContent } from '@/lib/genericize-partner'

// Additiver Inhalts-Patch (Brief 02 C2): Unkostenpauschale-Abschnitt + 2 FAQ in den
// bestehenden /nutzungsausfall-Hub, ohne die generierte Datei zu beruehren. Quelle:
// seo-loop/approved/2026-06-11/nutzungsausfall-unkostenpauschale (rechtlich freigegeben,
// keine konkreten EUR-Betraege — Hoehe gerichtlich uneinheitlich, § 249 BGB).
const UNKOSTEN_BODY = [
  '',
  '',
  '## Was ist die Unkostenpauschale (Auslagenpauschale)?',
  '',
  'Die Unkostenpauschale ist ein pauschaler Betrag, den Sie ohne Einzelnachweis für allgemeine Nebenkosten der Schadenabwicklung erhalten — etwa Telefon, Porto und Fahrten. Sie müssen die einzelnen Kosten nicht belegen; der Pauschalbetrag deckt den typischen Aufwand ab. Die genaue Höhe ist nicht gesetzlich fixiert: Verschiedene Gerichte setzen unterschiedliche Beträge an, häufig in einer Spanne, die je nach Region und Rechtsprechung variiert.',
  '',
  'Die Unkostenpauschale gibt es **zusätzlich** zum Nutzungsausfall — die beiden Positionen schließen sich nicht aus.',
].join('\n')

const UNKOSTEN_FAQ = [
  {
    q: 'Wie hoch ist die Unkostenpauschale nach einem Unfall?',
    a: 'Die Unkostenpauschale ist nicht gesetzlich festgelegt; Gerichte setzen unterschiedliche Beträge an. Sie erhalten den Pauschalbetrag ohne Einzelnachweis für allgemeine Nebenkosten wie Telefon und Porto, zusätzlich zu anderen Schadenpositionen.',
  },
  {
    q: 'Bekomme ich Nutzungsausfall und Unkostenpauschale gleichzeitig?',
    a: 'Ja. Beide Positionen schließen sich nicht aus und werden bei einem unverschuldeten Unfall zusätzlich zueinander erstattet. Nicht kombinierbar ist nur Nutzungsausfall mit Mietwagen — hier müssen Sie sich für eine Variante entscheiden.',
  },
]

// Patch-Map: erweitert einzelne generierte Eintraege rein additiv (Body anhaengen,
// FAQ ergaenzen). H1/Slug/Route bleiben unveraendert; keine neue Route, kein 301.
const PATCHES: Record<string, { appendBody?: string; appendFaq?: { q: string; a: string }[] }> = {
  '/nutzungsausfall': { appendBody: UNKOSTEN_BODY, appendFaq: UNKOSTEN_FAQ },
}

// A2 (Cowork 2026-06-16): die 4 generierten /hub-sf-*-Hubs gehoeren unter
// /schadenfreiheitsklasse/<slug> (ihr Breadcrumb nennt SF bereits als Parent). Re-Map
// rein in der Merge-Schicht -> generierte Datei bleibt diff=0, kein Content-Duplikat;
// die alte Route faellt aus den Daten (kein Sitemap-/llms-Filter noetig). Alt-URL -> 301
// via next.config redirects(); die app/hub-sf-*-Ordner sind entfernt. Als 2-Segment-Route
// joinen die Seiten automatisch die SF-Breadcrumb-/Relations-Gruppe (prefix:schadenfreiheitsklasse).
const HUB_SF_REMAP: Record<string, string> = {
  '/hub-sf-anfaenger': '/schadenfreiheitsklasse/anfaenger',
  '/hub-sf-herausfinden': '/schadenfreiheitsklasse/herausfinden',
  '/hub-sf-uebertragen-nachteile': '/schadenfreiheitsklasse/uebertragen-nachteile',
  '/hub-sf-uebertragen-zweitwagen': '/schadenfreiheitsklasse/uebertragen-zweitwagen',
}
function remapHubSf(p: RestPage): RestPage {
  const to = HUB_SF_REMAP[p.route]
  if (!to) return p
  return {
    ...p,
    route: to,
    breadcrumb: p.breadcrumb?.map((b) => (b.route === p.route ? { ...b, route: to } : b)),
  }
}

// Merge-Schicht: generierte Rest-Pages + manuelle (Vergleiche). manual zuletzt →
// gewinnt bei Routenkonflikt. NUR GENERIERTE werden via Deep-Transform entnamt
// (Verkehrsrechts-Partnerkanzlei generisch, Cowork 2026-06-12); manuelle Vergleiche
// (Claimondo-/UWG-§6-Kontext) bleiben benannt. Anschliessend additive Patches.
export const restPages: RestPage[] = [...generatedRestPages.map(deepGenerifyContent).map(remapHubSf), ...manualRestPages].map((p) => {
  const patch = PATCHES[p.route]
  if (!patch) return p
  return {
    ...p,
    body: p.body + (patch.appendBody ?? ''),
    faq: [...(p.faq ?? []), ...(patch.appendFaq ?? [])],
  }
})
