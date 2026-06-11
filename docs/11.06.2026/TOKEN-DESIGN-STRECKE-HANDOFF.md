# Token-/Design-Konsistenz-Strecke — Handoff

**Stand:** 2026-06-11 · **Owner-Session:** 58e88691 · **Worktree:** `.claude/worktrees/flowlink-polish`
**Ziel:** App-weit konsistente, whitelabel-fähige Status-/Marken-Farben auf den #2618-Token-Utilities. Frontend-only, iOS-Glass-Charakter erhalten, Wizard-Dualität nicht anfassen.

---

## 1 · PR-Status (die ganze Strecke auf einen Blick)

| PR | Inhalt | Stand |
|----|--------|-------|
| **#2618** | Token-Foundation: `bg-success/-soft/text-success-strong` (+warning/danger/info), Typo-Tokens, Radius-Konsolidierung, **Status-Ratchet**, AGENTS.md | ✅ **LIVE auf main** (b5d019c6c) |
| **#2623** | FlowLink-Polish: Whitelabel-Leaks im Flow, ondo-Primärbutton, SA-Modal-a11y/Focus-Trap, Kontrast-AA, Signatur-Whitelabel | ✅ **LIVE auf main** |
| **#2635** | Whitelabel-rgba-Leaks (Welle P0): kunde/BeratungModal Gradient/Backdrop → `color-mix(var(--brand-*))` + **4. CI-Ratchet** „Brand-rgba-Gradient" | 🟢 rebased auf staging, **merge-tree clean**, build+audit grün → in 58e88691-Release-Wave |
| **#2640** | Welle 1 Shared-Layer-Status: `statusLabels.ts` (Königin) + 22 shared-Components → Tokens. Baseline 3115→3007 | 🟢 rebased auf staging, **merge-tree clean**, build+audit grün → in Release-Wave |
| **#2647** | Welle 1b gutachter-Status: 9 Core-Files (heute/fall/termine/kalender/auftraege/verifizierung/willkommen) | 🟢 **offen**, build+audit grün, base=staging |

**Wave-Verifikation 11.06. (refs-only, merge-tree gegen staging `6a10ff145`):** #2635 (`a51fef3dc`) + #2640 (`6138f257e`) mergen **beide konfliktfrei**. Sie sind NICHT die Ursache des #2636-build-fails (fremder Owner-PR). → release-ready.

---

## 2 · Das Token-System (Mapping-Rezept)

Utilities existieren alle in `globals.css` (@theme) + `design-tokens.ts`, branden via `var(--brand-*)`:

```
GRÜN/emerald   → success    ROT/rose → danger    AMBER/orange/yellow → warning    (ondo-blau → info)
─────────────────────────────────────────────────────────────────────────────────────────
bg-*-50 / -100        → bg-{tok}-soft           text-*-700/800/900 → text-{tok}-strong
bg-*-500 / -600       → bg-{tok}                text-*-500/600     → text-{tok}
border-*-200/300      → border-{tok}/30         -100/-300-Zwischen → Opacity (/15 /20 /40 /50)
```

