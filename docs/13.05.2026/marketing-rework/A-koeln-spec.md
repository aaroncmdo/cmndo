# Sub-Projekt A · Köln Premium-Stadt-Rework — Design-Spec

**Linear-Ticket:** AAR-XXX (Aaron legt parallel an — Branch-Name wird beim Push umbenannt)
**Branch:** `kitta/koeln-premium-stadt-rework` (Worktree `.claude/worktrees/koeln-premium-stadt-rework`, von `staging` abgeleitet, HEAD `1ef129a8`)
**PR-Ziel:** `staging` (niemals `main`)
**Voraussichtlicher Aufwand:** 1–1.5 Entwickler-Tage (~6–10 h netto)
**Stand:** 13.05.2026

> **Lese-Reihenfolge:** Erst die `ROADMAP.md` daneben überfliegen (gibt das große Bild). Dieser Spec ist das Detail für die erste Bauchlandung — Köln als Premium-Page mit der vollen 17-Section-Architektur, gleichzeitig wird die wiederverwendbare Section-Library für alle Folge-Städte/-Seiten extrahiert.

---

## 1 · Ziel & Erfolgsdefinition

`/kfz-gutachter/koeln` ist nach Merge:

1. **Conversion-tauglich** — Lead-Form prominent über dem Fold, sticky-Mobile-Call-Bar, Trust-Stack mit 47 echten Google-Reviews + 4 KPIs.
2. **GEO-zitierbar** — 6 Schema-Objekte (Organization, LegalService, Service, HowTo, FAQPage, BreadcrumbList), Quotable Statements, Princeton-GEO-Patterns 1–6, ≥35 benannte Entities pro Page.
3. **Wartbar** — Page besteht aus komponierten Sections aus `@/components/landing/sections/*`, nicht aus 800 LOC Inline-JSX. Jede Section ist von Folge-Städten (Sub-Projekt C) und Folge-Seiten (D, E) wiederverwendbar.
4. **Ads-kompatibel** — Maiks bestehende Google-Ads-Kampagne kann ohne URL-Wechsel weiterlaufen: `/kfz-gutachter-koeln` existiert als Alias-Route mit `canonical = /kfz-gutachter/koeln` (URL-Strategie Variante 2 aus Roadmap §4).
5. **AGENTS.md-konform** — claimondo-* Tokens, Umlaute, Result-Object-Server-Actions, keine Konstanten-Exporte aus `'use server'`-Files, 7-Punkte-Audit im Commit-Body.

**Nicht-Ziel (bewusst out-of-scope):**
- Andere Städte umstellen (kommt in Sub-Projekt C)
- Homepage `/` umbauen (kommt in D)
- Conversion-Seiten `/vorteile` etc. (kommt in E)
- Live-Google-Places-API-Integration (Phase 2 — erstmal Snapshot)
- llms.txt, GA4-Tracking, robots.txt-AI-Allow (kommen in F · GEO-Querschnitt, ich ziehe sie partiell in A rein wo unvermeidbar)

---

## 2 · Architektur

### 2.1 Verzeichnis-Baum (Soll-Zustand nach A)

```
src/
├── app/
│   ├── kfz-gutachter/
│   │   ├── [stadt]/
│   │   │   └── page.tsx                       ← REFACTOR: komponiert Sections
│   │   ├── staedte.ts                         ← EXTEND: Köln-Record + StadtKontext
│   │   └── …
│   └── kfz-gutachter-koeln/
│       └── page.tsx                           ← NEU: Ads-Alias, re-rendert [stadt]=koeln + canonical
├── components/
│   └── landing/
│       ├── LandingTopbar.tsx                  ← bleibt unverändert
│       ├── LandingFooter.tsx                  ← bleibt
│       ├── StickyCallBar.tsx                  ← bleibt
│       ├── AnswerCapsule.tsx                  ← bleibt
│       └── sections/                          ← NEU
│           ├── index.ts                       ← Barrel-Export
│           ├── types.ts                       ← StadtKontext, KpiItem, FaqItem
│           ├── HeroImageBand.tsx              ← Server
│           ├── HeroLeadForm.tsx               ← Server-Wrapper + Client-Form
│           ├── GoogleReviewsCarousel.tsx      ← Client (snake-snap-x scroll)
│           ├── TrustStrip.tsx                 ← Server
│           ├── AufklaerungCards.tsx           ← Server
│           ├── VersichererTaktikenTabelle.tsx ← Server
│           ├── BghAuthorityGrid.tsx           ← Server
│           ├── PortalMockupShowcase.tsx       ← Server
│           ├── ProzessFuenfSchritte.tsx       ← Server
│           ├── WertminderungTabelle.tsx       ← Server
│           ├── SiebenFehlerListe.tsx          ← Server
│           ├── BeraterCard.tsx                ← Server
│           ├── EinsatzgebietNrwKarte.tsx      ← Server (Static PNG)
│           ├── TeslaEAutoSpezial.tsx          ← Server
│           ├── FaqAccordion.tsx               ← Server (<details>)
│           ├── GruenderSection.tsx            ← Server
│           ├── BottomCta.tsx                  ← Server
│           ├── LokalBlock.tsx                 ← Server (bleibt aus aktueller Page extrahiert)
│           └── CrossCityPills.tsx             ← Server (bleibt extrahiert)
├── data/
│   └── google-reviews.ts                      ← NEU: Snapshot, Aaron-pflegt
└── lib/
    └── seo/
        ├── jsonld.ts                          ← EXTEND: howToSchema, knowsAbout, aggregateRating
        └── quotables.ts                       ← NEU: zentrale Quotable-Statements
public/marketing-landing-koeln/                ← NEU: 11 Assets aus Handoff
src/app/marketing-actions.ts                   ← NEU: submitMarketingLead Server-Action
```

