# Auto-Beratungstermin — Design (AAR-956)

**Datum:** 2026-06-23
**Branch:** `kitta/aar-956-auto-beratungstermin` (ab `staging`)
**Status:** Design freigegeben (Aaron 23.06.) — Spec-Review ausstehend

## Ziel

Jeder neue Lead bekommt **DB-nativ + automatisch** einen Beratungstermin (KB-Videoberatung/-Anruf) mit einem Schadenberater aus dem Kundenbetreuer-Pool. Der Kunde sieht den Termin im `/flow`-FlowLink und kann ihn **frei verschieben**, falls die Default-Zeit nicht passt.

## Architektur (Kurzfassung)

Drei Bausteine:

1. **DB-Trigger** `AFTER INSERT ON leads` → `create_auto_beratungstermin()`: weist (falls noch unbesetzt) einen KB per fairer Round-Robin-Logik zu und legt den `kb_beratung`-Termin in `gutachter_termine` mit einer Default-Zeit an. Voll DB-nativ, atomar zur Lead-Anlage (Muster: `trg_werkstatt_provision_on_claim`).
2. **`/flow`-Reschedule-Karte**: zeigt den Beratungstermin im FlowLink; „Passt mir" bestätigt, „Verschieben" öffnet 3 verfügbarkeitsgeprüfte Slot-Vorschläge (Wiederverwendung der Verlegungs-Engine + #2979-Muster).
3. **Benachrichtigung (App-Layer)**: KB wird über den neuen zugewiesenen Lead informiert (Erweiterung des bestehenden `on_lead_created`-Notify); der Kunde sieht den Termin im Flow. Proaktive WA/Email-Bestätigung = Follow-up (s. Out-of-Scope).

## Tech-Kontext (verifiziert gegen Live-DB 23.06.)

- **Speicher:** `gutachter_termine`, `typ='kb_beratung'` (kein neuer Enum-Wert nötig — Constraint erlaubt `sv_begutachtung|kb_beratung|konfrontation`). Es gibt **kein** `kb_termine` (Report-Widerspruch geklärt: `kb-booking.ts:158` insertet `kb_beratung` in `gutachter_termine`).
- **Assignee:** `assignee_typ='kundenbetreuer'` + `assignee_id=<profiles.id>` (Constraint erlaubt `sachverstaendiger|sv_lead|kundenbetreuer|kanzlei`).
- **Bindung:** `lead_id` (Pflicht für diesen Termin), `claim_id` (wird bei Lead→Claim-Konversion nachgezogen, s.u.).
- **KB-Pool:** `profiles.rolle='kundenbetreuer' AND aktiv=true`. Aktuell **2** aktive KB.
- **Vorhandene Spalten** (alle da): `start_zeit, end_zeit, status, kanal, verlegung_quelle_id, verlegung_initiator_kunde`.
- **Wiederverwendbar:** `src/lib/termine/kb-booking.ts` (bestehende KB-Termin-Anlage/-Verlegung), `src/lib/actions/termin-verlegung-actions.ts` (`kundeTerminVerlegungVorschlagen`, Kunde-initiierte Verlegung), `src/lib/termine/engine/state-transitions.ts` (`verlege`).

## Bestätigte Design-Entscheidungen (Aaron)

| # | Frage | Entscheidung |
|---|---|---|
| 1 | Owner bei Lead→Claim-Konversion | **Bleibt beim Schadenberater** — kein Re-Assign |
| 2 | Reschedule-UI | **Karte direkt im `/flow`** (inline Slot-Wahl) |
| 3 | Trigger-Zeitpunkt & Owner-Quelle | **Sofort bei Lead-Anlage + Pool-KB-Zuweisung** (Round-Robin) |
| 4 | Auto-Default-Zeit | **Nächster Werktag, feste Uhrzeit (10:00 Europe/Berlin)**, ohne Verfügbarkeitsprüfung |
| 5 | Scope | **Leads mit `status='neu'` + gültigem Kontakt**, ausgenommen disqualifizierte & reine Rückruf-Leads |
| 6 | Kanal-Default | **`telefon`** (im /flow auf Video umstellbar) |

## Baustein 1 — DB-Trigger `create_auto_beratungstermin()`

**Trigger:** `AFTER INSERT ON public.leads FOR EACH ROW` (SECURITY DEFINER, RETURNS trigger). Anlegen via Supabase-Plugin (Regel 2).

**Ablauf (plpgsql):**

1. **Scope-Gate** (früher Exit, `RETURN NEW`): nur fortfahren, wenn
   - `NEW.status = 'neu'`, **und**
   - ein gültiger Kontakt existiert (`NEW.telefon IS NOT NULL OR NEW.email IS NOT NULL`), **und**
   - kein Ausschluss greift (`NEW.source_channel` nicht in der Rückruf-/Spam-Ausschlussliste; `NEW.disqualifiziert IS NOT TRUE` bzw. das tatsächliche Disqualifikations-Feld — im Plan gegen die `leads`-Spalten zu verifizieren).
2. **Idempotenz-Guard:** `IF EXISTS (SELECT 1 FROM gutachter_termine WHERE lead_id = NEW.id AND typ='kb_beratung') THEN RETURN NEW; END IF;` (schützt gegen Re-Fire; bei AFTER INSERT normalerweise leer).
3. **Beratungs-KB bestimmen (`v_kb`) — der Termin-Assignee ist IMMER ein aktiver Kundenbetreuer:**
   - **Wenn** `NEW.zugewiesen_an` bereits auf einen **aktiven KB** zeigt (`rolle='kundenbetreuer' AND aktiv`) → `v_kb := NEW.zugewiesen_an` (Owner ist schon ein KB, wiederverwenden).
   - **Sonst** (unbesetzt **oder** Owner ist ein Dispatcher/andere Rolle) → least-loaded aktiver KB aus dem Pool:
   ```
   SELECT p.id INTO v_kb
   FROM profiles p
   WHERE p.rolle='kundenbetreuer' AND p.aktiv=true
   ORDER BY (
     SELECT count(*) FROM gutachter_termine t
     WHERE t.assignee_id=p.id AND t.typ='kb_beratung'
       AND t.status IN ('reserviert','bestaetigt')
   ) ASC, p.id
   LIMIT 1;
   ```
   Least-loaded statt persistentem Zähler → kein Shared-Mutable-State, selbst-balancierend, robuster bei 2 KB. Tie-Break `p.id` (deterministisch, test-stabil).
   **Wichtig:** `NEW.zugewiesen_an` kann ein **Dispatcher** sein (`createLead` setzt den anlegenden Dispatcher) — deshalb wird es NICHT blind als Beratungs-Assignee genutzt, sonst stünde ein Dispatcher unter `assignee_typ='kundenbetreuer'`.
4. **0-KB-Fallback:** Wenn `v_kb IS NULL` (kein aktiver KB) → **Termin trotzdem anlegen, aber `assignee_id=NULL`** (Dispatch übernimmt manuell) und `RETURN NEW`. Kein Orphan-Verlust, „jeder Lead bekommt einen Termin" bleibt invariant.
5. **Schadenberater setzen (nur wenn unbesetzt):** `IF NEW.zugewiesen_an IS NULL AND v_kb IS NOT NULL THEN UPDATE leads SET zugewiesen_an=v_kb WHERE id=NEW.id; END IF;` — **überschreibt eine bestehende Dispatch-Zuweisung nicht.** Der Termin-Assignee ist immer `v_kb` (ein echter KB). Edge: ist der Lead bereits einem **Dispatcher** zugewiesen, bleibt der Lead-Owner der Dispatcher, während der Beratungstermin einem Pool-KB gehört (Lead-Intake ≠ Beratungs-KB — bewusst akzeptiert; betrifft nur dispatch-manuell angelegte Leads, nicht den Self-Service-/Embed-Hauptpfad, wo `zugewiesen_an` initial NULL ist).
6. **Default-Zeit (Europe/Berlin, nächster Werktag 10:00):**
   ```
   v_tag := (now() AT TIME ZONE 'Europe/Berlin')::date + 1;
   IF extract(dow from v_tag)=6 THEN v_tag := v_tag + 2;   -- Sa -> Mo
   ELSIF extract(dow from v_tag)=0 THEN v_tag := v_tag + 1; -- So -> Mo
   END IF;
   v_start := (v_tag + time '10:00') AT TIME ZONE 'Europe/Berlin';  -- -> timestamptz
   v_end   := v_start + interval '30 minutes';
   ```
7. **Insert:**
   ```
   INSERT INTO gutachter_termine
     (lead_id, typ, assignee_typ, assignee_id, kb_id, status, kanal, start_zeit, end_zeit)
   VALUES
     (NEW.id, 'kb_beratung',
      CASE WHEN v_kb IS NULL THEN NULL ELSE 'kundenbetreuer' END,  -- 0-KB-Fallback: assignee_typ AUCH NULL
      v_kb, v_kb,                                                  -- assignee_id (kanonisch) + kb_id (Legacy-Reader-Kompat)
      'reserviert', 'telefon', v_start, v_end);
   RETURN NEW;
   ```
   **`fall_id`/`claim_id` bleiben NULL** (kein Claim zur Lead-Zeit) — vom `validate_gutachter_termine_claim_id`-Trigger erlaubt (wirft NUR wenn `fall_id` gesetzt + `claim_id` NULL). `bezahlt`/`verlegung_initiator_kunde`/`erinnerung_morgen_gesendet` haben DB-Defaults (nicht setzen nötig).

**Status-Wahl:** `'reserviert'` = Auto-Default, vom Kunden noch nicht bestätigt. Der `/flow` bietet „Passt mir" (→ `'bestaetigt'`) oder „Verschieben". Lässt der Kunde ihn unangetastet, ruft der KB zur reservierten Zeit an.

**Kalender-Sync:** KB-Termine syncen **nicht** in externe Kalender (`syncTerminToExternalCalendar` gibt für `assignee_typ!='sachverstaendiger'` `'skip'` zurück) — bewusst kein Scope hier.

**Constraint-/Trigger-Kompatibilität (verifiziert 23.06. gegen Live-DB — der Insert geht durch):**
- `validate_gutachter_termine_claim_id` (BEFORE INSERT): wirft NUR bei `fall_id` gesetzt + `claim_id` NULL → mein `fall_id=NULL` passt.
- `gutachter_termine_validate_assignee` (BEFORE INSERT): `assignee_id IS NULL` → früher Return (0-KB-Fallback ok); `assignee_typ='kundenbetreuer'` → `assignee_id` muss `profiles` mit **`rolle='kundenbetreuer'` strikt** sein (Admin wirft) → Pool strikt.
- `termin_sync_auftrag_status` (AFTER INSERT): `IF auftrag_id IS NULL THEN RETURN NEW` → mein Insert no-opt.
- `gutachter_termine_bezug_paar_check`: `(bezug_typ IS NULL)=(bezug_id IS NULL)` → ich setze beide NICHT, binde via `lead_id`-Spalte (die /flow-Verlegung findet via `lead_id.eq` ODER `bezug_typ='lead'`).
- CHECKs `status`/`kanal`/`typ`: `reserviert`/`telefon`/`kb_beratung` — alle gültig.
- NOT-NULL `bezahlt`(default `true`)/`verlegung_initiator_kunde`(`false`)/`erinnerung_morgen_gesendet`(`false`): Defaults vorhanden → nicht setzen nötig.
- Koexistiert mit `on_lead_created` + `trg_leads_lead_nummer` (beide auf `leads`).

## Baustein 2 — `/flow`-Reschedule-Karte

**Wo:** Eine eigene `BeratungsterminCard` im `FlowWizardKfz` (`src/app/flow/[token]/`). Empfohlene Position: auf dem **Abschluss-/Übersichts-Schritt** (nach SV-Termin-Buchung + SA), damit der Kunde beide Termine sieht — die SV-Begutachtung **und** seine KB-Beratung — ohne den Kern-Buchungsfluss zu unterbrechen. (Die Karte erscheint nur, wenn für den Lead ein `kb_beratung`-Termin existiert.)

**Inhalt:** „Ihr Beratungstermin: <Datum/Uhrzeit> mit <KB-Vorname>" + zwei Aktionen:
- **„Passt mir"** → `bestaetigeBeratungsterminFlow(token)` setzt `status='reserviert'→'bestaetigt'`.
- **„Verschieben"** → blendet einen freien Datum/Zeit-Picker ein (**Wiederverwendung der bestehenden `WunschterminPicker`-Komponente** aus `src/app/embed/gutachter-finder/_components/`) → „Neuen Termin speichern" → `verschiebeBeratungsterminFlow(token, neuStartIso)`.

**Reschedule = freier In-Place-Move, NICHT die SV-Verlegungs-Engine** (Verifikations-Erkenntnis): Die SV-Verlegung (`verlege`/`kundeTerminVerlegungVorschlagen`) existiert, weil ein SV nur an EINEM Ort sein kann (Slot-Contention + neue-Row-Audit-Trail). Eine **KB-Telefonberatung** hat das nicht — der KB ruft zur gewählten Zeit an, kein Slot-Wettbewerb. Also: `verschiebeBeratungsterminFlow` macht ein **In-Place-UPDATE** von `start_zeit`/`end_zeit` (+30 min) + `status='bestaetigt'` + `verlegung_initiator_kunde=true` (berührt KEINE der `OF`-gegateten Re-Validate-Trigger). „Kunde ist König" — keine Verfügbarkeitsprüfung („frei verschieben").

