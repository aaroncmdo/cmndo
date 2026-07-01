# Claim Write-Path Authorization Audit (2026-07-01)

**Scope:** Schreib-/Mutations-Autorisierung aller claim-nahen Tabellen ueber alle 9 Rollen
(admin, dispatch, kundenbetreuer/KB, sachverstaendiger/SV, kunde, kanzlei, makler, werkstatt, + anon/token).
Dies ist das **Pendant zum abgeschlossenen Lese-Audit** (RLS/Views, `session-marker-876a45e8`); die
Schreib-Seite war der explizit notierte offene Top-Hebel (`coordination-claim-audit-test-gap-map`).

**Methode:** (1) RLS-Write-Policy-Landschaft aus der Prod-DB (`pg_policies`), (2) Inventar der
`createAdminClient()`/`createServiceClient()`-Schreibpfade (507 Vorkommen / 200 Files), gefiltert auf die
**user-erreichbare** Teilmenge (cron = CRON_SECRET, webhooks = Signatur → kein Rollen-Privesc-Ziel),
(3) 5-Agenten-Fan-out ueber die Cluster, (4) **adversariale Source-Verifikation** der Top-Findings.

**Read-only Audit.** Keine Code-Aenderung im Zuge des Audits. Fixes: siehe Abschnitt "Fix-Plan".

---

## Sicherheitsmodell (Grounding)

- **User-Client** `createClient()` → RLS wird als Caller erzwungen.
- **`createAdminClient()` / `createServiceClient()`** → `service_role` → **RLS wird umgangen**. Bei so einem
  Write ist der **Server-Code-Guard die EINZIGE Autorisierung**.
- Guards: `requireAuth()`, `requireRole([roles])`, `requirePortalAccess`, `assertKundeOwnsFall/Claim`,
  `assertLeadMutable`. RLS-Fns: `can_access_claim`, `is_admin/is_dispatcher/is_kundenbetreuer/is_kanzlei/is_staff/is_sv_for_claim`.

### RLS-Write-Landschaft (Prod, `pg_policies`)

- **Solide Baseline** — die meisten Claim-Tabellen sind staff- oder claim-scoped:
  `claims` (admin OR KB-own-or-unassigned), `claim_parties` (staff + SV-zeuge), `fall_dokumente`/`pflichtdokumente`/
  `reklamationen`/`gutachter_termine` (`can_access_claim`), `gutachten` (admin/claim-scoped), `kanzlei_*` (admin/KB),
  `makler_*` (admin/KB + self-revoke).
- **App-Guard ONLY** (RLS an, aber **keine** authenticated-Write-Policy → jeder Write via service_role):
  `faelle_claim_bridge` (LIVE, 94 Zeilen), `abrechnungen` (0 Zeilen/dormant), `claim_recency`,
  `dokument_upload_anfragen`.
- **Ueber-breit:** `termine` (`authenticated` ALL, **kein** with_check — aber Tabelle **leer/dormant**),
  `forderungspositionen` (`can_access_claim OR is_kanzlei()` → jede Kanzlei schreibt jede Position).

**Kernbefund:** Die RLS-Lese-Haertung (876a45e8) hat die Read-Seite geschlossen; die Schreib-Seite ist
ueberwiegend gesund, **ausser** an den admin-client-Pfaden, die RLS komplett umgehen — dort haengt alles am
Code-Guard, und genau dort sitzen die Findings.

---

## Findings (verifiziert, nach Impact)

### F1 — Account-/Sichtbarkeits-Hijack via token-lose Flow-Actions  [HOCH]  ⚠️ aar-956-Zone
**`src/app/flow/[token]/actions.ts`** — `createKundeAccount` (:285) + `signSAandCreateFall` (:575).
- `createKundeAccount(fallId, email, ...)` ist ein token-loser `'use server'`-Export (kein Auth, kein
  Token→Fall-Binding). `finalizeKundeSetup` setzt `claims.geschaedigter_user_id` (:452) + `claim_parties.user_id`
  (:461) — die **RLS-Ownership-Keys** — auf die **caller-gelieferte E-Mail**.
- Der Hijack-Schutz (AAR-308/309) sitzt nur **E-Mail-seitig** (kein Downgrade fremder Nicht-Kunden-Accounts,
  :331; kein Anfassen bereits verknuepfter Faelle, :308). Es fehlt der **Fall-seitige** Check: dass der Caller
  ueberhaupt zu diesem `fallId` berechtigt ist.