### 2.2 Datenfluss

```
URL /kfz-gutachter/koeln (oder /kfz-gutachter-koeln Alias)
   │
   ▼
Next.js Server Component  src/app/kfz-gutachter/[stadt]/page.tsx
   │  (statisch generiert via generateStaticParams aus STAEDTE)
   │
   ├─ getStadtBySlug('koeln')  →  StadtKontext (slug, name, BVSK, partnerSVs, lat, lng, lokal, …)
   ├─ google-reviews.ts        →  ReviewSnapshot (rating, count, items[])
   ├─ jsonLdScript([…])        →  6 Schemas inkl. HowTo + AggregateRating
   │
   ▼
<LandingTopbar authenticatedUser={null} />            ← Auth bleibt anonym (Marketing)
<HeroImageBand stadt={...} />
<HeroLeadForm stadt={...} source="koeln-hero" />      ← rendert <LeadFormClient/>
<GoogleReviewsCarousel snapshot={...} />
<TrustStrip kpis={...} />
<AufklaerungCards />
<VersichererTaktikenTabelle />
<BghAuthorityGrid />
<PortalMockupShowcase />
<ProzessFuenfSchritte />
<WertminderungTabelle />
<SiebenFehlerListe />
<BeraterCard />
<EinsatzgebietNrwKarte stadt={...} />
<TeslaEAutoSpezial />
<FaqAccordion items={buildKoelnFaq(stadt)} />
<GruenderSection />
<LokalBlock stadt={...} />
<CrossCityPills currentSlug="koeln" />
<BottomCta />
<LandingFooter />
<StickyCallBar quelle="Kfz-Gutachter Köln" />
<TrackingHooks />                                     ← Client, hooked auf [data-tracking]
```

Andere Städte (`/kfz-gutachter/duesseldorf` etc.) rendern bis Sub-Projekt C **dieselbe** Komposition mit ihrem `stadt`-Record — Sections sind generisch genug, dass die fehlenden Daten (Hero-Foto pro Stadt, Reviews-Snapshot pro Stadt) auf Default zurückfallen.

→ **Akzeptiertes Trade-off:** Düsseldorf zeigt mit Sub-Projekt A „Köln-Reviews" oder generische Claimondo-Reviews. Aaron bestätigt das ist OK bis C kommt (alle Sections funktionieren mit dem Default-Review-Snapshot bis pro-Stadt-Daten existieren).

### 2.3 Section-Boundary-Prinzip

Jede Section ist eine eigenständige Unit mit:
- **Ein klares Why:** „Vermittelt §3 Versicherer-Kürzungen-Logik" (VersichererTaktikenTabelle), nicht „macht den Mittelteil hübsch".
- **Schmales Props-Interface:** Stadt-spezifische bekommen `stadt: Stadt` aus `staedte.ts`. Globale Sections sind props-los oder haben einen einzelnen Daten-Prop.
- **Server-Component by default** — Client nur wo unvermeidbar (Carousel-Scroll, Form-State, Toast).
- **Tokens, nicht Hex** — `bg-claimondo-navy` / `rounded-ios-md` / `shadow-claimondo-sm`. Keine `#0D1B3E`-Strings.
- **i18n-ready** — alle Texte als JSX-Literal (kein dynamic-templating, kein gettext), aber **deutsch** (siehe AGENTS.md Sprache).

→ Diese Constraints sind der Hebel, der C/D/E billig macht. Wenn eine Section in A korrekt designt ist, ist sie in C ohne Touch wiederverwendbar.

---

## 3 · Komponenten-Specs (Sections)

