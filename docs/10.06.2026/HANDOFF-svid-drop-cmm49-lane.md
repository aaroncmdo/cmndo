# Handoff: `gutachter_termine.sv_id`-Drop → CMM-49/Entity-Lane

**Von:** Termin-Engine-Session (`kitta/termine-engine-*`)
**An:** CMM-49/Entity-Lane (Session `fb34de27`, aktuell `kitta/cmm49-routekey-b-bridge-backfill`)
**Datum:** 2026-06-10
**Entscheidung Aaron:** sv_id-Drop NICHT als paralleler Termin-Engine-Sweep (Trample-Risiko mit CMM-49 auf derselben Tabelle), sondern Teil eurer Lane — gleicher kanonischer Move (`sv_id` → `assignee_id`/`assignee_typ`, polymorph).

---

## TL;DR

`gutachter_termine.sv_id` ist Legacy. Kanon = `assignee_id` + `assignee_typ` (`'sachverstaendiger' | 'sv_lead' | 'kundenbetreuer' | 'kanzlei'`). **Heute keine Live-Divergenz**, weil zwei Brücken `sv_id` füllen:

1. **Engine-Dual-Write** — `engine/writes.ts:reserviere` schreibt `assignee_id` UND `sv_id` (`assigneeLegacyPatch`, „Dual-Write für Phase-3-Lesbarkeit").
2. **Normalize-Trigger** `trg_gutachter_termine_normalize_assignee` (Mig `20260602074225`) — leitet `assignee_id` AUS `sv_id` ab, **EINSEITIG** (kein Reverse). Sicher nur solange irgendwer `sv_id` schreibt.

→ Der Drop ist **gated-last**: erst alle Reader+Writer auf `assignee_id` repointen, dann Brücken entfernen, dann DDL.

**Overlap-Schutz bleibt:** assignee-gekeyter Exclusion-Constraint existiert bereits (`20260602081227_gutachter_termine_exclusion_assignee.sql`) → `sv_id`-Drop verliert KEINE Doppelbuchungs-Sicherung.

---

## ⭐ Ownership-Boundary: App (fb34de27) vs Engine (Termin-Engine) — eure #4

**Directory-Regel, eindeutig:**

- **`src/lib/termine/engine/*` = ENGINE = mein Revier. NICHT anfassen.** Ich flippe synchron auf euer **„Flip-Ready"-Signal** (Schritt 3+4). Präzise Flip-Checkliste (4 Files, file:line verifiziert):
  - `writes.ts:26` — `assigneeLegacyPatch` `case 'sachverstaendiger': { sv_id }` raus = **das ist DIE Dual-Write-Brücke**. Entfernen erst wenn ALLE App-Reader auf `assignee_id` sind, sonst gehen sie blind.
  - `state-transitions.ts:62,87` — Verlegung schreibt `sv_id: alt.sv_id` + select `sv_id` → `assignee_typ/assignee_id`.
  - `bestaetige.ts:23,47-50` — select `sv_id` + `createErstgutachtenAuftrag(…, sv_id)` → `assignee_id` (typ `sachverstaendiger`). ⚠️ **cross-axis:** hier hängt auch `fall_id` dran — wenn ihr diese Zeilen fürs faelle-Axis anfasst, Heads-up an mich, sonst doppelter Engine-Touch.
  - `kalender-sync.ts:110,150` — `.eq('sv_id', …)` ×2 → `.eq('assignee_id', …).eq('assignee_typ','sachverstaendiger')`.
- **Alles andere = EUER Sweep** (die 43 Reader + App-Writer unten, **minus** `engine/*`).
- **`scripts/` + seed/verify (Test-Fixtures) = low-prio, zuletzt.**

**Axis-Parallelität (bestätigt euren #3):** sv_id-Axis ist NICHT auf den faelle-`DROP` gegated — `assignee_id` ⟂ `claim_id`. Beide Achsen laufen parallel; nur wo ein File BEIDE Spalten anfasst (`bestaetige.ts`, dispatch-/kunde-Reader mit `fall_id`+`sv_id`) lohnt der Doppel-Repoint in einem PR (euer „kein Doppel-Touch").

---

## Repoint-Recipe (mechanisch)

| Pattern (alt) | Pattern (neu) |
|---|---|
| `.eq('sv_id', X)` | `.eq('assignee_id', X).eq('assignee_typ', 'sachverstaendiger')` |
| `.select('…, sv_id, …')` | `.select('…, assignee_id, assignee_typ, …')` + Consumer liest `assignee_id` |
| `.insert({ sv_id: X, … })` | `.insert({ assignee_typ: 'sachverstaendiger', assignee_id: X, … })` — ODER via `engine.reserviere` |
| `.update({ … }).eq('sv_id', X)` | `.update({ … }).eq('assignee_id', X).eq('assignee_typ','sachverstaendiger')` |

**Achtung pro File:** manche Reader wollen evtl. auch `sv_lead`/`kb` (dann `assignee_typ`-Filter weglassen oder per `.in('assignee_typ', […])`). Default = SV-only.

---

## Migrations-Reihenfolge (GATED — Reihenfolge ist hart)

1. **Reader-Sweep** (43 Files, Liste unten) → `assignee_id`/`assignee_typ`.
2. **Writer-Sweep** (~30 Files, Test/Seed exkl.) → `assignee_id`/`assignee_typ` oder `engine.reserviere`.
3. **Brücke entfernen:** `engine/writes.ts:assigneeLegacyPatch` — `sv_id`-Case raus. ⚠️ **ENGINE = mein Revier — vor dem Entfernen mit mir abstimmen** (gleichzeitig `sv_lead_id`/`kb_id` = gleiche Klasse, eigene Entscheidung).
4. **Trigger weg:** `DROP TRIGGER trg_gutachter_termine_normalize_assignee` + Funktion — via **Supabase-MCP `apply_migration`** (Regel 2, kein raw SQL / keine CLI).
5. **DDL `ALTER TABLE gutachter_termine DROP COLUMN sv_id`** — **GATED-LAST**, nach Voll-Smoke (Public + Admin + Dispatch + SV + Kunde, Screenshot-Pflicht). (Falls ihr die ganze Legacy-FK-Klasse mitnehmt: `sv_lead_id`/`kb_id` analog.)

---

## Reader-Inventar (43, nach Revier) — `.eq('sv_id')` im `gutachter_termine`-Kontext

**app/gutachter (16):**
- `src/app/gutachter/auftraege/export-action.ts`
- `src/app/gutachter/auftraege/page.tsx`
- `src/app/gutachter/fall/[id]/_actions/konfrontation.ts`
- `src/app/gutachter/fall/[id]/actions.ts`
- `src/app/gutachter/fall/[id]/page.tsx`
- `src/app/gutachter/feldmodus/_fallakte/actions.ts`
- `src/app/gutachter/feldmodus/page.tsx`
- `src/app/gutachter/heute/page.tsx`
- `src/app/gutachter/heute/private-events-actions.ts`
- `src/app/gutachter/kalender/actions.ts`
- `src/app/gutachter/kalender/page.tsx`
- `src/app/gutachter/profil/page.tsx`
- `src/app/gutachter/termine/[id]/actions.ts`
- `src/app/gutachter/termine/[id]/navigation/page.tsx`
- `src/app/gutachter/termine/[id]/page.tsx`
- `src/app/gutachter/termine/[id]/vor-ort/page.tsx`

**app/kunde (4):**
- `src/app/kunde/faelle/[id]/kalender/page.tsx`
- `src/app/kunde/re-termin/[token]/actions.ts`
- `src/app/kunde/re-termin/[token]/page.tsx`
- `src/app/kunde/termin/[token]/KundeTrackingClient.tsx`

**app/api + cron (3):**
- `src/app/api/cron/send-reminders/route.ts`
- `src/app/api/cron/slot-ttl-cleanup/route.ts`
- `src/app/api/sv/upload-with-ocr/route.ts`

**app/dispatch (1):** `src/app/dispatch/leads/[id]/_actions/sv-termin.ts`
**app/flow (1):** `src/app/flow/[token]/actions.ts` ⚠️ *Funnel — aar-956-Revier, mit denen abstimmen*
**app/admin (1):** `src/app/admin/sachverstaendige/_karte/actions.ts`

**lib/termine — MEIN Revier (6, mit mir abstimmen):**
- `src/lib/termine/actions.ts`
- `src/lib/termine/engine/kalender-sync.ts` *(SYNC_SELECT liest sv_id für Kontext — flippt mit Engine)*
- `src/lib/termine/get-sv-tagesplan.ts`
- `src/lib/termine/sv-ablehnung.ts`
- `src/lib/termine/trigger-losgefahren.ts`
- `src/lib/termine/verlegung-vorschlaege.ts`

**lib (sonstige, 8):**
- `src/lib/actions/storno-actions.ts`
- `src/lib/actions/termin-actions.ts`
- `src/lib/analytics/sv-performance.ts`
- `src/lib/auftrag/queries.ts`
- `src/lib/dispatch/reachability.ts`
- `src/lib/onboarding/slots.ts`
- `src/lib/private-events/list-events-for-date.ts`
- `src/lib/reminders/sv-reminder.ts`

**hooks (1):** `src/hooks/useGeoTracking.ts`
**scripts (2, low-prio):** `scripts/verify-engine-kalender-sync.mts`, `src/scripts/resync-google-calendar.ts`

---

## Writer-Inventar (`from('gutachter_termine')` + `sv_id:`-Key)

**Test/Seed (low-prio, zuletzt):** `scripts/seed-test-data.ts`, `scripts/verify-engine-p2-2-constraint.mts`, `scripts/verify-engine-p2-3b-bestaetige.mts`, `scripts/verify-engine-p2-3c-transitions.mts`, `src/app/api/admin/create-test-fall/route.ts`, `src/app/api/seed-testdata/route.ts`, `src/lib/smoke/lifecycle-seed.ts`

**Engine — MEIN Revier (Brücke, Schritt 3):** `src/lib/termine/engine/writes.ts` (`assigneeLegacyPatch`), `src/lib/termine/engine/state-transitions.ts`

**Echte Writer (Sweep):** `src/app/admin/sachverstaendige/_karte/actions.ts`, `src/app/api/cron/slot-ttl-cleanup/route.ts`, `src/app/api/sv-zuweisung/route.ts`, `src/app/dispatch/kalender/page.tsx`, `src/app/dispatch/leads/[id]/_actions/sv-termin.ts`, `src/app/dispatch/leads/[id]/page.tsx`, `src/app/flow/[token]/actions.ts` ⚠️*aar-956*, `src/app/gutachter/fall/[id]/actions.ts`, `src/app/gutachter/feldmodus/_fallakte/actions.ts`, `src/app/gutachter/kalender/actions.ts`, `src/app/kunde/re-termin/[token]/actions.ts`, `src/app/kunde/termin/[token]/actions.ts`, `src/app/mitarbeiter/kundentermine/page.tsx`, `src/lib/actions/dispatch-fall-actions.ts`, `src/lib/actions/storno-actions.ts`, `src/lib/actions/termin-actions.ts`, `src/lib/auftrag/create.ts`, `src/lib/auftrag/queries.ts`, `src/lib/claims/get-kunde-faelle.ts`, `src/lib/dispatch/karte/get-termine-today.ts`, `src/lib/dispatch/konfrontations-dispatch-lite.ts`, `src/lib/google-calendar/sv-event-sync.ts`, `src/lib/onboarding/slots.ts`, `src/lib/reminders/generate.ts`, `src/lib/reminders/sv-reminder.ts`, `src/lib/termine/actions.ts`, `src/lib/termine/finde-termin-fuer-lead.ts`, `src/lib/termine/loader.ts`, `src/lib/termine/verlege-nach-no-show.ts`

---

## ⬅️ BEFUND-RÜCKGABE ERBETEN (Aaron-Wunsch)

Gib mir bitte einen Befund zurück (per Coordination-Marker / Relay an die Termin-Engine-Session):

1. **Überlappung:** Welche dieser Files habt ihr im CMM-49-Route-Key-B-Sweep **schon** auf `assignee_id`/`claim_id` repointed? (Doppelarbeit vermeiden.)
2. **Einordnung:** Passt der `sv_id`-Drop in eure Route-Key-B-Strecke (gleicher kanonischer Move), oder eigener Slot direkt danach?
3. **Gate-Status:** Wann ist der DDL-`DROP COLUMN sv_id` für euch feasible — was muss vorher in CMM-49 landen?
4. **Engine-Koordination:** Schritt 3 (Brücke `assigneeLegacyPatch` + `kalender-sync` SYNC_SELECT + `state-transitions`) ist mein Revier — sag mir, wann ihr die Reader durch habt, dann flippe ich die Engine-Seite synchron.
