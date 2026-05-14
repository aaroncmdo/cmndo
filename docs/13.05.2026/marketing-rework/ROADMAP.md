# Marketing-Rework — Roadmap (Stand 13.05.2026)

**Zweck:** Den Köln-Handoff aus `~/Downloads/SEO UND GEO-…` mit der bestehenden `claimondo.de`-Marketing-Architektur **verschmelzen**, GEO-Fahrplan + Wissensdatenbank-Inhalte integrieren, alle Conversion-Seiten anheben. Kein Big-Bang-PR — Sub-Projekte mit eigenen Linear-Tickets und eigenen Reviews.

**Autor:** Claude (Brainstorming-Session, Aaron)
**Status:** Roadmap-Entwurf — Aaron priorisiert, dann pro Sub-Projekt eigener Brainstorm + Plan + Implementation.
**Branch dieser Session:** `kitta/aar-883-trust-block-v2` (Worktree `aar-883-trust-block-v2-iter2` angelegt; pro Sub-Projekt eigener Feature-Branch).

---

## 1 · TL;DR

| Sub-Projekt | Was | Aufwand | Linear-Slug-Vorschlag | Abhängig von |
|---|---|---|---|---|
| **A** | Köln-Page upgraden: 20 Sections aus Handoff in `/kfz-gutachter/koeln` einziehen, dynamic-Route bleibt Fallback für andere Städte | 1–1.5 Tage | `aar-XXX-koeln-premium-stadt-rework` | – |
| **B** | Section-Bibliothek extrahieren: jede neue Section wird zu `@/components/landing/sections/*`, parametrisierbar | 1 Tag | `aar-XXX-marketing-section-library` | A |
| **C** | Restliche Städte heben — 21 NRW + 5 Bundes auf neues Layout, `STAEDTE`-Daten erweitern | 1–2 Tage | `aar-XXX-staedte-rollout-premium` | B |
| **D** | Homepage (`/`) Rework: bestehende LandingPage komponiert sich aus B-Section-Library, neue Hero-Foto-Band + Trust-Strip + BGH-Grid + 7-Fehler | 1.5–2 Tage | `aar-XXX-homepage-rework-2026` | B |
| **E** | Conversion-/Wissens-Seiten: `/vorteile`, `/wie-es-funktioniert`, `/faq`, `/ersteinschaetzung`, `/schaden-melden`, `/ueber-uns` refreshen mit Wissensdatenbank-Inhalten + B-Sections | 2–3 Tage | `aar-XXX-conversion-pages-2026` | B + D |
| **F** | GEO-Querschnitt: Schema-Library erweitern (HowTo, neue FAQ-Entries, OpeningHours), `sitemap.ts` mit neuen Routen, `robots.ts` AI-Crawler-Allow, `llms.txt`, Quotable-Statements zentralisieren | 0.5–1 Tag | `aar-XXX-geo-stack-2026` | – (parallel) |
| **G** | Tracking + Lead-Form-Infrastruktur: Server-Action `submitMarketingLead` + Webhook + GA4/GAds-Events, `data-tracking`-Attribute auf allen CTAs | 0.5 Tag | `aar-XXX-marketing-tracking` | – (parallel) |
| **H** | GEO-Off-Page (Notion-Fahrplan-Punkte 1–6): Wikidata, Branchen-Verzeichnisse, YouTube, Reddit/Quora, Gastartikel, Schadensreport-Refresh | mehrere Wochen | nicht ein PR — Tickets pro Maßnahme | – |

**Reihenfolge-Empfehlung:** F + G parallel zu A starten (sind Infra, blocken nichts). Dann A → B → (C + D + E parallelisierbar). H läuft als Marketing-Workstream daneben.

**Gesamt-Aufwand technisch (A–G):** 7–10 Entwickler-Tage. H ist Content/Outreach, kein Dev-Aufwand.

---

## 2 · Bestehende Architektur (Ist-Zustand)

### Was schon im Repo ist und produktiv läuft

