# P3b Cutover — Plan (post-P2d-4, re-verifiziert)

**Stand:** 2026-06-03 · **Branch:** `kitta/dispatch-config-unify-p3b-cutover-prep` (docs-only, off `origin/staging`)
**Base:** `staging @ 9e0beec99` (= **P2d-4 #2322 GEMERGT**, 10:45Z).
**Aktualisiert:** `docs/02.06.2026/dispatch-config-unify-cutover-reader-sweep-p3b.md` (#2287) — dieses Doc loest dessen **COND(P2d-4)**-Eintraege auf und zieht das Parity-Gate nach.
**Methode:** statischer Consumer-Grep gegen das P2d-4-staging (jede Aenderung mit Beweis). **Kein Code angefasst** (Prep). Der destruktive Cutover ist ein **Folge-Schritt**, gated (s. §8).

---

## 0. TL;DR — was P2d-4 am Cutover aendert

P2d-4 (#2322) hat die Legacy-Dispatcher-Funktionen, die der Cutover sonst verloren haette, nach v2 portiert. Damit sind die im Reader-Sweep #2287 offenen **COND(P2d-4)**-Entscheidungen jetzt belegt, und **2 vormalige DELETE-Files werden KEEP**:

1. **DELETE → KEEP (v2 nutzt sie jetzt):** `_phases/Phase1PersonenForm.tsx` (← `_v2/dispatch-section-panels`) · `_phases/BkatAnalysePanel.tsx` (← `_v2/dispatch-section-panels`).
2. **COND → KEEP:** `GespraechsleitfadenTimer.tsx` · `_sidebar/KundenMatchCard.tsx` · `_actions/gespraech.ts` · `_actions/kunden-match.ts` (alle ← `_v2/DispatchSidebar`/KundenMatchCard).
3. **COND → DELETE:** `_sidebar/SidebarStubs.tsx` (Inhalt liegt seit Task 9 in `_lib/gespraech-content.ts` = KEEP; SidebarStubs selbst hat nur noch `DispatchShell` = delete-side) · `qualification.disqualifiziereLead` (v2 setzt das Flag via Autosave, nicht via diese Action).
4. **DELETE → KEEP+EDIT:** `_actions/schadentyp.ts` — `setParkplatzKamera` (← `_v2/ParkplatzKameraToggle`, KEEP) bleibt; `saveSchadentyp`/`clearSchadentyp` werden nach Delete der Konsumenten (Phase4/SchadentypPicker) geprunt.
5. **NEU → KEEP:** `_lib/gespraech-content.ts(+test)` · `_v2/Dispatch{Gespraechshilfe,EinwandKarten,Sidebar}.tsx` · `_v2/{EigentuemerTypPanel,ParkplatzKameraToggle}.tsx`.
6. **🟢 Parity-Gate RESOLVED** (war der Blocker fuer `hard-gate.ts`/`schadentyp.ts`-Delete): `polizeibericht_pflicht` + `unfallort_kategorie` via Derive-Hook #2304 (auf staging); `parkplatz_kamera` via P2d-4 Task 5b; `unfall_uhrzeit` = Config-Feld (Wert erfasst, nur `parseUhrzeit`-Normalisierung entfaellt = minor); Auto-Disqualifikation = bewusst weg (manuelles Flag). → `hard-gate.ts` ist jetzt ein sauberer DELETE.

**Closed-set bestaetigt:** `useDispatchPhase` hat weiterhin **0** Consumer ausserhalb der Delete-Liste (10 Files, alle legacy) — P2d-4 fuegte **keinen** hinzu (alle neuen `_v2`-Komponenten sind de-phase-context). Voll eliminierbar.

**Gate fuer den Build (§8):** P2d-4 auf staging ✓ — fehlt nur noch der **gruene Voll-Smoke auf staging** (post-deploy) + **Aaron-Freigabe**.

---

## 1. Delta-Resolution (Beweis: Consumer-Grep gegen staging@9e0beec99)

| Datei / Funktion | #2287-Verdikt | NEU | Beweis (Consumer) |
|---|---|---|---|
| `_phases/Phase1PersonenForm.tsx` | DELETE | **KEEP** | `_v2/dispatch-section-panels.tsx:13,80` (+ Phase1Qualifizierung delete-side) |
| `_phases/BkatAnalysePanel.tsx` | DELETE | **KEEP** | `_v2/dispatch-section-panels.tsx:14,83` (+ Phase4 delete-side) |
| `GespraechsleitfadenTimer.tsx` | COND | **KEEP** | `_v2/DispatchSidebar.tsx:7,29` (+ SidebarStubs delete-side) |
| `_sidebar/KundenMatchCard.tsx` | COND | **KEEP** | `_v2/DispatchSidebar.tsx:8,50` (+ DispatchShell delete-side) |
| `_actions/gespraech.ts` | COND | **KEEP** | `GespraechsleitfadenTimer.tsx:12` (KEEP) |
| `_actions/kunden-match.ts` | COND | **KEEP** | `_sidebar/KundenMatchCard.tsx:14` (KEEP) |
| `_actions/personen.ts` | VERIFY | **KEEP** | via `actions.ts:46`-Barrel ← `Phase1PersonenForm` (KEEP) |
| `_actions/stammdaten.ts` | VERIFY | **KEEP** | `_v2/{EigentuemerTypPanel,DispatchWunschterminPanel,DispatchVersichererField,DispatchPlaceField,DispatchKennzeichenField}` + `_components/ZeugenKontakteEditor` |
| `_actions/cardentity.ts` | VERIFY | **KEEP** | `_v2/dispatch-section-panels.tsx:19` (requestCardentityTypBForLead) |
| `_actions/bkat-inference.ts` | VERIFY | **KEEP** | `BkatAnalysePanel.tsx:17` (KEEP) |
| `_actions/schadentyp.ts` | DELETE⚠️ | **KEEP+EDIT** | `setParkplatzKamera` ← `_v2/ParkplatzKameraToggle.tsx:11` (KEEP); `save/clearSchadentyp` → prune nach Phase4/Picker-Delete |
| `_sidebar/SidebarStubs.tsx` | COND | **DELETE** | nur `DispatchShell` (delete-side); Inhalt → `_lib/gespraech-content.ts` (KEEP) |
| `qualification.disqualifiziereLead` | COND | **DELETE** | nur `_sidebar/SidebarStubs` (delete-side); v2 setzt `disqualifiziert` als Config-Feld via Autosave |
| `_actions/gruene-karte.ts` | VERIFY | **ORPHAN→DELETE** | nur `Phase4Stammdaten:36` (delete-side); = deferred Minor-Gap (Gruene-Karte-Reminder, s. P2d-4-Parity-Matrix) |
| `_actions/email-sv-check.ts` | VERIFY | **ORPHAN→DELETE** | nur `Phase5Zusammenfassung:11` (delete-side); = deferred Minor-Gap (checkEmailIsSv) |
| `_lib/gespraech-content.ts(+test)` | — (neu) | **KEEP** | `_v2/Dispatch{Gespraechshilfe,EinwandKarten}` + SidebarStubs(delete-side) |
| `_v2/DispatchGespraechshilfe/EinwandKarten/Sidebar` | — (neu) | **KEEP** | v2-Sidebar (DispatchLeadForm) |
| `_v2/EigentuemerTypPanel/ParkplatzKameraToggle` | — (neu) | **KEEP** | `_v2/dispatch-section-panels.tsx` |

---

## 2. Parity-Gate — RESOLVED (war der Blocker fuer hard-gate/schadentyp-Delete)

Der Reader-Sweep #2287 §5 markierte 3 abgeleitete Writes ohne v2-Ersatz. Stand jetzt:

| Derived Write (Legacy-Quelle) | Status post-P2d-4 |
|---|---|
| `polizeibericht_pflicht` (saveHardGate) | ✅ **Derive-Hook #2304** (`_lib/derive-dispatch-felder.ts` in `saveDispatchLeadFelder`, auf staging) |
| `unfallort_kategorie` (saveSchadentyp) | ✅ **Derive-Hook #2304** (gleiche Quelle, AAR-215-CHECK-exakt) |
| `parkplatz_kamera` (saveSchadentyp) | ✅ **P2d-4 Task 5b** (`setParkplatzKamera`, evidenz-only; Auto-Disq bewusst weg) |
| `unfall_uhrzeit`-Normalisierung (saveHardGate `parseUhrzeit`) | 🟢 Wert erfasst (Config-Feld `unfall_uhrzeit`, Seed 194358:36); nur die Format-Normalisierung entfaellt = **minor, akzeptiert** |
| Auto-Disqualifikation (saveHardGate/saveSchadentyp) | ✅ **bewusst weg** — v2 = Warn-Badges + manuelles `disqualifiziert`-Flag (P2c) |
| `qualifizierungs_phase='in-qualifizierung'`-Vorlauf | ✅ kein Regress — viele Writer (`lib/autoPhase.ts` u.a.), nicht nur saveHardGate (#2287 §0.5) |

→ **`hard-gate.ts` ist jetzt ein sauberer DELETE** (saveHardGate nur ← Phase1Qualifizierung delete-side; alle Derives ersetzt/akzeptiert). **`schadentyp.ts` = KEEP+EDIT** (setParkplatzKamera bleibt).

---

## 3. DELETE-Liste (P3b, nach Re-Run-Bestaetigung §7)

```
# Phasen-Maschinerie / Shell (nur delete-side Consumer):
DispatchShell.tsx  PhaseContent.tsx  PhaseHeader.tsx  ExitSkript.tsx  SchadentypPicker.tsx
_lib/phase-context.tsx  _lib/gegner-kz-flags.ts  _hooks/useCarQuery.ts
_phases/Phase1Qualifizierung.tsx  _phases/Phase2TerminServiceTyp.tsx
_phases/Phase4Stammdaten.tsx  _phases/Phase5Zusammenfassung.tsx  _phases/Phase6StatusTracking.tsx
_sidebar/SidebarStubs.tsx                       # NEU vs #2287: COND -> DELETE (Inhalt in gespraech-content)
_actions/hard-gate.ts                           # Parity resolved (#2304) -> sauberer DELETE
_actions/qualification.ts                       # setLeadPhase(dormant)+disqualifiziereLead(v2 nutzt Flag)+setServiceTyp(delete-side)
_actions/sv-kalender.ts                         # nur dormante SvKalenderVergleichModal
_actions/gruene-karte.ts                        # ORPHAN nach Phase4-Delete (deferred Minor-Gap)
_actions/email-sv-check.ts                      # ORPHAN nach Phase5-Delete (deferred Minor-Gap)

# Pre-existing DORMANT (Boy-Scout, schon jetzt 0 Consumer):
RueckrufSection.tsx  SvKalenderVergleichModal.tsx  _phases/Phase3Schadentyp.tsx
```

**NICHT MEHR in der DELETE-Liste (vs #2287):** `_phases/Phase1PersonenForm.tsx`, `_phases/BkatAnalysePanel.tsx` → jetzt **KEEP**.

---

## 4. KEEP-Liste (Beweis §1 + #2287 §1)

```
# v2-Kern + Survivors:
page.tsx (EDIT, §6)  DispatchLeadForm.tsx  DispatchGatesPanel.tsx  SvDispatchPanel.tsx
RueckrufTerminPanel.tsx (extern: dispatch/rueckrufe)  loading.tsx
actions.ts (EDIT: tote Re-Exports prunen)  _lib/qualification-engine.ts(+test)
_lib/derive-dispatch-felder.ts(+test)             # #2304 Derive-Hook
alle _v2/*  alle _components/*

# _phases survivors:
_phases/DokumenteAnfordernCard.tsx  _phases/UnfallskizzeCard.tsx  _phases/UnfallskizzeEditor.tsx
_phases/InlineField.tsx (extern: shared/stammdaten/LeadSchemaFields)
_phases/Phase1PersonenForm.tsx (NEU KEEP, ← v2)  _phases/BkatAnalysePanel.tsx (NEU KEEP, ← v2)

# NEU aus P2d-4:
_lib/gespraech-content.ts(+test)
_v2/DispatchGespraechshilfe.tsx  _v2/DispatchEinwandKarten.tsx  _v2/DispatchSidebar.tsx
_v2/EigentuemerTypPanel.tsx  _v2/ParkplatzKameraToggle.tsx

# _sidebar:
_sidebar/KundenMatchCard.tsx (NEU KEEP, ← v2 DispatchSidebar)

# Root:
GespraechsleitfadenTimer.tsx (NEU KEEP, ← v2 DispatchSidebar; Hinweistext bereits de-phase-context in P2d-4)

# _actions survivors:
_actions/{rueckruf,sv-termin,debug-sv,dispatch-lead-felder,dokumente-anfordern,flowlink,
          geocode,versicherungen,unfallskizze,personen,stammdaten,cardentity,bkat-inference,
          gespraech,kunden-match}.ts
_actions/schadentyp.ts (KEEP+EDIT: setParkplatzKamera behalten; save/clearSchadentyp prunen)
```

---

## 5. Folge-Edits (sonst rotes tsc nach Delete)

- `actions.ts` (Barrel): Re-Export-Zeilen der geloeschten Actions entfernen — `setLeadPhase, disqualifiziereLead, setServiceTyp` (qualification, Z. 15), `saveSchadentyp, clearSchadentyp` (Z. 16, schadentyp wird KEEP aber diese 2 Funktionen geprunt), `startGespraech, endeGespraech` **bleiben** (gespraech KEEP). Tote `hard-gate`/`gruene-karte`/`email-sv-check`/`sv-kalender`-Re-Exports raus, falls vorhanden.
- `_actions/schadentyp.ts`: `saveSchadentyp` + `clearSchadentyp` entfernen (nach Phase4/SchadentypPicker-Delete), `setParkplatzKamera` behalten. `unfallort_kategorie`-Ableitung darin ist durch #2304 redundant.
- `_actions/types.ts`: `HardGateData` prunen, falls nur von hard-gate genutzt.
- `page.tsx`: §6.

---

## 6. `page.tsx`-Chirurgie (unveraendert ggue. #2287 §4 — P2d-4 hat page.tsx nicht angefasst)

- **Weg:** `if (v2 !== undefined)`-Gate (immer `DispatchLeadForm`), `searchParams: { v2 }`, Import `DispatchShell`, Import `type { Phase } from './_lib/phase-context'`, `unterschriftenSnapshot`-Berechnung, der `initialPhase`-Block, das `<DispatchShell .../>`-Return.
- **Bleibt (v2 nutzt es):** `lead` (select *), `aktiverSvTermin`, `qual` (`computeQualificationStatus`), `phasen` (`ladeFlowPhasen`), `flowLinks`, der `v_claim_full`-Vorschaden-Merge, `fallId` (SA-Banner).

---

## 7. Re-Run-Befehle (PFLICHT direkt vor dem realen Delete — staging bewegt sich)

```bash
# 1) closed-set: MUSS nur Delete-Liste-Files zeigen:
rg -n "useDispatchPhase|phase-context" src

# 2) je KEEP-durch-v2: bestaetigen dass der v2-Consumer noch existiert:
rg -n "Phase1PersonenForm|BkatAnalysePanel|GespraechsleitfadenTimer|KundenMatchCard|gespraech-content|setParkplatzKamera" src/app/dispatch/leads/\[id\]/_v2

# 3) je DELETE-Kandidat: nur delete-side Consumer?
rg -n "DispatchShell|PhaseContent|PhaseHeader|ExitSkript|SchadentypPicker|SidebarStubs|disqualifiziereLead|saveHardGate|setGrueneKarteAngefragt|checkEmailIsSv" src

# 4) Parity: Derive-Hook deckt polizeibericht_pflicht + unfallort_kategorie?
sed -n '1,60p' src/app/dispatch/leads/\[id\]/_lib/derive-dispatch-felder.ts
```

Nach Delete: `npx tsc --noEmit` (faengt verwaiste Imports) · `npx vitest run dispatch` · `npm run check:knip -- --ratchet` · `npm run check:component-set -- --ratchet` · **Voll-Smoke** (s. §8).

---

## 8. Gate + geordnete Build-Schritte (Folge-Session)

**Gate (alle drei noetig, bevor der destruktive Cutover startet):**
1. ✅ P2d-4 auf staging (#2322 gemergt 10:45Z).
2. ⏳ **Gruener Voll-?v2-Smoke auf staging** (post-deploy) — `scripts/smoke-p2d4-sidebar.mjs` (BASE_URL default staging) + die P2d-4-PR-Checkliste (Sidebar sticky, BKAT kein Auto-Fire, Cardentity nicht real abrufen, Personen-Panel-Save, responsive). Lokaler Smoke war gruen (P2d-4-PR).
3. ⏳ **Aaron-Freigabe** (HIGH-STAKES: loescht die Phasen-Maschinerie).

**Build-Schritte (eigener Branch off dann-staging):**
1. Re-Run §7 gegen dann-aktuelles staging (Liste ist Vorlage, kein Freibrief).
2. `page.tsx`-Chirurgie (§6) — v2 wird Default.
3. DELETE-Liste (§3) Datei fuer Datei (KEIN `rm _phases/*`-Glob — gemischt!).
4. Folge-Edits (§5).
5. Gates (tsc/vitest/knip/component-set) + Voll-Smoke (Default-Pfad ist jetzt v2, ohne `?v2`).
6. PR `--base staging`, 7-Punkt-Audit, **nicht selbst mergen**.

**Danach (P4, separat):** Kunden-Flowlink auf `lead-erfassung` umziehen + token-confirm/clear (§8b) + i18n; die 4 deferred Minor-Gaps (Gruene-Karte/imagin-lackfarbe/checkEmailIsSv/kunde-Geocoding) schliessen-oder-bewusst-droppen.

---

## 9. Fazit

Der Reader-Sweep #2287 ist post-P2d-4 vollstaendig aufgeloest: **0 offene COND**, Parity-Gate **gruen**, closed-set bestaetigt. 2 Files wechseln DELETE→KEEP, 1 wird KEEP+EDIT, SidebarStubs + disqualifiziereLead wechseln COND→DELETE, 5 neue v2-Files sind KEEP. Der Cutover ist **technisch ready**; es fehlt nur der staging-Smoke + die Freigabe. Build = Folge-Session (gated §8).
