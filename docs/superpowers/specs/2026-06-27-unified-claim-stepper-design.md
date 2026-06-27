# Unified Claim Stepper — eine kanonische Phasen-Quelle

**Datum:** 2026-06-27 · **Branch:** `kitta/unified-claim-stepper` (off staging) · **Auftrag:** Aaron — „ein Stepper am Claim"

## Problem

Es existieren **zwei parallele Lifecycle-Systeme**, die unabhängig abgeleitet werden und divergieren:

- **`claims.operative_status`** — der Engine-Cursor (`src/lib/faelle/state-machine.ts`, validierte Übergänge). Dokumentierter „SSoT" des operativen Flows.
- **`v_claim_phase` / `src/lib/claims/lifecycle.ts`** — der portal-sichtbare 4-Phasen-Stepper (Erfassung/Begutachtung/Regulierung/Abschluss + Sub-Phase), **milestone-getrieben** abgeleitet aus Auftrag / kanzlei_faelle / claims.status. Bit-gleich gehalten zur SQL-View per **Parity-Test**.

Folge der Divergenz (live verifiziert 27.06.): Fälle mit `operative_status='sv-termin'`/`'gutachten-eingegangen'`, aber ohne `erstgutachten`-Auftrag-Milestone, zeigen im Stepper **„Erfassung / stale 23 WT"** — 10 komplett + 45 nur_gutachter betroffen. Der Stepper widerspricht dem operativen Stand.

## Entscheidung (Aaron approved)

**Eine kanonische Quelle: `operative_status` treibt die Phase**, abgeleitet **deterministisch aus DB-Feldern je nach Befüllung** (robust gegen jeden Datenstand). `claims.status` wird auf seine echte Achse reduziert: **das terminale Ergebnis** (nur im Abschluss). **Die Output-Taxonomie (main_phase/sub_phase-Werte) bleibt unverändert** → die 40+ Konsumenten bleiben unangetastet; nur die *Ableitung* dreht.

## Die Ableitung — priorisierte Feld-Kaskade

Deterministisch, top-down (erste passende Regel gewinnt):

```
1. claims.status ∈ TERMINAL
   → main=abschluss, sub=ABSCHLUSS_SUBSTATE[status]
   (Endurteil-Feld gefüllt ⇒ gewinnt IMMER, überschreibt operative_status)

2. claims.status ∈ REGULIERUNG-SIGNAL {in_kommunikation_vs, abgelehnt}
   UND bucket(operative_status) < regulierung
   → main=regulierung, sub=REGULIERUNG_STATUS_SUBSTATE[status]
   (Robustheit: claims.status signalisiert Regulierung, falls operative_status nachhängt)

3. operative_status befüllt (Normalfall)
   → main=BUCKET[operative_status], sub=SUB[operative_status]
   (erfassung-sub kommt aus den Lead-Feldern, s.u.; abschluss-sub aus claims.status)

4. operative_status NULL (defensiv)
   → Feld-Kaskade:
       regulierungs_betrag | kf.anschlussschreiben_am | kf.lexdrive_case_id → regulierung
       erstgutachten-Auftrag aktiv | gutachten_eingegangen_am | kf existiert     → begutachtung
       lead vorhanden                                                            → erfassung (Lead-Sub)
       sonst                                                                      → erfassung/sa_offen
```

## Mapping-Tabelle: operative_status → (main_phase, sub_phase)

| operative_status | main_phase | sub_phase |
|---|---|---|
| ersterfassung, onboarding, sv-gesucht | erfassung | **Lead-Sub** (s.u.) |
| sv-zugewiesen, sv-termin | begutachtung | termin |
| besichtigung | begutachtung | besichtigung |
| begutachtung-laeuft, gutachten-eingegangen | begutachtung | gutachten |
| filmcheck | begutachtung | filmcheck |
| qc-pruefung | begutachtung | qc-pruefung |
| kanzlei-uebergeben | begutachtung | kanzlei_uebergabe |
| anschlussschreiben | regulierung | anschlussschreiben |
| regulierung, regulierung-laeuft | regulierung | versicherungskontakt |
| vs-kuerzt | regulierung | vs-kuerzt |
| nachbesichtigung-laeuft | regulierung | nachbesichtigung-laeuft |
| vs-abgelehnt, klage | regulierung | nachforderung |
| zahlung-eingegangen | regulierung | auszahlung |
| abgeschlossen | abschluss | claims.status-Sub ?? erfolgreich_reguliert |
| storniert | abschluss | storniert |

**Lead-Sub (innerhalb Erfassung, aus Lead-Feldern — Feld-Population):** `vollmacht_signiert_am` gesetzt → onboarding_offen · sonst `sa_unterschrieben` → vollmacht_offen · sonst → sa_offen.

