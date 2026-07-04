# Werkstatt-Finder-Anfrage SP-A — Fundament + Abrechnungsweg — Design

> Sub-Projekt A (Fundament) des Werkstatt-Finder-Anfrage-Features. Legt das `abrechnungsweg`-Feld + die reine Routing-Logik für die 3 Abrechnungswege. **Login-Portal-fähig durch den partiellen Claim** (Selbstzahler = Reparatur-only-Claim, reuse der claim-basierten Infrastruktur). Kein UI — Fundament für SP-B (Flow-Weiche), SP-C (Karte), SP-D (Reparatur-Stepper).

**Datum:** 2026-07-04 · **Session:** cec48090 · **Branch:** `kitta/schaden-finder-abrechnungsweg` (off staging)

---

## 1. Ziel & bestätigtes Modell

Der Kunde qualifiziert den **Abrechnungsweg**; alle drei Wege sind **login-portal-fähig**, weil das Portal claim-basiert ist:
1. **Haftpflicht** (unverschuldet, Gegner-Versicherung): Lead → **voller** Claim (SV/Gutachten/Regulierung + SP1–SP4-Vermittlung). **Nichts Neues.**
2. **Kasko** (selbstverschuldet, eigene Versicherung): **Hinweis** „melde bei deiner Versicherung — sie vermittelt Vertragswerkstätten". Kein Claim, keine Vermittlung.
3. **Selbstzahler** (keine Versicherung): Lead → **partieller Claim** (nur `schadentag` + `abrechnungsweg='selbstzahler'` + Werkstatt; **überspringt SV/Gutachten/Regulierung**) → reuse **claim-owner-RLS + Kunde-Portal + SP2 `reparatur_termine` (claim-based) + SP4-Kunde-RLS/Vorschlag**. Portal zeigt einen **abgeleiteten Reparatur-Stepper**.

**Audit-Beleg:** Die einzige Pflichtspalte auf `claims` ohne Default ist `schadentag` → ein minimaler „Reparatur-only"-Claim ist machbar. Kunde-Portal listet Claims via `geschaedigter_user_id`/`claim_parties`; Leads erscheinen dort nicht → **Claim, nicht Lead**, macht es login-fähig „gratis". „Kein vollständiger Claim" = ein Claim, der die Regulierungs-Phasen überspringt.

## 2. Datenmodell (Migrationen — Plugin, alles additiv)

```sql
-- Abrechnungsweg auf Claim (SSoT), Anfrage (Qualifikation) und Lead (carry-over).
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
ALTER TABLE public.gutachter_finder_anfragen ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS abrechnungsweg text
  CHECK (abrechnungsweg IS NULL OR abrechnungsweg IN ('haftpflicht','kasko','selbstzahler'));
```
- Eigenes Feld statt `schuldfrage` allein: `schuldfrage` (gegner/eigenverantwortung) trennt Kasko/Selbstzahler NICHT. `abrechnungsweg` kodiert alle 3 explizit + fließt Anfrage→Lead→Claim (SSoT auf claims).
- **KEINE `reparatur_termine`-Änderung** — der Selbstzahler-Claim nutzt die claim-basierte SP2-Tabelle unverändert. Der ursprünglich geplante Lead-Termin-Block (lead_id/is_werkstatt_for_lead/lead-RLS) **entfällt komplett**.
- `gutachter_finder_anfragen` hat schon `werkstatt_id` + `schuldfrage` → wird konzeptuell zur „Schaden-Finder-Anfrage".

Regel-2-Flow je Migration: `apply_migration` → `list_migrations` → File==Version → `execute_sql` verifizieren.

## 3. Reine Routing-Logik

**Neu:** `src/lib/werkstatt/abrechnungsweg.ts` (rein, client-safe):
```ts
export type Abrechnungsweg = 'haftpflicht' | 'kasko' | 'selbstzahler'
export type SchadenRoute = 'kanonisch' | 'kasko_hinweis' | 'selbstzahler_reparatur'

/** Leitet den Abrechnungsweg aus der Qualifikation ab. */
export function resolveAbrechnungsweg(args: {
  schuldfrage: string | null            // 'gegner' | 'eigenverantwortung'
  ueberEigeneVersicherung: boolean | null
}): Abrechnungsweg | null

/** Route pro Weg. */
export function routeForAbrechnungsweg(weg: Abrechnungsweg): SchadenRoute

/** Ist es ein Reparatur-only-Claim (Selbstzahler)? -> reduzierter Stepper, SV/Regulierung aus. */
export function istReparaturOnly(abrechnungsweg: string | null): boolean
```
Mapping:
| schuldfrage | über eigene Versicherung | abrechnungsweg | route |
|---|---|---|---|
| `gegner` | — | `haftpflicht` | `kanonisch` |
| `eigenverantwortung` | `true` | `kasko` | `kasko_hinweis` |
| `eigenverantwortung` | `false` | `selbstzahler` | `selbstzahler_reparatur` |
| null / unklar | — | `null` | (Flow fragt nach) |

`istReparaturOnly(w) = (w === 'selbstzahler')`. Rein, vollständig getestet — SP-B (Flow-Weiche) + SP-D (Stepper) konsumieren.

## 4. Abgrenzung (SP-A NICHT)
- **Partieller-Claim-ERZEUGUNG** (convert-lead-to-claim-Selbstzahler-Branch: minimaler Claim, SV überspringen) → **SP-B**.
- **Flow-Weiche** (Abrechnungsweg-Frage + Kasko-Hinweis-UI + Routing) → **SP-B**.
- **Karte** → SP-C. **Reparatur-Stepper-Darstellung** im Kunde-Portal (ClaimStepper liest `abrechnungsweg`) → **SP-D**.
- Kein `reparatur_termine`-Change, keine Lead-RLS, keine `werkstattbindung`-Spalte (Kasko-Hinweis deckt sie).

## 5. Testing
- **`resolveAbrechnungsweg`/`routeForAbrechnungsweg`/`istReparaturOnly`**: alle Mapping-Zeilen + null-Fall. vitest.
- **DB (READ, prod nach Migration):** `abrechnungsweg` auf claims+gfa+leads (CHECK 3 Werte), additiv (bestehende Zeilen NULL = ok).

## 6. Koordination
- `claims` + `gutachter_finder_anfragen` (Gutachter-Finder, viele Consumer) + `leads` — nur **neue nullable Spalte** je Tabelle → maximal additiv, bricht keine Reads/Writes. 1069c2a2 (`werkstatt-unified-view`) unberührt.
- `reparatur_termine` bleibt unangetastet (Pivot weg vom Lead-Termin).

## 7. Definition of Done
- [ ] `abrechnungsweg` auf claims + gfa + leads (CHECK), prod-live, additiv.
- [ ] `resolveAbrechnungsweg`/`routeForAbrechnungsweg`/`istReparaturOnly` rein + getestet.
- [ ] vitest grün, tsc 0, Build grün, 3 Ratchets 0-neu, 7-Punkte-Audit.
