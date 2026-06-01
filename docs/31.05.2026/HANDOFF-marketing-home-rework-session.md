# HANDOFF — Marketing-Session 31.05.2026 (i18n live · P5 · Rollentrennung · Home-Premium-Rework)

Stand zum Feierabend. Diese Session umfasste mehrere Marketing-Stränge; **Hauptfokus + aktiver Build = der Home-Premium-Rework** (§3). Alles committet + gepusht, nichts liegt offen im Working-Tree.

---

## 0 · Strang-Status (Überblick)

| Strang | Branch / PR | Stand |
|---|---|---|
| **i18n-SEO** | `kitta/marketing-i18n-locale-urls` · **#2117** | LIVE auf claimondo.de (:3006), override-deployed. Locale-URLs crawlbar (de prefix-frei, en/tr/ar/ru/pl präfixiert). PR offen. |
| **P5 Marketing-aus-Monolith** | `kitta/p5-marketing-aus-monolith` · **#2121** | Von mir als fertig + sicher freigegeben (Soft-404 ≠ echter Gap). **Merge-Session** hat es übernommen (mergt/merged staging). Danach P4 = nginx-Fallback entfernen (VPS, Aaron). |
| **Rollentrennung Claimondo/LexDrive** | `kitta/marketing-copy-rollentrennung` · **#2140** | OFFEN, gestackt auf #2117. 6 Sprachen, 34 Keys/Sprache + 3 Spokes + TrustBlock + kfzgutachter-LP. RDG-safe. `tsc` grün, JSON valide, Platzhalter-Parität. Memory: [[project_marketing_rdg_rollentrennung]]. |
| **Home-Premium-Rework** | `kitta/marketing-home-premium-rework` (gestackt auf #2140) | **AKTIVER BUILD.** Spec+Plan+A1+B1 committet+gepusht. Reststrecke B2→F (§3). |

**app.claimondo.de/-404** (gemeldet von Merge-Session, #2121-Folge): Bare-Root des App-Subdomains hat keinen Inhalt mehr. **Empfehlung: 301 `app.claimondo.de/` → `/login`** (App = Produkt-Tür; SEO bleibt auf claimondo.de). Alternative → `claimondo.de/`. nginx-Regel = Merge-/VPS-Session.

**Sicherheit:** Das im Chat mehrfach exponierte Passwort ist **= VPS-root** + wurde als App-Login gegeben → **rotieren** (und VPS-root ≠ App-Login trennen).

---

## 1 · Was diese Session geliefert hat

1. **Rollentrennung (#2140)** end-to-end: jede „wir verhandeln/setzen durch/holen zurück/klagen"-Stelle → „unsere Partnerkanzlei" über 6 Sprachen (Erst-Pass 23 Keys + Nachtrag 11, via 5 Sprach-Subagenten). RDG-Motiv (Claimondo ist keine Kanzlei).
2. **section-audit-Skill** installiert (`~/.claude/skills/section-audit/`).
3. **Home-Premium-Rework**: voller Brainstorm→Spec→Plan→A1→B1 (Details §3). Visual-Companion-Session (Mockups), section-audit-Framework.

---

## 2 · Tooling & Gotchas (für die Fortsetzung wichtig)

- **Visual Companion** (superpowers brainstorming): `bash <skill>/scripts/start-server.sh --project-dir C:/pwtool/claimondo-brainstorm` (Windows → `run_in_background:true`, dann `state/server-info` lesen). Server **liefert KEINE lokalen Statics** → Bilder als **Data-URIs einbetten** (sharp resize → base64; Muster `C:/pwtool/embed-personas.cjs`, `blur-bg.cjs`, `build-home-mock.cjs`). Auto-Exit nach 30 Min → bei Neustart neue Session-Dir, Screens rüberkopieren.
- **Asset-Pipeline:** `claimondo-marketing/scripts/optimize-home-assets.mjs` (sharp, by-width resize = Ratio erhalten). Quellen: bestehende `public/`-Library (`kfzgutachter-lp/`, `marketing-landing-koeln/`, `brand/` + echte Brand-SVGs) + Downloads-Batch + Archiv.
- **EBUSY-Lock:** `npm run build` failt lokal beim `rmdir .next/standalone` (8 Parallel-Sessions locken). `tsc --noEmit` ist der verlässliche lokale Gate; voller Build im ruhigen Fenster/Deploy.
- **i18n:** 6 Sprachen (`de/en/tr/ar/ru/pl`), Key-paritätisch halten. **Rollentrennung-Copy-Regel** ([[project_marketing_rdg_rollentrennung]]) NICHT brechen.
- **Tokens-Pflicht:** Hauptseite strikt `claimondo-*` (→ `var(--brand-*)`), kein Inline-Hex (token-audit-Gate). Mocks nutzten Inline-Hex nur als Preview.
- **Schreib-Tool-Artefakt:** nach Write auf `</content>` am Dateiende scannen ([[feedback_write_tool_content_artifact]]).

---

## 3 · HOME-PREMIUM-REWORK (Hauptfokus, aktiver Build)

**Branch:** `kitta/marketing-home-premium-rework` (gepusht). **Spec:** `docs/superpowers/specs/2026-05-31-home-premium-rework-design.md` (§1–13, freigegeben). **Plan:** `docs/superpowers/plans/2026-05-31-home-premium-rework.md` (Phasen A–F, Checkbox-getrackt). Memory: [[project_home_premium_rework]].

### Design-Entscheidungen (gelockt, von Aaron freigegeben)
- **Architektur 21 → 12 Sektionen** (Decomposition „alle Seiten geil" → Home = Sub-Projekt 1; 6 Template-Familien).
- **Hero = C:** Hero-B „Unverschuldet im Unfall? Wir haben's im Griff" (Paar+App, Conversion-Hook) **+** „Ein Team hinter Ihrem Fall" als **prägnante Section #7**.
- **Art-Direction:** offen/luftig/aufregend, **große Full-Bleed-Bänder im nativen Ratio** (5×19:9 ultrawide + 3×16:9 — NICHT zwangs-croppen). kfzgutachter-LP-Bar.
- **App-Shield-Motiv** = roter Faden (echtes `claimondo-shield.svg`/App-UI auf die Telefon-Screens, kein KI-Shield).
- **Online-Prüfdienst-Ausschluss** (ControlExpert/K-Expert) = inhaltlicher roter Faden.
- **Login-Embed** (claimondo.de = einheitliche Tür, Supabase + shared `.claimondo.de`-Cookie).
- KI-Text: BG-Blur **selektiv** (`blur-bg.cjs`), echte Assets für Vordergrund-/Marken-Text.

### Gebaut + committet (auf dem Branch)
- **A1** ✅ — 8 große webp in `public/img/home/` (`hero-paar`, `team-band`, `sv-vor-ort`, `sv-andreas-app`, `werkstatt-app`, `kundin-app`, `berater`, `sofa`) via `scripts/optimize-home-assets.mjs`.
- **B1** ✅ — **12 Section-Komponenten** unter `components/landing/sections/`, `LandingPage.tsx` neu komponiert (Topbar→Hero→HomeTrustStrip→Ansprueeche→WieEsFunktioniert→Beweis→ProduktApp→Menschen→SvFinder→Schadensreport→Faq→BottomCta→Footer→Sticky). Content/Tokens/i18n-Keys 1:1, `tsc` grün. Commit `4426b1e43`. **Hinweis:** `HomeTrustStripSection` (≠ geteilte `TrustStripSection`-Primitive von 8 Seiten).

### OFFENE AUFGABEN (Reststrecke — so fortsetzen)
Frische Session → `superpowers:subagent-driven-development` gegen den Plan, ab **B2**. Pro Task: Subagent (Worktree `kitta/marketing-home-premium-rework`) → tsc+Screenshot-Verify → Commit → Review.

- [ ] **B2 · i18n-Keys reorganisieren** — `home.*`-Keys (+ gemergte `misstrauen`/`sieben_fehler`/Tesla) auf die 12-Section-Struktur, **6 Sprachen paritätisch**, Rollentrennung-Sweep leer.
- [ ] **C · Hero-Pilot** — cinematisch (`hero-paar.webp`, Scrim via Tokens, Lead-Form integriert, CTAs, App-Shield). Qualitäts-Muster. section-audit-Loop, Screenshot 390+1280.
- [ ] **D2–D12 · Sektionen 2–12 polieren** — je section-audit-Loop, Art-Direction (große native-Ratio-Bänder, offen). Reihenfolge: TrustStrip(+Reviews-Slot) · Ansprüche · WieEsFunktioniert(SV-Foto+Prüfdienst-Beat) · Beweis(+Prüfdienst-Kontrast) · ProduktApp(echte Portal-Screens+Shield) · **Menschen(„Ein Team hinter Ihrem Fall" prägnant, #7)** · SvFinder(→E2) · Schadensreport · FAQ · BottomCta · Footer/Sticky.
- [ ] **E1 · Google-Reviews** — `lib/reviews/google-places.ts` (Places API) + `GoogleReviews.tsx`, `aggregateRating` ins Schema. **Braucht: Places-API-Key** (Place „Claimondo – KFZ Sachverständiger in 3 Minuten", kgmid `/g/11nhgzgwdj`) ODER gepastete Rating+Anzahl+Stimmen. Nie erfunden (UWG).
- [ ] **E2 · SV-Finder embedded** — `gutachter-finden`-Mapbox-Karte als Client-Island in `SvFinderSection` (`NEXT_PUBLIC_MAPBOX_TOKEN` da).
- [ ] **E3 · Echte Portal-Screens** — Archiv `portal/dashboard.png`+`timeline-12-schritte.png` + **frischer Screenshot Kunde-Fallakte**. **Braucht: Portal-Test-Account/Fall** (read-only, Env-Var). Mobile-Portal = Lücke.
- [ ] **E4 · Login-Embed** — `LoginEmbed.tsx` (Supabase signIn → `roleToPath` → app.claimondo.de-Portal), in `LandingTopbar` als „Login"-Dropdown.
- [ ] **F1 · Dead-Code** — `HauptseitePremium.tsx` + abgelöste Komponenten entfernen (nach Reader-Sweep), `knip` grün. (Auch: stehengebliebener `HauptseitePremium`-Kommentar/Import in `LandingPage.tsx`.)
- [ ] **F2 · Gates** — `tsc` + `npm run build` + `token-audit` + `knip` grün; 6-Sprachen-JSON valide+paritätisch.
- [ ] **F3 · Full-Page-Screenshot-Smoke** 360/390 + 1280/1440, alle 12 Sektionen, an Aaron liefern.
- [ ] **F4 · PR** `--base kitta/marketing-copy-rollentrennung` (oder rebased), 7-Punkte-Audit; Deploy via `deploy-marketing-vps.py` nach Merge.

### Daten-Bedarf von Aaron (build-time, nicht-blockierend bis E)
1. **Google-Places-API-Key** (oder Rating+Anzahl+2–3 Stimmen).
2. **Portal-Test-Account/Fall** für E3-Screenshots + E4-Login-Test.

---

## 4 · Session-Abschluss-Check
- Working-Tree clean (alle Commits auf den jeweiligen Branches gepusht).
- Kein offener Stash.
- Memorys geschrieben: [[project_home_premium_rework]], [[project_marketing_rdg_rollentrennung]].
- Companion-Scratch unter `C:/pwtool/claimondo-brainstorm/` (außerhalb Repo, kein Git-Noise).
