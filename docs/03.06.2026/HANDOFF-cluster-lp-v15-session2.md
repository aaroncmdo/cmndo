# HANDOFF — Cluster-LP v15 · Phase 3 Mobile-Sync (Session 2, 03.06.2026)

> Anschluss-fähig ohne Kontextverlust. Quelle der Wahrheit für den aktuellen Stand:
> Memory `project_cluster_lp_v15`. Dieses Doc = der ausführliche Bauplan.

---

## 🌟 TL;DR

3 Standalone-Next-16-LP-Apps (`kfz-unfallgutachter-{wuppertal,duesseldorf,bonn}.de`) werden
auf den **Master-Mock** synchronisiert (Mock = Source of Truth). Phase 1/1.5/2 waren schon live.
**Diese Session live deployed:** Phase-3 **#1 Leistungen-Karussell**, **#3 Hero-v14b**, **#2 Reviews+Praxis-Split**,
+ **Asset-Pack** (116 Files), **Siegel-v3-Swap**, **Düsseldorf-Theme Gold→Royal-Blue**.
**Verbleibt:** Phase-3 **#4 Netzwerk-Mobile** (größte Variante), **#6 Über-uns-Founder-Card** (frisch entsperrt),
**#5 Ablauf-Timeline**, **#7 Einsatzgebiet-Map-Card**, **#8 FAQ-Feinschliff**.

---

## 📍 Wo die Arbeit liegt

- **Worktree:** `.claude/worktrees/cluster-lp-v15-page-fixes/` (isoliert — andere Sessions berühren nur Main-`src/`)
- **Branch:** `kitta/cluster-lp-v15-page-fixes` → **PR #2295** (base `staging`). PR = nur Review-Spur; Code geht per Skript **direkt live** (s.u.).
- **Apps:** `kfz-gutachter-{wuppertal,duesseldorf,bonn}/` im Worktree.
- **Alle Commits gepusht.** Working-Tree: nur untracked Deploy-/Smoke-Skripte + Specs (bewusst).

### Commits dieser Session (alle auf PR #2295)
| Commit | Inhalt |
|---|---|
| `0d178f4c5` | Phase 3 **#1** Leistungen-Mobile-Karussell (Card-by-Card Auto-Advance + Dots + Tap-Zonen) |
| `52285af56` | Phase 3 **#3** Hero-v14b-Sync (Mobile-Editorial+0€-Anker+Chevron / Desktop-heroTrustClusterDesktop) |
| `6777fb2bd` | Phase 3 **#2** Reviews-Inline-List (Option E) + Praxis-Split (`PraxisSection.tsx`) |
| `d621096a2` | Asset-Pack-Followup: **Siegel-v3-Swap** (Hero+Über-uns) + **DD-Theme Royal-Blue** |

---

## 🧱 Architektur (WICHTIG — sonst trampelst du dich)

- **Source of Truth = `MASTER_preview-complete_v3-praxis-v2.html`** (v15.5, 8732 Z.) im v15-Bundle
  `Downloads/HANDOFF_CLAUDE_CODE_v15_2026-06-02.zip`, extrahiert nach **`Downloads/_v15_bundle/HANDOFF_CLAUDE_CODE_BUNDLE_v15_2026-06-02/02_spec_code/`**.
  ⚠️ Der lose `Downloads/preview-complete.html` (220 K) ist **STALE** (ohne Mobile-Varianten) — NICHT nutzen.
  Alle 9 Mobile-Sektionen haben im Master `<div class="sm:hidden">…</div>` mit eigenem Mobile-DOM.
