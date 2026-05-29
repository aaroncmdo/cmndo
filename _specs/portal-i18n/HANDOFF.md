# HANDOFF — Portal-i18n (Kunde + Magic-Link nutzerbasiert)

**Stand:** 2026-05-29 · **Welle 1 (Foundation) gelandet + verifiziert** · Welle 2–6 offen.

Dieses Dokument ist der Einstiegspunkt. Es verweist auf alles, was eine Folge-Session braucht, um nahtlos weiterzumachen.

---

## 0. TL;DR

Das Kunde-Portal + die Magic-Link-Strecken werden nutzerbasiert in alle 6 Locales übersetzt (`profiles.sprache`, still aus dem Lead vorbelegt, im Portal wechselbar) + On-Demand-Falldaten-Maschinenübersetzung als Anzeige-Hilfe. **Welle 1** (Auflösungs-Infrastruktur + 2 Migrationen) und **Welle 2** (Persistenz & Wechsel — F-11/F-12/F-13 im Kunde-Portal) sind gebaut, getestet (tsc 0 Fehler, vitest 10/10) und gepusht (W1 `02b53ef0a`; W2 `1b3aa2b8d` + `853456355`). de bleibt Default, solange keine non-de-Leads existieren. Weiter geht's bei **Welle 3** (Kunde-Portal-Strings + Onboarding + Formatting).

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

- **`database.types.ts`-Regen weiter aufgeschoben** (Regel 2 Schritt 6). Welle 1+2 nutzen narrow Casts: Reads `(x as { sprache?: ... })`, der **W2-F-12**-Write `profiles.update({ sprache } as never)` (typed Server-Client). Der **W2-F-11**-Write läuft über den **untyped** Admin-Client → braucht keinen Cast. Erst regenerieren, wenn ein Consumer Typ-Sicherheit auf `sprache` braucht — NICHT manuell strippen; ein Voll-Regen kollidiert mit der Schema-Drift paralleler Sessions (großer Diff).
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
| 2 | Persistenz & Wechsel | F-11, F-12, F-13 | ✅ **gelandet** (`1b3aa2b8d` + `853456355`) · Magic-Link-Switcher → W4 |
| 3 | Kunde-Portal + Onboarding + Formatting | F-20/21/30/31/32/34/35 | ⬜ |
| 4 | Magic-Link + Token-Locale E2E | F-33, F-35, F-03-Verifikation | ⬜ |
| 5 | Falldaten-MT | F-41, F-42, F-43 | ⬜ |
| 6 | Smoke + CI-Gate + Polish | F-51, F-52 | ⬜ |

---

## 6. Nächster Schritt — Welle 3 (Kunde-Portal + Onboarding + Formatting)

**Welle 2 ist gelandet** (`1b3aa2b8d` + `853456355`, PR #2006): F-11 (stille Lead-Sprach-Vorbelegung in `finalizeKundeSetup` — **IS-NULL-geguardet**, überschreibt eine F-12-Wahl auf dem Relink-Pfad `createKundeAccount` 2b NICHT), F-12 (`setLocaleAction` persistiert `profiles.sprache` für eingeloggte Nutzer, `as never`-Cast, Cookie gewinnt fürs UX), F-13 (`LanguageSwitcher` im Kunde-Shell: Sidebar `variant=full` + Mobile-Header `variant=compact`, aktive Locale via `getLocale()`).

**Aus W2 bewusst nach W4 verschoben:** der `LanguageSwitcher` auf den **Magic-Link-Headern** (`/flow`, `/upload/*`). Diese Seiten scopen bereits `NextIntlClientProvider(flowLocale)` aus dem **Token** (`@/lib/i18n/resolve-flow-locale` + `@/i18n/load-messages` — „Strategie B", parallel zur Welle-1-`resolveLocaleFromToken`), der den Cookie ignoriert; ein Cookie-Switcher wäre dort **sichtbar wirkungslos** (Reload → selbe Token-Locale). W4 (WELLEN_PLAN W4.B „SprachBanner-Rolle klären") muss die zwei Token-Locale-Pfade reconcilen — die F-04-Kaskade ist `resolved(token) ?? cookie`, d. h. Token gewinnt: F-13s „Cookie als Override" ist erst nach dieser Reconciliation erreichbar.

**Offene Live-Verifikation W2 (Staging-Smoke — lokal nicht lauffähig):** Test-Lead `sprache='tr'` → neuer Kunde `SELECT sprache FROM profiles` = `'tr'`; eingeloggt Switcher → `'en'` persistiert in `profiles.sprache` + Cookie. Lokal nur tsc + vitest gegated; `profiles.sprache` live geprüft (text, CHECK `de/en/tr/ar/ru/pl`+NULL, 0 Rows).

Execution-Prompt Welle 3: `_specs/portal-i18n/WELLEN_PLAN.md` → „Welle 3" (F-20/21/30/31/32/34/35): `src/lib/i18n/format.ts` + Message-Namespaces (`common`/`kunde`/`onboarding` in allen 6 Files) + Kunde-Portal-Strings → Keys + Onboarding-Wizard + `de-DE`-Sweep + `npm run i18n:translate`.

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