Detail-Specs pro Section. Reihenfolge wie auf der Page.

### 3.1 `HeroImageBand` (Server)
**Zweck:** Foto-Banner über dem Hero — Mann/Frau mit Quote, Trust-Signal vor dem Fold.
**Props:** `{ stadt: Stadt; quote: { text: string; autor: string } }`
**Assets:** `/marketing-landing-koeln/hero-woman.png` oder `hero-man.png` (Aaron entscheidet pro Page, default `hero-woman`)
**Bemerkung:** `priority` auf das `next/image`, sonst LCP-Killer.

### 3.2 `HeroLeadForm` (Server + Client)
**Zweck:** Über-Fold Lead-Capture mit H1 + Subhead + 3-Feld-Form.
**Props:** `{ stadt: Stadt; source: string }` — source = `koeln-hero` für Tracking
**Form-Felder:** Name, Telefon, Stadt (vorausgefüllt = stadt.name)
**Server-Action:** `submitMarketingLead(formData, source)` aus `src/app/marketing-actions.ts`
**Client-Child:** `<LeadFormClient stadt={...} source={source} />` — Zod-Validation + useTransition + sonner-Toast + `gtag('event', 'generate_lead', ...)`
**A11y:** `<label htmlFor>` an jedem Input, `aria-describedby` für Fehler.

### 3.3 `GoogleReviewsCarousel` (Client)
**Zweck:** Snake-Scroll-Carousel mit 5–8 echten Google-Reviews.
**Props:** `{ snapshot: ReviewSnapshot }` aus `src/data/google-reviews.ts`
**ReviewSnapshot-Shape:**
```ts
type ReviewSnapshot = {
  rating: number          // 5.0
  count: number           // 47
  placeId: string         // Google Maps Place-ID (für sameAs in Schema)
  items: Array<{
    author: string        // 'Sarah K.'
    rating: number        // 5
    text: string          // 'Schneller, professioneller Service…'
    relativeTime: string  // 'vor 2 Wochen'
    avatarUrl?: string
  }>
}
```
**Snapshot-Daten:** `src/data/google-reviews.ts` enthält erstmal einen Default + leeren `byStadt`-Map. Aaron liefert echte Reviews (Copy aus Google-Business-Backend). Bis dahin: 5 plausible Placeholder mit Hinweis-Kommentar im File.
**Aggregate-Rating:** `rating=5.0, count=47` (laut Handoff README). Wird auch in `LegalService`-Schema referenziert.

### 3.4 `TrustStrip` (Server)
**Zweck:** 4 KPI-Cards in einer Reihe.
**Props:** `{ kpis: KpiItem[] }`
**Default-KPIs** (aus `staedte.koeln`-Record): „23 DAT-Partner", „<48h Termin", „0 € Eigenanteil §249 BGB", „⭐ 5.0 / 47 Reviews"

### 3.5 `AufklaerungCards` (Server)
**Zweck:** 4 Cards mit Anti-Patterns („Versicherungs-Gutachter nehmen?" — „Nein, weil…"). Quotable-Statements aus Wissensdatenbank §3.
**Props:** keine — global gleich

### 3.6 `VersichererTaktikenTabelle` (Server)
**Zweck:** Tabelle mit HUK / LVM / AXA / generisch + ControlExpert / K-Expert / DEKRA + typische Kürzungspositionen + BGH-Gegenargument.
**Datenquelle:** Wissensdatenbank §2, §15
**Layout:** statisches `<table>` mit Tailwind-Tokens — `shared/DataTable` ist für scroll-/sortierbare Daten-Listen overkill, eine Marketing-Tabelle mit fester Größe und ohne Interaktion braucht das nicht. Aber: keine inline-Hex, nur `bg-claimondo-bg` etc.

### 3.7 `BghAuthorityGrid` (Server)
**Zweck:** 8 BGH-Aktenzeichen als Cards mit Aktenzeichen + Quote + Wirkung.
**Daten:** statisches Array im Component:
- VI ZR 38/22, 239/22, 253/22, 266/22, 51/23 (Werkstattrisiko)
- VI ZR 65/18 (UPE)
- VI ZR 174/24 (Beilackierung)
- VI ZR 53/09 (Markenwerkstatt)
- VI ZR 119/04 (Restwert regional)
- VI ZR 357/03 (Wertminderung)
- VI ZR 67/91 (130%-Regel)
- VI ZR 280/22 (SV-Risiko)
**Authority-Effekt:** GEO-Pattern „Cite Sources" + „Authoritative Tone"

