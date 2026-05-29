# HANDOFF — Email-Template-System („impeccable") · 2026-05-29

**Session:** 44cba81d (Worktree `.claude/worktrees/datenschutz-v2-page`)
**Status:** P1a + P1b + P2 + P3 **gebaut & verifiziert**. Fast alles auf `staging` gemergt; nur Batch 4 (#2023) offen+mergeable. Reststrecke = nur noch **P4** (Feinschliff) + **imagin-Freischaltung**.

Ziel der Strecke: die ~41 transaktionalen react-email/Resend-Templates vom alten `EmailLayout`/`InfoTable`-Set auf ein **markentreues, token-gebundenes, Outlook-sicheres Primitive-Set** heben — visuell wie Mockup v7, ohne den funktionalen Kern (Magic-Links, Zugangsdaten, i18n, Whitelabel, PDF-Anhänge, Idempotenz, alle Conditional-Branches) zu brechen.

---

## 1 · Merge-Stand (PRs, alle `--base staging`)

| PR | Inhalt | Stand |
|---|---|---|
| (Squash #1993) | **P1a** Tokens + Primitive-Set · **P2** KundeWelcome-Flagship | ✅ GEMERGT |
| #1998 | **P1b** gebackener Hero (composeHero + `email-hero`-Bucket + Wiring) | ✅ GEMERGT |
| #2009 | **P3 Batch 0+1** Tier-3 (Admin/Auth) + `MailHeader` + 2 tote Templates gelöscht | ✅ GEMERGT |
| #2016 | **P3 Batch 2** 20 Tier-2-Templates | ✅ GEMERGT |
| #2018 | **P3 Batch 3** `PositionsTable` + `DocumentList` + 4 medium-Templates | ✅ GEMERGT |
| **#2023** | **P3 Batch 4** 8 Tier-1-Kunden-Mails (FINAL) | 🟡 OFFEN / MERGEABLE — Branch `kitta/email-p3-batch04` |

**Nach #2023-Merge sind ALLE 37 verbleibenden Templates migriert → P3 komplett.**

---

## 2 · Architektur (`src/lib/email/`)

- **`tokens.ts`** — eine Quelle: Farben (navy/ondo/gold/cream/surface…), Spacing `space(n)=n*4px`, Radien (sm8/md12/lg14/xl18/pill999), Typo, `maxWidth 600`.
- **`components/`** (Primitive-Set, alle Token-gebunden, tabellen-basiert/Outlook-safe, je `.tsx` mit Token-Audit-Skip-Header):
  - **Layout** → `EmailShell` (Body+BG, `dark`-Prop für Navy-Hero ohne Bild, Preheader+Spacer, color-scheme-Meta), `Heading`, `Paragraph`.
  - `MailHeader` (Tier-2/3 schlanker Wortmarke+Gold-Header, `logoUrl`/`logoText` whitelabel).
  - `Hero` (Tier-1 dark: Logo-Chip + Gold + Headline + optionaler `VehicleCard`-Slot; `logoText` = Firmenname-Fallback).
  - `Card` (weiße Content-Box mit Shadow), `Button` (bulletproof VML, `bg`-Prop), `VehicleCard`, `Stats` (StatGrid/StatTile/StatusPill), `BeraterCard` (`label`-Prop), `Timeline`, `PositionsTable` (Rechnungs-Positionen), `DocumentList` (Download-Links), `Blocks` (Callout/Note/Trustbar/InfoRow/Footer mit `onDark`).
  - `index.ts` = Barrel.
- **`hero-image/`** (P1b) — `compose.ts` `composeHero(base, car, opts)` (sharp: geblurrte Basis + Navy/Glow-SVG + Fahrzeug → 1 JPG) + `fetchImageBuffer`. `store.ts` `getOrCreateHeroImageUrl(db, fahrzeug)` → generiert einmal je (make,modell,farbe), lädt in **public Bucket `email-hero`** (Migration `20260529103010`), liefert stabile URL; defensiv (Fehler → null).
- **`google/kunde-berater.ts`** — `resolveKundeBerater(db,{claimId,leadId,terminVergangen})`: pre-Termin Dispatcher / post-Termin Kundenbetreuer.
- **`google/flows.ts`** `sendKundeWelcome` — verdrahtet Berater + Hero-Kaskade (gebackener Hero → VehicleCard → flacher Navy). **Idempotenz unverändert.**
- **`google/templates/*.tsx`** — alle migriert. **`layout.tsx` (altes `EmailLayout`/`InfoTable`/`NAVY`/`ONDO`/`APP_URL`) bleibt** — viele Templates importieren `APP_URL`/`EmailBrand` weiter daraus. Erst nach vollständigem Sweep + Verifikation entrümpeln.

### Tier-Modell (entscheidet die Optik)
- **Tier 1 (Kunde, kunden-gerichtet):** `EmailShell dark` + `Hero` (Whitelabel: `brand.logoUrl`/`firmenname` + `brand.primary`-CTA) + `Card` + `Footer onDark`. KundeWelcome zusätzlich VehicleCard/StatGrid/BeraterCard. i18n via `*.i18n.ts`.
- **Tier 2 (SV/Kanzlei/Büro/Dispatcher, B2B intern):** hell, `MailHeader` + `Card` + `InfoRow`, deutsch, kein Whitelabel.
- **Tier 3 (System/Auth):** minimal, hell, immer Claimondo (TwoFactorCode, Admin-Alerts).

---

## 3 · Migrations-Rezept (für jedes Template gleich)

1. Import `from './layout'` → `from '../../components'` (+ `email` aus `../../tokens`; `APP_URL`/`type EmailBrand` weiter aus `./layout`).
2. `EmailLayout` → `EmailShell` (Tier 1: `dark` + `Hero`; Tier 2/3: `MailHeader`); Body in **ein** `<Card>`; `<Footer onDark={tier===1}>`.
3. `InfoTable rows={[[l,v],…]}` → je Zeile `<InfoRow label value />` (bzw. `StatGrid`/`PositionsTable`/`DocumentList`).
4. `Button` `brand`-Prop → `bg={brand?.primary}`. Inline-Links → `email.color.ondo`.
5. **Erhalten 1:1:** Export-Form (named `XxxEmail`+`subject`, default, oder mixed), alle Props, alle Conditional-Branches + Helper, alle i18n-`s.*`-Strings (nichts hartkodieren/übersetzen), Umlaute. PDF-Anhänge liegen im **Flow**, nicht im Template.

---

## 4 · Gelernte Lektionen / Gotchas (WICHTIG für Folge-Sessions)

- **Klassifikation ≠ Wahrheit:** Der Klassifikations-Workflow lag mehrfach falsch (2 „tote" Templates waren live via **dynamische `await import()`** in stripe-webhook/cron; `MiniWizardMagicLink.i18n.ts` „fehlte" angeblich, existierte aber). → **Vor jedem Löschen `grep -rn` über ganz `src/`** (inkl. dynamische Imports). **Disk-State (git) prüfen, nicht dem Workflow-Report trauen.**
- **Workflow-Reliabilität:** `agent({schema})` hatte mal 17/20 `StructuredOutput`-Fails (Schema-Rückgabe-Zeremonie, nicht der Edit). **Lösung: ohne `schema`, Text-Return + `git status`-Wahrheitscheck.** Bei Fleet-Sättigung (10+ Sessions) → Parallel-Agents rate-limiten komplett → **inline migrieren**.
- **Stacked-PR Squash-Drift:** Werden gestackte PRs gemergt (Squash), kollidiert der Rest (Ancestry-Bruch, meist nur `index.ts`). **Fix: Branch auf aktuelles staging rebasen** (`git reset --hard origin/staging` + Delta-Files via `git checkout <alt> -- <files>` + `index.ts`-Exports manuell ergänzen), force-push. **PR-Drei-Punkt-Diff prüfen** (`gh pr view --files`), NICHT Zwei-Punkt (zeigt fremde staging-Changes als Phantom — sah aus wie Revert fremder Arbeit, war keiner).
- **imagin:** Fürs Email die **direkte `cdn.imagin.studio`-URL** (der `/api/fahrzeug/imagin`-Proxy ist browser-only). Gated auf `NEXT_PUBLIC_IMAGIN_CUSTOMER !== 'demo'` → bis Freischaltung `heroBildUrl=null` → flacher Navy-Hero (kein Wasserzeichen).
- **Berater-Phasenlogik (Aaron):** pre-Termin → `faelle.lead_id→leads.zugewiesen_an→profiles` (Dispatcher); post-Termin → `claims.kundenbetreuer_id→profiles` (Kundenbetreuer).
- **SVG-Logos** werden in vielen Mail-Clients geblockt → Claimondo-Default = Text-Wortmarke-Chip (kein SVG); Brand-Logo nur via `brand.logoUrl` (SV liefert PNG).
- **Worktree:** isoliert in `datenschutz-v2-page`; `tsc --noEmit` + `vitest` als Gate (kein voller `next build` nötig — reine Lib, kein Route/`'use server'`-File geändert).

---

## 5 · Verifikation (Gate)

```
cd .claude/worktrees/datenschutz-v2-page
npx vitest run src/lib/email      # zuletzt 21/21 (13 Files)
npx tsc --noEmit                  # exit 0
```
Render-Smoke (Pflicht bei Template-Änderung): throwaway-Test rendert die Mail je Zustand → HTML, Playwright-Screenshot, im selben Turn auswerten. Muster siehe Commit-Historie.

---

## 6 · Reststrecke

- **#2023 mergen** (letzter P3-Batch).
- **imagin freischalten:** `NEXT_PUBLIC_IMAGIN_CUSTOMER` auf Prod-Account → echtes Kundenauto im P1b-Hero (statt demo).
- **P4 (Feinschliff):** Plain-Text-Multipart (Zustellbarkeit/Accessibility), Dark-Mode-Tuning (Card-/Cream-Flächen), `react-email dev`-Preview-Harness, Bild:Text-Ratio.
- **Offene Design-Entscheidungen:** dediziertes geblurrtes „Autowelt"-Basisfoto (aktuell `public/brand/hero-unfall-mann.png`); `sharp` als **direkte** Dependency deklarieren (aktuell transitiv via next/colorthief 0.34.5); Social-Proof-Quelle (Timeline/Badge); whitelabel-Heading-Leak („Willkommen bei **Claimondo**" auch bei gebrandeten Mails — war im alten Template auch so).

---

## 7 · Referenzen
- Design-Spec: `docs/superpowers/specs/2026-05-29-email-template-system-design.md`
- Mockup v7: `docs/superpowers/specs/2026-05-29-email-template-v7-mockup.html`
- Pläne: `docs/superpowers/plans/2026-05-29-email-template-system-p1a.md`, `…-p2-kundewelcome.md`, `…-p3-sweep.md`
- **Scope-Grenze:** Email-only. WhatsApp/SMS explizit **NICHT** im Scope (YAGNI). WhatsApp via Baileys kann keine zuverlässigen nativen Buttons → Link-CTA; echte Buttons nur über offizielle WA-Business-Cloud-API.
