# Reader-Sweep — P3b Cutover Delete-Safety (Dispatch Config-Unify)

**Stand:** 2026-06-02 · **Branch:** `kitta/dispatch-config-cutover-reader-sweep` (read-only, docs-only)
**Base:** `origin/staging` @ `5c968446b` (= nach Merge #2273 P2f-T2 + #2278 P3a §9)
**Memory:** `project_dispatch_config_unify` · **Vorgaenger:** `docs/02.06.2026/HANDOFF-dispatch-config-unify-cutover-runway.md` §3b
**Methode:** statischer Consumer-Grep + Datei-Read jeder im Handoff zum Loeschen vorgemerkten Datei. **Kein Code angefasst.**

> Zweck: Bevor P3b die Phasen-Maschinerie loescht, fuer JEDE Datei belegt klaeren: DELETE / KEEP / DORMANT / CONDITIONAL — mit Konsument als Beweis (CMM-44-Pflicht). Der Handoff-Sammelbegriff „`_phases/Phase1..6*.tsx` loeschen" ist **woertlich genommen gefaehrlich** (s. §2 Fallen).

---

## 0. TL;DR — die 5 Dinge, die der Cutover wissen muss

1. 🔴 **TRAP 1 — `_phases/InlineField.tsx` ist KEEP.** Externer Consumer ausserhalb Dispatch: `src/components/shared/stammdaten/LeadSchemaFields.tsx` importiert es. Mit „den Phasen" mitloeschen → bricht eine geteilte Stammdaten-Komponente (tsc-Fehler). Der Handoff hat das nicht markiert.
2. 🔴 **TRAP 2 — `RueckrufTerminPanel.tsx` ist KEEP.** Externer Consumer: `src/app/dispatch/rueckrufe/RueckrufListItem.tsx`. Ueberlebt die Sidebar-Loeschung. Im Handoff als Root-`[id]`-Datei nicht als Keep gelistet.
3. 🟡 **4 Dateien sind bereits DORMANT** (kein Consumer, pre-existing Dead-Code — unabhaengig vom Cutover loeschbar): `SvKalenderVergleichModal.tsx`, `RueckrufSection.tsx`, `_phases/Phase3Schadentyp.tsx`, plus die Action-Funktion `setLeadPhase`. `SchadentypPicker.tsx` haengt nur an der dormanten `Phase3Schadentyp` → effektiv ebenfalls tot.
4. 🟡 **PARITY-GATE vor dem Loeschen von `hard-gate.ts` / `schadentyp.ts`:** beide schreiben **abgeleitete Spalten**, die der v2-Autosave (`saveDispatchLeadFelder`) NICHT repliziert (reiner Allowlist-Spalten-Writer, belegt §5). Auto-Disqualifikation-Wegfall ist **gewollt** (v2 = Warn-Badges + manuelles Flag), aber `polizeibericht_pflicht`-Regel, `unfallort_kategorie`-Ableitung und `unfall_uhrzeit`-Normalisierung haben **keinen** Ersatz-Writer. Vor Delete bestaetigen oder bewusst verwerfen.
5. ✅ **Entwarnung Kanban:** `qualifizierungs_phase='in-qualifizierung'` hat viele Writer (`lib/autoPhase.ts` u.a.), NICHT nur `saveHardGate` → der Phasen-Spalten-Vorlauf in Kanban/Listen regrediert durch das Loeschen **nicht**.

Der closed-set-Beweis steht: **`useDispatchPhase`/`phase-context` hat 0 externe Consumer** — die Provider-Maschinerie ist ein in sich geschlossener, sicher loeschbarer Teilbaum, sobald die Phasen-UI faellt.

---

## 1. Master-Klassifikation (`src/app/dispatch/leads/[id]/`)

Legende: **DELETE** = sicher loeschbar (nur delete-side Consumer) · **KEEP** = ueberlebt (v2/extern nutzt es) · **DORMANT** = schon jetzt 0 Consumer · **COND** = an P2d-4-Sidebar-Entscheid gekoppelt · **KEEP+EDIT** = bleibt, aber anpassen.

### Root `[id]/`
| Datei | Verdikt | Beweis / einziger Consumer |
|---|---|---|
| `page.tsx` | **KEEP+EDIT** | v2-Gate + Legacy-Branch raus (§4) |
| `DispatchLeadForm.tsx` | **KEEP** | der v2-Form selbst |
| `DispatchGatesPanel.tsx` | **KEEP** | v2; nutzt `computeQualificationStatus` |
| `SvDispatchPanel.tsx` | **KEEP** | `_v2/dispatch-field-overrides.tsx` (termin) + `DispatchLeadForm` (type) |
| `RueckrufTerminPanel.tsx` | **KEEP** 🔴 | **extern** `dispatch/rueckrufe/RueckrufListItem.tsx` (+ SidebarStubs delete-side) |
| `actions.ts` | **KEEP+EDIT** | Barrel; `SvDispatchPanel`/v2 nutzen sv-termin/debug-sv. **Tote Re-Exports prunen** (qualification/schadentyp/gespraech/hard-gate Zeilen 15-21) |
| `loading.tsx` | **KEEP** | Route-Loading-UI |
| `DispatchShell.tsx` | **DELETE** | nur `page.tsx`-Legacy-Branch |
| `PhaseContent.tsx` | **DELETE** | nur `DispatchShell` |
| `PhaseHeader.tsx` | **DELETE** | nur `DispatchShell` |
| `ExitSkript.tsx` | **DELETE** | nur `_phases/Phase1Qualifizierung` |
| `SchadentypPicker.tsx` | **DELETE** | nur `_phases/Phase3Schadentyp` (selbst dormant) |
| `GespraechsleitfadenTimer.tsx` | **COND** (P2d-4) | nur `_sidebar/SidebarStubs` |
| `RueckrufSection.tsx` | **DORMANT** 🟡 | kein Import — nur ein *veralteter Kommentar* in SidebarStubs (das real `RueckrufTerminPanel` importiert) |
| `SvKalenderVergleichModal.tsx` | **DORMANT** 🟡 | kein Import (SvDispatchPanel importiert es NICHT; nur Kommentar in `_actions/sv-kalender.ts`) |

### `_lib/`
| Datei | Verdikt | Beweis |
|---|---|---|
| `qualification-engine.ts` | **KEEP** | `page.tsx` + `DispatchGatesPanel` (beide Ueberlebende). **Engine bleibt — nur die Phasen-STEUERUNG/`initialPhase` faellt.** |
| `qualification-engine.test.ts` | **KEEP** | testet die Engine |
| `phase-context.tsx` | **DELETE** | closed set: 0 externe `useDispatchPhase`-Consumer (alle in zu-loeschenden Files) |
| `gegner-kz-flags.ts` | **ORPHAN→DELETE** ⚠️ | nur `_phases/Phase4Stammdaten` (`stammdaten.ts`-Treffer = Kommentar). Parity prüfen (s. §5) |

### `_hooks/`
| `useCarQuery.ts` | **ORPHAN→DELETE** | nur `_phases/Phase4Stammdaten` |

### `_phases/`
| Datei | Verdikt | Beweis |
|---|---|---|
| `DokumenteAnfordernCard.tsx` | **KEEP** | `DispatchLeadForm` (v2, §8c T2) |
| `UnfallskizzeCard.tsx` | **KEEP** | `_v2/dispatch-section-panels.tsx` |
| `UnfallskizzeEditor.tsx` | **KEEP** | via `UnfallskizzeCard` (KEEP) |
| `InlineField.tsx` | **KEEP** 🔴 | **extern** `components/shared/stammdaten/LeadSchemaFields.tsx` (+ Phase4 delete-side) |
| `Phase1Qualifizierung.tsx` | **DELETE** | nur `PhaseContent` |
| `Phase1PersonenForm.tsx` | **DELETE** | nur `Phase1Qualifizierung` |
| `Phase2TerminServiceTyp.tsx` | **DELETE** | nur `PhaseContent` |
| `Phase4Stammdaten.tsx` | **DELETE** | nur `PhaseContent` |
| `Phase5Zusammenfassung.tsx` | **DELETE** | nur `PhaseContent` |
| `Phase6StatusTracking.tsx` | **DELETE** | nur `PhaseContent` |
| `BkatAnalysePanel.tsx` | **DELETE** | nur `_phases/Phase4Stammdaten` |
| `Phase3Schadentyp.tsx` | **DORMANT** 🟡 | kein Import — `PhaseContent` rendert 1,2,4,5,6 (NICHT 3); Schadentyp/BKAT in Phase4 gewandert (CMM-23) |

### `_sidebar/` (an P2d-4 gekoppelt — VOR Delete klaeren ob v2 sie erhaelt)
| `KundenMatchCard.tsx` | **COND** (P2d-4) | nur `DispatchShell` |
| `SidebarStubs.tsx` | **COND** (P2d-4) | nur `DispatchShell` |

### `_components/`
| `WunschterminWochentagePills.tsx` | **KEEP** | `_v2/DispatchWunschterminPanel` (+ Phase2 delete-side) |
| `ZeugenKontakteEditor.tsx` | **KEEP** | `_v2/dispatch-section-panels` (+ Phase4 delete-side) |

### `_v2/` — **alle KEEP** (die v2-Maschinerie)
`DispatchChecklistPanel`, `dispatch-field-override-keys`, `dispatch-field-overrides(.test)`, `DispatchKennzeichenField`, `DispatchPlaceField`, `dispatch-section-panel-keys`, `dispatch-section-panels(.test)`, `DispatchVersichererField`, `DispatchWunschterminPanel`, `OverrideFieldShell`. (Plus post-Merge additiv: `DispatchFlowlinkPanel` P2g, `DispatchStatusPanel` P2h, `DispatchSaBanner` 3a — s. §3.)

---

## 2. Die Fallen im Handoff-Sammelbegriff

Der Handoff §3b sagt „LOESCHEN: … `_phases/Phase1..6*.tsx` …". `_phases/` enthaelt aber **gemischt**:
- **KEEP (v2/extern):** `DokumenteAnfordernCard`, `UnfallskizzeCard`, `UnfallskizzeEditor`, **`InlineField`** (extern!).
- **DELETE (delete-side):** `Phase1Qualifizierung`, `Phase1PersonenForm`, `Phase2TerminServiceTyp`, `Phase4Stammdaten`, `Phase5Zusammenfassung`, `Phase6StatusTracking`, `BkatAnalysePanel`.
- **DORMANT:** `Phase3Schadentyp`.

→ **Nie per `rm _phases/*` oder Glob loeschen.** Nur die in §1 als DELETE markierten Einzeldateien. Ebenso ist `phase-context` `.tsx` (nicht `.ts`).

---

## 3. Bewegliches Ziel: Sweep ist auf HEUTIGEM staging (vor P2g/P2h/3a)

Diese Analyse ist gegen `staging@5c968446b` — **ohne** #2280 (P2g Flowlink-Panel), #2282 (P2h Status-Panel) und 3a (SA-Banner, noch nicht gebaut). Bis der Cutover laeuft, landen diese und veraendern `DispatchLeadForm.tsx` + `page.tsx`.

**Additiv-KEEP nach den Merges** (per Konstruktion, da v2 sie dann importiert): `_v2/DispatchFlowlinkPanel.tsx`, `_v2/DispatchStatusPanel.tsx`, `_v2/DispatchSaBanner.tsx`. P2g zieht ausserdem das `flowLinks`-Laden vor den (dann wegfallenden) Branch — wie P2d-1 es mit `aktiverSvTermin`/`qual` tat.

**→ Pflicht:** Vor dem realen Delete den Consumer-Grep gegen *dann-aktuelles* staging neu fahren (Befehle §6). Diese Liste ist die Vorlage, nicht der Freibrief.

---

## 4. `page.tsx`-Chirurgie (konzeptionell — exakter Diff gegen dann-staging)

Heute (`staging@5c968446b`): `if (v2 !== undefined)` → `DispatchLeadForm`; sonst Legacy-`DispatchShell`-Zweig.

Cutover:
- **Weg:** `if (v2 !== undefined)`-Gate (immer `DispatchLeadForm`), `searchParams: { v2 }`, Import `DispatchShell`, Import `type { Phase } from './_lib/phase-context'`, die Legacy-Berechnung `unterschriftenSnapshot`, der gesamte `initialPhase`-Block (Z. 177-183), das `<DispatchShell .../>`-Return.
- **Bleibt (jetzt von v2 genutzt):** `lead` (select *), `aktiverSvTermin`, `qual` (`computeQualificationStatus`), `phasen` (`ladeFlowPhasen`), `flowLinks` (von P2g vorgezogen), der `v_claim_full`-`fallRow`-Vorschaden-Merge (Z. 159-175), `fallIdFuerBanner` (fuer 3a SA-Banner; in v2-Pfad durchreichen).

Deckt sich mit Handoff §3b — hier nur file-genau verifiziert.

---

## 5. Legacy-Actions + das Derived-Write-Parity-Gate

`actions.ts` ist ein Barrel, das ueberlebende (sv-termin/debug-sv/personen) UND Legacy-Actions re-exportiert. Klassifikation je Funktion (Consumer-Grep):

| Action / Funktion | einziger Consumer | Verdikt |
|---|---|---|
| `_actions/qualification.setLeadPhase` | — (keiner!) | **DORMANT** |
| `_actions/qualification.disqualifiziereLead` | `_sidebar/SidebarStubs` | **COND** (P2d-4) |
| `_actions/qualification.setServiceTyp` | `_phases/Phase2TerminServiceTyp` | **DELETE** |
| `_actions/hard-gate.saveHardGate` | `_phases/Phase1Qualifizierung` | **DELETE** ⚠️ Parity |
| `_actions/schadentyp.save/clearSchadentyp` | `SchadentypPicker`(dormant)+`Phase4`(dyn. import) | **DELETE** ⚠️ Parity |
| `_actions/gespraech.start/endeGespraech` | `GespraechsleitfadenTimer` | **COND** (P2d-4) |
| `_actions/kunden-match.*` | `_sidebar/KundenMatchCard` | **COND** (P2d-4) |
| `_actions/rueckruf.*` | `RueckrufTerminPanel` (KEEP) | **KEEP** |
| `_actions/sv-termin`, `debug-sv`, `dispatch-lead-felder`, `dokumente-anfordern`, `flowlink`, `geocode`, `versicherungen`, `unfallskizze` | v2 / SvDispatchPanel | **KEEP** |
| `_actions/sv-kalender` | nur dormante `SvKalenderVergleichModal` | **ORPHAN** |
| `_actions/personen`, `stammdaten`, `bkat-inference`, `cardentity`, `email-sv-check`, `gruene-karte` | gemischt | **VERIFY** (s.u.) |

⚠️ **Parity-Gate (belegt, nicht spekulativ).** `saveDispatchLeadFelder` (v2-Autosave) ist ein **reiner Allowlist-Spalten-Writer** (`onboarding_felder.db_target.spalte` → coerced value + `updated_at`; sonst nichts — Z. 71-85). Die Legacy-Actions schreiben aber **abgeleitete** Spalten:
- `saveHardGate`: `qualifizierungs_phase` (Disqual/in-qualifizierung-State-Machine), `disqualifiziert_grund[_key]`, `polizeibericht_pflicht`-Geschaeftsregel, `unfall_uhrzeit`-Normalisierung (`parseUhrzeit`), Clear von `polizei_aktenzeichen`.
- `saveSchadentyp`: `unfallort_kategorie`-Ableitung aus Schadentyp (CHECK-constraint-exakt — AAR-215-Incident), Parkplatz-Auto-Disqualifikation.

**Einordnung (nicht alles ist ein Bug):**
- ✅ **Auto-Disqualifikation-Wegfall = gewollt.** `DispatchGatesPanel`-Header sagt explizit: Hard-Gate-Disqualifikation wird durch Warn-Badges + manuelles `disqualifiziert`-Flag ersetzt. Kein Regress.
- ✅ **`in-qualifizierung`-Vorlauf bleibt.** Mehrere Writer (`lib/autoPhase.ts`, `dispatch/rueckrufe/actions.ts`, `kunde/page.tsx`, `flow/[token]/page.tsx`) → Kanban/Listen-Phase regrediert nicht. (Verify: triggert der v2-Flow autoPhase am richtigen Punkt?)
- 🟡 **Ohne Ersatz-Writer → vor Delete bestaetigen/bewusst verwerfen:** `polizeibericht_pflicht`-Regel, `unfallort_kategorie`-Ableitung, `unfall_uhrzeit`-Normalisierung. Optionen: (a) in `saveDispatchLeadFelder` als Derive-Hook nachziehen, (b) als bewussten Wegfall dokumentieren (Dispatcher pflegt manuell), (c) Felder existieren in der `lead-erfassung`-Config gar nicht → moot. **(c) zuerst pruefen** (DB: `onboarding_felder` fuer flow_key `lead-erfassung`).

**VERIFY-Liste (am Delete-Tag, mit dann-staging):** Konsumiert ein Ueberlebender noch `personen.*` / `saveStammdaten` / `bkat-inference` / `gruene-karte`? (Erwartung: `personen`+`stammdaten` haengen an Phase1/Phase4 → Orphan; `bkat-inference` evtl. am Kennzeichen-Override = KEEP. Nicht raten — greppen.)

---

## 6. Re-Run-Befehle (Pflicht vor dem realen Delete)

```bash
# closed-set-Beweis (muss leer bleiben ausser den zu-loeschenden Files):
rg -n "useDispatchPhase|phase-context" src

# je DELETE-Kandidat: gibt es einen NICHT-delete-side Consumer?
rg -n "_phases/|DispatchShell|PhaseContent|PhaseHeader|ExitSkript|SchadentypPicker|GespraechsleitfadenTimer" src

# Action-Funktionsnamen-Consumer (Survivor?):
rg -n "disqualifiziereLead|saveHardGate|setServiceTyp|setLeadPhase|saveSchadentyp|clearSchadentyp|startGespraech|endeGespraech" src

# Parity: schreibt der v2-Autosave inzwischen Derives?
sed -n '1,90p' src/app/dispatch/leads/\[id\]/_actions/dispatch-lead-felder.ts
```

Nach Delete: `npx tsc --noEmit` (faengt verwaiste Imports) + `npx vitest run dispatch` + `npm run check:knip -- --ratchet` (Dead-Code-Gate) + Voll-Smoke (Handoff §3b).

---

## 7. Geordnete Delete-Liste fuer P3b (nur was §1 belegt als sicher ausweist)

**Sicher (nach Re-Run-Bestaetigung), unabhaengig von P2d-4:**
```
DispatchShell.tsx  PhaseContent.tsx  PhaseHeader.tsx  ExitSkript.tsx  SchadentypPicker.tsx
_lib/phase-context.tsx  _lib/gegner-kz-flags.ts  _hooks/useCarQuery.ts
_phases/Phase1Qualifizierung.tsx  _phases/Phase1PersonenForm.tsx  _phases/Phase2TerminServiceTyp.tsx
_phases/Phase4Stammdaten.tsx  _phases/Phase5Zusammenfassung.tsx  _phases/Phase6StatusTracking.tsx
_phases/BkatAnalysePanel.tsx
_actions/hard-gate.ts(*)  _actions/schadentyp.ts(*)  _actions/qualification.ts  _actions/sv-kalender.ts
```
`(*)` = erst nach Parity-Gate (§5).

**Pre-existing DORMANT (jetzt schon loeschbar, „Boy-Scout"):**
```
RueckrufSection.tsx  SvKalenderVergleichModal.tsx  _phases/Phase3Schadentyp.tsx
```

**An P2d-4 gekoppelt (erst nach Sidebar-Entscheid):**
```
_sidebar/SidebarStubs.tsx  _sidebar/KundenMatchCard.tsx  GespraechsleitfadenTimer.tsx
_actions/gespraech.ts  _actions/kunden-match.ts  qualification.disqualifiziereLead
```

**NIEMALS loeschen (KEEP — Beweis §1):**
```
page.tsx(edit)  DispatchLeadForm  DispatchGatesPanel  SvDispatchPanel  RueckrufTerminPanel  loading.tsx
actions.ts(prune)  _lib/qualification-engine(.ts/.test)  alle _v2/*  alle _components/*
_phases/DokumenteAnfordernCard  _phases/UnfallskizzeCard  _phases/UnfallskizzeEditor  _phases/InlineField
_actions/{rueckruf,sv-termin,debug-sv,dispatch-lead-felder,dokumente-anfordern,flowlink,geocode,versicherungen,unfallskizze}
```

**Folge-Edits (sonst rotes tsc):** `actions.ts` Re-Export-Zeilen der geloeschten Actions entfernen; `_actions/types.ts` ggf. `HardGateData` prunen.
