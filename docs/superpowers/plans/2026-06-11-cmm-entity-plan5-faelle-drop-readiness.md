# CMM-Entity Plan 5 — faelle-Drop Readiness-Map

**Erstellt 2026-06-11 (Entity-Lane).** Quelle = erschoepfende Audit aller `.from('faelle')`-Reads in `src/`
(~90 Read-Sites) gegen die `v_claim_full`-Spalten (165 nach Plan 4.7) + Live-DB-Value-Probes (78 Rows).

## TL;DR

**Der faelle-Drop ist NICHT mehr View-Scope-blockiert.** Plan 4.1a-4.7 deckt **jede befuellte, claims-/entity-native
Flat-Spalte**, die ein Reader aus `faelle` liest. Die verbleibende Drop-Arbeit ist **Route-Key (Bridge) +
Write-Retirement + nested-Embed-Join-Repoints** — das ist CMM-49s Lane, nicht Entity-View-Arbeit.

## Was Plan 4 abgeschlossen hat (View-Scope)

`v_claim_full` (165 Spalten) exponiert jetzt jede Flat-Display-Spalte, die aus `faelle` gelesen wird:
- **Vehicle:** kennzeichen, fahrzeug_hersteller (NULLIF 'Unbekannt'), fahrzeug_modell/typ/aufbau/farbe/baujahr(int)/ausstattung, fin_vin, lackfarbe_code, hsn, tsn, kilometerstand, erstzulassung, kennzeichen_buchstaben, fin_quelle/-extrahiert_am
- **Kunde (geschaedigter-Party):** kunde_vorname/nachname/telefon/strasse/plz/stadt, firma_name, ist_fahrzeughalter
- **Halter (ist_halter-Party):** halter_* (vorname/nachname/strasse/plz/stadt/telefon/email/geburtsdatum/name)
- **Gegner (verursacher-Party + entity):** gegner_name, gegner_versicherung(+_name), gegner_kennzeichen, gegner_fahrzeugtyp, gegner_anzahl_beteiligte (= total-1)
- **Claims-native:** notizen, zeugen_kontakte, zeugen_vorhanden, kunde_email, vorsteuerabzugsberechtigt, vorschaden_erkannt, operative_status, spezifikation, fahrzeug_fahrbereit, fahrzeugschaden_beschreibung, sprache
- **Vorschaden:** hat_vorschaeden, vorschaden_anzahl/letzter_datum/typ_b_bericht

Alle value-preserving verifiziert (LOSS=0/CONFLICT=0 vs faelle, 78 Rows). Grants: nur authenticated/service_role (anon=0, PII safe).

## Verbleibende faelle-Drop-Blocker (NICHT View-Scope) — CMM-49-Lane

Die ~90 verbleibenden `faelle`-Reads zerfallen in 4 Kategorien:

### 1. Bridge-/Key-Reads (Route-Key B) — der Hauptblock
Reads die NUR `id, claim_id, lead_id, kunde_id, sv_id` selektieren (fuer Joins/Routing, kein Display).
Beispiele: aircall/bridge, storno-actions, channel-router, mietwagen/actions, ocr-actions, kanzlei/actions,
sv-termin-sync, ~20 weitere. **Diese brauchen die fall_id<->claim_id-Bridge, NICHT View-Spalten.**
-> Route-Key-Entscheid = B (claim_id kanonisch, Bridge=Transitions-Geruest). Co-terminal mit DROP TABLE faelle.

### 2. Nested `claims:claim_id(...)`-Embeds — trivialer Join-Repoint
Reads die `faelle` nur als Einstieg nutzen und die Nutzdaten aus `claims:claim_id(...)` ziehen
(schon entity-sourced). Beispiele: dispatch-fall-actions (~8x), sla/*, termine/*, whatsapp, communications/*.
-> Mechanisch auf `claims`-direkt oder `v_claim_full` umstellbar. Kein Scope-Gap.

### 3. Write-Path `status`/`sv_id`-Filter — Write-Retirement
`.update()` auf faelle + `.eq('sv_id').not('status', 'in', ...)`-Filter in Schreib-/Count-Kontexten.
Beispiele: _karte/actions (SV-Reassign), gutachter/team/actions, abrechnung/* (splitOrKeepFaelleUpdate),
cardentity/typ-b, sv-lead-ablehn. -> faelle-Write-Stopp (CMM-49), nicht View.

### 4. Echte Residual-Flat-Reads — 3 faelle-only Spalten, 0 Coverage
| Spalte | Reader | Heimat | Status |
|---|---|---|---|
| `wertminderung` | fall-finanzen.ts | faelle-only | 0 Coverage -> inert; braucht claims-Heimat NUR falls Feature bleibt (Finance-Lane) |
| `nutzungsausfall_tagessatz` | fall-finanzen.ts | faelle-only | 0 Coverage -> wie oben |
| `organisation_id` | gutachter/team (`.eq()`) | faelle-only | View hat NULL::uuid-Placeholder; SV-Org-Scoping. 0 Coverage. Legacy (aar950 SV-Org-Drop) — pruefen ob Reader tot |

Keiner dieser 3 verliert beim Drop Daten (greenfield, 0 Coverage). Fuer einen *sauberen* Drop:
Reader entweder auf claims-Heimat (Finance-Migration) oder als bewusst-leer bestaetigen.

## Empfohlene Drop-Sequenz (Route-Key B)

1. **Bridge-from-claims-Trigger** (synthetisch fall_id=claim_id fuer neue Rows) + Orphan-Fix — entsperrt Converter-faelle-Stopp.
2. **faelle.UPDATE-Writer-Landmine-Audit** (read-only) — scopt Kategorie 3.
3. **Converter-Cutover** (faelle-Insert raus aus convert-lead-to-claim.ts:459 + create-for-fall.ts).
4. **Reader-Sweep** Kategorie 2 (nested-Embed -> claims-direkt) + Kategorie 1 (Key-Reads -> Bridge).
5. **Residual-3** (Kat. 4): Finance-Heimat ODER bewusst-leer.
6. **DROP TABLE faelle** + FKs.
7. **Boy-Scout** fall_id->claim_id, Bridge droppen wenn letzte Ref weg.

## Entity-Lane Status nach Plan 4.7

**View-Scope-Strecke KOMPLETT.** Offene Entity-Items: keine View-Arbeit mehr. Converter-Fixes (#2620) +
Halter-Gate offen. Plan 5 = CMM-49-Lane, Entity supportet (Bridge-Trigger-Beratung, Value-Probes).
