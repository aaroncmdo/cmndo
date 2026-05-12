# RLS & Permissions — Audit

**Datum:** 2026-05-12
**Scope:** DB-Layer RLS-Policies + Application-Layer Permission-Matrix + Drift-Analyse
**Methodik:** Supabase `list_tables` + Supabase Security Advisor (201 Lints) + Read `src/lib/permissions/matrix.ts` + Subagent Drift-Analyse Code↔DB

---

## TL;DR

Die App hat **zwei Sicherheits-Layer** — die DB-RLS und die Application-Permission-Matrix (`src/lib/permissions/matrix.ts`, AAR-752). **Beide haben Lücken, die sich nicht gegenseitig kompensieren.**

| Layer | Status |
|---|---|
| **DB-RLS** | 1 Tabelle ohne RLS (`conversion_events`) + 16 always-true-Policies + 3 sensible Storage-Buckets mit Listing |
| **Application** | ~40 % Server-Actions ohne strukturierte Auth-Guards, Notifications ohne Ownership-Check, `profiles.rolle` aus `user_metadata` (potenzielle Privilege-Eskalation) |
| **Matrix-Konsistenz** | Code-Matrix ist *präskriptiv* (welche Rolle darf was), DB-RLS ist *permissiv* (oft kein Filter). Sicherheit lebt aktuell von Client-seitigen Filtern + Service-Role-Bypass — **fragil bei Refactoring** |

**Priorität:** 5 Sofort-Fixes (siehe unten) sind die echte Akut-Liste. Der Rest (61 search_path-Warnings, 108 SECURITY-DEFINER-Funcs anon-executable) ist Hygiene und kann auf Backlog.

---

## Layer 1 — DB-Findings (Supabase Security Advisor, 201 Lints)

### 🔴 ERROR (2)

#### 1. `conversion_events` — RLS disabled + sensitive Spalte exposed
- **Tabelle:** `public.conversion_events` (seit 2026-05-12, Funnel v3 Drop-off-Tracking)
- **Risk:** Anon-Key kann Funnel-Daten lesen **und** Daten injizieren. `session_id` ist sensible Spalte.
- **Fix (SQL):**
  ```sql
  ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
  -- Insert-Policy für anon (Funnel-Tracking)
  CREATE POLICY "anon_insert_funnel" ON public.conversion_events
    FOR INSERT TO anon WITH CHECK (true);
  -- Read nur für service-role oder admin
  CREATE POLICY "admin_read_funnel" ON public.conversion_events
    FOR SELECT TO authenticated USING (is_admin());
  ```
- **AGENTS.md-Konformität:** Migration via `npx supabase migration new` — nicht Management-API.

### 🟠 WARN — Always-True-Policies (16)

Policies mit `USING (true)` und/oder `WITH CHECK (true)` umgehen RLS effektiv.

#### Kategorie A: Anon-Funnel-Submit (akzeptabel, aber Filter prüfen)
| Tabelle | Policy | Op | Begründung |
|---|---|---|---|
| `leads` | Flow anon insert leads | INSERT | Funnel-Submit, **OK** |
| `faelle` | Flow anon insert faelle | INSERT | Flow-Anlage, **OK** |
| `gutachter_finder_anfragen` | gfa_insert_public | INSERT | GFA-Wizard, **OK** |
| `schadenspositionen` | Flow anon insert | INSERT | Funnel, **OK** |

#### Kategorie B: Magic-Link-Updates (verdächtig — Token-Validierung fehlt in Policy)
| Tabelle | Policy | Op | Issue |
|---|---|---|---|
| `faelle` | Anon sign faelle | UPDATE | Anon kann beliebiges fall-Row updaten. Sollte: `WHERE token_hash = current_setting('request.headers')->'token-hash'` o.ä. |
| `leads` | Flow anon update leads | UPDATE | Selbes Problem |
| `flow_links` | Anon can update flow_links | UPDATE | Selbes Problem |

#### Kategorie C: Authenticated-Manage-All (HOCH-Risk)
| Tabelle | Policy | Op | Risk |
|---|---|---|---|
| `finance_eintraege` | Authenticated can manage | **ALL** | Jeder auth-User kann Finance-Daten ändern. Drift-Agent verifiziert: aktuell kein clientseitiger Zugriff, alle Writes via `createAdminClient()` → de facto kompensiert, aber **DB-Recht ist falsch** |
| `flow_links` | Authenticated can manage | **ALL** | User A kann Link von User B löschen/ändern |
| `regulierungs_klassifizierung` | (Auth INSERT + UPDATE) | INS/UPD | Sollte nur Admin/KB |
| `lead_historie` | Authenticated insert | INSERT | Audit-Spoofing möglich |
| `phase_transitions` | Service insert (true) | INSERT | Audit-Trail-Manipulation |