**Routen (alle unter `src/app/*`, kein `(marketing)`-Group):**
- `/` → `src/app/page.tsx` rendert `<LandingPage>` aus `@/components/landing/LandingPage` (Server Component, Auth-aware, Promo-Tracking via `?p=`, Locale-Cookie, organizationSchema/localBusinessSchema/websiteSchema via Root-Layout)
- `/kfz-gutachter` (Pillar) + `/kfz-gutachter/[stadt]` (dynamic; `STAEDTE`-Liste in `src/app/kfz-gutachter/staedte.ts` — bisher mind. Köln + weitere)
- `/faq`, `/ueber-uns`, `/vorteile`, `/wie-es-funktioniert`, `/ersteinschaetzung`, `/schaden-melden`, `/beratung-anfragen`, `/gutachter-partner`, `/gutachter-finden`, `/schadensreport-2026`
- Rechtsseiten: `/impressum`, `/datenschutz`, `/agb`, `/nutzungsbedingungen`

**Shared Marketing-Components (`src/components/landing/`):**
- `LandingTopbar` (Auth-aware, AuthenticatedUser-Prop)
- `LandingFooter`
- `StickyCallBar` (sticky mobile bottom-bar mit Phone-CTA, Quelle-Param für Tracking)
- `AnswerCapsule` (GEO-Quotable-Wrapper mit Quellen-Cite)
- `LandingPage` (Komposit für Root)

**SEO-Helper (`src/lib/seo/jsonld.ts`):**
- `serviceSchema`, `breadcrumbsSchema`, `faqPageSchema`, `jsonLdScript`
- `SITE_URL`, `PHONE_E164`, `PHONE_DISPLAY` (Single Source of Truth — niemals hardcoden)

**Design-Tokens (`src/lib/design-tokens.ts`):**
- claimondo-navy `#0D1B3E`, ondo `#4573A2`, shield `#1E3A5F`, light-blue `#7BA3CC`, bg `#f8f9fb`, border `#e4e7ef`
- Shadows: `shadow-claimondo-{sm,md,lg}` (Navy-getintet)
- Radii: `rounded-ios-{sm,md,lg,xl,full}` (12/18/24/32)
- Typo: Montserrat 700/800 für Headings, Noto Sans für Body
- Glass: `bg-white/65 backdrop-blur-md` + `<GlassPanel>` aus `@/components/shared/glass/*`

### Was die aktuelle `/kfz-gutachter/[stadt]`-Page kann, was der Köln-Handoff NICHT abdeckt

