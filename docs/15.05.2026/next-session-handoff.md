# Next Session Handoff — 15.05.2026

**Stand:** 15.05.2026 ~13:00 Uhr — Cluster F+G PR-1 + PR-2a gemerged, weitere Cleanups + Audit + AAR-921 offen.

---

## 1. Was bereits durch ist (diese Session)

| PR | Status | Inhalt |
|---|---|---|
| **#1293** | ✅ MERGED | Cluster F+G PR-1 — gutachten Sub-Table + Dual-Write-Function (38 Spalten, View, RPC) |
| **#1296** | ✅ MERGED | DROP `gutachten.pdf_seiten_count` (Konsolidierung mit `gutachten_seitenzahl`) |
| **#1306** | ⏳ Pending merge | Cluster F+G PR-2a — 3 claims-Reader auf `v_gutachten_werte` |

**Beim Merge-Zeitpunkt von #1306**: CI war pending — bitte vor Start der nächsten Session checken ob durch.

---

## 2. Was noch zu tun ist (Priorität nach unten)

### Priorität 1 — Cluster F+G PR-2b

**Branch:** Frischer Branch von staging (PR-2a sollte gemerged sein vorher).

**Scope:**

1. **2 weitere Reader-Stellen** auf View umstellen (faelle-Reads für Cluster-G):
   - `src/lib/finance/fall-finanzen.ts:42-45` — liest `faelle.{wiederbeschaffungswert, restwert, nutzungsausfall_tage}` (plus Legacy-Spalten). Splitten in 2 Queries oder View-JOIN.
   - `src/lib/claims/get-kunde-faelle.ts:494` — liest `f.totalschaden` aus faelle. Auf View umstellen.

2. **Migration** (`supabase/migrations/<ts>_aar_cluster_fg_drop_claims_columns.sql`):
   - DROP 38 Spalten von claims (alle in PR-1 hinzugefügten gutachten_* + Cluster-G)
   - DROP 4 Spalten von faelle: `restwert`, `totalschaden`, `wiederbeschaffungswert`, `nutzungsausfall_tage`
   - **Sync-Trigger recreate** ohne die 4 G-Spalten:
     - `sync_claims_to_faelle()` — Lines aus claims-Source raus
     - `sync_faelle_to_claims()` — Lines aus faelle-Source raus
   - `apply_gutachten_ocr` Function: claims-UPDATE-Block entfernen (NUR noch gutachten-Write)
   - `v_gutachten_werte` recreate **ohne COALESCE** (claims-Source weg, nur noch gutachten)
   - DROP-Reihenfolge wichtig: erst View droppen → Function update → Sync-Trigger recreate → DROP COLUMNS → View wieder anlegen

3. **types regen** + Build verifizieren

4. **Smoke**:
   - `smoke-ocr-dual-write.mjs` von PR-1 wiederverwenden, anpassen: claims-Selects entfernen weil die Spalten weg sind
   - Manuell: 3 Portale (Admin/SV/Kunde) durchklicken — OCR-Werte da
   - **Memory `feedback_post_drop_smoke`**: nach DB-Schema-Drop **volle Portal-Smoke** (Public+Admin+Kunde+SV) mit Screenshots Pflicht

5. **PR gegen staging**

**Setup-Hinweis:**

```bash
git worktree add ../wt-cluster-fg-pr2b -b kitta/aar-cluster-fg-pr2b-drop origin/staging
cd ../wt-cluster-fg-pr2b
npm install
```

**Drift-Recovery-Pattern:** Wenn `db push` failed weil andere Sessions parallel direkt-on-DB-Migrations gemacht haben:
```bash
supabase migration repair --status reverted <version-list>
supabase db push --linked
```
Siehe PR #1293, #1296 — Pattern war 2× erfolgreich.

---

### Priorität 2 — Vertikales Audit nach PR-2b Merge

**Trigger:** Erst nach PR-2b in staging.

**Scope:**