- **Exploit:** Wer eine fremde, konvertierte-aber-noch-nicht-verknuepfte `fallId` kennt, ruft
  `createKundeAccount(victimFallId, attacker@evil.com, ...)` → legt einen Account unter seiner E-Mail an und
  wird `geschaedigter` des Opfer-Claims → **voller RLS-Kunden-Zugriff (PII/IBAN/Dokumente/Timeline)**.
  Analog erlaubt `signSAandCreateFall(leadId, ...)` das Konvertieren einer beliebigen un-konvertierten `leadId`.
- **Praktische Ausnutzung** haengt an der Geheimhaltung der `fall_id`/`lead_id` (UUID, nicht enumerierbar, aber
  in authentifizierten Kontexten/Links/Logs auftauchend). Fehlende Autorisierung ist real; kein Enumerations-Schutz.
- **Fix:** Flow-Token in die Action threaden und `flow_links.token → lead_id/fall_id` verifizieren, bevor
  Ownership-Keys gesetzt werden. Schliesst F1 + die `signSAandCreateFall`-Variante gemeinsam.
- **Koordination:** Datei ist in aktiver Entwicklung durch **3 aar-956-Sessions** (`kitta/aar-956-embed-reservierung-rueckruf`).
  **NICHT unilateral patchen** — mit den aar-956-Ownern abstimmen / an Aaron zur Sequenzierung.

### F2 — `/api/ocr/anspruchsschreiben`: unauth + SSRF + service-role-Write  [WICHTIG]
**`src/app/api/ocr/anspruchsschreiben/route.ts`** — `POST` (:39).
- **Kein** Auth / **kein** CRON_SECRET / **keine** Signatur. `createServiceClient()` (:79, RLS bypass) schreibt
  `forderungspositionen` (die juristischen Anspruchspositionen: Reparatur, Wertminderung, Anwaltskosten …) auf
  den via `resolveClaimId(fall_id)` (:84) aufgeloesten Claim.
- **Zusaetzlich SSRF:** `await fetch(pdf_url)` (:49) laedt einen **attacker-kontrollierten** URL — noch **vor**
  jedem DB-Write, braucht also nicht mal eine gueltige `fall_id`.
- **Dangling:** Kein In-App-Caller (grep bestaetigt). Toter, aber offener + gefaehrlicher Endpoint.
- **Fix:** Gate hinter `Bearer CRON_SECRET` (wie die Schwester-OCR-Routen) **oder** loeschen; falls behalten,
  `pdf_url` auf die eigene Storage-Domain einschraenken (SSRF). Empfehlung: **gaten** (Optionalitaet erhalten).
- **Koordination:** eigene Datei, keine aktive Kollision → **mein Fix**.

### F3 — Ungeguardete `'use server'`-Billing-Exports  [WICHTIG]
**`src/lib/abrechnung/revert-case-billing.ts`** (`revertCaseBilling` :20), **`reissue-abrechnung.ts`**
(`reissueAbrechnung` :13), **`process-case-billing.ts`** (`processCaseBilling` :19).
- Alle drei sind `'use server'` (Zeile 1), **ohne** internen Auth/Rollen-Guard, admin-client, und nehmen eine
  beliebige `fallId`/`abrechnungId`. Direkt als RPC von **jedem** authenticated User (inkl. kunde/makler/werkstatt)
  aufrufbar.
- **Exploit:** `revertCaseBilling('<fallId>', 'x', '<uuid>')` → bucht fremdes SV-Werbebudget zurueck (LIVE-Daten),
  storniert/re-issued eine Abrechnung + mailt den Empfaenger, erstellt Gutschrift, faelscht `storno_durch_user_id`.
  Die Ownership-Gates existieren nur in den **Wrappern** (`stornoFall`, admin `reIssueAbrechnung`, state-machine-Hooks) —
  der direkte Export umgeht sie.
- **Alle Caller sind server-seitig** (cron, `storno-actions`, `sv-lead-ablehn-actions`, `state-machine`,
  `admin/abrechnungen/actions`) — **kein Client-Import** (grep bestaetigt).
