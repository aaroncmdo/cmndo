# Spec: App-weite Zeitzonen-Korrektur (true-UTC speichern, explizit Berlin anzeigen)

- **Datum:** 2026-06-03
- **Auslöser:** AAR-956 Re-Walk — Slot-Picker zeigt „09:00", gebucht/gespeichert wird `09:00 UTC` = `11:00 Berlin`. Kunde, SV und Kalender sind sich über die Terminzeit uneinig.
- **Entscheidung Aaron (2026-06-03):** „Volle TZ-Korrektur zuerst", **Ansatz 2** (explizit true-UTC speichern + überall explizit Berlin anzeigen). Der kanonische Go-Live (`CANONICAL_FLOWLINK_ENABLED`) wartet darauf.
- **Status:** Design — zur Abnahme.

---

## 1. Problem & Root-Cause

`TZ` ist auf den Node-Prozessen **unset** (verifiziert: env-File + beide PM2-Prozesse; `new Date("2026-06-03T09:00:00").getTimezoneOffset() === 0`). Node läuft also **UTC**. Daraus folgt eine app-weite, inkonsistente Zeit-Konvention:

- **Slot-Generierung** baut Zeiten per `slotVon.setHours(h, m)` (server-lokal = UTC) bzw. als nackte Wall-Clock-Strings:
  - `src/lib/onboarding/slots.ts:171-174` (`setHours`)
  - `src/lib/termine/engine/slots.ts:48,166` (`setHours`)
  - `src/lib/sv-matching-modul/ranking.ts:65` → `start = "${datum}T${uhrzeit}:00"` (nackter Wall-Clock-String, bewusst „TZ-neutral" fürs Ranking)
- **Speicherung** ist gemischt:
  - `bucheTerminFlow` (`src/app/flow/[token]/self-service-actions.ts`) schreibt `start_zeit: startIso` **direkt** (nackter Wall-Clock → Postgres UTC-Session → `09:00 UTC`).
  - `src/app/faelle/[id]/_actions/termine.ts:84` schreibt `startZeit.toISOString()` (auf UTC-Node ebenfalls Wall-Clock-as-UTC).
  - Weitere Insert-Stellen: `dispatch/rueckrufe/actions.ts`, `faelle/[id]/_sidebar/rueckruf-actions.ts`, `termine/engine/*`, `seed-testdata`.
- **Anzeige** ist gemischt: ~40 Files nutzen teils explizit `timeZone:'Europe/Berlin'` (konvertieren → +2h ggü. der Wall-Clock-Absicht), teils naiv (kein `timeZone` → abhängig von Runtime/Browser-TZ).

**Netto:** „09:00" gemeint (Berlin) wird als `09:00 UTC` gespeichert. Eine Berlin-Anzeige zeigt `11:00`, eine naive Server-Anzeige `09:00`, eine naive Browser-Anzeige je nach User-TZ. → Kein verlässlicher, einheitlicher Terminzeit-Wert.

**Wichtig:** Das ist **kein** kanonisch-spezifischer Bug — Dispatch-Engine und Self-Service teilen dieselbe Konvention. Der kanonische `/flow`-Bestätigungstext macht es nur erstmals **sichtbar**.

---

## 2. Zielinvariante (nach der Korrektur)

> **Speicherung:** Alle Termin-Zeitspalten (`gutachter_termine.start_zeit/end_zeit`, `gutachter_finder_anfragen.reservierter_slot_von/bis`, `faelle.sv_termin`, Rückruf-Termine, …) enthalten den **echten UTC-Instant**.
>
> **Anzeige:** Jede nutzersichtbare Termin-Zeit wird **explizit** mit `timeZone:'Europe/Berlin'` formatiert — runtime- und browser-TZ-unabhängig.
>
> **Generierung:** Slot-Generierung erzeugt **Berlin-verankerte echte Instants** (Arbeitszeit „09:00" Berlin → `07:00 UTC` im Sommer).

---

## 3. Ansatz 2 — Design

### 3.1 Helper (neu, `src/lib/google-calendar/timezone.ts`)
Neben dem bestehenden `toBerlinWallClock(iso)` (UTC → Berlin-Wall-Clock-String, für Google-Sync):

```ts
/** Interpretiert einen Wall-Clock-String ("YYYY-MM-DDTHH:mm[:ss]") als Europe/Berlin
 *  und liefert den echten UTC-Instant (DST-korrekt). */
export function berlinWallClockToUtc(wall: string): string  // -> ISO Z

/** Zentraler, expliziter Berlin-Formatter für nutzersichtbare Termin-Zeiten. */
export function formatBerlin(iso: string, opts?: Intl.DateTimeFormatOptions): string
```

`berlinWallClockToUtc` DST-korrekt über die Offset-Differenz-Technik (`Date.UTC(...)` + `toLocaleString('en-US',{timeZone:'Europe/Berlin'})`-Rückrechnung) — **kein** neues npm-Paket. `formatBerlin` kapselt `timeZone:'Europe/Berlin'`, damit kein Call-Site das `timeZone` vergisst.

### 3.2 Generierung → Berlin-verankert
- `onboarding/slots.ts` + `termine/engine/slots.ts`: Slot-`Date`s nicht per `setHours` (server-lokal) bauen, sondern den Wall-Clock `${datum}T${HH}:${MM}:00` via `berlinWallClockToUtc` in einen echten Instant wandeln (Belegt-Check + Reachability rechnen dann gegen echte Instants — fixt nebenbei den 2h-Versatz im Abgleich gegen Google/CalDAV-Busy).
- `ranking.ts`: bleibt intern Wall-Clock-neutral fürs Ranking, ABER der ausgegebene `SlotVorschlag.start/end` wird zum echten Instant (`berlinWallClockToUtc`), damit Downstream (Anzeige + Speicherung) eindeutig ist.

### 3.3 Speicherung → echter Instant
Alle Termin-Inserts/Updates schreiben echte Instants:
- `bucheTerminFlow`, `reserviereSlot` (slots.ts), `termine/engine/*`, `faelle/_actions/termine.ts`, `dispatch/rueckrufe/actions.ts`, `faelle/_sidebar/rueckruf-actions.ts`.

### 3.4 Anzeige → explizit Berlin
Alle nutzersichtbaren Termin-Zeit-Renders auf `formatBerlin(...)` umstellen (Kunde/SV/Dispatch-Portale, `TerminCard`, Slot-Picker `SvSlotAuswahl`, `/flow`-Bestätigung, Emails, PDFs, FAQ-Bot, LexDrive).

### 3.5 Calendar-Sync bleibt korrekt
`google-calendar/*` nutzt `toBerlinWallClock` (echter Instant → Wall-Clock + separates `timeZone`-Feld an Google). Mit echten Instants als Quelle ist dieser Pfad **danach korrekt** (heute speist ihn ein Wall-Clock-as-UTC-Wert → 2h-Versatz im Google-Event).

---

## 4. Audit-Fläche (Implementierungs-Schritt 1: vollständig enumerieren)

Grep-getrieben, abzuhaken. Bekannte Cluster:

| Kategorie | Bekannte Sites (nicht erschöpfend) |
|---|---|
| **Generierung** | `onboarding/slots.ts`, `termine/engine/slots.ts`, `sv-matching-modul/ranking.ts`, `termine/kb-slots.ts` |
| **Speicherung** | `flow/[token]/self-service-actions.ts` (bucheTerminFlow), `onboarding/slots.ts` (reserviereSlot), `faelle/[id]/_actions/termine.ts`, `dispatch/rueckrufe/actions.ts`, `faelle/[id]/_sidebar/rueckruf-actions.ts`, `termine/engine/*`, `seed-testdata` |
| **Anzeige** | `components/shared/TerminCard.tsx`, `components/termine/TerminListeClient.tsx`, `dispatch/kalender`, `dispatch/dashboard`, `kunde/fall-karte-loader.ts` + Kunde-Views, SV-Plan, `lib/kunde/jetzt-zu-tun.ts`, `lib/kb/phase-audit.ts`, `lib/faq-bot/ask.ts`, `lib/lexdrive/process-event.ts`, `lib/actions/termin-actions.ts` |
| **Emails/PDF** | `email/google/templates/Abrechnung*`, `SvMahnungSaeumnis`, `pdf/*`, `contracts/contract-pdf`, `finance/abrechnung-pdf` |
| **Sync** | `google-calendar/{events,sv-event-sync,sv-termin-sync,admin-event-sync,kalender-sync}.ts` |
| **Crons / Zeit-Math** | Billing (`end_zeit + 24h`-Default-Pay), `reminders/{sv-reminder,generate}.ts`, `cron/re-termin-eskalation`, `cron/sa-reminder` |

> Schritt 1 der Umsetzung produziert die **erschöpfende** Liste (CI-Lint-Idee: ein Check, der `toLocale*` auf Termin-Feldern ohne `timeZone` flaggt — analog zum token-audit-Ratchet).

---

## 5. Daten-Migration (der heikelste Teil)

Bestehende Zeilen wurden überwiegend als **Wall-Clock-as-UTC** gespeichert. Gewünscht ist: dieselben Wall-Clock-Ziffern als **Berlin** interpretiert → echter UTC-Instant. DST-korrekt in SQL:

```sql
-- Konzept (pro betroffener Spalte), via Supabase-Plugin (Regel 2):
update public.gutachter_termine
set start_zeit = (start_zeit::timestamp) at time zone 'Europe/Berlin',
    end_zeit   = (end_zeit::timestamp)   at time zone 'Europe/Berlin';
```
(`::timestamp` wirft den UTC-Offset weg → nackte Wall-Clock-Ziffern; `at time zone 'Europe/Berlin'` interpretiert sie als Berlin → liefert `timestamptz` UTC, DST-abhängig vom Datum.)

### 5.1 Offene Kernfrage — Provenienz
**Nicht jede** Zeile ist zwingend Wall-Clock-as-UTC: einzelne Pfade (`toISOString()` aus echten `Date`-Inputs) könnten schon echte Instants sein, und die Stunden-Verteilung der Prod-Termine ist gemischt (Stichprobe: 6/8/9/10/12/13/14/15/17/18 UTC). Ein **blinder Blanket-Shift** würde bereits-korrekte Zeilen kaputtmachen. Es gibt **keine** zuverlässige Per-Row-Provenienz.

**Empfehlung:**
1. **Fix-forward** ist sicher (neue Daten true-UTC + explizite Anzeige) — unabhängig von Altdaten.
2. Für **zukünftige** bestehende Termine (Vergangene sind irrelevant): die kleine Menge offener Termine **manuell** gegen die echten SV-Kalender (Google/CalDAV) reconcilen statt blind zu shiften. Anzahl per Query bestimmen; vermutlich < 20.
3. Migration + Code-Deploy **koordiniert** (Drift-Gefahr im Geist von Regel 2/3): neuer Code darf nicht alte Daten lesen und umgekehrt. Cutover-Reihenfolge im Plan festnageln.

---

## 6. Rollout / Sequencing

1. Helper (`berlinWallClockToUtc` + `formatBerlin`) + **vitest** (DST-Grenzen: Jan = +1h, Jun = +2h, Umstellungstage).
2. Vollständige Audit-Enumeration (Schritt-1-Liste) + optional CI-Lint.
3. Code: Generierung → Speicherung → Anzeige → Sync (boy-scout pro Cluster, jeweils tsc/Build-Gate).
4. Daten-Migration (offene/zukünftige Termine), koordiniert mit Deploy.
5. **Cross-Portal-Verifikation mit Screenshots:** Dispatch-Kalender, SV-Plan, Kunde-Fall, Slot-Picker, `/flow`-Bestätigung, Termin-Emails — überall dieselbe Zeit; Slot-Picker-Klick `09:00` ⇒ gebucht `09:00` ⇒ alle Anzeigen `09:00`.
6. Erst danach: AAR-956 kanonischer Re-Walk (grün) → `CANONICAL_FLOWLINK_ENABLED`-Flip in beiden Prod-ENVs.

---

## 7. Risiken & Koordination

- **Daten-Migration ↔ Deploy-Atomicity** — höchstes Risiko (laufende Begutachtungen; Konsistenz mit echten Google-Events).
- **Cross-Session:** `termine/engine/*` (Dispatch), `finance/*`, `kunde/*` werden von anderen Sessions angefasst → Branch/Datei-Koordination, Boy-Scout-PRs in verdaulichen Häppchen.
- **Defense-in-depth (optional):** zusätzlich `TZ=Europe/Berlin` auf den Node-Prozessen setzen — vereinfacht server-seitiges `setHours`/`new Date(naked)`, ersetzt aber **nicht** die explizite Anzeige (Client hängt an Browser-TZ). Ansatz 2 ist die robuste Basis; Node-TZ nur ergänzend nach der Migration evaluieren.
- **Tests:** Helper-Unit-Tests + slot-gen/ranking-Tests + die Cross-Portal-Smoke.

---

## 8. Abgrenzung

- **In Scope:** Termin-/Slot-Zeiten end-to-end (Generierung, Speicherung, Anzeige, Sync, zeitbasierte Crons).
- **Out of Scope:** reine Datums-(Tages-)Logik ohne Uhrzeit; Abrechnungs-Monatsgrenzen (`Date.UTC(jahr,monat,…)` — bewusst UTC).
- **Vorab erledigt:** AAR-956 Blocker A (kundenbetreuer-Rolle-Gate, PR #2347) — unabhängig, bereits offen.
