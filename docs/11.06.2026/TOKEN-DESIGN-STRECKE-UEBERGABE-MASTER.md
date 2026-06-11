# Token-/Design-Konsistenz-Strecke — MASTER-ÜBERGABE

**Stand:** 2026-06-11 09:42 · **Owner-Session:** 58e88691 · **Worktree:** `.claude/worktrees/flowlink-polish` (Branch `kitta/kunde-status-tokens`)
**Ziel der Strecke:** App-weit konsistente, whitelabel-fähige Status-/Marken-Farben auf den #2618-Token-Utilities. Frontend-only, iOS-Glass-Charakter erhalten, Wizard-Dualität NICHT anfassen, Marketing/Cluster-LPs NICHT anfassen (eigene Top-Level-Builds).

---

## 0 · TL;DR — Sofort-Aktion

1. **#2654 (kunde Schritt 1) ist offen + release-ready** (build+audit grün, mergt sauber in staging 424154189) → an Release-Session zum Mergen.
2. **Nächster Arbeitsschritt:** kunde Schritt 2 (siehe §3 + `WELLE-1C-KUNDE-STATUS-TRIAGE.md`). Eigenen Worktree nutzen (4 Sessions kollidieren gerade auf aar-939-monika-embed).
3. **Goldene Regeln** (§5) sind nicht verhandelbar — daran hängt die Qualität. Besonders: Token NICHT erfinden, Substring-Falle, frisch greppen.

---

## 1 · PR-Status (die ganze Strecke)

| PR | Inhalt | Stand |
|----|--------|-------|
| **#2618** | Token-Foundation (semantische + Typo-Tokens, Radius-Konsolidierung, **Status-Ratchet**, AGENTS.md) | ✅ **MERGED** (main) |
| **#2623** | FlowLink-Polish (Whitelabel-Leaks, ondo-Button, SA-Modal-a11y, Kontrast-AA, Signatur) | ✅ **MERGED** (main) |
| **#2635** | Whitelabel-rgba-Leaks Welle P0 + **4. CI-Ratchet** (Brand-rgba-Gradient) | ✅ **MERGED** |
| **#2640** | Welle 1 Shared-Layer-Status (statusLabels.ts Königin + 22 Components). Baseline 3115→3007 | ✅ **MERGED** |
| **#2647** | Welle 1b gutachter-Status (9 Core-Files, −140) | ✅ **MERGED** |
| **#2654** | Welle 1c/Schritt 1 kunde-Status (6 rein-Status-Komponenten) | 🟢 **OFFEN** — mergt sauber, build+audit grün |

staging-Tip: `424154189` · main-Tip: `91e4e2c09` · Status-Baseline auf staging: **3007**.

---

## 2 · #2654 — der einzige offene PR

- **Branch:** `kitta/kunde-status-tokens` @ `51d7e7304` (gepusht)
- **6 migrierte Files:** AuszahlungCard, BankdatenBanner, BeratungBuchenSheet, DsgvoLoeschCard, KundeTerminCheckBanner, OrphanMatchBannerClient (= 36 Vorkommen, 0 Reststände)
- **Gates:** `npm run build` grün, `check:token-audit` grün (Status 2806, alle 4 Ratchets)
- **Mergeability:** merge-tree exit=0 gegen aktuelles staging → **kein Rebase nötig**, unabhängig mergebar
- **Empfehlung:** an Release-Session (35660476) zum Merge — kein check-token-audit-Touch, kein Konflikt-Risiko.

---

## 3 · RESTSTRECKE (priorisiert — alle offenen Punkte)

