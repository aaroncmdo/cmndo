# SP2c — KB-Beratungstermine Kalender-Sync (OUT + IN)

**Datum:** 2026-07-04
**Kontext:** 4. Inkrement des universellen Kalender-Sync-Features. Stacked auf SP2b (#3548, Connect-UI). Ein KB kann seit SP2b einen Kalender verbinden; SP2c macht seine Beratungstermine (`gutachter_termine`, `typ='kb_beratung'`) end-to-end funktional: **OUT** (Termine → externer KB-Kalender) + **IN** (externe KB-Belegung blockt KB-Slots).

## Ziel

Ein KB mit verbundenem Kalender: (1) seine Beratungstermine (Anlage/Bestätigung/Verlegung/Storno) erscheinen/aktualisieren/verschwinden in seinem Google- **und** CalDAV-Kalender; (2) seine externe Belegung (aus dem SP1-Cron-Cache) verwirft überlappende KB-Slots.

## Der zentrale Design-Punkt: Google-Meet nicht beschädigen

`bookKbTermin` (video) erzeugt heute ein **Google-Meet-Event auf dem persönlichen `primary`-Kalender des KB** (via `getGoogleOAuthClientForUser(kbId)`) — mit `conferenceData` (Meet-Link) + Teilnehmer (`sendUpdates:'all'`). Der Engine-`googleProvider` schreibt auf **denselben** Kalender. Ein Engine-`events.update` (Z.70, kein `conferenceDataVersion`) **erhält** den Meet-Link, würde aber mangels `attendees`-Feld die **Teilnehmer strippen**. → Die Engine darf **existierende Meet-Events nicht anfassen**, aber neue Google-Blöcke (Telefon/Jitsi/Flow-Termine ohne Meet) frei anlegen/aktualisieren/löschen.

## Architektur

### Meet-bewusster Wrapper (`src/lib/termine/kb-termin-sync.ts`, neu)

Zentralisiert die Provider-Wahl + fail-soft, damit jede Call-Site nur **eine Zeile** ist:

```ts
export function istMeetVideo(videoLink: string | null | undefined): boolean {
  return !!videoLink && videoLink.includes('meet.google')  // Google-Meet-Link (nicht Jitsi/null)
}
export async function syncKbTerminOut(terminId: string): Promise<void>   // Meet-Video -> nur CalDAV; sonst beide Provider. Fail-soft.
export async function entferneKbTerminOut(terminId: string): Promise<void> // entferne beide (Delete ist Meet-safe). Fail-soft.
```

`syncKbTerminOut` liest `gutachter_termine.video_link`, entscheidet per `istMeetVideo` (Meet → `{providers:[caldavProvider]}`; sonst Default = beide), ruft `syncTerminToExternalCalendar`. `entferneKbTerminOut` → `entferneTerminAusExternemKalender` (beide). Beide fail-soft (`try/catch` + `console.error`) — ein Sync-Fehler darf den Termin-Write nie brechen (die kunde-/flow-facing Sites!).

**Warum `video_link` als Signal:** Meet-Pfad setzt `video_link = meet.meetLink` (`meet.google.com/…`); Jitsi setzt `meet.jit.si/…`; Telefon = null. So unterscheidet ein Feld „Meet gehört Google" von „Engine darf Google anlegen".

### OUT-Sync — Call-Site-Verdrahtung (fail-soft nach dem Write)

| Site | Datei | Op | Aufruf |
|---|---|---|---|
| A | `lib/termine/kb-booking.ts` `bookKbTermin` | INSERT | `syncKbTerminOut(id)` (video→CalDAV, telefon→beide) |
| B | `lib/termine/kb-booking.ts` `cancelKbTermin` | Storno | `entferneKbTerminOut(id)` |
| C | `app/faelle/[id]/_actions/termine.ts` `createKbVideoterminByKb` | INSERT | `syncKbTerminOut(id)` (Jitsi→beide) |
| D | `app/mitarbeiter/konsultation/[terminId]/actions.ts` `protokolliereKonsultation` | UPDATE (nur `disposition='verschoben'`) | `syncKbTerminOut(id)` |
| E | `app/flow/[token]/self-service-actions.ts` `bestaetigeBeratungsterminFlow` | UPDATE→bestaetigt | `syncKbTerminOut(id)` |
| F | `app/flow/[token]/self-service-actions.ts` `verschiebeBeratungsterminFlow` | UPDATE (Zeit) | `syncKbTerminOut(id)` |
| G | `app/api/kunde/termin/verschieben/route.ts` (nur `typ='kb_beratung'`) | UPDATE→verschoben | `entferneKbTerminOut(id)` |
| H | `app/api/kunde/termin/absagen/route.ts` (nur `typ='kb_beratung'`) | UPDATE→abgesagt | `entferneKbTerminOut(id)` |

Die Engine liest `assignee_typ='kundenbetreuer'`/`assignee_id=kb_id` korrekt (BEFORE-Trigger `gutachter_termine_normalize_assignee` füllt sie aus `kb_id`). Der DB-Trigger `create_auto_beratungstermin` (Auto-`reserviert`) braucht keinen App-Sync — der erste OUT-Sync passiert bei E/F (Bestätigung/Verlegung durch den Kunden).

### IN-Sync — `kb-slots.ts` an `v_belegung`

`getAvailableKbSlots(kbId)` liest heute **nicht** `v_belegung` (der externe-Belegungs-Check war ein No-Op, entfernt — `kb-slots.ts:102-107`). Die IN-Pipeline ist seit SP1 da (Cron → `sv_kalender_events_cache.profile_id` → `v_belegung` surfaced `('kundenbetreuer', kbId, 'extern')`). Injektion (Engine-Helper `ladeBelegung`, kein neuer View-Query):
1. **Laden** (an Stelle des No-Op-Blocks, `:102-107`): `ladeBelegung({typ:'kundenbetreuer', id:kbId}, windowStart, windowEnd, db)` → `belegung_typ==='extern'`-Fenster → `externBlockedRanges`.
2. **Filter** (Slot-Schleife, `:141-144`): `&& !externOverlap` (gleiche `slotStart<b.end && slotEnd>b.start`-Logik wie `adminBlockedRanges`).

## Nicht-Ziele / bekannte Grenzen

- **Video-Meet-Verlegung:** ein Meet-Video-Termin, der verschoben wird (D/F), bewegt das Google-**Meet**-Event nicht mit (Meet bleibt create-only, um Teilnehmer/Conference nicht zu beschädigen). Der CalDAV-Eintrag stimmt. Faithful Meet-Move = Follow-up.
- **Kein fail-closed Write-Gate** auf die Buchung — SP2c filtert die Slot-**Anzeige**; ein Race-sicheres Buchungs-Gate (`pruefeBelegungStrict`) ist ein separater Follow-up.
- Keine DB-/Migration-Änderung. Keine SV-Lifecycle-Änderung (G/H gegatet auf `kb_beratung`).

## Testing

- **Unit (vitest):** `istMeetVideo` (meet.google→true; jit.si→false; null→false). Der `kb-slots`-Overlap-Filter ist Range-Logik (soweit ohne DB testbar, sonst Build).
- **Build/tsc/Ratchets** grün.
- **Prod-Smoke (READ):** für einen echten KB die IN-Query beweisen (`v_belegung` `('kundenbetreuer', kbId, 'extern')` liefert sauber, aktuell 0 → Filter no-op, kein Crash); die 8 Call-Sites kompilieren + sind fail-soft. Voller OUT-Smoke (Termin→Kalender) braucht eine echte KB-Kalender-Verbindung → Follow-up nach Deploy.

## Risiko & Rollback

Berührt kunde-/flow-facing Schreibpfade — aber **fail-soft** (Sync-Fehler bricht den Write nie). Meet-Schutz per `istMeetVideo`. Rollback = Code-Revert. Kein DB-Change.

## Reihenfolge

SP2a (✅) → SP2b (✅) → **SP2c** (dieses Dokument) → SP2d Rückruf-Sync (`admin_termine` + CalDAV-Zweig).
