# Kunde-Termin-Funnel: Gutachtertermin sauber bis in die Akte (Design)

**Datum:** 2026-08-05 · **Autor:** Session 04f5e9c3 (Fable) · **Status:** von Aaron freigegebenes Design (Chat 05.08., "go")
**Audit-Grundlage:** Memory `AUDIT-kunde-claim-operativ-termin-funnel-tot` (04.08., prod-belegt) · Repro-Fall: CLM-2026-01603 (smoke-kunde@)

## 1. Problem (Ist, prod-belegt 04.08.)

Der Gutachtertermin-Funnel fuer normale Kunden endet tot — vier unabhaengige Bruchstellen:

1. **Dispatch-Queue ohne Betrieb:** ALLE je ueber den Finder entstandenen `sv_begutachtung`-Termine stehen auf `dispatch_pending` (16, aeltester 15.07.) oder `storniert` (6) — 0 wurden je bestaetigt. Es existiert KEINE Oberflaeche fuer die Queue (`dispatch_pending` wird in `src/app` nur vom Embed selbst referenziert).
2. **Lead→Claim-Grenze:** Finder-Termine sind bezug-nativ `lead`-verankert (30 Tage: 22/22). `convertLeadToClaim` haengt sie NICht um (liest nur `svIdFromTermin` fuer den Initial-Cursor, `convert-lead-to-claim.ts:451-456`). Die Kunden-Akte fragt nur fall/claim-Achsen ab (`kunde-claim-view.ts:229-231/274/283/296`) UND filtert auf `['reserviert','bestaetigt','gegenvorschlag','verschoben']` — der gewaehlte Termin ist doppelt unsichtbar.
3. **Cursor-Luege:** Dead-Pin-Buchung (assignee `sv_lead`) liefert `svIdFromTermin=null` → Claim startet und bleibt auf `ersterfassung`, obwohl der Kunde einen Slot gewaehlt hat.
4. **Kein Portal-Einstieg:** `/kunde/schaden-melden` → Akte → "Unterschrift ausstehend" nimmt den Fokus-Signatur-Kurzschluss VOR der Termin-Strecke (`flow/[token]/page.tsx:186`); die Akte hat keinen Termin-CTA. Der bestehende Kunde-Kalender (`/kunde/faelle/[id]/kalender`) ist nirgends verlinkt und bei `!svId` eine Sackgasse ("kein SV").

Dazu zwei Randbefunde: Der Finder bietet **vergangene Slots** an (23:20 Uhr → "Di 04.08." + 08:00 waehlbar; DB: `start_zeit` < `created_at`), und die B2C-Nav zeigt **"Fahrzeuge" UND "Flotte"** unconditional (`KundeNav.tsx:21-24`; Flotte = "Firmen-Konto anlegen"-B2B-Formular; Bestand minimal: 7 Firmen, 3 mit je 1 Fahrzeug).

## 2. Leitprinzip (Aaron, 05.08.)

**Jede Terminbuchung ist ein Termin-Engine-Vorgang mit echtem Ergebnis**, in fester Kaskade:

1. Claim hat einen SV (`claims.sv_id`) → direkt bei dessen Slots buchen (bestehender Kunde-Kalender).
2. Kein SV → die Engine/das SV-Matching findet einen echten Partner-SV im Umkreis und bucht dort.
3. Findet niemand → Wunschtermin als Dead-Pin-/`sv_gesucht`-Termin in die **Dispatch-Queue mit SLA** — mit Owner, nie wieder ownerlos.

Es gibt keinen Terminzustand ohne Zustaendigen und keinen gewaehlten Termin, den der Kunde nicht sieht.

**Namens-Falle (bewusst zwei Vokabulare):** `sv_gesucht` (Unterstrich) = TERMIN-Status in `gutachter_termine` ("kein SV zugewiesen, re-assignbar"); `sv-gesucht` (Bindestrich) = CLAIM-Cursor in `claims.operative_status`. Beide existieren heute schon; diese Spec fuehrt KEINEN neuen Wert ein.

