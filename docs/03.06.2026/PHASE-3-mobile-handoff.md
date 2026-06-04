# Phase 3 — Mobile-UX-Reconciliation · Handoff/Scoping-Spec

**Status:** Phase 1 + 1.5 + 2 sind komplett + live (PR #2295, 4 Commits: `7876c08f5` Burger, `60ba949e2` Alt+areaTags, `1f0a3d578` FAQ-Reco, `34e0da4bc` FAQ-Bold). Phase 3 ist der verbleibende große Block.
**Empfehlung:** Eigener Sprint / frische Session — 9 Mobile-Varianten, ~3–5 Tage, eigenes `sm:hidden`-Markup je Sektion.

---

## 0 · Setup (das muss die ausführende Session wissen)

- **3 Standalone-Next-16-Apps:** `kfz-gutachter-{wuppertal,duesseldorf,bonn}` im Worktree `.claude/worktrees/cluster-lp-v15-page-fixes`. Branch `kitta/cluster-lp-v15-page-fixes`, PR #2295.
- **Components byte-identisch** über alle 3 → **1× in wuppertal editieren + nach d/b kopieren**. Nur `lib/cluster.ts` (Daten) + `app/globals.css` (Cluster-Theme) je App verschieden → dort je App editieren.
- **Mock = Source-of-Truth:** `C:\Users\Aaron Sprafke\Downloads\preview-complete.html` (215 KB). HTML-Sektionen Z.270–993, CSS/JS ab ~Z.2000.
- **Deploy = DIRECT-to-VPS** (kein staging-Flow): `scripts/deploy-cluster-v15-*.py` als Vorlage (paramiko, `VPS_SSH_PASSWORD` aus env, .bak + Build-Rollback-on-Fail + `pm2 reload`). Neues Script mit angepasster `FILES`-Liste je Batch.
- **Tailwind-v4-Tokens:** `--color-ink/-border/-muted/-surface/-secondary` (@theme) + `--amber`/`--petrol`/`--petrol-tint`/`--green` (:root). Für rohe CSS-Vars NICHT `var(--ink)`, sondern `var(--color-ink)` (siehe FAQ-CSS-Anpassung in `34e0da4bc`).
- **Smoke-Pflicht (Aaron):** Playwright @ Viewport 390×844 + Screenshot im selben Turn auswerten. Pattern: `scripts/with_server.py` ODER Dev-Server bg + Retry-goto (siehe smoke_burger.py-Muster).

## 0.1 · Audit-Befund (Ist-Stand)

Mobile-Marker (`sm:hidden`/`hidden sm:`): **Components 13** (HeroSection 8, Header/Burger 1, FabStack 2, NetzwerkCompare 2) vs **Mock 41**. → Außer Hero (hat Desktop+Mobile-Trust-Block) sind die Sektionen weitgehend **Desktop-Layout / nur responsive Grid**, NICHT die kuratierten Mobile-Varianten des Mocks.

---

## 1 · Die 9 Varianten (nach Impact sortiert)

| # | Variante | Ziel-Component | Mock-Ref (preview-complete.html) | Ist-Stand | Impact |
|---|---|---|---|---|---|
| 1 | **Leistungen-Karussell** (6 Besichtigungs-Karten als Swipe statt 1-Spalten-Stack) | `LeistungenSection.tsx` (+globals.css) | Section Z.869–894; Karussell-CSS ~Z.3027/3077 | Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (Stack auf Mobile) | **H** — 6 Karten gestapelt = sehr lang auf Mobile |
| 2 | **Reviews-Inline-List / Karussell** | `ReviewsSection.tsx` (+globals.css) | Section Z.388–469; „Karussell" Z.451 | keine Mobile-Variante | **H** — Social-Proof above-fold |
| 3 | **Hero-0€-Anker-Block** (Mobile-spezifischer 0€-Block) | `HeroSection.tsx` | Hero MOBILE-Block Z.352–385 | Mobile-Trust-Block existiert (8 Marker) — **0€-Anker-Detail prüfen** | **H** — Hero = wichtigster Fold |
| 4 | **Netzwerk-Team-Hero + 4 Pain-Cards** (Mobile) | `NetzwerkSection.tsx` | Mock: grep `Das Claimondo-Netzwerk` / `netzwerkCard` | NetzwerkCompare hat Toggle-Marker (2), Team-Hero/Pain-Cards-Mobile fehlt | **M** |
| 5 | **Ablauf-Tag-Timeline** (Mobile) | `AblaufSection.tsx` (+globals.css) | Section Z.470–868 (groß) | keine Mobile-Variante | **M** |
| 6 | **Über-uns-Founder-Card** (Mobile) | `UeberUnsSection.tsx` | Section Z.895–921; Founder-CSS Z.2448/2455 | keine Mobile-Variante | **M** |
| 7 | **Einsatzgebiet-Map-Card** (Mobile) | `EinsatzgebietSection.tsx` / `MapSection.tsx` | Section Z.922–970 | Map + Brennpunkte + areaTags-Pills da; Mobile-Map-Card-Layout prüfen | **M** |
| 8 | **FAQ-Mobile-Sizing** | `FaqAccordion.tsx` (+globals.css) | Section Z.971–992 | FAQ neu gebaut (`1f0a3d578`); CSS hat `@media 640px` für Bullets/Workshop | **L** — größtenteils schon responsive, nur Feinschliff |
| 9 | **Header-Burger-Nav** | `Header.tsx` + `SiteScripts.tsx` | — | ✅ **FERTIG** (`7876c08f5`) | — (erledigt) |

> Ist-Stand-Spalte ist Audit-Schätzung — beim Implementieren je Sektion gegen den Mock verifizieren (Component lesen + Mock-Zeilen lesen).

---

## 2 · Vorgehen je Variante (Muster)

1. **Mock lesen:** die Sektion (Zeilen oben) + die `MOBILE`/`DESKTOP`-Kommentar-Blöcke (der Mock annotiert Varianten, z.B. Hero `<!-- Trust-Block: MOBILE-Variante -->`).
2. **Component lesen:** aktuelle Sektion. Desktop-Markup wird `hidden sm:...`, Mobile-Markup `... sm:hidden` (analog Hero-Trust-Block in `HeroSection.tsx` Z.90–139 — bestes Vorbild im Repo).
3. **Token-Treue:** Farben via `bg-amber`/`text-petrol`/`bg-surface` etc.; rohe CSS-Vars als `var(--color-*)`/`var(--amber)`. Echte Umlaute.
4. **CSS:** sektionsspezifische Mobile-Styles (Karussell-Scroll-Snap etc.) an `app/globals.css` anhängen (×3, via Add-Content; Var-Namen mappen!).
5. **cp** nach d/b (Component identisch). cluster.ts/globals.css je App.
6. **tsc** (wuppertal) grün + `</content>`-Artefakt-Check.
7. **Smoke @ 390px** + Screenshot auswerten (Karussell scrollt? Cards lesbar? kein Overflow?).
8. **Deploy** (neues `deploy-cluster-v15-mobileN.py` mit der FILES-Liste) wuppertal→verify→d/b.
9. **Commit** mit 7-Punkte-Audit + push PR #2295.

**Reihenfolge-Empfehlung:** #1 Leistungen-Karussell → #2 Reviews → #3 Hero-0€ → dann #4–#7 → #8 FAQ-Feinschliff zuletzt. (Jede Variante = eigener Commit + Deploy, damit Review/Rollback granular bleibt.)

---

## 3 · Offene Flags (parallel, brauchen Aaron — NICHT Teil von Phase 3)

- **quellenAnker-Faktencheck:** „Quelle: Polizei-…-Bericht 2025" ist live = Faktenbehauptung. Provenienz der Brennpunkte bestätigen lassen (sonst neutral umformulieren).
- **Mobile-Tel-CTA <640 versteckt:** Mock-Pattern (Burger trägt den Anruf). Falls Header-Anruf-Button auf Handys gewünscht → zurückholen.
- **Monika-Widget** (`data-logo`, MonikaEmbedSlot/FabStack): bleibt **held** — separate Session.
- **autounfall.io-Bild-Mapping:** eigene Spec, Aaron entscheidet Timing.
- **Footer-Betreiber:** KEIN Diff (Nicolas bestätigt „Kitta & Sprafke UG" in Mock+Live) → erledigt, nichts tun.

---

## 4 · Phase 4 (Struktur-Entscheide, Aaron)

Reviews-Struktur (Inline vs 7-Karten-Scroller), per-City-SEO-Text (Doorway-Schutz behalten?). Siehe Gap-Audit §5 (`docs/03.06.2026/cluster-lp-mock-vs-live-gap-audit.md`).
