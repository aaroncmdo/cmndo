# Spec — Anfrage → Wizard → FlowLink: kanonisches Funnel-Modell

**Stand:** 2026-06-03 · **Quelle:** Aaron-Spec (Live-Durchsprache 03.06., nach dem dispatch-config-unify-Cutover) · **Owner-Empfehlung:** `cdd8f4f3` (`aar-956 flow-booking`) + WA-Worker-Session (Baileys/VPS) · **Verwandt:** `project_dispatch_config_unify`, AAR-956, AAR-940 (Monika).

> Zweck: EIN kanonisches Funnel-Modell festschreiben (Wizards → Anfragen → Lead → FlowLink) + die offenen Bugs. Diese Session (dispatch-config-unify-Verifikation) hat den Stand auditiert; gebaut wird in `aar-956 flow-booking` (Kollisions-Vermeidung — nicht parallel).

---

## 1. Prinzip: EINE kanonische Quelle für alles

- **SV-Matching/Ranking** = `lib/dispatch/findBestSV` (Dispatcher + FlowLink via `sv-matching-modul/matchAndSlots` + Monika via `fixerSvId`). **Keine zweite Matching-Engine** im Flow. (Einzige bewusste Duplikat: der **Termin-Engine-Port** `lib/termine/engine/matching-score.ts` = transitorischer Mirror, geplanter Phase-3-Repoint → dann findBestSV retiren = wieder eine Quelle. Mit den termin-engine-Sessions koordinieren.)
- **Anfrage → Lead → FlowLink** = `app/start/[anfrageId]/route.ts` → `lib/start-link/issue-canonical-flowlink.ts` (HMAC-verifiziert, anon). Das ist die **eine** Konversions-Brücke. (Löst das „Doppel" auf: kein `/anfrage-self_service_token` mehr.)
- **Zwei Quellen für dasselbe = Bug**, außer dokumentierte Migration (s. termin-engine).

---

## 1a. DER EINZIGE Prozess — konkurrierende/Legacy-Pfade WEG

Der Funnel aus §2 ist **der einzige** Anfrage→Lead→FlowLink-Weg. Alle konkurrierenden/Legacy-Self-Service-Pfade werden **konsolidiert + entfernt**, nicht parallel gehalten — sonst entsteht wieder das „Doppel". **Inventar (jeweils: Consumer prüfen → auf `/start` umlenken → dann löschen, nicht blind):**

- `lib/self-service/issue-flowlink.ts` — **AAR-940-Altpfad** (setzt `self_service_token`, sendet `/anfrage/[token]`) → ersetzt durch `start-link/issue-canonical-flowlink.ts`.
- `app/anfrage/[token]/*` (route/actions/page/`BeauftragungWizardStart`) — die `self_service_token`-Landing → ersetzt durch `/start/[anfrageId]` → `/flow/[token]`. Inkl. der `self_service_token*`-Spalten auf `gutachter_finder_anfragen` (nach Cutover droppen — DDL via Supabase-Plugin, Regel 2).
- `lib/actions/konvertiere-anfrage-zu-fall.ts` — alte Anfrage→Fall-Konversion mit **eigenem `flow_links`-Insert** (:403) → ersetzt durch `createLead`-Promotion in `issueCanonicalFlowLink`.
- `lib/self-service/anfrage-actions.ts`, `components/onboarding/finalizeAnfrage.ts`, `app/api/anfrage-from-lp/route.ts` — prüfen, ob sie **eigene** Konversion/Versand machen; falls ja → auf `/start` umlenken, sonst belassen.

**`flow_links`-Inserts (genau 4 heute):** nur **`issue-canonical-flowlink.ts`** bleibt für diesen Funnel. **Klären (Aaron):** der **Dispatcher-Portal-Versand** (`dispatch/leads/[id]/_actions/flowlink.ts` + `lib/actions/dispatch-fall-actions.ts`) bedient *Dispatcher-bearbeitete* Leads, nicht Marketing-Anfragen — bleibt er ein separater Portal-Pfad (Default-Annahme: ja) oder soll auch er über die kanonische Brücke laufen?

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

1. 🔴 **WhatsApp wird nicht zugestellt → Fallback-Lücke** (Aaron-Test 03.06.). **VPS-Diagnose 03.06. (bestätigt):** der Baileys-Worker **läuft + ist verbunden** — `pm2: claimondo-baileys online`, `GET :3055/health → {"state":"open","has_qr":false}`, `BAILEYS_AUTH_TOKEN` gesetzt, `BAILEYS_BASE_URL=http://localhost:3055`. **Der Worker ist NICHT die Ursache.** Die Lücke sitzt im Send-Pfad `issue-canonical-flowlink.ts:sendeInitialLink`:
   - Heute: `checkAndCacheAvailability` → bei `verfuegbar===true` WA-Send → sonst **Email**-Fallback.
   - **Bug 1:** WA `verfuegbar===false` UND keine Email → `return 'none'` → **es geht NICHTS raus**.
   - **Bug 2:** **kein SMS-Fallback** (Aaron: „im Self-Service muss der Fallback SMS oder Email sein, für den Anfang").
   - **Bug 3:** `return 'whatsapp'` schon bei `sent.ok===true` — das ist **Worker-Annahme, nicht Zustellbestätigung**; ein nicht-zugestelltes WA bleibt unsichtbar.
   - **Fix (AAR-956-Sessions):** Fallback-Kette **WA → SMS → Email**, sodass IMMER ein Kanal rausgeht. SMS via `sendSmsTemplate` (Twilio, `lib/whatsapp/send-sms-template.ts`) — Achtung: template-gebunden (ContentSid), der kanonische Link ist Plain-Link → Plain-Twilio-SMS (raw `buildText`) oder schlankes canonical-link-SMS-Template.
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
