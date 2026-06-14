import { getAllArticles } from '@/lib/articles'
import { getAllRestPages } from '@/lib/rest'
import { getAllDecoders } from '@/lib/decoders'

// Relations-Layer (BRIEF-04 Teil A): datengetriebener Pillar<->Spoke- + Cluster-/
// Prefix-Geschwister-Graph für den "Verwandte Themen"-Block. Ziel: jede Live-Route
// >=2 kontextuelle Inbound-Links. KEINE Handpflege, KEIN Hand-Edit der generierten
// Bodies — neue Seiten werden automatisch verlinkt.

export type RelatedLink = { url: string; title: string }

type Node = { route: string; title: string; group: string; parent: string | null }

// Head <-> Decoder: thematische Paare (Konzept-Erklaerung <-> Kuerzungs-/Streit-
// Decoder). Gruppenuebergreifend — sonst verlinken sich Heads und Decoder nie
// gegenseitig. add() ist node-geprueft → fehlende Routen (z.B. /stundenverrechnungssatz
// vor §2) sind ein No-op, kein toter Link.
const HEAD_DECODER: Record<string, string> = {
  '/verbringungskosten': '/versicherer-decoder/verbringungskosten-abgelehnt',
  '/nutzungsausfall': '/versicherer-decoder/nutzungsausfall-gestrichen',
  '/merkantile-wertminderung': '/versicherer-decoder/wertminderung-abgelehnt',
  '/stundenverrechnungssatz': '/versicherer-decoder/stundensatz-gekuerzt',
  '/upe-aufschlaege': '/versicherer-decoder/upe-gestrichen',
  '/mietwagen-anspruch': '/versicherer-decoder/mietwagen-gekuerzt',
  '/wiederbeschaffungswert': '/versicherer-decoder/restwert-zu-hoch',
  '/schmerzensgeld': '/versicherer-decoder/schmerzensgeld-zu-niedrig',
  '/gutachten-oder-kostenvoranschlag': '/versicherer-decoder/kostenvoranschlag-reicht',
  '/controlexpert-versicherer-pruefdienst': '/versicherer-decoder/controlexpert-kuerzung',
  '/werkstattwahl-recht': '/versicherer-decoder/partnerwerkstatt',
  '/totalschaden-130-prozent-regel': '/versicherer-decoder/130-prozent-verweigert',
  '/hws-schleudertrauma': '/versicherer-decoder/hws-nicht-anerkannt',
}
const DECODER_HEAD: Record<string, string> = Object.fromEntries(
  Object.entries(HEAD_DECODER).map(([h, d]) => [d, h]),
)

function buildNodes(): Node[] {
  const out: Node[] = []
  for (const a of getAllArticles()) {
    // Pillar-Slug normalisieren: einige Quell-Artikel tragen den rohen Prototyp-Slug
    // (z.B. "pillar-06-spezialfaelle") statt der echten Route ("spezialfaelle") —
    // das spaltet sonst die Gruppe + erzeugt einen toten Parent-Link.
    const ps = a.pillar?.slug ? a.pillar.slug.replace(/^pillar-\d+-/, '') : null
    out.push({
      route: '/' + a.slug,
      title: a.title,
      group: 'pillar:' + (ps ?? 'ratgeber'),
      parent: ps ? '/' + ps : null,
    })
  }
  for (const p of getAllRestPages()) {
    const parts = p.route.replace(/^\/+|\/+$/g, '').split('/')
    if (parts.length >= 2) out.push({ route: p.route, title: p.title, group: 'prefix:' + parts[0], parent: '/' + parts[0] })
    else out.push({ route: p.route, title: p.title, group: p.kind === 'pillar' ? 'pillars' : 'hubs', parent: null })
  }
  for (const d of getAllDecoders()) {
    out.push({
      route: '/versicherer-decoder/' + d.slug,
      title: d.crumbLast,
      group: 'decoder:' + d.cluster,
      parent: '/versicherer-decoder',
    })
  }
  // Indexierbare Standalone-Tools, die sonst ausserhalb des Relations-Graphen liegen,
  // in eine thematisch passende Pillar-Gruppe einweben → kontextuelle Inbound-Links.
  if (!out.some((n) => n.route === '/unfallbericht'))
    out.push({
      route: '/unfallbericht',
      title: 'Unfallbericht & Beweissicherung',
      group: 'pillar:unfall-was-tun',
      parent: '/unfall-was-tun',
    })
  return out
}

let cache: { nodes: Node[]; byRoute: Map<string, Node> } | null = null
function model() {
  if (!cache) {
    const nodes = buildNodes()
    cache = { nodes, byRoute: new Map(nodes.map((n) => [n.route, n])) }
  }
  return cache
}

export function getRelatedFor(route: string): RelatedLink[] {
  const { nodes, byRoute } = model()
  const me = byRoute.get(route)
  if (!me) return []
  const out: RelatedLink[] = []
  const seen = new Set<string>([route])
  const add = (n?: Node | null) => {
    if (n && !seen.has(n.route)) {
      seen.add(n.route)
      out.push({ url: n.route, title: n.title })
    }
  }
  // 1) Eltern-Pillar/Hub
  if (me.parent) add(byRoute.get(me.parent))
  // 1b) Head <-> Decoder konsequent (gruppenuebergreifend, hohe Relevanz)
  const counterpart = HEAD_DECODER[route] ?? DECODER_HEAD[route]
  if (counterpart) add(byRoute.get(counterpart))
  // 2) bis zu 2 Kinder (falls diese Route selbst Pillar/Hub ist)
  const kids = nodes.filter((n) => n.parent === route)
  kids.slice(0, 2).forEach(add)
  // 3) Geschwister derselben Gruppe, zyklisch (deterministisch) -> jede Seite wird
  //    von ihren Vorgängern verlinkt => robuste gegenseitige Inbound-Verlinkung
  const group = nodes.filter((n) => n.group === me.group).sort((a, b) => a.route.localeCompare(b.route))
  const i = group.findIndex((n) => n.route === route)
  for (let k = 1; k < group.length && out.length < 5; k++) add(group[(i + k) % group.length])
  // 4) Auffüllen auf >=3, falls Mini-Gruppe (deterministisch, themennah über parent)
  if (out.length < 3) {
    const fallback = nodes
      .filter((n) => n.route !== route && (me.parent ? n.parent === me.parent : n.group === me.group))
      .concat([...nodes].sort((a, b) => a.route.localeCompare(b.route)))
    for (const n of fallback) {
      if (out.length >= 3) break
      add(n)
    }
  }
  return out.slice(0, 5)
}
