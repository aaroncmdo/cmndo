# Storage-Schritt-D — Pfad-Pre-Check + Policy-Strategie-Empfehlung

**Datum:** 13.05.2026 ~21:30 Europe/Berlin
**Spec:** `docs/13.05.2026/storage-rls-rollout-plan.md` §3 Schritt D + §6
**Status:** Pre-Check abgeschlossen, Entscheidung offen.

---

## 1 · Live-Stand der 4 Public-Buckets

```sql
SELECT bucket_id, COUNT(*) FROM storage.objects
WHERE bucket_id IN ('fall-dokumente','gutachten','schadensfotos','unterschriften')
GROUP BY bucket_id;
```

| Bucket | Files | Sample-Pfad |
|---|---:|---|
| `fall-dokumente` | 1 | `claim/6652994d-…-832d8af8e42e/signed/sicherungsabtretung_1778706768716.html` |
| `gutachten` | **0** | — |
| `schadensfotos` | **0** | — |
| `unterschriften` | 3 | `flow/cc3941374b649b6a2daf5e34bf241920/sa_1778706765292.png` + 2× `smoke-rls-phase-1-*.png` |

**Implikation:** Production hat de-facto noch keine Daten in diesen Buckets. Lockdown jetzt = risikoarm.

**Cleanup vor Lockdown:** Die 2 `smoke-rls-phase-1-*.png` in `unterschriften` sind Test-Artefakte aus dem Phase-1-Smoke (`scripts/smoke/rls-phase-1/04-storage-buckets.sh`) → vor Schritt D droppen.

---

## 2 · Pfad-Konvention pro Bucket (Plan vs. Realität)

Plan-Annahme (storage-rls-rollout-plan.md §3 Schritt D): `<fall_id>/<file>`.

Realität:

| Bucket | App-Code-Pattern | Mapping-Tabelle | Frontend-Direct-Read? |
|---|---|---|---|
| `fall-dokumente` | `claim/<claim_id>/signed/<file>` + Legacy `<fall_id>/<file>` möglich | `fall_dokumente.storage_path` (text) | **Nein** — alle Caller server-side |
| `gutachten` | (heute leer) — geplant via `gutachten.unterschrift_sv_url` ggf. PDF-Pfade | (keine dedizierte Spalte sichtbar) | **Nein** |
| `schadensfotos` | (heute leer) — geplant via `gutachten_fotos.storage_path` | `gutachten_fotos.storage_path` | **Nein** |
| `unterschriften` | `flow/<token>/sa_*.png` | `flow_links.token` (token = first_segment) | **Nein** — Server-Action `unterschrift-upload.ts` schreibt mit admin-client |

**Wichtig:** `split_part(name,'/',1)::uuid = faelle.id` — wie der Plan vorschlug — würde an `claim/<uuid>/...` und `flow/<token>/...` **scheitern**. Plan-Annahme greift nicht.

---

## 3 · App-Code-Status (Grep 13.05.2026 21:30)

`getPublicUrl`-Treffer in `src/`:
- `lib/storage/url.ts` — Helper (legitim)
- `lib/profile/avatar.ts` + `lib/actions/branding-actions.ts` + `api/branding/upload/route.ts` — Buckets `avatare` / `gutachter-logos` (out-of-scope, bewusst public)
- `app/flow/[token]/actions.ts` — zu verifizieren ob Direct-getPublicUrl für die 4 Buckets passiert

`storage.from('<bucket>')`-Treffer für die 4 Buckets in 7 Files — **alle server-side** (Pages, Actions, API-Routes, kein Client-Component).

**Heißt:** Frontend macht **keinen** Direct-Read auf die 4 Buckets. Alle Reads laufen über Server-Code, der über `getStorageUrl()` signed-URLs oder direkten `download()` auf admin-client verwendet.

---

## 4 · Empfohlene Policy-Strategie

### 4.1 Hauptansatz: **Service-Role-Only**

Da keine Frontend-Direct-Reads stattfinden, kann der Lockdown radikal-einfach sein:

```sql
UPDATE storage.buckets SET public = false
WHERE id IN ('fall-dokumente','gutachten','schadensfotos','unterschriften');

-- KEINE SELECT-Policy für public/authenticated definieren.
-- → Nur service_role kann lesen.
-- → Frontend bekommt signed-URLs aus Server-Actions (Helper macht das schon via STORAGE_USE_SIGNED_URLS=true).

-- INSERT/UPDATE/DELETE explizit blocken (Defense-in-Depth):
CREATE POLICY "buckets_locked_no_anon_write" ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id NOT IN ('fall-dokumente','gutachten','schadensfotos','unterschriften'))
  WITH CHECK (bucket_id NOT IN ('fall-dokumente','gutachten','schadensfotos','unterschriften'));
```

**Pro:**
- Maximal sicher: keine SQL-Mistake-Margin, keine Pfad-Annahme.
- 0 Performance-Kosten (kein JOIN auf storage.objects-SELECT).
- Kompatibel mit dem App-Stand (alle Caller schon server-side, `getStorageUrl` liefert signed-URLs via admin-client).
- Anon-Write auf `unterschriften` (verbleibendes Audit-Loch) ist mit RESTRICTIVE-Policy zu 100% dicht.