### 3.8 `PortalMockupShowcase` (Server)
**Zweck:** „Wie Uber, aber für Schäden" — zeigt 3 Portal-Mockups aus `portal-mockups/v2/*` mit Caption.
**Assets:** `01-portal-dashboard-desktop.svg`, `02-portal-mobile-app.svg`, `03-case-timeline-12-schritte.svg`
**Pfad:** `/marketing-landing-koeln/portal-mockups/*.svg`

### 3.9 `ProzessFuenfSchritte` (Server)
**Zweck:** 5-Schritt-Glass-Cards (Meldung → Vermittlung → Besichtigung → Gutachten → Auszahlung).
**Glass-Surface:** `bg-white/65 backdrop-blur-md` über Hintergrund-Gradient

### 3.10 `WertminderungTabelle` (Server)
**Zweck:** Sanden/Danner-Tabelle (Faustformel + Beispielrechnungen pro Betriebsjahr).
**Quotable:** „Im 2. Jahr typisch 20 % der Reparaturkosten als merkantile Wertminderung."

### 3.11 `SiebenFehlerListe` (Server)
**Zweck:** 7 typische Fehler nach Unfall (Wissensdatenbank §12) als nummerierte Cards mit Begründung.

### 3.12 `BeraterCard` (Server)
**Zweck:** Foto + Name + Quote eines Beraters/Senior-SVs als Trust-Anker.
**Asset:** `/marketing-landing-koeln/berater.png`
**Quote:** „Wenn die Versicherung den ControlExpert ansetzt, ist das ein Schnell-Check ohne Fahrzeug. Wir gehen ran und reden mit der Werkstatt."

### 3.13 `EinsatzgebietNrwKarte` (Server)
**Zweck:** NRW-Karte mit Pin auf Stadt + Liste der Partner-SVs-Counts pro Großstadt.
**Asset:** `/marketing-landing-koeln/nrw-karte.png` (PNG, kein interaktives Map — gewollt, hält Perf grün)

### 3.14 `TeslaEAutoSpezial` (Server)
**Zweck:** Sektion zu Tesla / E-Auto Spezialfällen (Wissensdatenbank §16 — Steuergeräte unter Schwellern, DAT/Audatex-Gap, Spätfolgen, Spezialgutachter zwingend).
**Quotable:** „Standard-Gutachten 22.000 €. Mit Tesla-Originaldaten: 48.000 €. Das ist kein Schätzfehler — das ist DAT/Audatex ohne korrekte Verbundzeiten."

### 3.15 `FaqAccordion` (Server)
**Zweck:** `<details>`-Accordion mit FAQ-Items.
**Props:** `{ items: FaqItem[] }`
**Köln-Items:** 10 statt 5 — die 5 aus aktueller `buildStadtFaq` + 5 neue aus Handoff (Tesla, Werkstattrisiko, fiktive Abrechnung, Quotenvorrecht, 130%-Regel).
**Schema:** Items werden ALLE auch in `faqPageSchema` ausgespielt.

### 3.16 `GruenderSection` (Server)
**Zweck:** Foto Aaron + Nicolas + kurzer Mission-Statement (Brand-Identity-Tagline). Trust-Anker mit Gesichtern.
**Asset:** `/marketing-landing-koeln/founders.png`

### 3.17 `LokalBlock` (Server) — bleibt aus aktueller Page extrahiert
**Zweck:** Landgericht + Kammer + PLZ + Bevölkerung + BVSK-Spanne in einer AnswerCapsule.
**Aktuell:** inline in `[stadt]/page.tsx` Zeile 217–229 — wird zu Section.

### 3.18 `CrossCityPills` (Server) — bleibt aus aktueller Page extrahiert
**Zweck:** Pills mit Links zu Nachbar-Städten + „Alle Städte"-CTA.
**Modifikation für GEO §11:** statt allen Städten nur 3–4 Nachbarn (Köln → Leverkusen, Bergisch Gladbach, Bonn, Düsseldorf). `staedte.ts` bekommt Feld `nachbarstaedte: string[]`.

### 3.19 `BottomCta` (Server) — bleibt
**Aktuell:** ~Z. 281–306 inline. Wird Section.

---

## 4 · Datenmodell-Erweiterungen

### 4.1 `staedte.ts` — neue Felder pro Stadt

```ts
export type Stadt = {
  // … bestehende Felder bleiben unverändert
  slug, name, bundesland, plzPrefix, bevoelkerung, lat, lng,
  lokal: { landgericht, amtsgericht, kammer },
  bvskHonorarSpanne, partnerSVs, h1Anker,

  // NEU — alle optional, damit Sub-Projekt C die anderen Städte schrittweise hochziehen kann
  nachbarstaedte?: string[]         // 3–4 Slugs für Cross-Linking (GEO §11); Fallback in CrossCityPills = alle anderen Städte
  heroFoto?: 'man' | 'woman'        // optional; default 'woman'
  heroQuote?: { text: string; autor: string }   // optional override
  googleReviewsKey?: string         // Key in google-reviews.ts byStadt; default 'default'
  partnerSVsList?: Array<{          // optional; für „23 Partner-SVs" Detailansicht
    name: string
    titel: string                   // 'ö.b.u.v. Sachverständiger'
    spezialisierung: string[]
  }>
  kpis?: KpiItem[]                  // optional override für TrustStrip
}
```

