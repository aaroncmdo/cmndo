# Termin-Engine — Consumer-Contract

**Die Termin-Engine (`@/lib/termine/engine`) ist die EINZIGE Quelle für Slots, Belegung, Buchung, Matching und Kalender-Sync rund um `gutachter_termine`.** Konsumiere sie über die unten gelisteten Funktionen — **querie `gutachter_termine` nicht direkt** für diese Zwecke. Jede der Regeln hier ist aus einem konkreten Bug entstanden (Referenzen unten).

---

## TL;DR — die Regeln (verbindlich)

| Aufgabe | ✅ NUTZE | ❌ NIE |
|---|---|---|
| Lead-Termin finden | `findeTerminFuerLead(db, leadId)` | `.eq('lead_id', x)` direkt auf `gutachter_termine` |
| Freie Slots eines Assignees | `freieSlots(assignee, vonIso, bisIso, opts, db)` | eigene Slot-Generierung aus working_hours |
| SV-Belegung / Busy-Check | `ladeBelegung` / `pruefeBelegung` | hand-gerollte Busy-Queries (Google/CalDAV/Termine einzeln) |
| Reservieren / Buchen | `reserviere` bzw. `planeTermin(modus:'buchen')` | direktes `.insert()` in `gutachter_termine` |
| Beste Person + 3 Slots | `findeBestePerson` bzw. `planeTermin(modus:'vorschlagen')` | `findBestSV` neu nachbauen |
| Assignee filtern | `.eq('assignee_id', x).eq('assignee_typ', 'sachverstaendiger')` | `.eq('sv_id', x)` (Legacy, wird gedroppt) |
| Bestätigen / Verlegen / Absagen | `bestaetige` / `verlege` / `sageAb` | direkte `status`-Updates |
| Besichtigungsort setzen/korrigieren | `korrigiereBesichtigungsort` / `bestaetigeBesichtigungsort` | direkte `besichtigungsort_*`-Updates |
| Externe Kalender (Google/CalDAV) | `syncTerminToExternalCalendar` / `entferneTerminAusExternemKalender` | Google-/CalDAV-API direkt aufrufen |
| Anon-/flow: SV-Profil zeigen | `toOeffentlichesSvProfil` / `planeTerminOeffentlich` | rohes `SvMatchCandidate` an den Client (PII-Leak!) |

---

## Die kanonische API (`@/lib/termine/engine` Barrel)

**Lesen — Belegung & Slots:**
- `freieSlots(assignee, vonIso, bisIso, opts?, db?)` → `TagVerfuegbarkeit[]` — freie Slots im Fenster (Arbeitszeit − Belegung − vergangene; floored an `vonIso`). `opts.schadenort` → Reachability-Filter; `opts.zusaetzlicheBelegung` → zusätzliche Soft-Holds.
- `ladeBelegung(assignee, vonIso, bisIso, db?)` → `BelegungsFenster[]` — alle Busy-Fenster aus `v_belegung` (buchung ∪ extern ∪ ausnahme).
- `pruefeBelegung` / `pruefeBelegungStrict(assignee, von, bis, db?)` → frei/belegt-Check.

**Schreiben — Lifecycle:**
- `reserviere(input)` → race-sicher (EXCLUSION-Constraint) reservieren. Schreibt `assignee_*` + `bezug_*` (+ Legacy-FK via Dual-Write-Brücke).
- `bestaetige(terminId, opts?)` → bestätigen (+ Geocoding-Garantie für Vor-Ort).
- `sageAb` / `verlege` / `entscheideVerlegung` → Absage / Verlegung (State-Machine).
- `korrigiereBesichtigungsort` / `bestaetigeBesichtigungsort` → Ort-Korrektur.

**Matching & Buchungs-Router:**
- `findeBestePerson(input)` → bester SV (Score + Tenure-Tie-Break) + Auto-Reservierung optional.
- `planeTermin(input)` → universeller 2×2-Router: Assignee fix/unbekannt × Slot fix/unbekannt → `vorschlagen` (max 3 Slots, 2+1-Verteilung) oder `buchen`.

**Kalender-Sync:**
- `syncTerminToExternalCalendar(terminId, opts)` / `entferneTerminAusExternemKalender` — assignee-generisch (Google + CalDAV).

**Separate Module (nicht im Barrel, aber kanonisch):**
- `findeTerminFuerLead(db, leadId)` aus `@/lib/termine/finde-termin-fuer-lead` → `{ id, sv_id } | null` (jüngster aktiver Lead-Termin, **Dual-Lookup** lead_id ∪ bezug).
- `toOeffentlichesSvProfil` / `planeTerminOeffentlich` aus `@/lib/sv-matching-modul` → **leak-sichere** Anon-Projektion (AAR-941).

