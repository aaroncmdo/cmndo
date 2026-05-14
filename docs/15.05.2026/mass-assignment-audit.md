# AAR-913 — Mass-Assignment-Hardening profiles/sachverstaendige/makler

**Datum:** 15.05.2026
**Branch:** `kitta/aar913-mass-assignment`
**Scope:** Self-Update-Eskalation auf sensitive Spalten der drei Hauptidentitäts-Tabellen blocken, plus 2 latente `ALL`-Policies in gutachter-Abrechnungen.

## Hintergrund

AAR-893 hat im Mai 2026 den **`profiles.rolle`**-Trigger eingeführt, der Self-Eskalation zur Admin-Rolle blockt. AAR-893-Erweiterung hat dann:
- `sachverstaendige`: `verifiziert`, `werbebudget_guthaben_netto`, `ist_aktiv`, `use_custom_branding`
- `makler`: `status`, `provision_betrag_komplett_netto`, `provision_betrag_nur_gutachter_netto`, `provision_aktiv`

geschützt — gleiches Pattern. Diese Migration schließt die verbleibenden HIGH-Risk-Lücken aus Memory `live_rls_audit`.

## Self-Update-Policies (aktuell vs. soll)

UPDATE-Policies sind row-level (auth.uid() = own_id) — sie verhindern fremde Zeilen-Manipulation, **nicht** sensitive Spalten in der eigenen Zeile. Dafür Trigger.

| Tabelle | UPDATE-Policy | Row-Check | Trigger-Schutz (bisher) | Trigger-Schutz (neu) |
|---|---|---|---|---|
| `profiles` | `Profil bearbeiten` | `id = auth.uid() OR is_admin()` | `rolle` | + `sv_paket`, `aktiv` |
| `sachverstaendige` | `sv_update_own` | `profile_id = auth.uid()` | 4 Felder | + `paket`, `paket_faelle_gesamt`, `paket_preis`, `paket_umkreis_km`, `gesperrt_grund`, `gesperrt_seit`, `verifizierung_status` |
| `makler` | `makler_self_update` | `user_id = auth.uid()` | 4 Felder | + `user_id` |

## Konkrete Angriffsvektoren (geschlossen durch diese Migration)

| Vektor | Auswirkung | Trigger blockt jetzt |
|---|---|---|
| User setzt `profiles.sv_paket = 'premium'` | Premium-Paket gratis | ✅ |
| User setzt `profiles.aktiv = true` nach Admin-Deaktivierung | Account-Reaktivierung | ✅ |
| SV setzt `sachverstaendige.paket = 'enterprise'` | Premium-Paket gratis (€€€) | ✅ |
| SV setzt `paket_faelle_gesamt = 9999` | Unbegrenzte Fälle | ✅ |
| SV setzt `paket_preis = 0` | Gratis-Premium | ✅ |
| SV setzt `gesperrt_seit = NULL` | Sperr-Bypass | ✅ |
| SV setzt `verifizierung_status = 'verifiziert'` | Verifizierungs-Spoofing | ✅ |
| Makler setzt `user_id = <fremde_uuid>` | Account-Übernahme | ✅ |

## Mass-Assignment via Policy (gutachter_monatsabrechnungen + _positionen)

Beide Tabellen hatten bisher EINE Policy für SV+Admin mit `cmd=ALL`:

```sql
-- gutachter_monatsabrechnungen (alt)
CREATE POLICY "SV eigene Abrechnungen"
ON gutachter_monatsabrechnungen FOR ALL
USING (sv_id IN (...own sv id...) OR is_admin());
```

→ SV kann eigene Monatsabrechnung **UPDATEN/DELETEN** (Beträge ändern, Datensatz löschen).

**Fix:** Split in zwei Policies — Admin behält `FOR ALL`, SV bekommt nur `FOR SELECT`. Gleiches für `gutachter_abrechnungspositionen`.

## Was NICHT in dieser PR

Verbleibende Spalten zum Audit (nicht klar HIGH, Code-Trace zeigte komplexe Verifizierungs-Flows die sie evtl. via authenticated-Pfad setzen):

- `profiles.twofa_email_verifiziert_am`, `twofa_telefon_verifiziert_am`, `whatsapp_geprueft_am`, `twilio_nummer_provisioned_am`
- `sachverstaendige.anzahlung_*`, `onboarding_*`, `sa_vorlage_*`, `verifiziert_am/von`, `deaktiviert_am/grund`, `paket_faelle_genutzt`
- `makler.aktiviert_am/von`, `gesperrt_am/grund`, `email`

Folge-Ticket: deep-mass-assignment-Audit pro Spalte mit Code-Pfad-Klärung.

## SQL-Proofs (post-migration)

```sql
-- A: SV versucht sv_paket-Eskalation → 42501
SET request.jwt.claims = '{"sub": "<sv-uuid>", "role": "authenticated"}';
UPDATE profiles SET sv_paket = 'premium' WHERE id = '<sv-uuid>';
-- erwartet: ERROR 42501

-- B: SV versucht paket-Manipulation in sachverstaendige
UPDATE sachverstaendige SET paket = 'enterprise' WHERE profile_id = '<sv-uuid>';
-- erwartet: ERROR 42501

-- C: Makler versucht user_id-Übernahme
SET request.jwt.claims = '{"sub": "<makler-user-uuid>", "role": "authenticated"}';
UPDATE makler SET user_id = '<fremde-uuid>' WHERE user_id = '<makler-user-uuid>';
-- erwartet: ERROR 42501

-- D: SV versucht eigene Monatsabrechnung zu UPDATEN
UPDATE gutachter_monatsabrechnungen SET gesamtbetrag = 99999
WHERE sv_id IN (SELECT id FROM sachverstaendige WHERE profile_id = '<sv-uuid>');
-- erwartet: 0 rows affected (keine UPDATE-Policy für SV mehr)

-- E: Admin macht das gleiche → pass
SET request.jwt.claims = '{"sub": "<admin-uuid>", "role": "authenticated"}';
UPDATE profiles SET sv_paket = 'premium' WHERE id = '<test-uuid>';
-- erwartet: 1 row affected
```

## Post-Migration-Smoke

Memory `feedback_post_drop_smoke` greift hier teilweise — Trigger-Änderungen sind kein Schema-Drop, aber Policy-Änderungen auf `gutachter_monatsabrechnungen` sind grenzwertig.

Pflicht-Smoke:
1. Login SV → `/gutachter/abrechnung` lädt ohne 5xx (SELECT funktioniert weiter)
2. Login SV → versuche im SV-Settings sein Paket zu ändern (UI sollte das nicht anbieten, falls doch → 42501)
3. Login Admin → `/admin/sachverstaendige/<id>` → Paket-Editor speichert (Admin-Pfad)
4. Login Makler → `/makler/einstellungen` → eigene Felder speichern (nur erlaubte)

## Memory-Update nach Merge

`project_live_rls_audit` HIGH-Punkt „makler/sv mass-assignment" → **closed**. Sub-Audit der grauen Spalten (siehe „Was NICHT in dieser PR") als separates Followup tracken.
