# GEO Freshness-Architektur + Stadt-Pages-SEO

**Stand:** 24.05.2026 · **Eigenständig prozessierbar** (kein Merge-Konflikt mit `geo-sprint-vergleich-und-wissen-2026-05-24.md` oder `geo-feeds-spec-2026-05-24.md`)
**Audit-Basis:** Code-Audit 24.05.2026 — siehe Audit-Headlines unten.
**Verwandt:** `geo-messung-2026-05-24.md`, `geo-sprint-vergleich-und-wissen-2026-05-24.md`, `geo-feeds-spec-2026-05-24.md`

Dieser Plan adressiert zwei verzahnte Probleme: (a) die geplanten Feeds müssen automatisiert frisch bleiben, sonst werden sie für News-Aggregatoren und LLM-Crawler nutzlos; (b) die 61 Stadt-Pages haben aktuell strukturell solide Basis aber kein echtes Freshness-Signal — sie verschenken SEO-Ranking.

Die Architektur ist eine **3-Layer-Freshness-Defense** (L1 ISR / L2 Webhook / L3 Cron) plus **drei Stadt-Pages-Hebel** (H1 per-Stadt-lastUpdated / H2 dynamische Lokal-Sections / H3 Schema-Erweiterung). Jede Schicht ist additiv zu eurem bestehenden Code und kann unabhängig deployed werden.

## Audit-Headlines (Stand 24.05.2026)

