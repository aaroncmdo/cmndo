# claimondo.de Home — Premium-Rework · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) oder superpowers:executing-plans, Task-für-Task. Steps nutzen Checkbox (`- [ ]`).
> **Design-Rework-Anpassung:** Kein Unit-TDD — Verifikation je Task = **`npx tsc --noEmit` + `npm run build` grün** + **Screenshot-Smoke** an kritischen Viewports (mobil 390, desktop 1280) + **section-audit-Loop** (Diagnose→Mockup→Build→Screenshot) für den visuellen Feinschliff. Bei Datei-Konsolidierung zusätzlich **i18n-6-Sprachen-Key-Parität** prüfen.

> **Status (Session 31.05. Abend — Opus):** B1 ✅ (committet, gepusht). **C Hero-Pilot ✅** — zwei Baender → ein cinematischer Hero (commit `62aee10b0`): full-bleed `hero-paar.webp` (echtes Shield = App-Shield-Motiv), Token-Scrim (Tailwind-Gradient, kein Inline-Hex), Bass-H1, Lead-Form-Glaspanel; `tsc` gruen + Screenshot-Smoke 390/1280 verifiziert (Gesichter frei, CTA above-fold). **B2 (i18n-Key-Reorg) bewusst zurueckgestellt** — `home.*`-Keys sind schon topic-sauber + Spec §11 sequenziert Hero direkt nach Architektur-Schnitt; i18n-Konsolidierung wird pro Section gefaltet + finaler Parity-Gate in F2 (vermeidet Doppel-Reorg, der die Hero-Copy ohnehin sofort wieder anfasst). **Befund:** `BeraterSection` ist hardgecodetes Deutsch (nicht i18n) → i18n-Cadence-Entscheidung fuer die Folge-Sektionen offen. **Naechste:** D-Sektionen je section-audit-Loop (Token-strikt + Screenshot 390/1280).

**Goal:** Die claimondo.de-Startseite von 21 auf 12 token-strikte, premium Sektionen umbauen (Hero-B cinematisch, Foto-Narrativ + App-Shield-Motiv, Online-Prüfdienst-Differenzierung, echte Google-Reviews, embedded SV-Finder), auf der kfzgutachter-LP-Qualitätsbar.

**Architecture:** Standalone Next-16-Marketing-App (`claimondo-marketing/`, :3006). `LandingPage` → `HauptseitePremium` (16 Sektionen) + 4 angehängte werden zu **12 fokussierten Section-Komponenten** unter `components/landing/sections/` konsolidiert. Copy bleibt mehrsprachig in `i18n/messages/*.json` (6 Sprachen). Strikt Design-Tokens (`claimondo-*` → `var(--brand-*)`), `next/image` + `.webp`-Assets.