- **Fix:** `'use server'` aus den drei Files entfernen → sie werden interne Module (kein RPC-Surface), alle
  bestehenden server-seitigen Caller laufen unveraendert weiter. (Etabliertes AAR-664-Prinzip: keine Internals
  aus `'use server'` exportieren.)
- **Koordination:** `lib/abrechnung/*`, keine aktive Kollision → **mein Fix**.

### F4 — `upload-with-ocr`: SV pflanzt Dokument auf fremden Claim  [WICHTIG]
**`src/app/api/sv/upload-with-ocr/route.ts`** — `POST` (:11).
- `terminId` UND `fallId` sind unabhaengige Formfelder (:22-23). Nur `terminId` wird gegen `assignee_id=sv.id`
  verifiziert (:36-43). Der `fall_dokumente`-Insert (:129) + Storage-Pfad (:51) nutzen den **ungeprueften** `fallId`.
- **Exploit:** Ein SV, der irgendeinen eigenen Termin `T` besitzt, sendet `terminId=T` (passiert das Gate) +
  `fallId=<fremder Claim>` → OCR-Dokumentzeile (mit `discrepancy_flag`, KB/Kanzlei/Admin-sichtbar) landet auf dem
  fremden Claim.
- **Fix:** `fall_id`/`claim_id` aus dem verifizierten `termin` selektieren und gegen `fallId` asserten (oder
  direkt `termin.fall_id` verwenden statt dem Formfeld zu vertrauen).
- **Koordination:** `api/sv`, keine Kollision → **mein Fix**.

### F5 — `loescheGutachtenDokument`: destruktiver Bucket-Zugriff ohne Guard  [WICHTIG]
**`src/lib/auftrag/qc.ts`** — `loescheGutachtenDokument` (:284).
- Guard = nur `getUser` (jeder authenticated User; :288-290), admin-client (:292).
  `db.storage.from('fall-dokumente').remove([storagePath])` (:304) loescht einen **komplett
  attacker-kontrollierten** Pfad — der **nicht** an `auftragId` oder Claim gebunden ist. Der Soft-Delete auf
  `fall_dokumente` (:310-313) keyt ebenfalls nur auf `storage_path`. Einzige Schranke: `auftragId` darf nicht
  `gutachten_final_freigegeben` sein.
- **Exploit:** Jeder eingeloggte User loescht **beliebige** Dateien im `fall-dokumente`-Bucket (Gutachten,
  SA-PDFs, Polizeiberichte, Kunden-Uploads) + soft-deletet die Rows, solange er irgendeinen nicht-finalisierten
  `auftragId` nennt. Storage-Pfade folgen dem vorhersehbaren `claims/<claimId>/…`-Muster.
- **Fix:** (a) SV-owns-auftrag-ODER-staff-Gate (wie `gutachtenAbgeben`/`kannGutachtenAbgeben`), (b) `storagePath`
  muss zum Claim des `auftragId` gehoeren (Prefix-Check) vor `remove`.
- **Koordination:** `lib/auftrag/qc.ts` (Filmcheck-Session war prior/merged, keine aktive Kollision) → **mein Fix, kollisionsbewusst**.

### F6 — KB-Cross-Claim in Dispatch-Actions  [WICHTIG, staff-intern]
**`src/lib/actions/dispatch-fall-actions.ts`** — `updateFallStatus` (:23), `updateLeadStatus` (:357).
- Rollen-gegated auf `['admin','dispatch','kundenbetreuer']`, **aber ohne** per-Fall/Lead-Ownership-Scoping;
  `updateLeadStatus` schreibt via service-client (RLS bypass).
- **Exploit:** Ein `kundenbetreuer` treibt per beliebiger `fallId`/`leadId` fremde Status-Transitions
  (→storniert loest Billing-Revert aus; →abgeschlossen) bzw. Lead→Fall-Konversion. Cross-Staff-Tampering,
  kein Outsider-Privesc.
- **Referenz-Muster:** `src/lib/claims/endzustand-actions.ts` macht es richtig — `requireRole` **+**
  `authorizedForClaim` (admin global, KB nur bei `kundenbetreuer_id === user.id`). Die Dispatch-Actions sollten
  dasselbe adoptieren (oder das staff-weite KB-Modell explizit dokumentieren).

---

## Minor / Latent