#### Kategorie D: Insert-ohne-Ownership (Spam-Risiko)
| Tabelle | Policy | Op | Risk |
|---|---|---|---|
| `benachrichtigungen` | System insert | INSERT | Beliebige Benachrichtigungen an beliebige User |
| `mitteilungen` | mitteilungen_insert | INSERT | Selbes Problem |
| `profiles` | Profil erstellen | INSERT | Vermutlich für Signup-Trigger OK, aber Rollen-Eskalation prüfen |

### 🟡 WARN — RLS-Enabled-No-Policy (6)

| Tabelle | Status | Bewertung |
|---|---|---|
| `rechnungs_konfiguration` | Service-role only | **OK** (AAR-613 dokumentiert) |
| `rechnungs_nr_counter` | Service-role only | **OK** (AAR-613) |
| `sv_onboarding_rechnungen` | Service-role only | **OK** (AAR-613) |
| `task_reminders` | Service-role only | **OK** (AAR-613) |
| `whatsapp_inbound_messages` | Service-role only | **OK** (AAR-613) |
| `kunde_gutachten_requests` | **Drift-Agent: ggf. service-role only** | **PRÜFEN** — keine AAR-Doku |

### 🟠 WARN — Storage-Bucket-Listing (6)

Public-Buckets erlauben aktuell Listing aller Files (nicht nur Object-URL-Access).

| Bucket | Sensibilität | Naming-Convention | Listing-Impact |
|---|---|---|---|
| `gutachten` | **Hoch** (Gutachten-PDFs) | `<fallId>/<filename>` | fallId-Enumeration möglich |
| `schadensfotos` | **Hoch** (private Unfallfotos) | unklar (kein Storage-Helper gefunden) | Bild-Listing möglich |
| `unterschriften` | **Hoch** (Vollmachten-Signaturen) | `<fallId>/<...>` | Consent-Enumeration: wer hat unterschrieben |
| `avatare` | Niedrig | – | Kosmetisch |
| `gutachter-logos` | Niedrig | `<svId>/<timestamp>` oder `org/<orgId>/...` | SV-IDs ohnehin öffentlich |
| `profile` | Niedrig | – | Kosmetisch |

**Fix-Pattern:** Public-SELECT-Policy auf `storage.objects` für sensible Buckets entfernen + signed URLs verwenden:
```ts
const { data } = await supabase.storage.from('gutachten').createSignedUrl(path, 3600)
```

### 🟢 WARN — Background-Hygiene (lower priority)

| Lint | Anzahl | Bedeutung |
|---|---:|---|
| `function_search_path_mutable` | 61 | SECURITY DEFINER Funcs ohne `SET search_path = ''` → Schema-Injection-Risiko |
| `anon_security_definer_function_executable` | 54 | SECURITY DEFINER Funcs für anon ausführbar |
| `authenticated_security_definer_function_executable` | 54 | dito für authenticated |
| `auth_leaked_password_protection` | 1 | HaveIBeenPwned-Check aus — 1-Klick-Toggle im Dashboard |
| `extension_in_public` | 1 | `btree_gist` in public (AAR-865 EXCLUSION) — best-practice: eigenes Schema |

**Bewertung:** 169 von 195 WARN-Items sind Background. Hoher Volume, niedrige Akut-Priorität — kann gesammelt als ein Hygiene-Ticket angegangen werden.

---

## Layer 2 — Application-Drift (Code kompensiert nicht alles)

### 🔴 Kritische Drift-Findings

#### 1. `benachrichtigungen` / `mitteilungen` — kein Ownership-Check
- **Wo:** `src/lib/notifications.ts` — `createNotification(targetUserId, ...)` nutzt `createServiceClient()` ohne Auth-Guard
- **Call-Sites:** 18× direkte Calls ohne Ownership-Validierung (`gutachter-waitlist.ts:130`, `api/twilio/inbound-kb-whatsapp/route.ts:169`, …)
- **Impact:** Server-Code kann beliebige User mit beliebigen Mitteilungen "spammen". Bei einem kompromittierten Endpoint wird das zur Phishing-Schleuder.
- **Fix:** In `createNotification()` einen Pre-Check ergänzen: `requireAdmin() || currentUserId === targetUserId || isSystemContext(reason)`.

