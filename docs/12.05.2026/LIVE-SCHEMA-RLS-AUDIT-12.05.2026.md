# Live-Schema-/RLS-Audit — Claimondo-v2 (12.05.2026)

**Quelle:** Direkter Zugriff auf die Live-DB (Supabase Project `paizkjajbuxxksdoycev`, eu-west-2, Postgres 17.6) via MCP: `list_tables` (RLS-Status pro Tabelle), `get_advisors(security)` (201 Lints), `execute_sql` gegen `pg_policies`, `information_schema.role_table_grants` / `column_privileges`, `pg_trigger`, `pg_proc`, `storage.buckets` + `storage.objects`-Policies. Reine Lese-Analyse.

**Schließt den blinden Fleck aus** `SECURITY-AUDIT-12.05.2026.md` (Code-only) — und fördert **eine kritische und mehrere High-Findings zutage, die der Code-Audit nicht sehen konnte**, weil sie nur über den direkten PostgREST-/Storage-Zugriff (am App-Layer vorbei) ausnutzbar sind.

---

## 0 · Die strukturelle Wurzel

**Das `public`-Schema wurde mit dem Supabase-Default eingerichtet: `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated` (inkl. column-level `SELECT/INSERT/UPDATE/DELETE` auf *jeder* Spalte).** Geprüft für ~35 Tabellen — durchgängig `anon:SELECT,INSERT,UPDATE,DELETE` + `authenticated:SELECT,INSERT,UPDATE,DELETE`, inkl. `profiles`, `flow_links`, `faelle`, `leads`, `nachrichten`, `fall_dokumente`, `makler`, `sachverstaendige`, `provisionen_maik`, `email_otp_codes`, `auth_remember_tokens`, `airdrop_invitations`, `dsgvo_loeschauftraege`, `whatsapp_inbound_messages`, `ai_usage_log`, `email_log`.

**Konsequenz:** Die *einzige* Verteidigungslinie zwischen dem öffentlichen `anon`-Key (im Client-Bundle, jedem zugänglich) und jeder Tabelle ist **RLS**. Es gibt keinen GRANT-Layer als Backstop.

**Und RLS hat eine grundsätzliche Lücke, die hier mehrfach durchschlägt:** Eine RLS-`WITH CHECK`-Klausel beschränkt nur, ob die *resultierende Zeile* das Prädikat erfüllt — **nicht, welche Spalten geändert werden**. Eine Policy wie `USING (id = auth.uid())` / `WITH CHECK (id = auth.uid())` (oder `WITH CHECK` ausgelassen → defaultet auf `USING`) erlaubt dem User also, **jede Spalte** seiner eigenen Zeile zu setzen — solange `id` (das er nicht ändert) weiter `= auth.uid()` ist. Das macht jede „update-deine-eigene-Zeile"-Policy auf einer Tabelle mit Privileg-Spalten zu einem Mass-Assignment-Loch.

