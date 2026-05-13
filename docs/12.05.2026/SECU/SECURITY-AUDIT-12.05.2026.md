# Security-Audit Claimondo-App — 12.05.2026 (konsolidiert) · ✅ DB-LAYER ABGESCHLOSSEN

> **Status (13.05.2026):** DB-/RLS-Layer-Items (Severity-Tabelle §1–§3 für DB) komplett via Folge-Audit `docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13-DONE.md` bearbeitet — finance_eintraege, audit-spoof, lead_historie, reg_klass, search_path, secdef-revoke, initplan-optimize, fk-indexes, permissive-konsolidierung (11 PRs gemerged). **App-/Route-/Code-Layer-Items** dieses Audits (XSS/Injection/Secrets/Webhooks/Server-Actions etc.) sind **NICHT** in der 13.05.-Welle enthalten und bleiben offen — Eigner: separate Sessions/Tickets.

**Master-Dokument.** Konsolidiert: (a) Code-Audit per 3 parallelen Senior-Security-Subagenten (Lese-Analyse, kein DB-Zugriff) — Bereiche Auth/Token/RLS-Migrations · API-Routes/Webhooks/Crons/Server-Actions · XSS/Injection/Secrets/Integrationen; (b) den separaten **RLS-/Permissions-Audit vom selben Tag** (`rls-permissions-audit.md` — basiert auf Supabase Security Advisor mit 201 Lints + `list_tables` + Permission-Matrix-Drift-Analyse). Beide Audits decken komplementäre Schichten ab: der RLS-Audit hat den **DB-Layer** (Live-Advisor-Daten), der Code-Audit den **App-/Route-/Code-Layer**.

> **Caveat:** Das Basis-DB-Schema (ursprüngliche `ENABLE ROW LEVEL SECURITY` + `GRANT`s) liegt nicht im Repo (Squash-Baseline-Placeholder-Migrations) — die DB-Findings unten stammen daher aus dem **Live-Supabase-Advisor** (RLS-Audit), nicht aus dem Code. Wo der RLS-Audit „PRÜFEN" sagt, ist das ein offener Punkt, der einen erneuten Live-Schema-Blick braucht.

