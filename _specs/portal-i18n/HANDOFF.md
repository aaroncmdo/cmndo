# HANDOFF — Portal-i18n (Kunde + Magic-Link nutzerbasiert)

**Stand:** 2026-05-29 · **Welle 1 (Foundation) gelandet + verifiziert** · Welle 2–6 offen.

Dieses Dokument ist der Einstiegspunkt. Es verweist auf alles, was eine Folge-Session braucht, um nahtlos weiterzumachen.

---

## 0. TL;DR

Das Kunde-Portal + die Magic-Link-Strecken werden nutzerbasiert in alle 6 Locales übersetzt (`profiles.sprache`, still aus dem Lead vorbelegt, im Portal wechselbar) + On-Demand-Falldaten-Maschinenübersetzung als Anzeige-Hilfe. **Welle 1 = die Auflösungs-Infrastruktur + 2 Migrationen** ist gebaut, getestet (tsc 0 Fehler, vitest 10/10), RLS-verifiziert und gepusht. **Noch keine sichtbare Änderung** (de bleibt Default) — Welle 1 sind die Schienen. Weiter geht's bei Welle 2 (Persistenz).

---

## 1. Wo liegt was (Cross-Referenzen)

| Artefakt | Pfad / Link |
|---|---|
| **Spec — Kontext/Regeln** | `_specs/portal-i18n/CONTEXT.md` |
| **Spec — Funktionen F-01…F-52** | `_specs/portal-i18n/CONTRACT.md` |
| **Spec — Migrationen (SQL)** | `_specs/portal-i18n/DB_MIGRATION.md` |
| **Spec — Wellen-Execution-Prompts** | `_specs/portal-i18n/WELLEN_PLAN.md` |
| **Narrativer Plan + Welle-1-TDD** | `docs/plans/2026-05-29-portal-i18n.md` |
| **PR (gegen `staging`)** | https://github.com/aaroncmdo/cmndo/pull/2006 |
| **Branch** | `kitta/portal-i18n-spec` |
| **Worktree (mit `node_modules` via `npm ci`)** | `.claude/worktrees/portal-i18n-spec` |
| **Commit — Spec+Plan** | `a657e7417` |
| **Commit — Welle 1** | `02b53ef0a` |

**Verwandter, SEPARATER i18n-Strang (nicht verwechseln):** Marketing/Onboarding-i18n lebt unter `docs/i18n-phase-plan.md` (Phase 1) + `scripts/i18n/` + den `onboarding_i18n_*`-Migrationen (28.05.). Das ist die **Website**-Übersetzung. Dieses Spec ist **Phase 2 = die App/Portale**.

---

## 2. Was in Welle 1 gebaut wurde

### Migrationen (via Supabase-Plugin `apply_migration` — AGENTS.md Regel 2, NICHT CLI)
| Tabelle/Spalte | Getrackte Version | File |
|---|---|---|
| `profiles.sprache` (nullable, CHECK 6 Locales) | `20260529152934` | `supabase/migrations/20260529152934_add_profiles_sprache.sql` |
| `content_translations` (content-adressierter MT-Cache, RLS an, **0 Policies** = server-only) | `20260529152943` | `supabase/migrations/20260529152943_content_translations.sql` |

### Code (neu)
- `src/i18n/locale-source.ts` — **reine** Helfer: `classifyLocaleSource(pathname)` → `'cookie'|'profile'|'token'`, `extractTokenFromPath`, `normalizeToLocale`. Keine `next/headers`/`server-only`-Imports → unit-testbar.
- `src/i18n/resolve-locale.ts` — `'server-only'`: `resolveUserLocale()` (auth → `profiles.sprache`) + `resolveLocaleFromToken(pathname)` (Token → `leads.sprache`, spiegelt `src/lib/branding/token-theme.ts`). Beide `cache()` + jeder Fehlerpfad → `null`.
- `src/i18n/__tests__/locale-source.test.ts` — 10 Tests (Route-Matrix, Token-Extraktion, Normalisierung).

### Code (geändert)
- `src/i18n/request.ts` — source-aware Kaskade: `(profile|token)` → Cookie → `DEFAULT_LOCALE`. DB-Reads **nur** bei `source !== 'cookie'`.

### Referenz-Code (gelesen, Muster übernommen — nicht geändert)
- `src/lib/branding/token-theme.ts` — Token→Lead-FK-Trace-Vorbild für `resolveLocaleFromToken`.
- `src/lib/supabase/server.ts` — `createClient()` (async, anon) + `createServiceClient()`.
- `src/lib/supabase/admin.ts` — `createAdminClient()` (service-role; genutzt in `resolveLocaleFromToken`).
- `src/lib/supabase/middleware.ts` — setzt `x-pathname` (Z. 32–36, vor Public-Path-Early-Return).

---

## 3. Verifizierte Fakten & Entscheidungen (nicht erneut hinterfragen)

