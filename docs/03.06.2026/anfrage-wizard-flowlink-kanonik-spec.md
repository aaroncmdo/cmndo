# Spec — Anfrage → Wizard → FlowLink: kanonisches Funnel-Modell

**Stand:** 2026-06-03 · **Quelle:** Aaron-Spec (Live-Durchsprache 03.06., nach dem dispatch-config-unify-Cutover) · **Owner-Empfehlung:** `cdd8f4f3` (`aar-956 flow-booking`) + WA-Worker-Session (Baileys/VPS) · **Verwandt:** `project_dispatch_config_unify`, AAR-956, AAR-940 (Monika).

> Zweck: EIN kanonisches Funnel-Modell festschreiben (Wizards → Anfragen → Lead → FlowLink) + die offenen Bugs. Diese Session (dispatch-config-unify-Verifikation) hat den Stand auditiert; gebaut wird in `aar-956 flow-booking` (Kollisions-Vermeidung — nicht parallel).

---

## 1. Prinzip: EINE kanonische Quelle für alles

- **SV-Matching/Ranking** = `lib/dispatch/findBestSV` (Dispatcher + FlowLink via `sv-matching-modul/matchAndSlots` + Monika via `fixerSvId`). **Keine zweite Matching-Engine** im Flow. (Einzige bewusste Duplikat: der **Termin-Engine-Port** `lib/termine/engine/matching-score.ts` = transitorischer Mirror, geplanter Phase-3-Repoint → dann findBestSV retiren = wieder eine Quelle. Mit den termin-engine-Sessions koordinieren.)
- **Anfrage → Lead → FlowLink** = `app/start/[anfrageId]/route.ts` → `lib/start-link/issue-canonical-flowlink.ts` (HMAC-verifiziert, anon). Das ist die **eine** Konversions-Brücke. (Löst das „Doppel" auf: kein `/anfrage-self_service_token` mehr.)
- **Zwei Quellen für dasselbe = Bug**, außer dokumentierte Migration (s. termin-engine).

---

## 2. Das kanonische Funnel-Modell

```
[Public Wizards]            [Konversion]              [Dynamischer FlowLink]
mini-wizard /schaden-melden  ─┐
gutachter-finder /gutachter-… ─┤→ gutachter_finder_anfragen ──/start/[anfrageId]──▶ Lead ──▶ flow_links ──▶ /flow/[token]
Monika-Embed                 ─┘   (public-safe Spalten,        (issueCanonical-       (create-   (lead_id)     • Resolver: SV/Termin
                                   je Quelle UNTERSCHIEDLICH)    Flowlink, HMAC)        Lead)                   • SIGNATUR (SA/Vollmacht)
```

1. **Public Wizards** (mini-wizard, gutachter-finder, Monika-Embed) schreiben in **`gutachter_finder_anfragen`** (public-safe Spalten — die Tische sind anon-erreichbar). Die Wizards **laufen je Quelle unterschiedlich** (verschiedene Felder/Schritte) — *das ist gewollt, dafür sind die Anfragen da.*
2. **Beim Absenden** → `/start/[anfrageId]` → `issueCanonicalFlowlink`: Anfrage → **`createLead`** (Dispatcher round-robin) → **EIN `flow_links`** (lead_id) → Initial-Link-Versand (**WA bevorzugt, Email-Fallback**).
3. **`/flow/[token]`** = der **dynamische FlowLink**: SV/Termin-Resolver (§4) + **Signatur** (§3).

---

## 3. HARTE Trennung: Anfrage vs. FlowLink (Aaron-Prinzip)

- **Anfrage/Wizard** = **Daten erfassen + (optional) Termin vergeben** (via Resolver §4). **NIEMALS Signatur.** „Die Anfrage-Flows sind NICHT zur Unterschrift da."
- **FlowLink (`/flow`)** = **SA + Vollmacht-Signatur**. Der in der Anfrage **reservierte + geblockte** Termin wird **bei SA-Unterschrift AUTOMATISCH bestätigt** — **nicht** manuell durch den SV.

---

## 4. SV/Termin-Resolver (eine Quelle, in die Wizards integriert)

Beim Auflösen (im Wizard bzw. `/flow`) — **kontextualisiert, aber dieselbe `matchAndSlots`/`findBestSV`-Quelle**:

1. **SV + Termin gesetzt** (Dispatcher gebucht ODER Monika an konkreten SV) → nutzen, **NICHT** „wir suchen einen SV" zeigen, **nicht** neu suchen.
2. **SV gesetzt, kein Termin** → Termin bei **diesem** SV buchen.
3. **Weder SV noch Termin** → Besichtigungsort in DB?
   - **fehlt** → **im Flow abfragen** (nicht „wir melden uns telefonisch").
   - **da** → SV via `matchAndSlots(findBestSV)` + Besichtigungsort finden + Termin buchen.
4. **Monika-Sonderfall** (`fixerSvId` aus `gfa.zugeordneter_sv_id`, nur-Gutachter an konkretem SV) → **nicht** neu suchen.
5. **Termin** = reserviert + geblockt → Auto-Confirm bei SA-Unterschrift (§3).

---

## 5. service_typ (Komplett vs. nur-Gutachter)

- Wenn **noch nicht geklärt** → **Auswahl-UI anzeigen** (Kunde wählt komplett / nur-Gutachter).
- Wenn bestimmt (z.B. Monika „nur Gutachter") → nutzen; `service_typ='gutachter'` → Slot-/Komplett-spezifische Schritte entsprechend.

---

## 6. Bugs / offene Punkte

1. 🔴 **WhatsApp wird nicht zugestellt** (Aaron-Test 03.06.: App bestätigt „per WhatsApp gesendet", **keine WA angekommen**). **App-seitiger Send-Befund (geprüft):** `lib/whatsapp/baileys-client.sendWhatsAppText` gibt ein **strukturiertes `SendResult`** zurück (`ok` / `error`+`code`: `baileys_not_connected` | `recipient_not_on_whatsapp` | `send_failed` | `config_missing`) — schluckt nicht selbst. POSTet an `${BAILEYS_BASE_URL ?? 'http://localhost:3055'}/send` mit Header `X-Baileys-Token` (`BAILEYS_AUTH_TOKEN`). → **Wahrscheinliche Ursachen, in Reihenfolge:**
   - (a) **Worker-WA-Session disconnected** → Worker `/send` liefert 503 → `baileys_not_connected`; braucht reconnect/re-auth.
   - (b) **Send-Prozess erreicht den Worker nicht**: der Worker ist `localhost:3055` auf dem **App-VPS**. Läuft der mini-wizard-Send auf dem **getrennten Marketing-Deploy**, muss `BAILEYS_BASE_URL` auf die Worker-Adresse zeigen + `BAILEYS_AUTH_TOKEN` gesetzt sein — sonst `config_missing` / unreachable.
   - (c) **Caller maskiert den Fehler**: Confirmation zeigt `kanal=whatsapp`/„gesendet" nach dem `availability`-Precheck (Intent), **ohne das `SendResult` zu prüfen** → ein Send-Fehler bleibt unsichtbar.
   - **Fix-Punkte (WA-Owner/Infra):** Worker `/status` prüfen (connected?), Env des Send-Prozesses (`BAILEYS_BASE_URL`/`BAILEYS_AUTH_TOKEN` + Erreichbarkeit des Workers), und die Confirmation an das echte `SendResult` koppeln (statt an den availability-Intent).
2. 🔴 **„wir suchen einen SV"-Text** als falscher Zustand statt aktiv lösen/abfragen (§4).
3. 🔴 **Besichtigungsort fehlt → im Flow abfragen** (heute `self-service-actions.ts:119` „wir melden uns telefonisch").
4. 🔴 **service_typ-Auswahl-UI** fehlt wenn unbestimmt (§5).
5. 🟡 **Resolver in `gutachter-finder` + `Monika`-Wizards integrieren** (kontextualisiert, eine Quelle).
6. 🟡 **Auto-Confirm-on-SA verifizieren** (Termin → bestätigt bei SA, nicht SV-manuell).

---

## 7. Was schon existiert (Basis — nicht neu bauen)

- ✅ `/start/[anfrageId]` + `issueCanonicalFlowlink` (Anfrage→Lead→FlowLink, idempotent, WA/Email).
- ✅ `sv-matching-modul/matchAndSlots` → `findBestSV` (eine Quelle) + `fixerSvId` (Monika).
- ✅ AAR-956 §3a „incomplete-Pfad" (`FlowWizardKfz` + `FlowSlotStep`, Quali+Slot für termin-lose Leads).
- ✅ `service_typ='gutachter'` → Slot-Step-Logik vorhanden.
- ✅ Besichtigungsort lat/lng + `gutachter_termine`-Buchung.

→ Die Arbeit = die **6 Lücken** auf dieser Basis schließen + den Resolver in die Wizards heben. **Keine dritte Matching-/Konversions-Quelle einführen.**

---

## 8. Owner / Koordination

- **`cdd8f4f3`** (`aar-956 flow-booking`) baut §2–§6.2–6.6 (FlowWizardKfz/self-service-actions/`/start`/die Wizards). Diese Session baut **nicht parallel** (Frontal-Kollision auf denselben Files).
- **WA-Zustellung (6.1)** = Baileys/VPS-Worker-Session (Infra), nicht der Funnel-Code.
- **SV-Resolver** bleibt auf `matchAndSlots`/`findBestSV`; mit den **termin-engine-Sessions** koordinieren (Repoint-Plan, §1).