#### 2. `profiles.rolle` aus `user_metadata` (Privilege-Eskalation potenziell)
- **Wo:** `src/lib/actions/konvertiere-anfrage-zu-fall.ts:79-89` setzt Auth-User mit `user_metadata.rolle` ohne Server-Validierung
- **Risk:** Wenn ein DB-Trigger `profiles.rolle` aus `user_metadata` propagiert, kann der Client beim Signup `rolle='admin'` schicken. **Verifizieren:** Trigger `handle_new_user()` oder ähnlich lesen.
- **Fix-Pattern:** `rolle` wird **ausschließlich** in Server-Code gesetzt, niemals aus `raw_user_meta_data` übernommen.

#### 3. `flow_links` Anon-DELETE + always-true UPDATE
- **Wo:** `src/app/flow/[token]/actions.ts` — Token-Auflösung über anon-Client
- **Risk:** Anon-User kann durch Token-Enumeration fremde flow_links löschen oder modifizieren
- **Fix:** Policy mit Token-Hash-Filter: `USING (token_hash = encode(digest(current_setting('request.headers.x-token', true), 'sha256'), 'hex'))` oder Server-Routing-only.

#### 4. ~40 % Server-Actions ohne strukturierte Auth-Guards
- Stichprobe von 30 Actions analysiert: 12 mit `requireAuth()`/`requireRole()`, 8 mit Custom-Guard, **10 ohne Guard** (nur `throw` bei fehlendem User)
- **Beispiele ohne Guard:**
  - `src/lib/actions/create-lead.ts:19` — nur `throw new Error('nicht angemeldet')`, keine Rollen-Prüfung
  - `src/lib/actions/admin-kalender.ts:31` — `getKalenderTermine()` ohne `requireRole(['admin'])`
  - `src/lib/actions/call-actions.ts:15` — `getCallBriefing()` ohne Guard
  - `src/lib/actions/makler-settings.ts:44` — `updateMaklerProfil()` ohne Guard
- **Fix:** Convention durchziehen — jede Action startet mit `await requireRole([...])`.

#### 5. `regulierungs_klassifizierung` — Admin-only nicht im Code enforced
- **Matrix sagt:** Admin/KB only
- **DB sagt:** Authenticated INSERT + UPDATE
- **Code sagt:** `dispatch-fall-actions.ts:21` hat `requireAuth()`, aber keinen `requireRole(['admin','kundenbetreuer'])`
- **Fix:** Guard ergänzen.

### 🟢 Application kompensiert (DB schwach, Code dicht)

| Schwache DB-Policy | Code-Kompensation |
|---|---|
| `finance_eintraege` Auth-manage | Alle Writes via `createAdminClient()` in `admin-abrechnungen/actions.ts`, `ensureAdmin()` davor. **Aber:** Drift bei zukünftigen Devs realistisch. |
| `faelle`-Scope nicht DB-enforced | `src/lib/faelle/kb-assignment.ts` + `src/lib/claims/get-claim-for-role.ts` filtern client-seitig `eq('sv_id', userSvId)`. **Fragil:** ein vergessener Filter leaked die Tabelle. |

---

## Layer 3 — Permission-Matrix vs. DB-RLS (Konsistenz)

| Tabelle | Matrix-Scope | DB-RLS | Drift |
|---|---|---|---|
| `faelle` | SV: `own`, KB: `assigned`, Admin: `all` | Keine Owner-Policy, nur anon-Magic-Link-Updates | **BROKEN** — Matrix nur im Code enforced |
| `claims` | SV: `own`, others: `all` | unbekannt (zu prüfen) | **UNKNOWN** |
| `abrechnungen` | scope per Rolle | Service-role-Bypass | **WEAK** — keine RLS-Filter |
| `tasks` | Admin/KB/Dispatch: `write`, SV/Kunde: `own` | unbekannt | **UNKNOWN** |
| `mitteilungen` | User-spezifische Reads | Insert always-true, kein Read-Filter | **BROKEN** |

**Verdict:** Matrix ist *Soll*-Dokumentation, DB ist *Ist* (permissiv). Sicherheit hängt am App-Layer + Service-Role-Bypass. Bei Native-App, Direct-PostgREST-Use oder kompromittierten Endpoints ist die DB die letzte Verteidigung — und die ist heute löchrig.