**Server-Actions** (neu in `src/app/flow/[token]/self-service-actions.ts`; Token→lead_id über das bestehende `resolveFlowLead`; Result-Object `{ ok; error? }`):
- `ladeBeratungsterminFlow(token)` → Anzeige-Daten (Termin + KB-Vorname) oder `null`.
- `bestaetigeBeratungsterminFlow(token)` → Status `reserviert`→`bestaetigt`.
- `verschiebeBeratungsterminFlow(token, neuStartIso)` → In-Place-Move.
- **Keine** Auth-basierten Wrapper: `getKundeTerminVorschlaegeAction`/`kundeTerminVerlegungVorschlagen` rufen `auth.getUser()` und scheitern im **anonymen** /flow (token-basiert). Deshalb token-basierte Eigenimplementierung.

**Branding:** erbt automatisch über den `/flow`-Wrapper (`generateCssVars` auf dem Page-Level-`<div>`), keine extra Verdrahtung.

**Komponenten-Set:** Karte = `shared/SectionCard`/`SheetCard`, Buttons = bestehendes Flow-Button-Muster (das ältere FlowWizard nutzt token-gebundenes Tailwind — konsistent zur Nachbarschaft bleiben, kein neuer Handroll-Verstoß).

## Baustein 3 — Benachrichtigung (App-Layer)

