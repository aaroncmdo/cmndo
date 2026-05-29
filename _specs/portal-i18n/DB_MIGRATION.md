# DB_MIGRATION — Portal-i18n Welle 1

**AGENTS.md Regel 2 — VERBINDLICH:** DDL ausschließlich via supabase-CLI-Migration. **Kein** Management-API-DDL, **kein** direktes Studio-DDL.

**Vor dem Schreiben der Migration:** Spalten-/Tabellen-Existenz live prüfen (Memory `information_schema_check`), weil andere Sessions parallel migrieren:

```sql
-- Live gegen die DB:
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'profiles' AND column_name = 'sprache';
SELECT to_regclass('public.content_translations');
-- Werteformat der Lead-Sprache prüfen (steuert normalizeToLocale):
SELECT DISTINCT sprache FROM leads WHERE sprache IS NOT NULL;
SELECT DISTINCT sprache FROM flow_links WHERE sprache IS NOT NULL;
```

Beide Migrationen werden in **Welle 1** zusammen gefahren (DDL batchen).

---

## Migration 1 — `profiles.sprache`

```bash
npx supabase migration new add_profiles_sprache
```

```sql
-- supabase/migrations/<ts>_add_profiles_sprache.sql
-- Portal-i18n Welle 1 (F-10): nutzerbasierte Locale-Persistenz.
-- nullable + kein Default → bestehende Nutzer behalten Cookie/de-Fallback.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sprache text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sprache_check
  CHECK (sprache IS NULL OR sprache IN ('de','en','tr','ar','ru','pl'));

COMMENT ON COLUMN public.profiles.sprache IS
  'Bevorzugte Portal-Sprache (ISO-639-1, 6 Locales). NULL → Cookie/DEFAULT_LOCALE-Fallback. Quelle: profiles.sprache (App), siehe _specs/portal-i18n.';
```

**RLS-Hinweis:** `profiles` hat bereits RLS. `resolveUserLocale()` liest nur die eigene Zeile (`eq('id', user.id)`) — von den bestehenden „own row"-Policies gedeckt. **Verifizieren**, dass die SELECT-Policy `sprache` nicht ausschließt (column-level GRANTs sind im Projekt schon mal verloren gegangen — Memory `rls_function_grants`). `setLocaleAction` macht ein `UPDATE` der eigenen Zeile → bestehende Update-Policy muss `sprache` erlauben.

```bash
npx supabase db push
# Danach Types regenerieren (NICHT manuell strippen — Memory: Types=DB):
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
# oder MCP generate_typescript_types
```

---

## Migration 2 — `content_translations` (content-adressierter Cache)

```bash
npx supabase migration new content_translations
```

```sql
-- supabase/migrations/<ts>_content_translations.sql
-- Portal-i18n Welle 1 (F-40): On-Demand-Falldaten-MT-Cache.
-- Content-adressiert: Schlüssel (source_hash, target_locale). source_hash = sha256(Originaltext).
-- Auto-Invalidierung bei Edit (neuer Text → neuer Hash).
-- Zugriff NUR via service-role im Server-Action (CONTEXT §8 B6) — KEINE Client-Policies.

CREATE TABLE IF NOT EXISTS public.content_translations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_hash    text NOT NULL,
  target_locale  text NOT NULL CHECK (target_locale IN ('de','en','tr','ar','ru','pl')),
  translated_text text NOT NULL,
  provider       text NOT NULL DEFAULT 'anthropic',
  model          text,
  -- nur Metadaten für Debugging/Cleanup, NICHT Zugriffsschlüssel:
  source_table   text,
  source_id      text,
  field          text,
  erstellt_am    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT content_translations_unique UNIQUE (source_hash, target_locale)
);

CREATE INDEX IF NOT EXISTS content_translations_lookup_idx
  ON public.content_translations (source_hash, target_locale);

-- RLS an, aber bewusst KEINE Policies → kein direkter Client-Zugriff.
-- service-role (Server-Action) umgeht RLS und ist der einzige Leser/Schreiber.
ALTER TABLE public.content_translations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.content_translations IS
  'Content-adressierter MT-Cache für Falldaten (Anzeige-Hilfe). Original bleibt SSoT, nie rechtsverbindlich. Zugriff nur via service-role-Server-Action. Siehe _specs/portal-i18n CONTEXT §8 B1/B6.';
```

```bash
npx supabase db push
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```

**service-role-Client:** `translate-content.ts` benötigt einen service-role-Supabase-Client. Vor Implementierung prüfen, ob ein Helper existiert (grep `SUPABASE_SERVICE_ROLE_KEY` / `createServiceClient` / `createAdminClient` in `src/lib/supabase/`). Falls vorhanden → nutzen. Falls nicht → minimalen `createServiceClient()` ergänzen (nur server-seitig, Key aus `process.env.SUPABASE_SERVICE_ROLE_KEY`, niemals ins Client-Bundle).

---

## Migration-Hygiene (Session-Abschluss)

- `git stash list` leer / dokumentiert (AGENTS.md Regel 3 — N4-Incident: nie Migration applied lassen während Code im Stash liegt).
- Migration-File committet **bevor** `db push` als „erledigt" gilt; bei Twin-Drift Memory `migration_repair_twin_drift` befolgen.
- Nach `db push`: `resolveUserLocale` / `translateContent` empirisch proben (Memory `immer_testen_nach_fix`), nicht blind weiterziehen.
