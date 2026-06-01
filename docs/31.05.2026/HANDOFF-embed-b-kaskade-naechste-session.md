# HANDOFF — embed-B Claim-Auflösungs-Kaskade (AAR-939) · für die nächste Session

**Datum:** 31.05.2026 · **Branch:** `kitta/aar-939-embed-b-claim-kaskade` · **PR:** **#2101** (OFFEN, MERGEABLE, gegen `staging`)
**Worktree (lokal):** `.claude/worktrees/aar-939-embed-b-claim-kaskade/`

---

## START HIER (TL;DR)

Die embed-B / `nur_gutachter` **Claim-Auflösungs-Kaskade** ist in **PR #2101** komplett gebaut, end-to-end
gesmoked und mergebar. Sie beantwortet nach einem (vergangenen) Gutachter-Termin: *fand er statt?* →
Claim schließen / SV-No-Show / Dispatcher-Klärung. **4 Stücke, alle fertig:**

1. **Bug-Fix** `gutachter_termine.status='durchgefuehrt'` → `'abgeschlossen'`
2. **Kunde-Banner** „Kam dein Gutachter?" (JA schließt Claim / NEIN → Dispatcher-Task)
3. **Resolution-Cron** (stale Termin → Dispatcher-Task) **+ WA-Outbound-Ping** (Portal-Link)
4. **Dispatcher-Resolve** (Dispatch-Dashboard-Karte: SV-No-Show / doch durchgeführt)

**Offen (2 große, koordinations-bedürftige Streams — siehe §6):** WA-**Inbound** JA/NEIN · Self-Service-**Verlegung**.

**Lesereihenfolge:** dieses Handoff → `docs/31.05.2026/AAR-939-embed-b-claim-kaskade-pr1.md` (PR-Doc mit
Smoke-Ergebnissen) → Memory `project_aar939_embed_b_claim_mechanik` (Vollstatus + alle Interfaces) →
Vorgänger-Handoff `docs/31.05.2026/HANDOFF-embed-b-claim-resolution-kaskade.md`.

---

## 1. Was in PR #2101 ist (alle gesmoked, Build/CI grün, gegen staging gemergt-clean)

| Stück | Dateien | Smoke |
|---|---|---|
| **Bug-Fix status** | `src/lib/termine/actions.ts` (completeBegutachtung + markNurGutachterTerminDurchgefuehrt) | DB (kein CHECK-Fehler) |
| **Geteilte Close-Logik** | `src/lib/termine/close-nur-gutachter-termin.ts` (`closeNurGutachterTerminAlsDurchgefuehrt` + `CLAIM_TERMINAL_STATUSES`) | via JA/Dispatcher |
| **Kunde-Actions** | `src/lib/termine/kunde-termin-resolution.ts` (`bestaetigeTerminAlsKunde` / `meldeSvNichtErschienenAlsKunde`) | Browser + DB |
| **Kunde-Banner** | `src/components/kunde/KundeTerminCheckBanner.tsx` + Mount in `src/app/kunde/faelle/[id]/page.tsx` | Browser (Screenshots) |
| **Task-Helper** | `src/lib/termine/embed-b-klaerung-task.ts` (`createEmbedBKlaerungTask` + `EMBED_B_KLAERUNG_TASK_TYP` + `TERMIN_RESOLUTION_EXCLUDED_*`) | via Cron |
| **Cron + WA-Ping** | `src/app/api/cron/embed-b-termin-resolution/route.ts` | Cron-curl + Idempotenz |
| **Dispatcher-Resolve** | `src/lib/termine/embed-b-dispatcher-actions.ts` (`bestaetigeSvNoShowVomTeam` / `bestaetigeDurchgefuehrtVomTeam`) + `src/components/dispatch/EmbedBKlaerungCard.tsx` + Mount in `src/app/dispatch/dashboard/page.tsx` | Browser + DB |

