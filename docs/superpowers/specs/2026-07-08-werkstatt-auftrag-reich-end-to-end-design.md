# Werkstatt-Auftrag reich end-to-end (Flow → Auftrag) — Design

**Datum:** 2026-07-08
**Kontext:** Aaron 07.07. beim Prüfen der Werkstatt-Aufträge auf prod: „kaum Info drin, kein Fahrzeug, Vermittlung noch offen, nicht simultan zum Makler, trocken verglichen schlicht leer." Kern-Erkenntnis: **ein Werkstatt-Auftrag ist nur so reich wie der Flow, der ihn erzeugt.**

## 1. Ist-Analyse (verifiziert gg Code + Prod-DB)

Die View `v_werkstatt_auftrag` ist bereits **reich** (joint vehicles / kunde_name / gutachter_termine / reparatur_termine / gutachten inkl. Reparaturkosten+Minderwert+Restwert / werkstatt_provisionen). Die Zeilen sind trotzdem leer, weil (a) die UI `kunde_name` nicht zeigte (gefixt) und (b) die einzigen Werkstatt-Claims auf prod Früh-Stubs sind (0 Fahrzeug, 5/7 vermittlung_status='offen'). Der tiefere Grund liegt im **Flow**:

| Abrechnungsweg | Fahrzeug | Schaden | Gutachten | Werkstatt gebunden | Reparatur-Wunschtermin |
|---|---|---|---|---|---|
| **Selbstzahler** | ✅ Flow | ✅ Flow | ✗ (partieller Claim) | ✅ im Flow (`FlowWerkstattStep` → `waehleWerkstattFlow`) | ⚠️ nur Portal später |
| **Haftpflicht** | ✅ Flow | ✅ Flow | ✅ SV | ⚠️ post-SV (Dispatcher, nicht Flow) | ⚠️ Portal, wenn WS zugewiesen |
| **Kasko** | ✅ erfasst | ✅ erfasst | ✗ | ❌ gar nicht | ❌ gar nicht |