1. **61 Stadt-Pages** (Welle 1–4 ausgespielt) leben hartcoded in `src/app/kfz-gutachter/staedte.ts`, vollständig SSG via `generateStaticParams`, kein `revalidate` gesetzt.
2. **Sitemap nutzt globales `now`** für alle 61 Pages → kein per-Stadt-Freshness-Signal für Google. Alle 61 erscheinen für Google als „heute aktualisiert", was nach 2–3 Tagen das Signal entwertet.
3. **Schemas sind gut** (LegalService + Service + HowTo + FAQPage + Breadcrumb pro Stadt, dynamische FAQ mit `buildStadtFaq()`) — fehlen aber LocalBusiness-typische Felder (`image[]`, `priceRange`, `aggregateRating`).
4. **`revalidate` / `revalidatePath` / `revalidateTag` werden _nirgendwo_ verwendet** im Repo.
5. **28+ Cron-Routes existieren** (Pattern `src/app/api/cron/*`), Vercel-Cron-Infrastruktur ist etabliert. Webhook-Routes für externe Trigger existieren (`/api/webhooks/lexdrive`, `/twilio`).
6. **Supabase-Migrations sind alle Platzhalter** („Migration X direkt auf DB appliziert"). AAR-600-Parallele. Kein Blocker für diesen Plan, weil wir keine Schema-Änderungen brauchen — aber Folge-Tech-Debt.
7. **Keine `staedte`-Tabelle in Supabase** — Daten leben nur in der TS-Konstante. Für 61 Städte ist das tragbar; bei wirklichem CMS-Workflow später migrierbar.

---

## Layer 1 — Per-Page `revalidate` (ISR-Polling)

Sicherheitsnetz auf unterster Ebene: wenn Layer 2 und 3 beide failen, hat jede Page maximal X Sekunden stale-Content.

### Implementierung

| Datei | `revalidate` | Begründung |
|---|---|---|
| `src/app/kfz-gutachter/[stadt]/page.tsx` | `3600` (1 h) | Stadt-Pages sollen frisch sein, aber 1h reicht weil L2 + L3 schneller pushen |
| `src/app/feed.xml/route.ts` | `21600` (6 h) | wie in Feeds-Spec |
| `src/app/feed.json/route.ts` | `21600` | dito |
| `src/app/feed/katalog.xml/route.ts` | `86400` (24 h) | Katalog ist evergreen |
| `src/app/feed/katalog.json/route.ts` | `86400` | dito |
| `src/app/llms.txt/route.ts` | bereits `86400` ✓ | bestehend, nicht ändern |
| `src/app/llms-full.txt/route.ts` | bereits `86400` ✓ | bestehend, nicht ändern |

Plus auf `src/app/kfz-gutachter/page.tsx` (Pillar) ebenfalls `revalidate = 3600` — der Pillar zeigt die Cross-City-Pills und sollte mit neuen Stadt-Updates mitziehen.

**Code-Snippet je Datei:**

```ts
export const dynamic = 'force-static'   // bereits aktiv in den anderen Routes
export const revalidate = 3600           // 1h für Stadt-Pages
```

**Aufwand:** 30 Min einmalig.

---

## Layer 2 — On-Demand-Revalidation via Supabase-Webhook

Echte Daten-Änderung in Supabase → sofortige Page-Invalidation → User sehen die Änderung beim nächsten Request statt erst beim nächsten ISR-Cycle.

### Architektur

```
┌─────────────────┐       INSERT/UPDATE       ┌──────────────────────┐
│   Supabase DB   │ ───────── Trigger ───────▶│  Supabase Database   │
│  (faelle, svs)  │                            │      Webhook         │
└─────────────────┘                            └─────────┬────────────┘
                                                          │ POST + secret
                                                          ▼
                                          ┌────────────────────────────┐
                                          │ /api/webhooks/             │
                                          │ content-changed/route.ts   │
                                          │                            │
                                          │ 1. Validate secret         │
                                          │ 2. Parse payload           │
                                          │ 3. Mappe auf Tags/Paths    │
                                          │ 4. revalidateTag(…)        │
                                          └────────────────────────────┘
```

### Welche Tabellen → welche Tags

| Tabelle | Event | Wirkung | Revalidation-Calls |
|---|---|---|---|
| `faelle` | INSERT / UPDATE Status | Aggregat-Zahlen, anonymisierte Recent-Cases ändern sich | `revalidateTag('stadt-${plz_prefix}')` + `revalidateTag('feed-news')` |
| `sachverstaendige` (oder wie die Tabelle heißt) | INSERT / UPDATE `aktiv` | „Y SVs in {Stadt}" ändert sich | `revalidateTag('stadt-${plz_prefix}')` + `revalidateTag('feed-katalog')` |
| `reviews` (falls existent / sobald sie kommt) | INSERT | Lokale Reviews-Section ändert sich | `revalidateTag('stadt-${plz_prefix}')` |
| Bestehende `lexdrive`/`twilio`-Webhooks | unverändert | nicht GEO-relevant | keine |

### Tag-Namens-Konvention

Stadt-Tags: `stadt-${plzPrefix}` (z.B. `stadt-50-51` für Köln). Diese Tags müssen beim Page-Rendering als Cache-Tags annotiert werden, sonst greift `revalidateTag` nicht.

Im Stadt-Page-Template:

```tsx
// src/app/kfz-gutachter/[stadt]/page.tsx
import { unstable_cache } from 'next/cache'

const getStadtLiveData = unstable_cache(
  async (plzPrefix: string) => {
    // Supabase-Queries für Aggregat-Zahlen + abstrahierte Cases (Hebel H2)
    return { fallzahlMonat: 42, recentCases: [...], svCount: 23 }
  },
  ['stadt-live-data'],
  {
    tags: (plzPrefix: string) => [`stadt-${plzPrefix}`],
    revalidate: 3600,
  }
)
```

### Route-Implementation

Neue Datei `src/app/api/webhooks/content-changed/route.ts`:

```ts
import { revalidateTag } from 'next/cache'
import { NextRequest } from 'next/server'

const WEBHOOK_SECRET = process.env.SUPABASE_WEBHOOK_SECRET

// Mapping PLZ-Prefix → unsere Tag-Konvention (cached, ändert sich nie)
import { STAEDTE } from '@/app/kfz-gutachter/staedte'

function plzToStadtTag(plz: string): string | null {
  // plz "50667" → prefix "50-51" → tag "stadt-50-51"
  const stadt = STAEDTE.find((s) => {
    const [low, high] = s.plzPrefix.split('–').map(Number)
    const n = parseInt(plz.slice(0, 2), 10)
    return n >= low && n <= (high ?? low)
  })
  return stadt ? `stadt-${stadt.plzPrefix}` : null
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const secret = req.headers.get('x-webhook-secret')
  if (secret !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  // 2. Parse
  const body = await req.json()
  // Supabase-Webhook-Payload: { type: 'INSERT'|'UPDATE'|'DELETE', table, record, old_record, schema }
  const { table, record } = body

  // 3. Map auf Revalidation-Tags
  const tags: string[] = []

  if (table === 'faelle') {
    const stadtTag = plzToStadtTag(record.kunde_plz ?? record.unfall_plz)
    if (stadtTag) tags.push(stadtTag)
    tags.push('feed-news')
  } else if (table === 'sachverstaendige') {
    const stadtTag = plzToStadtTag(record.plz ?? record.standort_plz)
    if (stadtTag) tags.push(stadtTag)
    tags.push('feed-katalog')
  } else if (table === 'reviews') {
    const stadtTag = plzToStadtTag(record.kunde_plz)
    if (stadtTag) tags.push(stadtTag)
  }

  // 4. Revalidate
  for (const tag of tags) {
    revalidateTag(tag)
  }

  return Response.json({ revalidated: tags })
}
```

### Supabase-Side-Setup

Im Supabase-Dashboard (oder via `supabase db push` mit einer echten Migration — Regel 2 AGENTS.md respektieren):

1. **Database-Webhooks aktivieren** für die Tabellen `faelle`, `sachverstaendige`, `reviews` (sobald existent)
2. **HTTP-Endpoint:** `https://claimondo.de/api/webhooks/content-changed`
3. **Header:** `x-webhook-secret: <secret>` (in Vercel-Env-Vars als `SUPABASE_WEBHOOK_SECRET` pflegen, gleicher Wert)
4. **Events:** INSERT, UPDATE
5. **Payload:** Standard Supabase-Webhook-JSON

> **Wichtig:** der Webhook-Endpoint muss in `robots.ts` unter `DISALLOW_PORTALS_AND_AUTH` gepflegt sein — er soll nicht in irgendwelchen Indizes auftauchen. Aktuell ist `/api/` global disallowed → automatisch abgedeckt.

**Aufwand:** 1–2 h für Endpoint + Supabase-Setup, plus ~30 Min für `unstable_cache`-Wrapping im Stadt-Page-Template.

---

## Layer 3 — Cron-Pre-Warm + IndexNow-Push

Wenn L1+L2 mal nicht greifen (z.B. neuer Spoke wurde committed aber kein Daten-Webhook hat gefeuert), holt der Cron es täglich auf.

### Neue Cron-Route

Neue Datei `src/app/api/cron/refresh-feeds/route.ts` (analog zu den existierenden Crons):

```ts
import { SITE_URL } from '@/lib/seo/jsonld'
import { STAEDTE } from '@/app/kfz-gutachter/staedte'

const INDEXNOW_KEY = process.env.INDEXNOW_KEY!
const CRON_SECRET = process.env.CRON_SECRET!

export async function GET(req: Request) {
  // Vercel-Cron sendet automatisch Bearer Token wenn konfiguriert
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  // 1. Pre-Warm: alle 4 Feeds pullen damit der Edge-Cache frisch ist
  const feedUrls = [
    `${SITE_URL}/feed.xml`,
    `${SITE_URL}/feed.json`,
    `${SITE_URL}/feed/katalog.xml`,
    `${SITE_URL}/feed/katalog.json`,
    `${SITE_URL}/llms.txt`,
    `${SITE_URL}/llms-full.txt`,
    `${SITE_URL}/sitemap.xml`,
  ]
  await Promise.all(
    feedUrls.map((url) => fetch(url, { headers: { 'user-agent': 'ClaimondoFreshnessCron/1.0' } }))
  )

  // 2. IndexNow-Ping für Feed-URLs + die 20 Stadt-Pages mit dem neuesten lastUpdated
  const latestStaedte = [...STAEDTE]
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 20)
    .map((s) => `${SITE_URL}/kfz-gutachter/${s.slug}`)

  const indexNowPayload = {
    host: 'claimondo.de',
    key: INDEXNOW_KEY,
    keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
    urlList: [...feedUrls, ...latestStaedte],
  }
  await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(indexNowPayload),
  })

  return Response.json({ prewarmed: feedUrls.length, indexnowed: feedUrls.length + latestStaedte.length })
}
```

### Vercel-Cron-Konfiguration

In `vercel.json` (additiv zu bestehenden Crons):

```json
{
  "crons": [
    // … bestehende Crons unverändert
    {
      "path": "/api/cron/refresh-feeds",
      "schedule": "0 6 * * *"
    }
  ]
}
```

`0 6 * * *` = täglich um 06:00 UTC = 07:00/08:00 MEZ/MESZ. Vor dem geschäftlichen Tagesbeginn = User-Pull-Verkehr trifft auf warmen Edge-Cache.

**Aufwand:** 30 Min für Route + Cron-Eintrag.

---

## Hebel 1 — Per-Stadt `lastUpdated` (sofort umsetzbar)

### Datenmodell-Erweiterung in `staedte.ts`

```ts
type Stadt = {
  // … bestehende Felder
  lastUpdated: string  // ISO-Datum 'YYYY-MM-DD'
}
```

Initial-Befüllung: alle 61 Städte bekommen `lastUpdated: '2026-05-24'` (heute). Bei zukünftigen Stadt-Edits (neue SV-Spannen, neue FAQ-Antwort) das Datum mitziehen.

### Sitemap-Anpassung

In `src/app/sitemap.ts` der `STAEDTE.map`-Block:

```ts
...STAEDTE.map((s) => ({
  url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
  lastModified: new Date(s.lastUpdated),  // statt globalem `now`
  changeFrequency: 'monthly' as const,
  priority: 0.85,
})),
```

### Optional: Helper zur Pflege

Klein-Skript `scripts/touch-stadt.mjs <slug>` das `lastUpdated` einer Stadt auf heute setzt — verhindert dass manuelles Editieren das Datum vergisst:

```js
// scripts/touch-stadt.mjs
import fs from 'node:fs'
const slug = process.argv[2]
const path = 'src/app/kfz-gutachter/staedte.ts'
const today = new Date().toISOString().slice(0, 10)
let content = fs.readFileSync(path, 'utf8')
const regex = new RegExp(`(slug:\\s*['"]${slug}['"][\\s\\S]*?lastUpdated:\\s*['"])\\d{4}-\\d{2}-\\d{2}(['"])`)
content = content.replace(regex, `$1${today}$2`)
fs.writeFileSync(path, content)
console.log(`Stadt ${slug} touched → ${today}`)
```

**Aufwand:** 30 Min Initial-Befüllung + 5 Sek pro zukünftigem Stadt-Edit.

---

## Hebel 2 — Dynamische Lokal-Sections (DSGVO-Mittelweg)

### Drei Sections, alle Supabase-gebunden, mit unstable_cache + Tags

**Section 1: „X aktive Fälle aus {Stadt} in den letzten 30 Tagen"**

Reine Aggregat-Zahl, kein Personenbezug. DSGVO trivial.

```ts
async function getStadtFallzahl(plzPrefix: string): Promise<number> {
  const supabase = await createServerClient()
  const [low, high] = plzPrefix.split('–')
  const { count } = await supabase
    .from('faelle')
    .select('*', { count: 'exact', head: true })
    .gte('erstellt_am', new Date(Date.now() - 30 * 86400_000).toISOString())
    .gte('kunde_plz', low + '000')
    .lte('kunde_plz', (high ?? low) + '999')
  return count ?? 0
}
```

**Threshold:** Wenn Count < 5 → Section nicht ausspielen oder mit „aktuelle Periode" formulieren. Verhindert Identifizierbarkeit kleiner Städte mit wenig Volumen (k-anonymity-light).

**Section 2: „Zuletzt behandelt in {Stadt}: 3 Beispiele"**

Abstrahierte Einzel-Fälle. **DSGVO-Schutzregeln** (in dieser Reihenfolge erzwingen):

| Feld | Erlaubte Form | Verboten |
|---|---|---|
| Datum | nur Monat + Jahr („Mai 2026") | konkretes Datum |
| Schadenshöhe | Bucket (5.000–10.000 € / 10.000–15.000 € / 15.000–25.000 € / 25.000 €+) | exakter Betrag |
| Fahrzeug | Hersteller + Klasse („BMW 3er", „Tesla Model Y") | VIN, Kennzeichen, Farbe, Baujahr |
| Schadensart | grobe Kategorie („Auffahrunfall", „Parkschaden", „Totalschaden") | Detail-Beschreibung |
| Stadt | Ja, das ist ja der Kontext | konkrete Straße oder Stadtteil |

```ts
async function getAbstractedRecentCases(plzPrefix: string, limit = 3) {
  const supabase = await createServerClient()
  const [low, high] = plzPrefix.split('–')
  const { data } = await supabase
    .from('faelle')
    .select('erstellt_am, schadenshoehe, fahrzeug_hersteller, fahrzeug_modell, schadensart')
    .gte('kunde_plz', low + '000')
    .lte('kunde_plz', (high ?? low) + '999')
    .eq('status', 'abgeschlossen')   // nur abgeschlossene Fälle, schützt offene Prozesse
    .order('erstellt_am', { ascending: false })
    .limit(limit)

  return (data ?? []).map((f) => ({
    monat: new Date(f.erstellt_am).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    bucket: bucketize(f.schadenshoehe),
    fahrzeug: `${f.fahrzeug_hersteller} ${f.fahrzeug_modell?.split(' ')[0] ?? ''}`.trim(),
    schadensart: f.schadensart,
  }))
}

function bucketize(betrag: number): string {
  if (betrag < 5000) return 'unter 5.000 €'
  if (betrag < 10000) return '5.000–10.000 €'
  if (betrag < 15000) return '10.000–15.000 €'
  if (betrag < 25000) return '15.000–25.000 €'
  return '25.000 €+'
}
```

**Min-Pool:** Wenn weniger als 10 abgeschlossene Fälle in der Stadt in den letzten 6 Monaten → Section nicht zeigen (k=10 ist konservativer Schutz vor Re-Identifikation).

**DSB-Check:** Vor Live-Schaltung Datenschutzbeauftragten beauftragen, die DSGVO-Konformität dieser Bucket-Strategie schriftlich abzusegnen. Aufwand-Schätzung 1 h DSB-Review.

**Section 3: „Y zertifizierte Sachverständige in {Stadt}"**

```ts
async function getStadtSVCount(plzPrefix: string): Promise<number> {
  const supabase = await createServerClient()
  const [low, high] = plzPrefix.split('–')
  const { count } = await supabase
    .from('sachverstaendige')
    .select('*', { count: 'exact', head: true })
    .eq('aktiv', true)
    .gte('plz', low + '000')
    .lte('plz', (high ?? low) + '999')
  return count ?? 0
}
```

Wenn Count = 0 → „bundesweites Partner-Netzwerk verfügbar" als Fallback-Text (Wahrheit + nicht negativ).

### Integration ins Stadt-Page-Template

```tsx
// src/app/kfz-gutachter/[stadt]/page.tsx
import { unstable_cache } from 'next/cache'

const getStadtLiveData = unstable_cache(
  async (stadt: Stadt) => {
    const [fallzahl, recentCases, svCount] = await Promise.all([
      getStadtFallzahl(stadt.plzPrefix),
      getAbstractedRecentCases(stadt.plzPrefix),
      getStadtSVCount(stadt.plzPrefix),
    ])
    return { fallzahl, recentCases, svCount }
  },
  ['stadt-live-data'],
  {
    tags: (stadt: Stadt) => [`stadt-${stadt.plzPrefix}`],
    revalidate: 3600,
  }
)
```

Und in der Page-JSX neue Section zwischen bestehender Section 4 (Lokal-Block) und Section 5 (BGH-Authority-Grid) einfügen — `LokalLiveSection` (extrahierbar als `shared/LokalLiveSection.tsx` für Konsistenz mit dem Stadt-Page-Pattern).

**Aufwand:** 4–6 h für die drei Helper-Queries + Section-Komponente + DSB-Review.

---

## Hebel 3 — LocalBusiness-Schema-Erweiterung

Aktuelles Schema generiert LegalService + Service + HowTo + FAQPage + Breadcrumb. Drei Felder fehlen die Google für Knowledge-Panel-Triggering und Local-Pack-Display braucht:

```ts
// in src/lib/seo/jsonld.ts oder vergleichbar — Erweiterung der LegalService-Schema-Funktion
{
  '@type': 'LegalService',
  // … bestehende Felder
  image: [
    `${SITE_URL}/brand/hero-unfall-frau.png`,   // primary
    `${SITE_URL}/claimondo-logo.svg`,
  ],
  priceRange: '€€',
  aggregateRating: stadtLiveData.fallzahl >= 10 ? {
    '@type': 'AggregateRating',
    ratingValue: '4.8',                          // ← später aus echten Reviews
    reviewCount: stadtLiveData.fallzahl,         // Annäherung bis echte Reviews da sind
    bestRating: '5',
    worstRating: '1',
  } : undefined,
  // Pro Stadt-Page: areaServed als GeoCircle mit lat/lng + Radius
  areaServed: {
    '@type': 'GeoCircle',
    geoMidpoint: {
      '@type': 'GeoCoordinates',
      latitude: stadt.lat,
      longitude: stadt.lng,
    },
    geoRadius: '25000',  // 25km, in m
  },
}
```

> **Achtung Trust-Sensible:** `aggregateRating` mit gefälschten oder geschätzten Werten ist UWG-relevant (irreführende Werbung). Bis echte Reviews aus ProvenExpert/Trustpilot-Integration kommen, lieber `aggregateRating` weglassen und stattdessen `numberOfEmployees` oder `foundingDate` der Org als Trust-Marker. Diese Empfehlung der `aggregateRating`-Sektion in den Code-Sample nur _aktivieren_ wenn echte Daten vorhanden sind — sonst auskommentieren.

**Aufwand:** 1 h Code + 30 Min Schema-Validator-Check.

---

## Zusammenspiel der Layer am Beispiel

**Szenario:** Aaron registriert um 14:23 einen neuen SV in Köln über das Admin-Portal.

1. Insert in Supabase-Tabelle `sachverstaendige` mit `plz: 50667, aktiv: true, …`
2. **Supabase Database Webhook** feuert → POST an `/api/webhooks/content-changed`
3. **Webhook-Endpoint** mapped `plz: 50667` auf `stadt-50–51`, ruft `revalidateTag('stadt-50–51')` + `revalidateTag('feed-katalog')`
4. Beim nächsten Request auf `/kfz-gutachter/koeln`: Page wird neu generiert, `getStadtSVCount` läuft, Section zeigt neue Zahl
5. Beim nächsten Pull von `/feed/katalog.xml`: Katalog wird neu generiert (Stadt-Items haben aktualisiertes lastModified)
6. Am nächsten Morgen 06:00 UTC läuft `/api/cron/refresh-feeds` ohnehin und pingt IndexNow mit der Köln-URL → Bing/ChatGPT-Search-Pipeline wird informiert
7. **L1-Fallback:** Selbst wenn der Webhook aus irgendeinem Grund nicht feuert (Network-Glitch), würde die Page spätestens nach 1h durch `revalidate = 3600` neu generieren

---

## Sprint-Plan (parallel, ~4–6 Dev-Tage)

| Phase | Dauer | Aufgabe | Owner |
|---|---|---|---|
| **P1** | Tag 1 | L1: `revalidate`-Direktiven in 6 Routes setzen + Pillar-Page | Dev |
| **P1** | Tag 1 | H1: `lastUpdated`-Feld in `staedte.ts` für alle 61 Städte, Sitemap-Anpassung, `touch-stadt.mjs`-Helper | Aaron + Dev |
| **P1** | Tag 1 | H3: LocalBusiness-Schema-Erweiterung (ohne `aggregateRating` bis Reviews da sind) | Dev |
| **P2** | Tag 2 | L3: `/api/cron/refresh-feeds`-Route + `vercel.json`-Eintrag + ENV-Vars setzen | Dev |
| **P2** | Tag 2 | L3-Verifikation: Cron lokal mit `curl` und gefälschtem Auth-Header testen | Dev |
| **P3** | Tag 3–4 | L2-Teil-A: `/api/webhooks/content-changed`-Endpoint, Tag-Mapping-Logik, Secret-Validation | Dev |
| **P3** | Tag 3–4 | L2-Teil-B: Stadt-Page-Template auf `unstable_cache` mit Tags umstellen | Dev |
| **P3** | Tag 3–4 | L2-Teil-C: Supabase Database-Webhooks im Dashboard konfigurieren | Aaron |
| **P3** | Tag 4 | L2-Smoke-Test: Test-Insert in `faelle` triggert Webhook → Page-Revalidation messbar im Vercel-Log | Aaron + Dev |
| **P4** | Tag 5 | H2-Teil-A: Drei Helper-Queries (`getStadtFallzahl`, `getAbstractedRecentCases`, `getStadtSVCount`) | Dev |
| **P4** | Tag 5 | H2-Teil-B: DSB-Review der Bucket-Strategie + abstrahierten Cases (parallel) | Aaron + DSB |
| **P4** | Tag 6 | H2-Teil-C: `LokalLiveSection`-Komponente, Integration ins Stadt-Page-Template, k-anonymity-Threshold-Logik | Dev |
| **P5** | Tag 6 | Build grün, alle Schemas via validator.schema.org, Lighthouse pro Stadt-Page ≥ 90 | Aaron |

## Definition of Done

### Layer 1
- [ ] `export const revalidate` in 6 Routes gesetzt (Stadt-Page, Pillar, 4 Feed-Routes)
- [ ] Build grün, ISR-Cache-Verhalten in Preview manuell verifiziert

### Layer 2
- [ ] `/api/webhooks/content-changed/route.ts` deployed, antwortet auf Test-Request mit 401 (ohne Secret) und 200 (mit Secret)
- [ ] Stadt-Page rendert über `unstable_cache` mit korrektem Tag (in Vercel-Logs sichtbar)
- [ ] Supabase Database-Webhooks für `faelle` (INSERT, UPDATE) konfiguriert + getestet
- [ ] Test-Insert in `faelle` triggert Webhook → in Vercel-Logs taucht `revalidateTag` auf
- [ ] `SUPABASE_WEBHOOK_SECRET` in Vercel-Env-Vars und Supabase-Dashboard identisch

### Layer 3
- [ ] `/api/cron/refresh-feeds/route.ts` deployed, manuell mit Bearer-Token aufrufbar
- [ ] `vercel.json` hat den neuen Cron-Eintrag, Vercel-Dashboard zeigt ihn unter „Crons" als aktiv
- [ ] `INDEXNOW_KEY` Env-Var gesetzt, Key-File `public/<key>.txt` deployed
- [ ] Erste Cron-Ausführung in Vercel-Logs sichtbar mit IndexNow-Response 200

### Hebel 1
- [ ] Alle 61 Städte haben `lastUpdated` im Format `YYYY-MM-DD`
- [ ] Sitemap-Output zeigt per-Stadt unterschiedliche `lastmod`-Werte (`curl https://claimondo.de/sitemap.xml | grep koeln` ergibt anderes Datum als gleicher Grep auf hamburg)
- [ ] `scripts/touch-stadt.mjs` funktioniert end-to-end

### Hebel 2
- [ ] Drei Supabase-Queries als Helper extrahiert + getestet
- [ ] `LokalLiveSection`-Komponente in `shared/` extrahiert wenn >1 Consumer
- [ ] k-anonymity-Thresholds (Count ≥ 5 für Aggregat, Min-Pool 10 für Recent-Cases) implementiert und in Code dokumentiert
- [ ] DSB-Review schriftlich dokumentiert (in `docs/datenschutz/lokal-live-section-dsb-2026.md`)
- [ ] Auf Test-Stadt (z.B. Köln mit hohem Volumen) visuell die drei Sections verifiziert
- [ ] Edge-Case: Stadt mit < 5 Fällen rendert Fallback statt Zahl

### Hebel 3
- [ ] LocalBusiness-Schema enthält `image[]`, `priceRange`, `areaServed` als `GeoCircle`
- [ ] `aggregateRating` _nicht_ aktiviert bis echte Reviews vorhanden
- [ ] Schema.org Validator: 0 Errors

---

## Risiken & Gegenmaßnahmen

| Risiko | Wahrscheinlichkeit | Gegenmaßnahme |
|---|---|---|
| Supabase-Webhook-Volume blockiert Webhook-Endpoint bei Massen-Inserts | mittel | Rate-Limit + Async-Processing per Queue (Trigger Background-Function statt synchron revalidieren) |
| `kunde_plz`/`unfall_plz`-Feldname stimmt nicht mit echter DB-Schema überein | mittel | **Vor Code-Schreiben**: per Supabase-MCP echte Spalten-Namen verifizieren (siehe AGENTS.md §post-task-audit Punkt 6) |
| Migrations-Drift erschwert spätere `staedte`-Tabellen-Migration | bestehend (AAR-600-Parallele) | Separate Backlog-Task: bestehende Migrations dokumentieren + Drift-Bereinigung. Nicht Teil dieses Plans |
| DSB winkt H2 nicht durch | mittel | H2-Teil-A und -C trotzdem bauen (Code ist da, kostet wenig). Nur die Section aus dem Page-Template wieder rausnehmen wenn DSB sagt „nein" |
| `aggregateRating` aus Versehen aktiviert ohne echte Reviews | niedrig | Code-Comment + Linter-Regel die das Feld in `LegalService` nur erlaubt wenn `reviewCount > 0` aus echter DB |
| Cron läuft, aber ENV-Vars in Vercel sind leer → 401 in Endless-Loop | niedrig | DoD-Punkt „erste Cron-Ausführung in Vercel-Logs verifiziert mit 200" |

---

## Folge-Backlog (separate Tasks)

- [ ] **Migrations-Platzhalter-Bereinigung** — alle `-- Placeholder`-Migrations gegen die Live-DB-Schema verifizieren, echte Migrationen rückwirkend dokumentieren (siehe AGENTS.md Regel 2 + AAR-600-Pattern). Nicht Teil dieses Plans, aber Vorbedingung für sauberen `staedte`-Tabellen-Migration in Q3/Q4.
- [ ] **Echte Reviews-Pipeline** (ProvenExpert/Trustpilot-Integration mit Lokal-Tagging) → ermöglicht `aggregateRating` in Hebel 3.
- [ ] **CMS-Workflow für Stadt-Daten** → falls Aaron mehrere Städte parallel pflegen will ohne Code-Edit, Migration STAEDTE → Supabase-Tabelle.
- [ ] **Geo-Polygon statt `GeoCircle`** in `areaServed` — präziser als 25km-Radius, lohnt sich bei späterer Local-SEO-Vertiefung.
- [ ] **Common-Crawl-Snapshot-Check** Mitte Juli: prüfen ob Stadt-Pages mit ihrem neuen Schema und den dynamischen Sections im Snapshot landen.

---

## Verbindung zu anderen GEO-Plänen

- **`geo-sprint-vergleich-und-wissen-2026-05-24.md`** — Beschleunigungs-Hebel-Kapitel referenziert IndexNow-Ping; dieser Plan implementiert die _automatisierte_ Variante (Cron) zusätzlich zum manuellen Live-Day-Ping.
- **`geo-feeds-spec-2026-05-24.md`** — Feed-Routes brauchen L1 (`revalidate`) aus diesem Plan. Feed-Output bekommt die echten Stadt-`lastModified`-Werte aus Hebel 1.
- **`geo-messung-2026-05-24.md`** — Re-Test 07.06. wird zeigen ob L1+L3 bereits Wirkung zeigt. L2 + H2 brauchen erfahrungsgemäß den 8-Wochen-Re-Test (~05.07.) für sichtbare Effekte.

---

## Quellen / Spec-Referenzen

- [Next.js Data Cache + `unstable_cache`](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [Next.js `revalidateTag`](https://nextjs.org/docs/app/api-reference/functions/revalidateTag)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [IndexNow Spec](https://www.indexnow.org/documentation)
- [Schema.org LocalBusiness](https://schema.org/LocalBusiness)
- [DSGVO Anonymisierung / k-Anonymität (BfDI)](https://www.bfdi.bund.de/)
- AGENTS.md §claimondo-hard-rules (Regel 2: DDL nur via supabase-CLI)
- AGENTS.md §post-task-audit (DB-Spalten-Verifikation via Supabase-MCP)