1. **Volle Portal-Smoke** mit Screenshots:
   - **Public** (`/`, `/faq`, `/gutachter-finden`) — keine 500er
   - **Kunde** (`/kunde`, `/kunde/faelle/[id]`, `/kunde/onboarding`) — Login + Fall-Anzeige + OCR-Werte (Ausfallentschädigung-Card)
   - **SV** (`/gutachter`, `/gutachter/fall/[id]`, `/gutachter/heute`) — Gutachten-Card zeigt Werte
   - **Admin** (`/faelle`, `/faelle/[id]`, `/admin/team`) — GutachtenOcrCard funktional
   - **Dispatch** (`/dispatch`, `/dispatch/leads`) — keine Crashes durch fehlende claims-Spalten

2. **DB-Verify**:
   - claims hat keine der 38 Spalten mehr (`SELECT count(*) FROM information_schema.columns WHERE table_name='claims' AND column_name LIKE 'gutachten_%' OR column_name IN ('reparaturkosten_netto', 'reparaturkosten_brutto', 'minderwert', 'restwert', 'wiederbeschaffungswert', 'wiederbeschaffungsdauer_tage', 'nutzungsausfall_tage', 'totalschaden')` = 0)
   - faelle hat die 4 G-Spalten nicht mehr
   - `apply_gutachten_ocr` schreibt nur auf gutachten
   - `v_gutachten_werte` ohne COALESCE (nur gutachten-Source)
   - Sync-Trigger ohne die 4 G-Spalten

3. **Smoke-Doc** als `docs/<DD.MM.YYYY>/cluster-fg-pr2b-post-merge-audit.md` mit Screenshots-Embed.

---

### Priorität 3 — AAR-921 RLS-Drift Backfill

**Linear:** https://linear.app/aaroncmndo/issue/AAR-921/rls-drift-backfill-security-definer-grants-idempotent-absichern

**Scope:** SECURITY DEFINER Grants idempotent absichern.

**Pattern aus Memory `feedback_rls_function_grants`:**
> SECURITY-DEFINER-Funktionen in RLS-Policies brauchen GRANT EXECUTE TO authenticated, geht bei CREATE OR REPLACE / Policy-Refactor verloren. Inzident 14.05.2026 AAR-894: dispatcher_owns_lead + is_claim_user_party + is_sv_for_claim weg → SV-Plan leer, Cron-Reminders silent skip.

**Vorgehen vermutlich:**

1. Inventur aller SECURITY DEFINER Functions in `public`:
   ```sql
   SELECT proname FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND prosecdef = true
   ORDER BY proname;
   ```
2. Pro Function: `GRANT EXECUTE` an die richtigen Rollen (authenticated, anon, service_role) idempotent in eine Migration packen.
3. Migration so schreiben dass sie bei `CREATE OR REPLACE FUNCTION ...` automatisch wieder läuft (z.B. via Event-Trigger oder dokumentierter Workflow-Regel).
4. PR gegen staging mit Audit-Block.

---

### Priorität 4 — Aufräumen (optional, niedrige Priorität)

1. **Worktrees prunen**:
   ```bash
   git worktree prune
   git worktree list  # Manuelle Sichtung: was ist tot?
   ```
   - `wt-cluster-fg-pr2` kann nach PR-2a-Merge entfernt werden
   - `wt-pr1275-rebase` etc. von früheren Tasks
   - `.claude/worktrees/aar-session-koord-13-05` ist erst ein Cleanup gescheitert (Windows-Path-Limit) — manuell entfernen
2. **Lokale Branches**: `git branch --merged origin/staging | grep -v '\*' | xargs git branch -d` (Vorsicht: prüft nur ob in staging-Ancestor)
3. **Stash@{0}** auf `kitta/aar-kunde-gutachten-werte` — Aaron muss entscheiden ob noch relevant für PR #1142

---

## 3. Wichtige Memory-Referenzen für Folge-Session