**Commits:** PR1-Portal → `staging`-Merge (Konflikt `markBillingReviewPending`-Import gelöst) → Dispatcher-Resolve `0d8e71ece` → WA-Ping `b1f432268` → Doc-Updates. HEAD `c40c16da8`.

---

## 2. Mechanik / wie es zusammenspielt

- **Banner-Gate** (server, `kunde/faelle/[id]/page.tsx`): `service_typ='nur_gutachter'` **&&** Claim nicht terminal
  **&&** Termin `end_zeit < now` **&&** `durchgefuehrt_am/sv_no_show_am/sv_ablehnung_am IS NULL` **&&** Status nicht in
  `TERMIN_RESOLUTION_EXCLUDED_STATUSES` **&&** kein offener `embed_b_termin_klaerung`-Task.
- **JA** (Kunde) → `durchgefuehrt_am` + `claims.status='termin_durchgefuehrt'`. **NEIN** (Kunde) → Dispatcher-Klärungs-Task
  (KEIN direkter Claim-Move, KEIN `sv_no_show_am` — bewusst Team-only, Anti-Gaming).
- **Cron** (24h Karenz, stündlich): stale Termin ohne Reaktion → Dispatcher-Task (idempotent über `entity_id`) **+ einmaliger WA-Ping** (beim ersten Erfassen, `created=true`).
- **Dispatcher-Resolve** (Dispatch-Dashboard): „SV kam nicht" → `markSvNoShowEmbedB` + Task-Resolve (€70 bleibt); „Doch durchgeführt" → Claim terminal + Task-Resolve.
- **Task-Sichtbarkeit:** `typ='dispatch'` (Dispatch-Dashboard-Queue) + `task_typ='embed_b_termin_klaerung'` (Semantik, `/admin/tasks`).

---

## 3. DB-Realität (Stand 31.05., live geprüft)

- **0** echte Monika-B-Anfragen (`gutachter_finder_anfragen WHERE source='sv_embed' AND variante='B'`). Feature noch nicht live.
- **45** `nur_gutachter`-Claims (alle `status='dispatch_done'`), nur **2** ng-Termine (beide `verlegt`/`verlegung_pending` → vom Gating korrekt ausgeschlossen). → Banner/Cron erfassen **aktuell 0** echte Fälle (kein Bestandsdaten-Lärm).
- **Wichtig:** Die ganze Kaskade gatet auf `service_typ='nur_gutachter'` (nicht embed-B-spezifisch) — embed-B ist eine Teilmenge.
- `gutachter_termine_status_check` erlaubt KEIN `'durchgefuehrt'` (am 29.04. per `cmm32_revert` bewusst raus). Anker = `durchgefuehrt_am`-Timestamp.
- `tasks.typ` hat KEINEN CHECK; `prioritaet` nur {normal, dringend, kritisch}.

---

## 4. Smoke-Tooling (im Worktree, Logik im PR-Doc dokumentiert)

`scripts/smoke-embed-b-kaskade.mjs` — Modi: `seed | verify | cleanup | untask | prep-user | reset-user | simulate-ja | seed-klaerung | prep-dispatch`.
`scripts/smoke-embed-b-playwright.mjs` (Kunde-Banner) · `scripts/smoke-dispatch-playwright.mjs` (Dispatcher-Karte).

**Smoke-Lernungen (WICHTIG für die nächste Session):**
- **Lokale Browser-Auth-Smokes IMMER mit `npm run dev`, NIE `next start`** — production setzt `Secure`-Auth-Cookies, die der Browser auf `http://localhost` verwirft → Session geht nach Login sofort verloren. Dev (NODE_ENV=development) setzt keine Secure-Cookies.
- Banner-Gating braucht `claims.onboarding_complete=true` (sonst Layout-Redirect `/kunde/onboarding`).
- Test-User: `smoke-kunde-1778709794181@claimondo.test` (Claim `c5480a99…`, Fall `e8549396…`) + `smoke-dispatch@claimondo.test`. Reversibler Seed auf `@claimondo.test`-Daten, restlos aufräumbar.
- Test-Lead-Nummer `+4915112345678` (Fake) — echter WA-Versand braucht VPS-Baileys (Port 4001), lokal `pingsGesendet:0` (non-critical).

