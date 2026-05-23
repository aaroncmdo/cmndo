# Handoff — CMM-44 SP-I1 (LexDrive + Klage → `kanzlei_faelle`)

**Datum:** 2026-05-23
**Branch:** `kitta/cmm44-spi1-mandat-lexdrive` · **PR:** #1559 (gegen `staging`)
**Spec:** `docs/superpowers/specs/2026-05-23-cmm44-spi1-mandat-lexdrive-design.md`
**Plan:** `docs/superpowers/plans/2026-05-23-cmm44-spi1-mandat-lexdrive.md`

## Was erledigt ist

CMM-44 SP-I (Kanzleifall-LC, 56 Spalten, größtes Cluster), **Slice 1**: die 4 dormanten LexDrive/Klage-Spalten von `faelle` auf die 1:1-Sub-Table `kanzlei_faelle` umgezogen. **Rein additiv** — kein `DROP` (Phase 6).

| Spalte | Typ | cov (faelle) |
|---|---|--:|
| `lexdrive_case_id` | text | 0 |
| `lexdrive_ocr_data` | jsonb | 0 |
| `lexdrive_ocr_received_at` | timestamptz | 0 |
| `klage_uebergeben_am` | timestamptz | 0 |

**Eine PR (#1559), 4 Commits:** Design (`dd269918`) → Plan (`44a4ae78`) → Migration+Scripts (`15d5866a`) → Types (`a5e9d95b`).

- **Migration `20260523084506`** (appliziert via Supabase-CLI `db query --linked` + `migration repair --status applied`, kein `db push`, **keine** Management-API): 4× `ADD COLUMN` auf `kanzlei_faelle` + `CREATE OR REPLACE VIEW v_faelle_mit_aktuellem_termin`.
- **View-Repoint:** die 4 Quellen `f.<col>` → `kf.<col>` + neuer `LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id` (1:1 via UNIQUE — **kein** LATERAL). View-DDL **server-seitig generiert** (`pg_get_viewdef` + `replace()`), nicht hand-transkribiert. `f.mandatsnummer` bewusst unberührt.
- **Backfill:** No-op (cov=0, `kanzlei_faelle` 0 Rows).
- **Kein Code-Sweep:** einziger Reader `gutachter/fall/[id]/page.tsx` (`lexdrive_case_id`) liest über die repointete View → Pattern E, kein Change. Keine Writer der 4 Spalten im Code.

## Verifikation

- `spi1_neu_auf_kanzlei_faelle = 4`; alle 4 `kf_*`-Booleans `true`.
- View-Sanity (Substring-Falle umgangen, s.u.): 0 echte `faelle`-Quelle für die 4, `f.mandatsnummer` weiterhin vorhanden.
- Voller Build grün (`npm run build`, exit 0, 110s).
- **DB-Smoke** der live repointeten View: `SELECT id, lexdrive_case_id, …, mandatsnummer FROM v_faelle_mit_aktuellem_termin LIMIT 3` läuft fehlerfrei, 4 Spalten = NULL (wie vor dem Repoint, da beide Quellen leer) → verhaltensneutral.
- Re-Grep: 0 neue `faelle`-Direkt-Reads/Writes der 4 Spalten.

## Reviews (subagent-driven, je Task spec + code-quality)

- **Migration:** Spec ✅ (byte-für-byte View-Diff = exakt die 5 Edits), Code-Quality ✅ (1:1-UNIQUE-Join fan-out-frei live bestätigt, keine abhängigen Views/Matviews, Typen identisch → kein Cast, kein Behavior-Change). Ein Important-Fix: Erwartungs-Kommentare in `verify.sql` ergänzt.
- **Apply/Types:** Spec ✅, Code-Quality ✅ mit dokumentiertem Hinweis (s.u. matelso-Drift).

## Offene/lose Enden

1. **Browser-Portal-Smoke** noch offen — Schema ist bereits live in der geteilten DB, App-Code unverändert, verhaltensneutral erwartet. SV `gutachter/fall/[id]` + Sanity Admin/Kunde/Public gegen `app.staging.claimondo.de`.
2. **Inzidente `matelso_calls`-Type-Drift** im Types-Commit `a5e9d95b`: der Regen hat die vorbestehende Live-DB-FK `matelso_calls_fall_id_fkey` (fall_id→faelle) + View-Referenzen mit übernommen (neben `lead_id`→`leads`). **Beide FKs live verifiziert** → Types sind korrekt ggü. DB; staging-Types waren nur stale. Nicht gestrippt (würde generierte Types lügen lassen). Gehört eigentlich zum matelso-Workstream (`kitta/matelso-integration`).
3. **PR #1559** wartet auf Review + Aaron-Merge (kein Auto-Merge).

## Lessons

- **Substring-Falle bei `position('f.<col>' …)`:** `f.lexdrive_case_id` ist Substring von `kf.lexdrive_case_id` → der naive `position()`-Check ist nach dem Repoint nicht 0. Mit Regex `'(^|[^k])f\.<col>'` prüfen (Plan Task 2 Step 4 korrigiert).
- **Server-seitige View-DDL-Generierung** (`pg_get_viewdef` + verschachteltes `replace()`) schlägt Hand-Transkription eines ~200-Spalten-Views — deterministisch, fehlerfrei, nutzt die Live-DB als Quelle (robust gegen parallele View-Änderungen anderer Sessions).
- **1:1-Sub-Table-Repoint** braucht nur `LEFT JOIN … ON kf.claim_id = c.id` (UNIQUE) — kein LATERAL/`LIMIT 1` wie bei 1:N (SP-H `auftraege`). Typen identisch → kein Precision-Cast nötig (anders als SP-G).
- **Geteilte DB → Type-Regen zieht fremde applied-but-unmerged Schema-Drift** (hier matelso). Erwartbar; nicht strippen, dokumentieren.
- **Dormante cov=0-Spalten** = günstigster Slice: reine Relocation, kein Backfill, kein Sweep. Bei der SP-I-Restmenge zuerst nach cov=0-Clustern suchen.

## Nächster CMM-44-Schritt

SP-I-Restmenge: **`mandatsnummer`-Slice** (Reklassifizierung: CLM-YYYY-Fallnummer → `claims` wie `claim_nummer` vs. Salesforce-Mandat-ID → `kanzlei_faelle`; löst den `filmcheck.ts`/`push-mandat.ts`-Doppel-Writer-Konflikt) + `kanzlei_id`. Danach Dokumente-AS (4 MOVE), Regulierung (viele MOVE), Kanzlei-DUP. Oder anderes Cluster (SP-C Parteien, SP-E/F Fahrzeug/Vorschäden).

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
