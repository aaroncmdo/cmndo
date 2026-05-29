# CMM-44 MP-8 Keystone — Terminal-Status-Vokabular & Abschluss-Erreichbarkeit

> **Spec / Design** (Brainstorming-Output). Implementierungs-Plan folgt via `writing-plans` nach Freigabe.
> Entscheidungen: Aaron 2026-05-29 (Option B "Vokabular bauen" + Ablehnungs-Split + externe-Kanzlei terminal).

**Ziel:** Writer (`endzustand-actions.ts`), DB-CHECK (`claims.status`) und Read-Model (`lifecycle.ts` + SQL-View `v_claim_phase`) auf **ein** terminales Vokabular bringen, sodass die Hauptphase **Abschluss** erreichbar und korrekt sub-klassifiziert wird. Heute erreicht nur `storniert` den Abschluss.

**Scope:** Nur das Terminal-Vokabular + die dafür nötige Status-getriebene Regulierungs-Ableitung. NICHT: lexdrive-Writer, Manuell-Modus, Drift-Gate (separate Slices, siehe *Out of Scope*).

---

## 1 · Problem

Seit MP-6c ist die Phase abgeleitet (`getClaimLifecycle` / SQL-Spiegel `v_claim_phase`). **Abschluss** wird ausschließlich aus terminalem `claims.status` über die Map `ABSCHLUSS_SUBSTATE` (lifecycle.ts) bestimmt. Die 5 Writer-Actions (AAR-840) wurden bei MP-6c nie auf das neue Vokabular migriert — sie schreiben weiter das alte:

| `endzustand-actions` schreibt | `ABSCHLUSS_SUBSTATE` kennt | Match |
|---|---|:---:|
| `reguliert` | `reguliert_vollstaendig` | ✗ |
| `abgelehnt` | — | ✗ |
| `an_externe_kanzlei_uebergeben` | — | ✗ |
| `storniert` | `storniert` | ✓ |
| `in_kommunikation_vs` | (nicht-terminal, korrekt) | n/a |

**Effekt heute:** Klick auf "Reguliert" → `status='reguliert'` → Read-Model erkennt es nicht → Claim landet **nicht** in Abschluss, sondern fällt auf die Sub-Entity-abgeleitete Phase zurück (Begutachtung/Regulierung je nach Aufträgen/Kanzleifall). Nur `storniert` funktioniert. Der lifecycle.ts-Kommentar dokumentiert das als geplante Lücke ("Writer = MP-7/MP-8; bis dahin ist abschluss leer"). Dieser Keystone schließt sie.

Zusätzlich ist der Audit-Insert (`phase_transitions.to_phase`) noch auf 10-Code (`'9_reguliert'` etc.) und ein Code-Kommentar verweist auf den in MP-6c gedroppten Trigger `trg_claims_set_phase`.

---

## 2 · Ziel-Vokabular

### Abschluss (terminaler `claims.status` → Substate)

| `claims.status` | `ClaimSubPhase` | Label | Writer |
|---|---|---|---|
| `reguliert_vollstaendig` | `erfolgreich_reguliert` | Erfolgreich reguliert | `markClaimAsReguliert` |
| `storniert` | `storniert` | Storniert | `markClaimAsStorniert` (schon korrekt) |
| `klage_rechtsstreit` | `klage_rechtsstreit` | Klage / Rechtsstreit | **neu** `markClaimAsKlage` |
| `verjaehrt` | `verjaehrt` | Verjährt | **neu** `markClaimAsVerjaehrt` |
| `abgelehnt_final` | `abgelehnt_final` *(neu)* | Abgelehnt (final) | `markClaimAsAbgelehnt({final:true})` |
| `an_externe_kanzlei_uebergeben` | `an_externe_kanzlei` *(neu)* | An externe Kanzlei übergeben | `markClaimAsAnExterneKanzlei` |

### Regulierung (nicht-terminal — Claim bleibt aktiv)

| `claims.status` | `ClaimSubPhase` | Label |
|---|---|---|
| `in_kommunikation_vs` | `versicherungskontakt` | Versicherungskontakt |
| `abgelehnt` | `nachforderung` *(neu)* | VS-Ablehnung — Nachforderung |

### Ablehnungs-Split (Aaron-Entscheidung)
- **Einfache Ablehnung** (`abgelehnt`, nicht-terminal): VS lehnt ab, **Nachforderung möglich** → Claim bleibt in **Regulierung**.
- **Finale Ablehnung** (`abgelehnt_final`, terminal): endgültig → **Abschluss**.