## 3. Entscheidungen (Aaron, AskUserQuestion 05.08.)

| Frage | Entscheidung |
|---|---|
| Termin ueber Lead→Claim-Grenze | **Convert haengt um** (bezug `lead`→`claim`) + einmaliger Backfill |
| Buchungspfad | **Termin-Engine-Kaskade** (Claim-SV → Engine-Findung → Queue), s. Leitprinzip |
| Dead-Pin-Queue | **Queue + SLA** im Dispatch-Portal (kein Auto-Matching-Ausbau, kein Dead-Pin-Abschaffen) |
| Flotte im B2C-Portal | **Conditional zeigen** (Nav-Item nur, wenn der Kunde eine Firma hat) |

## 4. Zielverhalten je Baustein

### 4.1 Termin-Identitaet (Convert haengt um)

- `convertLeadToClaim` haengt am Ende der Konversion alle **offenen** `gutachter_termine` des Leads um: `bezug_typ 'lead' → 'claim'`, `bezug_id → claims.id`. "Offen" = nicht in `(storniert, abgesagt, abgelehnt, abgeschlossen)`. Non-fatal (try/catch, wie die anderen Konversions-Nachwirkungen), aber mit `console.error` bei Fehlschlag.
- Der Umhaenge-Write filtert ueber die kanonische bezug-Achse (`.eq('bezug_typ','lead').eq('bezug_id', leadId)`) — Termin-Bezug-Gate-konform (Writes sind frei, kanonische Filter sowieso).
- **Backfill (einmalig, MCP-Migration, DML):** alle bezug-`lead`-Termine, deren Lead bereits einen Claim hat, auf `claim` umhaengen (Join `claims.lead_id`). Betrifft ~16 Bestands-Termine.
- `reparatur_termine` bleiben unveraendert `claim_id`-verankert.

### 4.2 Ehrlicher Claim-Cursor

- Initial-Cursor beim Convert wird 3-stufig (heute 2-stufig, `convert-lead-to-claim.ts:451`):
  `gutachtenBereitsErstellt → 'gutachten-eingegangen'` · `svIdFromTermin → 'sv-termin'` · **NEU:** offener Termin ohne echten SV (Dead-Pin/Wunschtermin) → `'sv-gesucht'` · sonst `'ersterfassung'`.
- `'sv-gesucht'` existiert bereits (CHECK + `OPERATIVE_PHASE`-Mapping). **Das Mapping wird NICHT angefasst** (v_claim_phase-Parity-Gate!) — die Kunden-Kommunikation "dein Termin wird bestaetigt" laeuft ueber die Termin-Anzeige (4.3), nicht ueber das Phasen-Label.
- Sobald Dispatch/Engine einen echten SV zuweist: **Engine-Transition** (`transitionFallStatus`) auf `sv-termin` — kein Direkt-Write (Operative-Status-Write-Gate). Der bestehende sv-zuweisung-Pfad (seit C1a auf dem Funnel) traegt das.

### 4.3 Kunden-Akte zeigt die Wahrheit

