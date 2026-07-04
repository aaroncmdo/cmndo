# Werkstatt-Finder-Anfrage SP-A — Fundament + Abrechnungsweg-Weiche — Design

> Sub-Projekt A (Fundament) des Werkstatt-Finder-Anfrage-Features. Legt die DB-Basis + die reine Routing-Logik für die 3 Abrechnungswege (Haftpflicht / Kasko / Selbstzahler). Kein UI — das Fundament, auf dem SP-B (Flow-Weiche), SP-C (Karte), SP-D (Termin-Verwaltung) aufbauen.

**Datum:** 2026-07-04 · **Session:** cec48090 · **Branch:** `kitta/schaden-finder-abrechnungsweg` (off staging)

---

## 1. Ziel & Kontext

Der Kunde qualifiziert beim Schaden-melden/Werkstatt-Finder den **Abrechnungsweg**. Drei Wege (bestätigt):
1. **Haftpflicht** (unverschuldet, Gegner-Versicherung): kanonischer Lead→Claim (§ 249, volle Sache + SP1–SP4-Vermittlung). **Nichts Neues nötig.**
2. **Kasko** (selbstverschuldet, eigene Versicherung): **Hinweis** „melde bei deiner Versicherung — sie vermittelt Vertragswerkstätten". Keine Vermittlung durch uns.
3. **Selbstzahler** (keine Versicherung): **Werkstatt-Finder** → Lead + **Lead-Werkstatt-Termin** (kunde-verwaltbar über Flow-Token, kein Claim).

SP-A liefert: das `abrechnungsweg`-Feld + die reparatur_termine-Erweiterung (Lead-Termin) + die reine Qualifikations-/Routing-Logik. Alles additiv.

## 2. Datenmodell (Migrationen — Plugin)

### 2.1 `abrechnungsweg` (Anfrage + Lead)
```sql
ALTER TABLE public.gutachter_finder_anfragen ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
```
- Eigenes Feld statt `schuldfrage` allein: `schuldfrage` (gegner/eigenverantwortung) trennt Haftpflicht vs. selbstverschuldet, aber NICHT Kasko vs. Selbstzahler. `abrechnungsweg` kodiert alle 3 explizit + carry-overt Lead→(ggf. Claim).
- `gutachter_finder_anfragen` hat schon `werkstatt_id` + `schuldfrage` (Werkstatt-Scaffolding) — wird konzeptuell zur „Schaden-Finder-Anfrage".

### 2.2 `reparatur_termine` — Lead-Termin (Selbstzahler)
```sql
ALTER TABLE public.reparatur_termine ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
ALTER TABLE public.reparatur_termine ALTER COLUMN claim_id DROP NOT NULL;
ALTER TABLE public.reparatur_termine ADD CONSTRAINT reparatur_termine_claim_xor_lead
  CHECK (num_nonnulls(claim_id, lead_id) = 1);   -- GENAU eines von claim/lead
CREATE INDEX IF NOT EXISTS reparatur_termine_lead_id_idx ON public.reparatur_termine(lead_id);
```
- Ein Werkstatt-Termin hängt an einem **Claim** (Haftpflicht, SP2) **ODER** einem **Lead** (Selbstzahler). CHECK erzwingt genau eines.
- `ON DELETE CASCADE` auf lead (analog claim) — Termin stirbt mit Lead/Claim.

### 2.3 Lead-Werkstatt-Gate + RLS-Erweiterung
```sql
-- Neu: Werkstatt-Gate fuer Lead-basierte Termine (analog is_werkstatt_for_claim).
CREATE OR REPLACE FUNCTION public.is_werkstatt_for_lead(p_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM leads l
    WHERE l.id = p_lead_id
      AND l.reparatur_werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
  );
$$;
```
Die **werkstatt-gegateten** reparatur_termine-Policies (SP2 `_select`/`_update`) werden erweitert, damit die Werkstatt auch ihre **Lead-Termine** sieht/bearbeitet:
```sql
-- DROP + CREATE reparatur_termine_select / _update mit erweitertem USING:
USING (
  is_staff()
  OR (claim_id IS NOT NULL AND is_werkstatt_for_claim(claim_id))
  OR (lead_id  IS NOT NULL AND is_werkstatt_for_lead(lead_id))
)
```
- **Kunde-Zugriff auf Lead-Termine:** NICHT über Client-RLS (leads haben keine kunde-owner-Policy — Zugriff läuft über Flow-Token). Der Selbstzahler-Kunde liest/schreibt seinen Lead-Termin über eine **Flow-Action** (Admin-Client, Token-gebunden — Muster wie SP2 `speichereReparaturWunschterminFlow`). Die SP4-Kunde-Policies (claim-basiert) bleiben unverändert.
- Staff-Policies decken beides (claim+lead) via `is_staff()`.

