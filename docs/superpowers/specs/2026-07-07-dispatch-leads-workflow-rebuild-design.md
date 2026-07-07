# Dispatch-Leads-Detail — Workflow-Rebuild (Design-Spec)

**Datum:** 2026-07-07 · **Branch:** `kitta/dispatch-leads-workflow-rebuild` (off staging)
**Status:** Foundation-Spec — Aaron hat den *Konzept*-Brainstorm freigegeben („ultrathink dann mach das" + Weichen „Workflow-driven" / „Detail-Ansicht zuerst"). Diese Spec grundiert das Konzept am **echten Datenmodell** und legt den State-Graph konkret fest. Die 2 markierten ENTSCHEIDUNGEN brauchen Aarons Review.

## Problem (Aarons Anforderung, Z.4997)

> „die leads ansicht des dispatches neu aufbaust, es ist alles komplett unübersichtlich … komplett neu aufziehen"

Diagnose der aktuellen `/dispatch/leads/[id]`-Detailansicht:
- **Zwei konkurrierende Status-Systeme** nebeneinander gerendert: `leads.status` (Enum) + `leads.qualifizierungs_phase` (free-string) — als gestapelte Badges ohne Hierarchie.
- **15–19 Panels gleichzeitig** im DOM (Gates + Checkliste + FlowLink-Panel + Status-Stepper + 9 Daten-Tabs + 6 Sidebar-Widgets), alle 7 Dispatcher-Jobs auf einem Screen ohne Priorisierung.
- **FlowLink-Info an 3 Stellen** (Listen-Badge, `DispatchFlowlinkPanel`, `DispatchStatusPanel`-Stepper). Gates-Panel + Checkliste zeigen beide „was fehlt".
- Kein Indikator, in **welchem Workflow-Schritt** ein Lead steckt und was als Nächstes zu tun ist.

## Ziel (freigegebenes Konzept)

**Workflow-driven, Detail-Ansicht zuerst.** Ein einziger **abgeleiteter Workflow-Zustand** ersetzt die zwei konkurrierenden Status-Systeme visuell (die DB-Felder bleiben unangetastet — rein abgeleitet). Pro Zustand **eine prominente Next-Best-Action** (Hero). Der Rest (Daten-Tabs, Tools) wird nachrangig + progressiv. FlowLink nur noch an einer Stelle.

## Reales Datenmodell (verifiziert file:line)

Loader `src/app/dispatch/leads/[id]/page.tsx`:
- `lead` = `leads.select('*')` — alle Spalten. Relevante Felder: `status` (Enum: `neu|rueckruf|quali-offen|flow-gesendet|umgewandelt|umgewandelt-sv|disqualifiziert|kalt`), `qualifizierungs_phase` (free-string), `disqualifiziert` (bool), `sa_unterschrieben` (bool, Z.138), `rueckruf_geplant_am` (ts|null, Spiegel offener `admin_termine`-Rückrufe), `letzter_anruf_status` (`erreicht`|`nicht_erreicht`|null), `anruf_versuche` (int).
- `aktiverSvTermin` (Z.80) = `{ status: 'reserviert'|'bestaetigt'|'gegenvorschlag'|'abgelehnt', sv_vorname, sv_nachname, start_zeit, … } | null`.
- `flowLinks[]` (Z.119, newest-first) = `{ gesendet_am, geoeffnet_am, abgeschlossen_am, fall_id, gesendet_anzahl, status, … }`. **Der jüngste (`[0]`) ist maßgeblich.**
- `computeQualificationStatus(lead, aktiverSvTermin)` (`_lib/qualification-engine.ts`) = **kanonische** Qualifizierungs-Logik (Q1–Q8, `allComplete`, `canSendFlowLink`, `completedCount`, `disqualifiziert`). **Q5 = SV-Termin reserviert/bestätigt ist eine der 8 Bedingungen** → `canSendFlowLink` erfordert einen SV-Termin. **Der Rebuild erfindet Qualifizierung NICHT neu — er konsumiert diese Engine.**

Felder die **NICHT existieren** (nicht annehmen): `kontaktiert_am`, `rueckruf_am`, `rueckruf_gewuenscht`, `nicht_erreicht`-Bool, `ausgefuellt_am`. Kontakt-Signal = `qualifizierungs_phase`/`letzter_anruf_status`; Rückruf-SoT = `admin_termine` (gespiegelt in `rueckruf_geplant_am`).

## Kern: `deriveLeadWorkflowState` (Phase-1-Foundation)

Reine Funktion, `src/app/dispatch/leads/[id]/_lib/deriveLeadWorkflowState.ts`:

```ts
type LeadWorkflowState =
  | 'neu' | 'qualifizieren' | 'sv_zuweisen' | 'flowlink_senden'
  | 'nachfassen' | 'warten' | 'rueckruf' | 'terminal'

deriveLeadWorkflowState(lead, aktiverTermin, flowlink /* jüngster|null */, now?):
  { state: LeadWorkflowState, qual: QualificationResult }
```

Ableitung (Priorität, **first-match-wins** — via `computeQualificationStatus` intern):

1. **`terminal`** — `sa_unterschrieben` OR `flowlink.fall_id` OR `flowlink.abgeschlossen_am` OR `status∈{umgewandelt,umgewandelt-sv,disqualifiziert,kalt}` OR `qual.disqualifiziert` OR `qualifizierungs_phase∈{konvertiert,abgeschlossen,kalt}`. → Read-only-Zusammenfassung.
2. **`warten`** — `flowlink.geoeffnet_am != null && flowlink.abgeschlossen_am == null`. Kunde hat geöffnet, füllt aus → leichtes Nudge.
3. **`nachfassen`** — `flowlink.gesendet_am != null && flowlink.geoeffnet_am == null`. Gesendet, nicht geöffnet → erneut senden / anrufen (Alter im Hero).
4. **`rueckruf`** — `rueckruf_geplant_am != null` OR `letzter_anruf_status === 'nicht_erreicht'`. Telefon-Track (nur erreicht, wenn KEIN aktiver FlowLink — Late-Funnel-Zustände 2/3 gehen vor). → Rückruf: Zeit + Anrufen.
5. **`flowlink_senden`** — `qual.canSendFlowLink && (flowlink == null || flowlink.gesendet_am == null)`. Alle 8 Gates (inkl. Q5-Termin) erfüllt, Link noch nicht raus → FlowLink senden.
6. **`sv_zuweisen`** — `!qual.q5_svTermin && (q1..q4,q6,q7,q8 alle true)`. Einzige Lücke ist der SV-Termin → SV zuweisen (fokussierter SvDispatchPanel). **[validiert: Q5 ist FlowLink-Voraussetzung → SV-Zuweisung kommt VOR FlowLink-Versand]**
7. **`qualifizieren`** — Kontakt hergestellt (`qualifizierungs_phase∈{erstkontakt,in-qualifizierung,gegner-daten,flow-versendet,sa-ausstehend}` OR `letzter_anruf_status==='erreicht'` OR `status==='quali-offen'` OR `qual.completedCount > 0`), aber noch nicht SV-reif → Pflicht-Quali abschließen.
8. **`neu`** — Default, kein Kontakt.

**ENTSCHEIDUNG D1 (Review):** `rueckruf`-Priorität = **nach** den Late-Funnel-FlowLink-Zuständen (wenn ein Link offen/gesendet ist, jage den Link, nicht das Telefon), aber **vor** den Quali-Zuständen. Alternativ könnte ein geplanter Rückruf (`rueckruf_geplant_am`) *immer* Vorrang haben (zeitgebunden). Vorschlag: aktuelle Ordnung.

**ENTSCHEIDUNG D2 (Review):** `terminal` behandelt `flowlink.abgeschlossen_am` (SA abgeschickt) als „fertig". Falls Dispatch nach SA-Abschluss noch eine Aktion hat (z.B. Fall-Übergabe prüfen), wäre ein eigener Zustand `konvertiert-pruefen` nötig. Vorschlag: als `terminal` (Read-only) behandeln.

## Phasierung (jede Etappe lauffähig)

- **Phase 1 (DIESE Spec, kollisionsfrei):** `deriveLeadWorkflowState` (rein, TDD, NEUES File `_lib/`) + Test-Suite (= ausführbare Spec des State-Graphs). Berührt **keine** geteilten Files. Verdrahtung in die Shell = Phase 1b.
- **Phase 1b (kollisions-sequenziert):** Neue Shell (`WorkflowLeadShell`): Header + ein Zustands-Badge + Pipeline-Schiene + Next-Best-Action-Hero, **re-orchestriert bestehende Panels** (kein Datenverlust). Präsentations-Meta (Labels/Hero-Copy, deutsche Umlaute) als Konstante. Verdrahtung in `DispatchLeadForm.tsx` / `page.tsx` — **wartet auf aar-956/endzustand-Sequenzierung** (s.u.).
- **Phase 2:** progressive Daten-Sektionen + Tools-Neuordnung, FlowLink-Konsolidierung (die 3 Stellen → 1).
- **Phase 3:** `SvDispatchPanel`-Split (920 Z.) + Feinschliff.

## Koordination / Kollision (WICHTIG)

`/dispatch/leads/[id]` ist eine **heiße Domäne**: aktive Sessions `kitta/aar-956-embed-reservierung-rueckruf` (×3, berühren Rückruf/Termin-Reconciliation — `RueckrufTerminPanel`, `ladeLeadTerminGutachter`) + `kitta/endzustand-abschluss-konvergenz` (berührt Terminal-/Konversions-States — direkt überlappend mit meiner `terminal`-Ableitung + den Status-Systemen). **Deshalb baut Phase 1 NUR die kollisionsfreie reine Funktion** (neues File, kein Anfassen geteilter Files). Phase 1b (Shell-Verdrahtung) wird **nach** dem Settling dieser Branches sequenziert, damit die Status-Feld-Semantik stabil ist, bevor der State-Graph darauf verdrahtet wird.

## Testing (TDD)

`deriveLeadWorkflowState.test.ts` — je Zustand mind. 1 Case + Prioritäts-Kollisionen (terminal schlägt alles; warten schlägt rueckruf; sv_zuweisen wenn nur Q5 fehlt; flowlink_senden wenn allComplete + kein Link; neu vs qualifizieren). Fixtures = reale Feldnamen. Kein Netz, keine DB.

## Nicht-Ziele (Phase 1)
- Liste/Kanban (`/dispatch/leads`) — Detail-Ansicht zuerst (Aaron-Weiche).
- Server-Actions / DDL — keine. Die Funktion ist rein abgeleitet.
- Panel-Löschungen — Phase 2+ (Phase 1b re-orchestriert, löscht nicht).

## Global Constraints
Umlaute in UI-Strings (Phase 1b Labels/Hero). Design-Tokens/Status-Registry für Badges (Phase 1b). Result-Pattern falls Phase-2-Actions. GeoJSON n/a. `deriveLeadWorkflowState` ist rein — keine Seiteneffekte, kein `Date.now()` ohne injizierbaren `now`-Parameter (Testbarkeit).