`markClaimAsAbgelehnt` bekommt `final: boolean`. UI bietet beide Wege ("Vorläufig ablehnen" / "Endgültig ablehnen").

---

## 3 · Änderungen

### 3.1 Writer — `src/lib/claims/endzustand-actions.ts`

- **`ENDZUSTAENDE`-Guard** (Set, das "bereits final" markiert und Updates blockt) auf das **terminale** Vokabular umstellen:
  ```ts
  const ENDZUSTAENDE = [
    'reguliert_vollstaendig',
    'storniert',
    'klage_rechtsstreit',
    'verjaehrt',
    'abgelehnt_final',
    'an_externe_kanzlei_uebergeben',
  ] as const
  ```
  Wichtig: `abgelehnt` (einfach) und `in_kommunikation_vs` sind **nicht** im Guard → aus ihnen heraus sind weitere Übergänge erlaubt (einfache Ablehnung → später reguliert_vollstaendig / klage / final).
- `markClaimAsReguliert` → `status: 'reguliert_vollstaendig'` (statt `'reguliert'`).
- `markClaimAsAbgelehnt(input + final?: boolean)`:
  - `final === true` → `status: 'abgelehnt_final'` (terminal).
  - sonst → `status: 'abgelehnt'` (nicht-terminal, Regulierung).
  - `vs_ablehnungs_grund` bleibt Pflicht in beiden Fällen.
- `markClaimAsAnExterneKanzlei` → `status: 'an_externe_kanzlei_uebergeben'` (Wert unverändert; wird durch das Read-Model jetzt terminal).
- **Neu** `markClaimAsKlage({ claim_id, grund, notify_customer? })` → `status: 'klage_rechtsstreit'`.
- **Neu** `markClaimAsVerjaehrt({ claim_id, grund, notify_customer? })` → `status: 'verjaehrt'`.
- Alle neuen Actions folgen dem bestehenden Muster: `requireRole(['admin','kundenbetreuer'])` → `loadClaimContext` → `authorizedForClaim` → `setEndzustandFields(..., ENDZUSTAENDE)` → `writeAudit` → optional `emitEvent` (try/catch) → `revalidatePath`. Result-Shape `{ ok: boolean; error? }` (AGENTS.md §server-actions).
- Stalen Kommentar (Zeilen 12-14, "Phase wird automatisch durch trg_claims_set_phase gesetzt") **löschen** — Trigger in MP-6c gedroppt. Ersatz-Kommentar: "Phase wird aus claims.status via v_claim_phase / getClaimLifecycle abgeleitet (MP-6c)."

### 3.2 Read-Model — `src/lib/claims/lifecycle.ts`

- **`ClaimSubPhase`** um die zwei terminalen + eine Regulierungs-Subphase erweitern:
  ```ts
  // Abschluss
  | 'abgelehnt_final'
  | 'an_externe_kanzlei'
  // Regulierung
  | 'nachforderung'
  ```
- **`ABSCHLUSS_SUBSTATE`** ergänzen:
  ```ts
  const ABSCHLUSS_SUBSTATE: Record<string, ClaimSubPhase> = {
    reguliert_vollstaendig: 'erfolgreich_reguliert',
    storniert:              'storniert',
    klage_rechtsstreit:     'klage_rechtsstreit',
    verjaehrt:              'verjaehrt',
    abgelehnt_final:        'abgelehnt_final',           // neu
    an_externe_kanzlei_uebergeben: 'an_externe_kanzlei', // neu
  }
  ```
- **`SUBPHASE_LABEL`** + **`mainPhaseOf`** für die 3 neuen Subphasen ergänzen (`abgelehnt_final`/`an_externe_kanzlei` → `abschluss`; `nachforderung` → `regulierung`).
- **Status-getriebene Regulierung (neu):** `getClaimLifecycle` betritt Regulierung heute **nur** über `kanzleiFall.lexdrive_case_id`. Damit `in_kommunikation_vs` + einfache `abgelehnt` als Regulierung sichtbar werden, eine Status-Map einführen:
  ```ts
  const REGULIERUNG_STATUS_SUBSTATE: Record<string, ClaimSubPhase> = {
    in_kommunikation_vs: 'versicherungskontakt',
    abgelehnt:           'nachforderung',
  }
  ```