- **Token-Werte ~identisch** zu den alten Scales (`success-soft #ecfdf5` == `emerald-50`, `success-strong #047857` == `emerald-700`) → visuell quasi unverändert für Claimondo, brandet für SVs.
- **danger ist rose-basiert** (#2618-Entscheidung) → ein subtiler red→rose-Shift ist gewollt/erwartet.

---

## 3 · Methodik-Regeln (NICHT brechen — daran hängt die Qualität)

1. **Kuratiert, kein Blind-Sweep.** Pro Vorkommen entscheiden: echtes Status (→ Token) oder semantisch anders (→ LEAVE). Der Status-Ratchet hält den Bestand eingefroren; Migration ist Boy-Scout.
2. **LEAVE-Kategorien** (raw lassen, branden NICHT mit — gewollt):
   - Rating-Sterne (GoogleBewertung), Data-Viz/Trend (↑grün/↓rot, StatCard-Server)
   - Kanal-Identität (WhatsApp-Grün), Wetter (Feldmodus), Map-Marker, Navi-Ampel (NaviHud), Netzwerk-State (OfflineBanner)
   - Zeit-Marker (JetztBalken), Trophy/Leaderboard, Schaden-**Typ**-Identität (SCHADENS_URSACHE)
   - **Delete/Entfernen-Action-Hovers** (`hover:text-red-*` auf Remove-/X-Icons)
3. **Jeden File FRISCH greppen** — NICHT Agent-/Triage-Zeilennummern vertrauen. Sie driften (Beispiel: gutachter/TerminCard war auf staging 155 Zeilen, die Triage hatte den aar-939-Stand mit 282 → Zeilen stimmten nicht).
4. **Substring-Falle bei `replace_all`:** `bg-amber-50` ist Substring von `bg-amber-500`. Wenn ein File `-500` UND `-50` hat → **gezielte volle Strings** (`bg-amber-50 text-amber-600 hover:bg-amber-100`), nicht atomar `bg-amber-50`. Vorher prüfen: `grep -E '\-500\b'`.
5. **Baseline NICHT senken solange ein Sibling-PR sie auch ändert.** #2640 senkt 3115→3007. Spätere PRs (gutachter etc.) lassen `STATUS_BASELINE_OCCURRENCES` in Ruhe — der Ratchet passt via `delta<0` (Script meldet „kann gesenkt werden auf N"). Baseline-Senkung erst als Follow-up wenn #2640 gemergt → vermeidet Merge-Konflikt auf der Konstante.
6. **Portal-Branches auf `origin/staging` basieren, NICHT aufeinander stacken** → unabhängig mergebar, kein Stack-Bruch bei Squash-Merge.
7. **Squash bricht Stacks:** nach Squash-Merge der Basis (#2618/#2623) haben gestackte PRs neue SHAs der Basis-Commits → „CONFLICTING". Fix = `git rebase --onto origin/staging <alter-basis-tip> <branch>` (droppt geerbte Commits), force-push. NICHT neu bauen.
8. **Build-Pflicht bei Routen:** gutachter/kunde/admin `page.tsx`-Änderungen = voller `next build` (8GB Heap: `NODE_OPTIONS=--max-old-space-size=8192`), nicht nur tsc — der Next-Validator findet Route-Fehler die tsc nicht sieht.
9. **`.env.local` in den Worktree kopieren nur für den Build, danach `rm`** (Secret-Hygiene). `git add -u` (NICHT `-A` → .tmp-Files sind nicht gitignored).

---

## 4 · Reststrecke (priorisiert)

### A) gutachter Cluster 2 (Re-Triage mit exakten Zeilen nötig — Schätzungen waren unscharf)
Branch `kitta/gutachter-status-tokens` (#2647) ist offen — **entweder dort weiter** oder neuer Sibling auf staging.
Files (frisch greppen!): `willkommen` (Rest), `feldmodus/{FeldmodusDokumentSlot,AktuellerStopCard}` (NUR die — NaviHud/Offline/Tbt/JetztBalken = LEAVE!), `termine/[id]/{TerminDetailActions,vor-ort/VorOrtClient}`, `abrechnung/page` (1 pricing-LEAVE), `profil/ProfilClient`, `team/TeamClient`, `fall/[id]/_components/*`, `gebiet/page`, `reklamationen`, `PolizeiberichtUpload`, `components/gutachter/*`.
Detail-Triage: `docs/11.06.2026/WELLE-1B-GUTACHTER-STATUS-TRIAGE.md`.

### B) kunde-Portal (~101, **whitelabel**, low-collision) — nächstes Portal
Whitelabel wie gutachter → Token branden mit. Cards (AuszahlungCard, SaeuleMein*, TerminSectionCard), OnboardingWizard, faelle/[id]. Triage analog.

### C) admin-Portal (~289, intern, nicht gebrandet)
Worst Files: `abrechnungen/AbrechnungenListClient` (statusBadge-Fn), `datenschutz/loeschauftraege` (STATUS_META), `aircall-relay-seats`. Data-Viz NICHT migrieren: `StatistikenClient`-Chart-Palette (skip-headern), `PerformanceClient` text-amber-400.

### D) dispatch-Portal (~538, intern) — **ZULETZT + KOORDINIEREN**
⚠️ Wird aktuell von der cmm49-Session (sv_id-Sweep, faelle-Drop) stark bearbeitet → **Kollisionsgefahr**. Erst angehen wenn deren Sweep durch ist. Worst: `DokumenteAnfordernCard` (32), `LeadsViewToggle`, `dashboard/page` (Konstanten-Maps).

### E) Follow-ups (klein)
- `FallMitteilungenBanner` PRIO_TONE: Hex (nicht rgba) + `${tone.color}40`-Konkatenation var-inkompatibel → struktureller `danger/warning/info`-Refactor (war in Welle 1 bewusst deferred).
- Status-Baseline final senken nachdem alle Portal-PRs gemergt (auf den dann-gemeldeten Wert).
- Welle 2 (Typo `text-[Npx]`→Tokens, Restradien, Component-Set dispatch-Buttons) + Welle 3 (a11y: aria-label gutachter-Icons, role=alert auth).

---

## 5 · Audit-Quellen (Kontext für Folge-Session)
- **Gesamt-Portal-Audit:** `docs/10.06.2026/TOKEN-DESIGN-AUDIT-ALLE-PORTALE.md` (6-Agenten, Health-Matrix, 5 systemische Muster, file:line)
- **gutachter-Triage:** `docs/11.06.2026/WELLE-1B-GUTACHTER-STATUS-TRIAGE.md`
- **Wichtigster CI-Befund:** `check-token-audit.mjs` prüfte nur **Hex**, nicht **rgba** → #2635 schloss die Lücke (4. Ratchet, nur Gradient-Kontext, ~0 FP; Schatten/Avatare/Mapbox/Native bewusst raus).
