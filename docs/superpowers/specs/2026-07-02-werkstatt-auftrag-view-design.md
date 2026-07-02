# Werkstatt-Auftrag-View — kanonische, DB-getriebene SSoT-View für die Werkstatt-Vermittlung

**Datum:** 2026-07-02 · **Session:** cec48090 · **Branch:** `kitta/werkstatt-auftrag-view` (off staging)

## Ziel

Eine **kanonische, wiederverwendbare, RLS-gegatete Datenbank-View** (`v_werkstatt_auftrag`) als Single-Source-of-Truth für das, was eine Werkstatt über ihre vermittelten Aufträge sieht — inkl. **Besichtigungstermin + Gutachter** (damit die Werkstatt das Fahrzeug für die Besichtigung koordinieren kann) und dem **Werkstatt-Ansprechpartner**. Koordination läuft über Claimondo (minimierte PII, kein Direktkontakt Werkstatt↔Kunde/Gutachter).

Deckt beide Vermittlungs-Richtungen: **inbound** (Werkstatt bringt Claim via QR → `werkstatt_id`) + **outbound** (Claimondo vermittelt Auftrag an Partner-Werkstatt → `reparatur_werkstatt_id`).

## Kontext / Ist-Stand (gegen Prod verifiziert 02.07.)

- `claims` hat bereits `werkstatt_id`, `reparatur_werkstatt_id`, `reparaturwunsch`, `reparatur_vermittlung_status`, `reparatur_werkstatt_quelle`, `reparatur_werkstatt_zugewiesen_am` (Session 1069c2a2, DDL schon in prod).
- `werkstaetten.ansprechpartner_person_id` ist **0/7 befüllt** + es gibt **keine `persons`-Tabelle** → totes Modell. Neuer direkter Text-Column ist die saubere Lösung.
- Besichtigung: `gutachter_termine(claim_id, typ, start_zeit, besichtigungsort_adresse, status, assignee_id)`.
- Gutachter: `claims.sv_id → sachverstaendige.firmenname`.
- Fahrzeug: `claim_vehicle_involvements(rolle='geschaedigter') → vehicles(hersteller, modell_haupttyp, modell_untertyp, kennzeichen_aktuell, fin)`.
- Provision: `werkstatt_provisionen(werkstatt_id, claim_id, betrag_netto_eur, status)`.
- Bestehende RPC `get_werkstatt_reparatur_auftraege` (prod) + Werkstatt-Inbox `/werkstatt/auftraege` (Branch `kitta/werkstatt-freigabe-followups`) = die künftigen Consumer der View.

## Architektur

Drei additive Bausteine — diese Spec deckt Teil 1+2 (die DB-SSoT-Schicht). Teil 3 (Portal-Anzeige) ist Consumer → separater Slice, koordiniert mit der Inbox-Domäne.

### Teil 1 — `werkstaetten.ansprechpartner_name` (neuer Column)
- `ALTER TABLE werkstaetten ADD COLUMN ansprechpartner_name text` (nullable — 7 Bestand backfillbar).
- Pflicht-Erfassung auf Werkstatt-Anlage (Self-Registrierung `/werkstatt/registrieren` + Admin-Create) — UI-Teil, in dieser Spec als Anforderung notiert, Umsetzung im Plan.
- Totes `ansprechpartner_person_id` bleibt unberührt (deprecated).

### Teil 2a — Helfer `is_werkstatt_for_claim(p_claim_id uuid) → boolean`
SECURITY DEFINER, analog zu `is_sv_for_claim` / `is_claim_user_party`. Kapselt die Werkstatt-Ownership (beide Richtungen):
```sql
CREATE OR REPLACE FUNCTION public.is_werkstatt_for_claim(p_claim_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM claims c
    WHERE c.id = p_claim_id
      AND (c.werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid()))
        OR c.reparatur_werkstatt_id IN (SELECT id FROM werkstaetten WHERE user_id = (SELECT auth.uid())))
  );
$$;
```
**Safety-Net-Integration:** `is_werkstatt_for_claim` wird in `scripts/check-claim-view-rls.mjs` → `audit_ungated_definer_views()` als bekanntes Gate registriert (analog `is_sv_for_claim`), damit die neue View NICHT fälschlich als „ungated" geflaggt wird. `audit_claim_views_leaking_to_nobody()` prüft sie automatisch (claim_id-Spalte → Nobody muss 0 sehen).

### Teil 2b — View `v_werkstatt_auftrag`
Eine Zeile pro Claim (der Auftrag). Grain-Entscheid: ein Claim mit beiden Werkstatt-Links (selten) = eine Zeile, beide verlinkten Werkstätten sehen sie (Gate deckt beide). Spalten:

