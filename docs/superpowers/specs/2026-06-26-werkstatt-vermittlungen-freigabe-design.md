# Werkstatt-Portal „Meine Vermittlungen" + Reparaturfreigabe — Design

**Datum:** 2026-06-26
**Branch:** `kitta/werkstatt-vermittlungen-freigabe` (base `staging`)
**Status:** Design approved (Aaron, 2026-06-26)

## Ziel

Die Werkstatt sieht im Portal ihre eigenen KVA-Vermittlungen (Leads/Claims) mit **Funnel-Status** — und der wichtigste Status ist **„Reparatur freigegeben"**, den Admin/Dispatch intern manuell setzt. Damit weiß die Werkstatt, wo jede Vermittlung steht und wann sie reparieren darf.

## Kern-Entscheide (Aaron, 2026-06-26)

1. **Reparaturfreigabe = nur Signal** (informativ): die Werkstatt SIEHT „Reparatur freigegeben", repariert dann offline. **Kein** Repair-Tracking-Workflow im Portal → die dormant `repairs`-Tabelle wird **nicht** erweckt.
2. **Freigabe-Trigger = manuell** durch Admin/Dispatch (Button „Reparatur freigeben" am Fall).
3. **Sichtbarkeit:** Status + Fahrzeug/Kennzeichen + KVA-Betrag + Datum + Freigabe-Status + **Kundenname** — **keine** Kontaktdaten (Telefon/E-Mail).

## Kontext / Ist-Stand (Live-DB + staging verifiziert)

- `repairs`-Tabelle existiert, ist **dormant** (0 Zeilen), Status `geplant/in_arbeit/abgeschlossen/storniert` (kein „freigegeben"), nur `kanzlei/actions.ts`-Consumer, **keine Werkstatt-RLS**. → unangetastet lassen.
- **Werkstätten haben Lese-RLS NUR auf `werkstatt_provisionen`** (`wp_werkstatt_read`), **nicht** auf `leads`/`claims`/`repairs`. Für die Lead-Sicht brauchen wir einen **neuen leak-safen Lesepfad**.
- Lead trägt alle nötigen Felder (vom KVA-Upload): `vorname/nachname`, `fahrzeug_hersteller/modell/baujahr`, `kennzeichen`, `kostenvoranschlag_netto/brutto`, `werkstatt_id`, `status` (enum `lead_status`), `created_at`. `claims.lead_id` → `leads.id`. `claims.werkstatt_id` ebenfalls gesetzt.
- Echte Daten: 6 werkstatt-Leads, 4 claims.
- Werkstatt-Portal-Nav (`WerkstattShell.tsx`): Übersicht · QR-Code · Kostenvoranschlag · Provisionen.

## Architektur

### 1 · Lesepfad — `get_werkstatt_vermittlungen()` (SECURITY DEFINER RPC)
`SECURITY DEFINER`, `SET search_path = public`, `GRANT EXECUTE TO authenticated` (NICHT anon — Security-Lehre aus der Staffelung: Supabase default-privileges auto-granten anon/authenticated; explizit von anon revoken).
- **Self-scoped:** ermittelt intern die Werkstatt des Callers (`werkstaetten WHERE user_id = auth.uid()`); ohne Werkstatt → 0 Zeilen (anon/fremde User sehen nichts).
- Gibt **eine Zeile pro Lead** dieser Werkstatt zurück (`leads.werkstatt_id = <caller-werkstatt>`), `LEFT JOIN claims c ON c.lead_id = l.id`.
- **Nur kuratierte Spalten** (RETURNS TABLE): `lead_id uuid`, `claim_id uuid`, `kunde_name text` (`vorname`+`nachname`), `fahrzeug text` (Hersteller/Modell/Baujahr zusammengesetzt), `kennzeichen text`, `kva_betrag numeric` (`kostenvoranschlag_brutto` ?? `_netto`), `erstellt_am timestamptz` (`leads.created_at`), `status text` (abgeleitet, s.u.), `reparatur_freigegeben_am timestamptz`. **Kein Telefon/E-Mail.**
- **Warum Funktion, nicht View:** Definer-Views sind advisor-ERROR (11 Bestand); Definer-Funktion mit SET search_path ist advisor-clean + gibt exakt die kuratierten Spalten zurück + self-scoped.

### 2 · Funnel-Status (in der Funktion via `CASE`, 4 Stufen)
Priorität (oben gewinnt):
1. `reparatur_freigegeben_am IS NOT NULL` → **`reparatur_freigegeben`**
2. Lead disqualifiziert **oder** Claim storniert → **`storniert`**
3. Claim existiert (`c.id IS NOT NULL`) → **`beauftragt`**
4. sonst (nur Lead) → **`eingegangen`**

(Exakte `lead_status`-Enum-Werte + `claims.status`-Storno-Wert werden im Plan via DB verifiziert.) Das Mapping String→Label/Badge-Farbe macht ein kleiner pure TS-Helper (unit-testbar): `eingegangen`→„Eingegangen" (neutral), `beauftragt`→„Beauftragt" (info), `reparatur_freigegeben`→„Reparatur freigegeben" (success, hervorgehoben), `storniert`→„Storniert" (danger).

### 3 · Freigabe (Gabe-Seite)
- Neue Spalten: `claims.reparatur_freigegeben_am timestamptz`, `claims.reparatur_freigegeben_von uuid` (Audit).
- Server-Actions (admin/dispatch-gated, Result-Object, kein throw): `reparaturFreigeben(claimId)` (setzt `_am=now()`, `_von=user`) + `reparaturFreigabeZuruecknehmen(claimId)` (setzt `_am=NULL`). `revalidatePath` der Fallakte.
- **Button „Reparatur freigeben"** in der internen Fallakte (admin/dispatch sichtbar). Exakte Komponente/Position im Plan lokalisiert (HOT-Zone — minimal-additiv).
- **Warum claims-Spalte, nicht repairs-Row:** „nur Signal" + repairs dormant → ein Flag genügt; repairs bleibt unangetastet.

### 4 · Werkstatt-UI
- Neuer Nav-Eintrag **„Meine Vermittlungen"** in `WerkstattShell.tsx` (Icon z.B. `HandshakeIcon`/`ListChecksIcon`).
- Neue Seite `src/app/werkstatt/(shell)/vermittlungen/page.tsx` (force-dynamic, `getWerkstattByUserId`-Gate) → ruft die RPC → reicht Rows an `WerkstattVermittlungen.tsx` (Client).
- `WerkstattVermittlungen.tsx`: `DataTable` — Kunde · Fahrzeug+Kennzeichen · KVA-Betrag · Eingegangen (Datum) · Status-Badge (Reparatur-Freigabe hervorgehoben). EmptyState wenn keine.

## Datenmodell (DB via Supabase-Plugin, Regel 2)
- Migration: `ALTER TABLE claims ADD COLUMN reparatur_freigegeben_am timestamptz, ADD COLUMN reparatur_freigegeben_von uuid` (additiv, nullable) + `CREATE FUNCTION get_werkstatt_vermittlungen()` + `REVOKE … FROM PUBLIC, anon; GRANT EXECUTE … TO authenticated`.
- `get_advisors` nach der Migration (Security-Lint-Check, speziell anon-Executable).
- Typen: surgisch (`claims` 2 neue Spalten); RPC-Return als handgetippter TS-Type im Query-Helper.

## Queries / Actions (Files)
- `src/lib/werkstatt/queries.ts`: `getWerkstattVermittlungen()` → ruft `supabase.rpc('get_werkstatt_vermittlungen')`, mappt Rows (`as unknown as`-Pattern), Rückgabe typisiertes Array.
- `src/app/.../fallakte-freigabe-actions.ts` (oder bestehende claims-actions): `reparaturFreigeben` / `reparaturFreigabeZuruecknehmen`.
- `src/lib/werkstatt/vermittlung-status.ts`: pure `vermittlungStatusLabel(status)` → {label, badgeClass} (unit-testbar).

## Tests
- `vermittlung-status` (vitest, pure): alle 4 Status → korrektes Label/Badge.
- `reparaturFreigeben` (vitest): non-admin/dispatch → `ok:false` (Gate); Mock-Setup wie bestehende admin-action-Tests.
- DB-Smoke (transactional, `RAISE EXCEPTION`-Rollback wie bei der Staffelung): Funktion liefert pro Lead-Konstellation den korrekten `status` (eingegangen/beauftragt/reparatur_freigegeben/storniert) + self-scoping (fremde Werkstatt → 0 Zeilen). Dokumentiert im PR.

## Out of Scope
- Repair-Tracking-Workflow im Portal (geplant/in_arbeit/abgeschlossen) — „nur Signal".
- Kontaktdaten (Telefon/E-Mail) in der Werkstatt-Sicht.
- Auto-Freigabe (nach Gutachten/Versicherung) — bewusst manuell.
- `repairs`-Tabelle erwecken.

## Constraints
- DDL nur via Supabase-Plugin; Migration-File-Name == getrackte Version (Twin-Drift). `get_advisors` danach.
- Security: Definer-Funktion `SET search_path`, `REVOKE FROM anon`, `GRANT TO authenticated`, self-scoped via `auth.uid()`.
- UI-Strings Deutsch mit Umlauten. Component-Set (`DataTable`/`SectionCard`/`Button` primitives/shared). Token-Audit (keine raw hex/scales; `success`/`info`/`danger`-Tokens für Badges).
- Server-Actions Result-Object; kein `type`/`const`-Export aus `'use server'` (AAR-664).
- Leak-safe: Funktion gibt ausschließlich kuratierte Spalten zurück; keine Kontaktdaten.
- Koordination: Fallakte = HOT (Sessions `falldetailclient-dead-props`, `notif-pipeline-fanout-claim`) → Freigabe-Button minimal-additiv. Werkstatt-Portal + Funktion = eigene Spur. Base `staging`, PR gegen `staging`. 7-Punkte-Audit.
