# Werkstatt im FlowLink (Haftpflicht) — Kohärenz + Reparaturtermin-Verhandlung — Design

> Macht die bereits ~90% gebaute Werkstatt-/Reparaturtermin-Maschinerie für **Haftpflicht** kohärent
> und schließt die Kunde-Wunsch-vs-Werkstatt-final-Lücke. **Kein From-Scratch-Build** — die Bausteine
> (`reparatur_termine`-Lifecycle, `v_werkstatt_auftrag`, kanonischer Vermittlungs-Setter, Finder) leben
> auf `staging`. Diese Spec = gezielte Erweiterung + Haftpflicht-Verdrahtung + empirische Bug-Verifikation.

**Datum:** 2026-07-10 · **Branch:** `kitta/werkstatt-flowlink-haftpflicht` (off `staging`, HEAD `e0e9a4a9f`) ·
**Herkunft:** Handoff `HANDOFF-werkstatt-flowlink-haftpflicht-codesign` (Session 35660476) + Co-Design mit Aaron.

---

## 1. Ziel, Kontext & verifizierter IST-Stand

### 1.1 Aarons Anforderung (5 Punkte + 3 Verfeinerungen)

Bei einem **Haftpflichtschaden** im FlowLink:
1. Werkstatt **mitgegeben** → im FlowLink **angeben + zeigen**.
2. **Wir vermitteln** → Werkstattfinder findet eine **nahe dem Besichtigungsort**.
3. Im **Auftrag** schlägt die Werkstatt einen **Reparaturtermin** vor.
4. Kunde darf **überspringen** → **Claim-Reminder** (KB/Dispatch/**SV**), dass vermittelt werden muss.
5. Werkstatt schon im FlowLink → zeigen + Auftrag-Terminvorschlag.

**Verfeinerungen (Co-Design 2026-07-10):**
- **V1 (§2):** Kunde gibt Wunschtermin; **den finalen Termin gibt nur die Werkstatt** (Kalender-Hoheit).
  Modell: **Nur bei Abweichung braucht's Kunde-OK** — bestätigt die Werkstatt den Wunsch 1:1 → sofort
  verbindlich; weicht sie ab → Kunde muss reagieren.
- **V2 (§2):** Bei „passt nicht" zusätzlich ein **direkter Anruf-Button** (Kunde→Werkstatt, `tel:`) **und**
  eine **Rückrufbuchung** — **die Werkstatt ruft zurück** (Kunde wählt Wunsch-Rückrufzeit; landet am
  `reparatur_termine`, Werkstatt sieht + wird benachrichtigt; kein Claimondo/Dispatch dazwischen).
- **V3 (§3):** Der Zeitpunkt, wann dem Kunden die Werkstatt-Wahl gezeigt wird, ist **DB-state-driven**
  abzuleiten (nicht hart verdrahtet). Bei Haftpflicht steht Reparatur erst **nach dem SV-Gutachten** an →
  im Flow **leicht** (mitgegebene zeigen / Vermittlungs-Intent / überspringen), Tiefe (Finder-Wahl +
  Wunschtermin) **im Portal nach dem Gutachten**.
- **V4 (§4):** Vermittler-Sicht ist gewollt — aber die **Zuordnung muss korrekt** sein.

### 1.2 Verifizierter IST-Stand (staging-Code + Live-DB `paizkjajbuxxksdoycev`)

> ⚠️ Der ursprüngliche Audit (`AUDIT-werkstatt-flowlink-haftpflicht-kette`) wurde gegen einen **710
> Commits alten** Branch geschrieben und ist in mehreren Punkten überholt. Der folgende Stand ist frisch
> gegen `origin/staging` + DB verifiziert.

**Bereits gebaut & live:**
- **`reparatur_termine`** (Tabelle): `id, claim_id, werkstatt_id, wunschtermin, bestaetigter_termin,
  status, absage_grund, erstellt_von, created_at, updated_at`. CHECK `status IN
  ('angefragt','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert')`. RLS via
  `is_werkstatt_for_claim`.
- **`is_werkstatt_for_claim(p_claim_id)`** (SECURITY DEFINER): gated korrekt auf `claims.werkstatt_id`
  **ODER** `claims.reparatur_werkstatt_id` = eigene Werkstatt (`werkstaetten.user_id = auth.uid()`).
- **`v_werkstatt_auftrag`**: reiche View mit `meine_rolle` (`beide`/`reparateur`/`vermittler`), joint
  aktiven (non-`storniert`) `reparatur_termine` + Gutachten + Provision. WHERE
  `(werkstatt_id OR reparatur_werkstatt_id NOT NULL) AND (is_staff() OR is_werkstatt_for_claim)`.
  (Migration `20260707133441_v_werkstatt_auftrag_rollen_typ.sql`.)
- **Kanonischer Vermittlungs-Setter** `buildZuweisungPatch()` (`src/lib/werkstatt/vermittlung-core.ts:40-54`)
  → setzt atomar `reparatur_werkstatt_id + _zugewiesen_am + _zugewiesen_von + _quelle +
  reparatur_vermittlung_status='vermittelt'`. Genutzt von allen 5 Pfaden via `assignReparaturWerkstatt()`
  (`vermittlung-server.ts:90-110`): Kunde-Finder, Dispatch, KB, SV, Flow/QR.
- **Kanonischer Bedarf-Gate** `brauchtWerkstattVermittlung(row)` (`vermittlung-core.ts:26-33`):
  `reparaturwunsch ∈ {reparatur,fiktiv} && reparatur_werkstatt_id==null && werkstatt_id==null &&
  (reparatur_vermittlung_status ?? 'offen')==='offen'`.
- **Reparaturtermin-Lifecycle** (SP2/SP4, Design `docs/superpowers/specs/2026-07-03-reparatur-termine-lifecycle-design.md`):
  - Kunde schlägt Wunschtermin vor: Flow (`FlowWerkstattStep`) + Portal (`schlageReparaturTerminVorPortal`,
    `kunde/faelle/[id]/reparatur-termin-actions.ts:14`).
  - Werkstatt reagiert (`werkstatt/(shell)/auftraege/actions.ts`): `bestaetigeReparaturtermin(:38,
    akzeptiert optional abweichendes Datum)`, `erbitteRueckruf(:89)`, `lehneReparaturterminAb(:131)`.
  - Phase-Helper `reparaturTerminPhase(status)` (`src/lib/werkstatt/reparatur-termin-phase.ts:1-23`).
  - Kunde-Karte `src/components/kunde/WerkstattCard.tsx` (zeigt Werkstatt + Termin-Status + `VorschlagsUI`).
  - Notify `src/lib/werkstatt/notify-kunde-reparaturtermin.ts` (Email + In-App für bestaetigt/anruf_erbeten/abgelehnt).
- **KVA-Pfad (AV5)** `erstelleKvaFuerAuftrag(:270)`: beim KVA-Upload schlägt die Werkstatt einen Termin
  vor → **schreibt ihn aktuell als `wunschtermin` mit `status='angefragt'`** (`:354-373`).
- **Abrechnungsweg** `resolveAbrechnungsweg()` (`abrechnungsweg.ts:18-29`) →
  `haftpflicht`/`kasko`/`selbstzahler`; `istWerkstattReparaturWeg()` (`:59-66`).
- **Reuse-Bausteine:** `PhoneButton` (`src/components/shared/PhoneButton.tsx`, `variant='card'`,
  `mode='tel'`), `WunschterminPicker` (`src/app/embed/gutachter-finder/_components/`, Berlin-Wandzeit),
  `WerkstattVermittelnCard` (SV/KB/Dispatch-Reminder), `WerkstattFinderCard` (Kunde-Portal-Picker).

**DB-Realität (Prod):** `abrechnungsweg` nur `haftpflicht`(17)/`null`(27) — Selbstzahler/Kasko-Strang
dormant. `operative_status` nur `ersterfassung`/`sv-termin`/`kanzlei-uebergeben`/`abgeschlossen` — **keine
Reparatur-Phase**. `reparatur_vermittlung_status` `offen`(30)/`vermittelt`(14). `reparatur_werkstatt_quelle`
`qr_referral`(7)/`dispatcher`(7)/null. `gutachten` hat `fertiggestellt_am`, `totalschaden`(bool).

### 1.3 Die echten Lücken (nach Grounding)

| # | Lücke | Umfang |
|---|---|---|
| A | **Lifecycle deckt „Werkstatt schlägt abweichenden Termin vor" nicht ab** — nur bestätigen/anrufen/ablehnen. Kein „Kunde-OK bei Abweichung". `wunschtermin` semantisch überladen (Kunde-Wunsch vs. Werkstatt-KVA-Vorschlag). | **groß** (§2 = Herz) |
| B | **Kein direkter Anruf-Button + keine Rückrufbuchung** am Kunde-Termin. | mittel (§2) |
| C | **Reparaturtermin-Vorschlag an KVA-Upload gekoppelt** — Werkstatt kann nicht jederzeit vorschlagen. | klein (§2) |
| D | **Haftpflicht nicht als leichter Flow-Touch verdrahtet**; Portal-Gate `brauchtWerkstattVermittlung` prüft **nicht** Abrechnungsweg/Gutachten/Totalschaden → würde bei Haftpflicht verfrüht/bei Totalschaden fälschlich zeigen. | mittel (§3) |
| E | **Bug A/B: bereits korrekt auf staging** (buildZuweisungPatch + meine_rolle-Segmentierung). Braucht **Verifikation + Regressionstests**, keinen Fix. | klein (§4) |

---

## 2. §2 — Reparaturtermin-Lifecycle-Erweiterung (das Herz)

### 2.1 Semantik-Entwirrung (verbindlich)

- **`wunschtermin`** = **immer** der vom **Kunden** vorgeschlagene Wunsch (nullable — Kunde kann skippen).
- **`bestaetigter_termin`** = der von der **Werkstatt** festgelegte verbindliche/vorgeschlagene Termin.
- **Neu `rueckruf_wunschzeit timestamptz NULL`** = vom Kunden gewünschte **Rückrufzeit** (wenn er „Rückruf
  buchen" wählt). Die Werkstatt ruft zurück.

### 2.2 Neuer Status `werkstatt_vorschlag`

DDL (via Supabase-Plugin, Regel 2): CHECK-Constraint um `'werkstatt_vorschlag'` erweitern; Spalte
`rueckruf_wunschzeit` addieren.

```sql
ALTER TABLE public.reparatur_termine DROP CONSTRAINT reparatur_termine_status_check;
ALTER TABLE public.reparatur_termine ADD CONSTRAINT reparatur_termine_status_check
  CHECK (status IN ('angefragt','werkstatt_vorschlag','bestaetigt','anruf_erbeten','abgelehnt','erledigt','storniert'));
ALTER TABLE public.reparatur_termine ADD COLUMN IF NOT EXISTS rueckruf_wunschzeit timestamptz;
```

`werkstatt_vorschlag` = die Werkstatt hat einen Termin **vorgeschlagen** (abweichend vom Wunsch **oder**
ohne vorherigen Wunsch), **wartet auf Kunde-OK**. `bestaetigter_termin` = der vorgeschlagene Termin (pending).

### 2.3 Zustandsmaschine (Erweiterung)

```
Kunde (Flow/Portal) ──▶ angefragt ─────────────┐
                                                │
   Werkstatt:                                   │
     • „Wunsch bestätigen" (1:1) ───────────────┼──▶ bestaetigt   (bestaetigter_termin = wunschtermin)
     • „Anderen Termin vorschlagen" ────────────┼──▶ werkstatt_vorschlag  (bestaetigter_termin = Werkstatt-Datum)
     • „Anrufen" ───────────────────────────────┼──▶ anruf_erbeten
     • „Ablehnen" (+ Grund) ────────────────────┴──▶ abgelehnt

Werkstatt (ohne Wunsch, jederzeit / KVA) ─────────▶ werkstatt_vorschlag

werkstatt_vorschlag ──┬── Kunde „Passt"          ──▶ bestaetigt
                      ├── Kunde „Passt nicht" +   ──▶ anruf_erbeten  (rueckruf_wunschzeit gesetzt)
                      │     Rückruf buchen
                      └── Kunde „Werkstatt anrufen" (tel:, kein Statuswechsel)

bestaetigt ──▶ erledigt      * ──▶ storniert
```

Keine DB-Übergangs-Matrix (YAGNI) — die UI zeigt nur die im Status gültigen Aktionen; der CHECK auf die
Status-Werte reicht.

### 2.4 Server-Actions

**Werkstatt-Seite** (`src/app/werkstatt/(shell)/auftraege/actions.ts`, `requirePortalAccess(['werkstatt'])`,
RLS-gegated via auth-aware `createClient()`):
- **`bestaetigeReparaturtermin(terminId)`** *(refactor)* — bestätigt den **Wunsch 1:1**:
  `status='bestaetigt'`, `bestaetigter_termin = wunschtermin`. Der frühere optionale Divergenz-Parameter
  entfällt (Divergenz läuft jetzt über `schlageWerkstattTerminVor`). Notify Kunde `bestaetigt`.
- **`schlageWerkstattTerminVor(claimId, terminIso)`** *(neu)* — **entkoppelt von KVA**: findet den aktiven
  `reparatur_termine`-Row des Claims (oder legt einen an, `wunschtermin=null`), setzt
  `status='werkstatt_vorschlag'`, `bestaetigter_termin=terminIso`. Notify Kunde `werkstatt_vorschlag`
  („Werkstatt schlägt Termin vor — bitte bestätigen"). Ownership-Gate via `getWerkstattAuftrag(claimId)`
  (RLS-View), Write via auth-aware Client (RLS-UPDATE hält) bzw. Admin-Client nur nach Ownership-Check
  (analog `erstelleKvaFuerAuftrag`).
- **`erbitteRueckruf(terminId)`** *(unverändert)*, **`lehneReparaturterminAb(terminId, grund?)`** *(unverändert)*.

**Kunde-Seite** (`src/app/kunde/faelle/[id]/reparatur-termin-actions.ts`, RLS via Kunde-Session, oder
token-scoped analog Flow — s. §2.7):
- **`schlageReparaturTerminVorPortal(...)`** *(unverändert)* — Kunde schlägt Wunsch vor (`angefragt`).
- **`akzeptiereWerkstattTermin(terminId)`** *(neu)* — nur aus `werkstatt_vorschlag`: `status='bestaetigt'`
  (`bestaetigter_termin` bleibt der Werkstatt-Vorschlag). Notify **Werkstatt** („Kunde hat bestätigt").
- **`werkstattTerminPasstNicht(terminId, rueckrufWunschzeitIso?)`** *(neu)* — aus `werkstatt_vorschlag`:
  `status='anruf_erbeten'`, `rueckruf_wunschzeit = rueckrufWunschzeitIso ?? null`. Notify **Werkstatt**
  („Kunde bittet um Rückruf" + Wunschzeit).

### 2.5 KVA-Pfad-Bereinigung (§2, Lücke C)

`erstelleKvaFuerAuftrag()` (`auftraege/actions.ts:354-373`) schreibt den Werkstatt-Termin künftig **nicht
mehr** als `wunschtermin`/`angefragt`, sondern ruft intern die **gleiche Kern-Logik** wie
`schlageWerkstattTerminVor` → `status='werkstatt_vorschlag'`, `bestaetigter_termin`. (Extraktion eines
gemeinsamen `upsertWerkstattVorschlag(admin, claimId, werkstattId, terminIso)`-Helpers, um Doppel-Logik zu
vermeiden — 7-Punkt-Audit §3.) Die AV6-Reparaturauftrag-Freigabe akzeptiert den `werkstatt_vorschlag`
implizit als `bestaetigt` (oder der Kunde tut es explizit über `akzeptiereWerkstattTermin`).

### 2.6 Phase-Helper + Notify

- **`reparaturTerminPhase`** (`reparatur-termin-phase.ts`): `werkstatt_vorschlag` ergänzen →
  `{ key:'werkstatt_vorschlag', label:'Werkstatt schlägt Termin vor', ton:'info' }` (kunde-facing). Die
  Werkstatt-Sicht labelt roll-spezifisch („Warte auf Kundenbestätigung"). **Status-Registry-Gate beachten**
  (s. §6): der Badge zieht Farbe aus `src/lib/status/` — `ton` auf einen der 7 Token-Slots mappen, keine
  neue Inline-Farb-Map.
- **`notify-kunde-reparaturtermin.ts`**: Ereignis `werkstatt_vorschlag` ergänzen (Kunde: „Die Werkstatt hat
  einen Termin vorgeschlagen — bitte bestätigen"). Neuer **`notify-werkstatt-reparaturtermin`** (oder
  Erweiterung) für Kunde→Werkstatt-Ereignisse `bestaetigt` (Kunde-OK) + `anruf_erbeten` (Rückrufbitte +
  `rueckruf_wunschzeit`). Alle Notifies **non-fatal** (try/catch, atomarer Statuswechsel bleibt).

### 2.7 Kunde-UI (`src/components/kunde/WerkstattCard.tsx`)

Reaktions-Block ergänzen (Komponenten aus `primitives/*` + `shared/*`, §6):
- **Status `werkstatt_vorschlag`:** Werkstatt-Vorschlag-Datum prominent + zwei Wege:
  - **„Passt"** → `akzeptiereWerkstattTermin`.
  - **„Passt nicht"** → offenbart: **„Werkstatt anrufen"** (`<PhoneButton nummer={werkstatt.telefon}
    variant="card" label="Werkstatt anrufen" />`) **+ „Rückruf buchen"** (`WunschterminPicker` für die
    Rückrufzeit → `werkstattTerminPasstNicht(terminId, zeit)`).
- **Status `angefragt`:** wie bisher (Wunsch gesendet, warte auf Werkstatt) + optional schon „Werkstatt
  anrufen".
- **Status `bestaetigt`/`anruf_erbeten`/`abgelehnt`:** wie bisher; bei `abgelehnt` weiter `VorschlagsUI`.

Analoge Reaktion für die **token-scoped Sicht** (Magic-Link ohne Login) nur, falls ein Consumer sie
braucht — MVP: Kunde-Portal (eingeloggt). (Der Flow-Wunschtermin bleibt token-scoped wie gebaut.)

### 2.8 Werkstatt-UI (Auftrag)

Im Auftrags-Detail (`src/app/werkstatt/(shell)/auftraege/...`): neben „Wunsch bestätigen" / „Anrufen" /
„Ablehnen" einen **„Anderen Termin vorschlagen"**-Button (Date-Picker → `schlageWerkstattTerminVor`),
**jederzeit** verfügbar (nicht nur im KVA-Modal). Wenn `rueckruf_wunschzeit` gesetzt → Hinweis „Kunde bittet
um Rückruf am <Zeit>".

---

## 3. §3 — Haftpflicht-Kohärenz (DB-state-driven)

### 3.1 Reine Ableitung `reparaturPhaseErreicht` (neu, client-safe Helper in `src/lib/werkstatt/`)

```ts
export function reparaturPhaseErreicht(
  claim: { abrechnungsweg: string | null },
  gutachten: { fertiggestellt_am: string | null; totalschaden: boolean | null } | null,
): boolean {
  // Selbstzahler/Kasko(-frei): Reparatur steht sofort an (kein SV-Gutachten).
  if (claim.abrechnungsweg === 'selbstzahler' || claim.abrechnungsweg === 'kasko') return true
  // Haftpflicht: erst NACH dem Gutachten und nur wenn KEIN Totalschaden.
  if (claim.abrechnungsweg === 'haftpflicht') {
    return gutachten?.fertiggestellt_am != null && gutachten?.totalschaden !== true
  }
  return false // unbekannt → konservativ nicht zeigen
}
```

Primärsignal = `gutachten.fertiggestellt_am` (zuverlässig), **nicht** `operative_status` (hat keine
Reparatur-Phase, laggt). Totalschaden = hartes Aus (keine Reparatur).

### 3.2 Portal-Gate (Kunde) db-driven schärfen

`src/app/kunde/faelle/[id]/page.tsx` — beide Werkstatt-Gates um `reparaturPhaseErreicht` erweitern:
- `WerkstattFinderCard` (`:1040`, heute `brauchtWerkstattVermittlung(claimExtra)`) →
  `brauchtWerkstattVermittlung(claimExtra) && reparaturPhaseErreicht(claimExtra, gutachten)`.
- Effekt: Haftpflicht zeigt die Werkstatt-Wahl **erst nach Gutachten**, nie bei Totalschaden;
  Selbstzahler/Kasko unverändert sofort. Die volle Lifecycle-Tiefe (Wunschtermin) folgt der Wahl.

### 3.3 Staff-Reminder (Anf. 4) db-driven

`WerkstattVermittelnCard` (KB/Dispatch/SV, `faelle/[id]` + `gutachter/fall/[id]`) — Sichtbarkeit ebenfalls
an `brauchtWerkstattVermittlung && reparaturPhaseErreicht` binden, damit Staff bei Haftpflicht **nicht
verfrüht** (vor Gutachten) zum Vermitteln genudged wird. SV kann weiterhin vermitteln (bestehend).

### 3.4 Flow-Touch (leicht, `src/app/flow/[token]`)

Für **Haftpflicht** ein **leichter** Werkstatt-Touch (kein Wunschtermin-Picker im Flow):
- **Mitgegebene Werkstatt** (`leads.reparatur_werkstatt_id` gesetzt **oder** `reparatur_werkstatt_extern`
  Freitext) → **read-only anzeigen**: „Deine Werkstatt: <Name>. Wir koordinieren die Reparatur nach dem
  Gutachten."
- **Keine Werkstatt** → leichter Intent-Hinweis: „Reparaturwerkstatt: Wir vermitteln dir nach dem
  Gutachten eine passende Werkstatt in deiner Nähe." → **überspringbar** (Default: `reparatur_vermittlung_status`
  bleibt `'offen'` → Post-Conversion-Reminder feuert). Optional „Ich habe schon eine" → light-capture
  (setzt `reparatur_werkstatt_extern` / öffnet Finder — MVP: nur Hinweis + Skip).

**Gating:** Die bestehende `FlowWerkstattStep` (mit Wunschtermin) bleibt dem **Selbstzahler/Kasko**-Weg
vorbehalten (`needsWerkstatt` = `brauchtWerkstattVermittlung` + `istWerkstattReparaturWeg`). Der leichte
Haftpflicht-Touch ist ein **separater, additiver** Block/Step — **Platzierung als Vorschlag**: read-only
Zeile in der Flow-Zusammenfassung + (bei fehlender Werkstatt) ein Satz im SA-/Abschluss-Schritt. Exakte
Platzierung in der Review bestätigen. **`FlowWizardKfz`-STEPS-Array möglichst unberührt** (additiv, keine
neue Wizard-Stufe wenn vermeidbar).

---

## 4. §4 — Bug A/B: Verifikation + Regressionstests (kein Fix erwartet)

**Befund:** Auf `staging` sind beide „Bugs" bereits korrekt:
- **Bug A** (Vermittlung fehlt in „Meine Vermittlungen"): alle Setter gehen durch `buildZuweisungPatch()`
  → konsistent. `convert-lead-to-claim.ts:467-481` trägt über.
- **Bug B** (Werkstatt sieht Fremdes): Tabs filtern via `werkstattAuftragSegment()`
  (`src/lib/werkstatt/werkstatt-auftrag-segment.ts:15-19`) nach `meine_rolle` (DB-berechnet). RLS-Gate
  `is_werkstatt_for_claim` korrekt.

**Aufgabe (V4 „muss richtig zugeordnet sein"):**
1. **Empirische Prod-Verifikation** (READ-only via MCP): (a) existiert ein Claim, bei dem eine Werkstatt
   über `werkstatt_id` als Vermittler auftaucht, obwohl sie keinen echten Bezug hat? (b) existiert ein
   `reparatur_werkstatt_id`-Claim, der **nicht** in der Reparateur-Sicht landet? (c) Sind `werkstatt_id`
   und `reparatur_werkstatt_id` je unbeabsichtigt vertauscht?
2. **Regressionstests** zum Festnageln: `buildZuweisungPatch` setzt alle 5 Felder; `werkstattAuftragSegment`
   Rollen-Mapping (reparateur/vermittler/beide); RLS-Sim-Test für `is_werkstatt_for_claim` (Werkstatt A
   sieht Claim von Werkstatt B **nicht**).
3. Nur falls die Verifikation einen realen Leak/Fehlzuordnung findet → gezielter Fix (dann DDL/View via
   Plugin).

---

## 5. Akzeptanzkriterien (auf Aarons Anforderungen gemappt)

| Anf. | Kriterium | Umsetzung |
|---|---|---|
| 1 | Mitgegebene Werkstatt im Haftpflicht-FlowLink sichtbar | §3.4 read-only Touch |
| 2 | Finder nahe Besichtigungsort bei Vermittlung | bestehend (`findReparaturWerkstaettenForTarget`), im Portal post-Gutachten (§3.2) |
| 3 | Werkstatt schlägt Reparaturtermin im Auftrag vor (jederzeit) | §2.4 `schlageWerkstattTerminVor` (KVA-entkoppelt) |
| 4 | Skip → Reminder KB/Dispatch/SV | §3.3 `WerkstattVermittelnCard` + `reparaturPhaseErreicht` |
| 5 | Werkstatt gesetzt → zeigen + Auftrag-Termin | §3.4 + §2 |
| V1 | Kunde-Wunsch, Werkstatt-final, Kunde-OK nur bei Abweichung | §2.2/2.3 `werkstatt_vorschlag` + `akzeptiereWerkstattTermin` |
| V2 | Anruf-Button + Rückrufbuchung (Werkstatt ruft zurück) | §2.7 `PhoneButton` + `rueckruf_wunschzeit` |
| V3 | DB-state-driven Gate, Haftpflicht post-Gutachten | §3.1 `reparaturPhaseErreicht` |
| V4 | Vermittler-Zuordnung korrekt | §4 Verifikation + Tests |

---

## 6. Konventionen & Constraints (7-Punkt-Audit-relevant)

- **DDL nur via Supabase-Plugin** (Regel 2): Status-CHECK + `rueckruf_wunschzeit`. `list_migrations` →
  File exakt nach getrackter Version benennen. `audit_ungated_definer_views()=0` nach jeder View-/RLS-Berührung.
- **Server-Actions:** Result-Object `{ ok, error? }`, kein throw; non-fatal Notifies in try/catch;
  `revalidatePath` für `/werkstatt/auftraege`, `/kunde/faelle/[id]`.
- **Komponenten-Set:** `primitives.Button` / `shared/*` / `PhoneButton` — kein handgerolltes Button-Markup.
- **Status-Registry-Gate:** neuer `werkstatt_vorschlag`-Badge über `src/lib/status/` (kein Inline-Farb-Map).
- **Umlaute:** alle nutzersichtbaren Strings (Kunde-Karte, Notifies, Flow-Texte) mit echten `ä/ö/ü/ß`.
- **Hot-Files** (`flow/[token]/*`, `kunde/faelle/[id]/page.tsx`, `convert-lead-to-claim.ts`): additiv
  editieren, vor+nach `git grep` gegen Kollision (mehrere Sessions). Wir sind im **isolierten Worktree** →
  Trampeln minimiert; trotzdem Merge-Reihenfolge mit Aaron/Merge-Session abstimmen.
- **Kunden-Outbound:** neue Notify-Ereignisse (`werkstatt_vorschlag` an Kunde) = neuer Outbound → **Aaron
  vor Release fragen** (Merge-Session-Regel).

---

## 7. Bau-Reihenfolge

1. **§4 Verifikation zuerst** (READ-only Prod-Queries + Regressionstests) — bestätigt die Sicherheits-Basis,
   bevor wir den Lifecycle erweitern. Kein Merge-Risiko.
2. **DDL** (§2.2): Status `werkstatt_vorschlag` + `rueckruf_wunschzeit` (1 Migration, Plugin, prod-tracked).
3. **§2 Lifecycle-Kern** (server): `schlageWerkstattTerminVor` + `bestaetigeReparaturtermin`-Refactor +
   Kunde-Actions + KVA-Pfad-Bereinigung + Phase-Helper + Notifies. TDD (RED→GREEN).
4. **§2 UI:** Werkstatt-Auftrag „Anderen Termin vorschlagen"; Kunde `WerkstattCard` Reaktions-Block
   (Passt / Passt nicht → Anruf + Rückrufbuchung).
5. **§3 Portal-Gate + Staff-Reminder** (`reparaturPhaseErreicht`).
6. **§3 Flow-Touch (leicht, Haftpflicht).**
7. **E2E-Prod-Smoke:** Test-Werkstatt (`badecb82`) + Smoke-SV, `telefon=NULL`-Isolation; Haftpflicht-Claim
   post-Gutachten → Werkstatt-Wahl → Wunschtermin → Werkstatt-Vorschlag (abweichend) → Kunde „passt nicht"
   → Rückrufbuchung → Werkstatt sieht Rückrufzeit.

---

## 8. Offene Punkte für die Spec-Review

- **§3.4 Platzierung** des leichten Haftpflicht-Flow-Touch (read-only in Zusammenfassung vs. eigener
  Mini-Step) — Vorschlag steht, Bestätigung in Review.
- **§2.5 AV6-Interaktion:** ob die Reparaturauftrag-Freigabe (AV6) einen `werkstatt_vorschlag` implizit auf
  `bestaetigt` hebt oder der Kunde explizit „Passt" klickt — Default: explizit, AV6 bleibt separat.
- **Selbstzahler/Kasko** ist dormant (Daten NULL) — die Erweiterungen sind abrechnungsweg-agnostisch
  gebaut, aber getestet wird primär **Haftpflicht** (einziger Live-Pfad).