Regel-2-Flow (Plugin) je Migration: `apply_migration` → `list_migrations` → File==Version → `execute_sql` verifizieren.

## 3. Reine Routing-Logik

**Neu:** `src/lib/werkstatt/abrechnungsweg.ts` (rein, client-safe):
```ts
export type Abrechnungsweg = 'haftpflicht' | 'kasko' | 'selbstzahler'
export type SchadenRoute = 'kanonisch' | 'kasko_hinweis' | 'werkstatt_finder'

/** Leitet den Abrechnungsweg aus der Qualifikation ab.
 *  schuldfrage 'gegner' -> haftpflicht. 'eigenverantwortung' + ueberVersicherung -> kasko, sonst selbstzahler. */
export function resolveAbrechnungsweg(args: {
  schuldfrage: string | null
  ueberEigeneVersicherung: boolean | null
}): Abrechnungsweg | null

/** Route pro Weg: haftpflicht->kanonisch (Lead/Claim), kasko->Hinweis, selbstzahler->Werkstatt-Finder. */
export function routeForAbrechnungsweg(weg: Abrechnungsweg): SchadenRoute
```
Mapping:
| schuldfrage | über eigene Versicherung | abrechnungsweg | route |
|---|---|---|---|
| `gegner` | — | `haftpflicht` | `kanonisch` |
| `eigenverantwortung` | `true` | `kasko` | `kasko_hinweis` |
| `eigenverantwortung` | `false` | `selbstzahler` | `werkstatt_finder` |
| null / unklar | — | `null` | (Flow fragt nach) |

Reine Funktion, vollständig getestet — SP-B konsumiert sie für die Flow-Weiche.

## 4. Abgrenzung (SP-A NICHT)
- Kein Flow-UI (SP-B) · keine Karte (SP-C) · keine Kunde-Termin-Verwaltung (SP-D).
- Kein Kasko-Hinweis-Text-UI (SP-B).
- Keine `werkstattbindung`-Spalte (durch Kasko-Hinweis gedeckt).

## 5. Testing
- **`resolveAbrechnungsweg` / `routeForAbrechnungsweg`**: alle 4 Mapping-Zeilen + null-Fall. vitest.
- **DB (READ, prod nach Migration):** `abrechnungsweg` auf gfa+leads (CHECK 3 Werte) · reparatur_termine claim_id nullable + lead_id + XOR-CHECK · `is_werkstatt_for_lead` existiert · erweiterte Policies.
- **RLS-Smoke (JWT-sim, ephemere Lead-Termin-Fixture):** Werkstatt sieht ihren Lead-Termin (is_werkstatt_for_lead), Fremd-Werkstatt 0 (IDOR), Staff sieht, anon 0. (Wie der Prod-Smoke des Vermittlungs-Blocks.)

## 6. Koordination
- `gutachter_finder_anfragen` (Gutachter-Finder, viele Consumer) + `reparatur_termine` (mein SP2, #3555 merged) + `leads` — alle **additiv** erweitert (neue Spalten/Constraint/Policy-Erweiterung; keine bestehende Semantik geändert). Der XOR-CHECK auf reparatur_termine ist rückwärtskompatibel (bestehende Zeilen haben claim_id gesetzt, lead_id NULL → num_nonnulls=1 ✓).
- 1069c2a2 baut `werkstatt-unified-view` — berührt evtl. reparatur_termine-Reads; die Spalten-Erweiterung ist additiv (bricht keine Reads).

## 7. Definition of Done
- [ ] `abrechnungsweg` auf gfa + leads (CHECK), prod-live.
- [ ] `reparatur_termine` +lead_id, claim_id nullable, XOR-CHECK, prod-live (bestehende Zeilen bestehen den CHECK).
- [ ] `is_werkstatt_for_lead` + erweiterte werkstatt-Policies, prod-live + RLS-Smoke bestanden.
- [ ] `resolveAbrechnungsweg`/`routeForAbrechnungsweg` rein + getestet.
- [ ] vitest grün, tsc 0, Build grün, 3 Ratchets 0-neu, 7-Punkte-Audit.
