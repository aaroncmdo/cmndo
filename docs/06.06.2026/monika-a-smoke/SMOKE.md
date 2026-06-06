# Monika A-Flow — Browser-Smoke (06.06.2026)

Self-contained Playwright-Smoke (`scripts/_monika-a-smoke.mjs`, nicht committet): Mini-HTTP-Server
serviert `public/embed/monika.js` + `monika.png` und mockt `POST /api/anfrage-from-lp` → `{ok,modus:'callback'}`.
Cluster-Modus (`data-cluster`, also `isClaimondoBranded=true`). Voller **Haftpflicht/unverschuldet**-Pfad
durchgeklickt. **EXIT 0, keine Page-Errors.**

## Verifiziert (Screenshots)
- **01-fab.png** — Siegel-FAB (navy, „CLAIMONDO PARTNER · UNFALL ASSISTANCE" + Schild + 5 Gold-Sterne)
  unten rechts + SEO-Backlink-Anchor.
- **02-greeting-chips.png** — Navy-Header mit Monika-Foto + „Monika" + „Schadenberaterin · ● online".
  Drei **getippte** Greeting-Bubbles (inkl. Selbstvorstellung, 👋 😊). Vier Choice-Chips
  (Schadensberatung / Haftpflichtschaden / Wertgutachten / Gegengutachten), ondo-Rand + navy-Text.
- **03-contact-form.png** — ondo User-Bubbles (Morgen/Vormittag rechts), Kapazitäts-Bestätigung
  („Einen Moment… ✅ / Der Gutachter hat zu der Zeit Kapazität.", **kein echter Kalender**),
  Kontakt-Form (Vorname/Nachname/Telefon + DSGVO-Consent + Absenden).
- **04-success-gutschein.png** — Submit → „Perfekt, vielen Dank! 😊" + „Wir melden uns…" +
  **25€-Tankgutschein-Karte (gold)**.

## Token-/Brand-Treue
navy Header `#0D1B3E`, ondo User-Bubbles + Chip-Rand `#4573A2`, weiße Monika-Bubbles auf `#f8f9fb`,
gold Gutschein `#C9A961`. Umlaute + Emojis korrekt. Light-Theme, mobile-first Panel.

## Build
`build:embed`: 43.9 KB raw / **16.1 KB gzipped** (Budget < 30 KB). `typecheck:embed` grün. 17 vitest grün.

## Offene Politur (nicht-blockierend, Backlog)
Mini-Avatar wiederholt sich neben jeder aufeinanderfolgenden Monika-Bubble (statt nur am Gruppen-Ende).