Alle neuen Felder sind **optional**, damit Sub-Projekt C die anderen 26 Städte schrittweise hochziehen kann, ohne dass A sie alle vollständig ausfüllen muss.

### 4.2 `src/data/google-reviews.ts` — Snapshot-File

```ts
import type { ReviewSnapshot } from '@/components/landing/sections/types'

export const DEFAULT_REVIEWS: ReviewSnapshot = {
  rating: 5.0,
  count: 47,
  placeId: 'CHANGE-ME-AARON',     // Aaron liefert Google-Business Place-ID
  items: [
    // Placeholder bis Aaron Echt-Daten liefert
    { author: 'Sarah K.', rating: 5, text: '…', relativeTime: 'vor 2 Wochen' },
    // …
  ],
}

export const REVIEWS_BY_STADT: Record<string, ReviewSnapshot> = {
  koeln: DEFAULT_REVIEWS,
  // Andere Städte kommen in Sub-Projekt C
}

export function getReviewsForStadt(slug: string): ReviewSnapshot {
  return REVIEWS_BY_STADT[slug] ?? DEFAULT_REVIEWS
}
```

→ **AAR-664-Falle vermeiden:** dieses File ist **kein** `'use server'`-File. Nur normaler Modul-Export. Wird per RSC ge-tree-shaked.

### 4.3 `src/lib/seo/jsonld.ts` — Erweiterungen

```ts
// NEU: HowTo-Schema
export function howToSchema(opts: {
  name: string
  description: string
  steps: Array<{ name: string; text: string }>
}): Record<string, unknown> {/* … */}

// NEU: AggregateRating-Sub-Object (für LegalService)
export function aggregateRating(rating: number, count: number) {/* … */}

// NEU: knowsAbout-Liste (für LegalService.knowsAbout — GEO Topic-Authority)
export const KNOWS_ABOUT_DEFAULT = [
  'Schadensregulierung', 'Kfz-Sachverständigengutachten',
  '§249 BGB Schadensersatz', '§164 BGB Sicherungsabtretung',
  'BVSK-Honorartabelle', 'Sanden/Danner-Formel',
  'Werkstattrisiko-Rechtsprechung BGH', 'Wertminderung',
] as const
```

### 4.4 `src/lib/seo/quotables.ts` — NEU

```ts
// Zentrale Quotable-Statements aus Wissensdatenbank.
// Sections referenzieren per Key, damit Wording einheitlich bleibt.

export const QUOTABLES = {
  unverschuldetKostenfrei: {
    text: 'Bei einem unverschuldeten Unfall mit Schaden über 750 € haben Sie nach §249 BGB Anspruch auf einen unabhängigen Sachverständigen — die gegnerische Haftpflichtversicherung trägt alle Kosten.',
    quelle: '§249 BGB',
  },
  kuerzungsverlust: {
    text: 'Ein Werkstatt-Kostenvoranschlag verschenkt durchschnittlich 30–40 % des Anspruchs.',
    quelle: 'NDR Markt 2024',
  },
  // … (10–15 Items aus Wissensdatenbank)
} as const
```

---

## 5 · Server-Action Lead-Form

### 5.1 `src/app/marketing-actions.ts` (NEU)

```ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

const LeadSchema = z.object({
  name: z.string().min(2).max(100).trim(),
  phone: z.string().regex(/[\+0-9\s\-\(\)]{8,}/, 'Bitte gültige Telefonnummer eingeben'),
  stadt: z.string().min(2).max(100).trim(),
  source: z.string().min(1).max(100),
})

export async function submitMarketingLead(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Eingaben unvollständig' }
  }
  const webhookUrl = process.env.LEAD_WEBHOOK_URL
  if (!webhookUrl) return { ok: false, error: 'Konfigurationsfehler — bitte 0221 25906530 anrufen' }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...parsed.data,
        timestamp: new Date().toISOString(),
        userAgent: 'marketing-lead',
      }),
    })
    if (!res.ok) return { ok: false, error: 'Übermittlung fehlgeschlagen — bitte 0221 25906530 anrufen' }
  } catch (err) {
    console.error('Lead-Webhook-Fehler:', err)
    return { ok: false, error: 'Netzwerk-Fehler — bitte 0221 25906530 anrufen' }
  }
  // Optional: Insert in 'leads'-Tabelle, falls bestehende Lead-Pipeline genutzt werden soll.
  // Sub-Projekt B entscheidet, ob Webhook reicht oder DB-Insert nötig.
  revalidatePath('/admin/leads')
  return { ok: true }
}
```

