# HANDOFF — Marketing Home Premium-Rework · Session 2 (01.06.2026)

Fortsetzung von [`docs/31.05.2026/HANDOFF-marketing-home-rework-session.md`](../31.05.2026/HANDOFF-marketing-home-rework-session.md). Diese Session hat den Home-Premium-Rework von Phase C (Hero-Pilot) bis D4 vorangetrieben — **7 Sektionen/Features gebaut + verifiziert + gepusht**, plus die VPS-Infra-Vorbereitung für E1. Alles committet, Working-Tree clean, kein eigener offener Stash.

---

## 0 · Verweise (Doc-Kette)

| Was | Pfad |
|---|---|
| **Plan** (Phasen A–F, Checkbox-getrackt, mit Status-Block oben) | `docs/superpowers/plans/2026-05-31-home-premium-rework.md` |
| **Spec** (Design, §1–13, freigegeben) | `docs/superpowers/specs/2026-05-31-home-premium-rework-design.md` |
| **Original-Handoff** (Session 1) | `docs/31.05.2026/HANDOFF-marketing-home-rework-session.md` |
| **Session-Marker** (Resume-Doc, Tooling/Gotchas) | `~/.claude/projects/…/memory/SESSION-ACTIVE-marketing-home-premium-rework.md` |
| **Memorys** | `project_home_premium_rework`, `project_marketing_rdg_rollentrennung` |