**Tech Stack:** Next 16 / React 19 / Tailwind v4 (Token-`@theme`) / next-intl / sharp (Asset-Pipeline) / Mapbox GL (SV-Finder) / Google Places API (Reviews) / Playwright (Screenshot-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-31-home-premium-rework-design.md` (inkl. §13).

---

## File Structure

**Neue/umgebaute Section-Komponenten** (`claimondo-marketing/components/landing/sections/`, eine Datei = eine Section, ~80–160 LOC):
- `HeroSection.tsx` (NEU) — Section 1, cinematisch, ersetzt das alte Hero-Foto-Band (#1) + Hero+Form (#2)
- `TrustStripSection.tsx` (BESTAND, erweitern: echte KPIs + Google-Reviews-Slot)
- `AnsprueecheSection.tsx` (NEU) — „Was Ihnen zusteht" (Merge #4 + #8 + #19)
- `WieEsFunktioniertSection.tsx` (NEU) — Merge #5 + #7 + #11 + Foto-Strecke + Prüfdienst-Beat
- `BeweisSection.tsx` (NEU) — Merge #9 + #12 + #17 + Prüfdienst-Kontrast
- `ProduktAppSection.tsx` (umbau von `PortalMockupSection`) — echte Portal-Screens + App-Shield
- `MenschenSection.tsx` (NEU) — Merge #6 (`BeraterSection`) + #20 (`FounderSection`)
- `SvFinderSection.tsx` (NEU) — embedded Mapbox SV-Finder (ersetzt statisches „Einsatzgebiet" #13)
- `SchadensreportSection.tsx` (umbau von `SchadensreportTeaserSection`)
- `FaqSection.tsx` (NEU) — #15
- `BottomCtaSection.tsx` (NEU) — #16
- (Footer = `LandingFooter` BESTAND, Sticky = `StickyCallBar` BESTAND)

**Neue Shared/Infra:**
- `components/shared/GoogleReviews.tsx` (NEU) — Rating + Anzahl + Stimmen (Places API)
- `lib/reviews/google-places.ts` (NEU) — Places-API-Fetch (server, cached)
- `lib/seo/jsonld.ts` (MODIFY) — `aggregateRating` ins `organizationSchema`
- `scripts/optimize-home-assets.mjs` (NEU, einmalig) — Downloads → `public/img/home/*.webp` (sharp)

**Umzubauen:**
- `components/landing/LandingPage.tsx` — neue 12-Section-Komposition
- `components/landing/HauptseitePremium.tsx` — wird zerlegt/abgelöst (am Ende entfernt)
- `i18n/messages/*.json` (×6) — `home.*`-Keys auf die 12-Section-Struktur reorganisieren (paritätisch)

**Zu entfernen nach Migration** (Dead-Code-Gate `knip`): `HauptseitePremium.tsx`, `VersichererTaktikenSection.tsx`, `SiebenFehlerSection.tsx`, `BeraterSection.tsx`, `FounderSection.tsx`, `PortalMockupSection.tsx` (wenn vollständig aufgegangen) — jeweils erst nach Reader-Sweep.

---

## Phase A — Foundation & Asset-Pipeline

### Task A1: Home-Assets als .webp aufbereiten
**Files:** Create `scripts/optimize-home-assets.mjs`; Create `claimondo-marketing/public/img/home/*.webp`

- [ ] **Step 1:** `scripts/optimize-home-assets.mjs` schreiben. **Quellen-Priorität:** zuerst die **bestehende `public/`-Library** (`kfzgutachter-lp/` hero-unfall-frau/-mann · gutachter-handshake · berater · nrw-standorte; `marketing-landing-koeln/` hero-woman/-man · berater · founders · autohaus · office; `brand/` team-founders · team-headset · team-office — teils schon premium/echt), **dann** Aaron-Batch (31.05.) + Archiv ergänzend. `sharp().resize({width:<slot>}).webp({quality:78})` → `public/img/home/`. Slot-Map: `hero-paar` (1600w), `sv-vor-ort` (1000w), `team` (900w), `berater` (700w), `werkstatt-app` (700w), `kundin-app` (700w), `sofa` (1000w). KI-Text-Regel (§13.1, selektiv): BG-Blur (`blur-bg.cjs`-Muster) nur wo nötig; **Vordergrund-/Marken-Text via echtem `claimondo-shield.svg` / echter App-UI im Code überlagert** (kein KI-Shield).
- [ ] **Step 2:** Ausführen, Dateigrößen prüfen (Hero < 250 KB).

Run: `node scripts/optimize-home-assets.mjs && ls -la claimondo-marketing/public/img/home`
Expected: 7 `.webp`, Hero < 250 KB.

- [ ] **Step 3:** Commit. `git commit -m "feat(home): optimierte .webp-Home-Assets + sharp-Pipeline"`

### Task A2: Baseline-Gate grün
- [ ] **Step 1:** Run `cd claimondo-marketing && npx tsc --noEmit` → Expected: EXIT 0.
- [ ] **Step 2:** Run `npm run build` (`NODE_OPTIONS=--max-old-space-size=4096`) → Expected: 12 Routen, kein Fehler. (Bei lokalem EBUSY-`.next/standalone`-Lock: `tsc` reicht, Build im Deploy.)
- [ ] **Step 3:** Run `npm run check:token-audit` (falls in Marketing-App vorhanden) → 0 Verstöße. Notieren als Gate für jede Folge-Task.

---

## Phase B — Architektur-Schnitt (21 → 12)

> Ziel: gleiche Inhalte, neue Struktur, **Build + i18n grün**, noch ohne Premium-Politur. Reine Konsolidierung + Section-Komponenten-Extraktion. Inhalte 1:1 übernehmen (Copy aus den bestehenden `home.*`-Keys), nur neu gruppieren.

### Task B1: Section-Komponenten-Gerüst + LandingPage-Neukomposition
**Files:** Create alle `sections/*.tsx` (Gerüst); Modify `LandingPage.tsx`

- [ ] **Step 1:** Pro Ziel-Section eine `sections/<Name>.tsx` mit dem bestehenden Markup-Block aus `HauptseitePremium.tsx` (1:1 ausgeschnitten) als `async function` (next-intl `getTranslations('home')`). Token-Klassen unverändert übernehmen (sind schon `claimondo-*`).
- [ ] **Step 2:** `LandingPage.tsx` neu komponieren in 12er-Reihenfolge (§3): Hero · TrustStrip · Ansprueche · WieEsFunktioniert · Beweis · ProduktApp · Menschen · SvFinder · Schadensreport · Faq · BottomCta · Footer (+ Sticky).
- [ ] **Step 3:** Merges umsetzen: `AnsprueecheSection` = Ansprüche-Cards + Misstrauens-Trio + Sieben-Fehler-Inhalte; `WieEsFunktioniertSection` = Service-Realität + Plattform-Mechanik + Prozess; `BeweisSection` = BGH-Grid + Wertminderung + Versicherer-Taktiken; `MenschenSection` = Berater + Founder. Inhalt erhalten, Duplikate zusammenführen.
- [ ] **Step 4:** Verify Build: `npx tsc --noEmit` EXIT 0; `npm run build` grün.
- [ ] **Step 5:** Screenshot-Smoke (Playwright, `npm run dev` :3xxx, `/`): mobil 390 + desktop 1280 — visuell vollständig, keine kaputten Sections.
- [ ] **Step 6:** Commit. `git commit -m "refactor(home): 21->12 Section-Konsolidierung (Struktur, Inhalt 1:1)"`

### Task B2: i18n-Keys reorganisieren (6 Sprachen, paritätisch)
**Files:** Modify `i18n/messages/{de,en,tr,ar,ru,pl}.json`

- [ ] **Step 1:** `home.*`-Keys auf die 12-Section-Namespaces mappen (z.B. `home.ansprueche` bleibt, `home.misstrauen`+`home.sieben_fehler` ziehen unter `home.ansprueche.*` ein). DE zuerst, dann 1:1 in 5 Sprachen.
- [ ] **Step 2:** Key-Paritäts-Check: `node -e "const L=['de','en','tr','ar','ru','pl'].map(l=>Object.keys(require('./i18n/messages/'+l+'.json').home)); …"` — alle Sprachen gleiche `home`-Keys. (Pattern aus der Rollentrennung-Session.)
- [ ] **Step 3:** Rollentrennung wahren (`project_marketing_rdg_rollentrennung`): kein „wir verhandeln/setzen durch" — Sweep `grep -nE "[Ww]ir (verhandeln|setzen.*durch|holen.*zurück|klagen)" de.json` muss leer sein.
- [ ] **Step 4:** Verify Build grün + alle 6 JSON `JSON.parse`-valide.
- [ ] **Step 5:** Commit. `git commit -m "refactor(home-i18n): home-Keys auf 12-Section-Struktur, 6 Sprachen paritätisch"`

---

## Phase C — Hero-Pilot (Qualitäts-Muster)

### Task C1: `HeroSection` cinematisch (Section-audit-Loop)
**Files:** Create/replace `components/landing/sections/HeroSection.tsx`

- [ ] **Step 1 (Diagnose/Mockup):** section-audit-Loop — Hero-Mockup gegen die kfzgutachter-LP-Bar (companion). Bild `public/img/home/hero-paar.webp`, `next/image` `priority`, Vollbild.
- [ ] **Step 2 (Build):** Markup: `<section>` mit Foto (`fill`, `object-cover`), **linear-gradient Scrim** `bg-[linear-gradient(...)]` nur über Token-Farben/`var(--brand-*)` (KEIN Inline-Hex; Scrim via `claimondo-navy`/Opacity-Utilities). H1 (Bass: `text-5xl md:text-[3.4rem]`), Sub (Rollentrennung-Copy), 4 Trust-Bullets, CTAs (`primitives.Button`), `HomeLeadFormClient` integriert (Glaspanel). Copy aus `home.hero.*`.
- [ ] **Step 3 (Constraints-Check):** keine Inline-Hex (`check:token-audit`); Scrim = gradient (kein backdrop-blur); App-Shield-Motiv im Bild (Hero-Foto hat App).
- [ ] **Step 4 (Verify):** `tsc`+`build` grün; Screenshot 390 + 1280 — CTA + erstes Trust-Signal above-the-fold (390×640); Scrim-Text lesbar.
- [ ] **Step 5 (Brand-Smoke):** `--brand-primary`→rot setzen, Hero muss durchbranden (Whitelabel-Regel — hier Marketing nicht gebrandet, aber Tokens müssen greifen).
- [ ] **Step 6:** Commit. `git commit -m "feat(home): Hero-Pilot cinematisch (Scrim, Token-strikt, Lead-Form, App-Shield)"`

---

## Phase D — Sektionen 2–12 polieren (je 1 Task, section-audit-Loop)

> Pro Section identischer Loop: Diagnose/Mockup (companion) → Build (Token-strikt, `next/image`, i18n, primitives/shared) → `tsc`+`build` grün → Screenshot 390+1280 → Commit. Premium-Prinzipien §7 (Scrim, Bass+Treble, Proximity, Consolidate). Asset-Zuordnung §8.

- [ ] **Task D2 · TrustStrip:** 4 KPIs (Platzhalter mit `*`-Methodik bis echte Zahlen, §9) + **GoogleReviews-Slot** (Task E1). Commit.
- [ ] **Task D3 · Ansprueche „Was Ihnen zusteht":** konsolidierte Cards (shared `CardLink`), Rollentrennung-Copy. Commit.
- [ ] **Task D4 · WieEsFunktioniert:** 5-Schritt-Ablauf + Foto-Strecke (`sv-vor-ort.webp` + Besichtigungs-Serie aus Archiv) + Prüfdienst-Beat („vor Ort, kein Online-Prüfdienst", §6). Commit.
- [ ] **Task D5 · Beweis:** BGH-Grid + Wertminderung + **Prüfdienst-Kontrast-Block** (dunkel/rot, §6). Commit.
- [ ] **Task D6 · ProduktApp:** echte Portal-Screens (Task E3) + App-Shield-Motiv, „alles live verfolgen". Commit.
- [ ] **Task D7 · Menschen:** Berater + Founder (echte Porträts = §9-Lücke, bis dahin Bestandsbilder) + LexDrive-Erwähnung. Commit.
- [ ] **Task D8 · SvFinder:** embedded Mapbox (Task E2). Commit.
- [ ] **Task D9 · Schadensreport:** Lead-Magnet-Teaser. Commit.
- [ ] **Task D10 · FAQ:** Accordion (`<details>`), Schema-`faqPageSchema`. Commit.
- [ ] **Task D11 · BottomCta:** Navy + Glow (Token-Gradient), Anruf + Online-CTA. Commit.
- [ ] **Task D12 · Footer/Sticky:** `LandingFooter` + `StickyCallBar` an die 12er-Page anpassen. Commit.

---

## Phase E — Integrationen

### Task E1: GoogleReviews-Komponente (Places API)
**Files:** Create `lib/reviews/google-places.ts`, `components/shared/GoogleReviews.tsx`; Modify `lib/seo/jsonld.ts`, `.env.local`

- [ ] **Step 1:** `google-places.ts` — server-fetch `Place Details` (rating, user_ratings_total, reviews[0..3]) via `GOOGLE_PLACES_API_KEY` + Place-ID (aus kgmid `/g/11nhgzgwdj` auflösen). `revalidate: 86400`. Fallback: `null` → Section rendert ohne Reviews (nie erfundene Zahlen, UWG).
- [ ] **Step 2:** `GoogleReviews.tsx` — Rating-Sterne + Anzahl + 2–3 Stimmen (Token-Farben). In TrustStrip einhängen.
- [ ] **Step 3:** `aggregateRating` in `organizationSchema` (nur wenn echte Daten da).
- [ ] **Step 4:** Verify mit echtem Key (Aaron) ODER statischen Aaron-Zahlen; `tsc`+`build` grün. Commit.

### Task E2: SV-Finder embedded (Mapbox)
**Files:** Create `components/landing/sections/SvFinderSection.tsx` (+ ggf. Client-Map-Komponente wiederverwenden)

- [ ] **Step 1:** Bestehende `gutachter-finden`-Map-Komponente als Client-Island einbetten (`NEXT_PUBLIC_MAPBOX_TOKEN`), kompakt + „SV in Ihrer Nähe finden"-CTA. Layout-kritische Props inline-`style` (Mapbox-Klassen-Inzident-Regel).
- [ ] **Step 2:** Verify Karte lädt (Screenshot), `tsc`+`build` grün. Commit.

### Task E3: Echte Portal-Screens
**Files:** `claimondo-marketing/public/img/home/portal-{desktop,mobile}.webp`

- [ ] **Step 1:** Archiv-`portal/dashboard.png` + `timeline-12-schritte.png` als `.webp`; zusätzlich frischer Screenshot der echten Kunde-Fallakte (Playwright-Login app.claimondo.de, Zugang per Env-Var — **Account/Fall von Aaron**, read-only). Mobile-Portal = §9-Lücke.
- [ ] **Step 2:** In `ProduktAppSection` einbinden (`next/image`). Verify. Commit.

### Task E4: Login-Embed (claimondo.de = einheitliche Tür)
**Files:** Create `components/shared/LoginEmbed.tsx`; Modify `components/landing/LandingTopbar.tsx` (+ `LandingFooter.tsx`); nutzt `lib/supabase`

- [ ] **Step 1:** `LoginEmbed.tsx` (Client) — kompaktes Formular (Email + Passwort via `forms/TextField`), `supabase.auth.signInWithPassword`; bei Erfolg Redirect via `roleToPath(profile.rolle)` auf `https://app.claimondo.de/<portal>` (geteiltes `.claimondo.de`-Cookie trägt die Session). Fehler → Inline-Meldung. Token-strikt, i18n (`home.login.*`, 6 Sprachen).
- [ ] **Step 2:** In `LandingTopbar` als „Login"-Dropdown einhängen (statt/neben dem bisherigen `app.claimondo.de/login`-Link); Logged-in zeigt weiter „Zu meinem Portal →". Sekundär-Einstieg im Footer („Bereits Kunde?/SV?").
- [ ] **Step 3:** Verify: Login mit Test-Account (Env-Var) → Redirect ins Portal; falsche Daten → Inline-Fehler; `tsc`+`build` grün; Screenshot Dropdown 390+1280.
- [ ] **Step 4:** Commit. `git commit -m "feat(home): Login-Embed im Topbar (Supabase, shared-cookie, Rollen-Redirect)"`

---

## Phase F — Finale QA & Deploy

- [ ] **Task F1:** Dead-Code: abgelöste Komponenten entfernen (`HauptseitePremium`, `VersichererTaktiken`, `SiebenFehler`, `Berater`, `Founder`, `PortalMockup` falls aufgegangen) nach Reader-Sweep; `npm run check:knip` grün.
- [ ] **Task F2:** Volle Gates: `tsc --noEmit` + `npm run build` + `check:token-audit` + `check:knip` grün; 6-Sprachen-JSON valide + paritätisch; Rollentrennung-Sweep leer.
- [ ] **Task F3:** Full-Page-Screenshot-Smoke an 360/390/414 + 1280/1440, alle 12 Sektionen, gegen die Bar. Liefern via Screenshots an Aaron.
- [ ] **Task F4:** PR `--base kitta/marketing-copy-rollentrennung` (oder rebased auf aktuellen Marketing-Stand), 7-Punkte-Audit im Commit-Body. Deploy via `deploy-marketing-vps.py` nach Merge.

---

## Self-Review (gegen Spec)

- **Spec-Coverage:** §3 Architektur → Phase B; §4 Hero → Phase C; §5 Personas/App-Shield → Hero+Menschen+ProduktApp; §6 Prüfdienst → D4/D5; §7 Premium-Prinzipien → je Section-Loop; §8 Assets → A1; §9 Lücken → E1/E3 + Platzhalter-Flags; §10 Constraints → in jeder Task (Tokens/i18n/RDG); §11 Reihenfolge → Phasen A–F; §13 Nachträge → A1(Tokens), E3(Portal), E1(Reviews), E2(SV-Finder), Page-Typ=Programm-Scope (späteres Sub-Projekt). ✅ keine offene Spec-Lücke.
- **Platzhalter:** Asset-Auswahl + exakte JSX entstehen pro Section im section-audit-Loop (bewusst, da Design-Iteration) — Struktur/Pfade/Constraints/Verify sind konkret. KPI-/Review-Zahlen sind Daten-Inputs (Aaron), als solche markiert (nie erfunden).
- **Typ-/Namens-Konsistenz:** Section-Dateinamen ↔ Imports in `LandingPage` konsistent; `home.*`-Keys ↔ `getTranslations('home')`.

## Execution Handoff

(siehe Chat — Subagent-Driven vs. Inline)
