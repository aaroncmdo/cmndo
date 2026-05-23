# Handoff — CMM-44 SP-I (Kanzleifall-LC) **fertigstellen**

> **Für die nächste Session.** Ziel: das SP-I-Cluster (Kanzleifall-Lifecycle → `kanzlei_faelle`) zu Ende führen. SP-I1 + SP-I2 sind erledigt; ~33 MOVE-Spalten bleiben, in 3–4 Slices. Diese Datei ist die Roadmap + das Rezept + alle Querverweise.

## Kontext (was SP-I ist)

`faelle` (≈341 Spalten) wird in CMM-44 spaltenweise auf Sub-Tables verteilt; in **Phase 6** stirbt `faelle` per `DROP TABLE`. **SP-I** = die Kanzlei-/Regulierungs-Lifecycle-Spalten → 1:1-Sub-Table **`kanzlei_faelle`** (UNIQUE auf `claim_id` UND `fall_id`; Sync-Trigger `kanzlei_faelle_sync_claim_fall` leitet die jeweils andere FK bei INSERT ab). **Alles rein additiv** — kein per-Spalten-DROP; die `faelle`-Spalten sterben gesammelt in Phase 6.

Quelle der Verdikte: **`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`** (Sektionen Dokumente/Kanzlei/Regulierung/Eskalation/Ruege). **Vor jedem Slice die Verdikte + cov + Typen LIVE gegen `information_schema` re-checken** (Memory [[feedback_information_schema_check]] — Snapshots sind stale, andere Sessions droppen parallel).

## Erledigt

| Slice | Spalten | PRs | Doc |
|---|---|---|---|
| **SP-I1** | 4 LexDrive/Klage: `lexdrive_case_id`, `lexdrive_ocr_data`, `lexdrive_ocr_received_at`, `klage_uebergeben_am` (cov=0) | #1559 (1 PR) | `docs/23.05.2026/handoff-cmm44-spi1-abschluss.md`, specs/plans `2026-05-23-cmm44-spi1-mandat-lexdrive*` |
| **SP-I2** | 11 AS-LC + Mandat: `anschlussschreiben_{am,url,sendedatum,unterschrift,ocr_am}`, `as_{geforderte_summe,frist,vs_reaktion_text,salesforce_id,zuletzt_synced_am}`, `mandatsnummer` | #1570 (Schema), #1581 (Sweep), #1589 (Abschluss) | `docs/23.05.2026/handoff-cmm44-spi2-abschluss.md`, specs/plans `2026-05-23-cmm44-spi2-anschlussschreiben*` |

= **15 Spalten** auf `kanzlei_faelle`. `kanzlei_faelle` hatte 8 Basis-Spalten + jetzt diese 15. `mandatsnummer` hat 12 Live-Werte (backfilled); der Rest cov=0/Default.

**PREREQUISITE:** PR #1581 + #1589 müssen auf `staging` gemergt sein, bevor der nächste Slice branched (er braucht die regenerierten Types + den Helper).

## Restmenge (MOVE → `kanzlei_faelle`) — ~33 Spalten, vorgeschlagene Slices

### SP-I3 — Regulierung/VS (14)
`regulierung_am` (tstz), `regulierung_angekuendigt_am` (tstz), `vs_eskalationsstufe` (text, **cov≈30**), `regulierungsweise` (text), `vs_reaktion_typ` (text), `vs_reaktion_am` (tstz), `kuerzungs_betrag` (numeric), `vs_frist_bis` (tstz), `vs_kuerzung_grund` (text), `vs_quote_prozent` (numeric), `vs_quote_grund` (text), `vs_quote_akzeptiert_am` (tstz), `vs_quote_betrag_ausgezahlt` (numeric), `vs_kuerzungs_typ` (text).
- **Größter Reader/Writer-Sweep**: `process-event.ts` schreibt fast alle (vs_kuerzt/vs_reguliert/vs_quotiert/vs_fristverlaengerung-Events → `computeFieldUpdates`); Reader in VS-Reaktion-Section, `Sections.tsx`, `v_faelle_mit_aktuellem_termin`. **`vs_eskalationsstufe` cov≈30 → Backfill nötig** (wie mandatsnummer in SP-I2).
- **Verdikt-Recheck:** sind `vs_*` wirklich Kanzlei-LC (kanzlei_faelle) oder claim-level (claims)? Decomposition sagt kanzlei_faelle — kurz mit Aaron bestätigen, da VS-Reaktion auch im Admin/SV sichtbar ist.

