# DB_MIGRATION — Portal-i18n Welle 1

**AGENTS.md Regel 2 (Stand 2026-05-28) — VERBINDLICH:** DDL ausschließlich über das **Supabase-Plugin** `apply_migration`. **Nicht** über CLI `db push` (Worktrees sind nicht linked → Auth-/Drift-Ärger), **nicht** über raw `execute_sql` mit DDL-Payload (bypasst Tracking), **nicht** direkt im Studio.

**Plugin-Ablauf pro Migration:**
1. DDL schreiben.
2. `apply_migration({ name: '<snake_case>', query: '<DDL>' })` → wendet an UND trackt in `supabase_migrations.schema_migrations`.
3. `list_migrations` → die vom Plugin vergebene Version `<V>` ablesen (eigener Timestamp, nicht raten).
4. Migration-File committen als `supabase/migrations/<V>_<name>.sql` → **Dateiname == getrackte Version** (Twin-Drift-Schutz).
5. `execute_sql` (READ) zum Verifizieren.
6. Typen via `generate_typescript_types` regenerieren — oder aufschieben, bis ein Consumer die Spalte nutzt (Types dürfen der DB hinterherhinken).

---

## Welle-0-Vorbefund (2026-05-29, live geprüft via execute_sql READ)

| Check | Ergebnis | Konsequenz |
|---|---|---|
| `SELECT DISTINCT sprache FROM leads` | `['de']` (Typ `text`) | Werte sind ISO-Codes → `normalizeToLocale = isLocale(v) ? v : null`, **keine** Alias-Map für Klartext nötig |
| `SELECT DISTINCT sprache FROM flow_links` | `['de']` | dito |
| `profiles.sprache` existiert? | **nein** (0) | Migration 1 nötig |
| `to_regclass('public.content_translations')` | **null** | Migration 2 nötig |
| service-role-Helper | `createAdminClient` aus `@/lib/supabase/admin` (verbreitet) | F-40/F-41 nutzen diesen, **kein** neuer Helper |

---

## Migration 1 — `profiles.sprache`

`apply_migration({ name: 'add_profiles_sprache', query: ... })`:

```sql
-- Portal-i18n Welle 1 (F-10): nutzerbasierte Locale-Persistenz.
-- nullable + kein Default → bestehende Nutzer behalten Cookie/de-Fallback.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sprache text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sprache_check
  CHECK (sprache IS NULL OR sprache IN ('de','en','tr','ar','ru','pl'));

COMMENT ON COLUMN public.profiles.sprache IS
  'Bevorzugte Portal-Sprache (ISO-639-1, 6 Locales). NULL -> Cookie/DEFAULT_LOCALE-Fallback. App-SSoT, siehe _specs/portal-i18n.';
```

**RLS-Hinweis:** `profiles` hat bereits RLS. `resolveUserLocale()` liest nur die eigene Zeile (`eq('id', user.id)`) — von „own row"-SELECT-Policy gedeckt. `setLocaleAction` macht `UPDATE` der eigenen Zeile → bestehende Update-Policy muss `sprache` erlauben. **Verifizieren** (column-GRANTs gingen im Projekt schon verloren — Memory `rls_function_grants`): nach Apply einmal als normaler authenticated-User `select sprache` + `update ... set sprache` der eigenen Zeile proben.

---

## Migration 2 — `content_translations` (content-adressierter Cache)

`apply_migration({ name: 'content_translations', query: ... })`:

```sql
-- Portal-i18n Welle 1 (F-40): On-Demand-Falldaten-MT-Cache.
-- Content-adressiert: Schluessel (source_hash, target_locale). source_hash = sha256(Originaltext).
-- Auto-Invalidierung bei Edit (neuer Text -> neuer Hash).
-- Zugriff NUR via service-role im Server-Action (CONTEXT B6) — KEINE Client-Policies.
CREATE TABLE IF NOT EXISTS public.content_translations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash    text NOT NULL,
  target_locale  text NOT NULL CHECK (target_locale IN ('de','en','tr','ar','ru','pl')),
  translated_text text NOT NULL,
  provider       text NOT NULL DEFAULT 'anthropic',
  model          text,
  source_table   text,   -- nur Metadaten fuer Debug/Cleanup, NICHT Zugriffsschluessel
  source_id      text,
  field          text,
  erstellt_am    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_translations_unique UNIQUE (source_hash, target_locale)
);

CREATE INDEX IF NOT EXISTS content_translations_lookup_idx
  ON public.content_translations (source_hash, target_locale);

-- RLS an, aber bewusst KEINE Policies -> kein direkter Client-Zugriff.
-- service-role (createAdminClient) umgeht RLS und ist einziger Leser/Schreiber.
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.content_translations IS
  'Content-adressierter MT-Cache fuer Falldaten (Anzeige-Hilfe). Original bleibt SSoT, nie rechtsverbindlich. Zugriff nur via service-role. Siehe _specs/portal-i18n CONTEXT B1/B6.';
```

**service-role-Client:** `translate-content.ts` nutzt `createAdminClient()` aus `@/lib/supabase/admin` (existiert, siehe Welle-0-Vorbefund). Kein neuer Helper. `SUPABASE_SERVICE_ROLE_KEY` nie ins Client-Bundle (Action ist `'use server'`; Memory `use_server_konstanten`: keine Konstanten/Types aus 'use server' exportieren).

---

## Migration-Hygiene (Session-Abschluss)

- File-Name == `list_migrations`-Version (Schritt 3+4) — sonst Twin-Drift.
- `git stash list` leer/dokumentiert (Regel 3 — nie Migration applied lassen während Code im Stash liegt).
- Nach Apply: `resolveUserLocale` / `translateContent` empirisch proben (Memory `immer_testen_nach_fix`), nicht blind weiter.
