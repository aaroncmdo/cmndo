# schaden-melden: Verlässliche Dispatch-Zuweisung + Bestätigungsseite

Status: approved (Aaron, 2026-06-26) · Branch `kitta/schaden-melden-dispatch-bestaetigung` (off staging)

## Problem

Ein `schaden-melden`-Lead (`createLeadFromMiniWizard`) wird heute NICHT von der Action zugewiesen — nur ein DB-Trigger (`create_auto_beratungstermin`) weist round-robin einem KB zu (+ Auto-Beratungstermin). Das ist fragil (Trigger-`EXCEPTION`-Kapsel schluckt Fehler → still unassigned; 0 aktive KBs → unassigned) und für den Kunden unsichtbar. Die Bestätigungsseite (`/schaden-melden/link-versendet`) zeigt nur „Login-Link gesendet".

Aaron: die Zuweisung ist extrem wichtig (Kunden haben echten Schaden). Statt nur des Links → eine reichere Bestätigungsseite mit (a) Self-Service, (b) sichtbarem zugewiesenem Ansprechpartner, (c) Rückruftermin-Buchung.

## Entscheidung (Aaron)

Ansprechpartner = **dispatch-User** (explizit zugewiesen, wie `erstelleOeffentlichenRueckruf` / `/start`), NICHT der KB-Trigger.

## Design

### 1. Verlässliche Dispatch-Zuweisung
`createLeadFromMiniWizard`: vor dem Insert einen round-robin least-loaded aktiven `dispatch`-User picken (neuer Marketing-Helper `pickRoundRobinDispatcher`) und als `zugewiesen_an` setzen. Deterministisch, kein Trigger-Verlass. Der KB-Auto-Trigger respektiert den gesetzten Owner (überschreibt „Dispatch-Owner" nicht) → legt nur seinen `kb_beratung`-Termin an (additiv, v1 unverändert). `redirectTo = …/link-versendet?lead=<id>&email=<…>&kanal=<…>`.

### 2. Bestätigungsseite (`link-versendet` aufgebohrt, Marketing-Look wie #3219)
Server-Component lädt über `?lead=<id>`: den zugewiesenen dispatch-User (vorname, profilbild) + den FlowLink-Token (aus `flow_links`, jüngster gültiger). Drei Blöcke:
- **Ihr persönlicher Ansprechpartner**: Name + Foto (Trust). Fallback „unser Team" wenn keiner.
- **Self-Service**: direkter „Jetzt fortfahren"-Button (`/flow/<token>`, app-Domain) + Hinweis „Link auch per WhatsApp/E-Mail". Token NUR im Button-href (server-abgeleitet), NICHT in der Seiten-URL.
- **Rückruftermin**: Zeitfenster-Wahl (BeratungModal-Pattern) → `bucheRueckrufFuerLead`.

### 3. `bucheRueckrufFuerLead(leadId, zeitfenster)`
Legt `admin_termine` (typ='rueckruf', `lead_id`=bestehend, assignee/erstellt_von = zugewiesener dispatch, start_zeit=Wunsch) + Mitteilung an den Dispatcher an. **Kein neuer Lead** (Unterschied zu `erstelleOeffentlichenRueckruf`). Result `{ ok; error? }`. `revalidatePath` dispatch-Routen.

## Scope v1 / bewusst draußen
- KB-Auto-Termin-Dedup gegen den Kunden-Rückruf → Follow-up (DB/Trigger-Eingriff, Koordination mit auto-beratungstermin-Linie).
- „Login-Link"-Wording → in dem Zug auf „sicherer Link" umtexten (MiniWizardClient + link-versendet).

## Verifikation
tsc + next build (marketing). Live-Smoke: neuer mini_wizard-Lead → `zugewiesen_an`=dispatch, Bestätigungsseite zeigt Person, Rückruf-Buchung legt `admin_termine` (kein neuer Lead) an.