- **Komponenten byte-identisch über alle 3 Apps** → **1× in `kfz-gutachter-wuppertal` editieren, dann nach d/b kopieren** (`cp`), md5-Verify nach jedem cp.
- **Per-App verschieden (NICHT kopieren):** `lib/cluster.ts` (Daten) + `app/globals.css` (Cluster-`:root`-Vars). Der **Component-CSS-Block** in globals.css ist identisch über alle 3 (nur `:root` differiert) → per Edit in jede der 3 anhängen, danach `sed`-md5-Verify dass der Block byte-identisch ist.
- **Token-Mapping (Mock-CSS → LP-Schema):**
  - `var(--ink)`→`var(--color-ink)`, `var(--secondary)`→`var(--color-secondary)`, `var(--muted)`→`var(--color-muted)`, `var(--border)`→`var(--color-border)`, `var(--surface)`→`var(--color-surface)`, `var(--green)`→`var(--color-green)`
  - `var(--petrol)`/`var(--petrol-tint)`/`var(--amber)`/`var(--amber-700)` existieren 1:1 (`:root`)
  - `var(--font-display)` = Space Grotesk (NICHT Fraunces wie im Mock-Fallback)
  - `--amber-aa` = **neues Per-Cluster-A11y-Token** (von uns ergänzt): WT `#AB251A`, DD `#0F3D77` (Royal-Blue!), Bonn `#7A5E29`
  - Marken-Literale wie `rgba(211,46,32,…)` (= Wuppertal-Amber) → `color-mix(in srgb, var(--amber) …%, transparent)` für Cluster-Portabilität
- **Komponenten via Tailwind-Klassen** (`bg-amber`/`text-petrol`/`bg-surface`) — branden automatisch je Cluster-`:root`. Echte Umlaute in allen UI-Strings.
- **Karussells = Client-Inseln** (`'use client'`, `useRef`/`useEffect`), Vorbild `CasesCarousel.tsx`. Server-Sections hosten sie als `sm:hidden`-Insel.
- **Mock-Hero-CSS nutzt ein FREMDES Token-System** (`--space-*`/`--type-*`/`--shadow-cta-*` aus BRAND_TOKENS_DESKTOP, im LP nicht vorhanden) → **nicht wörtlich portieren**, sondern LP-nativ nachbauen (Konkretwerte auflösen, saubere `.hero-*`-Klassen statt brüchiger `section.bg-petrol .escaped\:class`-Overrides). Gilt sinngemäß für weitere große Sektionen.

---

## 🚀 Deploy = DIRECT-to-VPS (NICHT der staging/main-Flow!)