---

## 5. VPS-Cron (gesetzt ✅)

`17 * * * * /usr/local/bin/cron-call.sh /api/cron/embed-b-termin-resolution` — eingetragen + verifiziert.
`cron-call.sh` liest CRON_SECRET selbst + ruft `http://localhost:3000` (prod). **Greift ab prod-Deploy** (aktuell `404`,
`curl -sf`-tolerant). Stündlich. KEIN vercel.json (Memory `feedback_vps_crons`).

---

## 6. OFFEN — die zwei verbleibenden Streams (für die nächste Session)

### 6a. WhatsApp-**Inbound** JA/NEIN (größtes Teilstück)
Ziel: embed-B-Kunde antwortet „JA"/„NEIN" per WhatsApp (auf den Ping aus §1.3) → direkt Claim schließen / eskalieren,
ohne Portal.
- **Ort:** geteilter Webhook `src/app/api/webhooks/twilio/inbound/route.ts` — hat SCHON JA/NEIN-Parsing (`intent`),
  ABER für Termin-**Buchungs**-Bestätigung VOR dem Termin (`status reserviert/angefragt → bestaetigt`) und matcht nur
  **zukünftige** Termine (`matchInboundToFall` + `gte('start_zeit', now)`).
- **Was nötig ist:** (1) Past-Termin-Match (stale `nur_gutachter`-Termin des Kunden), (2) embed-B-Kontext erkennen
  (offener `embed_b_termin_klaerung`-Task ODER stale-Gate), (3) JA → `bestaetigeTerminAlsKunde(terminId)`, NEIN →
  `meldeSvNichtErschienenAlsKunde(terminId)` (beide existieren bereits in `kunde-termin-resolution.ts`!).
- **Achtung:** der Webhook bedient mehrere Flows (Buchung, Doku-Upload) — additiv + früh-`return`-sauber erweitern, bestehende Intents nicht brechen.

### 6b. Self-Service-**Verlegung** für embed-B (§4.4)
Wenn SV-No-Show bestätigt → neuer Termin. **Überlappt mit der SV-Zuweisungs-/Routing-Logik der Session
`kitta/aar-939-dispatch-offene-anfragen`** (98044b6b) — vor Bau koordinieren. Bestehende Infra: `re-termin`-Token-Flow
(`src/app/kunde/re-termin/[token]/actions.ts`, `faelle.re_termin_token`), `re-termin-eskalation`-Cron. Setzt `fall.sv_id` voraus → bei SV-No-Show ggf. anderer SV (= die Routing-Logik der dispatch-Strecke).

---

## 7. Koordination / Gotchas

- **Nicht selbst mergen** (Merge-Session `kitta/merge-session-rel`). PR #2101 ist bereit.
- **PRs immer `--base staging`.** **DDL nur via Supabase-Plugin** (Regel 2).
- **`v_claim_phase` / claims-SSoT contended** (CMM-Strecke) — `termin_durchgefuehrt` im Terminal-Array beibehalten.
- **Billing (98044b6b) NICHT anfassen** — die Kaskade entscheidet nur den CLAIM-Ausgang, kein Auto-Charge/Void. €70 läuft per Default-Cron.
- Andere aktive AAR-939-Sessions: `aar-939-dispatch-offene-anfragen` (SV-Zuweisung — Verlegungs-Overlap!), `aar-940-self-service` (Monika-Self-Service), `aar-939-embed-b-kunde-grund` (#2096, gemergt).

---

*Erstellt 31.05.2026. PR #2101 = Portal-Pfad + Cron + WA-Ping + Dispatcher-Resolve, alles end-to-end gesmoked.
Memory: `project_aar939_embed_b_claim_mechanik`.*