- **Status-Menge erweitern:** Die drei Termin-Reads des Kunde-Loaders (svTermin/aktiverTermin + `getKundeTermine`) nehmen `dispatch_pending` und `sv_gesucht` in die sichtbare Menge auf.
- **Darstellung:** Terminsektion im Stepper zeigt solche Termine als "Wunschtermin: <Datum, Uhrzeit>" mit Badge **"wird bestaetigt"** (Aarons 16.06.-Wunschtermin-Modell aus dem Flow, `flow/[token]/page.tsx:332-349`, in die Akte gezogen). Kein "Termin verschieben"-Button in diesem Zustand.
- **Aufgabe "Gutachtertermin waehlen"** (`deriveKundeAufgaben`): sichtbar, wenn KEIN offener/kommender `sv_begutachtung`-Termin existiert UND der Claim nicht terminal ist UND der Fall eine Begutachtung braucht (nicht reine Reparatur-Lane). CTA → `/kunde/faelle/[id]/kalender`.
- **Kalender ohne Claim-SV** wird von der Sackgasse zur Engine-Findung (Kaskadenstufe ②): Matching liefert den besten echten Partner-SV + dessen Slots; findet es keinen, Wunschtermin-Formular → Kaskadenstufe ③ (Termin `sv_gesucht`, Queue). Bis diese Stufe gebaut ist (Tranche T4), erscheint die Aufgabe nur bei vorhandenem `sv_id`.
- `terminBuchen` (`lib/actions/termin-actions`, source `kunde_kalender`) wird gegen den Engine-Contract verifiziert (bezug-nativ `'claim'`, `reserviere`-Pfad) und falls noetig gehoben.

### 4.4 Dispatch-Queue + SLA (Betrieb)

- Neue Dispatch-Ansicht **"Terminwuensche"**: alle `gutachter_termine` mit `status in ('dispatch_pending','sv_gesucht')`, nicht storniert. Spalten: Alter (SLA-Badge, Warnstufe > 24 h), Wunschzeit, Lead/Claim, Ort, Quelle (Dead-Pin vs. Portal).
- **Eingangs-Notification** an Dispatch (in_app, bestehendes Notification-System) bei jedem neuen Queue-Eintrag; **Eskalation** nach 24 h ueber den bestehenden Reminder-/Task-Mechanismus.
- **Aktion "SV zuweisen"** nutzt den bestehenden sv-zuweisung-Pfad: Termin → `bestaetigt` + `assignee 'sachverstaendiger'`, Kunde-Comms (Terminbestaetigung), Cursor-Transition `sv-gesucht → sv-termin` via Engine. Stornieren (fuer Test-/Karteileichen) ebenfalls aus der Queue.
- Nach dem 4.1-Backfill sind die 16 Bestands-Wuensche in der Queue sichtbar und werden dort abgeraeumt (Test-Leads: stornieren).

### 4.5 Finder-Hygiene (Embed)

- Der Slot-Picker (Datum + Uhrzeit) filtert **vergangene Slots** in Europe/Berlin und erzwingt einen Mindestvorlauf von **2 h**. Gilt fuer Wunschtermin-Picker UND SV-Slot-Listen.
- ⚠ Lane-Koordination: Der Embed gehoert der aktiven `aar-956-embed-reservierung-rueckruf`-Arbeit — Umsetzung als kleiner abgestimmter PR oder Uebergabe an die Lane (Marker).

### 4.6 schaden-melden-Anschluss

- Kein neuer Flow-Schritt, der Fokus-Signatur-Kurzschluss bleibt. Nach der Meldung traegt die Akte die neue Aufgabe "Gutachtertermin waehlen" (4.3) an oberster Stelle — damit ist der Portal-Weg terminfaehig.

### 4.7 Flotte conditional (B2C-Nav)

- `buildNavItems` bekommt `hatFirma: boolean` (server-seitig im Kunde-Layout via `getKundeFirma`, analog `singleFallId` durchgereicht). Flotte-Item rendert nur bei `hatFirma`; Route `/kunde/flotte` bleibt fuer Deep-Links/Bestand (7 Firmen) erreichbar.
- Die zwei hardcodierten Nav-Labels ("Fahrzeuge"/"Flotte") wandern dabei in die 6 Locales (`nav.fahrzeuge`/`nav.flotte`, offenes i18n-TODO im Code).

### 4.8 Werkstatttermin

- **Kein Modell-Umbau.** J4/Reparatur-Lane funktioniert (CI-Smokes gruen). Nach 4.1/4.3 sieht der Kunde Gutachter- UND Reparaturtermin in einer Akte.
- Randfix: Die Aufgabe "Termin bestaetigen" ankert fuer Reparaturtermine auf die GeldZone (`kunde-zonen.ts:60`), die in fruehen Phasen nicht immer gerendert wird (`:82-95`) — Anker-Ziel absichern (Zone erzwingen oder Fallback-Anker).