**Compliance:**
- Result-Object `{ ok, error }`, kein throw ✓
- Keine Konstanten exportiert ✓
- `revalidatePath` gesetzt ✓
- Source-Tracking via source-Feld → später für Attribution ✓

### 5.2 `src/components/marketing/LeadFormClient.tsx` (NEU)

`'use client'` Component mit:
- `useTransition` für pending-State
- `submitMarketingLead(fd)` als Form-Action
- Bei `result.ok`: `toast.success(...)` + `form.reset()` + `gtag('event', 'generate_lead', { value: 50, currency: 'EUR' })`
- Bei `!result.ok`: `toast.error(result.error)`
- `data-tracking="lead-submit-koeln-hero"` für GA-Hook

---

## 6 · SEO / GEO

### 6.1 JSON-LD-Block in `[stadt]/page.tsx`

```ts
jsonLdScript([
  // bestehende LegalService — erweitern um aggregateRating + knowsAbout
  {
    '@context': 'https://schema.org',
    '@type': 'LegalService',
    '@id': `${SITE_URL}/kfz-gutachter/${s.slug}#localbusiness`,
    name: `Claimondo Kfz-Gutachter ${s.name}`,
    url: `${SITE_URL}/kfz-gutachter/${s.slug}`,
    telephone: PHONE_E164,
    description: '…',
    areaServed: [
      { '@type': 'City', name: s.name },
      ...s.nachbarstaedte.map(slug => ({ '@type': 'City', name: getStadtBySlug(slug)?.name })),
    ],
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng },
    aggregateRating: aggregateRating(reviews.rating, reviews.count),
    knowsAbout: KNOWS_ABOUT_DEFAULT,
    priceRange: '€€',
    serviceType: 'Kfz-Schadensgutachten',
  },
  serviceSchema({ … }),
  howToSchema({
    name: 'Schadensregulierung nach Verkehrsunfall in Köln',
    description: 'In 5 Schritten von der Unfallmeldung zur Auszahlung',
    steps: [/* 5 Schritte aus ProzessFuenfSchritte */],
  }),
  faqPageSchema(faqs),
  breadcrumbsSchema([
    { name: 'Startseite', url: '/' },
    { name: 'Kfz-Gutachter', url: '/kfz-gutachter' },
    { name: s.name, url: `/kfz-gutachter/${s.slug}` },
  ]),
])
```

### 6.2 Alias-Route `/kfz-gutachter-koeln`

`src/app/kfz-gutachter-koeln/page.tsx`:

```ts
import type { Metadata } from 'next'
import KfzGutachterStadtPage, { generateMetadata as stadtMeta } from '../kfz-gutachter/[stadt]/page'
import { SITE_URL } from '@/lib/seo/jsonld'

const ALIAS_PARAMS = Promise.resolve({ stadt: 'koeln' })

export async function generateMetadata(): Promise<Metadata> {
  const meta = await stadtMeta({ params: ALIAS_PARAMS })
  return {
    ...meta,
    alternates: { canonical: `${SITE_URL}/kfz-gutachter/koeln` },
  }
}

export default async function Page() {
  // Re-render der `[stadt]=koeln`-Page mit canonical-Override aus generateMetadata.
  // `KfzGutachterStadtPage` ist async — wir geben das Promise direkt an Next.js zurück.
  return KfzGutachterStadtPage({ params: ALIAS_PARAMS })
}
```

**Caveat:** Falls Next.js 16 das doppelte Server-Render zu teuer macht (zwei Routen rendern dieselbe Stadt), Fallback ist `redirect()` mit 301 — siehe Roadmap §4 Variante 3. Bei Implementation Lighthouse-Vergleich beider URLs machen; falls Perf ok bleibt, Variante 2.

→ Suchmaschine sieht: zwei URLs, eine canonical. Maiks Ads-Kampagne läuft auf `/kfz-gutachter-koeln` weiter.

### 6.3 `sitemap.ts` + `robots.ts`

- `sitemap.ts`: `/kfz-gutachter-koeln` mit `priority: 0.9, changefreq: 'weekly'`. Stadt-Pages priority 0.8.
- `robots.ts`: Explicit-Allow für `GPTBot`, `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `Google-Extended` — sofern noch nicht drin. Status prüfen.