---

## Datenmodell — warum die Regeln so sind

`gutachter_termine` hat **zwei polymorphe Achsen** (kanonisch) + Legacy-Spalten (transitional):

| Achse | Kanonisch | Legacy (Drop geplant) |
|---|---|---|
| **WER** (Assignee) | `assignee_id` + `assignee_typ` (`'sachverstaendiger'\|'sv_lead'\|'kundenbetreuer'\|'kanzlei'`) | `sv_id` / `sv_lead_id` / `kb_id` |
| **WOFÜR** (Bezug) | `bezug_typ` (`'claim'\|'fall'\|'lead'`) + `bezug_id` | `lead_id` / `fall_id` / `claim_id` |

- **Dual-Write-Brücke:** Die Engine schreibt während der Transition BEIDE (`assignee_id` UND `sv_id`). Daher funktionieren alte `.eq('sv_id')`-Reader noch — aber neuer Code nutzt `assignee_id` (sv_id wird gedroppt, CMM-49).
- **validate-Trigger-Falle:** `reserviere` schreibt für den Bezug NUR `bezug_typ`/`bezug_id`, **kein** `lead_id` (ein DB-Validate-Trigger lehnt doppelten Legacy-Bezug ab). → Self-Service-Lead-Termine sind **bezug-nativ** (`lead_id IS NULL`) → ein `.eq('lead_id')`-Reader **verfehlt** sie → **immer `findeTerminFuerLead`** (Dual-Lookup).
- **`v_belegung`** ist die EINE Busy-Quelle: `gutachter_termine` (buchung) ∪ `sv_kalender_events_cache` (extern) ∪ `verfuegbarkeits_ausnahmen` (ausnahme). `ladeBelegung`/`freieSlots` lesen sie — niemand baut Busy selbst.

---

## Anti-Patterns (mit dem Bug, der sie verbietet)

- **`.eq('lead_id', x)` auf `gutachter_termine`** → verfehlt bezug-native Self-Service-Termine → Termin verwaist (kein Claim-Link/Auftrag/Email). *Bug: #2580-Reader-Strecke (#8).* → `findeTerminFuerLead` bzw. `.or('lead_id.eq.${x},and(bezug_typ.eq.lead,bezug_id.eq.${x})')`.
- **`.eq('sv_id', x)`** → Legacy-Spalte, wird gedroppt (CMM-49 sv_id-Drop). → `.eq('assignee_id', x).eq('assignee_typ','sachverstaendiger')`.
- **direktes `.insert()` in `gutachter_termine`** → umgeht den EXCLUSION-Constraint (`gutachter_termine_no_assignee_overlap`, Doppelbuchungs-Schutz) UND die Dual-Write-Brücke. → `reserviere`.
- **hand-gerollte Busy-Query** (Google/CalDAV/Termine getrennt) → divergiert von `v_belegung`. *Bug: cache-busy #2601 — Onboarding lieferte 128 Slots, Engine 116.* → `ladeBelegung`/`freieSlots`.
- **rohes `SvMatchCandidate` an den anon-Client** → leakt `score`/`etaFromBueroMin`/`reasons`/`nachname`. *AAR-941.* → `toOeffentlichesSvProfil` (geschlossene Whitelist).

---

## In-flight Migrationen (Stand 2026-06-10)

- **sv_id → assignee_id** (CMM-49, Session `fb34de27`): Reader-Sweep läuft. Dual-Write-Brücke offen bis „Flip-Ready". Engine-Seite (`writes.ts:assigneeLegacyPatch`, `kalender-sync`, `state-transitions`) flippt die Termin-Engine-Session synchron auf deren Signal. Marker: `COORDINATION-cmm49-svid-befund.md`.
- **lead_id-Reader → bezug-aware** (#2580-Strecke, Session `753d8096`): ~8 Reader auf `findeTerminFuerLead` migrieren. Marker: `COORDINATION-flow-relink-bezug-bug.md`.

## Durchsetzung (geplant)

Sobald die obigen Migrationen gesettled sind: `check:termin-engine-contract`-Ratchet (analog `check:component-set`/`check:knip`), der NEUE `.eq('lead_id')`/`.eq('sv_id')`-Direktfilter auf `gutachter_termine` außerhalb `engine/*` gegen eine Baseline blockt. Bis dahin gilt dieser Contract advisory — Boy-Scout beim Anfassen.