- **`forderungspositionen` RLS = `… OR is_kanzlei()`** — jede Kanzlei schreibt jede Position. Heute inert
  (kein Kanzlei-Write-Pfad im Code, Tabelle 0 Zeilen, `kanzlei_faelle.kanzlei_id` alle NULL = flache Mandanten).
  **Vor** Kanzlei-Work-Product-UI / Befuellung von `kanzlei_id` auf `can_access_claim(claim_id)` verengen.
- **`termine`-Policy** `authenticated` ALL ohne with_check — Tabelle leer/dormant. Verengen oder droppen.
- **`reassignCases`** (`admin/sachverstaendige/_karte/actions.ts`) — kein Rollen-Guard, nur claims-Write-RLS
  als Backstop. Defense-in-depth-Guard nachziehen.
- **`public-rueckruf` / `erstelleOeffentlichenRueckruf`** — anon-Action akzeptiert unvalidiertes `zugewiesenAn`
  (beliebige User-UUID als `erstellt_von`/`empfaenger_id`) + `promotionCodeId`. Mis-Attribution, kein Claim-Zugriff.
- **Kunde-Termin-Routen** (`api/kunde/termin/{verschieben,absagen}`) — handgerollte Ownership laesst den
  `claim_parties.user_id`-Pfad aus, den `assertKundeOwnsFall` hat. Nicht exploitbar (kunde_id+lead-email greifen),
  aber Drift → auf den Shared-Helper umstellen.
- **`/api/v1/melde-schaden` + `/api/v1/rueckruf`** — offen, unauth, CORS `*`. Schreiben nur Funnel-Tabellen
  (`gutachter_finder_anfragen`/`leads`/`consent_records`/`admin_termine`) — **keine** Claim-Tabellen. Spam/WA-Kosten-
  Surface, kein Claim-Ownership-Bypass. Mit Aaron klaeren, ob ein Shared-Secret fuer den MCP-Hop gewollt ist.

## Was GESUND ist (Kalibrierung)

Kunde-Termin-Routen (keyed ownership), Token-Upload-Pfade (`zb1`/`dokumente`/`magic` — Token→Record re-gebunden),
SV-Portal-Actions (`termine/[id]`, `feldmodus`, `team` org-scoped, `willkommen` self-scoped, `upload-gutachten`
sv_id-scoped), `sv-zuweisung` (gehaertet), `werkstatt/kva` (nur self-owned neue Leads), `mitarbeiter/konsultation`
(kb_id-scoped), `endzustand-actions` (Referenz-Qualitaet), alle Admin-Finance-Actions (`requireRole(['admin'])`),
Provisions-Writer (Betrag aus Admin-Config/Triggern, nicht User-Input; Release CRON_SECRET-gated) — **kein
Cross-Claim-Write erreichbar**. `faelle_claim_bridge` hat genau 1 Writer (`convert-lead-to-claim`, insert-only
upsert `ignoreDuplicates` auf `fall_id`) → **kein Relink-Primitiv**.

---

## Fix-Plan

| # | Fix | Zone | Eigentum |
|---|-----|------|----------|
| F2 | `/api/ocr/anspruchsschreiben` gaten (CRON_SECRET) + SSRF-Restrict, oder loeschen | api/ocr | **mein Fix** |
| F3 | `'use server'` aus den 3 billing-Files entfernen | lib/abrechnung | **mein Fix** |
| F4 | `upload-with-ocr`: `fallId` aus verifiziertem termin ableiten/asserten | api/sv | **mein Fix** |
| F5 | `loescheGutachtenDokument`: SV-owns/staff-Gate + storagePath-Claim-Bindung | lib/auftrag | **mein Fix (koord.)** |
| F6 | Dispatch-Actions: `authorizedForClaim`-Pattern fuer KB (oder Modell dokumentieren) | lib/actions | mein Fix (koord.) |
| F1 | Flow-Token→fall/lead-Binding in `createKundeAccount`/`signSAandCreateFall` | **aar-956** | **KOORDINIEREN** (3 Sessions) |

Empfohlene Reihenfolge: F2 + F3 (mechanisch, verifiziert, kollisionsfrei) zuerst, je eigener atomarer PR gegen
`staging` mit 7-Punkte-Audit + Tests. F4/F5 danach (Ownership-Logik + Tests). F6 als staff-internes Haertungs-PR.
F1 nur nach Abstimmung mit den aar-956-Sessions.
