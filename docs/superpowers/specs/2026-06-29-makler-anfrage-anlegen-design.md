# Makler legt Kunden-Anfrage an — Design-Spec

**Datum:** 2026-06-29
**Branch:** `kitta/makler-anfrage-anlegen` (off `staging`)
**Status:** Design abgestimmt (Aaron), bereit für Implementierungs-Plan

## Problem & Ziel

Heute kann ein Makler im Portal (`/makler/leads`) nur seinen Promo-Code teilen und passiv
zusehen, welche Leads über den Code reinkommen. Aaron will, dass der Makler **proaktiv einen
Kunden anlegt** und mit einem Submit entweder

1. dem Kunden einen **Self-Service-Link** schickt (Kunde durchläuft den Gutachter-Finder selbst,
   die Anfrage füllt sich weiter), **oder**
2. einen **Rückruf** für den Kunden bucht (Berater ruft an).

**Harte Anforderung (Abrechnung):** Der Makler muss **immer** in der DB mitgesendet werden, damit
der konvertierte Lead bei ihm abgerechnet wird.

**Abgestimmte Entscheidungen:**
- **Flow:** Entweder/oder. Default-Ausgang = **Rückruf** (das ist „falls nicht gewählt automatisch
  als Rückruf gebucht"). Beim „Link senden"-Ausgang wird **kein** zusätzlicher Rückruf gebucht.
- **Pflicht-Datensatz:** Vorname, Nachname, Telefon. Email optional. **Standort (PLZ/Ort) optional**
  — der Makler kann ihn eingeben, muss aber nicht (sonst füllt der Kunde ihn im Finder).
- **UX:** Drawer-Wizard auf `/makler/leads` („+ Neue Anfrage"), ein Screen, ein Submit.
- **Paket:** `service_typ` default `komplett` (LexDrive-/abrechnungsstärker), Kunde/Flow verfeinert.
- **Leitplanke (Aaron):** An die **bestehende Anfrage-/Lead-Infra und die Lifecycles** halten —
  keine neuen Status-Werte, keine parallele Lead-Anlage. Bestehende Writer + Sender + Status-
  Übergänge wiederverwenden.

## Kern-Garantie: Makler-Attribution (verifiziert)

Der **einzige** Attributions-Anker ist `leads.promotion_code_id`. Die bestehende, E2E-getestete
Pipeline (#3151) löst alles Weitere auf — **pfad-unabhängig** (egal ob FlowLink-Self-Service oder
Rückruf/Dispatcher den Lead konvertiert):

```
leads.promotion_code_id = <primärer aktiver Promo-Code des Maklers>
   │
   ▼ convert-lead-to-claim.ts:435–447  (promotion_code_id → promotion_codes.makler_id)
claims.makler_id
   │
   ▼ Trigger trg_makler_provision_on_bridge  (AFTER INSERT faelle_claim_bridge)
makler_provisionen (status='pending', betrag aus makler.provision_betrag_*)
   │
   ▼ Provisions-Freigabe-Cron
Abrechnung beim Makler ✅
```

`/start/makler/[maklerId]/page.tsx:26–48` belegt: der Promo-Code ist exakt der etablierte
Attributions-Identifier (dort via `FinderWizard` → `reserviereEmbedTermin` → `lead.promotion_code_id`).
Wir setzen denselben Wert — nur aus dem Makler-Portal statt aus dem öffentlichen Embed.

## Architektur

### Eine neue Server-Action: `erstelleMaklerAnfrage`
Datei: `src/lib/makler/erstelle-anfrage.ts` (`'use server'`). Result-Object-Pattern (`{ ok, ... }`).

**Sicherheits-Modell (wie `/start/makler` + KB-Konsultations-Cockpit):**
Erst den Makler **user-scoped authentifizieren** (`getCurrentMakler()` → Makler-Row aus dem
eingeloggten User; `null` → Abbruch), dann die Schreibvorgänge mit **service-role**
(`createAdminClient()`) ausführen (Makler hat keinen RLS-Schreibpfad auf `leads`/`flow_links`/
`admin_termine`). Der Promo-Code wird zwingend über `getMaklerPrimaryPromoCode(makler.id)`
aufgelöst → ein Makler kann **nur** auf den **eigenen** Code attribuieren (keine Fremd-Attribution).

**Ablauf:**
1. `getCurrentMakler()` → `makler` (sonst `{ ok:false }`). Auth-User für `actorId` mitnehmen.
2. `getMaklerPrimaryPromoCode(makler.id)` → `promo`. `null` → `{ ok:false, error:'Kein aktiver
   Promo-Code …' }` (defensiv; aktive Makler haben per `admin/makler/actions.ts:118` immer einen).
3. Validierung: Vorname/Nachname vorhanden, Telefon ≥ 5 Zeichen. Bei `ausgang='flowlink'` muss
   mind. ein Kanal erreichbar sein (Telefon **oder** Email) — sonst sauberer Fehler.
4. Dispatcher-Zuweisung („Berater") **je Zweig nach bestehender Infra**: der `flowlink`-Zweig nutzt
   `pickRoundRobinDispatcher(admin)` (wie der kanonische Anfrage-Pfad); der `rueckruf`-Zweig nutzt die
   bestehende Zuweisung in `erstelleOeffentlichenRueckruf` (kein zweiter Pick).
5. **Verzweigung nach Ausgang** (lifecycle-treu):

   **`rueckruf` (Default):** Wiederverwendung der bestehenden Rückruf-Infra
   `erstelleOeffentlichenRueckruf` (`src/lib/actions/public-rueckruf.ts`), additiv erweitert um
   optionale Felder `promotionCodeId` + Standort (PLZ/Ort), die in dessen `createLead`-`extra`
   durchgereicht werden. Liefert bereits: Lead (`status='rueckruf'`, `qualifizierungs_phase='rueckruf'`)
   + `admin_termine` (`typ='rueckruf'`, `start_zeit` = gewählte Zeit oder ASAP) + Dispatch-
   `mitteilungen` + `notifyNewLead` + Kunde-Bestätigungs-WhatsApp. **Kein neuer Code-Pfad** — nur
   `promotionCodeId` mitgeben.

   **`flowlink`:** Kanonische Lead-Anlage + kanonischer Sender (mirror `issueCanonicalFlowLinkForAnfrage`):
   - `createLead(admin, { source_channel:'makler-anfrage', status:'neu', vorname, nachname, telefon,
     email }, { promotion_code_id: promo.id, service_typ:'komplett', qualifizierungs_phase:'erstkontakt',
     zugewiesen_an: dispatcherId, sprache, …standort })` — exakt der Eintritts-Lifecycle eines frischen
     Anfrage-Leads (`issue-canonical-flowlink.ts:175,142`).
   - Versand-Kaskade über `sendFlowLinkMultiChannelCore(admin, leadId, kanal, actorId)`
     (`src/lib/start-link/send-flowlink-multichannel.ts`, reine Lib): WhatsApp → (Fail) SMS → (Fail)
     Email, mit erstem Erfolg abbrechen. Der Core mintet den Token (`ensureCanonicalFlowLinkForLead`,
     idempotent „ein Lead = ein Link"), sendet (Plain-Link, da kein Termin), **setzt selbst
     `status='flow-gesendet'` + `qualifizierungs_phase='flow-versendet'`** (Z. 152–153) + Timeline +
     Versand-State. → **Wir setzen den Status NICHT selbst.**
   - `notifyNewLead` (Team), wie der Self-Service-Pfad.

6. `revalidatePath('/makler/leads')` (+ `/dispatch/leads`, `/dispatch/rueckrufe` im Rückruf-Fall).
7. Rückgabe: `{ ok:true, leadId, ausgang, token? , terminId?, kanal? }` bzw. bei FlowLink-Versand-
   Fehlschlag `{ ok:true, leadId, ausgang:'flowlink', warnung:'Link konnte nicht zugestellt werden …' }`
   (Lead bleibt bestehen, Dispatcher übernimmt — kein stiller Verlust).

### Lifecycle-Abbildung (verifiziert, keine neuen Werte)

| Ausgang | `status` bei Anlage | `qualifizierungs_phase` bei Anlage | nach Aktion |
|---|---|---|---|
| `rueckruf` | `rueckruf` | `rueckruf` | unverändert (Termin offen) |
| `flowlink` | `neu` | `erstkontakt` | Core → `flow-gesendet` / `flow-versendet` |

Quellen: `public-rueckruf.ts:58,65` · `issue-canonical-flowlink.ts:175,142` ·
`send-flowlink-multichannel.ts:152–153`. `source_channel='makler-anfrage'` (neuer, greppbarer,
namespaced Quell-Wert; freitext-Spalte, kein Enum — kein Schema-Change).

### Lead-Feld-Mapping (Standort optional)
- Pflicht-Kontakt: `vorname`, `nachname`, `telefon`, `email?` (via `LeadBase`).
- Attribution: `promotion_code_id` (via `extra`).
- Standort (wenn eingegeben): `fahrzeug_standort_plz` (PLZ) + `fahrzeug_standort_adresse` (Ort).
  Keine Geokodierung (lat/lng bleiben null) — der Kunde verfeinert den Ort im Finder; der Berater
  fragt beim Rückruf nach. Konsistent zu `issue-canonical-flowlink.ts:148–153`.
- `service_typ='komplett'`, `zugewiesen_an=dispatcherId`, `sprache` aus Locale-Cookie.

### Kunde-Journey: kollisionsfrei (lead-gekeyt, KEIN zweiter Lead)
Es gibt **zwei „Finder"** in der App — der Makler-Lead darf nur in den lead-gekeyten:
- **Öffentlicher Map-Finder** (`/start/makler/[maklerId]`, `/embed/gutachter-finder` →
  `reserviereEmbedTermin`) — **erzeugt einen Lead**. Den Kunden hierhin schicken = **zweiter Lead =
  Kollision + Attributions-Split**. **NICHT verwenden.**
- **Kanonische `/flow/[token]`-Strecke** — **lead-gekeyt, erzeugt KEINEN Lead**. Der Sender
  `sendFlowLinkMultiChannelCore` verschickt genau diesen Link (`send-flowlink-multichannel.ts:41`,
  `flowUrl = .../flow/${token}`).

Verifiziert (`flow/[token]/page.tsx`): die Strecke löst den **bestehenden** Lead über
`flow_links.lead_id` auf (Z. 113), lädt ihn (`select('*')`, Z. 165) und operiert darauf —
**keine gfa-Abfrage, keine Lead-Anlage**. Der Gutachter-Finder-Schritt (SV-Matching + Slot) läuft
**im** Wizard (`FlowSlotStep`, `needsBooking=true` für einen termin-losen Lead) und bucht via
`bucheTerminFlow(bezug={typ:'lead', id:leadId})` auf den **bestehenden** Makler-Lead.
`signSAandCreateFall` konvertiert genau diesen einen Lead → Claim (mit `promotion_code_id`
→ `makler_id`).

→ **Ein Lead** vom Makler-Submit bis zur Provision. Strukturell identisch zum produktiv bewährten
Dispatcher-Pfad (`createManualLead` → FlowLink → `/flow`) für gfa-lose Leads. Kein zweiter Lead,
kein Attributions-Split. (Dass der Kunde den Map-Finder separat über die Makler-Promo-URL anstößt
und so ein Parallel-Lead entsteht, ist vorbestehendes Dedup-Thema — beide tragen denselben
Promo-Code, die Abrechnung bleibt korrekt; siehe „Außerhalb des Scopes".)

### UI — Drawer auf `/makler/leads`
Neue Client-Komponente `src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx` + Trigger-Button
(„+ Neue Anfrage") im `PageHeader` der Leads-Seite. Komponenten aus dem bestehenden Set
(`primitives/Modal`, `shared/forms/TextField`, `primitives/Button`), keine handgerollten Atoms.

Ein Screen:
- **Kontakt:** Vorname, Nachname, Telefon (Pflicht), Email (optional).
- **Standort (optional, aufklappbar):** PLZ, Ort.
- **Ausgang** — zwei große Auswahl-Buttons, **„Rückruf" vorausgewählt**:
  - „📞 Rückruf buchen" → optionaler Zeit-Picker (leer = ASAP).
  - „📲 Link an Kunden senden" → Hinweis „Kunde erhält per WhatsApp/SMS/Email einen Link und
    durchläuft den Gutachter-Finder selbst."
- Submit → `erstelleMaklerAnfrage` → Toast (Erfolg/Warnung/Fehler) → Drawer schließt → Lead
  erscheint **sofort** in der Liste (greift via `promotion_code_id`-Filter von
  `getMaklerLeadsWithConsent` — kein neues Listen-Plumbing). Submit-Button während `pending`
  gesperrt (Doppel-Submit-Schutz).

Alle nutzersichtbaren Strings mit echten Umlauten; i18n-Keys unter `makler.anfrage.*` in allen
6 Locales (de befüllt, en/pl/ru/tr/ar mindestens als de-Fallback-Platzhalter, konsistent zur
Portal-i18n-Praxis).

## Fehlerbehandlung & Edge-Cases
- **Kein aktiver Promo-Code:** Action-Fehler mit klarer Meldung (defensiv; sollte nicht auftreten).
- **FlowLink-Versand scheitert** (keine erreichbare Nummer/Mail): Lead bleibt (`status='neu'`),
  `warnung` im Result, Dispatcher sieht den Lead in `/dispatch/leads`. Kein Auto-Fallback auf Rückruf
  (sauberes Entweder/oder, wie abgestimmt).
- **Doppel-Submit:** Client-seitiger Button-Lock. (Server-seitige Lead-Dedup ist außerhalb des
  Scopes — entspricht dem bestehenden Verhalten von `createManualLead`/`erstelleOeffentlichenRueckruf`.)
- **Server-Actions** liefern Result-Objects (kein `throw`); Non-Critical-Sends (WA/Email/Timeline)
  bleiben in try/catch und brechen die Lead-Anlage nie (Pattern aus `public-rueckruf.ts`).

## Tests (vitest)
`src/lib/makler/__tests__/erstelle-anfrage.test.ts` mit gemocktem Supabase-Client:
1. **Attribution:** `promotion_code_id` wird auf den Lead gesetzt (= der eigene Makler-Code). *Kritisch.*
2. **Default-Ausgang:** ohne explizite Wahl → Rückruf-Pfad (`admin_termine`-Insert).
3. **`flowlink`-Pfad:** ruft den Sender mit der richtigen Kanal-Kaskade; Status-Transition liegt im Core.
4. **`rueckruf`-Pfad:** delegiert an `erstelleOeffentlichenRueckruf` inkl. `promotionCodeId`.
5. **Fremd-Attribution unmöglich:** Promo-Code wird aus `makler.id` des eingeloggten Users abgeleitet,
   nicht aus Input.
6. **Kein Promo-Code → Fehler.**

## Datei-Blast-Radius & Koordination
**Neu (Makler-eigen, 0 Kollision):**
- `src/lib/makler/erstelle-anfrage.ts`
- `src/app/makler/(shell)/leads/NeueAnfrageDrawer.tsx`
- Trigger-Button in `src/app/makler/(shell)/leads/page.tsx` (bzw. `MaklerLeadsTable`-Header)
- i18n `makler.anfrage.*` in `src/i18n/messages/*.json`
- Test

**Additiv erweitert (1 geteilte Datei, nicht „heiß"):**
- `src/lib/actions/public-rueckruf.ts` — `RueckrufInput` += optional `promotionCodeId`/Standort,
  durchgereicht an `createLead`-`extra`. Bestehende Caller (Marketing-Formulare) unberührt.

**Reuse import-only (NICHT editieren):**
- `createLead` (`src/lib/leads/create-lead.ts`)
- `pickRoundRobinDispatcher` (`src/lib/start-link/pick-dispatcher.ts`)
- `sendFlowLinkMultiChannelCore` (`src/lib/start-link/send-flowlink-multichannel.ts`) — reine Lib,
  **nicht** die heiße `dispatch/leads/[id]/_actions/flowlink.ts`. Import → kein Merge-Konflikt mit aar-956.
- `ensureCanonicalFlowLinkForLead` (wird vom Core intern genutzt)
- `getCurrentMakler` / `getMaklerPrimaryPromoCode` (`src/lib/makler/queries.ts`)
- `notifyNewLead`

**Unangetastet:** `convert-lead-to-claim.ts`, Trigger `trg_makler_provision_on_bridge`,
`/flow/[token]`-Strecke, Embed/aar-956-Interna. **Kein DB-Schema-Change, keine Migration.**

Aktive Sessions: keine arbeitet am Makler-Portal (verifiziert). aar-956-Sessions berühren
`flow/[token]` + `issue-canonical-flowlink` + die dispatch-`flowlink.ts` — wir importieren nur
die lib-Sender/Bridge, editieren keine dieser Dateien.

## Außerhalb des Scopes / Follow-ups
- Server-seitige Lead-Dedup (Makler legt denselben Kunden doppelt an).
- `gutachter_finder_anfragen`(gfa)-Row: **bewusst nicht** — die gfa ist der Geo-/Marketing-Anker des
  öffentlichen Finders; der Makler-Lead ist lead-nativ (wie der Dispatcher-`createManualLead`-Pfad),
  trägt keine Finder-Geo. Der Kunde steigt über den kanonischen `/flow/[token]` ein (lead-gekeyt),
  nicht über das gfa-Embed.
- Optionaler Paket-Wähler (`nur_gutachter`) im Drawer — vorerst default `komplett`.