**Kein neuer Sub-Phasen-Wert nötig** — jeder operative_status mappt auf einen bestehenden Sub. (Anti-Scope: `sv-suche`/`klage`-Sub aus dem ersten Entwurf VERWORFEN; `klage` → `nachforderung`, `sv-gesucht` → Lead-Sub.)

## claims.status (nur terminale/Regulierungs-Achse)

- **TERMINAL** (`ABSCHLUSS_SUBSTATE`, schon in lifecycle.ts): reguliert_vollstaendig→erfolgreich_reguliert · storniert→storniert · klage_rechtsstreit→klage_rechtsstreit · verjaehrt→verjaehrt · abgelehnt_final→abgelehnt_final · an_externe_kanzlei_uebergeben→an_externe_kanzlei · termin_durchgefuehrt→termin_durchgefuehrt
- **REGULIERUNG-SIGNAL** (`REGULIERUNG_STATUS_SUBSTATE`): in_kommunikation_vs→versicherungskontakt · abgelehnt→nachforderung

## Architektur & Blast-Radius

- **Zwei Ableitungs-Stellen, bit-gleich (Parity-Gate):**
  - `v_claim_phase` (SQL-View) — SELECT-CASE über operative_status + claims.status (+ NULL-Fallback-LATERALs auf auftraege/kanzlei_faelle).
  - `src/lib/claims/lifecycle.ts` `getClaimLifecycle()` — TS-Spiegel, identische Kaskade.
- **Output unverändert:** `main_phase`/`sub_phase` behalten ihre Werte-Domäne → `claim-phase-map.ts`, `FallPhasenPanel.tsx`, kunde/mitarbeiter/makler/admin-Reader **unverändert**.
- **`getClaimLifecycleForClaim`-Loader** muss `claims.operative_status` + `claims.status` mitladen (statt/zusätzlich zu den Milestone-Joins). Milestone-Joins (auftraege/kanzlei_faelle) bleiben nur noch für den NULL-Fallback (Regel 4) + Side-Quests-Anzeige.

## Tests

1. **Parity** (`lifecycle.test.ts`): TS-`getClaimLifecycle` ↔ SQL-`v_claim_phase` bit-gleich für eine Matrix aller operative_status × claims.status-Kombinationen.
2. **Snapshot alt→neu:** Vor/Nach-Vergleich `SELECT claim_id, main_phase` über alle 89 Live-Claims — dokumentiert die bewusst geänderten Fälle (die 55 „Erfassung-Hänger" → korrekte Phase).
3. **Determinismus-Tabelle:** Unit-Test der Kaskade pro Regel (1-4) inkl. NULL-operative_status-Fallback + claims.status-Override.

## Behebt automatisch (A)

Der „Erfassung-Hänger" (55 Fälle `sv-termin` ohne `erstgutachten`-Auftrag) verschwindet by-design — Regel 3 mappt `sv-termin`→Begutachtung, unabhängig vom Auftrag-Milestone. **Kein Writer-Backfill nötig.**

## Migration / Reihenfolge (Kollision rls-haertung-claim-views!)

`v_claim_phase` wird PARALLEL von `kitta/rls-haertung-claim-views` (RLS/Security) angefasst. Reihenfolge:
1. **Kollisionsfrei vorab:** `lifecycle.ts` + `getClaimLifecycleForClaim`-Loader + Tests + Migration-File schreiben (Code, kein DDL-Apply).
2. **DDL-Apply von `v_claim_phase` koordiniert:** vor `apply_migration` aktuelles `pg_get_viewdef` + `reloptions` (security_invoker) re-lesen, deren Änderungen preserve-n, nur die SELECT-Ableitung ersetzen. Marker `[[coordination-unified-claim-stepper]]` — pingen vor `CREATE OR REPLACE`.
3. Migration-File `supabase/migrations/<plugin-version>_v_claim_phase_operative_source.sql` exakt nach getrackter Version benennen (AGENTS.md Regel 2).

## Risiken

- **Verhaltensänderung:** Fälle springen auf ihre echte operative Phase → Konsumenten, die auf `main_phase` verzweigen, feuern anders (gewollt; Snapshot-Test deckt es ab).
- **Writer-Invariante:** Regel 3 vertraut `operative_status`. Falls ein Writer claims.status setzt ohne operative_status nachzuziehen, fängt Regel 1/2 das (terminal/regulierung-signal) — sonst kleiner Writer-Fix (separat, verifizieren).
- **Parity-Pflege:** SQL ↔ TS müssen bit-gleich bleiben (bestehendes Gate).
- **DDL-Kollision** mit rls-haertung — durch Reihenfolge oben gemanagt.
