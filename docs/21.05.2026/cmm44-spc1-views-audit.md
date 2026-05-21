# CMM-44 SP-C1 — Views-Audit (kunde-Snapshot-Spalten)

**Datum:** 2026-05-21
**Frage:** Welche Views exponieren die 7 `faelle.kunde_*`-Snapshot-Spalten (vorname/nachname/telefon/strasse/plz/stadt/adresse)?

## Audit-Ergebnis (live `information_schema.columns` JOIN `information_schema.views`)

| View | Spalten (Output-Name) | Quelle | Aktion |
|---|---|---|---|
| `v_claim_listing` | `kunde_vorname`, `kunde_nachname` | **`profiles` p** via `claims.geschaedigter_user_id` (`p.vorname AS kunde_vorname`) | **KEINE** — liest nicht aus `faelle.kunde_*`, also nicht stale-prone durch SP-C1-Writes. |
| `v_faelle_mit_aktuellem_termin` | alle 7 (`kunde_vorname/nachname/telefon/strasse/plz/stadt/adresse`) | **`faelle` f** (`f.kunde_vorname` …) | **Repoint** auf geschaedigter-Partei (`claim_parties`). |

## Repoint-Detail `v_faelle_mit_aktuellem_termin`

`pg_get_viewdef` (live) las die 7 Spalten direkt aus `f.`. Repoint via **LEFT JOIN LATERAL … LIMIT 1** auf die geschaedigter-Partei:

```sql
LEFT JOIN LATERAL ( SELECT cp.vorname, cp.nachname, cp.telefon,
        cp.adresse_strasse, cp.adresse_plz, cp.adresse_ort
       FROM claim_parties cp
      WHERE cp.claim_id = c.id AND cp.rolle = 'geschaedigter'
      ORDER BY cp.created_at NULLS LAST, cp.id
     LIMIT 1) cp_g ON true
```

Output-Mapping (Output-Name unverändert):
- `f.kunde_vorname` → `cp_g.vorname AS kunde_vorname`
- `f.kunde_nachname` → `cp_g.nachname AS kunde_nachname`
- `f.kunde_telefon` → `cp_g.telefon AS kunde_telefon`
- `f.kunde_strasse` → `cp_g.adresse_strasse AS kunde_strasse`
- `f.kunde_plz` → `cp_g.adresse_plz::text AS kunde_plz` (**Cast**: cp.adresse_plz ist `varchar(10)`, View-Spalte `kunde_plz` ist `text` → ohne Cast 42P16 bei `CREATE OR REPLACE VIEW`)
- `f.kunde_stadt` → `cp_g.adresse_ort AS kunde_stadt`
- `f.kunde_adresse` → `cp_g.adresse_strasse AS kunde_adresse` (Legacy-Kombifeld, cov 1; mappt auf adresse_strasse gemäß Reader-Fallback-Regel — kein separates cp-Feld)

### Warum LATERAL statt einfacher LEFT JOIN (Abweichung von Spec §5)
Spec/Plan sagten „1:1 → einfacher LEFT JOIN". Live-Check: max 1 geschaedigter-Zeile pro Claim, **aber kein UNIQUE-Constraint** auf `claim_parties(claim_id, rolle)` (nur pkey + airdrop_token_key). „1:1" ist also ein Daten-Fakt, keine Schema-Garantie. Ein einfacher LEFT JOIN würde diese stark-konsumierte View bei einer künftigen 2. geschaedigter-Zeile **lautlos fan-outen** (Duplikat-Fallzeilen). LATERAL+LIMIT 1 ist konstraint-unabhängig sicher und konsistent mit den bestehenden `t`/`cur_auftrag`-LATERALs derselben View.

### Out-of-scope-Spalten in dieser View (unangetastet)
`c.kunde_email` (claims, CMM-60-DUP-Whitelist), `f.kunde_lat`, `f.kunde_lng` (deferred Geocoding), `f.kunde_id` (→ claims.geschaedigter_user_id, eigener FK-Sweep).

## Dry-Run-Verifikation (BEGIN … ROLLBACK)
- `view_vorname_mismatch_vs_cp` = **0** (View liest jetzt aus cp).
- `view_rowcount` = `faelle_rowcount` = **46** (kein Fan-out durch LATERAL).
- `CREATE OR REPLACE VIEW` ohne Fehler → Spaltenliste/Typen/Reihenfolge erhalten (Postgres erzwingt das).
- Generator-Diff: nur die 7 kunde-Zeilen + LATERAL-Block geändert, alle übrigen 469 Zeilen byte-identisch (kein Transcription-Drift).
