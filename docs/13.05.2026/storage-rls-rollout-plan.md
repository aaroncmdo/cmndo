# RLS-Phase-1 #4 — Storage-Bucket-Rollout

**Datum:** 13.05.2026
**Spec:** `docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md` §5
**Status:** Schritt A ausgeliefert (PR #905). Schritt B-D ausstehend.

---

## 1 · Ausgangslage

Vier Storage-Buckets sind `public=true` (verifiziert via `SELECT id, public FROM storage.buckets`):

| Bucket | public | Anon-Read | Anon-Write |
|---|---|---|---|
| `fall-dokumente` | true | ✅ wenn Pfad bekannt | ❌ |
| `gutachten` | true | ✅ wenn Pfad bekannt | ❌ |
| `schadensfotos` | true | ✅ wenn Pfad bekannt | ❌ |
| `unterschriften` | true | ✅ wenn Pfad bekannt | **✅ über die Bank** |

Anon-Write auf `unterschriften` verifiziert per Smoke (`POST /storage/v1/object/unterschriften/<file>` mit `apikey` + `Authorization: Bearer <anon-key>` liefert HTTP 200).

**Audit-Quelle:** `docs/12.05.2026/SECU/LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md` HIGH #4.

---

## 2 · Caller-Inventar (Grep 13.05.2026)

**48 Files** referenzieren entweder einen der 4 Bucket-Namen oder rufen `getPublicUrl`. Kategorisiert:

| Kategorie | Files | Beispiele |
|---|---:|---|
| Server-Actions mit Upload | 14 | `dokumente.ts`, `kanzlei-paket.ts`, `gutachter/fall/[id]/actions.ts`, `kunde/onboarding/actions.ts` |
| Server-Pages mit Read-Display | 8 | `kunde/faelle/[id]/page.tsx`, `gutachter/fall/[id]/page.tsx`, `admin/sachverstaendige/[id]/page.tsx` |
| Client-Components Upload | 6 | `FlowWizardKfz.tsx`, `SignaturPage.tsx`, `GutachtenUploadBanner.tsx`, `AnschlussschreibenUploadBlock.tsx` |
| Email/PDF-Embeds | 3 | `lib/email/google/flows.ts`, `lib/finance/abrechnung-pdf.tsx`, `lib/sa-tool/*` |
| API-Routes (Cron/Webhook/SV-Upload) | 11 | `api/sv/upload-gutachten`, `api/webhooks/twilio/inbound`, `api/ocr-trigger` |
| Helper-Libraries | 6 | `lib/dokumente/upload.ts`, `lib/gutachten/ocr-actions.ts`, `lib/profile/avatar.ts` |

Die meisten Server-seitigen Caller nutzen bereits `createAdminClient` (service-role bypasst RLS). Kritisch sind die Files, die **Public-URLs für externe Konsumenten** generieren (Email-Empfänger, PDF-Embeds): die brauchen entweder signed-URLs mit ausreichender TTL ODER eine Authenticated-Proxy-Route.

---

## 3 · 4-Schritt-Rollout (Sequencing zwingend)

### Schritt A — Helper + Feature-Flag (PR #905, ausgeliefert)

- **NEU** `src/lib/storage/url.ts`:
  - `getStorageUrl(supabase, bucket, path, opts)` — liefert signed-URL wenn `STORAGE_USE_SIGNED_URLS=true`, sonst `getPublicUrl` (heute-Verhalten).
  - `STORAGE_TTL` Konstanten: `ui` (1h), `download` (5min), `email` (7d).
  - `getStorageUrlBulk()` für Listen-Views (parallel).
- **0 Caller-Migration, 0 Behavior-Change** ohne ENV-Flag. Risiko = null.

### Schritt B — Caller-Migration (3 Batches, separate PRs)

Pro Batch ~10-15 Files. Reihenfolge nach Risiko (niedrig → hoch):

#### Batch 1 — Helper-Libraries + API-Routes (~12 Files)
Intern, keine User-facing-Embeds:
- `lib/dokumente/upload.ts`
- `lib/sa-tool/generate-pflichtdokumente.ts`, `lib/sa-tool/generate-gutachter-sa.ts`
- `lib/gutachten/ocr-actions.ts`
- `lib/profile/avatar.ts`
- `lib/auftrag/qc.ts`
- `lib/claims/pflicht-for-fall.ts`
- `lib/beleg-review/actions.ts`
- `lib/flow/upload-foto.ts`
- `lib/offline/sync-outbox.ts`
- `api/sv/upload-gutachten`, `api/sv/upload-gutachten/finalize`
- `api/ocr-trigger`
- `api/kunde/gutachten/magic/[token]`
- `api/webhooks/twilio/inbound`
- `api/branding/upload`

#### Batch 2 — Server-Pages + Server-Actions (~16 Files)
Eingeloggte Konsumenten, kein Email-Embed:
- `kunde/faelle/[id]/page.tsx`, `kunde/faelle/[id]/actions.ts`
- `gutachter/fall/[id]/page.tsx`, `gutachter/fall/[id]/actions.ts`
- `gutachter/fall/[id]/stellungnahme/actions.ts`
- `admin/sachverstaendige/[id]/page.tsx`, `admin/sachverstaendige/[id]/verifizierung-actions.ts`
- `admin/vertraege/actions.ts`
- `kunde/onboarding/actions.ts`
- `faelle/[id]/page.tsx`, `faelle/[id]/_tabs/DokumenteTab.tsx`
- `faelle/[id]/_actions/dokumente.ts`, `faelle/[id]/_actions/kanzlei-paket.ts`
- `flow/[token]/actions.ts`
- `upload/dokumente/[token]/actions.ts`, `upload/zb1/[token]/actions.ts`
- `gutachter/termine/[id]/actions.ts`, `gutachter/vertrag/page.tsx`
- `kanzlei/kanban/DokumenteDrawer.tsx`
- `lib/actions/branding-actions.ts`, `lib/actions/stellungnahme-upload.ts`, `lib/actions/sv-verifizierung-actions.ts`
- `lib/kanzlei/actions.ts`
- `lib/makler/queries.ts`

#### Batch 3 — Client-Components + Email/PDF-Embeds (~10 Files)
Externe Konsumenten / TTL-kritisch:
- `flow/[token]/FlowWizardKfz.tsx`
- `flow/signatur/[token]/SignaturPage.tsx` (← Spezialfall, siehe Batch 4)
- `components/gutachter/GutachtenUploadBanner.tsx`
- `components/admin/fallakte/dokumente/AnschlussschreibenUploadBlock.tsx`
- `components/VorOrtPanel.tsx`
- `lib/email/google/flows.ts`
- `lib/finance/abrechnung-pdf.tsx` (via `api/pdf/kanzlei-paket/[id]`)
- Weitere PDF-/Email-Embed-Konsumenten

#### Batch 4 — Signatur-Flow-Refactor (eigener PR)
`/flow/signatur/[token]`-Upload läuft heute **client-side mit dem anon-Key**. Anon-Write auf `unterschriften` ist die direkte Lücke. Refactor:
- Client lädt File hoch zu einer **neuen Server-Action**.
- Server-Action verwendet `createAdminClient` und schreibt in `unterschriften`.
- Anon-Write-Erlaubnis auf dem Bucket fällt mit Schritt D.

### Schritt C — Email/PDF-Embed-Strategie

Zwei Optionen für die Email-/PDF-Konsumenten aus Batch 3:

**Option 1 — Lang-TTL signed URLs (7 Tage)**
```ts
await admin.storage.from('gutachten').createSignedUrl(path, 7 * 24 * 60 * 60)
```
- **Pro**: einfach, Empfänger kann mehrfach öffnen.
- **Contra**: signed-URL-Leak = Zugriff bis Ablauf (7 Tage).
- **Hint**: Helper unterstützt das schon via `STORAGE_TTL.email`.

**Option 2 — Authenticated-Proxy-Route**
- Neue API-Route `/api/file/[bucket]/[...path]?token=<magic>` oder `[token]/...`.
- Macht Auth-Check (Magic-Link-Token oder Session) + generiert kurz-signed-URL + 302-Redirect.
- **Pro**: keine TTL-Problematik, Zugriff wird bei jedem Request neu autorisiert. Leak unschädlich (Token expired).
- **Contra**: zusätzlicher Hop bei Asset-Request (~50-200ms).

**Empfehlung:**
- **Option 1** für Push-Notifications + kurzlebige Email-Embeds (Termin-Bestätigung 24h-Fenster).
- **Option 2** für Gutachten/Abrechnungs-PDFs in Emails (langlebige Doku-Links, Empfänger öffnet ggf. nach Tagen).

Entscheidung wird in Batch 3 finalisiert + im PR-Body dokumentiert.

### Schritt D — DB-Migration (letzter Schritt)

Eine Migration via `npx supabase migration new aar_storage_buckets_lock`:

```sql
UPDATE storage.buckets SET public = false
WHERE id IN ('fall-dokumente', 'gutachten', 'schadensfotos', 'unterschriften');

-- Pro Bucket eine SELECT-Policy (Beispiel fall-dokumente):
CREATE POLICY "fall_dokumente_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'fall-dokumente'
    AND EXISTS (
      SELECT 1 FROM public.faelle f
      WHERE f.id::text = split_part(name, '/', 1)
        AND (
             public.is_admin()
          OR f.sv_id = auth.uid()
          OR f.kunde_id = auth.uid()
        )
    )
  );

-- INSERT-Policies analog mit Rollen-Logik
-- DELETE/UPDATE nur admin
-- unterschriften: anon-Write komplett raus
```

**Pfad-Schema-Verifikation vor Migration:** Annahme `<fall_id>/<file>` pro Bucket muss stimmen. Pre-Check-Query:
```sql
SELECT bucket_id, split_part(name, '/', 1) AS first_segment, COUNT(*) AS files
FROM storage.objects
WHERE bucket_id IN ('fall-dokumente', 'gutachten', 'schadensfotos', 'unterschriften')
GROUP BY bucket_id, split_part(name, '/', 1)
ORDER BY bucket_id, files DESC
LIMIT 20;
```
Wenn `first_segment` kein UUID ist (z.B. flacher Bucket-Inhalt), muss die Policy-Logik angepasst werden.

Nach Migration: ENV-Var `STORAGE_USE_SIGNED_URLS=true` auf prod + staging setzen → Code-Pfad wird aktiv. Smoke 04 grün.

---

## 4 · Sequencing — HARTE Regel

1. ✅ **Schritt A** merge (PR #905) — Helper existiert, Flag default-off → kein Behavior-Change.
2. ⏳ **Schritt B-Batches** merge — Caller laufen via Helper, weiter Public-URL.
3. ⏳ **Schritt C** entscheiden + Email/PDF anpassen.
4. ⏳ Lokal/Staging: ENV-Var on → signed-URLs gehen → manueller Test pro Konsumenten-Typ.
5. ⏳ **Schritt D Migration** applizieren via `npx supabase db push` + ENV-Var on auf prod.

**Falsch wäre:** DB-Migration zuerst (public=false) → 30+ Pages liefern 403 weil noch Public-URL-Pfad → Production-Crash.

---

## 5 · Risiken (per Spec §5)

| Risiko | Mitigation |
|---|---|
| **Performance**: signed URLs nicht CDN-cachbar | TTL 1h für UI-Embeds, im Browser cachbar. Bei Listen-Views ggf. Lazy-Loading. |
| **Bestehende Email-Links sterben** | Akzeptabel — Schadensfotos/Gutachten sollen ohnehin nicht öffentlich teilbar sein. Bestehende Notifications sind kurzfristig (24h-Termine, Status-Updates). |
| **Performance-Regression in Listen-Views** | `getStorageUrlBulk()` Bulk-API generiert parallel; bei großen Listen Lazy-Loading. Vercel-Edge-Cache-Header für 1h. |
| **Signatur-Flow bricht bei Schritt D** ohne Batch 4 | Batch 4 ist Pflicht vor Schritt D — Anon-Write entfernen impliziert Server-Action-Refactor. |

---

## 6 · Verifikations-Punkte (vor Schritt D)

1. **Pfad-Schema** pro Bucket bestätigen (`<fall_id>/<file>` vs. anderes Format) — Beispiel-Query oben.
2. **Signatur-Flow** funktioniert via Server-Action (Batch 4 abgeschlossen).
3. **Email/PDF-Embed-Strategie** entschieden + implementiert (Schritt C).
4. **48 Caller** via `getStorageUrl`/`getStorageUrlBulk` migriert. Final-Grep:
   ```bash
   grep -rn "getPublicUrl" src/ | grep -v "lib/storage/url.ts"
   ```
   Sollte 0 Treffer haben (oder dokumentierte Ausnahmen).
5. **Smoke #4** (`scripts/smoke/rls-phase-1/04-storage-buckets.sh`) zeigt heute `ANGRIFF MOEGLICH`. Nach Schritt D + Flag-Flip soll er `ANGRIFF BLOCKIERT` zeigen:
   - Bucket-Detail-API: alle 4 Buckets `public=false`.
   - `POST /storage/v1/object/unterschriften/test.png` mit anon-Key → 403 statt 200.

---

## 7 · Größe (Schätzung)

| Schritt | Aufwand | Zustand |
|---|---|---|
| A — Helper | ~1h | ✅ ausgeliefert (PR #905) |
| B — Batch 1 (Helper-Libs + API) | ~1.5h | offen |
| B — Batch 2 (Pages + Actions) | ~2h | offen |
| B — Batch 3 (Client + Email/PDF) | ~1.5h | offen |
| B — Batch 4 (Signatur-Refactor) | ~2h | offen |
| C — Embed-Strategie + Implementation | ~1h | offen |
| D — DB-Migration + Flag-Flip | ~1h | offen |
| **Total Schritt B-D** | **~9h** | |

Realistisch verteilt auf 1-1.5 Tage Reinzeit + Smoke-Buffer.

---

## 8 · Offene Entscheidungen

1. **Embed-Strategie** für `lib/email/google/flows.ts` + `lib/finance/abrechnung-pdf.tsx` — Option 1 (lang-TTL) vs. Option 2 (Auth-Proxy). Entscheidung in Batch 3.
2. **TTL-Werte** validieren in Praxis: reichen 1h für UI? 5min für Download? 7d für Email?
3. **Authenticated-Proxy-Route-Design** falls Option 2: `/api/file/[bucket]/[...path]?token=` vs. `/api/file/[token]/[bucket]/[...path]`. Token-Type (Magic-Link aus `flow_links` / `dokument_upload_anfragen` / Session-Cookie)?
4. **Kompatibilität** mit Push-Notifications (Web-Push payload-size-Limit: signed-URL ist ~300 Bytes — passt).

---

## 9 · Out-of-Scope (Phase 2)

- `avatare`, `gutachter-logos`, `profile` (3 weitere `public=true`-Buckets) — Avatare/Logos sind bewusst public (Kunde-Mail-Signaturen, SV-Profil-Page). Keine Migration in Phase 1.
- Storage-Bucket-Policies für admin-eigene Buckets (`abrechnungen-pdf`, `gutachten-pdfs`, `vertraege`) — schon `public=false`, brauchen separate Policy-Audit.

---

## Cross-Referenzen

- **Spec:** `docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md` §5
- **PR #905** — Schritt A Helper
- **Smoke:** `scripts/smoke/rls-phase-1/04-storage-buckets.sh`
- **Vorgänger-PRs:** #893 (#3 flow_links), #895 (#5 abrechnungen), #896 (#2 Mass-Assignment) — alle gemerged + auf prod-DB appliziert.