- VPS **212.132.119.110**, App-Dirs `/var/www/kfz-unfallgutachter-{c}-app`, pm2 `kfz-gutachter-{c}`.
- **`output: 'standalone'`** → pm2 startet `.next/standalone/server.js`. **Statische Assets werden aus `.next/standalone/public/` serviert** (nicht aus `public/`!). Code-Files werden aus dem Standalone-Build geladen.
- **Code-Deploy-Skripte:** `scripts/deploy-cluster-v15-*.py` (paramiko): SFTP-Upload geänderter Files → `npm run build` (Rollback-on-fail via `.bak`) → `pm2 reload` → curl-Verify. Vorlagen je Variante vorhanden:
  - `deploy-cluster-v15-mobile1.py` (#1), `…-hero.py` (#3), `…-reviews.py` (#2), `…-siegelv3-ddtheme.py` (Asset-Followup), `…-assets.py` (Asset-Pack).
  - **Neue Files** (z.B. `PraxisSection.tsx`) → `remote_exists()`-Check + `rm`-Rollback statt `mv .bak` (Muster in `…-mobile1.py`/`…-reviews.py`).
  - **`run()` MUSS Tuple zurückgeben** (`return out, err`) wenn der Body `out, err = run(...)` nutzt — sonst `ValueError: too many values to unpack` (Bug in dieser Session gehabt).
- **Asset-Deploy** (`deploy-cluster-v15-assets.py`): lädt ein Zip 1× hoch, entpackt es auf dem VPS und merged je Cluster in **BEIDE** Public-Orte (`public/` UND `.next/standalone/public/`) — sonst sind Assets nicht live ohne Rebuild. **VPS hat KEIN `unzip`** → `python3 -c "import zipfile; …extractall()"`.
- **`VPS_SSH_PASSWORD`** liest jedes Skript aus env. **Aaron stellt es bereit** (steht NICHT im Repo/Doc). Inline-Aufruf:
  ```powershell
  $env:VPS_SSH_PASSWORD='<von Aaron>'; python scripts\deploy-cluster-v15-XXX.py wuppertal; Remove-Item Env:\VPS_SSH_PASSWORD
  ```
  (Im Bash-Tool: `VPS_SSH_PASSWORD='<pw>' python scripts/...` als env-Prefix.)
- **Muster:** immer **wuppertal zuerst → live-verifizieren → dann `duesseldorf bonn`**. Jede Variante = eigener Commit + eigener Deploy (granulares Review/Rollback).

---

## ✅ DONE + LIVE (diese Session, alle 3 Cluster verifiziert)

| # | Variante | Smoke | Wie |
|---|---|---|---|
| **#1** | Leistungen-Mobile-Karussell | 10/10 ×3 | Client-Insel `LeistungenCarousel.tsx` (sm:hidden) + `.leistungen-*` CSS; Desktop-Grid → `hidden sm:grid`. Auto-Advance 5s, Tap-Zonen (links/rechts 30%), Dots, IO-Start, reduced-motion. |
| **#3** | Hero-v14b-Sync (Mobile **und** Desktop) | 18/18 ×3 | `HeroSection.tsx` neu (LP-nativ): Mobile Editorial-Header (★5,0+Tagline)/0€-Anker-Block/kompakte USPs/Trust-Stripe/Brand-Anker/Scroll-Chevron; Desktop `#heroTrustClusterDesktop` + Italic-h1-Sub + Telefonnummer-CTA + "10+ Jahre" alle VP. `.hero-*` CSS + Chevron-JS in `SiteScripts.tsx`. Hero-Foto/Gradient unangetastet. |
| **#2** | Reviews-Inline-List + Praxis-Split | 15/15 ×3 | `ReviewsSection.tsx` slim (`.rev-*` Inline-List, Option E) ersetzt 7-Karten-Scroller; **`PraxisSection.tsx` (NEU)** als eigene `#praxis`-Section ausgegliedert (CasesCarousel bleibt Dots-Variante = DIFF 2). |
| — | **Asset-Pack** (116 Files) | live-verifiziert | `deploy-cluster-v15-assets.py` → siegel-v3, avatar-tobias-{c}, hero-{c}-mobile, team-{c} in `public/`+`.next/standalone/public/`. |
| — | **Siegel-v3-Swap** | HTTP 200 ×3 | Alle `siegel-claimondo-partner.svg` → `-v3.svg` (Hero 3× + Über-uns). |
| — | **DD-Theme Royal-Blue** | visuell ×1 | `duesseldorf/app/globals.css` `:root`: `--amber #185FA5` / `-700 #114080` / `-aa #0F3D77`. |

**Abweichungen (dokumentiert, Aaron kann umentscheiden):**
- **#2 Reviews:** alle **7 echten** REVIEWS behalten (rev-quote nur für hasText=3), NICHT die 4 Mock-paraphrasierten Quotes (Kevin/David haben live keinen Text → UWG/Authentizität). Aaron kann auf kuratierte-4 umstellen (Gap-Audit §5.1).
- **Praxis-Cases:** Dots-Carousel (bewusste DIFF-2-Abweichung), nicht Mock-Arrows/440px-Einzelspalte.

---

## 🧪 Smoke-Pattern (Aaron-Pflicht: Screenshot im selben Turn auswerten)

- Python-Playwright (`from playwright.sync_api import sync_playwright`), **retry-goto** (Dev-Server kompiliert on-demand → bis zu 30× retry bei 500/timeout).
- Viewports: **390×844** + **360×800** (Mobile) + **1280×900** (Desktop-Gegenprobe). Hero zusätzlich 360 (SE).
- **Dev-Server:** `node_modules/.bin/next dev --port 3996` (bg) im jeweiligen App-Dir; läuft evtl. noch.
- **Live-Smoke** gegen die echten URLs (`https://kfz-unfallgutachter-{c}.de/`) — echte Assets, hydratisierter DOM.
- Bestehende Smoke-Skripte: `scripts/smoke-{leistungen-carousel,hero-v14b,reviews-inline}.py` (nehmen `BASE_URL` + `OUT_DIR` als Args → lokal *und* live nutzbar). Screenshots in `docs/03.06.2026/smoke-*/`.
- **cp1252-Mangling:** ä/ö/ü/€/· erscheinen als `�`/`0��` im PowerShell-Output — **benign**; per `assert` auf den geparsten Wert prüfen, nicht aufs Terminal-Echo. `grep` matcht solche Outputs als "binary" → `grep -a`.

---

## ▶️ NEXT — verbleibende Phase-3-Varianten (Reihenfolge "der Reihe nach")

> Generelles Vorgehen je Variante: (1) Master-Mock lesen (HTML-Block + CSS-Block), (2) Component lesen,
> (3) `sm:hidden`-Mobile-Block bauen + Desktop in `hidden sm:…` wrappen, (4) CSS token-mappen + an globals.css ×3 anhängen,
> (5) cp Component → d/b + md5-Verify, (6) tsc (wuppertal — DD/Bonn haben lokal kein node_modules), (7) `</content>`-Artefakt-Check + CSS-Kommentar-Balance, (8) Smoke @390/@360/@1280 + Screenshot, (9) Commit (7-Punkte-Audit) + push, (10) Deploy wuppertal→verify→d/b.

### #4 · Netzwerk-Mobile — **GRÖSSTE Variante** (READY, nicht asset-geblockt)
- **Mock HTML:** `#netzwerkMobile` ab **Z.4688** (`<section id="netzwerk">` 4684); Mobile-Compare-Panel `#netzwerkCompareMobilePanel` ab **Z.4749**.
- **Mock CSS:** `netzwerk-team-*` **3078–3160**, `netzwerk-pain-*` **3245–3305**, `cmp-mobile-*` **3538–3658**, `netzwerk-compare-link/chev` (in der Nähe greppen).
- **Bausteine:** Team-Hero-Card (`.netzwerk-team-card`/`-photo` mit Team-Foto-BG + Eyebrow-Overlay "Ihr Team vor Ort" + City-Pill + Credentials-Footer) → Pain-Story-Header + H2 "Was wirklich passiert nach Ihrem Unfall — und was hilft." → **4 Pain-Cards** (`.netzwerk-pain-card` 01–04, je Titel/Sub/autounfall.io-Link, **IntersectionObserver-Staggered-Reveal** `.is-visible` + transition-delays 0/100/200/300ms) → Compare-Toggle-Button (`#netzwerkMobileCompareToggle`) → **8-Karten Mobile-Compare-Panel** (`.cmp-mobile-card` mit Topic-Badges GELD/SCHUTZ/SERVICE/PORTAL/MOBILITÄT + Ohne-uns/Mit-uns-Tiles + autounfall-Links) → CTA-v8.
- **Config nötig:** `teamImg` in `ClusterConfig` (cluster.ts) + 3 Werte `'/assets/img/{c}/team-{c}.webp'` — `team-{c}.webp` liegt auf VPS ✓.
- **Daten:** Pain-Cards + die 8 Compare-Cards am besten als `const`-Arrays (z.B. in `content.ts`, cluster-agnostisch) — die 8 Topic-Badges stehen NICHT in der bestehenden `COMPARISON` (eigenes Mapping). Bulk dieser Variante.
- **JS → SiteScripts.tsx:** (a) Reveal-Observer auf `#netzwerkPainList`, (b) Toggle `#netzwerkMobileCompareToggle` ↔ `#netzwerkCompareMobilePanel` (`.is-open` + `aria-expanded`).
- **Ziel-Files:** `NetzwerkSection.tsx` (Mobile-Block + Desktop `hidden sm:`), `SiteScripts.tsx`, `globals.css` ×3, `cluster.ts` ×3 (teamImg). Desktop-Grid + `NetzwerkCompare` bleiben.
- **Empfehlung:** eigener fokussierter Run (Umfang > Hero).

### #6 · Über-uns-Founder-Card (ENTSPERRT seit Asset-Pack)
- **Mock HTML:** `#ueberUnsMobile` ab **Z.5415** (`uu-quote-card`: Quote-Body italic + Signatur-Zeile mit `avatar-tobias-{c}.png` + Name + "· DAT-Sachverständiger" + "Zertifizierter Claimondo-Partner" + `uu-quote-siegel` = **siegel-v3**) + Trust-Pill-Row (DAT/BVSK/10+J/90+ Netz).
- **Mock CSS:** `uu-quote-*` ab **Z.3685**.
- **Assets:** `avatar-tobias-{c}.png` ✓ (deployed), siegel-v3 ✓.
- ⚠️ **FLAG — Founder-Name fehlt:** Der Mock zeigt Platzhalter `id="uuAvatarTobiasName">Amet`. `cluster.ts` hat **kein** Namens-Feld. Vor dem Bau: entweder pro Cluster echten SV-Namen von Aaron/Nicolas holen + Feld `svName` in `ClusterConfig`, ODER generisches "Ihr Sachverständiger vor Ort" (ohne Eigenname). **Aaron fragen.**
- **Ziel-Files:** `UeberUnsSection.tsx` (Mobile-Block + Desktop `hidden sm:`), `globals.css` ×3, ggf. `cluster.ts` ×3 (svName).

### #5 · Ablauf-Tag-Timeline (asset-frei)
- **Mock HTML:** `#ablaufMobile` **Z.4450–4515** ("In ~32 Tagen zum Geld", TAG-0…TAG-32-Timeline mit IntersectionObserver-Reveal, CTA "☎ Jetzt Tag 0 starten" Z.4515).
- **Mock CSS:** `ablauf-mobile-*` **2875–3073**.
- **JS → SiteScripts:** Timeline-Reveal-Observer (+ `ablauf-mobile-cta-wrap.is-wave`-Effekt).
- **Ziel-Files:** `AblaufSection.tsx`, `globals.css` ×3, `SiteScripts.tsx`. Impact H.

### #7 · Einsatzgebiet-Map-Card (asset-frei)
- **Mock HTML:** `#einsatzMobile` (greppen: `id="einsatzMobile"`); CSS `einsatz-mobile-*` **2391–2645** (eigene H2 `.einsatz-mobile-h2` + Region-Italic, Lead, Map-Card mit 3 Mini-Stats [12 Städte/60 Min/24/7], Städte-Pills, Mobile-CTA `.einsatz-mobile-cta` "Vor-Ort-Termin anfragen").
- Nutzt die bestehende Leaflet-Map (`MapSection`/`EinsatzgebietSection`).
- **Ziel-Files:** `EinsatzgebietSection.tsx` (+ ggf. `MapSection.tsx`), `globals.css` ×3. Impact M.

### #8 · FAQ-Mobile-Feinschliff (asset-frei, kleinste)
- FAQ ist größtenteils schon responsive (Reconciliation in `1f0a3d578`/`34e0da4bc`). Nur Mobile-Sizing-Stufen (py-9 sm:, H2-clamp, Bullet-/Workshop-`@media 640px`) gegen den Master nachziehen.
- **Ziel-Files:** `FaqAccordion.tsx`, `globals.css`. Impact L.

---

## ⚠️ Gotchas / Lessons (spar dir die Fallen)

1. **SoT-Mock = MASTER_v3-praxis-v2** (im Bundle), NICHT der lose `preview-complete.html` (stale). README Z.23 des Bundles bestätigt.
2. **CSS-Kommentar-`*/`-Falle:** Token-Glob-Namen wie `--space-*/--type-*` enthalten die Sequenz `*/` → **schließt den CSS-Kommentar vorzeitig** → `CssSyntaxError: Unknown word`. Keine `*` (oder `*/`) in CSS-Kommentaren. (Diese Session live gehabt, vom Dev-Smoke gefangen.) Verify: `grep -o '/\*'` count == `grep -o '\*/'` count.
3. **Hero-Mock-CSS = fremdes Token-System** → LP-nativ nachbauen, nicht wörtlich kopieren (s. Architektur).
4. **output:standalone:** Assets in `public/` **und** `.next/standalone/public/` legen (pm2 serviert die Standalone-Kopie). Sonst nicht live ohne Rebuild.
5. **VPS hat kein `unzip`** → `python3`/`zipfile`.
6. **Deploy-`run()` muss Tuple liefern** wenn `out, err = run(...)`.
7. **DD-App hat lokal kein `node_modules`** → tsc auf wuppertal fahren (Komponenten sind byte-identisch).
8. **`</content>`-Artefakt:** Das Write-Tool hängt zeitweise literales `</content>` ans Dateiende → nach jedem Write greppen.
9. **cp1252-Terminal-Mangling** (s. Smoke-Pattern).
10. **Edit-Read-State** kann nach Session-Reminder-Injektion ablaufen → Datei frisch lesen vor Edit; bei Memory-Edits exakten String aus frischem Read kopieren.
11. **commit -F** (heredoc/Temp-File) für Multiline-Messages; im Bash-Tool `git commit -F - <<'EOF' … EOF`.

---

## 🚩 Offene Flags / Aaron-Decisions

- **Reviews 7-echt vs 4-kuratiert:** aktuell 7 echte (Authentizität). Aaron kann auf Mock-kuratierte-4 umstellen.
- **#6 Founder-Name:** echter SV-Name pro Cluster ODER generisch? (s. #6 oben) — **vor #6-Bau klären.**
- **quellenAnker** "Quelle: Polizei-Jahresverkehrsbericht 2025" (Einsatzgebiet/FAQ) ist live = Faktenbehauptung auf legal-naher Seite → Provenienz der Brennpunkt-Statistik bestätigen, sonst neutral umformulieren.
- **Monika-Widget** (`MonikaEmbedSlot`/`FabStack`): bleibt **HELD** — separate Session, NICHT mitdeployen.
- **autounfall.io-Bild-Mapping:** eigene Spec, Aaron entscheidet Timing.
- **Footer-Betreiber:** KEIN Diff ("Kitta & Sprafke UG" bestätigt) → erledigt.
- **Mobile-Tel-CTA <640 versteckt:** Mock-Pattern (Burger trägt den Anruf) — beibehalten, außer Aaron will Header-Anruf-Button auf Handys.

---

## 📚 Referenzen

- **Master-Mock (SoT):** `Downloads/_v15_bundle/HANDOFF_CLAUDE_CODE_BUNDLE_v15_2026-06-02/02_spec_code/MASTER_preview-complete_v3-praxis-v2.html`
- **Gap-Audit** (alle 14 Sektionen + Phasen-Plan): `docs/03.06.2026/cluster-lp-mock-vs-live-gap-audit.md`
- **Phase-3-Scoping (Vor-Session):** `docs/03.06.2026/PHASE-3-mobile-handoff.md` (Mock-Refs darin zeigen z.T. auf den stale Mock — Master nutzen)
- **Asset-Pack:** `Downloads/MISSING_ASSETS_PACK_v2_2026-06-02.zip` (116 Files; bereits auf VPS deployed)
- **Memory:** `project_cluster_lp_v15` (`.claude/projects/.../memory/`) — aktueller Stand + Flags
- **Deploy/Smoke-Skripte:** `scripts/deploy-cluster-v15-*.py`, `scripts/smoke-*.py` (untracked)