- **Ableitungs-Priorität** in `getClaimLifecycle` (von oben):
  1. **terminal** (`ABSCHLUSS_SUBSTATE[claimStatus]`) → `abschluss`
  2. **lexdrive-Regulierung** (`kanzleiFall.lexdrive_case_id`) → `regulierung` *(bestehend)*
  3. **Status-Regulierung** (`REGULIERUNG_STATUS_SUBSTATE[claimStatus]`) → `regulierung` *(neu — greift für Claims ohne übernommenen Kanzleifall)*
  4. Kanzlei-Übergabe-Interim (`kanzleiFall` ohne lexdrive) → `begutachtung/kanzlei_uebergabe` *(bestehend)*
  5. Begutachtung (aktiver Erstgutachten-Auftrag) *(bestehend)*
  6. Erfassung (Lead) *(bestehend)*

  > Edge (Review-Punkt 8.2): lexdrive **vor** Status-Regulierung. Begründung: ein an die Kanzlei übergebener Fall ist der stärkere/spätere Zustand. Falls `in_kommunikation_vs` einen übernommenen Kanzleifall überstimmen soll, Reihenfolge 2↔3 tauschen.

### 3.3 SQL-Spiegel — View `v_claim_phase`

`v_claim_phase` ist die bit-gleiche SQL-Spiegelung von `getClaimLifecycle` (Parity-Gate). Die gleichen Mappings im `CASE` der View nachziehen:
- Terminal-`CASE` um `abgelehnt_final` / `an_externe_kanzlei_uebergeben` erweitern.
- Status-Regulierungs-Zweig (`in_kommunikation_vs` → versicherungskontakt, `abgelehnt` → nachforderung) **nach** dem lexdrive-Zweig einfügen.
- **DDL via Supabase-Plugin** (`apply_migration`, AGENTS.md Regel 2), **ohne** `begin;/commit;` im File. Da die View per `CREATE OR REPLACE` append-only ist, ggf. DROP+CREATE nötig (wie MP-6c) — beim Schreiben der Migration die **aktuelle** View-Definition via `pg_get_viewdef` ziehen (nicht hand-tippen). **Execution-time** (DB aktuell flaky → blockiert).

### 3.4 CHECK-Constraint — `claims.status`

Additiv die 4 neuen Werte zum CHECK hinzufügen: `reguliert_vollstaendig`, `klage_rechtsstreit`, `verjaehrt`, `abgelehnt_final`. (`an_externe_kanzlei_uebergeben`, `abgelehnt`, `storniert`, `in_kommunikation_vs` sind bereits erlaubt.)
- `reguliert` (alt) **vorerst im CHECK belassen** (harmlos nach Backfill — kein Reader mappt es mehr). Optionaler Cleanup-Drop in späterem Slice.
- Migration via Plugin, **execution-time** (Constraint-Definition live ziehen + ergänzen). Genauen aktuellen CHECK-Body erst bei stabiler DB via `information_schema`/`pg_get_constraintdef` lesen (Memory: [[information_schema-Check vor Cluster-Refactor]]).

### 3.5 Audit — `phase_transitions.to_phase`

`writeAudit` schreibt aktuell 10-Code (`'9_reguliert'`, `'9_abgelehnt'`, …). Auf das abgeleitete Vokabular umstellen, z.B. `to_phase = '<main_phase>:<sub_phase>'`:
- reguliert_vollstaendig → `'abschluss:erfolgreich_reguliert'`
- abgelehnt_final → `'abschluss:abgelehnt_final'`
- abgelehnt (einfach) → `'regulierung:nachforderung'`
- klage → `'abschluss:klage_rechtsstreit'`, verjaehrt → `'abschluss:verjaehrt'`
- an_externe_kanzlei → `'abschluss:an_externe_kanzlei'`
- in_kommunikation_vs → `'regulierung:versicherungskontakt'`

> `phase_transitions`-Schema (Spalten, evtl. dedizierte `main_phase`/`sub_phase` vs. nur `to_phase` text) bei stabiler DB verifizieren; ggf. nur `to_phase` (text) befüllen.

### 3.6 Backfill bestehender Zeilen

- `UPDATE claims SET status='reguliert_vollstaendig' WHERE status='reguliert'` — sonst fallen bestehende regulierte Claims aus dem Abschluss (IS-NULL/Wert-geguarded, idempotent).
- Bestehende `abgelehnt`-Zeilen **als einfach (nicht-terminal) belassen** — die alte Action unterschied nicht final/einfach; sie als Regulierung/Nachforderung zu zeigen ist sicherer als sie fälschlich zu terminalisieren. KB kann pro Fall final setzen.
- Execution-time (DB-blocked).