**Zwei Lücken:**
1. **Reparatur-Wunschtermin ≠ Besichtigungs-Wunschtermin.** Der Flow-`leads.wunschtermin` (`speichereBesichtigungsortFlow`) ist SV-Besichtigungs-orientiert. Der echte Reparatur-Wunschtermin (`schlageReparaturTerminVorPortal` → `reparatur_termine` status='angefragt') wird erst **später im Kunde-Portal** gesetzt → frischer Selbstzahler-Auftrag zeigt „Termin: –".
2. **Kasko ist eine Sackgasse.** `speichereQualiFlow(..., ueberEigeneVersicherung=true)` disqualifiziert (→ `KaskoEndansicht` „melde bei deiner Versicherung"). Fahrzeug/Schaden werden erfasst und **verworfen** — kein Claim, keine Werkstatt, kein Termin.

## 2. Entscheidungen (Aaron 07.07.)

1. **Kasko-Reparatur-Pfad = Direkt-Reparatur wie Selbstzahler** (Werkstatt + Reparatur-Termin, **kein** Gutachten). Kasko-Kunden, die reparieren wollen, werden nicht mehr hart disqualifiziert.
2. **Reparatur-Wunschtermin = im Flow, direkt nach dem Werkstatt-Pick** (nicht nur Portal) → erzeugt sofort die `reparatur_termine`-Zeile.

## 3. Ziel-Design

### 3.1 Kasko + Selbstzahler = gemeinsamer Direct-Reparatur-Pfad
`quali → Fahrzeug/Schaden → Werkstatt-Pick → Reparatur-Wunschtermin → partieller Claim` (`abrechnungsweg ∈ {selbstzahler, kasko}`, `reparaturwunsch='reparatur'`, kein SV/SA). Kasko-Änderung: nach der „eigene Versicherung?"-Frage wird zusätzlich „möchtest du reparieren lassen?" gefragt — bei Ja läuft dieselbe Werkstatt-Strecke wie Selbstzahler, nur `abrechnungsweg='kasko'`. `KaskoEndansicht` bleibt nur für „nein, ich melde selbst".

### 3.2 Reparatur-Wunschtermin-Flow-Schritt
Nach `FlowWerkstattStep`/`waehleWerkstattFlow` ein Schritt „Wann soll repariert werden?" → `WunschterminPicker` → eine Aktion erzeugt eine `reparatur_termine`-Zeile (`status='angefragt'`, `werkstatt_id`, `wunschtermin` via `resolveWunschterminIso` Berlin→UTC). Der Werkstatt-Auftrag zeigt den Termin ab Sekunde eins; die Werkstatt bestätigt/ruft an/lehnt ab (bestehender SP2-Lifecycle). Sauber getrennt vom SV-Besichtigungs-Wunschtermin.

### 3.3 Werkstatt-Auftrag-Sicht — **GEBAUT** (`kitta/werkstatt-auftraege-rollen-zeilen`, `00fb051ed`)
Rollen-spezifische Zeilen (Reparatur: `Kunde|Fahrzeug|Schaden|Termin|Status`; Vermittlung: `Kunde|Quelle|Vermittelt-am|Provision`) + Kunde überall + graceful Früh-Status. Zeigt den Reparatur-Termin automatisch, sobald 3.2 ihn erzeugt. Keine weitere View-Arbeit nötig.

### 3.4 KVA-first für Direct-Reparatur (Aaron 07.07.: „die Werkstatt stellt als erstes immer einen KVA aus")
Bei Selbstzahler/Kasko (kein SV-Gutachten) ist der **erste Werkstatt-Schritt immer ein Kostenvoranschlag (KVA)**. Der Auftrag führt einen **KVA-Status**: `KVA benötigt → KVA erstellt (€netto/brutto) → freigegeben → Reparatur`. So weiß die Werkstatt sofort „nächster Schritt: KVA erstellen", und der Auftrag ist auch ohne Gutachten reich (Kostenbasis = KVA statt Gutachten).

**Bestehende Infra (NICHT neu bauen):** `/werkstatt/kva` (Upload→OCR→Review→Fertig), `extrahiereKvaAusBase64` (Claude-Vision-OCR liest netto/brutto+Fahrzeug+Halter), Felder `claims.kostenvoranschlag_netto/brutto` (Snapshot vom Lead/GFA — bewusst getrennt vom SV-`schadens_hoehe_netto`), PDF in `fall-dokumente`, `WerkstattKvaSection` (Anzeige + „Reparatur freigeben" → `reparatur_freigegeben_am`), `repairs`-Tabelle (Reparatur-Lifecycle: geplant/in_arbeit/abgeschlossen + `tatsaechliche_kosten`).

**Lücke:** das heutige `/werkstatt/kva` ist **Walk-in-Intake** (Werkstatt-first: KVA → `erstelleWerkstattLeadAusKva` erzeugt einen NEUEN GFA/Lead). Für einen **bestehenden** Auftrag (Kunde-first, via Flow/Finder/QR referred) fehlt „KVA für DIESEN Claim erstellen". Und `v_werkstatt_auftrag` projiziert `kostenvoranschlag_*` nicht → der Auftrag kann den KVA-Status nicht zeigen.

**Zu bauen (überwiegend meine View-Lane):**
- **View:** `c.kostenvoranschlag_netto/brutto` + `c.reparatur_freigegeben_am` an `v_werkstatt_auftrag` anhängen (DDL via Plugin, CREATE-OR-REPLACE=append ans Ende) + queries.ts Type/Map.
- **Auftrag-Sicht:** KVA-Status im Detail + Row (Reparatur-Segment): „KVA benötigt" (kostenvoranschlag null + Direct-Reparatur) / „KVA: €X · freigegeben?" (gesetzt) + Aktion **„Kostenvoranschlag erstellen"** → per-Auftrag-KVA.
- **Per-Auftrag-KVA-Aktion (reuse OCR):** `erstelleKvaFuerAuftrag(claimId, { netto, brutto, pdfBase64? })` → UPDATE `claims.kostenvoranschlag_*` am BESTEHENDEN Claim + PDF nach `fall-dokumente/faelle/{claimId}/`; reuse `extrahiereKvaAusBase64` + `WerkstattKvaFlow` (optionaler `claimId`-Prop statt Lead-Erzeugung). Ownership: RLS/`is_werkstatt_for_claim`.

## 4. Komponenten + Lane-Zuordnung

| Teil | Lane | Status |
|---|---|---|
| Kasko-Quali-Änderung (nicht mehr disqualifizieren, „reparieren?"-Abzweig) | **aar-956** (Flow) | koordinieren |
| Reparatur-Wunschtermin-Flow-Schritt + `reparatur_termine`-Erzeugung im Flow | **aar-956** (Flow) | koordinieren |
| Rollen-spezifische Auftrags-Zeilen + Detail + Kunde | **meine** (View) | ✅ gebaut |
| `abrechnungsweg='kasko'` an `convertLeadToClaim` durchreichen | shared (`convert-lead-to-claim.ts`) | additiv |
| `kostenvoranschlag_*` + `reparatur_freigegeben_am` an `v_werkstatt_auftrag` | **meine** (View, DDL via Plugin) | zu bauen |
| KVA-Status + „KVA erstellen"-Aktion im Auftrag (per-Claim `erstelleKvaFuerAuftrag`, reuse OCR/WerkstattKvaFlow) | **meine** (View) | zu bauen |

## 5. Im Build zu nageln

1. **`reparatur_termine`-Erzeugung aus dem Flow (kein Login):** die Portal-Aktion `schlageReparaturTerminVorPortal` nutzt die Kunde-Session + RLS (`reparatur_termine_kunde_insert`). Der Flow läuft über einen **Token** (kein User) → braucht eine token-scoped Variante (`schlageReparaturTerminVorFlow(token, wunschtermin)`) mit Ownership-Check über den Flow-Token (service-role + Lead/Claim-Bindung), NICHT die Kunde-RLS-Policy.
2. **Kasko-Claim-Erzeugung:** analog `erzeugeSelbstzahlerClaim` einen Pfad, der `abrechnungsweg='kasko'` setzt (partieller Claim, kein SV). `convertLeadToClaim` trägt `abrechnungsweg` bereits (verifiziert).
3. **Kasko-Quali-UX:** exakte Platzierung der „reparieren?"-Frage nach der eigene-Versicherung-Frage.
4. **Flow-Schritt-Ort:** eigener Step vs. inline nach dem Werkstatt-Pick (aar-956 entscheidet im Bau).
5. **KVA-Status als Phase vs. eigenes Feld:** „KVA benötigt/erstellt/freigegeben" in die `werkstattAuftragPhase`-Logik integrieren ODER als separate KVA-Badge-Dimension. Empfehlung: eigene KVA-Zeile/Badge (die Phase bleibt operativ), Status abgeleitet aus `kostenvoranschlag_netto/brutto` (null=benötigt) + `reparatur_freigegeben_am` (gesetzt=freigegeben).
6. **KVA-Attach an bestehenden Claim:** die heutige `erstelleWerkstattLeadAusKva` erzeugt einen NEUEN Lead — für den Auftrag-Pfad NICHT wiederverwenden; neue `erstelleKvaFuerAuftrag(claimId,…)` schreibt am bestehenden Claim (kein neuer Lead).

## 6. Out of Scope

- **Haftpflicht-Werkstatt-im-Flow** — bleibt post-SV (Dispatcher/Portal); die Reparatur-Termin-Portal-Strecke greift dort weiter.
- **Kasko mit Gutachten** — bewusst verworfen (Aaron: direkt).
- **`/werkstatt/anfragen` „bearbeiten + Flowlink" zusammenführen** — eigener Folge-Strang (Aaron „nimm bitte mit auf"), siehe Coordination-Marker.