| Memory | Warum relevant |
|---|---|
| `feedback_kein_auto_merge` | PRs nur auf explizite Aaron-Freigabe mergen |
| `feedback_post_drop_smoke` | Nach JEDEM DB-Schema-Drop volle Portal-Smoke + Screenshots |
| `feedback_branch_kollision_absprache` | Bei BRANCH-KOLLISION-Warnung: stop + SendMessage |
| `feedback_immer_testen_nach_fix` | Verifikation nach jedem Fix |
| `feedback_smoke_screenshot_pflicht` | Screenshot bei UI-Smokes Pflicht im selben Turn |
| `feedback_rls_function_grants` | SECURITY DEFINER + GRANT EXECUTE Pattern (für AAR-921) |
| `project_token_audit_done` | `npm run check:token-audit` CI-Step |
| AGENTS.md **Regel 1** | Niemals direkt auf `main` pushen |
| AGENTS.md **Regel 2** | DDL nur über supabase-CLI Migration |
| AGENTS.md **Regel 3** | Kein unbegleiteter Stash am Session-Ende |
| AGENTS.md §server-actions-pattern | Result-Object `{ ok: boolean }` statt throw |
| AGENTS.md §post-task-audit | 7-Punkte-Selbstprüfung vor jedem Commit |

---

## 4. Branch-Kollisions-Hinweise

Bei Start der neuen Session: Hook-Output prüfen welche anderen Sessions aktiv sind. Eigener Worktree zwingend, sonst Trampeln. Aktuelle parallele Sessions (Stand 13:00):
- `17dfdd58` auf `aar911-sv-termin-verlegen-smoke-v2` (starting)
- `3c270a75` + `a1f1da1a` auf `aar-gutachter-heute-isochrone-fix`
- `8793a38b` auf `aar-stufe-0-claims-final`
- `99731be1` auf `aar911-sv-termin-verlegen-smoke-v2`
- `cf345e58` auf `aar-self-dispatch-fix`
- `db63d2b4` auf `aar-dat-concepts-review`

Tendenz: Aaron arbeitet mit ~7 parallelen Sessions, Branch-Wechsel sind dynamisch. Eigener Worktree + isolierter Branch = sicher.

---

## 5. Reihenfolge-Empfehlung für Folge-Session

1. **Status-Check** (5 Min): `gh pr view 1306` — gemerged? + `gh pr list --state open --limit 10` — was ist neu?
2. **PR-2b setup** (5 Min): eigener Worktree von aktuellem staging
3. **PR-2b durchziehen** (~1.5h ehrlich): 2 Files Reader + Migration + Build + Smoke + PR
4. **Auf Aaron's Merge-Freigabe warten** für PR-2b
5. **Post-Merge: Vertikales Audit** (~30-45 Min)
6. **AAR-921** (~1h ehrlich)
7. **Cleanup-Pass** (~15 Min, optional)

Geschätzte Gesamtdauer: 3-4h saubere Arbeit.

---

## 6. Risiken + Mitigation

| Risiko | Mitigation |
|---|---|
| DB-Migration scheitert wegen Drift (andere Session pusht direkt) | `supabase migration repair --status reverted` — Pattern erfolgreich getestet |
| Reader-Lücke nach DROP → Runtime-Crash | PR-2a hatte 3 Reader, PR-2b nimmt 2 weitere. **Vor DROP**: grep `claims.\(reparaturkosten\|wiederbeschaffung\|...\)` in src/ — 0 Treffer? |
| Sync-Trigger blockt DROP COLUMN | Trigger MUSS vor DROP recreated werden ohne die Spalten — Reihenfolge in Migration beachten |
| Cluster-F-Spalten irgendwo doch noch gelesen | Im Verlauf gefunden: `lib/auftrag/qc.ts` und `lib/kanzlei-wunsch/actions.ts` haben false-positives gehabt — nochmal verifizieren beim PR-2b |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