**Constraint:** Die claim-native `notification_events`-Pipeline verlangt `claim_id` (CMM-49, #3050). Ein **frischer Lead hat noch keinen Claim** → die Pipeline ist hier **nicht** nutzbar.

**v1:**
- **Kunde:** Touchpoint ist die `/flow`-Karte (sieht + steuert den Termin). Keine neue proaktive Outbound-Nachricht bei Anlage.
- **KB:** Awareness rein über `zugewiesen_an` — der zugewiesene KB sieht den Lead in seiner bestehenden Lead-Liste und den Beratungstermin über `assignee_id` in seiner Termin-Ansicht. **Keine Modifikation** von `trg_lead_benachrichtigung`/`on_lead_created` (vermeidet bewusst eine Kollision mit der CMM-49-`leads`-Lane). Eine gezielte KB-Notification (statt nur Admin-Notify) = Follow-up.

**Follow-up (Out-of-Scope v1):** proaktive WA/Email-Bestätigung „Ihr Beratungstermin wurde angelegt" an den Kunden — bräuchte den lead-level `sendCommunication`-Pfad (`kb-booking.ts` T28-Muster) als App-Layer-Hook nach `createLead`. Bewusst v2.

## Owner-Lifecycle & Claim-Verknüpfung

- **Kein Re-Assign** des `assignee_id` bei Lead→Claim-Konversion (Entscheidung #1). Der Termin bleibt beim ursprünglichen Schadenberater.
- **`claim_id`-Nachzug:** Der Termin ist primär an `lead_id` gebunden. Falls `convert-lead-to-claim` Termine **per `lead_id`** mit `claim_id` backfillt, wird der Auto-Beratungstermin **automatisch** mitgenommen — **ohne Code-Änderung an `convert-lead-to-claim.ts`** (bewusst, um den CMM-49-Hot-File nicht anzufassen). Im Plan zu verifizieren; falls kein lead_id-Backfill existiert, bleibt der Termin lead_id-gebunden (für eine KB-Beratung ausreichend, da über lead_id im /flow und über `assignee_id` im KB-Portal sichtbar).

## Scope — welche Leads bekommen einen Termin

**Ja:** `status='neu'` **AND** `disqualifiziert IS NOT TRUE` **AND** `source_channel IS DISTINCT FROM 'test'` **AND** (`telefon` IS NOT NULL **OR** `email` IS NOT NULL).
**Nein:** disqualifizierte Leads (Feld `disqualifiziert=true` bzw. `status='disqualifiziert'`); Test-Leads (`source_channel='test'`); kontaktlose Leads.
**Verifiziert (23.06. gegen Live-DB):** `leads` hat **kein** `quelle`-Feld und **keinen** `rueckruf`-`source_channel`. Die realen `source_channel`-Werte sind allesamt legitime Funnel (`autounfall-io-gutachter-finden`, `claimondo-home-hero`, `elementor`, `gutachter_finder_self_dispatch`, `kfzgutachter-ads-lp`, `manuell`, `mini_wizard`, `self_service`, `test`) → die ursprüngliche „Rückruf-Ausschluss"-Annahme **entfällt**. Disqualifikations-Feld = `disqualifiziert` (boolean).

## Edge-Cases / Fehlerbehandlung

- **0 aktive KB** → Termin mit `assignee_id=NULL` (Dispatch-Queue), kein Abbruch.
- **Wochenende** → Default rollt auf Montag.
- **Trigger-Re-Fire / Doppelanlage** → EXISTS-Guard verhindert 2. Termin.
- **Lead ohne Kontakt** → kein Termin (Scope-Gate).
- **Kunde verschiebt in belegten Slot** → Verlegungs-Engine prüft `v_belegung`, bietet Alternativen (bestehendes Verhalten).
- **Trigger darf die Lead-Anlage nie brechen:** die Insert-Logik ist additiv; ein Fehler im Termin-Insert würde die `leads`-INSERT-Transaktion zurückrollen. Daher defensiv halten (NULL-tolerant, kein Throw bei fehlendem KB). Im Plan erwägen, den Termin-Insert in einen `BEGIN/EXCEPTION WHEN OTHERS THEN RETURN NEW`-Block zu kapseln, damit ein Beratungstermin-Fehler **nie** eine Lead-Anlage blockiert.

## Testing

- **DB-Funktion (pgTAP/SQL-Smoke über Plugin READ):** Lead-Insert (in-scope) → genau 1 `kb_beratung`-Termin, korrekter Assignee (least-loaded), Default-Zeit am nächsten Werktag 10:00, `zugewiesen_an` gesetzt nur wenn vorher NULL. Out-of-scope Lead (disqualifiziert/Rückruf/kontaktlos) → 0 Termine. 0-KB → Termin mit NULL-Assignee. Re-Fire → kein 2. Termin.
- **vitest:** die `/flow`-Server-Actions (`bestaetige…`, `verschiebe…`) — Result-Object, Token-Auflösung, Verlegungs-Engine-Aufruf (gemockt), Fehlerpfade.
- **Build/Gates:** `tsc --noEmit`, `check:token-audit`, `check:component-set`, `check:knip` (alle `--ratchet`).

## Koordination (aktive Parallel-Sessions)

- **CMM-49-Lead→Claim-Lane (68d0795a, `kitta/cmm49-admin-anlegen-canonical`):** berührt `leads`/`convert-lead-to-claim`/`createLead`. **Mein Trigger ist additiv** (`AFTER INSERT ON leads`, koexistiert mit `on_lead_created`/`trg_leads_lead_nummer`). **Owner-bleibt-Entscheidung hält mich bewusst von `convert-lead-to-claim.ts` fern.** Geteilter Hot-File-Kandidat: `FlowWizardKfz.tsx` (meine additive Karte). → Koord-Marker `COORDINATION-auto-beratungstermin.md` vor dem ersten Code-Touch.
- **KB-Konsistenz (Glücksfall, wichtig):** #3104 (`convertLeadToClaim`) setzt den **Claim-KB (`kundenbetreuer_id`) aus `lead.zugewiesen_an`** (Fallback: eigene Round-Robin). Da **mein Trigger `zugewiesen_an` schon bei Lead-Anlage auf den Pool-KB setzt**, liest #3104 bei der Konversion genau diesen KB → **Beratungstermin-Assignee = Claim-`kundenbetreuer_id`, automatisch konsistent**, und die Round-Robin-Würfelung lebt effektiv nur an EINER Stelle (mein Trigger; #3104s Fallback feuert für meine in-scope Leads nicht mehr). **Plan-Pflicht (verifiziert korrigiert):** Pool **strikt `rolle='kundenbetreuer' AND aktiv`** — **NICHT** #3104s `{kundenbetreuer, admin}`! Der `gutachter_termine_validate_assignee`-Trigger wirft bei `assignee_typ='kundenbetreuer'` + Admin-`assignee_id` (`EXISTS … rolle='kundenbetreuer'` strikt). Fairness (least-loaded) wie #3104, aber **strikterer Pool**. `zugewiesen_an=v_kb` (ein strikter KB) erfüllt auch #3104s {kundenbetreuer,admin}-Gate → Konsistenz bleibt. (DRY-Grenze: plpgsql-Trigger ↔ TS-convert können Code nicht teilen; nur Pool-/Fairness-Definition spiegeln.)
- **Release-Session (`release-3102-…`):** orthogonal (Release-Mechanik).

## Out-of-Scope (v1) / Follow-ups

- Proaktive WA/Email-Bestätigung an den Kunden bei Anlage (v2, lead-level `sendCommunication`).
- KB-Kalender-Sync (Google/CalDAV) für `kb_beratung` (heute nur SV).
- Verfügbarkeitsgeprüfte Default-Zeit (heute fester nächster Werktag; Verschieben ist verfügbarkeitsgeprüft).
- KB-Pool-Verwaltung/Skills/Verfügbarkeitsfenster (heute: alle `aktiv` KB, least-loaded).
- Reschedule für dispatch-geführte Leads ohne FlowLink → bestehende KB-/Dispatch-Portal-Tools.