| Gruppe | Spalten (minimiert) |
|---|---|
| Vermittlung | `claim_id`, `vermittlung_status` (reparatur_vermittlung_status), `quelle` (reparatur_werkstatt_quelle), `zugewiesen_am`, `richtung` (`'vermittelt'` wenn reparatur_werkstatt_id gesetzt sonst `'inbound'`) |
| Claim | `claim_nummer`, `schadenart`, `reparaturwunsch`, `claim_status` (status) |
| Fahrzeug | `fahrzeug_hersteller`, `fahrzeug_modell` (haupttyp‖untertyp), `kennzeichen` (kennzeichen_aktuell), `fin` |
| Besichtigung | `besichtigung_start` (start_zeit), `besichtigung_ort` (besichtigungsort_adresse), `besichtigung_status` (status) — aus dem aktuellsten `gutachter_termine` mit `typ='sv_begutachtung'` |
| Gutachter | `gutachter_firmenname` (sachverstaendige.firmenname) — **kein Direktkontakt** |
| Kunde | `kunde_name` (COALESCE profiles/leads vorname‖nachname) — **kein Telefon/Email** |
| Werkstatt | `werkstatt_id`, `werkstatt_name`, `werkstatt_ansprechpartner` (ansprechpartner_name) |
| Provision | `provision_betrag_netto`, `provision_status` |

**Gate (WHERE in der View):** `is_staff() OR is_werkstatt_for_claim(id)` — Werkstatt sieht NUR eigene Aufträge (beide Richtungen), Staff sieht alle, Kunde/Makler/SV sehen 0.

**View-Härtung (aus dem Claim-View-Audit gelernt):** SECURITY DEFINER, `GRANT SELECT TO authenticated`, `REVOKE FROM anon`, Gate als WHERE-Klausel (kein anon-Leak). DDL via Plugin/Regel 2.

**Joins:** `claims c` LEFT JOIN `claim_vehicle_involvements`(rolle='geschaedigter')→`vehicles` · LEFT JOIN LATERAL aktuellster `gutachter_termine`(typ='sv_begutachtung', ORDER BY start_zeit DESC LIMIT 1) · LEFT JOIN `sachverstaendige`(c.sv_id) · LEFT JOIN kunde-Name(profiles c.geschaedigter_user_id ‖ leads c.lead_id) · LEFT JOIN `werkstaetten`(COALESCE reparatur_werkstatt_id, werkstatt_id) · LEFT JOIN `werkstatt_provisionen`(claim_id + werkstatt). WHERE: mind. ein Werkstatt-Link gesetzt.

## Koordination

Rein **additiv**: neuer Column + Helfer + View + 1 Zeile im check-claim-view-rls-Audit. Liest 1069c2a2s Spalten (schon in prod), fasst KEINE ihrer Files an, lebt neben `get_werkstatt_reparatur_auftraege`. Consumer (Inbox/Portal) migrieren inkrementell auf die View (Teil 3, koordiniert mit `kitta/werkstatt-freigabe-followups`). Kein Cross-Session-Konflikt.

## Testing

**Cross-Rollen-RLS-Smoke gegen Prod** (Muster wie `termine`, `set local role authenticated` + JWT):
1. 2 Test-Aufträge seeden (Werkstatt A + Werkstatt B, je ein Claim mit reparatur_werkstatt_id).
2. Werkstatt-A-User: sieht nur A-Auftrag (nicht B) · Werkstatt B: nur B · Staff (admin): beide · Kunde/Makler/SV: 0.
3. Test-Zeilen wieder löschen.
4. `is_werkstatt_for_claim` direkt: true für eigenen Claim, false für fremden.
5. `check-claim-view-rls.mjs` läuft grün (View row-gegatet, Nobody sieht 0, kein anon-Leak).
6. vitest für die View-Feld-Ableitung (richtung, COALESCE-Logik) sofern rein-logisch extrahierbar; sonst Live-SQL-Assertion.

## Scope-Grenzen (bewusst NICHT in dieser Spec)

- Teil 3: Werkstatt-Inbox/Portal-Anzeige der View (Consumer, followups-Domäne).
- Änderungen an 1069c2a2s Vermittlungs-Modell/Assignment-Flow.
- Externe DMS-Schnittstelle (Werbas/Audatex).
- Provision-Berechnung (bleibt bei `werkstatt_provisionen`).

## Akzeptanzkriterien

1. `werkstaetten.ansprechpartner_name` existiert, backfillbar, auf Anlage erfassbar.
2. `is_werkstatt_for_claim(claim_id)` liefert korrekt true/false (beide Richtungen), in check-claim-view-rls als Gate registriert.
3. `v_werkstatt_auftrag` liefert pro Auftrag alle Entitäten (Claim/Fahrzeug/Besichtigung/Gutachter/Kunde-Name/Werkstatt/Ansprechpartner/Provision), minimierte PII.
4. RLS: Werkstatt sieht nur eigene (beide Richtungen), Staff alle, andere 0 — per Prod-Smoke bewiesen.
5. `check-claim-view-rls.mjs` grün (View gegatet, kein Nobody-/anon-Leak).
6. Additiv/kollisionsfrei: keine fremden Files, DDL via Plugin, File==getrackte Version.
