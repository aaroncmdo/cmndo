# AAR-939 Stream 6b — Self-Service-Verlegung (embed-B nach SV-No-Show) · Design

**Datum:** 31.05.2026 · **Branch:** `kitta/aar-939-6b-self-service-verlegung` · **Owner:** AAR-939
**Approved (Aaron 31.05.):** Ersatz-SV = **Auto-Top-1**; Kunde-Flow = **Self-Pick via Re-Termin-Token**.

## Ziel

Wenn bei einem embed-B / `nur_gutachter`-Termin der SV nicht erscheint und das Team den No-Show
bestätigt, soll **automatisch ein Ersatz-SV** zugewiesen und dem Kunden ein **Magic-Link** geschickt
werden, über den er **selbst einen freien Slot** beim Ersatz-SV wählt — ohne Dispatcher-Telefonat.

## Bestehender Kontext (wiederverwenden, nicht neu bauen)

- **Dispatcher-Resolve (#2101):** `EmbedBKlaerungCard` + `bestaetigeSvNoShowVomTeam` (`lib/termine/embed-b-dispatcher-actions.ts`) — Team bestätigt No-Show, setzt heute `sv_no_show_am` (via `markSvNoShowEmbedB`) + löst den Klärungs-Task. **Hier hängt 6b ein.**
- **SV-Matching (#2123, AAR-940/941):** `findBestSV(input, limit)` (`lib/dispatch/findBestSV.ts`, unterstützt `stickySvId`), `matchAndSlots`/`rankSlots`/`ladeFreieSlots` (`lib/sv-matching-modul/`), `reserveSvTerminForLead` (`dispatch/leads/[id]/_actions/sv-termin.ts`). **Quelle für Ersatz-SV + Slots — kein Rebuild.**
- **Re-Termin-Token-Flow:** `waehleReTerminSlot(token, slotIso)` (`app/kunde/re-termin/[token]/actions.ts`) validiert `faelle.re_termin_token` + reserviert einen neuen Termin — **lockt heute auf `fall.sv_id`** (Zeile 77). `re-termin-eskalation`-Cron für Nicht-Reaktion.

## Flow

```
Kunde meldet "SV kam nicht" (NEIN) → Dispatcher-Klärungs-Task (existiert)
  → Dispatcher klickt "SV kam nicht" → bestaetigeSvNoShowVomTeam (existiert)
     [erweitert:] → verlegeNachNoShowEmbedB(terminId):
        1. No-Show-Marker steht schon (sv_no_show_am) + alten Termin status='verlegt'   ← VOR allem Weiteren
        2. Ersatz-SV = findReplacementSv(claimId, excludeSvId=alterSv)   (Auto-Top-1)
        3. claims.sv_id := Ersatz-SV  (SSoT; Sync → fall.sv_id)
        4. Re-Termin-Token generieren + WhatsApp-Magic-Link an Kunde
  → Kunde öffnet /kunde/re-termin/[token] → freie Slots des Ersatz-SV → pickt
  → waehleReTerminSlot → neuer gutachter_termine (status='reserviert', neuer sv_id)
```

## Komponenten / Interfaces

1. **`verlegeNachNoShowEmbedB(terminId: string): Promise<{ ok: boolean; error?: string; ersatzSvId?: string }>`**
   (`lib/termine/`) — Orchestriert Schritte 1–4. Wird **aus `bestaetigeSvNoShowVomTeam` heraus** aufgerufen (nach dem No-Show-Marker). Non-fatal: bei Fehler bleibt der Klärungs-Task offen.

2. **`findReplacementSv(params: { claimId; besichtigungsortLat; besichtigungsortLng; wunschterminIso?; excludeSvId }): Promise<string | null>`**
   — dünner Wrapper um `findBestSV` (`limit=1`, Original-SV ausgeschlossen). Standort aus dem alten Termin (`gutachter_termine.besichtigungsort_*`, Fallback `claims`/`faelle`). Liefert `null` wenn kein Kandidat → Caller geht in den manuellen Fallback.
   - **findBestSV-Erweiterung:** optionaler `excludeSvId`-Filter (eine Zeile; Original-SV aus dem Kandidaten-Set werfen). Mit 0243cdab/98044b6b unkritisch (additiv, optional).

3. **Re-Termin-Token an Ersatz-SV binden** — `claims.sv_id` auf den Ersatz-SV umhängen (Sync-Trigger propagiert auf `fall.sv_id`), dann den **bestehenden** Token-Generierungs-Pfad nutzen; der existierende `waehleReTerminSlot` greift dann automatisch auf den neuen `fall.sv_id`. **Re-Termin-Seite zeigt freie Slots des Ersatz-SV** via `ladeFreieSlots`/`rankSlots`.

4. **`EmbedBKlaerungCard`-Extension (minimal)** — nach „SV kam nicht": Feedback-Zeile „Ersatz-SV **X** zugewiesen, Re-Termin-Link an den Kunden gesendet" bzw. bei Fallback „Kein Ersatz-SV automatisch gefunden — bitte manuell".

## Error-Handling / Edge-Cases

- **Kein Ersatz-SV verfügbar** (Auto-Top-1 leer): kein Crash → Klärungs-Task bleibt offen + Dispatcher-Mitteilung. Graceful Degradation auf den heutigen manuellen Pfad.
- **Non-critical Sub-Sends** (WhatsApp-Magic-Link, Mitteilung, Timeline) in lokalen `try/catch` — ein Twilio/Baileys-Fail darf den Status-Update + die SV-Umhängung nicht zurücknehmen.
- **Idempotenz:** zweite No-Show-Bestätigung auf denselben Termin (Realtime-Replay) darf nicht doppelt umhängen/Token erzeugen — Guard auf `sv_no_show_am IS NOT NULL` / bestehenden offenen Re-Termin-Token.
- **Billing (€70):** `sv_no_show_am` steht VOR der Neu-Reservierung (von 0243cdab als sauber gegen Doppel-Charge bestätigt). 6b ändert das €70-Default-Modell **nicht** (Claim behält ein €70; Billing-Lane = 98044b6b).

## Coordination-Constraints (gelockte Lanes)

- **`state-machine.ts` NICHT anfassen** (0243cdab/T1.2-Single-Toucher). 6b arbeitet auf **Termin-Ebene** (`gutachter_termine`) + **`claims.sv_id`** (SV-Zuweisung, CMM-60-SSoT) — **keine claims.status-Lifecycle-Transition**.
- **`work_state`-aware:** `dispatch_done`/`in_bearbeitung` leben seit dem Cutover in `claims.work_state`; `claims.status` ist Terminal/nullable. 6b liest/schreibt **keine** Dispatch-Werte → unberührt.
- **`findBestSV` = 98044b6b/AAR-940-Lib** — reuse, kein Rebuild. Nur additiver `excludeSvId`-Param.

## In Implementation zu erden (writing-plans)

- Existiert `markSvNoShowEmbedB` separat, oder setzt `bestaetigeSvNoShowVomTeam` `sv_no_show_am` inline? (Einhängepunkt für Schritt 1.)
- Existiert ein Re-Termin-Token-**Generierungs**-Pfad (für komplett-No-Show), den embed-B wiederverwendet — oder muss 6b den Token + Magic-Link-Send neu bauen? (Schritt 4.)
- Sync-Richtung `claims.sv_id` → `fall.sv_id` live verifizieren (Trigger vorhanden? sonst beide setzen). `nur_gutachter`-Tauglichkeit von `waehleReTerminSlot` (heute komplett-getestet).
- `gutachter_termine.besichtigungsort_*` für embed-B befüllt? (Standort-Quelle für `findBestSV`.)

## Testing / Smoke

Reversibel auf `@claimondo.test`-Seed: embed-B-Termin seeden → `verlegeNachNoShowEmbedB` → assert `sv_no_show_am` gesetzt + alter Termin `verlegt` + `claims.sv_id`=Ersatz + Re-Termin-Token vorhanden; Kunde-Token-Pfad (Slot-Pick → neuer `reserviert`-Termin mit neuem SV). Edge: kein Ersatz-SV → Task offen + Mitteilung. €70-Doppel-Charge-Check (sv_no_show vor Reserve). `tsc --noEmit` grün; UI-Smoke der Card-Extension + Re-Termin-Seite (Screenshot).
