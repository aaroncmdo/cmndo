# CMM-60 Schritt 2b — SV-Claim-Projektion `v_claim_sv` (Design)

**Datum:** 2026-05-16 · **Ticket:** CMM-60 · **Branch (Folge):** `kitta/cmm-60-schritt2b-sv-projektion`
**Vorgänger:** Schritt 1 (`claims.sv_id`, PR #1391) + Schritt 2 (`is_sv_for_claim` auf `claims.sv_id`, PR #1393, appliziert)

---

## 1 · Ziel & Scope

Der Gutachter (SV) hat einen Lifecycle-Split: er bearbeitet den **Auftrag-Lifecycle** eines Claims, nicht den **Kanzleifall-Lifecycle**. Die heutige RLS-Policy `claims_kunde_sv_dispatch_select_consolidated` gibt einem zugewiesenen SV jedoch die **ganze `claims`-Zeile** — inklusive Kanzleifall-Spalten (`kanzlei_ansprechpartner_*`, `kanzlei_wunsch*`, `kanzlei_uebergeben_am`) und `regulierungs_betrag`.

Heute ist das **latent**: das SV-Portal liest `faelle`, nicht `claims`. Bei der Phase-4-Reader-Migration (SV-Portal → `claims`) würde aus dem latenten Over-Exposure ein echtes **Lifecycle-Leck**.

**In Scope:** Ein spalten-gewhitelisteter, SV-gescopeter Read-Only-View `v_claim_sv` als Phase-4-fertiges Lese-Ziel.

**NICHT in Scope (= Phase 4):** Entzug der direkten `claims`-Tabellen-SELECT des SV (`is_sv_for_claim` aus `claims_kunde_sv_dispatch_select_consolidated`) und Umstellung der heutigen SV-`claims`-Reader auf den View. Bewusste Entscheidung (Aaron, 2026-05-16): „View jetzt, Closure später". Der View existiert dann bereits als sicheres Ziel.

**Erfolgskriterium:** `v_claim_sv` existiert, liefert einem authentifizierten SV genau seine Claims mit genau den 62 Whitelist-Spalten; ein Smoke unter echtem SV-Auth-Kontext zeigt: eigene Claims sichtbar, fremde nicht, Kanzlei-/Regulierungs-Spalten nicht vorhanden.

---

## 2 · Ansatz

**Gewählt: ein View `v_claim_sv`** — analog dem bestehenden `v_claim_for_gast`:

- `security_invoker = true` — der View läuft mit den Rechten des abfragenden Users, die `claims`-RLS (`is_sv_for_claim`) greift also weiter und übernimmt das Row-Scoping. Konsistent mit `v_claim_for_gast` / `v_claim_listing`.
- Explizite **Spalten-Whitelist** im `SELECT` (62 Spalten) — das ist das Column-Scoping.
- `WHERE public.is_sv_for_claim(c.id)` — selbst-dokumentierender Row-Filter (redundant zur RLS dank `security_invoker`, aber explizit = lesbar + robust falls der View je `security_definer` würde).
- `GRANT SELECT ON public.v_claim_sv TO authenticated` — der View ist read-only; Schreibzugriff bleibt über die bestehenden `claims`-Pfade.

**Verworfen:**
- *Column-GRANTs auf `claims`* (`GRANT SELECT (spalten) … TO authenticated`) — `authenticated` ist die gemeinsame Rolle aller Portale (Kunde, Dispatch, Kanzlei). Column-Grants lassen sich nicht SV-spezifisch vergeben.
- *Mega-View mit Rollen-Switch* (`CASE auth-rolle …`) — unübersichtlich, RLS-Logik im View-Body, schwer zu prüfen.

---

## 3 · Spalten-Policy (82 `claims`-Spalten)

### 3.1 Whitelist — im View (62)

`abgeschlossen_am`, `anzahl_beteiligte_total`, `auslandskennzeichen`, `brn`, `claim_nummer`, `created_at`, `entdeckt_am`, `fahrerflucht`, `fall_typ`, `finanzierung_leasing`, `gegner_aktenzeichen`, `gegner_bekannt`, `gegner_versicherung_id`, `gegner_versicherungsnummer`, `gegnerisches_vehicle_id`, `gewerbe_flag`, `halter_ungleich_fahrer`, `hat_abschleppung`, `hat_mietwagen`, `hat_nutzungsausfall`, `hat_personenschaden`, `hat_sachschaden`, `hergang_kunde_text`, `hergang_sv_text`, `id`, `kunde_email`, `kunde_no_show_count`, `kunden_konstellation`, `kundenbetreuer_id`, `letzter_no_show_am`, `letzter_sv_no_show_am`, `phase`, `polizei_aktenzeichen`, `polizei_bericht_vorhanden`, `polizei_vor_ort`, `polizeibericht_status`, `sachschaden_beschreibung`, `schadenart`, `schadenort_adresse`, `schadenort_kategorie`, `schadenort_land`, `schadenort_lat`, `schadenort_lng`, `schadenort_ort`, `schadenort_plz`, `schadentag`, `schadenzeit`, `spezifikation`, `status`, `sv_id`, `sv_no_show_count`, `unfall_konstellation`, `unfallskizze_ablehnung_grund`, `unfallskizze_bestaetigt`, `unfallskizze_generiert_am`, `unfallskizze_svg`, `unfallskizze_url`, `updated_at`, `vehicle_id`, `vorschaden_mit_vs_abgerechnet`, `vorsteuerabzugsberechtigt`, `zeugen_kontakte`

Begründung: alle Schaden-/Unfall-/Fahrzeug-/Polizei-/Skizze-/Status-/Vorschaden-/Zeugen-/No-Show-Felder gehören zum Auftrag-Lifecycle bzw. zu neutralen Stammdaten, die der SV für Besichtigung + Gutachten braucht. `kunde_email` + Kontakt: der SV kontaktiert den Kunden für den Termin — heute schon SV-sichtbar im Portal.

### 3.2 Ausgeschlossen (20)

| Gruppe | Spalten | Grund |
|---|---|---|
| Kanzleifall-LC + Regulierung (8) | `kanzlei_ansprechpartner_email/name/telefon`, `kanzlei_uebergeben_am`, `kanzlei_wunsch`, `kanzlei_wunsch_gefragt_am`, `kanzlei_wunsch_gefragt_in_phase`, `regulierungs_betrag` | Kanzleifall-Lifecycle — nicht der Auftrag-LC des SV |
| Interner Admin-Audit (5) | `created_by_user_id`, `created_via`, `endzustand_gesetzt_am`, `endzustand_gesetzt_durch_user_id`, `endzustand_grund` | interne Claimondo-Workflow-Spalten, kein SV-Bezug |
| Rechtlich / PII-minimal (4) | `verjaehrt_am` (Verjährung = rechtlich), `vs_ablehnungs_grund` (Regulierungs-Seite), `lead_id` + `geschaedigter_user_id` (interne FKs/User-IDs ohne SV-Nutzen) | Lifecycle-fremd bzw. PII-Minimierung |
| Finanzierer-Detail (3) | `finanzierungsgeber_name`, `finanzierungsgeber_adresse`, `finanzierungsgeber_vertragsnr` | Abrechnungs-/Kanzlei-Domäne (Aaron-Entscheidung 2026-05-16). `finanzierung_leasing` (Boolean) bleibt in der Whitelist. |

---

## 4 · Migration

Neue Migration `supabase/migrations/<ts>_cmm60_schritt2b_v_claim_sv.sql`:

```sql
BEGIN;

CREATE OR REPLACE VIEW public.v_claim_sv
WITH (security_invoker = true)
AS
  SELECT
    c.id, c.claim_nummer, c.status, c.phase, c.fall_typ,
    -- … alle 62 Whitelist-Spalten explizit …
    c.vorsteuerabzugsberechtigt, c.zeugen_kontakte
  FROM public.claims c
  WHERE public.is_sv_for_claim(c.id);

COMMENT ON VIEW public.v_claim_sv IS
  'CMM-60 Schritt 2b: SV-gescopete Claim-Projektion. Spalten-Whitelist auf
   Auftrag-Lifecycle + neutrale Stammdaten — ohne Kanzleifall-LC,
   Regulierung, internen Audit. Row-Filter is_sv_for_claim. Phase-4-Ziel
   der SV-Reader-Migration.';

GRANT SELECT ON public.v_claim_sv TO authenticated;

COMMIT;
```

Apply: Targeted-Apply (`db query --file` + `migration repair`) wegen der lokal-only hängenden isochrone-Migration (siehe CMM-60-Handoff §4). Danach `database.types.ts` regenerieren — der View taucht dann unter `Views` in den Typen auf.

---

## 5 · Verifikation / Smoke

1. **Struktur:** `v_claim_sv` existiert, `security_invoker=true`, hat exakt 62 Spalten, keine der 20 ausgeschlossenen.
2. **RLS-Impersonation** (transaktional, `SET LOCAL ROLE authenticated` + echtes SV-JWT): SV sieht im View nur seine eigenen Claims (Zeilenzahl = `claims WHERE sv_id = eigene sv_id`), 0 fremde.
3. **Negativ-Probe:** `SELECT regulierungs_betrag FROM v_claim_sv` schlägt fehl (Spalte nicht im View) — beweist das Column-Scoping.
4. Kein UI-Smoke nötig: der View hat in Phase 2b **keinen** Consumer (Phase-4-Ziel). Reines DB-Artefakt.

---

## 6 · Danach

- **Phase 4 (separat):** SV-`claims`-Reader auf `v_claim_sv` umstellen, dann `is_sv_for_claim` aus `claims_kunde_sv_dispatch_select_consolidated` entfernen → Closure des Lecks.
- **CMM-60 Schritt 3 (separat, unberührt):** `sv_id`-Writer auf `claims` + Reverse-Sync-Trigger.