**Branch:** `kitta/marketing-home-premium-rework` (gestackt auf `kitta/marketing-copy-rollentrennung` #2140)
**Worktree:** `.claude/worktrees/marketing-i18n-locale-urls/` (Dir-Name irreführend — der Branch ist der Home-Rework)
**App:** `claimondo-marketing/` (Standalone Next 16, dev `npx next dev -p 3097`)

---

## 1 · Diese Session geliefert (9 Commits)

| Commit | Phase | Inhalt |
|---|---|---|
| `62aee10b0` | **C** | Hero-Pilot cinematisch — zwei Bänder → ein Hero (hero-paar.webp mit echtem App-Shield, Token-Scrim *Scrim-beats-Box*, Lead-Form-Glaspanel) |
| `dad50e2c2` | Hero-Copy | Headline → „Unverschuldet im Unfall? / Wir haben's im Griff". Alte Headline **relocatet** nach `home.koordination` (6 Spr., kein Verlust) |
| `3c83f3d5b` | **D2** | Trust-Strip premium — Bass-KPIs + Treble-Labels + UWG-Methodik |
| `bd43c5079` | **D3** | Ansprüche-Block — nummerierte 1-4 Premium-Cards statt Card-Wall |
| `54b4eead4` | **E4** | Login-Embed im Header — Supabase-signIn-Dropdown → `roleToPath` → app.claimondo.de; client.ts cookie domain=.claimondo.de (prod); home.login.* ×6 |
| `c18fa9d4b` | **E1** | LIVE Google-Bewertungen in der Trust-Strip (Places API, null-safe, home.reviews.* ×6) |
| `b5f584b23` | **D4** | Vor-Ort-Band „Wie es funktioniert" — sv-vor-ort.webp + §6 Prüfdienst-Konter + die relocatete koordination-Headline **gelandet** |
| `0328ebd4c`, `df5211b08` | docs | Plan-Status-Updates |

**VPS-Infra (DONE, außerhalb Branch):** `GOOGLE_PLACES_API_KEY` in `/etc/claimondo-marketing/.env.local` gesetzt (server-side copy aus `/etc/claimondo/.env.local`) **+** in `deploy-marketing-vps.py` `COPY_KEYS` aufgenommen (lokales untracked Deploy-Tool) → übersteht Redeploys. Kein Service-Restart (aktueller prod-Build hat den E1-Code noch nicht; wird beim nächsten Marketing-Deploy scharf).

**Verifikation je Section:** `npx tsc --noEmit` grün + Screenshot-Smoke 390/1280 (Element-Shots) ausgewertet. E4-Fehlerpfad + E1-Reviews **live gegen Supabase/Places API** verifiziert.

---

## 2 · Gelockte Entscheidungen (Aaron, verbindlich)

1. **Texte nie verlieren — nur relocaten.** Jede displaced Copy aus den alten 21 Sektionen bekommt ein neues Zuhause (oder eine neue Route). Umgesetzt: alte Hero-Headline → `home.koordination` → in D4 verdrahtet.
   **Noch offen-zu-platzieren:** `home.hero_band.*` (eyebrow „Sofort nach dem Unfall" + „Adrenalin geht." / „Anspruch bleibt.") — wurde beim Hero-Merge nicht mehr gerendert, lebt aber unverändert in der i18n; braucht noch einen Ziel-Ort.
2. **i18n = volle 6-Sprachen-Parität SOFORT pro Section.** Aktuell **20 home-Keys** in allen 6 Sprachen.
3. **„Ein Team hinter Ihrem Fall" = Section #7 (Menschen)**, Plan-Reihenfolge (nicht unter die Trust-Strip vorgezogen).
4. **Hero-Headline** = „Unverschuldet im Unfall? / Wir haben's im Griff" (umgesetzt).

---

## 3 · Tooling & Gotchas (PFLICHT für die Fortsetzung)

- **i18n editieren NUR via String-Insert, NIE `JSON.parse`/`stringify`.** `de.json` hat **Duplicate-Keys** (`gutachter_partner_leads` ×4); ein Parse/Reserialize **dedupliziert** sie still = **Datenverlust** (in dieser Session abgefangen). Muster-Scripts: `_pilot-shots/add-login-i18n.cjs`, `add-reviews-i18n.cjs`, `add-koordination-i18n.cjs`, `headline-relocate-str.cjs`. Anker = ein Key-Name, der in allen 6 Files identisch ist (z. B. `    "koordination": {`), Werte per Sprache. Danach immer `git diff --stat` (≈ +N Zeilen pro File) + Parity-Check + `grep -c '"gutachter_partner_leads"' de.json` muss **4** bleiben.
- **Screenshot-Harness** (`_pilot-shots/`, untracked-throwaway): `shoot.cjs` (page/full), `shoot-el.cjs` (`SHOOT_SEL='section[aria-labelledby=…]' SHOOT_TAG=x node shoot-el.cjs`), `shoot-login.cjs` (interaktiv). Playwright via **Root**-node_modules (absolute require — Worktree hat kein eigenes node_modules). Element-Shots mit `deviceScaleFactor:2` sind am lesbarsten.
- **Dev-Server:** `cd claimondo-marketing && npx next dev -p 3097`. Braucht `.env.local` (schon da, gitignored: SUPABASE_* + MAPBOX + APP_URL + GOOGLE_PLACES_API_KEY, aus Root kopiert). `TaskStop` killt nur den Wrapper → Port-Orphan via PowerShell `Get-NetTCPConnection -LocalPort 3097 | %{Stop-Process $_.OwningProcess -Force}` killen.
- **EBUSY-Lock:** voller `npm run build` failt lokal beim `rmdir .next/standalone` (Parallel-Sessions). **`tsc --noEmit` ist der lokale Gate**; voller Build im Deploy / ruhigen Fenster.
- **VPS:** `python scripts/vps-ssh-exec.py "<cmd>" ["<cmd2>"]` mit `$env:VPS_SSH_PASSWORD` + `$env:PYTHONIOENCODING='utf-8'` (sonst Crash bei pm2-Tabellen-Boxchars). HOST/USER hardcoded (212.132.119.110 / root). Secrets immer **server-side** greppen, nie printen. Marketing-PM2-Service = `claimondo-marketing` (:3006), env `/etc/claimondo-marketing/.env.local`. **root-PW rotieren** (mehrfach im Chat exponiert).
- **Token-strikt:** `claimondo-*`-Klassen (→ `var(--brand-*)`), kein Inline-Hex. Scrims = Tailwind-Gradient-Utilities auf Token-Farben. Sterne/Status dürfen semantic (amber/emerald) sein.
- **Write-Tool-Artefakt:** nach jedem Write auf `</content>` am Dateiende scannen ([[feedback_write_tool_content_artifact]]).

---

## 4 · OFFENE AUFGABEN (so fortsetzen)

Frische Session → section-audit-Loop pro Section (Diagnose → Build token-strikt + `next/image` + i18n ×6 → `tsc` + Screenshot 390/1280 → Commit). Jede displaced Copy **relocaten statt löschen**.

### D — restliche Sektionen
- [ ] **D5 · Beweis / Authority** — BGH-Urteile (`BghAuthorityGrid`) + Wertminderung (`WertminderungSandenDannerSection`) + Versicherer-Taktiken (`VersichererTaktikenSection`) zu **einem** Beweis-Block bündeln. **+ dunkler Prüfdienst-Kontrast-Block** (§6: „so begutachten WIR / so ‚prüft' die Versicherung", ControlExpert/K-Expert kürzt 30–40 % am Schreibtisch). Bestehende Komponenten existieren in `components/landing/` + `sections/`.
- [ ] **D6 · Produkt / App** — echte Portal-Screens (→ **E3**, braucht Test-Account) + App-Shield-Motiv, „alles live verfolgen". Aktuell `ProduktAppSection` = Wrapper um `PortalMockupSection`.
- [ ] **D7 · Menschen** — **„Ein Team hinter Ihrem Fall"** Band mit `team-band.webp` (5er-Team, 16:9) als Lead + Founder (`FounderSection`, E-E-A-T) + Berater (`BeraterSection`). **BeraterSection ist hardgecodetes Deutsch → hier i18n-Lücke schließen** (Aaron: 6-Spr.). Berater enthält den ControlExpert-Prüfdienst-Quote — entscheiden ob er hier bleibt oder nach D5 wandert.
- [ ] **D8 · SV-Finder** — embedded Mapbox (→ **E2**), ersetzt statisches „Einsatzgebiet" (#13, `home.einsatzgebiet.*`).
- [ ] **D9 · Schadensreport** — Lead-Magnet-Teaser (`SchadensreportTeaserSection`, `home.schadensreport_teaser.*`). `SchadensreportSection` ist aktuell Stub.
- [ ] **D10 · FAQ** — Accordion (`<details>`), `home.faq.*`, `faqPageSchema` (liegt schon im Hero-JSON-LD). `FaqSection` aktuell Stub.
- [ ] **D11 · Bottom-CTA** — Navy + Glow (Token-Gradient), Anruf + Online-CTA. `home.bottom_cta.*`. `BottomCtaSection` aktuell Stub.
- [ ] **D12 · Footer/Sticky** — `LandingFooter` + `StickyCallBar` an die 12er-Page anpassen (Footer hat schon Login-Link in der Partner-Spalte).

### E — Integrationen
- [ ] **E2 · SV-Finder embedded** — `gutachter-finden`-Mapbox als Client-Island (`NEXT_PUBLIC_MAPBOX_TOKEN` da). Layout-kritische Props inline-`style` (Mapbox-Klassen-Incident).
- [ ] **E3 · Echte Portal-Screens** — Archiv `portal/dashboard.png` + `timeline-12-schritte.png` als `.webp` + **frischer Screenshot Kunde-Fallakte** (Playwright-Login app.claimondo.de). **Braucht: Test-Account von Aaron.** Mobile-Portal = Lücke.
- [ ] **E1-Followup · `aggregateRating`** ins `organizationSchema` (`app/layout.tsx`, via `getGoogleReviews()` dedupe-fetch) — SEO-Sterne in Suchergebnissen. (Visible Reviews sind schon live; das ist der Schema-Zusatz.)
- [x] **E4 · Login-Embed** Header — DONE. Offen: **Erfolgs-Strecke smoken** (prod + Test-Account: Login → Redirect ins Portal; cross-subdomain-Cookie greift nicht auf localhost).

### F — Finale QA & Deploy
- [ ] **F1 · Dead-Code** — `LoginCtaLink` ist jetzt **orphan** (nur noch Definition + ein Kommentar referenzieren ihn) → löschen; `nav.anmelden`-Key ungenutzt. Plus die alten abgelösten Sektionen nach Reader-Sweep (`HauptseitePremium` etc.). `knip` prüfen.
- [ ] **F2 · Gates** — `tsc` + `npm run build` + `token-audit` + `knip` grün; 6-Sprachen-JSON valide + paritätisch (aktuell 20 Keys); Rollentrennung-Sweep leer.
- [ ] **F3 · Full-Page-Screenshot-Smoke** 360/390 + 1280/1440, alle Sektionen, an Aaron.
- [ ] **F4 · PR** `--base kitta/marketing-copy-rollentrennung` (oder rebased), 7-Punkte-Audit. Deploy via `deploy-marketing-vps.py` nach Merge.

### Daten-Bedarf von Aaron (build-time, nicht blockierend bis D6/E3)
1. **Portal-Test-Account/Fall** (Email+PW, read-only) → E3-Screenshots + E4-Erfolgs-Smoke.
2. (Google-Reviews: **erledigt** — live aus Places API, Key gesetzt.)

### i18n-Schuld (separater Sweep, Aaron-Regel „6-Spr. pro Section")
`ServiceRealitaetSection`, `PlattformMechanikSection`, `BeraterSection` rendern hardgecodetes Deutsch (+ Konstanten in `lib/brand/service-pitch.ts`). Bestand vor dem Rework — beim Anfassen der jeweiligen D-Section (D7 Berater, D4-Umfeld Service/Plattform) mitziehen.

---

## 5 · Session-Abschluss-Check (Regel 3)

```
git status            → Working-Tree clean (nur gitignored .env.local + untracked _pilot-shots/)
git stash list        → stash@{0} = kitta/aar-kunde-gutachten-werte (PR1142) — FREMDER Workstream,
                        dokumentierter persistenter Stash, bewusst unangetastet (nicht aus dieser Session)
git log --not --remotes → leer (alle 9 Commits auf origin/kitta/marketing-home-premium-rework)
```

- **Kein eigener offener Stash.** Der eine Stash gehört einem anderen Branch/Workstream (wie schon im Session-1-Handoff dokumentiert).
- **Kein PR offen** für diesen Branch → der Merge-Babysitter (sync-staging-Session) fasst ihn nicht an.
- `_pilot-shots/` (Screenshot-Harness + i18n-Scripts) ist untracked-throwaway — kann beim echten Session-Ende gelöscht werden, ist aber als Tooling-Referenz nützlich.