> **Update 2026-05-12 — Live-Schema-/RLS-Audit durchgeführt:** siehe `LIVE-SCHEMA-RLS-AUDIT-12.05.2026.md` (alle „PRÜFEN"-Punkte aufgelöst, Policy-/GRANT-/Trigger-Ebene direkt geprüft). **Finding #1 daraus — CRITICAL Privilege-Escalation (jeder eingeloggte User konnte via direktem `PATCH /rest/v1/profiles?id=eq.<own-uid>` `{"rolle":"admin"}` Admin werden, komplett am App-Layer vorbei) — ist GEFIXT** (Migration `20260512140559_aar_profiles_rolle_lock`, Trigger `guard_profiles_rolle` auf `profiles`, live auf Prod + verifiziert). Offene Folge-Fixes (#2 makler/sv-Privileg-Spalten via Mass-Assignment, H2 `conversion_events`-RLS, `flow_links` anon-lesbar/-schreibbar, 4 Storage-Buckets `public=true`, `abrechnungen` offen, Audit-Spoofing): §10 dort.

---

## Severity-Übersicht

| # | Severity | Layer | Titel | Fix-Stelle |
|---|---|---|---|---|
| H1 | 🔴 HIGH | Code | Twilio-Inbound-Webhook ohne Signatur-Verifizierung | `api/webhooks/twilio/inbound/route.ts` |
| H2 | 🔴 HIGH | DB | `conversion_events` — RLS disabled, `session_id` anon-lesbar/-schreibbar | Migration |
| H3 | 🔴 HIGH *(unbestätigt)* | App/DB | `profiles.rolle` ggf. aus `user_metadata` propagiert → Privilege-Eskalation beim Signup | `handle_new_user`-Trigger prüfen |
| M1 | 🟠 MEDIUM | Code | IDOR — `/api/copilot/briefing` leakt Fall-Daten an jeden eingeloggten User | `api/copilot/briefing/route.ts` |
| M2 | 🟠 MEDIUM | Code/App | Finanz-Server-Actions ohne Rollen-Guard + ~40 % aller Server-Actions ohne strukturierten Guard | `admin/finance/**`, viele `actions.ts` |
| M3 | 🟠 MEDIUM | DB | Storage-Buckets `gutachten`/`schadensfotos`/`unterschriften` erlauben File-Listing → Enumeration | Migration + Signed-URLs |
| M4 | 🟠 MEDIUM | App/DB | `benachrichtigungen`/`mitteilungen` — `createNotification()` ohne Ownership-Check (18 Call-Sites) | `src/lib/notifications.ts` |
| M5 | 🟠 MEDIUM | DB | 16 Always-True-RLS-Policies (`USING (true)`/`WITH CHECK (true)`) — Magic-Link-Updates ohne Token-Filter, `finance_eintraege`/`flow_links` Auth-manage-ALL, Audit-Spoofing-INSERTs | Migrationen |
| M6 | 🟠 MEDIUM | App | `regulierungs_klassifizierung` Admin/KB-only nicht im Code enforced (DB: Authenticated INS/UPD) | `dispatch-fall-actions.ts` |

LOW/Hardening: ~25 Punkte (Token-Hashing, SVG-Sanitization, Filter-Escaping, Webhook-Fail-Open, `exec_sql`-RPC, 169 Background-Lints …) — Liste unten.

---

## HIGH

### H1 — Twilio-Inbound-Webhook ohne `X-Twilio-Signature`-Prüfung
**Datei:** `src/app/api/webhooks/twilio/inbound/route.ts` (~Z. 74); analog `src/app/api/webhooks/twilio/status/route.ts` (geringere Auswirkung). · **Layer:** Code · **Confidence:** 9 (von zwei unabhängigen Audit-Pässen).
**Befund:** Der WhatsApp-Inbound-Webhook parst `req.formData()` und handelt **ohne jede Signatur-Verifizierung** (die `TWILIO_AUTH_TOKEN`-Referenzen dienen nur dem Media-Download). Er ist der schreib-intensivste Webhook der App: nutzt den **Supabase-Admin-Client (RLS-Bypass)** für Inserts/Updates auf `whatsapp_inbound_messages`, `gutachter_termine.status` (→ `'bestaetigt'`), `timeline`, `fall_dokumente`, `leads.*` (zb1_status, polizeibericht_status, bevorzugter_kanal, OCR-Fahrzeugdaten), `benachrichtigungen`, triggert **ausgehende WhatsApp-Sends** an die `From`-Nummer und lädt bei `NumMedia≥1` die `MediaUrl{n}` herunter (Host/Pfad vom Request → SSRF-Vektor). Die Schwester-Route `twilio/inbound-kb-whatsapp/route.ts` **validiert** korrekt — hier wurde es vergessen.
**Exploit:** Angreifer kennt die URL → POST `From=whatsapp:+49<Opfer>&MessageSid=<random>&Body=JA` → `matchInboundToFall` ordnet die Nummer einem offenen Lead/Fall mit kommendem Termin zu → Termin force-bestätigt + Bestätigungs-WhatsApp + Timeline-Eintrag mit Angreifer-Text in der Fallakte + KB-Benachrichtigung. Variieren von `Body`/`NumMedia`/`MediaContentType{n}` → Timeline-Pollution, `bevorzugter_kanal`-Manipulation, Fake-Dokument an fremdem Lead, beliebige Outbound-WhatsApp vom Firmen-Account, Server-Side-Fetch beliebiger URLs.
**Fix:** Vor jeder Verarbeitung `X-Twilio-Signature` gegen `TWILIO_AUTH_TOKEN` + Request-URL + sortierte Form-Params validieren (`twilio.validateRequest()` bzw. die vorhandene `validateTwilioSignature`-Logik aus `inbound-kb-whatsapp/route.ts` wiederverwenden); ungültig/fehlend → 403. Gleiches für `webhooks/twilio/status`.

### H2 — `conversion_events` — RLS deaktiviert, sensible Spalte exponiert
**Tabelle:** `public.conversion_events` (seit 2026-05-12, Funnel-v3-Drop-off-Tracking). · **Layer:** DB · **Quelle:** Supabase Security Advisor ERROR #1.
**Befund:** RLS ist nicht aktiviert → Anon-Key kann Funnel-Daten **lesen UND injizieren**. `session_id` ist eine sensible Spalte.
**Fix (Migration via `npx supabase migration new`):**
```sql
ALTER TABLE public.conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_funnel" ON public.conversion_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "admin_read_funnel"  ON public.conversion_events FOR SELECT TO authenticated USING (is_admin());
```

### H3 *(unbestätigt — verifizieren!)* — `profiles.rolle` evtl. aus `user_metadata` → Privilege-Eskalation
**Stelle:** `src/lib/actions/konvertiere-anfrage-zu-fall.ts:79-89` setzt einen Auth-User mit `user_metadata.rolle` ohne Server-Validierung. · **Layer:** App/DB · **Quelle:** RLS-Audit Drift-Finding #2.
**Befund:** Wenn ein DB-Trigger (`handle_new_user()` o.ä.) `profiles.rolle` aus `raw_user_meta_data` propagiert, kann ein Client beim Signup `rolle='admin'` mitschicken → sofortige Privilege-Eskalation. **Status: nicht verifiziert** — der Trigger liegt nicht im Repo (Squash-Baseline). Wenn bestätigt, ist das HIGH.
*(Gegen-Befund aus dem Code-Audit: die regulären Profile-Update-Actions [`kunde/profil`, `gutachter/profil`, `lib/actions/sv/update-own-profile`] nutzen explizite Feld-Whitelists — `rolle` ist dort NICHT schreibbar. Der Vektor wäre also rein der Signup-/Anfrage-Konversions-Pfad, falls der Trigger `rolle` durchreicht.)*
**Fix:** `handle_new_user`-Trigger lesen → falls er `rolle` aus `user_metadata` übernimmt: Trigger fixen (Default `kunde`, `rolle` nur via Admin-geguarderten RPC erhöhbar), und alle Signup-/Konversions-Routes auf „kein `user_metadata.rolle`" prüfen.

---

## MEDIUM

### M1 — IDOR: `/api/copilot/briefing` leakt Fall-Daten an jeden eingeloggten User
**Datei:** `src/app/api/copilot/briefing/route.ts` (~Z. 11) → `src/lib/copilot/briefing.ts` (`loadBriefingContext`, ~Z. 42). · **Layer:** Code · **Confidence:** 8.
**Befund:** Prüft nur `getUser()` (= irgendein eingeloggter User), nimmt dann den vom Client gelieferten `fallId`/`leadId` und liest per **`createAdminClient()` (RLS-Bypass)**: `v_faelle_mit_aktuellem_termin`, verknüpfter `leads`-Datensatz (Kundenname), `gutachten_betrag`, Fall-Status, Stepper-Phase, **letzte 3 `nachrichten` des Falls**, neueste `fall_summaries`-KI-Zusammenfassung — streamt daraus ein LLM-Briefing zurück. **Kein Ownership-/Rollen-Check auf `fallId`.** Jeder Account (Kunde/SV/Makler/Kanzlei) kann Briefing-Daten zu jedem Fall ziehen (UUID-gated).
**Fix:** `requireRole(['admin','dispatch','kundenbetreuer'])` (das Briefing ist ein KB/Dispatch-Tool) oder `kundenbetreuer_id`/`sv_id`/`makler_id` gegen den User checken oder den Read mit dem User-Context-Client machen (RLS greift).

### M2 — Server-Actions ohne strukturierte Auth-Guards (Finanz-Actions akut + ~40 % flächig)
**Layer:** Code/App · **Confidence:** 8 (Fehlen des Guards) — reale Auswirkung RLS-abhängig · **Quelle:** Code-Audit + RLS-Audit Drift-Finding #4/Fix 5.
**Akut (Finanz-Integrität):** `src/app/admin/finance/(hub)/provisionen/actions.ts` — `setCpl`/`confirmProvision`/`markMonthAsPaid`/`reverseProvision` prüfen nur `if (!user)`, **nicht** Admin. `admin/layout.tsx` schützt keine Server-Actions (eigenständig per POST aufrufbar). `confirmProvision` flippt `provisionen_maik` `pending→confirmed` (der `maik-monatsabrechnung`-Cron zahlt dann alle `confirmed`-Zeilen aus), `markMonthAsPaid` bulk `confirmed→paid`, `reverseProvision` voided. Gleiche Klasse: `src/app/admin/finance/actions.ts` `erfasseEinzahlung` (erhöht `sachverstaendige.werbebudget_guthaben_netto` für beliebigen `sv_id`).
**Flächig:** Stichprobe von 30 Actions → 10 ohne Guard (nur `throw` bei fehlendem User). Konkrete Beispiele: `src/lib/actions/create-lead.ts:19`, `src/lib/actions/admin-kalender.ts:31` (`getKalenderTermine` ohne `requireRole(['admin'])`), `src/lib/actions/call-actions.ts:15` (`getCallBriefing`), `src/lib/actions/makler-settings.ts:44` (`updateMaklerProfil`), `src/app/.../dispatch-fall-actions.ts:21` (`requireAuth()` aber kein `requireRole`). Auch: `src/lib/actions/signup-and-convert.ts` (`signupAndConvertLead`/`loadLeadForSignup` — beliebiger `leadId`, keine Ownership, gibt Lead-Email zurück, konvertiert beliebigen Lead in einen dem Caller gehörenden Fall), `src/lib/actions/update-lead-{fotos,gegner,zb1-manual}.ts` (beliebiger `leadId`, kein Ownership-Check, hängt komplett an der permissiven `leads`-RLS).
**Exploit:** Beliebiger eingeloggter User (z. B. `kunde`) ruft `confirmProvision('<id>')`/`markMonthAsPaid('2026-04')` → Provisionen in die Auszahlungs-Pipeline; `getKalenderTermine()` → fremde Admin-Kalender-Daten; etc.
**Fix:** `const guard = await requireRole(['…']); if (!guard.success) return …` als erste Zeile **jeder** Server-Action; Konvention durchziehen; idealerweise eine Lint-Rule (`'use server'`-File ohne Guard-Call = Build-Warning). RLS auf `provisionen_maik`/`sachverstaendige`/`leads` als Defense-in-Depth verifizieren.

### M3 — Storage-Buckets erlauben File-Listing (Enumeration sensibler Inhalte)
**Layer:** DB · **Quelle:** RLS-Audit (Storage-Bucket-Listing) + Code-Audit L-Punkt.
**Befund:** Public-Buckets erlauben aktuell das **Listing aller Files** (nicht nur Object-URL-Access):
| Bucket | Sensibilität | Naming | Listing-Impact |
|---|---|---|---|
| `gutachten` | hoch (Gutachten-PDFs) | `<fallId>/<file>` | `fallId`-Enumeration |
| `schadensfotos` | hoch (private Unfallfotos) | unklar | Bild-Listing |
| `unterschriften` | hoch (Vollmachten-Signaturen) | `<fallId>/<…>` | Consent-Enumeration: wer hat unterschrieben |
| `avatare`, `gutachter-logos`, `profile` | niedrig | – | kosmetisch |
Zusätzlich (Code-Audit, Migration `20260422012537_aar714_flow_anon_upload_rls.sql`): `anon` darf alle Objekte unter `fall-dokumente/flow/*` **lesen UND schreiben** (`name LIKE 'flow/%'`); Pfade `flow/schadensfotos-lead/<lead_id>/…` → wer eine Lead-UUID kennt, liest fremde Schadensfotos/Unterschriften.
**Fix:** Public-SELECT-Policy auf `storage.objects` für die sensiblen Buckets entfernen, durch owner/admin-gescopte Policy ersetzen, in der App auf `createSignedUrl(path, 3600)` umstellen. `flow/*`-Anon-Policy verschärfen (auf den konkreten Lead-Pfad scopen oder Server-Routing).

### M4 — `createNotification()` ohne Ownership-Check (`benachrichtigungen`/`mitteilungen`)
**Datei:** `src/lib/notifications.ts` — `createNotification(targetUserId, …)` nutzt `createServiceClient()` ohne Auth-Guard, 18 Call-Sites ohne Ownership-Validierung (`gutachter-waitlist.ts:130`, `api/twilio/inbound-kb-whatsapp/route.ts:169`, …). DB-seitig: `benachrichtigungen`/`mitteilungen` haben Always-True-INSERT-Policies, kein Read-Filter. · **Layer:** App/DB · **Quelle:** RLS-Audit Drift-Finding #1.
**Befund/Exploit:** Server-Code (und bei einem kompromittierten/ungeguarderten Endpoint auch ein Angreifer) kann beliebige User mit beliebigen Mitteilungen „spammen" → Phishing-Schleuder. Kein Read-Filter heißt: ein User könnte fremde Mitteilungen lesen, falls er die Tabelle direkt queriet.
**Fix:** Pre-Check in `createNotification()`: `requireAdmin() || currentUserId === targetUserId || isSystemContext(reason)`. Read-Policy ergänzen: `user_id = auth.uid() OR is_admin()`. 18 Call-Sites auf System-Trigger-vs-User-Action prüfen.

### M5 — 16 Always-True-RLS-Policies
**Layer:** DB · **Quelle:** RLS-Audit Layer-1.
- **OK (Anon-Funnel-Submit):** `leads`/`faelle`/`schadenspositionen`/`gutachter_finder_anfragen` — INSERT-only, akzeptabel (Filter trotzdem prüfen).
- **Verdächtig (Magic-Link-Updates ohne Token-Filter):** `faelle` „Anon sign faelle" (UPDATE), `leads` „Flow anon update leads" (UPDATE), `flow_links` „Anon can update flow_links" (UPDATE) — Anon kann beliebige Rows updaten; sollte einen Token-Hash-Filter haben (`USING (token_hash = encode(digest(current_setting('request.headers.x-token', true),'sha256'),'hex'))`) oder Server-Routing-only.
- **Hoch-Risk (Authenticated-Manage-ALL):** `finance_eintraege` (ALL — aktuell durch all-Writes-via-Admin-Client kompensiert, aber DB-Recht ist falsch), `flow_links` (ALL — User A kann Link von User B löschen/ändern), `regulierungs_klassifizierung` (INS/UPD — sollte Admin/KB), `lead_historie` (INSERT — Audit-Spoofing), `phase_transitions` (INSERT „Service insert (true)" — Audit-Trail-Manipulation).
- **Spam-Risk (Insert-ohne-Ownership):** `benachrichtigungen`/`mitteilungen` (siehe M4), `profiles` „Profil erstellen" (vermutlich Signup-Trigger — Rollen-Eskalation prüfen, siehe H3).
**Fix:** Pro Policy: Token-Filter / User-ID-Filter / Service-role-only umstellen (1 Tag).

### M6 — `regulierungs_klassifizierung` Admin/KB-only nicht im Code enforced
**Stelle:** `dispatch-fall-actions.ts:21` hat `requireAuth()`, aber kein `requireRole(['admin','kundenbetreuer'])`. Matrix sagt Admin/KB-only, DB sagt Authenticated INS/UPD. · **Layer:** App · **Quelle:** RLS-Audit Drift-Finding #5.
**Fix:** Rollen-Guard ergänzen.

---

## LOW / Hardening (sammeln — nicht akut, RLS-abhängig oder geringe Auswirkung)

| # | Stelle | Beobachtung |
|---|---|---|
| L1 | `flow_links.token`, `dokument_upload_anfragen.token`, `leads.reminder_token`, `kanzlei_abrechnungen.magic_link_token`, `gutachter_termine.{ablehnen_token,kunde_response_token,kunden_tracking_token}` | Im **Klartext in der DB** — anders als `airdrop_invitations` (`token_hash`+`token_lookup_prefix`) und `auth_remember_tokens` (`token_hash`). DB-Leak/RLS-Bug → direkt nutzbare Magic-Link-Token. Aufs `airdrop_invitations`-Pattern vereinheitlichen. |
| L2 | `src/app/flow/[token]/page.tsx:~117` | Backward-Compat: wenn `flow_links`-Lookup leer → URL-Param direkt als `leads.id` interpretiert, FlowWizard mit kompletter Lead-PII gerendert — **ohne Token**, nur UUID-gated. Entfernen sobald keine Alt-Links mehr. |
| L3 | `src/app/flow/[token]/actions.ts:~260` `createKundeAccount` | Revalidiert nicht, dass der Flow-Token zu `fallId` gehört (`fallId`/`email` vom Client). Bei unbeanspruchten Fällen (`kunde_id IS NULL`) → Fall-Übernahme für beliebigen `fallId`. UUID-gated; Hijack existierender Accounts ist geblockt. Token→Lead→Fall serverseitig auflösen. |
| L4 | `src/app/dispatch/leads/[id]/_phases/UnfallskizzeCard.tsx:~130` | Rendert `leads.unfallskizze_svg` per `dangerouslySetInnerHTML` **ohne Sanitization**. `src/lib/unfallskizze/generate.ts` setzt den wörtlichen Kunden-Freitext `unfallhergang` in den LLM-Prompt und extrahiert nur per `match(/<svg…<\/svg>/i)`. Prompt-Injection → SVG mit `<foreignObject><img onerror=…>` → Stored-XSS in der Dispatcher-Session (Confidence ~7, LLM-Compliance-abhängig). Auch `saveEditedUnfallskizze` prüft nur `startsWith('<svg')`. SVG vor Persistierung serverseitig sanitizen (DOMPurify `USE_PROFILES:{svg:true}`) oder als `<img src="data:image/svg+xml,…">` rendern. |
| L5 | `src/app/api/search/route.ts`, `chat/fall-lookup/route.ts` | Nur `if (!user)`, **keine Rollenweiche** — queriet `leads`/`faelle`/`sachverstaendige`, verlässt sich vollständig auf RLS. Wenn RLS für `authenticated` zu permissiv (siehe Layer-3-Drift „BROKEN"), kann jeder eingeloggte User alles durchsuchen. Rollenweiche analog `/api/gutachter/search` + `/api/chat/inbox-threads`. |
| L6 | `src/app/api/search/route.ts`, `chat/fall-lookup/route.ts`, `gutachter/search/route.ts` | `q`-Param als `%${q}%` direkt in `.or('col.ilike.<pattern>,…')` → PostgREST-Filter-Injection (`,`/`)` brechen aus). Begrenzt durch RLS+`.eq('sv_id',…)`, aber Sonderzeichen strippen/escapen. |
| L7 | `src/app/api/sv/upload-with-ocr/route.ts:~33` | Prüft SV-Besitz von `terminId`, nimmt `fallId` aber unabhängig aus dem Form, checkt es nicht gegen den Termin → SV kann `fall_dokumente`-Zeile in fremden `fallId` schreiben. `termin.fall_id === fallId` cross-checken. |
| L8 | `src/app/api/ocr/anspruchsschreiben/route.ts:~38` | **Keine Auth**, `createServiceClient()` (RLS-Bypass), inserted/updated `forderungspositionen` (Forderungsbeträge) für beliebigen `fall_id` aus dem Body mit Angreifer-Beträgen aus Angreifer-`pdf_url`. UUID-gated. An die anderen OCR-Routes angleichen (Login-Check/User-Client). |
| L9 | `src/app/api/aircall/call/route.ts:~8` | Jeder eingeloggte User kann Anrufe an beliebige Nummern via Firmen-Aircall-Account auslösen (Telefonie-Missbrauch). Auf Dispatch/KB einschränken. |
| L10 | `src/app/api/email/send/route.ts:~10` | Jeder eingeloggte User kann transaktionale Emails (inkl. „neuer-fall" an alle Admins) für jeden lesbaren `fallId` triggern. Rollen-gaten. |
| L11 | `webhooks/aircall/inbound`, `aircall/webhook`, `webhooks/lexdrive` (Bearer-Zweig), `stripe/webhook` | Verifizieren nur **wenn** das Secret konfiguriert ist — fehlt es, wird der Payload akzeptiert (Fail-Open). Hart auf 401, wenn das Secret env-seitig fehlt. |
| L12 | `exec_sql`-RPC (genutzt in `src/scripts/seed-test-data.ts:~81`) | Dev-Seed (out of scope), aber die Existenz von `exec_sql(text)` in der DB ist gefährlich, falls `EXECUTE` für `anon`/`authenticated` granted ist (effektiv RCE-on-DB via PostgREST). Grants prüfen — nur `service_role` ausführbar machen oder entfernen. |
| L13 | `src/app/gutachter/profil/actions.ts` `updateProfil` | Lässt den SV `ist_aktiv` via `verfuegbar`-Checkbox togglen — `ist_aktiv` ist aber auch das Dispatchability-/Verifizierungs-Lock-Flag. Trennen (Availability vs. Verifizierungs-Lock). |
| L14 | `supabase/middleware.ts` `isPublicPath` | Präfix-Matching ohne Trailing-Slash-Normalisierung (`'/kunde/termin'` matcht `/kunde/termine`) — kein Bypass (`/kunde/termine` unter Layout-Guard), aber fragil. Auf exakte Pfade / `path+'/'` umstellen. |
| L15 | `rls-permissions-audit.md` Layer-3 | **Matrix↔DB-Drift** (RLS ist Soll-Doku, DB ist permissiv): `faelle` (SV/KB-Scope nur im Code, DB hat keine Owner-Policy) = BROKEN; `claims`/`tasks` = UNKNOWN (RLS-Status prüfen); `abrechnungen` = WEAK (Service-role-Bypass). `kunde_gutachten_requests` RLS-Status unklar (keine AAR-Doku). |
| L16 | 169 Background-Lints (Supabase Advisor) | 61× `function_search_path_mutable` (SECURITY DEFINER ohne `SET search_path = ''` → Schema-Injection-Risiko), 54× SECURITY DEFINER für `anon` ausführbar, 54× dito `authenticated`, `auth_leaked_password_protection` aus (1-Klick-Toggle im Dashboard), `btree_gist` in `public` (AAR-865 — best practice: eigenes Schema). Sammel-Hygiene-Ticket. |
| L17 | 2FA-Lockout-Maps (`failCountMap` in `verify-code.ts`/`send-email-code.ts`) | In-Memory, pro Prozess, Deploy-Reset — reines Rate-Limiting-Hardening (formal aus dem Scope). |

---

## Geprüft & als sicher bewertet

- **Cron-Routes:** alle `src/app/api/cron/**/route.ts` prüfen `Authorization: Bearer ${CRON_SECRET}` (per grep verifiziert).
- **Webhook-Signaturen (korrekt):** `stripe/webhook` (`stripe-signature`), `webhooks/lexdrive` + `lexdrive/bot-callback` + `lexdrive/vollmacht-confirm` (HMAC-SHA256 + `timingSafeEqual`), `baileys/inbound` (Bearer), `twilio/inbound-kb-whatsapp` (`x-twilio-signature` in Prod), `aircall/webhook` + `webhooks/aircall/inbound` (HMAC wenn Secret gesetzt — vgl. L11).
- **Auth-Layout-Guards:** `admin`/`dispatch`/`gutachter`/`kunde`/`makler/(shell)`/`mitarbeiter`/`kanzlei`/`faelle/[id]` — alle prüfen `getUser()` + Rolle; Query-Errors rutschen nicht durch (`.single()`/`.maybeSingle()` → `data:null` → `profile?.rolle !== '<x>'`-Check greift → Redirect); `admin/layout.tsx` prüft `profileErr` explizit; `portal-guard.ts` behandelt `error`-Pfad korrekt.
- **Middleware:** 2FA-Check vor Admin-Rollen-Check (AAR-111 intakt); Dispatch-User von `/admin/*` weggeleitet; `getUser()` (HTTP-Roundtrip) statt `getSession()` für geschützte Pfade.
- **Service-Role-Key:** `createAdminClient()`/`createServiceClient()` ausschließlich in Server-Components / `'use server'`-Files / API-Routes — kein Import in `'use client'`, kein Leak in API-Responses.
- **`NEXT_PUBLIC_*`:** keine Variable enthält ein Secret — nur legitime Public-Tokens (Mapbox `pk.`, Google-Maps-Browser-Key, Supabase-URL+Anon-Key, Cesium-Ion-Token, Imagin-Customer-ID, App-URLs, Feature-Flags). Alle Secrets (`VERCEL_API_TOKEN`/`ANTHROPIC_API_KEY`/`TWILIO_AUTH_TOKEN`/`STRIPE_*_SECRET`/`*_WEBHOOK_SECRET`/`CRON_SECRET`/Google-Server-Key) bleiben server-only.
- **Kein Secret-/Passwort-/Token-Logging.**
- **2FA:** Email-OTP SHA-256-gehasht, 5-Min-Expiry, Single-Use, 3/h-Rate-Limit; SMS-2FA via Twilio Verify; `skip-cookie.ts` mit Defensive-Re-Check.
- **Remember-Me-Token:** `randomBytes(32).base64url`, SHA-256-gehasht in DB, 30-Tage-Expiry, `revoked_am`-Check, Cookie `httpOnly`+`secure`, User-ID-Binding gegen Hash geprüft.
- **Token-Generierung (im App-Code sichtbar):** durchgehend `crypto.randomBytes(24..32).base64url`/`.hex` — kein `Math.random`. Token-Routen prüfen Expiry, teils Single-Use.
- **Passwort-Reset:** über Supabase-GoTrue-Recovery-Token (kein eigenes Token-Handling), `signOut()` danach.
- **OAuth-Callbacks:** `auth/callback` ignoriert `next` (kein Open-Redirect); `auth/google/callback` + `auth/google-calendar/callback` whitelisten `returnTo`/`state` auf relative Pfade. `auth/logout` 303 mit X-Forwarded-Origin.
- **`dangerouslySetInnerHTML`-Treffer (außer L4):** JSON-LD (serialisiertes eigenes Objekt), QR-SVGs aus der `qrcode`-Library (deterministisch), hardcoded `SVG_INLINE`, `vertragsvorlagen.inhalt_html` (nur Admin per Action mit Rollen-Guard schreibbar), `onboarding_felder.label` (nur per Migration geseedet).
- **Markdown-Rendering:** `react-markdown` ohne `rehype-raw`/`skipHtml=false` — HTML escaped.
- **Kein `eval`/`new Function`/`child_process`/`exec` mit User-Input im Runtime-Code.**
- **Supabase-`.rpc()`** (außer Seed-Script): gebundene Parameter — keine SQL-Injection.
- **Branding-Theme:** `primary/secondary/accent` als Hex validiert; Theme-Tokens fließen in `generateCssVars()` → React-`CSSProperties` (kein rohes `<style>`) — keine CSS-Injection.
- **Webhook-Payload-Text** (z. B. LexDrive `begruendung`) landet in `timeline.beschreibung`, wird nur als JSX-Text (auto-escaped) gerendert — kein Stored-XSS.
- **Profile-Update-Actions** (`kunde/profil`, `gutachter/profil`, `lib/actions/sv/update-own-profile`): explizite `.eq('id', user.id)`, explizite Feld-Listen — kein Mass-Assignment, `rolle`/Privilege-Felder nicht schreibbar (vgl. aber H3 für den Signup-/Konversions-Pfad).
- **`api/dev/*` + `seed-testdata`:** durch `NODE_ENV==='development'` bzw. Admin-Rolle gegated.
- **`sv/upload-gutachten` + `.../finalize`:** verifiziert SV-Besitz von `auftragId`; `finalize` erzwingt `claim/<claimId>/gutachten/<auftragId>/`-Storage-Path-Whitelist.
- **RLS-Enabled-No-Policy (Advisor):** `rechnungs_konfiguration`/`rechnungs_nr_counter`/`sv_onboarding_rechnungen`/`task_reminders`/`whatsapp_inbound_messages` = Service-role-only, OK (AAR-613 dokumentiert).

---

## Priorisierte Maßnahmen

### 1 · Sofort (HIGH)
- **H1** — `X-Twilio-Signature`-Verifizierung in `webhooks/twilio/inbound` + `webhooks/twilio/status` (Template `validateTwilioSignature` existiert im Repo → kleiner contained Fix).
- **H2** — `conversion_events` RLS enablen (Migration via `npx supabase migration new`, 5 Min — SQL oben).
- **H3** — `handle_new_user`-Trigger lesen → falls `rolle` aus `user_metadata` propagiert: Trigger fixen + Signup-/Konversions-Routes prüfen. (Verifikation zuerst — könnte HIGH oder gegenstandslos sein.)

### 2 · Bald (MEDIUM)
- **M3** — Storage-Bucket-Listing für `gutachten`/`schadensfotos`/`unterschriften` schließen + App auf `createSignedUrl()`; `flow/*`-Anon-Policy verschärfen.
- **M4** — Ownership-Check in `createNotification()` + Read-Policy auf `benachrichtigungen`/`mitteilungen`.
- **M1** — Autz-Check in `copilot/briefing` (Rolle oder User-Context-Client).
- **M2 (akut)** — `requireRole(['admin'])` in `admin/finance/(hub)/provisionen/actions.ts` + `admin/finance/actions.ts`.
- **M5 (verdächtige)** — Token-Filter in den Magic-Link-Update-Policies (`faelle`/`leads`/`flow_links`); `finance_eintraege`/`flow_links` Auth-manage-ALL einschränken.
- **M6** — `requireRole(['admin','kundenbetreuer'])` in der `regulierungs_klassifizierung`-Action.

### 3 · Sweep (M2 flächig)
- Auth-Guard-Konvention über **alle** `'use server'`-Files: `requireRole([...])` als erste Zeile. Konkrete Targets: `create-lead.ts`, `admin-kalender.ts`, `call-actions.ts`, `makler-settings.ts`, `dispatch-fall-actions.ts`, `signup-and-convert.ts`, `update-lead-{fotos,gegner,zb1-manual}.ts`, `provisionen/actions.ts`, `finance/actions.ts`. + Lint-Rule.

### 4 · RLS-Core ausrollen (Mid-Term, 1–2 Tage)
- Permission-Matrix-Soll als DB-RLS umsetzen: `faelle` (SV `own`, KB `assigned`, Admin `all`), `claims`/`abrechnungen`/`tasks` analog. Pro Tabelle ein Migration-File. Schließt L15/L5 + reduziert die „fragil bei Refactoring"-Abhängigkeit vom App-Layer.
- Restliche Always-True-Policies (M5) fixen (1 Tag).

### 5 · Hygiene-Backlog
- L16: 61× `function_search_path_mutable` → `ALTER FUNCTION … SET search_path = ''`; 108× SECURITY DEFINER anon/auth-executable → `REVOKE EXECUTE FROM anon/authenticated` wo nicht-trivial; `auth_leaked_password_protection`-Toggle; `btree_gist` ins eigene Schema.
- L1 (Token-Hashing vereinheitlichen), L4 (SVG-Sanitization), L6 (Filter-Escaping `/api/search`), L11 (Webhook-Fail-Closed), L12 (`exec_sql`-Grant prüfen/entfernen), L7–L10/L13 (Auth/Ownership-Checks auf OCR-/Email-/Aircall-/SV-Profil-Routes), L2/L3 (Flow-Token-Härtung), L14 (`isPublicPath`).

### 6 · Nicht in diesem Audit (offene Schichten)
- Native-App-Permissions (Capacitor ruft Supabase direkt → alle DB-Lücken werden dort akut).
- Audit-Log-Vollständigkeit (welche destruktiven Actions schreiben in `timeline`/`phase_transitions`).
- 2FA-Coverage pro Rolle (`twofa_aktiviert` in `profiles`).
- DSGVO-Lösch-Workflow-Trigger (`dsgvo_loeschauftraege` — RLS aktiv, Policies nicht geprüft).
- Live-Re-Verifikation der RLS-„PRÜFEN"-Punkte (`kunde_gutachten_requests`, `claims`, `tasks`, `provisionen_maik`, `sachverstaendige`).

---

## Quellen

- **Code-Audit (12.05.2026):** 3 parallele Senior-Security-Subagenten, Lese-Analyse von `src/proxy.ts` + `src/lib/supabase/*` + `src/lib/auth/**` + `src/lib/permissions/*` + alle Auth-Layouts + alle `src/app/api/**/route.ts` + alle `src/app/**/actions.ts` + `src/lib/actions/**` + Token-Strecken (`/flow`, `/upload`, `/sv/termin`, `/kunde-termin`, `/ablehnen`) + `supabase/migrations/*` (inkrementelle Policies) + `dangerouslySetInnerHTML`/Markdown/`eval`/`NEXT_PUBLIC_*`-Greps.
- **RLS-/Permissions-Audit (12.05.2026):** `rls-permissions-audit.md` — Supabase Project `paizkjajbuxxksdoycev` (eu-west-2), `list_tables` (~140 Tabellen, 1 ohne RLS), `get_advisors` (201 Lints: 2 ERROR, 193 WARN, 6 INFO), `src/lib/permissions/matrix.ts` (AAR-752), Drift-Subagent (Code↔DB, 30-Action-Stichprobe), Memory `project_rollen_berechtigungen_offen`.
- *Dieses Dokument konsolidiert beide. `rls-permissions-audit.md` bleibt als Detail-Referenz für den DB-Layer; der aktuelle Gesamt-Stand steht hier.*

*Privates Repo; dieser Report dokumentiert teils ausnutzbare Schwächen mit Befund + Exploit + Fix und dient als Tracker. Nach Behebung von HIGH/MEDIUM als historischer Stand committet belassen.*