### SP-I4 — Eskalation (12)
`eskalation_tag_{14,21,28}_am` (tstz), `eskalation_tag_{14,21,28}_ergebnis` (text), `eskalation_tag_{14,21,28}_ergebnis_am` (tstz), `eskalation_tag_{14,21,28}_ergebnis_von` (uuid). Alle cov=0. Writer: `process-event.ts` (`vs_eskalation_kontakt_ergebnis`-Event, dynamische `eskalation_tag_${k}_*`-Keys — Achtung: dynamische Property-Namen, der Peel muss alle 12 statisch kennen). Sauberer cov=0-Slice (Backfill no-op).

### SP-I5 — Rüge (6)
`ruege_erhalten_am` (tstz), `ruege_grund` (text), `ruege_gesendet_am` (tstz), `ruege_betrag` (numeric), `ruege_counter` (int, **cov≈30**), `ruege_frist_tage` (int, **cov≈30**). Writer: `process-event.ts` (`ruege_*_gesendet`-Events). `ruege_counter`/`ruege_frist_tage` cov≈30 → Backfill. Reader: Rüge-Section (Admin), `section-visibility.ts` (ruege-Trigger via `ruege_gesendet_am`/`ruege_counter`).

### SP-I6 — `kanzlei_id` (1, Verdikt TBD)
`kanzlei_id` (uuid, cov=0). Decomposition: „TBD — kanzlei_faelle?". **Heimat-Entscheidung mit Aaron klären** (kanzlei_faelle vs. eine kanzleien-Referenztabelle). Klein; ggf. mit SP-I3 bündeln.

**NICHT SP-I (gehen auf `claims`, eigenes Sub-Projekt, NICHT kanzlei_faelle):** `kanzlei_uebergeben_am`, `kanzlei_ansprechpartner_{name,email,telefon,position}` (DUP/CLAIMS), `regulierung_betrag`→`regulierungs_betrag`, `vs_ablehnungsgrund`→`vs_ablehnungs_grund` (DUP claims). **Dokumente-CLAIMS** (`abtretung_*`, `vollmacht_*`, `sa_*`) ebenfalls → claims, nicht SP-I.

## Das Rezept (bewährt aus SP-I1/SP-I2 — pro Slice)

1. **Branch** off `origin/staging` im Worktree (`scripts/new-session-worktree.mjs cmm44-spi3-... staging`). Worktree braucht `.env.local` (aus Haupt-Tree kopieren) + `supabase link`.
2. **Live-Drift-Check** (`information_schema`): cov + Typen der Slice-Spalten; bestätigen, dass sie noch NICHT auf `kanzlei_faelle` sind.
3. **PR1 — Schema (additiv):** `ALTER TABLE kanzlei_faelle ADD COLUMN` (Typen exakt von `faelle` gespiegelt). **Backfill** nur für cov>0-Spalten via `INSERT … ON CONFLICT (claim_id) DO UPDATE COALESCE` (Muster: SP-I2 mandatsnummer-Block); cov=0 = no-op. **View-Repoint:** mit `pg_catalog` (relkind v+m) prüfen, welche Views die Slice-Spalten exponieren (mind. `v_faelle_mit_aktuellem_termin`, evtl. `v_claim_full`/`faelle_sv_view`). **GOTCHA: `v_faelle_mit_aktuellem_termin` hat den `LEFT JOIN kanzlei_faelle kf` SCHON** (seit SP-I1) → beim Repoint NUR Spalten-Quellen `f.<col>`→`kf.<col>` ersetzen, KEINEN zweiten Join einfügen. Boolean-Default-Spalten → `COALESCE(kf.<col>, <default>) AS <col>` (Pflicht-Alias!). DDL **server-seitig generieren** (`pg_get_viewdef` + `replace()`, kein Hand-Transkript). Migration via CLI (`db query --linked` + `migration repair`, **kein** `db push`, **nie** MCP `apply_migration`). Types-Regen (PowerShell). Voller Build.
4. **PR2 — Sweep + lean Anzeige:** `KANZLEI_FAELLE_COLS` in `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts` um die Slice-Spalten erweitern. **Writer** via `peelKanzleiFaelleColumns` + `await upsertKanzleiFall(db, claimId, kfUpdate)` (v.a. `process-event.ts` — dort koexistieren schon SP-I2/SP-H/SP-D/SP-J-Peels; Reihenfolge egal, aber alle peelen vor faelle/claims-Write). **Reader** auf `kanzlei_faelle` (Embed `claims:claim_id(kanzlei_faelle(...))` ODER direkt `from('faelle').select('kanzlei_faelle(<col>)')` via reverse-FK fall_id — **Array-Normalisierung Pflicht**; oder Pattern E = kein Change wo schon View-Read). Re-Grep-Script (`scripts/cmm44-spi2-grep.mjs` als Vorlage, COLS anpassen) → 0 echte faelle-Zugriffe. Rollen-Anzeige lean halten.
5. **Smoke** (`scripts/smoke-cmm44-spi2.mjs` als Vorlage) gegen `app.staging.claimondo.de`, Screenshots auswerten.
6. **PR4 — Catch-up** (idempotenter COALESCE-Upsert) nach PR2-`main`-Release.
7. **Abschluss:** Phase-1-Mapping-Block + Handoff + Memory + Smoke-Script committen.