| Feature | Quelle | Schicksal im Merge |
|---|---|---|
| Auth-aware Topbar (eingeloggte → „Zu meinem Portal") | aktuelle `LandingTopbar` | **bleiben** — neue Sections nur Body |
| `generateStaticParams` über `STAEDTE` | aktuelle `[stadt]/page.tsx` | **bleiben** — A erweitert nur den Daten-Record |
| BVSK-Honorar-Spanne pro Stadt | `STAEDTE` Record (`bvskHonorarSpanne`) | **bleiben** — wird Quotable in B |
| Lokal-Block (Landgericht + Kammer + PLZ + Bevölkerung) | aktuelle Page | **bleiben** — wird eigene Section in B |
| Cross-City-Pills (alle anderen Städte) | aktuelle Page | **bleiben** — Internal-Linking-Pflicht (SEO-GEO-Strategy §11) |
| `breadcrumbsSchema` | aktuelle Page | **bleiben** + erweitern |
| `serviceSchema` + scoped `LegalService` | aktuelle Page | **erweitern** (HowTo, aggregateRating, knowsAbout) |
| Promo-Code-Click-Tracking | `src/app/page.tsx` `trackPromoClick` | **bleiben** — auf Stadt-Pages portieren wenn Maik das will |
| Locale-Cookie | `getLocaleCookie()` | **bleiben** — Sections müssen i18n-fähig sein |

### Was der Köln-Handoff NEU mitbringt

20 Sections in der `prototype.html`-Reihenfolge:

1. Topbar (sticky) — **ersetzt** durch bestehende `LandingTopbar` mit Auth
2. **Hero Image Band** (Foto + Zitat) — NEU
3. **Hero mit Lead-Form** — NEU, Form ist das Conversion-Herzstück
4. **Google-Reviews-Carousel** (47 Reviews, 5.0★) — NEU, **echter** Google-Trust (Aaron muss Place-ID liefern, Reviews per Places-API live oder snapshot)
5. **Trust-Strip** (4 KPIs) — NEU
6. **Aufklärung** (4 Cards mit Versicherer-Patterns) — NEU
7. **Versicherer-Taktiken-Tabelle** (HUK/LVM/AXA + ControlExpert/K-Expert) — NEU, hohe GEO-Wirkung
8. **BGH-Authority-Grid** (8 Urteile mit Aktenzeichen) — teils auf aktueller Page, neu als eigene Section
9. **Portal-Mockup** („Wie Uber, aber für Schäden") — NEU, nutzt `portal-mockups/*.svg` aus Bundle
10. **5-Schritt-Prozess** mit Glass-Cards — NEU
11. **Wertminderung Sanden/Danner-Tabelle** — NEU
12. **7-Fehler-Liste** (typische Nach-Unfall-Fehler) — NEU, direkt aus Wissensdatenbank §12
13. **Berater-Section** (Foto + Quote) — NEU
14. **Einsatzgebiet NRW** mit Karte (`bilder/nrw-karte.png`) — NEU
15. **Tesla / E-Auto Spezial** — NEU, Wissensdatenbank §16
16. **FAQ** (10 Fragen pro Stadt) — aktuell 5, erweitern auf 10
17. **Gründer-Section** (Aaron + Nicolas Foto) — NEU
18. Bottom CTA — bleiben (existiert ähnlich)
19. Footer — bleibt (`LandingFooter`)
20. Sticky Mobile Call Bar — bleibt (`StickyCallBar`)

**Plus:**
- `schema.json` — 6 Schemas (Organization, LegalService, Service, HowTo, FAQPage, BreadcrumbList) — HowTo + FAQ-10 sind NEU
- `robots.txt` — explizites AI-Crawler-Allow (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended) — **prüfen ob in aktueller `src/app/robots.ts` schon drin**
- `sitemap.xml` — Priority-Hierarchie 1.0/0.9/0.8/0.7/0.6/0.5/0.3 — mit `src/app/sitemap.ts` abgleichen
- 11 Assets (Hero-Foto Mann + Frau, Berater, Founders, NRW-Karte, Office-Foto, Autohaus, Logo-Varianten)

---

## 3 · Merge-Strategie: Sections statt Big-Bang-Page

**Problem:** Den `KfzGutachterKoelnLanding.tsx` 1:1 als `/kfz-gutachter-koeln` ablegen würde 3 Konflikte erzeugen:
1. **URL-Doublette** mit bestehendem `/kfz-gutachter/koeln` → SEO-Penalty (Duplicate Content)
2. **Tech-Schuld** — 800+ LOC Single-File-Page, nicht wiederverwendbar für 26 andere Städte
3. **Wartung** — bei Änderung am Trust-Strip müssten alle künftigen Städte einzeln gepatcht werden

**Lösung:** Aus dem Köln-Handoff werden **Sections** extrahiert:

```
src/components/landing/sections/
  ├── HeroImageBand.tsx          (Foto-Band mit Quote)
  ├── HeroLeadForm.tsx           (Hero + integriertes Form)
  ├── GoogleReviewsCarousel.tsx  (Reviews via Places-API oder Snapshot-JSON)
  ├── TrustStrip.tsx             (4 KPIs, parametrisiert)
  ├── AufklaerungCards.tsx       (4 Cards — global gleich)
  ├── VersichererTaktikenTabelle.tsx
  ├── BghAuthorityGrid.tsx       (8 Urteile)
  ├── PortalMockupShowcase.tsx
  ├── ProzessFuenfSchritte.tsx
  ├── WertminderungTabelle.tsx   (Sanden/Danner)
  ├── SiebenFehlerListe.tsx
  ├── BeraterCard.tsx
  ├── EinsatzgebietNrwKarte.tsx
  ├── TeslaEAutoSpezial.tsx
  ├── FaqAccordion.tsx           (parametrisiert mit Fragen-Array)
  ├── GruenderSection.tsx
  └── BottomCta.tsx
```

Jede Section ist ein **Server Component** (oder Client wenn JS nötig: Reviews-Carousel, Lead-Form, Tracking-Hooks). Props sind minimal — Stadt-spezifische Sections (Lokal-Block, FAQ) bekommen ein `stadt: StadtDaten`-Prop, der Rest ist global gleich.

**Konsumenten:**
- `/kfz-gutachter/[stadt]/page.tsx` → komponiert alle relevanten Sections in Stadt-Reihenfolge
- `/` → komponiert eine Auswahl (kein Lead-Form, kein Lokal-Block — dafür Bundes-Trust)
- `/vorteile` → BGH-Grid + Versicherer-Taktiken + Wertminderung
- `/wie-es-funktioniert` → Prozess + Portal-Mockup + Berater
- `/faq` → erweitertes FAQAccordion mit allen 16 Wissensdatenbank-Themen
- `/schadensreport-2026` → eigene Datenseite + Trust-Strip + BGH-Grid

→ **Eine Section, viele Consumer.** Genau das Anti-Redundanz-Pattern aus AGENTS.md §3.

---

## 4 · URL-Strategie

Drei Varianten — Empfehlung: **Variante 2**.

| Variante | URL für Köln | Pro | Contra |
|---|---|---|---|
| **1 · Replace** | `/kfz-gutachter/koeln` wird Premium-Page; `/kfz-gutachter-koeln` existiert nicht | Eine Canonical-URL, keine Duplicate | Ads-Landing-URL ist anders als Handoff vorsah; Maik muss umstellen |
| **2 · Koexistenz mit Canonical** | Beides: `/kfz-gutachter-koeln` (Ads-Hijack) + `/kfz-gutachter/koeln` (SEO-Pillar). Beide haben den **gleichen** Inhalt, aber `/kfz-gutachter-koeln` hat `canonical = /kfz-gutachter/koeln` | Maiks Ads-URL bleibt, SEO bleibt sauber | Doppelter Render — durch shared Section-Library trivial |
| **3 · 301-Redirect** | `/kfz-gutachter-koeln` → 301 → `/kfz-gutachter/koeln` | Sauber, ein Canonical | Ads-Landing verliert je Hop ~5 % Conversion (Doc-Studien) |

**Empfehlung Variante 2**, weil Maiks bestehende Ads-Kampagne-URL `/kfz-gutachter-koeln` ohne Schaden weiterlaufen kann und Google die `canonical`-Direktive sauber respektiert. **Aaron entscheidet** — siehe offene Fragen unten.

---

## 5 · Sub-Projekte im Detail

### A · Köln-Page upgraden (1–1.5 Tage)

**Ziel:** `/kfz-gutachter/koeln` enthält alle 17 inhaltlichen Sections (1–17 oben minus Topbar/Footer/Sticky, die sind shared). Lead-Form funktioniert lokal mit Slack-Webhook. Reviews-Carousel hat Snapshot-JSON aus echten Google-Reviews (Aaron liefert).

**Touchpoints:**
- `src/app/kfz-gutachter/[stadt]/page.tsx` — Section-Komposition refaktorieren
- `src/app/kfz-gutachter/staedte.ts` — Köln-Record erweitern um: `googleReviews` (Place-ID oder Snapshot), `partnerSVsList`, `heroFoto`, `kpis`
- `src/components/landing/sections/*` — die 17 neuen Files (Implementierung übernimmt B)
- `public/marketing-landing-koeln/*` — 11 Assets
- `src/app/kfz-gutachter-koeln/page.tsx` — neuer Hijack-Pfad falls Variante 2 (Re-export der `[stadt='koeln']`-Logik mit canonical-Override)

**Akzeptanz:**
- [ ] `/kfz-gutachter/koeln` rendert 17 Sections + Topbar + Footer + StickyCallBar
- [ ] Reviews-Carousel zeigt echte Google-Bewertungen (Aaron-Daten)
- [ ] Lead-Form submit → Slack-Webhook → Bestätigungs-Toast
- [ ] Schema.org Rich-Results-Test grün: Organization + LegalService + Service + HowTo + FAQPage + BreadcrumbList
- [ ] Lighthouse Mobile ≥ 90 in allen 4 Kategorien
- [ ] `npm run build` grün, 7-Punkte-Audit dokumentiert
- [ ] Andere Städte (`/kfz-gutachter/duesseldorf` etc.) brechen NICHT — sie rendern noch das alte schlanke Layout, bis C kommt

### B · Section-Bibliothek (1 Tag)

**Ziel:** Während A entsteht, werden die Sections sauber extrahiert (nicht inline in Köln-Page). Jede Section ist isoliert testbar, hat klares Props-Interface, kommt aus `design-tokens.ts`, nutzt `claimondo-*` Tailwind-Klassen statt Hex.

**Touchpoints:**
- `src/components/landing/sections/<Section>.tsx` × 17
- `src/components/landing/sections/types.ts` — gemeinsame Types (StadtKontext, KpiItem, FaqItem, etc.)
- evtl. `src/components/landing/sections/index.ts` als Barrel-Export

**Akzeptanz:**
- [ ] Jede Section hat ein `*.types.ts` oder Inline-Interface
- [ ] Keine Hex-Strings für Marken-Farben — nur Tailwind-Tokens
- [ ] Keine Section nutzt globalen State — alles per Props
- [ ] Storybook ist out-of-scope (haben wir nicht), aber jede Section muss in `/dev/*` einzeln aufrufbar sein (Aaron-Wunsch?)

### C · Städte-Rollout (1–2 Tage)

**Ziel:** Alle 22 NRW-Städte + 5 Bundesstädte (Hamburg, Berlin, München, Frankfurt, Stuttgart) bekommen das Premium-Layout. `STAEDTE`-Daten erweitern.

**Touchpoints:**
- `src/app/kfz-gutachter/staedte.ts` — Records für alle 27 Städte vervollständigen (Bevölkerung, Landgericht, Kammer, BVSK-Spanne, Partner-SVs-Count, Lat/Lng, Place-ID für Reviews wenn Google-Business pro Stadt existiert — sonst Hauptaccount)
- `sitemap.ts` — Priority je nach Tier
- Cross-City-Linking-Logik (3–4 Nachbarstädte statt alle) — siehe SEO-GEO §11

**Akzeptanz:**
- [ ] Alle 27 Stadt-Pages rendern ohne Daten-`undefined`
- [ ] Min. 35 Entities pro Page (SpaCy-NER-Check optional, manueller Spotcheck OK)
- [ ] Cross-Links zu 3–4 Nachbarstädten je Page
- [ ] Sitemap-Eintrag mit korrekter Priority
- [ ] Rich-Results-Test je Stichprobe (Düsseldorf, Bonn, Berlin) grün

### D · Homepage-Rework (1.5–2 Tage)

**Ziel:** `<LandingPage>` aus `@/components/landing/LandingPage` wird zur Komposition aus B-Sections + Bundes-Trust-Story. Keine Stadt-Spezifika.

**Touchpoints:**
- `src/components/landing/LandingPage.tsx` — refaktorieren
- `src/app/page.tsx` — Metadata anpassen (neuer Tagline-Vorschlag in Brand-Identity-Memory: „Vollständige Schadensregulierung — auf Augenhöhe")
- Promo-Tracking + Auth-aware Topbar bleiben

**Akzeptanz:**
- [ ] Sections in Reihenfolge: Hero-Foto-Band → Hero-Headline + dual-CTA → Trust-Strip → Reviews → Aufklärung → Versicherer-Taktiken → BGH-Grid → Prozess → Portal-Mockup → Berater → 7-Fehler → Gründer → Bottom-CTA
- [ ] Eingeloggte sehen „Zu meinem Portal →" — Behavior bleibt
- [ ] Promo `?p=MK-XXXX` Tracking bleibt funktional
- [ ] Build + Lighthouse + 7-Punkte-Audit

### E · Conversion-/Wissens-Seiten (2–3 Tage)

**Ziel:** Bestehende Conversion-Seiten füllen sich mit Wissensdatenbank-Inhalten + B-Sections. Jede Seite hat 1–2 Quotable-Statements aus der Notion-Wissensdatenbank.

**Pro Seite (Vorschlag, finalisiert beim Sub-Brainstorm):**

| Seite | Wissensdatenbank-Thema | B-Sections | Quotable |
|---|---|---|---|
| `/vorteile` | §3 unabhängiger Gutachter, §6 Werkstattrisiko, §7 Wertminderung | BghAuthorityGrid, WertminderungTabelle, VersichererTaktikenTabelle | „Ein Gutachter der Versicherung arbeitet für die Versicherung. Sie haben das Recht auf einen eigenen Experten — der kostet Sie nichts." |
| `/wie-es-funktioniert` | §15 Versicherer-Taktiken, §12 typische Fehler | ProzessFuenfSchritte, PortalMockupShowcase, BeraterCard | „Termin in unter 48 Stunden — 23 DAT-zertifizierte Partner in Köln." |
| `/faq` | alle 16 Themen | FaqAccordion mit 40+ Fragen | jedes FAQ-Item ist selbst ein Quotable |
| `/ersteinschaetzung` | §1 fiktive Abrechnung, §2 Prüfberichte, §10 Quotenvorrecht | BghAuthorityGrid (gekürzt), HeroLeadForm | „Wenn Sie sich das Geld nur auszahlen lassen, verlieren Sie nicht nur die Mehrwertsteuer, sondern riskieren bei einem nächsten Unfall die komplette Ablehnung durch den Versicherer." |
| `/schaden-melden` | §15 Versicherer-Taktiken (Reaktions-Script) | HeroLeadForm, TrustStrip | „Vielen Dank für das Angebot, aber ich mache von meinem Recht Gebrauch, einen unabhängigen Sachverständigen und einen Fachanwalt meiner Wahl einzuschalten." |
| `/ueber-uns` | Brand-Identity (Mission/Vision/Werte) | GruenderSection, BeraterCard, EinsatzgebietNrwKarte | „Vollständige Schadensregulierung — auf Augenhöhe." |
| `/schadensreport-2026` | Datenseite, jährlich erneuert | TrustStrip (eigene KPIs), BghAuthorityGrid | YoY-Zahlen zur Kürzungsrate der Versicherer (GEO-Fahrplan §6) |

### F · GEO-Querschnitt (0.5–1 Tag)

**Ziel:** Die technische GEO-Infra ist konsistent, AI-Crawler willkommen, jede Page hat Schema-Block, llms.txt vorhanden.

**Touchpoints:**
- `src/app/robots.ts` — Explicit-Allow für `GPTBot`, `ClaudeBot`, `anthropic-ai`, `PerplexityBot`, `Google-Extended`. **Prüfen ob schon vorhanden** (vermutlich teilweise).
- `src/app/sitemap.ts` — Priority-Hierarchie nach SEO-GEO §3, neue Routen eintragen
- `src/app/llms.txt/route.ts` (NEU) — strukturierte Liste der Pages, Markdown-Format, für AI-Crawler optimiert
- `src/lib/seo/jsonld.ts` — `howToSchema` ergänzen, `aggregateRating` Helper, `knowsAbout` Helper
- `src/lib/seo/quotables.ts` (NEU) — alle Quotable-Statements als Konstanten, von Sections via Prop referenzierbar

**Akzeptanz:**
- [ ] `/robots.txt` zeigt explicit Allow für alle 5 AI-Crawler
- [ ] `/llms.txt` liefert Markdown mit allen indexierbaren Routen + Beschreibung
- [ ] Rich-Results-Test grün auf `/`, `/kfz-gutachter`, `/kfz-gutachter/koeln`

### G · Tracking + Lead-Form (0.5 Tag)

**Ziel:** Ein Lead-Form-Pattern für alle Marketing-Pages, ein Tracking-Hooks-Pattern. Server-Action mit Webhook + Zod + Result-Object.

**Touchpoints:**
- `src/app/marketing-actions.ts` (NEU, `'use server'`) oder `src/lib/marketing/actions.ts` — `submitMarketingLead(formData, source)` mit Zod + LEAD_WEBHOOK_URL
- `src/components/marketing/LeadFormClient.tsx` (NEU) — Client-Component mit useTransition + sonner-Toast + gtag-Events
- `src/components/marketing/TrackingHooks.tsx` (NEU) — Client-Component für `[data-tracking^="call-"]` und `[data-tracking^="whatsapp-"]` Events
- `.env.local` + Vercel-Production: `LEAD_WEBHOOK_URL`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GADS_ID` (Maik liefert IDs)
- `src/app/layout.tsx` — `<Script>` für GA4 + Google Ads (afterInteractive)

**Akzeptanz:**
- [ ] Submit von `/kfz-gutachter/koeln`-Form landet in Slack/Test-Webhook
- [ ] `phone_call` und `whatsapp_click` Events feuern (Chrome GA-Debugger)
- [ ] Conversion-Label-TODO markiert wo Maiks Wert hin muss
- [ ] Result-Object-Pattern, kein throw, keine Konstanten-Exporte aus `'use server'`-File

### H · GEO-Off-Page-Maßnahmen (Marketing-Workstream, kein Dev-Aufwand)

Aus dem Notion-Fahrplan + SEO-GEO §12:

1. **Wikidata-Eintrag** für Claimondo — Q-Identifier für `sameAs` im organizationSchema (Aaron)
2. **Branchen-Verzeichnisse** mit konsistentem NAP: BVSK, DAT-Liste, Yelp, Anwalt.de (Marketing)
3. **YouTube-Channel** „Claimondo erklärt" — 60-Sek-Videos pro BGH-Az (Marketing + Aaron)
4. **Reddit/Quora-Antworten** auf „Wer ist Claimondo?" (Marketing-Sprint)
5. **Gastartikel** LTO, Beck-Aktuell, Anwalt.de mit Backlink (Marketing)
6. **Schadensreport 2026** als jährlich erneuerte Datenquelle (Marketing + Daten-Team)

→ Jede Maßnahme bekommt ein eigenes Linear-Ticket, kein einzelner PR.

---

## 6 · Risiken & offene Fragen für Aaron

| # | Frage | Warum wichtig |
|---|---|---|
| 1 | **URL-Strategie für Köln:** Variante 1, 2 oder 3 (siehe §4)? | Maiks Ads-Kampagne hängt dran |
| 2 | **Google-Reviews:** Live via Places-API mit täglichem Cron, oder Snapshot-JSON manuell gepflegt? | Live = Authentic, Snapshot = bulletproof gegen API-Quota |
| 3 | **Place-IDs pro Stadt:** Hat Claimondo Google-Business-Profile pro Stadt, oder nur einen Hauptaccount in Köln? | Bestimmt ob LocalBusiness-Schema pro Stadt eine eigene Place-ID hat |
| 4 | **Brand-Identity-Tagline** „Vollständige Schadensregulierung — auf Augenhöhe" — auf Homepage als H1 oder Sub-Headline? | Memory sagt: das ist die offizielle Tagline (`project_brand_identity`) |
| 5 | **Hero-Foto-Wahl pro Page:** Mann (hero-man.png) auf `/vorteile`, Frau (hero-woman.png) auf `/wie-es-funktioniert`? Oder alternieren? | UX-Frage, Aaron entscheidet |
| 6 | **Sub-SVs / Whitelabel:** Greift das Premium-Layout auch im Whitelabel-Kontext (SV mit `use_custom_branding=true`)? | Brand-Vars müssen ziehen — siehe `feedback_ci_farben` |
| 7 | **Datenschutz für Lead-Form:** Cookie-Consent-Modal nötig vor GA4-Load? | DSGVO — gibt es schon Cookiebot/Usercentrics-Integration? |
| 8 | **Reihenfolge:** Soll ich mit A (Köln-Page) anfangen oder mit F (GEO-Infra), damit B + C + D + E darauf bauen können? | Empfehlung: F parallel zu A, dann B → C/D/E |
| 9 | **Linear-Tickets:** Hast du AAR-Nummern dafür schon, oder soll ich mit Platzhaltern arbeiten und du legst sie an? | Ohne Tickets-Nrn keine sauberen Branch-Namen |
| 10 | **Mobile-App:** Marketing-Seiten sind Web-only. Komponenten unter `landing/sections/*` brauchen KEIN `.native.tsx`-Pendant — korrekt? | Bestätigt Komponenten-Set-Policy §1 (Mobile = nur primitives/*) |
| 11 | **Branch-Strategie:** Gegeben es laufen aktuell 3+ Sessions auf parallelen Branches — soll ich für A einen eigenen Branch im neuen Worktree `aar-883-trust-block-v2-iter2` anlegen, oder einen frischen aus `staging`? | AGENTS.md Regel 1 — Feature-Branch je Ticket |

---

## 7 · Nächste Schritte

**Aaron beantwortet:**
1. Welches Sub-Projekt starten wir als erstes? (Empfehlung: A + F parallel)
2. Mindestens Frage 1, 2, 3, 11 aus der Risiko-Tabelle

**Dann (pro Sub-Projekt):**
1. Eigenen Brainstorm-Run starten (`/skill superpowers:brainstorming`)
2. Detail-Spec schreiben unter `docs/13.05.2026/marketing-rework/<sub>-spec.md`
3. Implementation-Plan via `writing-plans`-Skill
4. Branch erstellen, Code, 7-Punkte-Audit, PR gegen `staging`
5. Memory-Update wenn neue Konventionen entstehen (Sections-Pattern, Quotables-Library)

---

## 8 · Anhang — Wissensdatenbank-Mapping

Damit wir nichts vergessen: welches Wissensdatenbank-Thema landet wo?

| Wissensdatenbank-§ | Thema | Primäre Section | Zusätzliche Pages |
|---|---|---|---|
| §1 | Fiktive Abrechnung (HIS, Eigenreparatur) | AufklaerungCards, BghAuthorityGrid | `/vorteile`, `/ersteinschaetzung`, FAQ |
| §2 | Versicherer-Kürzungen + Prüfberichte | VersichererTaktikenTabelle | `/vorteile`, `/wie-es-funktioniert` |
| §3 | Warum unabhängiger Gutachter | AufklaerungCards (Card 1) | `/vorteile`, Homepage Hero |
| §4 | Anwalt ja/nein | BghAuthorityGrid, Berater | `/vorteile`, FAQ |
| §5 | Totalschaden + 130%-Regel | BghAuthorityGrid (VI ZR 67/91) | `/vorteile`, FAQ |
| §6 | Werkstattrisiko BGH 2024 | BghAuthorityGrid (5 Urteile) | `/vorteile`, FAQ |
| §7 | Wertminderung | WertminderungTabelle | `/vorteile`, jede Stadt-Page |
| §8 | Restwert regional vs überregional | AufklaerungCards | `/wie-es-funktioniert`, FAQ |
| §9 | Nutzungsausfall + Mietwagen (Sanden/Danner) | WertminderungTabelle (Sub-Tabelle) | FAQ, `/schaden-melden` |
| §10 | Quotenvorrecht | BghAuthorityGrid | FAQ, `/ersteinschaetzung` |
| §11 | Scheckheft + Werkstattverweis | AufklaerungCards | FAQ |
| §12 | 7 typische Fehler | SiebenFehlerListe | Homepage, jede Stadt-Page |
| §13 | Personenschaden + Schmerzensgeld | (eigene neue Seite optional `/personenschaden`?) | FAQ, `/schaden-melden` |
| §14 | Fahrerflucht + VOH | (eigene neue Seite optional `/fahrerflucht`?) | FAQ |
| §15 | Versicherer-Taktiken (Schadensteuerung) | VersichererTaktikenTabelle | `/wie-es-funktioniert`, `/schaden-melden` |
| §16 | Tesla / E-Auto | TeslaEAutoSpezial | Stadt-Pages, FAQ |

Diese Mapping-Tabelle ist die **Content-Checkliste** für jedes Sub-Projekt.

---

**Ende der Roadmap.** Aaron, deine Reihenfolge + Antworten auf die Risiko-Fragen sind der Startschuss für den ersten Sub-Brainstorm.