---

## Top-5 Sofort-Fixes (priorisiert)

### Fix 1 — `conversion_events` RLS enablen (5 Min)
Migration anlegen, ALTER + 2 Policies. Critical, da Funnel-Daten + `session_id` aktuell anon-lesbar.

### Fix 2 — Storage-Bucket-Listing für sensible Buckets schließen (30 Min)
Migrations für `gutachten`, `schadensfotos`, `unterschriften`:
```sql
DROP POLICY "<name>_select" ON storage.objects;
CREATE POLICY "<name>_select_signed_only" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = '<name>' AND (auth.uid() = owner OR is_admin()));
```
+ Upload/Read in App auf `createSignedUrl()` umstellen.

### Fix 3 — `benachrichtigungen` / `mitteilungen` Ownership-Check in `createNotification()` (1-2 h)
- Pre-Check in `src/lib/notifications.ts` einbauen
- Read-Policy ergänzen: `user_id = auth.uid() OR is_admin()`
- 18 Call-Sites auf Konformität prüfen (System-Trigger vs. User-Action)

### Fix 4 — `profiles.rolle` Server-only (1 h)
- DB-Trigger `handle_new_user` lesen, prüfen ob `rolle` aus `user_metadata` propagiert wird
- Falls ja: Trigger fixen, Default `kunde` setzen, Rolle nur via `update_user_role()`-RPC mit Admin-Guard erhöhen lassen
- Existierende Signup-Routes auf "kein user_metadata.rolle" prüfen

### Fix 5 — Auth-Guard-Convention für Server-Actions (4-6 h Sweep)
- Audit aller 'use server'-Files: `requireRole(['…'])` als erste Zeile
- Specific Targets: `create-lead.ts`, `admin-kalender.ts`, `call-actions.ts`, `makler-settings.ts`, `dispatch-fall-actions.ts:regulierungs-Klassifizierung`
- Linter-Rule (eslint-plugin oder custom check): Server-Action ohne Guard = Build-Warning

---

## Mid-Term (Backlog-Ticket)

### RLS-Policies für Core-Tabellen ausrollen (1-2 Tage)
Matrix-Soll als DB-RLS umsetzen:

```sql
-- faelle: SV sieht eigene, KB sieht assigned, Admin alles
CREATE POLICY "faelle_sv_own" ON faelle FOR SELECT TO authenticated
  USING (sv_id = get_sv_id(auth.uid()) OR kundenbetreuer_id = auth.uid() OR is_admin());

-- claims, abrechnungen, tasks analog
```

Vorgehen: pro Tabelle ein Migration-File via `npx supabase migration new`, dann nach Smoke-Test deployen.

### Always-True-Policies fixen (1 Tag)
Pro Policy: Token-Filter, User-ID-Filter, oder Service-role-only umstellen.

### Background-Hygiene-Sweep (1 Tag)
- 61× `function_search_path_mutable` → `ALTER FUNCTION … SET search_path = ''`
- 108× SECURITY DEFINER anon/auth executable → wenn nicht-trivial, REVOKE EXECUTE FROM anon/authenticated
- `auth_leaked_password_protection` → Dashboard-Toggle
- `btree_gist` → eigenes Schema

---

## Nicht in diesem Audit

- **Native-App Permissions** — Capacitor-Native ruft Supabase direkt; alle DB-Lücken werden dort akut
- **Audit-Log-Vollständigkeit** — Welche destruktiven Actions schreiben in `timeline`/`phase_transitions`?
- **2FA-Status pro Rolle** — `twofa_aktiviert` Coverage in `profiles`
- **DSGVO-Lösch-Workflow Trigger** — `dsgvo_loeschauftraege` (RLS aktiv, Policies nicht geprüft)

---

## Anhang: Audit-Quellen

- Supabase Project `paizkjajbuxxksdoycev` Region eu-west-2
- `mcp__plugin_supabase_supabase__list_tables` (~140 Tabellen, 1 ohne RLS)
- `mcp__plugin_supabase_supabase__get_advisors` (201 Lints: 2 ERROR, 193 WARN, 6 INFO)
- `src/lib/permissions/matrix.ts` (AAR-752, 6 aktive Rollen + DENY_ALL)
- Memory: `project_rollen_berechtigungen_offen.md` (Sync 2026-05-08)
- Subagent Drift-Analyse 2026-05-12 (Code↔DB, 30-Action-Stichprobe)