**2-STUFEN-REVIEW IST PFLICHT** (Memory-Lesson): ein cov-additiver Sweep sieht „grün" aus, weil `faelle` die Werte behält → Reader funktionieren für ALTE Fälle, brechen erst für NEUE (Writer schreiben nur noch kanzlei_faelle). Die SP-I2-Review fand so einen kritischen Miss (`kanzlei-wunsch`-Idempotenz-Guard → Doppel-Push an LexDrive). Jeden Re-Grep-Hit INDEPENDENT triagieren.

## Cross-Referenzen

- **Decomposition (Verdikte):** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`
- **Helper (zentral):** `src/lib/kanzlei-fall/upsert-kanzlei-fall.ts` (`KANZLEI_FAELLE_COLS`/`peelKanzleiFaelleColumns`/`upsertKanzleiFall` — `status='versicherungskontakt'` NUR on-insert), Loader `src/lib/kanzlei-fall/queries.ts`
- **Templates:** `scripts/cmm44-spi2-{measure,verify}.sql`, `scripts/cmm44-spi2-grep.mjs`, `scripts/smoke-cmm44-spi2.mjs`
- **Specs/Plans/Handoffs:** `docs/superpowers/{specs,plans}/2026-05-23-cmm44-spi{1,2}-*`, `docs/23.05.2026/handoff-cmm44-spi{1,2}-abschluss.md`
- **Memories:** [[project_cmm44_spi1_status]], [[project_cmm44_spi2_status]], [[project_cmm44_faelle_dekomposition]], [[project_cmm44_phase_24_finishing]], [[feedback_information_schema_check]], [[feedback_kein_auto_merge]], [[feedback_migration_repair_twin_drift]]
- **PRs:** #1559 (SP-I1), #1570 (SP-I2 Schema), #1581 (SP-I2 Sweep), #1589 (SP-I2 Abschluss)

## Wichtige Gotchas/Lessons (aus SP-I1/SP-I2)

1. **mandatsnummer = Salesforce/Kanzlei-Mandat-ID** (`001Jz…`), NICHT die Fallnummer. `claims.claim_nummer` (`CLM-2026-…`) ist kanonisch. Display-Labels: `claim_nummer` primär, `mandatsnummer` sekundär. `filmcheck.ts` CLM-Generator wurde entfernt.
2. **LexDrive-iframe-Embed ist UNMÖGLICH** — Portal-CSP `frame-ancestors 'self' https://lex-drive.com` (empirisch eingeloggt belegt). SV-Mandatstracking läuft über Deep-Link (`MeinFallStatusCard`/CMM-23) + `mandatsnummer`. Embed nur, wenn LexDrive `app.claimondo.de` allowlistet. **iframe-Embedding NIE per `curl -I` beurteilen** — Salesforce-LWR setzt `frame-ancestors` erst beim Browser-Page-Load (Playwright `setContent`+iframe testen).
3. `v_faelle_mit_aktuellem_termin` hat den `kf`-Join schon (SP-I1) → nicht verdoppeln.
4. Boolean-Default-Spalten brauchen `COALESCE(kf.<col>, false) AS <col>` im View (sonst false→null-Wechsel).
5. `kanzlei_faelle.status` ist NOT NULL ohne Default → beim Row-Create Pflichtwert (`'versicherungskontakt'`).
6. Sub-Agenten können ins **Session-Limit** laufen — bei großen Sweeps chunken + Zwischenstände committen; Controller kann inline recovern.

## Status der offenen PRs (Stand 2026-05-23)
- #1581 (SP-I2 PR2) + #1589 (SP-I2 Abschluss): **offen gegen staging, warten auf Aaron-Merge.** Erst mergen, dann SP-I3 branchen.
- Worktree `.claude/worktrees/cmm44-spi2-anschlussschreiben` + leerer Branch `kitta/cmm44-spi2-pr3-embed` können nach #1589-Merge entfernt werden.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