Die einzigen Tabellen, die *nicht* via Data-API erreichbar sind, sind die mit **RLS-enabled-aber-keiner-Policy** (`rechnungs_konfiguration`, `rechnungs_nr_counter`, `sv_onboarding_rechnungen`, `task_reminders`, `whatsapp_inbound_messages`, `kunde_gutachten_requests`) — die sind faktisch auf `service_role` (BYPASSRLS) gesperrt. Das ist sicher (auch wenn der Advisor es als INFO „du hast vielleicht eine Policy vergessen" flaggt). Der `rls_enabled_no_policy`-„PRÜFEN"-Punkt aus `rls-permissions-audit.md` für `kunde_gutachten_requests` ist damit **erledigt — by design service-role-only, kein Problem.**

---

## 1 · 🔴 CRITICAL — Privilege-Escalation: jeder eingeloggte User kann sich zum Admin machen

**Tabelle:** `public.profiles`. **Confidence: hoch (durch das Live-Schema belegt).**

**Die Kette:**
1. `authenticated` hat **column-level `UPDATE` auf `profiles.rolle`** (geprüft via `information_schema.column_privileges`) — keine Spalten-Einschränkung.
2. Die UPDATE-Policy **„Profil bearbeiten"** ist `USING ((id = auth.uid()) OR is_admin())`, **`WITH CHECK` = NULL** → Postgres nutzt dann `USING` auch als `WITH CHECK`. Ein `rolle`-only-Update ändert `id` nicht → `id = auth.uid()` gilt weiter → der Check passt. **Die Policy beschränkt nicht, dass `rolle` unverändert bleibt.**
3. **Kein Trigger blockt es** — die einzigen `BEFORE UPDATE`-Trigger auf `profiles` sind `profiles_whatsapp_invalidate` (`OF telefon` — feuert nur bei Telefon-Änderung) und `update_profiles_updated_at` (setzt nur `updated_at`).
4. **`is_admin()` ist `SECURITY DEFINER` und liest `profiles.rolle`** (`SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND rolle = 'admin')`). Sobald `profiles.rolle = 'admin'` → `is_admin()` = `true` überall → alle `is_admin()`-gegateten RLS-Policies öffnen sich + die `admin/layout.tsx`-Rollen-Weiche (`profile.rolle !== 'admin'`) passt → Admin-UI + voller DB-Zugriff. (`is_staff()` analog.)
5. **Kein DB-Trigger erzeugt die `profiles`-Zeile** — es gibt **keinen** `handle_new_user`-Trigger auf `auth.users`; die Zeile wird vom App-Code beim Signup angelegt (über die `„Profil erstellen"`-INSERT-Policy, `roles={public}`, `WITH CHECK true`). `rolle` hat Default `'kunde'::user_role`, ist aber beim INSERT frei setzbar.

**Exploit:** Angreifer registriert sich regulär (öffentlicher Signup → echte `auth.users`-Zeile + eine `profiles`-Zeile mit `rolle='kunde'`). Dann, mit dem eigenen JWT + dem öffentlichen `anon`-Key, **ein HTTP-Request**:
```
PATCH https://paizkjajbuxxksdoycev.supabase.co/rest/v1/profiles?id=eq.<eigene-uid>
apikey: <anon-key>
Authorization: Bearer <eigenes-jwt>
Content-Type: application/json
{"rolle":"admin"}
```
→ Rolle wird `admin`. → Voller Admin-Zugriff auf App + DB. **Account-Takeover-to-Admin in einem Request.** Funktioniert komplett am App-Layer vorbei (deshalb hat der Code-Audit es nicht gesehen — die Server-Actions whitelisten `rolle` zwar, aber der direkte PostgREST-Pfad ignoriert die Server-Actions).

> *Hinweis:* Auch die `„Profil erstellen"`-INSERT-Policy (`roles={public}`, `WITH CHECK true`, column-level `INSERT` auf `rolle` für `anon`) erlaubt theoretisch, eine `profiles`-Zeile mit `rolle='admin'` für eine beliebige `auth.users(id)` anzulegen — praktisch begrenzt, weil zum Signup-Zeitpunkt die Zeile schon vom App-Code mit `'kunde'` angelegt wird (PK-Konflikt). Der UPDATE-Vektor ist der saubere Exploit.

**Fix (urgent, eine Migration):**
```sql
-- profiles.rolle darf nicht direkt via Data-API gesetzt/geändert werden
REVOKE UPDATE (rolle), INSERT (rolle) ON public.profiles FROM anon, authenticated;
```
*Voraussetzung prüfen:* Der Signup-Flow setzt beim INSERT entweder `rolle` explizit (→ braucht dann `INSERT (rolle)`; alternativ: INSERT ohne `rolle` → kriegt den `'kunde'`-Default, dann ist das `REVOKE INSERT (rolle)` ok) — und Rollen-Änderungen (Admin macht jemanden zum SV/KB) müssen über den **service-role-Client** laufen (nicht den User-Context-Client), sonst bricht das `REVOKE`. Wenn der Signup-Code den User-Context-Client + explizites `rolle='kunde'` nutzt: entweder auf Default umstellen oder Signup-Insert auf service-role. — *Das ist vor dem Deploy der Migration zu verifizieren* (`grep -rn "from('profiles').insert\|from('profiles').update.*rolle" src`).

---

## 2 · 🔴 HIGH — Systemisches „update-deine-eigene-Zeile = Mass-Assignment von Privileg-Spalten"

Dieselbe Mechanik wie #1, auf weiteren Tabellen — jede „self-update"-Policy + voller column-GRANT = User kann Privileg-Felder seiner eigenen Zeile setzen:

| Tabelle | Policy | Was ein User direkt via PostgREST setzen könnte |
|---|---|---|
| `makler` | `makler_self_update` `UPDATE` `USING (user_id = auth.uid())`, `WITH CHECK` defaultet auf USING | `status='aktiv'` (**Aktivierungs-Gate umgehen** — ein `pending`-Makler schaltet sich selbst frei → kommt am `/makler/pending`-Redirect vorbei), `provision_betrag_komplett_netto`/`_nur_gutachter_netto` (**eigene Provisionssätze hochsetzen**), `provision_aktiv`, Bank-Daten, IHK-Nr. |
| `sachverstaendige` | `sv_update_own` `UPDATE` `USING (profile_id = auth.uid())`, `WITH CHECK` defaultet auf USING | `verifiziert=true` (**Verifizierungs-Gate umgehen**), `werbebudget_guthaben_netto` (**kostenloses Lead-Budget**), `ist_aktiv=true` (Dispatchability), `use_custom_branding=true`, Paket-/Tarif-Felder. Der App-Layer-Befund (`gutachter/profil/actions.ts` lässt `ist_aktiv` via Checkbox togglen) ist nur die Spitze — direkt setzbar ist alles. |
| `profiles` | siehe #1 | `rolle='admin'` (CRITICAL) |

**Fix:** column-level `REVOKE UPDATE (<privileg-spalten>) ON <tabelle> FROM anon, authenticated` für die Privileg-Spalten (`makler`: `status`, `provision_betrag_*`, `provision_aktiv`, `aktiviert_am`, `gesperrt_*`; `sachverstaendige`: `verifiziert`, `ist_aktiv`, `werbebudget_*`, `use_custom_branding`, Paket-Felder) — Änderungen daran nur via service-role-Client (Admin-Actions). Alternativ `BEFORE UPDATE`-Trigger, die Änderungen an Privileg-Spalten durch Nicht-Admins blocken. **Systemisch:** ein Review *aller* „self-update"-Policies auf „welche Spalten darf der Owner setzen, welche nicht" — und für die schützenswerten ein column-REVOKE.

---

## 3 · 🔴 HIGH — `flow_links` ist via `anon`-Key voll lesbar (alle Magic-Link-Token im Klartext) + schreibbar

- **SELECT-Policy „Anon can read flow_links by token"** — `cmd=SELECT roles={anon} USING (true)`. Der Name sagt „by token", die `qual` ist aber schlicht `true` → mit dem `anon`-Key liefert `SELECT * FROM flow_links` **alle Zeilen**: `token` (im Klartext gespeichert — anders als `airdrop_invitations`, das `token_hash` nutzt), `lead_id`, `fall_id`, `expires_at`, `service_typ`. Mit den Tokens → Zugriff auf den `/flow/[token]`-/`/schaden-melden?t=`-Flow für jeden Lead/Fall (= komplette Lead-PII).
- **UPDATE-Policy „Anon can update flow_links"** — `cmd=UPDATE roles={anon} USING (true) WITH CHECK (true)` → `anon` kann jede `flow_links`-Zeile beliebig modifizieren (Token rotieren, `expires_at` setzen, `abgeschlossen_am` fälschen).
- **„Authenticated can manage flow_links"** — `cmd=ALL roles={authenticated} USING (true) WITH CHECK (true)` → jeder eingeloggte User kann jede `flow_links`-Zeile lesen/ändern/**löschen**.

**Fix:** Die SELECT-Policy token-bindend machen (`USING (token = current_setting('request.headers.x-flow-token', true))` o.ä.) **oder** ganz entfernen — der App-Code löst Token serverseitig über den service-role-Client auf, der `anon`-SELECT ist nicht nötig. Die broad `anon`-UPDATE-Policy entfernen (Updates auf `flow_links` laufen über service-role). „Authenticated can manage" → auf Admin/Staff scopen oder entfernen. Plus L1 (Token-Hashing aufs `airdrop_invitations`-Pattern vereinheitlichen) bleibt relevant.

---

## 4 · 🟠 HIGH — Storage: 4 sensible Buckets sind `public=true` mit nicht-gescopten SELECT-Policies

`storage.buckets`: **`public=true`** für `avatare`, `profile`, `gutachter-logos` (ok — sollen öffentlich sein) **und für `fall-dokumente`, `gutachten`, `schadensfotos`, `unterschriften`** (problematisch). `public=false` (ok) für `abrechnungen`, `abrechnungen-pdf`, `db-backups`, `gutachten-pdfs`, `kanzlei`, `vertraege`.

| Bucket | SELECT-Policy | Folge |
|---|---|---|
| `fall-dokumente` | „Auth users can read fall-dokumente" `USING (bucket_id='fall-dokumente' AND auth.role()='authenticated')` + „Flow anon can read fall-dokumente flow path" `USING (bucket_id='fall-dokumente' AND name LIKE 'flow/%')` für `{anon,authenticated}` | **Jeder eingeloggte User kann alle Fall-Dokumente listen+lesen** (Pfad `<fallId>/<file>`); `anon` kann den ganzen `flow/*`-Teilbaum lesen. Bucket `public=true` → wer einen Pfad kennt, liest die Datei auch via `/storage/v1/object/public/fall-dokumente/...` ohne Auth. |
| `gutachten` | `gutachten_select` `USING (bucket_id='gutachten')` für `authenticated` | Jeder eingeloggte User listet+liest **alle Gutachten-Dateien**. |
| `schadensfotos` | `schadensfotos_select` `USING (bucket_id='schadensfotos')` für `authenticated` | Jeder eingeloggte User listet+liest **alle Schadensfotos**. |
| `unterschriften` | `unterschriften_select` `USING (bucket_id='unterschriften')` für `authenticated` + **„Anon can read own unterschriften"** `USING (bucket_id='unterschriften')` für `anon` (Name lügt — `qual` ist nur der Bucket) + **2× „Anon … upload unterschriften"** INSERT für `anon` `WITH CHECK (bucket_id='unterschriften')` | Jeder eingeloggte User listet+liest **alle Vollmachten-/Abtretungs-Signaturen**; **`anon` kann sie auch lesen** und **beliebige Dateien in den Bucket hochladen**. |

**Fix:** `fall-dokumente`/`gutachten`/`schadensfotos`/`unterschriften` auf `public=false` (`UPDATE storage.buckets SET public=false WHERE id IN (...)`), die Bucket-only-SELECT-Policies durch per-Fall-/per-Owner-gescopte ersetzen (z.B. `USING (bucket_id='gutachten' AND can_access_fall((storage.foldername(name))[1]::uuid))`), im App-Code auf `createSignedUrl(path, ttl)` umstellen. Die `anon`-Policies auf `unterschriften` + `fall-dokumente/flow/*` auf den konkreten Lead-Pfad scopen statt nur auf den Bucket. (= M3 aus dem Security-Audit, jetzt auf Policy-Ebene belegt.) Die toten Policies für `bucket_id='dokumente'` (Bucket existiert nicht) löschen.

---

## 5 · 🟠 — `abrechnungen` (Rechnungen) faktisch offen für jeden eingeloggten User

`abrechnungen` hat die Policy `abrechnungen_auth`: `cmd=ALL roles={public} USING (auth.role() = ANY(['authenticated','service_role']))`. Das ist nicht *literal* `true` (deshalb hat der Advisor es nicht als `rls_policy_always_true` geflaggt), aber `auth.role()='authenticated'` trifft auf **jeden** eingeloggten User zu → **jeder eingeloggte User kann alle `abrechnungen`-Zeilen lesen, ändern, löschen** (Rechnungsdaten). Code-Layer-Befund: alle Writes laufen über `createAdminClient()` — aber die DB-Policy ist offen, der direkte PostgREST-Pfad funktioniert. **Fix:** auf Admin/Finance-Rollen scopen (`USING (is_staff() AND ...)` o.ä.). *(Analog: `finance_eintraege` hat `ALL USING (true) WITH CHECK (true)` für `authenticated` — bereits als M5 geführt.)*

---

## 6 · 🟠 — Audit-Trail- & Notification-Spoofing (anon/authenticated INSERT mit `WITH CHECK true`)

| Tabelle | Policy | Rolle | Folge |
|---|---|---|---|
| `phase_transitions` | `phase_transitions_service_insert` INSERT `WITH CHECK true` | **`public`** (= anon!) | Name lügt — jeder, auch `anon`, kann gefälschte Phase-Wechsel-Audit-Zeilen einfügen → Audit-Trail-Manipulation. |
| `mitteilungen` | `mitteilungen_insert` INSERT `WITH CHECK true` | **`public`** (= anon!) | Jeder, auch `anon`, kann beliebige Mitteilungen für beliebige User einfügen → Phishing-Schleuder. |
| `lead_historie` | `Authenticated users can insert lead_historie` INSERT `WITH CHECK true` + `… read lead_historie` SELECT `USING true` | `authenticated` | Jeder eingeloggte User kann gefälschte Lead-Historie-Einträge einfügen UND alle 271 Lead-Historie-Zeilen lesen. |
| `benachrichtigungen` | `System insert` INSERT `WITH CHECK true` | `authenticated` | Jeder eingeloggte User kann In-App-Benachrichtigungen für beliebige User einfügen (666 Rows existieren). |

**Fix:** INSERT-Policies auf `service_role` einschränken (die App-Pfade laufen über `createServiceClient()`), bzw. owner-bindende `WITH CHECK` (`empfaenger_user_id = auth.uid()` o.ä.) wo User selbst einfügen dürfen. (= M4 + RLS-Audit-Layer-2-#1.)

---

## 7 · 🟡 — `regulierungs_klassifizierung` / weitere always-true (bestätigt)

`regulierungs_klassifizierung`: `authenticated` INSERT (`WITH CHECK true`) + SELECT (`USING true`) + UPDATE (`USING/CHECK true`) — sollte Admin/KB-only sein (= M6, RLS-Audit-Layer-2-#5). **Fix:** `USING (is_staff())` o.ä.

Lookup-Tabellen mit `SELECT USING true` (akzeptabel, nur notiert): `bkat_tatbestaende`, `branchen_benchmarks`, `leadpreise_tabelle`, `plz_geo`, `versicherungen`, `vertragsvorlagen`, `onboarding_felder`/`_phasen`, `incentives`. — `vertragsvorlagen` (PDF-Templates inkl. Provisionsvereinbarung) + `leadpreise_tabelle` (Lead-Preise) sind für *jeden* eingeloggten User lesbar (mild leaky Business-Daten); `incentives` SELECT für `public` (= anon). Niedrige Priorität, aber Business-Daten — ggf. auf `authenticated`/`is_staff()` einschränken.

Anon-Funnel-Submit-Policies (`leads`/`faelle`/`schadenspositionen`/`gutachter_finder_anfragen` INSERT für `anon`) — akzeptabel (Funnel legt neue Leads/Fälle an).

---

## 8 · M2-Korrektur — Finanz-Server-Actions: kleineres Risiko als gedacht

Aus dem Security-Audit (M2): `admin/finance/(hub)/provisionen/actions.ts` ohne `requireRole`-Guard → „jeder eingeloggte User könnte Maik-Provisionen pushen". **Live-Befund:** `provisionen_maik` hat die Policy `Mitarbeiter provisionen_maik` `cmd=ALL USING (rolle IN ('admin','kundenbetreuer','dispatch'))`. Da die Actions den User-Context-Client nutzen → RLS greift → ein `kunde` kann es **nicht** ausnutzen. **Aber:** ein `kundenbetreuer` oder `dispatch` user *kann* — RLS lässt sie schreiben, obwohl die Action admin-only gemeint ist. → M2 bleibt ein echtes (aber kleineres) Finding: KB/Dispatch können Maik-Provisionen manipulieren, nicht beliebige User. **Fix bleibt:** `requireRole(['admin'])` in den Actions ergänzen (Defense-in-Depth + korrekte Intent-Durchsetzung).

---

## 9 · Bestätigt unverändert ggü. `rls-permissions-audit.md` (12.05.)

201 Advisor-Lints: 2 ERROR (`rls_disabled_in_public` + `sensitive_columns_exposed`, beide **`conversion_events`** — RLS aus, `session_id` anon-les-/schreibbar = H2 aus dem Security-Audit; Fix-SQL: `ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;` + INSERT-Policy für `anon`, SELECT-Policy nur Admin); 16× `rls_policy_always_true` (siehe #3/#6/#7 — alle bestätigt); 6× `public_bucket_allows_listing` (siehe #4); 61× `function_search_path_mutable` (SECURITY DEFINER ohne `SET search_path = ''` → Schema-Injection-Risiko — Hygiene-Sammel-Ticket); 54+54× SECURITY DEFINER `anon`/`authenticated`-executable (Hygiene); 1× `extension_in_public` (`btree_gist` — best practice eigenes Schema); 1× `auth_leaked_password_protection` aus (1-Klick-Toggle im Dashboard); 6× `rls_enabled_no_policy` (5× AAR-613 service-role-only OK + `kunde_gutachten_requests` — auch OK, service-role-only).

**Kein** `security_definer_view`-Lint → keine RLS-bypassenden Views (gut). **Keine** RLS-Policy referenziert `user_metadata`/`raw_user_meta_data` (gut — die unsichere Supabase-Falle ist hier nicht gestellt; das H3 aus dem Security-Audit über `konvertiere-anfrage-zu-fall.ts` ist eine *App*-seitige `user_metadata`-Nutzung, aber **kein** `handle_new_user`-Trigger propagiert das in `profiles.rolle` — es gibt schlicht keinen solchen Trigger; H3 ist damit weitgehend gegenstandslos. Der reale Privilege-Escalation-Vektor ist #1 oben — direkter `profiles.rolle`-UPDATE, nicht `user_metadata`).

---

## 10 · Priorisierte Maßnahmen

### 🔴 Sofort (eine Migration, dann ASAP deployen)
1. **#1 CRITICAL** — `REVOKE UPDATE (rolle), INSERT (rolle) ON public.profiles FROM anon, authenticated;` (nach Verifikation des Signup-Insert-Pfads — ggf. Signup auf service-role-Client oder auf den `'kunde'`-Default umstellen; Admin-Rollenänderungen auf service-role).
2. **#2** — column-`REVOKE UPDATE (...)` für die Privileg-Spalten von `makler` (`status`, `provision_betrag_*`, `provision_aktiv`, `aktiviert_am`, `gesperrt_*`) und `sachverstaendige` (`verifiziert`, `ist_aktiv`, `werbebudget_*`, `use_custom_branding`, Paket-Felder) von `anon, authenticated`.
3. **H2 / `conversion_events`** — `ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;` + Policies (anon INSERT, admin SELECT).

### 🟠 Bald (Migrationen)
4. **#3 `flow_links`** — `anon`-SELECT token-bindend machen oder löschen; `anon`-UPDATE löschen; „Authenticated can manage" auf Staff scopen. + L1 (Token-Hashing aufs `airdrop_invitations`-Pattern).
5. **#4 Storage** — `fall-dokumente`/`gutachten`/`schadensfotos`/`unterschriften` → `public=false`; SELECT-Policies per-Fall/per-Owner scopen; App auf `createSignedUrl()`; `unterschriften`-/`flow/*`-`anon`-Policies auf den Lead-Pfad scopen; tote `dokumente`-Bucket-Policies löschen.
6. **#5 `abrechnungen`** + `finance_eintraege` — `USING (is_staff() AND ...)` statt `auth.role()='authenticated'` / `true`.
7. **#6 Audit/Notification-Spoofing** — `phase_transitions`/`mitteilungen`/`lead_historie`/`benachrichtigungen` INSERT-Policies auf `service_role` einschränken bzw. owner-bindende `WITH CHECK`.
8. **#7 `regulierungs_klassifizierung`** — auf `is_staff()` scopen. `vertragsvorlagen`/`leadpreise_tabelle`/`incentives` ggf. auf `authenticated`/`is_staff()`.

### 🟡 Hygiene-Backlog
9. M2-Guard (`requireRole(['admin'])` in den Finanz-Actions). 61× `function_search_path_mutable` → `ALTER FUNCTION … SET search_path = ''`. 54+54× SECURITY DEFINER anon/auth-executable → `REVOKE EXECUTE FROM anon, authenticated` wo nicht-trivial. `auth_leaked_password_protection`-Toggle. `btree_gist` ins eigene Schema. `exec_sql`-RPC-Grants prüfen (Code-Audit L12).

### Methodisch — den Default abdrehen
Der saubere Fix für die strukturelle Wurzel (#0): **`REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;` + dann gezielt nur die Tabellen/Spalten zurück-granten, die client-seitig wirklich geschrieben werden** (die wenigen Funnel-Inserts, die `self_update`-Spalten ohne Privileg-Charakter, etc.). Großes Migrations-Projekt (jeder client-seitige Write muss inventarisiert werden) — aber es macht „RLS-Lücke = direkt ausnutzbar" zu „RLS-Lücke + GRANT-Lücke nötig". Mid-Term-Ticket; bis dahin sind die punktuellen Fixes oben das Wichtige.

---

*Querverweis: `SECURITY-AUDIT-12.05.2026.md` (Code-Layer — Master-Doc), `rls-permissions-audit.md` (DB-Layer aus dem Advisor, dieses Doc ergänzt es um die Policy-/GRANT-/Trigger-Details + die ausnutzbaren Konsequenzen). Dieses Doc sollte als #1 in den Master-Maßnahmenplan aufgenommen werden.*

*Privates Repo; dieser Report dokumentiert eine aktiv ausnutzbare CRITICAL-Lücke (#1). Empfehlung: #1 + #2 + H2 als erste Migration sofort, vor allem anderen.*