### A) kunde fertigstellen — Schritt 2-4 (~41 Files Rest nach #2654, ~130 Migrationen)
Branch `kitta/kunde-status-tokens` weiterführen ODER neuer Sibling auf staging. **Triage komplett in `docs/11.06.2026/WELLE-1C-KUNDE-STATUS-TRIAGE.md`** (4-Agenten, file:line, migrate/leave).
- **Schritt 2 — Komponenten mit `-500` (gezielte volle Strings!):** ClaimStepper(6), KundeAktivStatusHero(2), TerminLiveStatus(5), OffeneDatenBanner(6), PflichtdokumenteBanner(7), KundeSvLiveBanner(4 — `text-amber-50`/`text-emerald-100`→`-soft`), KundeAusfallEntschaedigungCard(6 — **accent-enum** `'rose'`/`'amber'`→`'danger'`/`'warning'`), KundeJetztZuTunCard(3 — severity-Map), KundeTerminVerschiebenModal(9), TerminVerlegungBanner(9).
- **Schritt 3 — Hotspot-Color-Maps (Sorgfalt!):** TerminSectionCard(11 — STATUS-config-Map + L364 delete-hover=LEAVE), KundeTermineClient(STATUS_BADGE + DOT_CLS Maps), KundeTerminDetailClient(17 — STATUS_LABEL.cls Map + inline), FallKarte(24 — **gemischt:** live/critical=MIGRATE, Phase-Dots `claimondo-navy`=schon Token).
- **Schritt 4 — app-routes:** `termin/[token]/`{KundeAnfahrtCard(7), BesichtigungsortCheck(6), KundeTrackingClient(8), LiveAnsichtOverlay(2), page.tsx(1)}, `faelle/[id]/`{page(8 Banner), FallDetailSections(4), kalender/KalenderClient(3)}, `onboarding/`{OnboardingWizard(**16!**), page(1 rose)}, nachbesichtigung/×3, re-termin, kunde-termin/×2, `_components/`{GutachterCard, KundenbetreuerCard — beide nur unread-badge `bg-red-500`→`bg-danger`}.
- **kunde LEAVE (bestätigt, NICHT migrieren):** GoogleReviewPrompt (Rating-Sterne KOMPLETT), Kennzeichenhalter (physisches SVG, hat Skip-Header), KundeKbChat (Kanal-Hex #059669/#4573A2), EskalierterAdminCard L22 (Kanal-Amber), ClaimSummary L466 (neg-Betrag-Vorzeichen = Data-Viz), KundeBetreuerStrip L55 + SaeuleMeinGeld L60 (Trust/Finanz-Icon), delete-hovers, SmokeKanzleiButton (DEV-Tool, L109 custom-orange).

### B) admin-Portal (67 Files, intern — kein whitelabel-Druck)
Worst: `abrechnungen/AbrechnungenListClient` (statusBadge-Fn), `datenschutz/loeschauftraege` (STATUS_META-Map), `aircall-relay-seats`. **NICHT migrieren (Data-Viz):** `StatistikenClient`-Chart-Palette (Token-Audit-Skip-Header), `PerformanceClient` `text-amber-400`. Triage-Fan-out wie kunde/gutachter empfohlen.

### C) dispatch-Portal (33 Files) — ⛔ KOORDINIEREN / blockiert-prüfen
Die cmm49-Session (fb34de27) machte den sv_id-Sweep in flow/dispatch — **vor Start prüfen ob ihr Sweep durch ist** (sonst Kollision). Worst: `DokumenteAnfordernCard`, `LeadsViewToggle`, `dashboard/page` (Konstanten-Maps `leadPhaseConstants`/`gutachter-finder/constants`).

### D) Welle 2 (nach allen Portal-Status)
`text-[Npx]`-Magic-Numbers → Typo-Tokens (`text-caption`/`text-body-*`); Restradien (`rounded-{2xl,3xl}` → `rounded-ios-*`, inkl. `primitives/Modal.web` `rounded-2xl`); Component-Set Boy-Scout (dispatch ~0% `primitives.Button`-Adoption).

### E) Welle 3 (a11y)
`aria-label` auf Icon-Buttons (gutachter 303/308 Icons!), `role="alert"` auf auth-Error-Boxen, Focus-Traps auf handgerollte Modals (dispatch SpontanTerminModal).

### F) Kleine Follow-ups
- **`FallMitteilungenBanner` PRIO_TONE:** Hex (nicht rgba) + `${tone.color}40`-Konkatenation ist var-inkompatibel → struktureller `danger/warning/info`-Refactor (in Welle 1 bewusst deferred).
- **Status-Baseline final senken:** steht bei 3007, tatsächlicher Count ist viel niedriger (gutachter+kunde −280+). Wenn keine parallelen Status-PRs mehr offen → `STATUS_BASELINE_OCCURRENCES` auf den vom Script gemeldeten Wert senken (Boy-Scout, lockt den Gewinn ein). NICHT solange parallele PRs sie ändern (Merge-Konflikt auf der Konstante).
- **kunde/termin/[token]/page.tsx L70:** `shadow-[…rgba(52,199,89,.30)]` emerald-Shadow — der Brand-rgba-Ratchet erfasst NUR Gradient-Fills, nicht Shadows → kein CI-Block; optional zu `var(--brand-success)` oder lassen (Schatten branden bewusst nicht).

---

## 4 · Token-System — Mapping-Rezept

Utilities in `globals.css` (@theme) + `design-tokens.ts`, branden via `var(--brand-*)`:

```
green/emerald → success    red/rose → danger    amber/orange/yellow → warning    (ondo-blau → info)
──────────────────────────────────────────────────────────────────────────────────────────────────
bg-X-50 / -100        → bg-X-soft          text-X-700/800/900 → text-X-strong
bg-X-500 / -600       → bg-X               text-X-500/600     → text-X
border-X-200/300      → border-X/30        hover:bg-X-100     → hover:bg-X/15
Button bg-X-600 hover:bg-X-700 → bg-X hover:bg-X-strong
-100/-300/-400-Zwischentöne → Opacity-Variante (bg-X/15, border-X/40, bg-X/20)
```
- **Token-Werte ~identisch** zu den Scales (`success-soft #ecfdf5`==`emerald-50`, `success-strong #047857`==`emerald-700`) → für Claimondo visuell quasi unverändert, brandet für SVs.
- **danger ist rose-basiert** (#2618) → subtiler red→rose-Shift ist gewollt.

---

## 5 · METHODIK-REGELN (die hart-erkämpften Lessons — NICHT brechen)

1. **Kuratiert, KEIN Blind-Sweep.** Pro Vorkommen: echtes Status (→Token) oder semantisch anders (→LEAVE). LEAVE-Kategorien: Rating-Sterne, Data-Viz/Trend, Kanal-Identität (WhatsApp-Grün), Wetter, Map-Marker, Navi-Ampel, Netzwerk-State, Zeit-Marker, Trophy, Schaden-**Typ**-Identität, physische SVGs, **delete/entfernen-Action-Hovers**, neg-Betrag-Vorzeichen, Trust-Verify-Badges.
2. **Triage-Agenten ERFINDEN Tokens.** Sie schlugen `bg-warning-dark`, `border-success-30` (Bindestrich!), `bg-success/5` vor — **die existieren NICHT**. Immer das etablierte Pattern aus §4 nutzen (`-soft`, `/30` mit Slash, `-strong` für Hover-Dunkel). Agenten sind für KLASSIFIKATION gut, nicht für exakte Token-Namen.
3. **Jeden File FRISCH greppen** — NIE Agent-/Triage-Zeilennummern vertrauen. Sie driften (gutachter/TerminCard war auf staging 155 statt 282 Zeilen = aar-939-Stand).
4. **Substring-Falle:** `bg-amber-50` ist Substring von `bg-amber-500`. Wenn ein File `-500` UND `-50` hat → **gezielte volle Klassen-Strings**, kein atomares `replace_all` auf `bg-X-50`. Vorab: `git grep -lE '\-(amber|emerald|red…)-500\b' -- <file>`.
5. **hover/button-Nuancen gezielt:** `hover:bg-X-100` → `hover:bg-X/15` (nicht `-soft`, sonst kein sichtbarer Hover). Bei atomarem `bg-X-100`→`bg-X-soft` zuerst die `hover:`-Variante gezielt rausziehen.
6. **Baseline NICHT senken solange ein Sibling-PR sie auch ändert** (Merge-Konflikt auf der Konstante). Ratchet ist ein Floor: `delta<0` ist grün, Script meldet senkbaren Wert.
7. **Portal-Branches auf `origin/staging` basieren, NICHT stacken** → unabhängig mergebar.
8. **Squash bricht Stacks:** nach Squash-Merge der Basis haben gestackte PRs neue SHAs → „CONFLICTING". Fix = `git rebase --onto origin/staging <alter-basis-tip> <branch>`, force-push (NICHT neu bauen).
9. **Verify-Pflicht pro Batch:** nach Edits `git grep`-Reststand-Check (nur intendierte LEAVEs dürfen bleiben) + `check:token-audit` + bei Routen voller `next build` (`NODE_OPTIONS=--max-old-space-size=8192`). `.env.local` nur für Build kopieren, danach `rm`. `git add -u` (NICHT `-A`).

---

## 6 · Koordination & Setup (für die Folge-Session)

- **Eigenen Worktree:** `node scripts/new-session-worktree.mjs <slug> staging` (4 Sessions kollidieren gerade auf aar-939-monika-embed). ODER den bestehenden `kitta/kunde-status-tokens`-Branch im `flowlink-polish`-Worktree weiterführen (working-tree clean, alles gepusht).
- **Release läuft über Session 35660476** — niemals selbst auf main/staging mergen, nur PR gegen `staging` + an Release-Session melden mit „MERGEABLE + build grün + token-audit-Guardrail OK". Baseline-Senkungen sind VERSCHÄRFUNG, keine Aufweichung (falls deren Guardrail-Check blind anschlägt).
- **dispatch erst nach cmm49-Sweep** (Kollision).

## 7 · Quellen-Docs (im Repo)
- `docs/10.06.2026/TOKEN-DESIGN-AUDIT-ALLE-PORTALE.md` — Gesamt-Audit (6-Agenten, Health-Matrix, 5 systemische Muster)
- `docs/11.06.2026/TOKEN-DESIGN-STRECKE-HANDOFF.md` — erstes Strecken-Handoff
- `docs/11.06.2026/WELLE-1B-GUTACHTER-STATUS-TRIAGE.md` — gutachter-Triage
- `docs/11.06.2026/WELLE-1C-KUNDE-STATUS-TRIAGE.md` — kunde-Triage (file:line, migrate/leave)
- **Diese Datei** — Master-Übergabe (Stand 11.06. 09:42)