## 5. Nicht-Ziele

- Kein Auto-Matching-Ausbau ueber die bestehende Engine-Findung hinaus (Phase 2).
- Dead-Pins bleiben (Wachstumsmodell); kein Abschaffen.
- Keine Migration der 3 Bestands-Kunde-Flotten ins FM-Portal; keine `/kunde/flotte`-Retirierung.
- Keine neuen `operative_status`-Werte, keine Aenderung an `OPERATIVE_PHASE`/`v_claim_phase` (Parity).
- Keine Aenderung am Fokus-Signatur-Kurzschluss des Flows.

## 6. Tranchen (jede einzeln shippable, je PR + Regel-4-Prod-Smoke)

| # | Inhalt | Kern-Files |
|---|---|---|
| **T1** | Convert haengt um + Backfill-Migration + Loader-Status-Menge + "wird bestaetigt"-Anzeige | `convert-lead-to-claim.ts`, Mig (DML), `kunde-claim-view.ts`, `kunde-termine.ts`, StatusZone |
| **T2** | 3-stufiger Initial-Cursor (`sv-gesucht`) + Engine-Transition bei SV-Zuweisung verifizieren | `convert-lead-to-claim.ts`, sv-zuweisung-Pfad (nur Verifikation, seit C1a auf Funnel) |
| **T3** | Dispatch-Queue "Terminwuensche" + Notification + 24h-SLA + Zuweisen/Stornieren | Dispatch-Portal (neue Ansicht), Notification/Reminder |
| **T4** | Akte-Aufgabe + CTA + Kalender-Engine-Findung ohne SV + `terminBuchen`-Contract | `kunde-zonen.ts`, AufgabenZone, `kalender/*`, `termin-actions` |
| **T5** | Finder-Past-Slot-Filter + 2h-Vorlauf (⚠ aar-956-Koordination) | `embed/gutachter-finder/*` |
| **T6** | Flotte-conditional + Nav-i18n-Nachzug | `KundeNav.tsx`, Kunde-Layout, 6 Locales |

Reihenfolge: T1 → T2 → T3 sind der kritische Pfad (Kunde sieht Wahrheit, Cursor stimmt, Betrieb existiert). T4-T6 unabhaengig danach/parallel.

## 7. Journey-DoD (D1) + Tests

- **Vor dem Bau** (im jeweiligen PR): Journey-Deltas — `j01` Schritt 2 (Terminwahl/Wunschtermin-Modell + Queue-Fallback) und `j02` (Portal-Meldeweg → Terminfaehigkeit); Werkstatt-Sicht unveraendert (`j04`).
- Journey-Smoke-Erweiterung: Kunde bucht aus der Akte (T4) bzw. Wunschtermin sichtbar als "wird bestaetigt" (T1); nicht automatisierbare Schritte als `test.skip` mit Begruendung.
- Unit: Umhaenge-Logik (Statusmengen-Filter), Cursor-3-Stufigkeit, `deriveKundeAufgaben`-Gate (bestehende Testfiles erweitern).
- Prod-Smoke je Tranche via Test-Konten (smoke-kunde@, Wegwerf-Accounts; `telefon=NULL`).

## 8. Risiken / Koordination

- `convert-lead-to-claim.ts` ist ein heisses File (viele Lanes) — kleine, additive Edits; Rebase-Disziplin.
- Embed (T5) gehoert der aar-956-Lane — vor Umsetzung Marker/Absprache.
- Backfill-DML als getrackte MCP-Migration (Regel 2 sinngemaess; DML-Migration = nachvollziehbar + preview-sicher).
- Kunde-Zonen sind laut Split-Marker (`COORDINATION-AN-b0e963b6`) Kunde+SV-Lane-Territorium — Marker-Update beim Bau.
