# CMM-44 SP-H — View-Audit + Trigger-Audit + Defaults-Tabelle

**Datum:** 2026-05-20
**Branch:** kitta/cmm-44-sph-pr1-add-columns
**Scripts:** scripts/cmm44-sph-views-audit.sql, scripts/cmm44-sph-verify.sql

---

## View-Audit-Ergebnis

Ausgefuehrt: `npx supabase db query --linked --file scripts/cmm44-sph-views-audit.sql`

**22 Treffer in 3 Views.**

| view_name | column_name | Quelle | Repoint-Strategie |
|---|---|---|---|
| faelle_sv_view | technische_stellungnahme_beauftragt_am | f.technische_stellungnahme_beauftragt_am | LATERAL JOIN auf auftraege |
| faelle_sv_view | technische_stellungnahme_freigabe_am | f.technische_stellungnahme_freigabe_am | LATERAL JOIN auf auftraege |
| faelle_sv_view | technische_stellungnahme_hochgeladen_am | f.technische_stellungnahme_hochgeladen_am | LATERAL JOIN auf auftraege |
| faelle_sv_view | technische_stellungnahme_status | f.technische_stellungnahme_status | LATERAL JOIN auf auftraege |
| v_claim_full | storniert_am | f.storniert_am | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | filmcheck_am | f.filmcheck_am | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | filmcheck_notizen | f.filmcheck_notizen | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | filmcheck_ok | f.filmcheck_ok | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | storniert_am | f.storniert_am | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | storno_durch_user_id | f.storno_durch_user_id | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | storno_grund | f.storno_grund | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | sv_briefing_generated_at | f.sv_briefing_generated_at | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | sv_briefing_model | f.sv_briefing_model | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | sv_briefing_struktur | f.sv_briefing_struktur | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | sv_briefing_text | f.sv_briefing_text | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | sv_briefing_version | f.sv_briefing_version | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | sv_notizen_vor_ort | f.sv_notizen_vor_ort | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | technische_stellungnahme_beauftragt_am | f.technische_stellungnahme_beauftragt_am | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | technische_stellungnahme_freigabe_am | f.technische_stellungnahme_freigabe_am | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | technische_stellungnahme_hochgeladen_am | f.technische_stellungnahme_hochgeladen_am | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | technische_stellungnahme_notiz_sv | f.technische_stellungnahme_notiz_sv | LATERAL JOIN auf auftraege |
| v_faelle_mit_aktuellem_termin | technische_stellungnahme_status | f.technische_stellungnahme_status | LATERAL JOIN auf auftraege |

### Besonderheit: besichtigung_gestartet_am in v_faelle_mit_aktuellem_termin

Das View-Audit findet `besichtigung_gestartet_am` NICHT in `v_faelle_mit_aktuellem_termin`
(nur 17 statt 18 Treffer). Grund: In dieser View wird `besichtigung_gestartet_am` aus
dem LATERAL JOIN auf `gutachter_termine` (Alias `t`) gespeist — `t.besichtigung_gestartet_am`.
Die Spalte existiert also nicht als `f.*`-Referenz. Sie wird in Block 3c des Migration-SQLs
NICHT repointet (sie bleibt unveraendert aus `gutachter_termine`).

Semantische Konsequenz: Die View exponiert den Besichtigungs-Start-Zeitpunkt aus dem Termin,
nicht aus dem Auftrag. Fuer SP-H ist das akzeptabel — der Termin und der Auftrag koennen
denselben Wert haben (Backfill schreibt `f.besichtigung_gestartet_am` in `auftraege`), aber
die View liest ihn weiterhin aus dem Termin.

### Block-3-Entscheidung

Block 3 ist AKTIV — alle 3 Views werden via `CREATE OR REPLACE VIEW` repointet.
LATERAL JOIN auf den aktuellen Auftrag (`ORDER BY reihenfolge DESC LIMIT 1`).

---

## Trigger-Audit

Ausgefuehrt: pg_trigger + pg_proc Join auf `auftraege`.

**3 Trigger gefunden — kein Side-Effect-Trigger (kein DISABLE/ENABLE-Wrapper notwendig).**

| proname | Beschreibung | Side-Effects? |
|---|---|---|
| auftraege_sync_claim_id | Setzt claim_id aus faelle bei INSERT wenn claim_id NULL + fall_id gesetzt | Nein — reine FK-Sync |
| auftraege_validate_typ_requires_kanzleifall | Prueft dass 'nachbesichtigung'/'stellungnahme'-Typen nur bei Kanzleifall erlaubt sind | Nein — Validation, kein pg_notify |
| tg_auftraege_set_updated_at | Setzt updated_at = now() bei UPDATE | Nein — Timestamp-Update |

Keine `pg_notify`, `net.http_*` oder externen Function-Calls. Kein `DISABLE/ENABLE TRIGGER`-Wrapper
im Backfill-Block der Migration.

