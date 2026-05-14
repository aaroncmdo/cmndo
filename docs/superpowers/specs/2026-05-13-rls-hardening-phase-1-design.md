# RLS-Hardening Phase 1 — Design

**Datum:** 2026-05-13
**Status:** Spec — wartet auf Review
**Vorarbeit:** Live-Schema-/RLS-Audit 12.05.2026 (`docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md`), PR #828 (`profiles.rolle`-Guard, Trigger-Pattern als Vorlage)

---

## 1 · Ziel & Scope

Schließt die vier akuten Lecks aus dem HIGH-Backlog des 12.05.-Audits in einem zusammenhängenden Plan. Jedes Item ist eigenständig mergebar, aber alle vier folgen dem gleichen „Default-Deny + Trigger/Policy + Smoke-Skript"-Muster und werden zusammen geplant, damit die Reviewer das Ganze einmal verstehen müssen, nicht viermal.

**In Scope:**

- **#3 `flow_links`** — anon-SELECT/UPDATE + auth-ALL-Policies entfernen, Zugriff nur service_role
- **#4 Storage-Buckets** — `fall-dokumente`, `gutachten`, `schadensfotos`, `unterschriften` auf `public=false`, per-Fall-Policies, `getPublicUrl` → `createSignedUrl` an allen Call-Sites
- **#2 Mass-Assignment-Guards** — Trigger auf `makler` (`status`, `provision_betrag_*`, `provision_aktiv`) und `sachverstaendige` (`verifiziert`, `werbebudget_*`, `ist_aktiv`, `use_custom_branding`)
- **#5 `abrechnungen`** — RLS neu: SELECT für admin/sv-eigene/kunde-eigene, Writes nur service_role+admin

