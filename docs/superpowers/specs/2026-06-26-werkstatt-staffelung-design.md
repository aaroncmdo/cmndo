# Werkstatt-Staffelung (Meilenstein-Boni) — Design

**Datum:** 2026-06-26
**Branch:** `kitta/werkstatt-staffelung` (base `staging`)
**Status:** Design approved (Aaron, 2026-06-26)

## Ziel

Pro Werkstatt konfigurierbare **Meilenstein-Boni**: erreicht eine Werkstatt eine Schwelle an freigegebenen Vermittlungen (Anzahl vermittelter Kunden), gibt es einen **Einmal-Bonus**. Das Admin-Portal konfiguriert die Stufen + Beträge pro Werkstatt; die Werkstatt sieht ihren Fortschritt als **Balken** + die erreichbaren Beträge. Die Basis-Provision (Flat-Betrag pro Fall) bleibt unverändert.

## Kontext / Ist-Stand

- `werkstaetten.provision_betrag_netto` (Flat, Default 150€) — Basis-Provision pro Fall.
- `werkstatt_provisionen` (1 Zeile pro `claim_id`, unique): `status` `pending` → (Release-Cron nach 7-Tage-`hold_until`) → `freigegeben` → `ausgezahlt`; oder `storniert` (Clawback).
- Trigger `create_werkstatt_provision` (AFTER INSERT `faelle_claim_bridge`) legt die Provisions-Zeile an.
- Werkstatt-Portal: `WerkstattAbrechnungen.tsx` (Provisionen-Tabelle + Summen-Karten); Dashboard `werkstatt/(shell)/page.tsx`.
- Admin: `/admin/werkstaetten` (Liste + Create-Modal + QR-Modal aus PR #3191).
- Queries: `src/lib/werkstatt/queries.ts`.

## Kern-Entscheide (Aaron, begründet)

1. **Modell:** Meilenstein-Bonus (Basis bleibt, Bonus on-top). **Pro Werkstatt** konfigurierbar.
2. **Metrik = freigegebene Vermittlungen**, NICHT pending: `count(werkstatt_provisionen WHERE status IN ('freigegeben','ausgezahlt'))`. Verhindert Bonus-Auszahlung auf Vermittlungen, die in der 7-Tage-Clawback-Frist noch storniert werden (anti-gaming + finanziell sauber). `pending` wird nur als Hinweis („X in Prüfung") angezeigt.
3. **Bonus sofort `freigegeben`** bei Vergabe — die Basis (freigegebene Vermittlungen) ist bereits durch die Clawback-Frist gelaufen, daher kein separater Bonus-Clawback nötig.
4. **Kein Auto-Widerruf** eines vergebenen Bonus bei späterem Storno (einmal erreicht = erreicht).

## Datenmodell (2 neue Tabellen, DDL via Supabase-Plugin)

### `werkstatt_staffel_stufen` (Konfiguration)
| Spalte | Typ | Constraint |
|---|---|---|
| `id` | uuid | PK default gen_random_uuid() |
| `werkstatt_id` | uuid | FK → werkstaetten(id) ON DELETE CASCADE, NOT NULL |
| `schwelle` | int | NOT NULL, CHECK (schwelle > 0) |
| `bonus_betrag_netto` | numeric(10,2) | NOT NULL, CHECK (bonus_betrag_netto >= 0) |
| `created_at` | timestamptz | NOT NULL default now() |

`UNIQUE(werkstatt_id, schwelle)`. Index auf `werkstatt_id`.

### `werkstatt_staffel_bonus` (vergebene Boni)
| Spalte | Typ | Constraint |
|---|---|---|
| `id` | uuid | PK default gen_random_uuid() |
| `werkstatt_id` | uuid | FK → werkstaetten(id) ON DELETE CASCADE, NOT NULL |
| `stufe_id` | uuid | FK → werkstatt_staffel_stufen(id) ON DELETE SET NULL, NULLABLE |
| `schwelle` | int | NOT NULL **(Snapshot)** |
| `bonus_betrag_netto` | numeric(10,2) | NOT NULL **(Snapshot)** |
| `status` | text | NOT NULL default 'freigegeben', CHECK in ('freigegeben','ausgezahlt','storniert') |
| `erstellt_am` | timestamptz | NOT NULL default now() |

`UNIQUE(werkstatt_id, schwelle)` = **Idempotenz** (jeder Meilenstein max. 1× vergeben). Index auf `werkstatt_id`.

**Snapshot-Begründung:** `schwelle` + `bonus_betrag_netto` werden in die Bonus-Zeile kopiert; `stufe_id` ist nur eine schwache Referenz (`ON DELETE SET NULL`). So kann der Admin Stufen später ändern/löschen, ohne die ausgezahlte Bonus-Historie zu zerstören; ein erreichter Meilenstein zahlt nie doppelt; eine Betrags-Änderung wirkt nur auf künftige Vergaben.

### RLS (gespiegelt nach `werkstatt_provisionen`)
- Beide Tabellen: `*_admin_all` (admin FOR ALL), `*_werkstatt_read` (werkstatt FOR SELECT WHERE werkstatt.user_id = auth.uid()). Werkstatt liest nur eigene Zeilen (für Balken + erreichbare Beträge).

## Vergabe-Logik

### SQL-Funktion `award_werkstatt_staffel_boni(p_werkstatt_id uuid)`
`SECURITY DEFINER`, `SET search_path = public`. Logik:
```
v_count := count(*) FROM werkstatt_provisionen
           WHERE werkstatt_id = p_werkstatt_id AND status IN ('freigegeben','ausgezahlt');
INSERT INTO werkstatt_staffel_bonus (werkstatt_id, stufe_id, schwelle, bonus_betrag_netto, status)
  SELECT s.werkstatt_id, s.id, s.schwelle, s.bonus_betrag_netto, 'freigegeben'
  FROM werkstatt_staffel_stufen s
  WHERE s.werkstatt_id = p_werkstatt_id AND s.schwelle <= v_count
ON CONFLICT (werkstatt_id, schwelle) DO NOTHING;
```
Idempotent (ON CONFLICT). Vergibt alle erreichten, noch nicht vergebenen Stufen.

### Trigger
`trg_award_staffel AFTER INSERT OR UPDATE OF status ON werkstatt_provisionen FOR EACH ROW EXECUTE FUNCTION trg_award_werkstatt_staffel()` — die Trigger-Funktion ruft `award_werkstatt_staffel_boni(NEW.werkstatt_id)` (NULL-guard auf werkstatt_id). Feuert insbesondere beim Release-Cron-UPDATE (`pending`→`freigegeben`) → Settled-Count wächst → Vergabe. **Kein Cron-Code-Change.**

### Admin-Save ruft Vergabe mit
`setWerkstattStaffel()` ruft nach dem Speichern `award_werkstatt_staffel_boni(werkstattId)` per RPC → fügt der Admin eine Stufe hinzu, die die Werkstatt schon überschritten hat, wird sie sofort vergeben (nicht erst bei der nächsten Vermittlung).

## Admin-UI (`src/app/admin/werkstaetten/WerkstaettenClient.tsx` + actions)

- Neue per-Zeile-Aktion „Staffelung" (`Button size="sm" variant="ghost"`, Icon `Layers`/`TrendingUp`) → `Modal` (Muster wie QR-Modal aus #3191).
- Modal: editierbare Stufen-Liste {Schwelle (int), Bonus € (number)} mit Hinzufügen/Entfernen-Zeilen + „Speichern". Lädt aktuelle Stufen beim Öffnen.
- Server-Actions (`src/app/admin/werkstaetten/staffel-actions.ts`, `'use server'`, admin-gated lokales `requireAdmin`, Result-Object):
  - `getWerkstattStaffel(werkstattId): Promise<{ ok: true; stufen: {id,schwelle,bonus_betrag_netto}[] } | { ok: false; error }>`
  - `setWerkstattStaffel(werkstattId, stufen: {schwelle,bonus_betrag_netto}[]): Promise<{ ok: boolean; error? }>` — Validierung (schwelle>0 ganzzahlig eindeutig, betrag>=0), Replace-Semantik (DELETE alle stufen der Werkstatt + INSERT neue; awarded Boni bleiben dank Snapshot/ON DELETE SET NULL), dann `award`-RPC, `revalidatePath('/admin/werkstaetten')`.

## Werkstatt-UI

- **Dashboard** (`werkstatt/(shell)/page.tsx`): neue Karte → `src/components/werkstatt/WerkstattStaffelCard.tsx`:
  - Props `{ settledCount: number; pendingCount: number; stufen: {schwelle,bonus_betrag_netto}[]; erreichteSchwellen: number[] }`.
  - **Balken**: Fortschritt `settledCount` → nächste nicht erreichte Schwelle (% = settledCount/nextSchwelle, capped 100). Nächster Zielbetrag prominent.
  - Stufen-Liste: ✓ erreicht (Betrag) / ○ offen (Betrag). „X in Prüfung" Hinweis wenn pendingCount>0.
  - Reine Anzeige, token-konform (claimondo-Farben, `rounded-ios-*`, `text-body*`).
  - Reine Berechnungs-Helper (nächste Stufe, %, Alle-erreicht-Zustand) als pure Funktion `staffelFortschritt(...)` → unit-testbar.
- **Provisionen** (`WerkstattAbrechnungen.tsx`): zusätzliche Summen-Karte „Boni" = Summe `werkstatt_staffel_bonus` (status freigegeben/ausgezahlt). (Werte werden vom Server-Component geladen + reingereicht.)

## Queries (`src/lib/werkstatt/queries.ts`)

- `getWerkstattVermittlungsCount(werkstattId): Promise<{ settled: number; pending: number }>`
- `getWerkstattStaffelStufen(werkstattId): Promise<{schwelle,bonus_betrag_netto}[]>`
- `getWerkstattStaffelBoni(werkstattId): Promise<{schwelle,bonus_betrag_netto,status,erstellt_am}[]>` (+ erreichteSchwellen-Ableitung)

## Typen
Nach den Migrationen die neuen Tabellen in `database.types.ts` ergänzen (generate_typescript_types oder chirurgisch), da die Queries sie referenzieren.

## Tests
- `staffel-actions` (vitest): admin-gate (non-admin → ok:false), Validierung (negative schwelle / doppelte schwelle → ok:false). Mock-Setup wie `werkstaetten/__tests__/actions.test.ts`.
- `staffelFortschritt`-Helper (vitest, pure): nächste-Stufe-Wahl, %-Berechnung (cap 100), Alle-erreicht-Fall, leere-Stufen-Fall.
- DB-Smoke (manuell via execute_sql READ nach apply_migration): Funktion `award_werkstatt_staffel_boni` vergibt korrekt + idempotent; Trigger feuert bei status→freigegeben. Dokumentiert im PR.

## Out of Scope
- Globale Staffel (pro Werkstatt gewählt).
- Auszahlungs-/Überweisungs-Workflow der Boni (Status `freigegeben`; tatsächliche Zahlung wie bei Provisionen über Finance).
- Retroaktiver Bonus-Widerruf bei Storno (kein Auto-Revoke).
- Änderung der Basis-Provision.

## Constraints
- **DDL nur via Supabase-Plugin** (`apply_migration`), Migration-File-Name == getrackte Version (Twin-Drift vermeiden, Regel 2). Additiv (neue Tabellen) → safe vor Merge applizierbar, da kein Bestandscode sie referenziert. `get_advisors` nach Migration (RLS/Security prüfen).
- UI-Strings Deutsch mit echten Umlauten. Component-Set (`Button`/`Modal` primitives, `DataTable`/`SectionCard` shared). Token-Audit (keine raw hex/scales). Kein `type`/`const`-Export aus `'use server'` (AAR-664). Server-Actions Result-Object (kein throw). 7-Punkte-Audit. Base `staging`, PR gegen `staging`.