**Hinweis:** Volles GEO-Querschnitts-Update (llms.txt etc.) bleibt in F. Hier nur das Minimum, damit Köln-Page indexiert wird.

---

## 7 · Tracking

### 7.1 GA4 + Google Ads Script in `src/app/layout.tsx`

Prüfen ob `<Script>` schon da ist. Wenn nein, `afterInteractive`-Strategy mit `gtag.js` für GA4 + Google Ads.

### 7.2 `src/components/marketing/TrackingHooks.tsx` (NEU)

Client-Component die nach Mount alle `[data-tracking^="call-"]` und `[data-tracking^="whatsapp-"]` Elemente hookt und gtag-Events feuert.

### 7.3 Event-Tabelle

| Event | Trigger | Wert | data-tracking |
|---|---|---|---|
| `generate_lead` | Lead-Form-Submit OK | 50 € | inline im `LeadFormClient` |
| `phone_call` | Click auf `<a href="tel:…">` | 30 € | `call-koeln-hero` / `call-sticky-bar` |
| `whatsapp_click` | Click auf WhatsApp-CTA | 20 € | `whatsapp-koeln-hero` |

Conversion-Label = TODO (Maik liefert nach Go-Live). Markiert mit `// TODO Maik: CONVERSION_LABEL` im Code.

---

## 8 · Assets

11 Files aus `~/Downloads/SEO UND GEO-…/marketing-landing-koeln/übergabe/assets/` + 5 SVGs aus `portal-mockups/` werden nach `public/marketing-landing-koeln/` kopiert. Implementation-Phase listet den `cp`-Befehl konkret.

Optional: Next.js Image-Optimization erzeugt automatisch WebP/AVIF — `next.config.ts` muss `images.formats: ['image/avif','image/webp']` haben (in Implementation-Plan-Phase prüfen).

---

## 9 · Akzeptanzkriterien (in Commit-Reihenfolge prüfbar)

### A1 — Section-Library + Datenmodell
- [ ] 19 Sections existieren in `src/components/landing/sections/*`
- [ ] `types.ts` definiert StadtKontext, KpiItem, FaqItem, ReviewSnapshot
- [ ] `staedte.ts` Köln-Record hat `nachbarstaedte: ['leverkusen','bergisch-gladbach','bonn','duesseldorf']`
- [ ] `google-reviews.ts` existiert mit Default-Snapshot + Placeholder-Reviews
- [ ] `npx tsc --noEmit` grün

### A2 — `[stadt]/page.tsx` refactor
- [ ] Page komponiert sich aus Sections statt inline-JSX
- [ ] Köln rendert alle 19 Sections + Topbar + Footer + StickyCallBar
- [ ] Andere Städte rendern dieselbe Komposition (mit Default-Reviews bis Sub-Projekt C)
- [ ] Lighthouse Mobile ≥ 90 in allen 4 Kategorien auf Köln
- [ ] Schema Rich-Results-Test grün (Organization, LegalService, Service, HowTo, FAQPage, BreadcrumbList)

### A3 — Lead-Form
- [ ] `submitMarketingLead` funktioniert lokal mit Test-Webhook
- [ ] Bei Validation-Fehler → `toast.error`, kein Crash
- [ ] Bei OK → `toast.success`, Form reset, gtag-Event gefeuert
- [ ] `LEAD_WEBHOOK_URL` in `.env.example` dokumentiert

### A4 — Alias-Route
- [ ] `/kfz-gutachter-koeln` lädt mit derselben Page wie `/kfz-gutachter/koeln`
- [ ] `<link rel="canonical" href="…/kfz-gutachter/koeln">` ist im HTML
- [ ] Sitemap enthält `/kfz-gutachter-koeln`

### A5 — Tracking
- [ ] GA4-Script in `layout.tsx` (afterInteractive)
- [ ] `[data-tracking="call-…"]` Click feuert `phone_call`-Event (DevTools-Network sichtbar)
- [ ] Form-Submit feuert `generate_lead`-Event

### A6 — AGENTS.md-Compliance
- [ ] `npm run build` grün
- [ ] Commit-Message hat den 7-Punkte-Audit-Block
- [ ] Umlaute korrekt
- [ ] Keine `'use server'`-Konstanten-Exporte
- [ ] Result-Object-Pattern
- [ ] `revalidatePath` gesetzt
- [ ] claimondo-* Tokens, keine Hex-Strings

---

## 10 · Risiken & Mitigation

