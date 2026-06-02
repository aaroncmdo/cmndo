# Design — P2d-4: v2-Dispatcher-Sidebar + Vollständigkeit (Cutover-Blocker)

**Stand:** 2026-06-03 · **Branch:** `kitta/dispatch-config-unify-p2d4-sidebar` (off staging mit #2304)
**Memory:** `project_dispatch_config_unify` · **Entscheidungs-Quelle:** Brainstorm + impeccable-Layout-Walkthrough (Aaron, 02./03.06.)

---

## 0. Warum

Der P3b-Cutover (flacher `DispatchLeadForm` wird Default, Legacy-`DispatchShell`/Phasen-Maschinerie gelöscht) ist **bewusst hinter P2d-4 gestellt** (Aaron 02.06.): der Cutover entfernt zwangsläufig die Legacy-Dispatcher-Sidebar (hängt am `useDispatchPhase`-Kontext) — und eine Vollständigkeits-Prüfung des v2-Forms fand **3 Dispatcher-Funktionen, die v2 sonst still verliert**. P2d-4 schließt diese Lücken, damit der Cutover **keine Funktion kostet**.

Disqualifizieren bleibt das v2-GatesPanel-Flag (P2c, kein Sidebar-Modal). Rückruf/Termine/Gesprächsleitfaden/KundenMatch kommen über die neue Sidebar zurück.

---

## 1. Was v2 heute schon kann (Baseline, kein Scope)

`lead-erfassung`-Config (63 Felder / 9 Sektionen: Kontakt, Schaden, Unfall+Gegner, Fahrzeug+Halter, Schuld, Service/Kanzlei, Termin, Vollmacht, Status) + Panels: SvDispatchPanel (termin), Versicherer-/Place-/Kennzeichen-Overrides, Unfallskizze + Zeugen (Section-Panels), Wunschtag-Pills, Checkliste, DokumenteAnfordernCard, Flowlink-Versand (P2g), Status-Tracking (P2h), SA-Banner (3a), Derive-Hook (polizeibericht_pflicht/unfallort_kategorie, #2304). GatesPanel: Warn-Badges + Vollständigkeit + manuelles `disqualifiziert`-Flag.

---

## 2. Lücken, die P2d-4 schließt

| # | Legacy-Tool | Funktion | v2-Heimat (neu) |
|---|---|---|---|
| ★1 | `_phases/Phase1PersonenForm` (AAR-358) | Bei `personenschaden_flag=true`: verletzte Personen erfassen (Name/Geburtsdatum/Verletzungsart/Insasse) → Tabelle `personenschaden_personen` | **Section-Panel in *Schaden*** (Muster = ZeugenKontakteEditor) |
| ★2 | `_phases/BkatAnalysePanel` (AAR-504/505) | KI-Unfallart-Analyse (Polizeibericht-OCR/LLM auf `unfallhergang`) → Top-3 TBNR + Unfallart + Schuld-Einschätzung | **Section-Panel in *Schaden*** (bei schadentyp/unfallhergang) |
| ★3 | `ExitSkript` | Disqualifikations-Gesprächsskript (inline bei eigenverantwortung) | In die **Gesprächshilfe** gefaltet (eigene „Disqualifikation"-Sektion) |
| — | Legacy-Sidebar (Timer/Gesprächshilfe/Einwände/KundenMatch/Rückruf/Termine) | Telefon-Call-Tooling | **Neue sticky v2-Sidebar** (s. §4) |

---

## 3. Layout (impeccable: product register)

Sticky 2-Spalten, gespiegelt aus der Legacy-`DispatchShell`, aber **ohne `DispatchPhaseProvider`**:

```
┌─ MAIN (flex-1, max-w-3xl, scrollt) ─────┬─ ASIDE (sticky ~340px) ─┐
│ Titel + SaveIndicator                    │ bg-claimondo-bg, border-l│
│ [SA-Banner] [GatesPanel]                 │ ⏱ Timer (Leiste)         │
│ ▸ Kontakt                                │ 📖 Gesprächshilfe (auf)  │
│ ▸ Schaden  └ Personen(★1) └ BKAT(★2)     │    +Disqualifikation(★3) │
│ ▸ Unfall (+ Unfallskizze/Zeugen)         │ ▸ Einwände   (collapsed) │
│ ▸ Fahrzeug · Schuld · Service · Termin   │ ▸ KundenMatch(collapsed) │
│ [Checkliste][DokAnfordern]               │ ▸ Rückruf    (collapsed) │
│ [Flowlink][Status]                       │ ▸ Termine    (collapsed) │
└──────────────────────────────────────────┴──────────────────────────┘
< lg: einspaltig — Sidebar = EIN collapsed „☎ Call-Tools"-Block ganz oben
```

- Sidebar = zweite Neutral-Ebene (`bg-claimondo-bg`), `lg:sticky lg:top-…` → Script bleibt beim Scrollen sichtbar.
- **Collapse-Defaults:** Gesprächshilfe offen (primäres Aid), Rest collapsed → keine 6-Panel-Wand, ein Klick weg.
- Responsive = strukturell (kein fluid type): unter `lg:` klappt die Sidebar zu einem collapsed Block oben (Script erreichbar, schiebt den Form nicht weg).
- Farben/Tokens: nur Claimondo-Tokens (`bg-claimondo-*`, semantic amber/emerald), keine inline-hex; Komponenten-Set-Policy beachten (primitives/shared, kein neues handrolled Button/Card).

---

## 4. Komponenten

**Neu (`_v2/`):**
- `DispatchSidebar.tsx` — komponiert die Widgets; Props: `lead` (Snapshot) + `leadId` + live Flag-`values` (für die Closing-Sätze). Rendert das sticky `<aside>` + den responsive collapsed-Block.
- `DispatchGespraechshilfe.tsx` — **de-phase-context**: zeigt **alle** Script-Sektionen als Akkordeon (statt `[currentPhase]`); flag-getriebene Closing-Sätze werden **immer** ausgewertet (aus live `values`); plus die gefaltete Disqualifikations-Sektion (★3).
- `DispatchEinwandKarten.tsx` — zeigt **alle** Einwand-Karten (kein Phasen-Filter).
- Section-Panels (über die bestehende `dispatch-section-panels.tsx`-Mechanik, Sektion *Schaden*): **Personen-Editor (★1)** conditional `personenschaden_flag` + **BKAT-Analyse (★2)**.

**Direkt wiederverwendet (schon prop-/leadId-basiert, brauchen den Phasen-Kontext NICHT):**
`GespraechsleitfadenTimer`, `KundenMatchCard`, `RueckrufTerminPanel`, `TerminListeClient`, sowie die Personen-Actions (`listPersonenForLead`/`upsertPersonForLead`/`deletePersonForLead`) und `bkat-inference`-Actions (`analyzeBkatForLead`/`saveBkatUnfallart`).

**Shared Data (`_lib/`):**
- `gespraech-content.ts` — `GESPRAECHSHILFEN` (phasen-frei: geordnetes Array von Script-Sektionen) + `EINWAENDE` + die Disqualifikations-Skripte. Pure, kein `'use server'` → exportierbar. **Eine Quelle**; die Legacy-`SidebarStubs` wird darauf umgebogen (Inline-Dup raus), damit v2 + Legacy bis zum Cutover nicht driften.

---

## 5. De-phase-context-Logik

Das `currentPhase`-Keying existiert nur in `GespraechshilfePanel` (zeigt 1 von 6 Phasen-Skripten) + `EinwandKarten` (filtert nach Phase). v2 = „alles sichtbar":
- **Gesprächshilfe:** alle 6 Sektionen als Akkordeon (Dispatcher navigiert frei). Die Phase-5-Closing-Sätze sind **bereits flag-getrieben** (`schaden_sichtbar`/`zeugen`/`mietwagen_flag`/`personenschaden_flag`/`polizei_vor_ort`) → werden immer (aus live `values`) ausgewertet, kein Phase-Gate.
- **Einwände:** alle Karten sichtbar (Phasen-Array entfällt; „Dauerbrenner" ggf. optisch hervorheben).
- **ExitSkript (★3):** als zusätzliche „Disqualifikation"-Sektion in der Gesprächshilfe.

---

## 6. Datenfluss

`page.tsx` → `lead` (vorhanden) → `DispatchLeadForm` reicht `lead` + live `values` an `DispatchSidebar`. Closing-Sätze + die conditional-Panels reagieren **live** auf Form-Edits (Dispatcher hakt „Zeugen: ja" → Zeugen-Closing-Satz erscheint; setzt `personenschaden_flag` → Personen-Panel erscheint). Panels (Timer/Rückruf/Termine/KundenMatch/Personen/BKAT) lesen `lead`-Snapshot + leadId und self-saven über ihre eigenen Actions (kein Form-Autosave).

---

## 7. Nicht-Scope

- **Disqualifizieren-Modal** (strukturierter Grund + Timeline) — bleibt das GatesPanel-Flag (P2c). Kein doppelter Disq-Mechanismus.
- Der eigentliche **P3b-Cutover** (Delete der Phasen-Maschinerie) ist ein **Folge-Ticket** nach P2d-4 (Reader-Sweep #2287 als Vorlage; Delete-Liste behält die neuen `_v2`-Sidebar-Files + `_lib/gespraech-content.ts` + die wiederverwendeten Panels).

---

## 8. Testing

- `_lib/gespraech-content.ts` = pure Data → Shape-/Vollständigkeits-Test (alle Sektionen vorhanden, EINWAENDE non-empty).
- De-phase-context-Komponenten überwiegend presentational → tsc + Render-Smoke.
- **Voll-Smoke (`?v2`, Dispatcher):** Sidebar sichtbar + sticky beim Scrollen; alle Script-Sektionen + Einwände aufklappbar; Timer läuft; KundenMatch/Rückruf/Termine funktionieren; Personen-Panel erscheint bei `personenschaden_flag` + speichert in `personenschaden_personen`; BKAT-Analyse läuft + übernimmt Unfallart; responsive (mobile = Call-Tools-Block oben).
- Volle Gates vor PR: `tsc --noEmit`, `vitest`, `check:token-audit`, `check:component-set --ratchet`, `check:knip --ratchet`. (Worktree: `npm dedupe` gegen false @types/react; `package-lock.json` NICHT committen.)

---

## 9. Risiken / offen

- **Sidebar-Dichte:** 6 Widgets — Collapse-Defaults (nur Gesprächshilfe offen) entschärfen; im Smoke prüfen ob die sticky-Höhe + Scroll der Sidebar auf 1080p funktioniert.
- **Personen-RLS:** `personenschaden_personen`-Writes aus dem v2-Kontext (leadId) müssen die gleiche RLS passieren wie im Legacy-Phase1 (sollte, da gleiche Actions) — im Smoke verifizieren.
- **BKAT-Kosten:** `analyzeBkatForLead` ist ein LLM/OCR-Call → manuell getriggert (Button), nicht auto-fire (analog Cardentity-Lehre).
- **Transitions-Dup:** bis zum Cutover existieren Legacy-Sidebar (DispatchShell) + v2-Sidebar parallel; `gespraech-content.ts` als Single-Source verhindert Content-Drift.