1. **Regel 2 hat sich am 28.05. geändert:** DDL **nur via Plugin** `apply_migration`, **nicht** CLI `db push`. Danach `list_migrations` → Version ablesen → File exakt so benennen (Twin-Drift-Schutz). `execute_sql` nur für READ.
2. **`leads.sprache` / `flow_links.sprache` sind ISO-Codes** (live geprüft: real nur `'de'`). `normalizeToLocale` braucht keine Klartext-Alias-Map (nur als Sicherheitsnetz drin). → Solange keine non-`de`-Leads existieren, löst die App überall `de` auf; das ist korrekt, nicht „kaputt".
3. **F-05 war bereits erfüllt:** `middleware.ts` setzt `x-pathname` schon vor dem Public-Path-Early-Return → **kein** Middleware-Change nötig.
4. **`normalizeToLocale` liegt in `locale-source.ts`** (nicht `resolve-locale.ts` wie in CONTRACT F-02), damit es ohne `server-only` unit-testbar ist.
5. **service-role-Helper existiert:** `createAdminClient` aus `@/lib/supabase/admin` (verbreitet genutzt). Kein neuer Helper bauen — auch in Welle 5 (`translate-content.ts`) diesen nutzen.
6. **RLS verifiziert:** `authenticated` hat **table-level** SELECT/UPDATE auf `profiles` → die neue Spalte `sprache` ist lesbar (F-02) UND schreibbar (F-12). SELECT+UPDATE-Policies (own-row) vorhanden.
7. **`content_translations` = server-only** (RLS an, keine Policies). Zugriff ausschließlich via `createAdminClient` im Server-Action (CONTEXT §8 B6) — verhindert Cache-Poisoning.

---

## 4. Bewusst aufgeschoben / Stolperfallen für die nächste Session

- **`database.types.ts`-Regen aufgeschoben** (Regel 2 Schritt 6). Welle 1 nutzt narrow Casts (`(x as { sprache?: ... })`). **Welle 2 F-12** macht `profiles.update({ sprache })` — dafür **entweder** Types via `generate_typescript_types` regenerieren **oder** den Update-Wert casten. Wenn regen: NICHT manuell strippen, kann mit Parallel-Sessions kollidieren (großer Diff).
- **`resolveLocaleFromToken` deckt nur `flow` / `upload-dokumente` / `upload-zb1` ab.** `re-termin` / `ablehnen` / `kunde-termin` / `sv` → aktuell `null` (Cookie-Fallback). **Welle 4** ergänzt sie (z. B. `faelle.re_termin_token` → Lead). Heute unkritisch (alle Leads `de`).
- **F-43 (Welle 5) Chat-Pfad ist NICHT verifiziert:** der genaue `MultiChannelChat`/`nachrichten`-Render-Pfad muss bei der Umsetzung gegrept werden (Memory `project_multi_channel_inbox`).
- **Worktree-Gate:** `npx vitest run …` + `npx tsc --noEmit` (NICHT `npm run build` — OOMt in Worktrees, Memory `worktree_build_gate`). `npm ci` ist im Worktree schon gelaufen.
- **Smoke (Welle 6):** Test-User brauchen `twofa_aktiviert=false` etc. (Memory `project_e2e_test_users`), Smoke gegen `app.staging.claimondo.de` (Memory `nur_staging_pullen`).

---

## 5. Status pro Welle

| Welle | Inhalt | F-IDs | Status |
|---|---|---|---|
| 0 | Kontext + Live-DB-Check | — | ✅ erledigt |
| 1 | Resolution-Kern + Migrationen + Unit-Tests | F-01..05, F-10, F-40, F-50(res) | ✅ **gelandet** (`02b53ef0a`) |
| 2 | Persistenz & Wechsel | F-11, F-12, F-13 | ⬜ als Nächstes |
| 3 | Kunde-Portal + Onboarding + Formatting | F-20/21/30/31/32/34/35 | ⬜ |
| 4 | Magic-Link + Token-Locale E2E | F-33, F-35, F-03-Verifikation | ⬜ |
| 5 | Falldaten-MT | F-41, F-42, F-43 | ⬜ |
| 6 | Smoke + CI-Gate + Polish | F-51, F-52 | ⬜ |

---

## 6. Nächster Schritt — Welle 2 (genau)

Execution-Prompt: `_specs/portal-i18n/WELLEN_PLAN.md` → „Welle 2". Kurz:

1. **F-11** — `src/app/flow/[token]/actions.ts` `finalizeKundeSetup`: Lead-`sprache` (schon geladen) durch `normalizeToLocale` (aus `@/i18n/locale-source`); beim `profiles`-Upsert `sprache` mitsetzen, nur wenn valide.
2. **F-12** — `src/lib/actions/set-locale.ts`: bei eingeloggtem User zusätzlich `profiles.update({ sprache: newLocale }).eq('id', user.id)` (try/catch, Cookie gewinnt fürs UX). Hier ggf. Types regenerieren (siehe §4).
3. **F-13** — `LanguageSwitcher` (`src/components/shared/LanguageSwitcher.tsx`) im Kunde-Shell (`src/app/kunde/layout.tsx`) + Magic-Link-Headern sichtbar einhängen.

**Verify Welle 2:** Test-Lead `sprache='tr'` → neuer Kunde `SELECT sprache FROM profiles` = `'tr'`; Switcher → `'en'` persistiert in DB + Cookie.

**Verify Welle 1 manuell (falls gewünscht):** `UPDATE profiles SET sprache='en' WHERE id=<test-user>` → `/kunde` laden → `<html lang="en">`; Marketing unverändert (kein Supabase-Call).

---

## 7. Arbeits-Setup für die Folge-Session

```
Worktree:  .claude/worktrees/portal-i18n-spec   (node_modules vorhanden)
Branch:    kitta/portal-i18n-spec   (PR #2006 gegen staging)
Gate:      npx vitest run <file>   +   npx tsc --noEmit
DDL:       apply_migration (Plugin) → list_migrations → File benennen   (NIE CLI)
Commit:    Audit-Block (7 Punkte) + Co-Authored-By   (AGENTS.md)
Merge:     NIE selbst (außer du bist die benannte Merge-Session) — nur PR + berichten
```
