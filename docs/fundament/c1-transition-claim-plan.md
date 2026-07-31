# C1 · Ist-Erhebung + C1a-Tranchenplan — `transitionClaim` (Single-Writer-Status-Engine)

> Fundament Phase C, Paket **C1** (FUNDAMENT §5). **Dies ist die Ist-Erhebung + der C1a-Tranchen-
> Entwurf — noch NICHT der bite-sized `writing-plans`-Plan.** Der volle Plan + die Ausführung folgen,
> sobald das Oracle steht (**B1**, J1+J4-Journey-Smokes) und die offenen Entscheidungen (§ „Offene
> Entscheidungen") Aaron-reviewt sind. Erhebung gegen `origin/main` (file:line) + Prod-DB
> `paizkjajbuxxksdoycev` (READ), Stand 29.07.
>
> **Gating:** C1-**Code** ist per §2-Deps auf **B1** gegated (DoD verlangt J1+J4-Smokes grün). Diese
> Erhebung + der Tranchenplan sind **ungate-t** (gründen auf A2=done, empirisch). Sie readyen C1a.

## 0 · Kernaussage (C1 = Engine vervollständigen, nicht neu bauen)

Die Engine existiert: **`transitionFallStatus`** (`src/lib/faelle/state-machine.ts`) + der CI-Ratchet
`check:operative-status-writes` (Baseline 2, Allowlist). C1 heißt: (a) die **verbliebenen Nicht-Engine-
Writer** durch die Engine funneln, (b) das **Event-Log** bei *jedem* Übergang garantieren, (c) die
**A2/A3-Effekte** vollständig anbinden, (d) die **Ratchet-Baseline → 0** + die Scanner-Blindstelle
schließen. Der große Rest ist schon da (s. §3).

## 1 · Writer-Register `operative_status` (Ist, origin/main)

Die Grep-Erhebung trennt **Reads** (~40 Stellen: Filter/Mappings/Typen — irrelevant) von **Writes**.
Die Writes zerfallen in zwei Klassen — das ist die zentrale Erkenntnis für die C1/FG1-Partition:

### 1a · Matrix-Transition-Writer (Lifecycle `ersterfassung→…→abgeschlossen`) = **C1-Domäne**
| Writer | Stelle | Status | Kanal |
|---|---|---|---|
| **Engine** | `state-machine.ts` `transitionFallStatus` | alle Matrix-Übergänge | ✅ sanktioniert (Allowlist) |
| **Reparatur-Cursor** | `faelle/reparatur-cursor.ts` → Engine | reparatur-* | ✅ funnelt schon durch die Engine |
| ⚠ **WILD** | `api/sv-zuweisung/route.ts:284` | `sv-gesucht`/`sv-zugewiesen` | ❌ **Cast-Direkt-Write, Ratchet-BLIND** |

Der WILD-Writer: `;(claimsUpd as Record<string, unknown>).operative_status = orgPool ? 'sv-gesucht' : 'sv-zugewiesen'`.
Der `as Record<…>`-Cast bricht das `IDENT.operative_status =`-Muster des Scanners (`operative-status-write-scan.mjs`)
→ **nicht in der Baseline, nicht in der Allowlist, unsichtbar**. Folge (A2-Fund #6): kein `fall.status_changed`-
Event, keine Timeline, kein `phase_transitions` → der Event-Fan-out an Makler/Flotte/Kanzlei bei der SV-
Findung **läuft leer**. **Dies ist der einzige engine-funnel-fähige WILD-Writer → der C1a-Beweis-Writer.**

### 1b · Terminal-Set-Writer (Endzustände) = **FG1-Domäne, NICHT C1**
| Writer | Stelle | Status | Ratchet |
|---|---|---|---|
| `claims/endzustand-actions.ts` | `:116/:118` | `reguliert_vollstaendig`/`storniert`/`abgelehnt`/`in_kommunikation_vs`/… | ✅ Allowlist (Cursor-Ausnahme) |
| `lexdrive/process-event.ts` | Manual-Override | beliebig (validierungs-frei) | ✅ Allowlist (bewusst) |
| `kanzlei-wunsch/actions.ts` | — | `an_externe_kanzlei_uebergeben`/`in_kommunikation_vs` | ⏳ Baseline (grandfathered) |
| `termine/close-nur-gutachter-termin.ts` | — | `termin_durchgefuehrt` | ⏳ Baseline (grandfathered) |

**Warum nicht C1:** Diese Werte sind **keine Matrix-Transitionen** — `an_externe_kanzlei_uebergeben`,
`termin_durchgefuehrt` etc. stehen NICHT als Ziele in `FALL_STATUS_TRANSITIONS`. Sie durch die Engine zu
funneln würde die Matrix aufweichen (genau die Gefahr, die FG1 in seiner Option-A-Ablehnung benennt).
**Sie gehören zu FG1** (Terminal-Sync via Trigger + Mapping-Helper), nicht zu C1. → §4.

### 1c · Initiale Cursor bei Anlage (`.insert`) — legitim, nicht gegated
`leads/convert-lead-to-claim.ts` + `claims/create-for-fall.ts` setzen `operative_status` beim **INSERT**
(initialer Cursor). Der Scanner gated bewusst nur `.update`, nicht `.insert` → korrekt, kein C1-Target
(gehört perspektivisch zu **C2** `createCase`).

## 2 · Event-Log-Entscheidung: `phase_transitions` **trägt das Format** (kein neues `claim_events`)

Die C1-Vorgabe („Ist-Erhebung klärt, ob eine bestehende Tabelle das Format trägt; sonst additive Migration
`claim_events`") ist **entschieden**: **`phase_transitions` ist das Event-Log.** Prod-Schema (verifiziert):

`id · fall_id · **claim_id** · from_phase · to_phase · transition_at · transitioned_by · actor_rolle ·
trigger_type · grund · **payload jsonb** · created_at`

Deckt das geforderte `{claim_id, event, actor, payload, created_at}` **mehr als ab** (from/to statt einem
„event", + actor_rolle + trigger_type + grund). Die Engine schreibt es bei jedem Übergang (`state-machine.ts:324`).

**Gaps, die C1 schließt:**
1. **Non-critical fire-and-forget** (`.then()` ohne `await`, Fehler nur `console.error`, `:333`) → ein Log-Verlust ist unsichtbar. C1-DoD verlangt „bei jedem Übergang geschrieben".
2. **`claim_id` wird im Insert NICHT gesetzt** (`:324-332` schreibt `fall_id`, nicht `claim_id`) → die claim-native Achse des Logs bleibt NULL. C1a ergänzt `claim_id`.
3. **WILD-Writer (sv-zuweisung:284) schreibt `phase_transitions` gar nicht** → Log-Loch. Wird durch den Funnel (§3, C1a) automatisch geschlossen.

→ **Entscheidung (Review offen, DECISIONS):** Event-Log = `phase_transitions`. Kein `claim_events`.

## 3 · Die Engine bindet schon viel (Ist, `state-machine.ts`)

Bei jedem Übergang laufen bereits: `kanzlei_faelle`-Upsert (`:308`) · `timeline`-Insert (`:314`) ·
`phase_transitions`-Insert (`:324`) · `emitEvent('fall.storniert'|'kanzlei.uebergabe'|'fall.status_changed')`
(`:340-367`) · LexDrive-Mail bei `kanzlei-uebergeben` (`:370`) · `tasks`-Insert (`:514`) ·
`claim_payments`-Upsert bei `zahlung-eingegangen` (`:273`). **C1 muss diese Effekte also nicht neu bauen —
nur (a) sicherstellen, dass jeder Writer durch die Engine läuft (→ erbt alle Effekte) und (b) die aus
A3 fehlenden Sends ergänzen** (P1-Lücken; final in **C3** über die Outbox).

## 4 · FG1-Überschneidung („andocken, nicht parallel erfinden")

**FG1** (`docs/superpowers/plans/2026-07-11-flag-fg1-claims-writer-funnel.md`) und C1 partitionieren die
`operative_status`-Writer sauber — **keine Doppelarbeit, ein Berührungspunkt:**

| | **C1** | **FG1** |
|---|---|---|
| Achse | Matrix-Transition-Funnel | `status`→`operative_status`-Terminal-Sync |
| Mechanismus | alle Matrix-Writer durch `transitionFallStatus` | Trigger + `operative-status-mapping.ts` + CHECK |
| Engine (`state-machine.ts`) | **vervollständigt** sie | **lässt sie unangetastet** (Option-A-Ablehnung) |
| Target-Writer | `sv-zuweisung` (WILD) | `endzustand-actions`, `close-nur-gutachter` (die C1-Baseline-2!) |

**Berührungspunkte / Reihenfolge-Klärung:**
- **`operative_status`-CHECK ist bereits gelandet** (verifiziert: `claims_operative_status_check`, 33-Wert-Achse) — der DB-Ratchet, den FG1 Task 5 vorsah, existiert. **C1 erbt ihn**, muss ihn nicht bauen. (FG1-**Trigger** war nicht sichtbar → C1a verifiziert FG1-Ship-Status vor Start.)
- Die **2 C1-Baseline-Writer** (`kanzlei-wunsch`, `close-nur-gutachter`) sind **FG1-Targets** (Terminal-Sync). Wenn FG1 sie funnelt/synct, **sinkt die C1-Baseline über FG1** — C1 muss sie nicht selbst funneln, sondern nur die Baseline nachziehen. → In C1b als „FG1-erledigt, Baseline-Abbau" behandeln, nicht doppelt umbauen.
- Ergebnis: **C1s echter Funnel-Rest = der eine WILD-Writer `sv-zuweisung`** + die Event-Log-Vollständigkeit + die Scanner-Härtung.

## 5 · C1a-Tranchen-Entwurf (Beweis-Tranche; voller `writing-plans`-Plan folgt bei B1)

Doc-Vorgabe C1a: „Modul + Event-Log-Migration + Umstellung von genau 2 Writern (einer WILD) als Beweis".
Angepasst an den Ist (Modul + Event-Log existieren schon):

- **C1a-1 — WILD-Writer funneln (der Beweis):** `sv-zuweisung/route.ts:284` von Cast-Direkt-Write auf
  `transitionFallStatus(fallId, orgPool ? 'sv-gesucht' : 'sv-zugewiesen', { user_id, grund })` umstellen.
  Erbt damit `phase_transitions` + `fall.status_changed`-Event + Timeline → **schließt A2-#6** (der leere
  Event-Fan-out an Makler/Flotte/Kanzlei bei SV-Findung wird live). Voraussetzung: `ersterfassung→sv-gesucht`
  + `→sv-zugewiesen` sind Matrix-Kanten (verifizieren — laut A2 ja).
- **C1a-2 — 2. Writer (nicht-WILD):** Der reparatur-cursor funnelt bereits (bestehender Beweis, dass
  Matrix-Writer durch die Engine gehen). Als *aktive* 2. Umstellung: **einen der Baseline-2 in Abstimmung
  mit FG1** — ODER, falls FG1 sie zuerst nimmt, den Beweis auf „sv-zuweisung + Event-Log-claim_id" verengen
  (DECISIONS-Entscheidung nötig, s.u.).
- **C1a-3 — Event-Log claim-nativ:** `state-machine.ts:324` `phase_transitions`-Insert um `claim_id`
  ergänzen (aus dem Bridge-Lookup, den die Engine ohnehin hat) + den Insert von fire-and-forget auf
  `await` + non-fatal-catch heben (Log-Verlust wird geloggt, bricht den Übergang aber nicht).
- **C1a-4 — Scanner-Blindstelle:** `operative-status-write-scan.mjs` um die **Cast-Form**
  `(IDENT as T).operative_status =` erweitern (Unit-Test + Baseline neu snapshotten). Sonst bleibt die
  nächste Cast-Evasion unsichtbar.

**C1b+** = die verbleibende Writer-Liste (v.a. Baseline-Abbau nach FG1) in Tranchen.
**Letzte Tranche** = Ratchet-Baseline → **0** + der gehärtete Scanner blockt jeden neuen Nicht-Engine-Write.

## 6 · Offene Entscheidungen (→ `DECISIONS.md`, Aaron-Review vor C1a-Code)

1. **Event-Log-Tabelle:** `phase_transitions` bestätigen (statt neuem `claim_events`)? *(Empfehlung: ja — trägt das Format, 1 Consumer schon live.)*
2. **C1/FG1-Partition + Reihenfolge:** Nimmt **FG1** die 2 Terminal-Baseline-Writer (dann C1 nur Baseline-Abbau), oder übernimmt C1a einen davon als 2. Beweis-Writer? *(Empfehlung: FG1 behält die Terminal-Domäne; C1a-Beweis = sv-zuweisung + Event-Log-claim_id; die „2 Writer"-Vorgabe via sv-zuweisung + einem FG1-koordinierten Terminal.)*
3. **Terminal-Vereinheitlichung (aus der Auto-Close-Lücke, [[audit-c1-auto-close-luecke-zahlung-eingegangen]]):** EIN Abschluss-Terminal — `abgeschlossen` (Engine-Cascade) vs. `reguliert_vollstaendig` (Endzustand)? Und: den toten 48h-Grace-Cron + `schlussabrechnung_am`-Gate + das unverdrahtete `recordZahlung` in C1 retiren? *(Produkt-Entscheidung Aarons — steuert die Cascade-Regel.)*

## 7 · DoD (C1 gesamt, unverändert aus §5) + Nicht-Ziele

**DoD:** Grep-Nachweis 0 `operative_status`-Writes außerhalb der Engine (bzw. Baseline dokumentiert Rest);
J1+J4-Smokes grün (**B1**); Ratchet in CI; Event-Log (`phase_transitions`) bei jedem Übergang (SQL-Stichprobe).
**Nicht-Ziele:** keine neuen Statuswerte; keine Timeline-UI-Umbauten; keine Flag-Migrationen (FG-Programm);
**keine Terminal-Writer-Funnel** (das ist FG1).

## 8 · Prod-Kontext (warum jetzt unblutig)
Prod-Statusverteilung (29.07., 23 Claims): `ersterfassung 13 · storniert 4 · kanzlei-uebergeben 2 ·
termin_durchgefuehrt 1 · sv-termin 1 · NULL 1 · abgelehnt 1`. Der WILD-`sv-zuweisung`-Pfad ist dormant
(Org-Pool 0 Orgs; die Direkt-Zuweisung läuft heute über andere Pfade) → C1a ist ein **struktureller Fix
ohne Live-Feuer**, ideal als erste, risikoarme C-Tranche sobald B1 steht.