---

## 4 · UI

Endzustand-Trigger leben in der Fallakte (`/faelle/[id]`, Admin + KB). Bestehende Buttons:
- "Reguliert" (mit Betrag) → unverändert verdrahtet, schreibt jetzt `reguliert_vollstaendig`.
- "Ablehnen" → **zwei** Optionen/Variante: "Vorläufig ablehnen" (einfach) vs "Endgültig ablehnen" (final) → `final`-Flag.
- "An externe Kanzlei" → unverändert.
- **Neu**: "Klage / Rechtsstreit" + "Verjährt" Trigger (gleiche Stelle, gleiche Rolle Admin/KB).

Komponenten aus `primitives/*` + `shared/*` (AGENTS.md §component-set), keine handgerollten Buttons. Genaue Einstiegspunkt-Komponente bei Plan-Erstellung lokalisieren (Endzustand-Panel der Fallakte).

---

## 5 · Deploy-Reihenfolge (PROD-Lesson aus MP-6c)

Der CHECK-Constraint ist **additiv** (neue erlaubte Werte) → kein Breaker beim Deploy, solange die neuen Status-Werte erst geschrieben werden, **nachdem** der Writer-Code live ist. Reihenfolge:
1. CHECK-Migration (additiv) anwenden — alte Werte bleiben gültig, nichts bricht.
2. Read-Model + v_claim_phase (erkennt neue Werte; alte weiter ok).
3. Writer-Code (schreibt neue Werte) — Code + View müssen vor dem ersten neuen Write live sein.
4. Backfill (`reguliert`→`reguliert_vollstaendig`) **nachdem** Read-Model die neuen Werte kennt.

> Gegenteil von MP-6c: dort war ein **DROP** (destruktiv) + Code-Lag = Breaker. Hier ist alles additiv. Trotzdem: auf der geteilten PROD-DB Code+Migration gemeinsam ausrollen, Release per **Content** verifizieren (nicht PR-Status) — [[project_cmm44_mp6c_ready]] PROD-Breaker-Lesson.

---

## 6 · Test / Smoke

- **Unit** (`getClaimLifecycle`, vitest): je Status den erwarteten `(mainPhase, subPhase)` — alle 6 Terminal + 2 Regulierungs-Status + Priorität (terminal > lexdrive > status-regulierung > interim > begutachtung > erfassung).
- **Parity** (Vorbote MP-9): für eine Stichprobe Claims `getClaimLifecycle` == `v_claim_phase` (gleiches main/sub).
- **Smoke** (DB stabil): in Fallakte je Trigger klicken → Phasen-Pipeline springt auf Abschluss/Regulierung mit korrektem Sub-Label; Screenshot-Pflicht ([[feedback_smoke_screenshot_pflicht]]). Einfache vs finale Ablehnung gegentesten (einfach bleibt Regulierung, final → Abschluss).
- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build` grün (Server-Actions → voller Build, nicht nur tsc).

---

## 7 · Out of Scope (separate Slices)

- **lexdrive_case_id-Writer** — KB-manuelles Setzen (Regulierungs-Eintritt über die Kanzlei). Eigener MP-8-Slice.
- **Manuell-Phasen-Modus (MP-7)** — Neuaufbau des in MP-6c entfernten `ManualPhaseOverride`. Design: `docs/28.05.2026/cmm44-mp7-manual-phase-mode-design.md`.
- **Drift-Gate (MP-9)** — CI-Parität `getClaimLifecycle` ↔ `v_claim_phase`.

---

## 8 · Offene Punkte (für dein Review)

1. **Sub-Label einfache Ablehnung:** Substate `nachforderung`, Label "VS-Ablehnung — Nachforderung". OK, oder lieber `versicherungskontakt` wiederverwenden (keine eigene Subphase)?
2. **Priorität** lexdrive-Regulierung vs. Status-Regulierung bei Edge (beide gesetzt): aktuell lexdrive zuerst (§3.2). OK?
3. **`reguliert` im CHECK** nach Backfill behalten (harmlos) oder sofort droppen?
4. **Audit-Format** `'<main>:<sub>'` in `to_phase` — oder dedizierte Spalten falls `phase_transitions` welche hat (DB-Verify bei stabiler DB).
5. **Neue Actions Notify:** sollen `markClaimAsKlage` / `markClaimAsVerjaehrt` den Kunden benachrichtigen (emitEvent) — und wenn ja, welche Templates? (Default-Vorschlag: Klage = ja, Verjährt = nein.)
