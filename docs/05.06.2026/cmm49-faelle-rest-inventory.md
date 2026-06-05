# CMM-49 — `from('faelle')` Rest-Inventar (Daten-getrieben)

**Stand:** 2026-06-05 · **Basis:** `node scripts/cmm49-classify-faelle-reads.mjs` auf `origin/staging` (inkl. gemergte #2457/#2459/#2462; ohne die offenen #2464/#2465/#2467).
**Zweck:** vollständige, owner-zugeordnete Landkarte aller verbleibenden `from('faelle')`-**Tabellen-Zugriffe** als Entscheidungsgrundlage für die CMM-49-Reststrecke bis `DROP TABLE faelle`.

> **Drop-Kritikalität (Kernregel):** Nur `from('faelle')`-**Tabellen**-Zugriffe blocken `DROP TABLE faelle` (Query crasht wenn Tabelle weg). Child-Reads `.eq('fall_id', x)` auf ANDEREN Tabellen blocken NICHT — die Spalte überlebt den Table-Drop und gehört in die spätere separate Column-Cleanup-Phase. Dieses Inventar zählt nur echte `from('faelle')`-Calls (Kommentare gefiltert).

---

## 1. Histogramm (total 328)

| Bucket | n | Bedeutung |
|---|---:|---|
| **EMBED** | 155 | `faelle.select('… claims:claim_id(…)')` — faelle als Anker zu claims-Feldern |
| **OTHER** | 65 | Reads mit diversem Select, kein klarer Key |
| **WRITER** | 44 | `.update/.insert/.delete` auf faelle |
| **ANCHOR** | 23 | `select('id')` — Existenz **oder** claim_id→fall_id-Reverse-Lookup |
| **KEY_OTHER** | 19 | `.eq/.in` auf anderem Key |
| **KUNDE_ID** | 18 | kunde_id-Reads |
| **EXISTENCE** | 4 | reine `select('id')`-Existenz |
| **PURE_BRIDGE** | 0 | ✅ komplett erledigt (#2423 + aar-956 #2437) |

**Verteilung:** app/ 178 · lib/ 128 · components/ 5 · scripts/ 13.

---

## 2. Der entscheidende Split: EMBED 155 = 49 Entity-gated + 106 claims-nativ

Der größte Bucket teilt sich sauber:

- **106 claims-nativ** (`claims:claim_id(claim_nummer | kundenbetreuer_id | operative_status | created_at | …)` + ggf. faelle-native Spalten mit 0-diff-claims-Pendant: kunde_id→geschaedigter_user_id, lead_id→claims.lead_id [gebackfillt], sv_id→claims.sv_id, status→operative_status). → **Mechanisch faelle-frei repointbar** via `resolveClaimId` + claims-direkt. Das ist die eigentliche nächste Welle.
- **49 Entity-gated** (Select enthält `halter_*` / `fahrzeug_*` / `gegner_*` / `kennzeichen` / `schadenort` / `vorschaden` / `vehicle`). → **Entity-Revier** (v_claim_full). `halter/fahrzeug/kennzeichen/vs` sind auf v_claim_full LIVE; **`gegner_*`-flat ist NOCH NICHT live** (Entity #2429 §7, additiv-bei-Execution) → diese Teilmenge ist hart blockiert bis Entity ausführt.

(OTHER 65: nur 7 Entity-gated → ~58 sind ebenfalls claims-nativ/leicht; ANCHOR/KUNDE_ID s.u.)

---

## 3. Nach Owner (handlungsleitend)

### A) MEINE Lane — claims-nativ, kein Revier, mechanisch (nächste Wellen)
Faelle-als-Anker → claims-direkt. Aufgeteilt nach Smoke-Last:

**A1 · Backend API-Routes / lib (niedrige Smoke-Last) — direkt machbar:**
- `app/api/baileys/inbound:170` `claims(kundenbetreuer_id)`
- `app/api/twilio/inbound-kb-whatsapp:91,104` `claims(kundenbetreuer_id, created_at)`
- `app/api/webhooks/twilio/inbound:322,706` `claims(kundenbetreuer_id, claim_nummer)` (Datei schon in #2457 angefasst — diese EMBEDs blieben)
- `app/api/cron/case-billing-batch:72` `claims(operative_status)` · `community-leaderboard-update:66` · `release-makler-provisionen:93` (cron, claims-nativ)
- `app/api/pdf/kanzlei-paket/[id]:21` `claims(claim_nummer, gutachten(…))`
- `lib/email/*` (6 EMBED) — Email-Compose-Reads, claims-nativ prüfen
- `lib/sla/kanzlei-mahnungen:252,256` kunde_id (NON-Auth Mahnungs-Notification) + `lib/dokumente/zuordnung:238` / `anforderung:103` (in #2444 bewusst ausgelassen — nachziehen)

**A2 · Portal-Pages (claims-nativ, aber Smoke-Last / page-zentrisch):**
- `app/admin/{kalender,meine-tasks,reklamationen,tasks}/page` `claims(claim_nummer)` (je 1, trivial)
- `app/admin/finance/(hub)/page:513,534,547,664` `claims(created_at, regulierungs_betrag, lead_preis_netto)`
- Teile von `app/faelle` (12 EMBED, claims-nativ-Anteil) · `app/kunde` (9 EMBED) · `app/gutachter` (23 EMBED, claims-nativ-Anteil)

### B) Entity-Revier — v_claim_full (49 EMBED + 7 OTHER, Entity-gated)
Liest `halter_*/fahrzeug_*/gegner_*/kennzeichen/schadenort/vorschaden`. Read-Path = v_claim_full.
- **`gegner_*`-Teilmenge = HART BLOCKIERT** bis Entity die gegner-flat-Columns live schaltet (#2429 §7).
- `halter/fahrzeug/kennzeichen/vs`-Teilmenge ist auf v_claim_full live → mit Entity koordiniert read-baar.
- Hotspots: `app/gutachter` (Anteil von 23 EMBED), `app/faelle`, `lib/makler/copilot-prompt` (gegner_name/gegner_versicherung), `app/api/sv/upload-with-ocr:81` (kennzeichen), `app/api/ocr-trigger:131` (halter_geburtsdatum), `lib/branding/token-theme`.

### C) termin-engine (ab96fed4)
- **KUNDE_ID:** `app/api/cron/{kb-termin-reminder,kb-termin-reminder-1h,termin-erinnerungen,termin-morgen-erinnerung}` (4), `app/gutachter/termine/[id]/actions:72`, `lib/actions/termin-actions:126,458`, `lib/actions/termin-verlegung-actions:690,778` (4).
- **EMBED:** `app/api/kunde/termin/{absagen,verschieben}`, `app/api/termin/ablehnen`, `lib/termine/*`, `lib/google-calendar/*`, `app/api/termin/*`.

### D) aar-956 (flow-resolver)
- `app/flow/[token]/actions:303`, `app/flow/[token]/page:159` (KUNDE_ID) + flow-EMBED/OTHER (13 in app/flow gesamt).

### E) CMM-63 (Auth-Ownership + Batch-Loader)
- `lib/claims/kunde-ownership.ts` (assertKundeOwnsFall — aktives File, claim-keyed Twin existiert) — KUNDE_ID:4 + ANCHOR:186.
- `lib/claims/get-kunde-faelle.ts:231,445` (ANCHOR/Batch-Loader, FALL_SELECT enthält Entity-Felder → Entity+CMM-63-Mischung).

### F) Route-Key-Migration / „revalidate-fallId" (ANCHOR 23, VERBOTEN naiv zu swappen)
`select('id')`-Reverse-Lookups (`.eq('claim_id', claimId)` → fall.id) **nur** für `revalidatePath('/faelle/${fallId}')` o.ä. Faelle-frei nur via claimId-in-URL (Route-Key-Migration) — Bridge-Reverse bleibt **verboten**.
- `lib/kanzlei-wunsch/actions.ts:166,192,227,265,298,387` (6)
- `lib/gutachten/ocr-actions.ts:88,179,240` (3, zusätzlich CMM-44 SP-G)
- `app/kunde/{faelle/[id]:176, nachbesichtigung:18, onboarding/actions:538}` (3)
- `app/api/lexdrive/{bot-callback:49, vollmacht-confirm:48}`, `app/api/webhooks/lexdrive:56`, `app/api/chat/inbox-threads:54`, `app/api/search:59`, `lib/auftrag/create:70`, `lib/claims/endzustand-actions:49`, `lib/kanzlei/actions:49`.

### G) P3-WRITER (44)
Deploy-safe Dual-Writes (bleiben bis P5-Column-Drop) + Smoke-Helper + echte P3-Writes. Hotspots: `app/faelle` (8), `lib/abrechnung` (3), `app/api/seed-testdata` (3), `app/gutachter` (3), `lib/faelle` (2), `lib/lexdrive` (2, die belassenen Dual-Writes), `app/api/admin` (2). **Blockieren den Table-Drop** (anders als child-fall_id-Writes) → müssen vor P5 auf claims-only oder via Trigger.

### H) Hotpath (separat, dead-code-activation-Risk)
- `lib/dokumente/konditional-tasks:80` (kunde_id) · `lib/leads/convert-lead-to-claim` (Conversion). Erst gegen Live-Flow verifizieren.

---

## 4. Empfohlene Sequenz
1. **A1 jetzt** (Backend-API/lib claims-nativ) — kollidiert mit niemandem, mechanisch, niedrige Smoke-Last. ~12–18 Sites, mehrere kleine PRs.
2. **A2 danach** (Portal-Pages claims-nativ) — pro Portal eine PR + Smoke-Screenshots.
3. **F (Route-Key-Migration)** als eigenes Vorhaben — entsperrt ANCHOR + die revalidate-fallId-Reste global. Braucht Entscheidung: `/kunde|/admin/faelle/[id]` auf claimId-in-URL.
4. **B (Entity)** sobald Entity gegner-flat live schaltet → EMBED-Entity-Welle via v_claim_full.
5. **C/D/E** mit den Ownern (termin-engine/aar-956/CMM-63).
6. **G (Writer) + P5** zuletzt: erst alle Reads weg, dann Writer auf claims-only + `derive_claim_id_from_fall()`-Fix (liest noch faelle, P5-Gate) + `DROP TABLE faelle`.

## 5. Zu verifizieren / Notizen
- **`zuordnung:238` + `anforderung:103`** zeigen noch kunde_id obwohl #2444 die Files anfasste — waren dort **bewusst ausgelassen** (Memo: „in #2444 ausgelassen, nachziehen"). Gehören in A1.
- **`zb1-actions:111`** zeigt noch kunde_id — ist in **#2464 erledigt** (noch nicht gemergt) → verschwindet beim Merge.
- **PURE_BRIDGE 0** bestätigt: Bridge-Welle vollständig.
- **Bridge `faelle_claim_bridge`** überlebt `DROP TABLE faelle` (kein FK zu faelle) — permanenter Route-Key-Map.
- **0-diff-Basis** (live verifiziert): kunde_id↔geschaedigter_user_id, sv_id↔claims.sv_id, lead_id↔claims.lead_id (nach Backfill 20260604225709), status↔operative_status.

## 6. Session-Fortschritt (05.06.)
Erledigt/offen diese Session: #2457 (MERGED), #2459 (MERGED), #2462 (MERGED, +lead_id-Backfill), #2464/#2465/#2467 (offen). kunde_id-Sweep faelle-frei abgeschlossen (bis auf termin/CMM-63/Hotpath-Anteile, s.o.); SLA-Cron-Reader faelle-frei; Koordinator-Auth-Gate-Reklassifizierung umgesetzt.