| Risiko | Wahrscheinlichkeit | Mitigation |
|---|---|---|
| **Andere Städte brechen** durch Section-Refactor | mittel | A2-Akzeptanzkriterium prüft alle 6 vorhandenen Städte. Default-Reviews + optional-felder fangen fehlende Daten ab. |
| **Lead-Webhook-URL fehlt** | hoch (Aaron muss liefern) | `LEAD_WEBHOOK_URL` undefined → Server-Action liefert `{ ok: false, error: 'Konfigurationsfehler' }` — kein Crash, klare Error-Message. |
| **Google-Reviews-Snapshot ist Placeholder** | hoch | Kommentar im File markiert TODO, README-Hinweis. Page funktioniert auch mit Placeholder, nur weniger überzeugend. Aaron pflegt nach. |
| **Aliasroute SEO-Duplicate** | niedrig | `canonical` zeigt auf `/kfz-gutachter/koeln`. Google + AI respektieren das. |
| **Pre-Commit-Umlaut-Hook blockt** | niedrig | Spec auf Deutsch mit echten Umlauten geschrieben — Code wird genauso. |
| **TS-Fehler in `[stadt]`-Refactor** durch neue Optional-Felder | niedrig | `nachbarstaedte` ist optional in Type. Default-Fallback in `CrossCityPills` falls leer. |
| **Lighthouse Perf < 90** durch viele Sections | niedrig | Hero-Foto `priority`, Rest lazy. Sections sind Server-Components ohne JS-Cost. Carousel ist einzige Client-Component. |
| **Branch-Kollision** mit anderen Sessions | mittel | Eigener Worktree `koeln-premium-stadt-rework` aus staging — keine Berührung mit aar-883-TrustBlock-Sessions. |

---

## 11 · Was wir bewusst NICHT bauen in A

(Damit der Scope nicht aufgeht.)

- ❌ Live-Google-Places-API (Snapshot reicht — Migration in Phase 2)
- ❌ Andere Städte hochziehen (Sub-Projekt C)
- ❌ Homepage anfassen (Sub-Projekt D)
- ❌ `/vorteile`, `/wie-es-funktioniert`, `/faq` anfassen (Sub-Projekt E)
- ❌ Wikidata-Eintrag (Off-Page, H)
- ❌ Cookie-Consent-Banner (separate Spec — DSGVO-Sache)
- ❌ Native-Versionen der Sections (Marketing ist Web-only per Whitelabel-Branding-Regel)
- ❌ Vollständiges `llms.txt` (Sub-Projekt F)
- ❌ Sub-Sections für Personenschaden / Fahrerflucht (nice-to-have — eigene Seiten in E)

---

## 12 · Implementation-Reihenfolge (für writing-plans Skill)

Empfohlene Phasen-Reihenfolge — finalisiert beim `writing-plans`-Run:

1. **Assets** → `public/marketing-landing-koeln/*`
2. **Datentypen** → `staedte.ts` erweitern, `google-reviews.ts`, `quotables.ts`, `seo/jsonld.ts` Helpers
3. **Section-Library** → 19 Files (kann in Batches: erst die Server-Components, dann Client)
4. **`marketing-actions.ts` + `LeadFormClient`**
5. **`[stadt]/page.tsx` refactor** auf Section-Komposition
6. **Alias-Route** `/kfz-gutachter-koeln`
7. **`TrackingHooks` + `layout.tsx` Script**
8. **`sitemap.ts` + `robots.ts`** Minimal-Update
9. **Lighthouse + Schema-Validation** Runde
10. **Commit + 7-Punkte-Audit + PR gegen staging**

---

## 13 · Offene Fragen für Aaron (Spec-Review)

1. **AAR-Ticket-Nr** — soll ich beim Push den Branch von `kitta/koeln-premium-stadt-rework` auf `kitta/aar-<nr>-koeln-premium-stadt-rework` umbenennen?
2. **Google-Reviews-Quelle** — kannst du mir 5–8 echte Reviews als Text liefern, oder soll ich aus der Google-Knowledge-Panel-Box extrahieren? Place-ID auch?
3. **Hero-Foto** — Mann oder Frau auf Köln-Page? (default Frau)
4. **Hero-Quote-Wording** — Vorschlag aus Roadmap + Wissensdatenbank, oder hast du ein eigenes Wording?
5. **LEAD_WEBHOOK_URL** — Slack-Channel, Custom Backend, oder DB-Insert in `leads`-Tabelle? (Default: Webhook, du nennst URL beim Implementation-Run)
6. **Conversion-Label** — wartest du auf Maik, oder hat er die Werte bereits? Falls ja: AW-ID + Label-Strings für 3 Events.
7. **partnerSVsList** — soll die 23-er-Liste der Köln-Partner-SVs sichtbar werden, oder bleibt es bei der Zahl?

---

**Ende Spec.** Nach Aaron-Review folgt `writing-plans` mit Phasen-Plan auf Datei-Ebene, dann Implementation.
