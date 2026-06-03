# Plan: App-weite Zeitzonen-Korrektur — Umsetzung (Ansatz 2)

- **Datum:** 2026-06-03
- **Spec:** `docs/superpowers/specs/2026-06-03-app-weite-zeitzonen-korrektur.md` (Ansatz 2, von Aaron abgenommen)
- **Ziel:** Termin-Zeiten end-to-end korrekt — true-UTC speichern, überall explizit `timeZone:'Europe/Berlin'` anzeigen, Berlin-verankerte Slot-Generierung. Gatet den AAR-956 Canonical-Go-Live.

---

## Revalidierte Vorbedingungen (2026-06-03, empirisch geprüft)

| Check | Ergebnis | Konsequenz für den Plan |
|---|---|---|
| DST-Helper-Technik (`berlinWallClockToUtc` via Intl-Offset) | ✅ korrekt: Jun 09:00→`07:00Z`, Jan 09:00→`08:00Z`, Sprungstunde sauber | Helper-Ansatz steht (Task 1) |
| Zukünftige aktive `gutachter_termine` | **0** | **Migration = Fix-forward** — kein Live-Termin-Shift |
| Zukünftige `gfa.reservierter_slot_von` | **0** | dito |
| Aktive Termine gesamt | 16 (alle in der Vergangenheit) | optionaler historischer DST-Backfill, non-operational |
| `faelle.sv_termin` | Spalte existiert nicht | eine Zeitquelle weniger |
| `START_LINK_HMAC_SECRET` (beide ENVs) | gesetzt | Re-Walk-Voraussetzung erfüllt |
| Anzeige-Stellen `toLocale*`/Intl | 89 in 60 Files (gesamt); termin-spezifisch ~15-20 | Helper + Lint macht es beherrschbar |

**Größtes Spec-Risiko (riskante Daten-Migration laufender Termine) ist durch „0 future" entschärft.**

---

## Tasks (bite-sized, jeder mit Verify)

### Task 1 — Helper + Unit-Tests
- `src/lib/google-calendar/timezone.ts`: `berlinWallClockToUtc(wall): string` (Intl-Offset-Technik, DST-safe) + `formatBerlin(iso, opts?): string` (kapselt `timeZone:'Europe/Berlin'`).
- vitest: DST-Grenzen (15.01.=+1h, 03.06.=+2h, 29.03. Sprungtag, 25.10. Rück-Umstellung) + Round-Trip-Sanity gegen `toBerlinWallClock`.
- **Verify:** `vitest` grün · `tsc --noEmit`.

### Task 2 — Audit-Enumeration (vollständige File:Line-Liste)
- Grep-getrieben pro Kategorie (Generierung / Speicherung / Anzeige / Sync / Crons), abhaken. Cluster siehe Spec §4.
- **Verify:** Checkliste vollständig, jede Stelle einer Task (3-6) zugeordnet.

### Task 3 — Generierung Berlin-verankert
- `onboarding/slots.ts` + `termine/engine/slots.ts`: `slotVon`/`slotBis` über `berlinWallClockToUtc(\`${datum}T${HH}:${MM}:00\`)` statt `setHours()` (server-lokal). → Belegt-Check + Reachability rechnen gegen echte Instants (fixt nebenbei den 2h-Versatz im Google/CalDAV-Busy-Abgleich).
- `sv-matching-modul/ranking.ts`: ausgegebener `SlotVorschlag.start/end` = echter Instant.
- **Verify:** slot-gen/ranking-Tests; ein generierter „09:00 Berlin"-Slot = `…T07:00:00Z` (Sommer).

### Task 4 — Speicherung echte Instants
- `bucheTerminFlow` (self-service-actions), `reserviereSlot` (slots.ts), `termine/engine/*`, `dispatch/rueckrufe/actions.ts`, `faelle/[id]/_sidebar/rueckruf-actions.ts`, `faelle/[id]/_actions/termine.ts`.
- **Verify:** Test-Buchung „09:00" → DB `start_zeit = 07:00Z` (Sommer) / `08:00Z` (Winter).

### Task 5 — Anzeige explizit Berlin
- Alle termin-spezifischen Renders auf `formatBerlin(...)`: `/flow`-Bestätigung (`FlowWizardKfz`), `SvSlotAuswahl`, `TerminCard`, `TerminListeClient`, `kunde/TerminSectionCard` + Verschieben-Modals, `sv/termin/[token]`, `mitarbeiter/termine|kundentermine`, Termin-Emails, Termin-PDFs, `dispatch/kalender`.
- Optional: CI-Lint (`toLocale*` auf Termin-Feld ohne `timeZone` → Warnung/Block, analog token-audit-Ratchet).
- **Verify:** `next build` grün; visuelle Spot-Checks.

### Task 6 — Calendar-Sync verifizieren
- `google-calendar/*` bekommt jetzt echte Instants → `toBerlinWallClock`-Pfad ist danach korrekt. Kein Code-Change erwartet, nur Verifikation.
- **Verify:** Dry-Run/Lese-Check: ein Termin-Sync erzeugt Google-Event-Body mit korrekter Berlin-Wall-Clock (kein 2h-Versatz).

### Task 7 — (optional) historischer Backfill
- 16 historische Termine DST-aware shiften (`(start_zeit::timestamp) at time zone 'Europe/Berlin'`) — nur für saubere Historien-Anzeige. Über Supabase-Plugin (Regel 2). **Skippbar** (non-operational, da Vergangenheit).
- **Verify:** Stichprobe vor/nach; Migration-File == getrackte Version.

### Task 8 — Cross-Portal-Verifikation (Screenshots)
- Slot-Picker-Klick `09:00` ⇒ gebucht `09:00` ⇒ **dieselbe** Zeit in: Dispatch-Kalender, SV-Plan, Kunde-Fall, `/flow`-Bestätigung, Termin-Email.
- **Verify:** Screenshot-Satz, alle konsistent.

### Task 9 — AAR-956 kanonischer Re-Walk + Flip
- PR #2347 (Fix A) gemergt → Option B re-applien → Vollpfad-Walk (Fix A + TZ): Fall entsteht **und** Zeit überall korrekt → Cleanup (0 Reste).
- **Flip `CANONICAL_FLOWLINK_ENABLED`** in beiden Prod-ENVs — **nur auf Aarons explizites „go".**

---

## Cutover / Reihenfolge & Koordination
- Tasks 1→2→(3,4,5 parallelisierbar)→6→8. Task 7 separat/optional. Task 9 zuletzt.
- **Kein Mixed-State-Risiko** beim Deploy: 0 zukünftige Termine → Code-Deploy ohne gleichzeitige Migration unkritisch.
- **Cross-Session:** `termine/engine/*` + `dispatch/rueckrufe/*` liegen in Dispatch-Domäne (aktive Sessions `dispatch-config-unify-*`) → in verdaulichen Boy-Scout-PRs, vorher Branch/Datei abstimmen.
- Jeder Task-PR `--base staging`, Build-Gate hart.

## Offene Mini-Entscheidungen
- Task 5 CI-Lint: bauen (Drift-Bremse) oder erst Backlog? (Empfehlung: leichtgewichtig bauen — verhindert Rückfall.)
- Task 7 Backfill: ausführen oder als „historisch, egal" dokumentieren? (Empfehlung: dokumentieren + skippen, da Vergangenheit.)