**Contra:**
- Falls in Zukunft ein **Client-Component direkt** aus dem Bucket lesen will (z.B. PWA-Offline-Cache, Lazy-Image-Tag mit direkter URL), muss erst eine Server-Action für signed-URL gebaut werden — kein "quick `<img src=publicUrl>`".
- Ein Bug, der versehentlich `anon`-Client statt `admin`-Client nimmt, kracht laut (403) statt still zu funktionieren. Eigentlich Pro, aber heißt: Eingewöhnung.

### 4.2 Alternative: Lookup-Policy via Mapping-Tabellen

Falls in Zukunft authentifizierte Frontend-Reads gewünscht sind:

```sql
CREATE POLICY "fall_dokumente_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fall-dokumente'
  AND EXISTS (
    SELECT 1 FROM public.fall_dokumente fd
    JOIN public.faelle f ON f.id = fd.fall_id
    WHERE fd.storage_path = name
      AND (
        is_admin()
        OR f.kunde_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM sachverstaendige s WHERE s.profile_id = (SELECT auth.uid()) AND s.id = f.sv_id)
        OR EXISTS (SELECT 1 FROM makler m WHERE m.user_id = (SELECT auth.uid()) AND m.id = f.makler_id)
      )
  )
);
-- Analog für schadensfotos (gutachten_fotos.storage_path → gutachten.fall_id → faelle)
-- Für unterschriften: flow_links.token = split_part(name,'/',2)
-- Für gutachten: noch nicht spezifiziert (0 Files, Schema unklar)
```

**Pro:** Spätere Frontend-Direct-Reads ohne Code-Refactor möglich.
**Contra:** Policy-JOIN-Kosten bei jedem SELECT, Stale-`storage_path` → 403, Bug-Surface höher.

### 4.3 Empfehlung

**Option 4.1 (Service-Role-Only)** ist der konsequente Endzustand. Begründung:
1. App-Code ist schon auf signed-URL-via-Server gestaltet (Schritt B 1–4 abgeschlossen).
2. Pfad-Patterns sind heterogen (`claim/…`, `flow/…`, legacy `<fall_id>/…`) — eine generische Policy bricht zwangsläufig irgendwo.
3. Production hat 1 echtes File — der Lockdown kostet effektiv nichts an Migration-Reibung.
4. Wenn später doch Frontend-Direct-Read gewünscht: Policy nachschieben, nicht beim ersten Schritt einbauen.

---

## 5 · Migration-Plan (falls 4.1 gewählt wird)

```sql
-- Migration: aar_storage_buckets_lock
BEGIN;

-- Cleanup Smoke-Artefakte
DELETE FROM storage.objects
WHERE bucket_id = 'unterschriften'
  AND name LIKE 'smoke-rls-phase-1-%';

-- Public-Flag aus
UPDATE storage.buckets SET public = false
WHERE id IN ('fall-dokumente','gutachten','schadensfotos','unterschriften');

-- Defense-in-depth: explizit anon+authenticated für die 4 Buckets blocken
DROP POLICY IF EXISTS "Anon can read own unterschriften" ON storage.objects;
DROP POLICY IF EXISTS "Anon can write own unterschriften" ON storage.objects;
-- (Weitere Bucket-spezifische Reste droppen — vor Migration via pg_policies prüfen)

CREATE POLICY "block_anon_on_locked_buckets" ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon
  USING (bucket_id NOT IN ('fall-dokumente','gutachten','schadensfotos','unterschriften'))
  WITH CHECK (bucket_id NOT IN ('fall-dokumente','gutachten','schadensfotos','unterschriften'));

CREATE POLICY "block_authenticated_on_locked_buckets" ON storage.objects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id NOT IN ('fall-dokumente','gutachten','schadensfotos','unterschriften'))
  WITH CHECK (bucket_id NOT IN ('fall-dokumente','gutachten','schadensfotos','unterschriften'));

COMMIT;
```

**Verifikation nach Apply:**
1. `SELECT public FROM storage.buckets WHERE id IN (…)` → alle `false`.
2. Smoke #4: `POST /storage/v1/object/unterschriften/test.png` mit `anon-key` → 403.
3. `GET /storage/v1/object/public/fall-dokumente/claim/6652994d-…/signed/…` → 400/404 (Public-Route deaktiviert).
4. Server-Action für Fallakte rufen → signed-URL kommt → `GET <signed-URL>` → 200.

**ENV-Flag:** `STORAGE_USE_SIGNED_URLS=true` auf prod + staging setzen (war bisher default-off laut Plan §3 Schritt A).

---

## 6 · Entscheidung erforderlich

| Frage | Vorschlag |
|---|---|
| Strategie 4.1 (Service-Role-Only) oder 4.2 (Lookup-Policy)? | **4.1** |
| ENV-Flag-Flip jetzt oder gestaffelt? | Mit der Migration (gleicher Deploy) |
| Smoke-Files vor Lockdown droppen? | **Ja** (siehe §1 Cleanup) |

Bei Freigabe Strategie 4.1: Migration anlegen, lokal testen, `npx supabase db push`, ENV-Flag setzen, Smoke #4 erneut fahren (muss `ANGRIFF BLOCKIERT` zeigen).

---

## 7 · Quellen

- `docs/13.05.2026/storage-rls-rollout-plan.md` (Plan-Quelle)
- `docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md` §1.2 (Audit-Quelle)
- Live-Queries via Supabase MCP gegen Project `paizkjajbuxxksdoycev` (13.05.2026 ~21:30)
- Code-Grep: 5× `getPublicUrl` + 7× `storage.from('<bucket>')` in `src/` — alle server-side
