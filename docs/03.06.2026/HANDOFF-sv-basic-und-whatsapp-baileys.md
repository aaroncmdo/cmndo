# HANDOFF — SV-Basic-Self-Onboarding + WhatsApp→Baileys (Stand 02./03.06.2026)

> Für die nächste Session. Zwei große Stränge wurden gebaut. Unten: Stand jedes Teils, **konkrete TODOs (priorisiert, mit Branch/PR/Befehl)**, und die Fallstricke.

## TL;DR
- **(A) WhatsApp komplett auf Baileys** — Twilio raus, **LIVE auf prod** (#2255 gemergt+deployed+e2e-verifiziert). 1 Follow-up-PR offen (#2271 Worker-Medien) + Cutover-Cleanup-Backlog.
- **(B) SV-Basic-Self-Onboarding** auf `gutachter.claimondo.de` **embedded + schick + Admin-Freigabe-Queue**. 3 offene PRs (#2291 Embed, #2310 P3-Admin, #2279 Such-Fix).
- **5 PRs gesamt: 1 gemergt+live, 4 offen zur Review.** Alle Branches gepusht.

---

## A · WhatsApp → Baileys (Twilio raus)

### ✅ LIVE auf prod
- **#2255 (MERGED → main, Prod-Deploy 02.06. 14:38 `completed/success`, e2e verifiziert):**
  - Outbound = **Leaf-Migration** (`src/lib/whatsapp.ts:sendWhatsApp` → Baileys; alle Caller fließen automatisch mit). Inbound = Text-Intents + Medien-Handler nach `src/app/api/baileys/inbound` portiert (Shared-Helper, Twilio-Route unangetastet). Twilio-npm-Package + twilio-WA-Template-Script raus (knip-grün). Twilio bleibt nur **SMS/Voice/2FA-Verify**.
  - **Worker-Inbound auf VPS scharfgeschaltet:** Worker `claimondo-baileys` (PM2), **Port 3055** (Memory-„4001" war falsch), WA-Nr `4915153608515`. `messages.upsert`-Handler war in main, war aber stale auf VPS → deployed + Env injiziert (`CRON_SECRET` + `NEXT_PUBLIC_SITE_URL=http://localhost:3000`). Reconnect ohne QR.
  - Verifiziert: Worker `state:open`, Worker→prod `/api/baileys/inbound` Auth 400/401 (datenfrei), #2255-Marker im prod-`.next`-Bundle.

### 🟡 Offen
- **#2271 (OPEN, Branch `kitta/baileys-worker-media-inbound`):** Worker-Medien-base64-Producer — der Worker lädt eingehende WA-Fotos/Dokus via `downloadMediaMessage` runter und schickt sie **base64** im `media[]`-Feld an die Inbound-Route (kein Supabase-Key im Worker; die App löst `entry.base64` → ZB1-OCR/Polizei/fall_dokumente). 12-MB-Cap, sonst has_media-Notification-Pfad.
  - **TODO:** reviewen + mergen → dann **Worker manuell aus main deployen** (Worker ist NICHT in der App-CD!): auf VPS (root): `git -C /opt/claimondo-baileys/source fetch origin main && git -C /opt/claimondo-baileys/source checkout origin/main -- services/baileys/src/index.js && node --check …/src/index.js && pm2 restart claimondo-baileys --update-env && pm2 save`. **Erst NACH #2271-auf-main** (vorher ignoriert die Route das media[], harmlos). Danach: WA-Foto-an-die-Nummer-Smoke.
- **Cutover-Cleanup (eigener PR, NACH Infra-Stabilität):** Twilio-WA-Routen löschen (`api/webhooks/twilio/inbound` + `/status`, `api/twilio/inbound-kb-whatsapp`), `lib/twilio/provision-kb-nummer.ts`, `scripts/twilio-setup-templates.mjs`, KB-WA-Nummer-Admin-UI; `TWILIO_WHATSAPP_FROM` aus Env; **`src/content/legal/datenschutz.md` §WhatsApp mit LEGAL-REVIEW** (Twilio-WABA → Baileys-Direkt; Baileys = inoffiziell/ToS-Grauzone — NICHT blind umschreiben). NICHT vor voll-live.
- **Worker-Checkout-Drift:** auf dem VPS wurde index.js per Single-File-Checkout aktualisiert (HEAD = alter Commit, Datei = main). Beim nächsten vollen Worker-Redeploy (`git pull`/`reset --hard origin/main`) reconcilen. Backup liegt: `services/baileys/src/index.js.bak-pre-inbound-20260602`.

---

## B · SV-Basic-Self-Onboarding (`gutachter.claimondo.de`)

### Architektur (WICHTIG)
- `gutachter.claimondo.de` → nginx **:3006** → **`claimondo-marketing`** (separate App **im Monorepo**, i18n `app/[locale]/`, host-geroutet via `claimondo-marketing/middleware.ts` `SUBDOMAIN_LANDING['gutachter.claimondo.de'] = '/gutachter-partner'`).
- Die Marketing-App hat **dasselbe Supabase-Projekt + Service-Role (`lib/supabase/admin`) + Email-Stack (`lib/email/google`) + Mapbox + WA-Availability** → der Claim-Flow ist dort **nativ** nachgebaut (kein Cross-App/Proxy/iframe).
- ⚠️ **Marketing-:3006 hat KEIN CI + fragilen manuellen Deploy** (`scripts/deploy-marketing-vps.py` — rm-rf VOR Build + SFTP-Race, warf claimondo.de schon mal kurz auf 502). **Deploy NUR mit Aaron**, temp-build→atomarer Switch, Recovery aus `.bak-pre-i18n`.
- SV-Basic Supabase `project_id = paizkjajbuxxksdoycev`.

### Stand
- ✅ **P1 Claim + P2a Onboarding** (gemergt früher 02.06., #2223/#2239).
- **#2291 (OPEN, Branch `kitta/gutachter-partner-claim-embed`):** Claim-Flow **embedded** in die gutachter-partner-LP (ersetzt das passive Warteliste-Formular), **schick** (premium Search-/Kandidaten-Cards, Trust-Badges, belohnende Bestätigung, Karten-Reaktivität auf PLZ), **Copy** „Warteliste"→Claim, **Sie→Du** durchgängig (ToV: SV=Du). 4 Commits.
  - Backend nativ portiert (`claimondo-marketing/lib/sv-basic/claim-{actions,eligibility}.ts` + `lib/email/google/sv-basic-claim-email.ts`, inkl. #2279-Token-Such-Fix). `eintragenAufWarteliste`-Action NICHT gelöscht (Admin/Daten + die Claim-Suche lesen `sv_leads`).
  - **Lokal gesmoket (verifiziert):** Render OK (0 Page-Errors), Suche „Urbach" → Kandidaten, **Register legt echten pending-Account an** (`auth.users`+`profiles`+`sachverstaendige[basic/ausstehend]`+`tasks[sv_basic_claim_review]`) — Test-SV restlos weggeräumt (0 Zeilen).
  - **TODO:** reviewen + mergen → **Marketing-Deploy MIT Aaron** (fragil) → **prod-LP-Smoke** (`gutachter.claimondo.de`, voller Claim+Register-Flow). Bekannt: kosmetische Hydration-Warnung (`caret-color` am Marketing-`Input`-Primitive) — non-blocking, eigener Fix optional (geteiltes Primitive → breiter Scope).
- **#2310 (OPEN, Branch `kitta/sv-basic-p3-admin-freigabe`):** **P3 Admin-Freigabe-Queue** (Haupt-App). Schließt die Admin-Loop:
  - `gibBasicSvFrei(svId)` — setzt **4 Flags atomar** (`verifizierung_status='geprueft'` + `verifiziert` + `ist_aktiv` + `portal_zugang_freigeschaltet`) + schließt den Review-Task. `lehneBasicSvAb(svId, grund)` (`abgelehnt` + `verifizierung_admin_notiz` + Task-close). In `src/app/admin/sachverstaendige/[id]/verifizierung-actions.ts`.
  - UI: Freigeben/Ablehnen-Buttons am **Verifizierungs-Tab** (gegated auf `paket='basic' && verifizierung_status='ausstehend'`) + dedizierte **Queue** `/admin/sachverstaendige/basic-freigaben` (oldest-first, 48h-SLA-Warnung) + „Basic-Freigaben (N)"-Badge im SV-Admin-Header + lesbares **Kanban-Label** für `sv_basic_claim_review`.
  - tsc grün; Spalten gegen `database.types.ts` verifiziert.
  - **TODO:** reviewen + mergen → **Admin-UI-Smoke** (login → Queue → an einem pending-Basic-SV „freischalten" → prüfen, dass SV live wird / „ablehnen" → abgelehnt). **Diesen Admin-Smoke hab ich NICHT gefahren** (2FA-Login). E2E-Test-User brauchen `twofa_aktiviert=false` (s. Memory).
- **#2279 (OPEN, Branch `kitta/sv-claim-search-tokenize`):** Such-Fix — volle Firmennamen findbar (Tokenisierung + AND-`.or()` statt Whole-String; vorher fand „Ing.-Büro Urbach KG" nichts). Haupt-App `src/lib/sv-basic/claim-actions.ts`. Live-DB-verifiziert (3 Treffer statt 0). **TODO:** mergen → UI-Re-Smoke des vollen Namens. (Hinweis: #2291 trägt den Fix bereits in der Marketing-Kopie.)

### Backlog (noch nicht gebaut)
- **P4:** (1) **SV-Freischaltungs-Email** — `gibBasicSvFrei` schickt aktuell **keine** Mail (`sendWillkommenSv` braucht ein `initial_password`, das post-Claim nicht existiert → eigenes Template „Du bist freigeschaltet" + Login/Passwort-vergessen-Hinweis). (2) Fallback-Matching (anon-GRANT #2177 wahren).
- **P5:** Per-Lead-Billing + Stripe-SetupIntent (aus P2a hierher verschoben).
- **P2b:** paid-Rollen auf denselben `flow_key='sv-onboarding'` migrieren + `WillkommenClient`-Drop (separater Plan, Regressionsrisiko bezahlte Strecke).

---

## Priorisierte nächste Schritte
1. **Review + Merge** der 4 offenen PRs (Reihenfolge: **#2279** klein zuerst → **#2310** Admin → **#2291** Marketing-Embed → **#2271** Worker-Medien).
2. Nach **#2291**-Merge: **Marketing-Deploy mit Aaron** (fragil, kein CI!) + prod-LP-Smoke.
3. Nach **#2310**-Merge: **Admin-UI-Smoke** (Freigeben/Ablehnen e2e mit Test-pending-Basic-SV).
4. Nach **#2271**-auf-main: **Worker-Medien-Deploy** (VPS-Befehl oben) + WA-Foto-Inbound-Smoke.
5. **P4** (SV-Freischaltungs-Email) bauen.

## Fallstricke / Fakten
- **Worktrees** (alle committed+gepusht): `.claude/worktrees/{whatsapp-baileys-only, baileys-worker-media, sv-claim-search, gutachter-claim, sv-basic-p3}`.
- **VPS** (root via Aaron-Override): Worker `/opt/claimondo-baileys/source` = git-Checkout der cmndo-Repo auf `main`; Marketing `/var/www/claimondo-marketing` :3006; Env zentral `/etc/claimondo/.env.local`. SSH via `scripts/vps-ssh-exec.py` (paramiko, ENV `VPS_SSH_PASSWORD`). cp1252-Konsole → `PYTHONIOENCODING=utf-8` setzen.
- **Marketing-App lokal smokebar:** `.env.local` im Worktree bauen (Keys aus Haupt-`.env.local`: Supabase-URL/Anon/Service-Role + Mapbox + Dummy `PROMO_IP_SALT`), `npx next dev -p 3100`, dann `localhost:3100/de/gutachter-partner`. **Dev-Server-Zombies per PowerShell-Port-Kill aufräumen** (`Get-NetTCPConnection -LocalPort 3100 | Stop-Process`) — `TaskStop` killt das `next dev`-Kind nicht. Playwright liegt im Haupt-Repo-`node_modules`. **Secret-`.env.local` nach dem Smoke wieder löschen.**
- **Admin-Loop steht:** Register/Claim → pending Basic + `sv_basic_claim_review`-Task → Admin (Kanban-Task ODER Queue) → Freischalten (4 Flags atomar) / Ablehnen.
- Memory aktualisiert: `[[project_baileys_whatsapp]]`, `[[project_sv_basic_tier]]`.