---

## Defaults-Tabelle (Live-Messung faelle)

Ausgefuehrt: `information_schema.columns WHERE table_name='faelle'`

| column_name | udt_name | is_nullable | column_default | Abweichung vom Plan? |
|---|---|---|---|---|
| besichtigung_gestartet_am | timestamptz | YES | null | — |
| filmcheck_am | timestamptz | YES | null | — |
| filmcheck_notizen | text | YES | null | — |
| filmcheck_ok | bool | YES | false | In faelle: nullable! Plan sah NOT NULL an — korrigiert auf nullable DEFAULT false |
| storniert_am | timestamptz | YES | null | — |
| storno_durch_user_id | uuid | YES | null | — |
| storno_grund | text | YES | null | — |
| sv_briefing_generated_at | timestamptz | YES | null | — |
| sv_briefing_model | text | YES | null | — |
| sv_briefing_struktur | jsonb | YES | null | — |
| sv_briefing_text | text | YES | null | — |
| sv_briefing_version | int4 | NO | 0 | **DEFAULT=0, NICHT 1!** Plan hatte 1 vermutet. Korrigiert. |
| sv_notizen_vor_ort | text | YES | null | — |
| technische_stellungnahme_beauftragt_am | timestamptz | YES | null | — |
| technische_stellungnahme_freigabe_am | timestamptz | YES | null | — |
| technische_stellungnahme_hochgeladen_am | timestamptz | YES | null | — |
| technische_stellungnahme_notiz_sv | text | YES | null | — |
| technische_stellungnahme_status | text | YES | 'nicht-angefordert'::text | **Default = 'nicht-angefordert' (Bindestrich), NICHT 'nicht_erforderlich' (Unterstrich)!** Plan hatte Unterstrich. Korrigiert. |

### Wichtige Korrekturen vs. Plan-Annahmen

1. **sv_briefing_version DEFAULT=0** (nicht 1) — Migration und COALESCE-Fallback angepasst.
2. **technische_stellungnahme_status DEFAULT='nicht-angefordert'** (Bindestrich, nicht Unterstrich `'nicht_erforderlich'`) — korrigiert.
3. **filmcheck_ok ist nullable in faelle** (is_nullable=YES) — auf auftraege ebenfalls nullable (DEFAULT false), KEIN NOT NULL Constraint.

---

## Migration-Dry-Run-Ergebnis

Ausgefuehrt:
```
sed 's/^COMMIT;/ROLLBACK;/' supabase/migrations/20260520214419_cmm44_sph_add_auftraege_columns.sql > /tmp/sph-pr1-dryrun.sql
npx supabase db query --linked --file /tmp/sph-pr1-dryrun.sql
```

**Ergebnis: Gruen. Keine Fehler. rows=[]. exit 0.**

Migration enthaelt:
- Block 1: 18x ADD COLUMN mit korrekten Defaults (live gemessen)
- Block 2: UPDATE-Backfill mit COALESCE(f.sv_briefing_version, 0)
- Block 3: 3x CREATE OR REPLACE VIEW (faelle_sv_view, v_claim_full, v_faelle_mit_aktuellem_termin)

## Function-Sweep (Nachzug Spec §6-Risiko, 2026-05-20 NIT-Fix)

Spec §6 nennt einen Sweep der nicht-Trigger-gebundenen `pg_proc.prosrc`-Bodies
(SP-A-Lektion). Plan Task 1 Step 5 deckt nur Trigger-bound Functions. Nachgereicht:

```sql
SELECT p.proname, p.prokind, length(p.prosrc) AS bytes,
       array_agg(DISTINCT col ORDER BY col) AS hit_cols
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL unnest(ARRAY[
  'filmcheck_ok','filmcheck_am','filmcheck_notizen',
  'storniert_am','storno_grund','storno_durch_user_id',
  'besichtigung_gestartet_am',
  'sv_briefing_text','sv_briefing_generated_at','sv_briefing_model',
  'sv_briefing_version','sv_briefing_struktur','sv_notizen_vor_ort',
  'technische_stellungnahme_status','technische_stellungnahme_notiz_sv',
  'technische_stellungnahme_beauftragt_am','technische_stellungnahme_hochgeladen_am',
  'technische_stellungnahme_freigabe_am'
]) AS col
WHERE n.nspname='public'
  AND p.prosrc ~* ('\m'||col||'\M')
  AND NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgfoid = p.oid)
GROUP BY p.proname, p.prokind, p.prosrc
ORDER BY p.proname;
```

**Ergebnis:** `rows: []` — keine standalone-Funktion referenziert eine der
18 SP-H-Spalten. Spec §6-Risiko ist auch ohne weitere Migrations-Anpassung
mitigiert. Volltext-Query in `/tmp/sph-function-sweep.sql`.