**Explizit nicht in Scope (= Phase 2):** Audit-Spoofing (#6 `phase_transitions`, `mitteilungen`, `lead_historie`, `benachrichtigungen`), `regulierungs_klassifizierung` (#7), `conversion_events` (H2), Hygiene (61× `function_search_path_mutable`, 108× SECURITY-DEFINER-anon-executable, `exec_sql`-RPC-Grants), strukturelle `GRANT ALL`-Default-Reform.

**Erfolgskriterium:** Vier reproduzierbare Smoke-Skripte unter `scripts/smoke/rls-phase-1/` zeigen vor dem Fix die heute funktionierenden Angriffe; nach dem Fix scheitern sie alle mit `42501`, `PGRST301`, `[]` oder `403`.

---

## 2 · Sub-Plan #3 — `flow_links`

### Heutiger Zustand

Drei Policies auf `flow_links`:

| Policy | Operation | USING / WITH CHECK |
|---|---|---|
| (anon read) | `SELECT` | `USING(true)` |
| (anon update) | `UPDATE` | `USING(true)` |
| „Authenticated can manage" | `ALL` | `USING(auth.role()='authenticated')` |

→ Anon-Curl mit nur dem `apikey` dumpt alle Magic-Link-Token + Lead-IDs + Status.

### Konsumenten-Realität

Alle relevanten Call-Sites laufen bereits über `createServiceClient`/`createAdminClient`:

- `src/app/flow/[token]/page.tsx` — service-client (verifiziert)
- `src/app/upload/dokumente/[token]/actions.ts` — admin-client (verifiziert)
- `src/lib/actions/dispatch-fall-actions.ts`, `src/lib/lead-fall-mapping.ts`, `src/app/api/cron/flowlink-inaktiv/route.ts`, `src/app/dispatch/leads/[id]/_actions/flowlink.ts`, `src/app/faelle/[id]/_actions/core.ts`, `src/lib/email/google/flows.ts`, `src/app/dispatch/dashboard/page.tsx`, `src/app/dispatch/leads/[id]/page.tsx` — **müssen pro Datei verifiziert werden** dass kein anon-Client genutzt wird (Spec-Aufgabe vor Migration).

### Migration

Eine Migration `*_flow_links_lock_anon`:

```sql
DROP POLICY IF EXISTS "anon read" ON flow_links;
DROP POLICY IF EXISTS "anon update" ON flow_links;
DROP POLICY IF EXISTS "Authenticated can manage" ON flow_links;

-- Default-deny: keine neuen Policies für anon/authenticated.
-- service_role bypasst RLS sowieso.
```

(Exakte Policy-Namen aus Audit-Report verifizieren — können abweichen.)

### Smoke

`scripts/smoke/rls-phase-1/03-flow-links.sh`:

```bash
# Vorher: liefert > 0 Token
# Nachher: liefert []
curl -s "$SUPABASE_URL/rest/v1/flow_links?select=token" \
  -H "apikey: $SUPABASE_ANON_KEY" | jq 'length'
```

### Risiko

Niedrig. Wenn ein Konsument doch noch anon nutzt → 404 in `/flow/[token]`. Mitigation: alle 11 Files vor Migration auf Client-Typ-greppen.

---

## 3 · Sub-Plan #5 — `abrechnungen`

### Heutiger Zustand

Eine Policy `ALL USING(auth.role()='authenticated')` → jeder eingeloggte User liest und schreibt alle Abrechnungen.

### Anforderung

- **Admin:** alle Abrechnungen lesen + schreiben (über admin-client → service_role-bypass)
- **SV:** liest **eigene** Abrechnungen (`abrechnungen.sv_id = auth.uid()`)
- **Kunde:** liest Abrechnungen der **eigenen** Fälle (`EXISTS(SELECT 1 FROM faelle WHERE faelle.id = abrechnungen.fall_id AND faelle.kunde_id = auth.uid())`)
- **Writes** (INSERT/UPDATE/DELETE): nur service_role. App-Layer-Writes laufen alle über admin-client (verifiziert: `abrechnungen-actions.ts`, `revert-case-billing.ts`, `reissue-abrechnung.ts`, `abrechnungen-generator.ts`, Cron-Routes) → unkritisch.

### Migration

```sql
DROP POLICY IF EXISTS "<bestehende ALL-policy>" ON abrechnungen;

CREATE POLICY "abrechnungen_select_admin"
  ON abrechnungen FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "abrechnungen_select_sv"
  ON abrechnungen FOR SELECT TO authenticated
  USING (sv_id = auth.uid());

CREATE POLICY "abrechnungen_select_kunde"
  ON abrechnungen FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM faelle
    WHERE faelle.id = abrechnungen.fall_id
      AND faelle.kunde_id = auth.uid()
  ));

-- Keine INSERT/UPDATE/DELETE-Policies für authenticated → default-deny.
-- service_role bypasst RLS.
```

### UI-Verifikation

- **SV-Portal:** zeigt heute Abrechnungen? Wenn ja, dürfte es nach der Migration weiter funktionieren (`auth.uid() = sv_id`). Wenn nein, separates Ticket für SV-Abrechnungs-View — kein Blocker.
- **Kunde-Portal:** analog.

Spec-Aufgabe: Grep `abrechnungen` in `src/app/gutachter/` und `src/app/kunde/` vor Migration, dokumentieren ob Read-Views existieren oder neu zu bauen.

### Smoke

`scripts/smoke/rls-phase-1/05-abrechnungen.sh`:

```bash
# Login als SV-User → eigene Abrechnungen ja, fremde nein
# Login als Kunde-User → nur eigene Fälle
# Login als beliebiger User → INSERT scheitert
```

### Risiko

Niedrig für Reads (Pattern verifiziert). Mittel falls SV-/Kunde-Portal heute via direkter Query Abrechnungen anzeigen die nicht den eigenen User betreffen — das wäre dann aber ohnehin ein zu fixender Bug.

---

## 4 · Sub-Plan #2 — Mass-Assignment-Guards

### Vorlage

PR #828 / Migration `20260512140559_aar_profiles_rolle_lock` — Trigger `guard_profiles_rolle` blockt Non-Admin-Writes auf `profiles.rolle`.

### `guard_makler_privilegien`

```sql
CREATE OR REPLACE FUNCTION public.guard_makler_privilegien()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('role', true);
BEGIN
  IF v_role IN ('service_role','postgres','supabase_admin','authenticator')
     OR public.is_admin()
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Privileg-Spalten bei INSERT von Non-Admins erzwingen auf safe-defaults
    NEW.status := 'pending';
    NEW.provision_betrag_cent := 0;
    NEW.provision_betrag_referer_cent := 0;
    NEW.provision_aktiv := false;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provision_betrag_cent IS DISTINCT FROM OLD.provision_betrag_cent
    OR NEW.provision_betrag_referer_cent IS DISTINCT FROM OLD.provision_betrag_referer_cent
    OR NEW.provision_aktiv IS DISTINCT FROM OLD.provision_aktiv
  ) THEN
    RAISE EXCEPTION 'Nur Admins dürfen Provisions-/Status-Felder ändern'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_makler_privilegien
  BEFORE INSERT OR UPDATE ON makler
  FOR EACH ROW EXECUTE FUNCTION public.guard_makler_privilegien();
```

(Exakte Spaltennamen aus aktuellem `makler`-Schema verifizieren — `provision_betrag_cent` vs. `provision_betrag` etc. via `list_tables` checken.)

### `guard_sachverstaendige_privilegien`

Analoger Trigger, geschützte Spalten: `verifiziert`, `werbebudget_*` (alle), `ist_aktiv`, `use_custom_branding`.

### Werbebudget-Anzeige

User-Bestätigung: **kein SV-Self-Service auf Werbebudget**. Admin schreibt nach Geldeingang. SV sieht read-only verfügbaren Betrag. Aktion in dieser Phase: keine — falls heute irgendwo SV-Code Werbebudget-Felder patcht, deckt der Trigger das auf (Bug → separates Ticket).

### Smoke

`scripts/smoke/rls-phase-1/02-mass-assignment.sh`:

```bash
# Login als SV-User → PATCH /rest/v1/sachverstaendige?id=eq.<own>
# Body: {"verifiziert": true}
# Erwartet: 42501 / 403
# Body: {"profilbeschreibung": "neuer Text"}
# Erwartet: 200 (nicht-privilegierte Spalten weiter änderbar)
```

### Risiko

Mittel — Tipp-Fehler in Spaltenliste = entweder zu schwach (Lücke bleibt) oder zu streng (legitime SV-/Makler-Profil-Updates kaputt). Spaltenlisten müssen aus `information_schema.columns` + Audit-Report gegengeprüft werden, nicht aus dem Kopf.

---

## 5 · Sub-Plan #4 — Storage-Buckets

### Heutiger Zustand

- 4 Buckets `public=true`: `fall-dokumente`, `gutachten`, `schadensfotos`, `unterschriften`
- `unterschriften` zusätzlich anon-writable (für `/flow/signatur/[token]`-Upload)
- ~30 Source-Files referenzieren Bucket-Namen, viele rufen `getPublicUrl`

### Aktion

**Pro Bucket eine Migration:**

```sql
UPDATE storage.buckets SET public = false WHERE id = 'fall-dokumente';

-- SELECT-Policy (Beispiel fall-dokumente, Pfad-Schema: <fall_id>/<file>)
CREATE POLICY "fall_dokumente_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fall-dokumente'
    AND EXISTS (
      SELECT 1 FROM faelle
      WHERE faelle.id::text = split_part(name, '/', 1)
        AND (
             public.is_admin()
          OR faelle.sv_id = auth.uid()
          OR faelle.kunde_id = auth.uid()
        )
    )
  );

-- INSERT-Policy analog, mit zusätzlicher Rollen-Logik (wer darf hochladen)
-- DELETE/UPDATE nur admin (service_role bypasst sowieso)
```

Pfad-Schema pro Bucket vor Migration **verifizieren** — die Annahme `<fall_id>/...` muss stimmen, sonst kracht die Policy. (Audit-Report listet die Pfad-Schemata.)

**Unterschriften-Spezial:**

- `public=false` setzen
- Anon-Write auf Storage komplett entfernen
- `/flow/signatur/[token]`-Page: Upload läuft heute vermutlich client-side via anon-Key → muss auf eine Server-Action mit `createAdminClient` umgebaut werden, die das Bild entgegennimmt und in den Bucket schreibt.

**Code-Migration `getPublicUrl` → `createSignedUrl`:**

Greppen + ersetzen in allen ~30 Files. Server-Components rendern signed URLs zur Render-Zeit (TTL: 1h für UI-Embeds, 5min für Download-Links).

**Email-/PDF-Generatoren:**

- `src/lib/email/google/flows.ts` und `src/lib/finance/abrechnung-pdf.tsx` referenzieren Storage. Wenn sie heute `getPublicUrl` einbetten, müssen sie auf signed URLs umsteigen — TTL muss dann lang genug sein, dass der Empfänger den Link öffnen kann (Email-Empfang + Mehrfach-Öffnen → 7 Tage realistisch, oder zentraler Authenticated-Redirect-Endpoint, der die signed URL frisch generiert).

### Smoke

`scripts/smoke/rls-phase-1/04-storage-buckets.sh`:

```bash
# Direct public URL → 403 nach Fix
curl -I "$SUPABASE_URL/storage/v1/object/public/fall-dokumente/<id>/test.pdf"
# Anon write auf unterschriften → 403
curl -X POST "$SUPABASE_URL/storage/v1/object/unterschriften/test.png" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  --data-binary @test.png
```

### Risiko

Hoch — größte Sprengweite des Plans:

1. **Performance:** Signed URLs nicht CDN-cachebar. Bei Listen mit vielen Vorschau-Bildern → Render-Latenz. Mitigation: TTL = 1h, im Browser cachebar; bei langen Listen ggf. Lazy-Loading.
2. **Bestehende Links in Emails/Push-Notifications:** alle in den letzten Tagen versendeten Public-URLs sterben. Akzeptabel, weil Schadensfotos/Gutachten ohnehin nicht öffentlich teilbar sein dürfen.
3. **Performance-Regression** in Listen-Views (z. B. Admin-Faelle-Liste mit Vorschau-Thumbnails).

### Größe

1-1.5 Tage. Schwerster Teil des Plans.

---

## 6 · Rollback-Strategie

| Sub-Plan | Rollback-Aufwand | Strategie |
|---|---|---|
| #3 `flow_links` | Trivial | Drei DROPped Policies aus Audit-Report-SQL wieder anlegen. Kein Datenverlust. |
| #5 `abrechnungen` | Trivial | Alte `ALL USING(auth.role()='authenticated')`-Policy wiederherstellen. Kein Datenverlust. |
| #2 Trigger | Trivial | `DROP TRIGGER` + `DROP FUNCTION`. Bestehende Daten unverändert. |
| #4 Storage | Mittel | `UPDATE storage.buckets SET public=true`. ABER: nur signed-URL-Code-Pfade sind ohne Public-URL nicht funktional → Rollback der DDL allein reicht nicht, der Code muss auch zurück. Empfehlung: Storage-Rollback per Feature-Flag `STORAGE_USE_SIGNED_URLS` (Env-Var, default `true`, Notfall `false` → Code rendert wieder Public-URLs, DB-Policy gleichzeitig auf `public=true`). |

Jede Migration hat eine `down`-SQL (oder dokumentiertes Revert-Snippet) im Plan-Dokument.

---

## 7 · Reihenfolge & Tickets

**Empfehlung — kleinste Sprengweite zuerst:**

1. **AAR-XXX-1** `flow_links` Lock — ~1h (1 Migration, 0 Code)
2. **AAR-XXX-2** `abrechnungen` RLS — ~2h (1 Migration, 0 Code, evtl. SV-/Kunde-View-Spec follow-up)
3. **AAR-XXX-3** Mass-Assignment-Trigger — ~4h (2 Migrations, evtl. App-Layer-Verifikation)
4. **AAR-XXX-4** Storage-Buckets — ~1-1.5d (4 Bucket-Migrations + ~30 Code-Stellen + Signatur-Flow-Umbau)

**Parent-Ticket:** RLS-Hardening Phase 1.

Jedes Sub-Ticket ist eigenständig mergebar (eigene Branches `kitta/aar-xxx-...`, PR gegen `staging`, AGENTS.md Regel 1 strikt). Bei Storage-Problemen blockieren die drei kleineren Sub-Tickets nicht.

---

## 8 · AGENTS.md-Konformität

- **Regel 1:** Alle Arbeit auf Feature-Branches `kitta/aar-xxx-rls-...`, PR gegen `staging`, kein Direct-Push auf `main`.
- **Regel 2:** Alle DDL via `npx supabase migration new` + `npx supabase db push`. Kein Management-API-DDL, kein Studio-DDL.
- **Regel 3:** Vor jedem Session-Ende `git status` + `git stash list` clean.
- **7-Punkte-Audit** in jedem Commit-Body, vollständig.
- **Umlaute** in allen Commit-Messages und Code-Kommentaren.

---

## 9 · Offene Verifikations-Punkte (in Implementation-Plan zu klären)

1. **Exakte Policy-Namen** auf `flow_links` (Audit-Report-Snippet hat sie, im Plan zitieren).
2. **Storage-Pfad-Schema** pro Bucket — Annahme `<fall_id>/<file>` verifizieren via `storage.objects`-Beispiel-Query.
3. **`/flow/signatur/[token]`-Upload-Mechanik** — heute Client-Upload oder Server-Action? Bestimmt Aufwand der Unterschriften-Migration.
4. **SV-/Kunde-Portal-Abrechnungs-Views** — existieren heute oder erst nach Phase 1 zu bauen? Falls neu zu bauen, separates Follow-up-Ticket nach Migration.
5. **`makler`/`sachverstaendige` Privileg-Spalten-Namen** — aus Live-Schema via `list_tables` exakt übernehmen.
6. **Email-/PDF-Storage-Embeds** — sind betroffene Stellen public-url-abhängig? Wenn ja: signed-URL-TTL festlegen oder Auth-Redirect-Endpoint planen.

---

## 10 · Out-of-Scope-Backlog (Phase 2+, separater Brainstorm)

- **#6** Audit-Spoofing (`phase_transitions`, `mitteilungen`, `lead_historie`, `benachrichtigungen`)
- **#7** `regulierungs_klassifizierung`
- **H2** `conversion_events` RLS aus (ERROR-Lint)
- **Hygiene:** 61× `function_search_path_mutable`, 108× SECURITY-DEFINER-anon-executable, `exec_sql`-RPC-Grants
- **Strukturell:** `GRANT ALL ON ALL TABLES TO anon, authenticated`-Default abdrehen (Methodik-Ticket)

Phase 2 wird nach Phase-1-Smoke separat gebrainstormt.
