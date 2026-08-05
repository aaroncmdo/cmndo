# Endkunden-Views operativ richtig — Design-Spec

**Datum:** 2026-08-05
**Mandat (Aaron):** „Überleg dir, wie alle Views für den Endkunden operativ richtig sein sollten." Auslöser: ein Claim bleibt in der Ersterfassungsphase **immer** stecken; der Status-Stepper zeigt dauerhaft „Erfassung".
**Register:** product (Kunde-Portal = app UI). Design-Register: Restrained, earned familiarity.
**Vorgehen (Aaron 05.08.):** Fluss zuerst · Spec + schrittweise bauen (Paket für Paket, je eigener PR + Prod-Smoke).

---

## 1 · Diagnose — warum Claims einfrieren (verifiziert gegen prod)

Der `operative_status` (die eine Status-Achse seit der Status-Achsen-Konsolidierung) advanced **ausschließlich event-getrieben**. Es gibt **keinen periodischen Aufhol-Mechanismus**. Fehlt das Event, friert der Claim für immer ein.

**Empirie (prod, 05.08.):** 21 von ~39 Claims stehen auf `ersterfassung` (13 in den letzten 14 Tagen, ältester 16.07.) — die mit Abstand größte Gruppe.

Der Ausgang aus `ersterfassung` hängt an `claims.sv_id` (`autophase-decision.ts:41-42`: `hasSvId ? 'sv-zugewiesen' : null`). Das bricht an drei Stellen:

| # | Bruchstelle | Belege | Betroffen |
|---|---|---|---|
| **1** | **SV wird nie zugewiesen.** Dispatch-Queue tot: `gutachter_termine` typ=sv_begutachtung = 16× `dispatch_pending` (seit 15.07.) + 6× storniert, **0× bestätigt, je**. Kein Dispatch-Cron. `/kunde/schaden-melden` erzeugt gar keinen Termin. | prod-Query | 15/21 (sv_id=NULL) |
| **2** | **SV gesetzt, Engine umgangen.** `flow/[token]/actions.ts:1533-1536` (`AAR-908 Gap 2`) weist im Kunde-Flow via `findBestSV` einen SV zu — schreibt aber **nur** `claims.sv_id`, **kein** `transitionFallStatus('sv-zugewiesen')`. → sv_id gesetzt, Status eingefroren. | `trans_n=0` bei allen 6 | 6/21 (sv_id gesetzt) |
| **3** | **Kein periodischer Auto-Advance.** `checkFallAutoPhase` (`autoPhase.ts:48`) läuft nur bei Events (Gutachten-Upload, QC, Onboarding-Resume) — **nie als Cron** über offene Claims. Kein `src/app/api/cron/*` ruft es auf. | Grep 0 Treffer | strukturell |

**Der Stepper ist korrekt** — er spiegelt nur den eingefrorenen `operative_status`. Die Read-Seite (Stepper/Zonen/`lifecycle`) wurde von der Status-Achsen-Lane bereits sauber auf `operative_status` verdrahtet. **Das Problem ist die Write-Seite.**

---

## 2 · Das operative Soll — „Die Reise, nicht der Status-Code"

**Leitprinzip.** Jede Endkunden-View beantwortet in **jedem** Zustand vier Fragen:

1. **Wo stehe ich?** — die Phase (Stepper).
2. **Was passiert gerade?** — der aktuelle Zustand in Kundensprache („Dein Gutachter Max ist unterwegs", „Wir prüfen dein Gutachten").
3. **Was muss ich tun?** — genau ein CTA, oder ehrlich „nichts, wir kümmern uns".
4. **Was kommt als Nächstes, bis wann?** — Erwartung + Zeithorizont.

**Eine Wahrheitsquelle.** Alle drei Kunden-Oberflächen leiten aus **demselben** `lifecycle`/`operative_status` ab. Heute divergieren drei Ableitungen (Fallakte-Stepper aus `lifecycle`; Dashboard-JetztZuTun aus Legacy-faelle-Feldern `fall-karte-loader.ts:144`; `FallKarte.derivePhase:79` als dritte Heuristik).

---

## 3 · Zustands-View-Soll (Kern-Achsen)

Für jeden `operative_status` ist der Soll-View = Phase + Aktuell-Text + Handlung + Erwartung. Die Read-Seite (`OPERATIVE_PHASE` → `subKunde`-Labels) ist vollständig; die Lücken liegen bei **Handlung/Erwartung** und bei **Terminal-Erklärung**.

**SV-/Haftpflicht-Achse:** `ersterfassung`(SA offen→CTA Unterschrift) → `sv-gesucht`(„wir suchen deinen Gutachter", warten) → `sv-zugewiesen`(„Gutachter X zugewiesen", ggf. CTA Termin) → `sv-termin`(Termin-Karte) → `besichtigung`/SV-live(Live-Banner) → `begutachtung-laeuft`(„Gutachten wird erstellt") → `gutachten-eingegangen`(„wir prüfen"; CTA Bankdaten) → `filmcheck`/`qc-pruefung`(„Qualitätsprüfung") → `kanzlei-uebergeben`(„geht an die Kanzlei") → `anschlussschreiben`/`regulierung`(„wir fordern deine Entschädigung ein") → `zahlung-eingegangen`(„Geld ist da") → `abgeschlossen`(Abschluss-Card).

**Reparatur-Achse (kasko/selbstzahler):** `reparatur-werkstatt-suche`(CTA Werkstatt-Finder) → `-angefragt`(Termin/KVA) → `-laeuft` → `-erledigt` → `abgeschlossen`.

**Eskalation (Rügefall):** `vs-kuerzt`/`vs-abgelehnt`/`abgelehnt`/`klage`/`nachbesichtigung-laeuft` — brauchen Alert **+ Handlungspfad + „was kommt".**

---

## 4 · Umsetzung — 3 Pakete (je eigener PR + Prod-Smoke)

### Paket 1 · Fluss reparieren (AKTUELL — der akute „stecken"-Bug)

- **1a · Auto-Advance-Cron.** Neuer `src/app/api/cron/auto-phase-sweep` (+ crontab): läuft `checkFallAutoPhase` über **alle offenen** Claims (`operative_status` nicht in `CLOSED_OPERATIVE_STATUS`). `checkFallAutoPhase` ist bereits batchfähig (nimmt fallId, lädt Live-Signale, cascadet über `transitionFallStatus`). Holt die 6 steckenden Claims auf (`hasSvId` → `sv-zugewiesen`) **und** ist der universelle Backstop gegen jedes künftig fehlende Event.
- **1b · Engine-Funnel für sv_id.** `flow/[token]/actions.ts:1533-1536`: nach dem `sv_id`-Write → `transitionFallStatus(fall.id, 'sv-zugewiesen')` (non-fatal catch, Muster wie `sv-zuweisung/route.ts:307-319`). Verhindert **neue** Bypass-Fälle. Optional: `setSvIdForFall` um einen `withTransition`-Pfad ergänzen, damit der Bypass strukturell nicht wiederkehrt.
- **Abgrenzung:** Bruchstelle 1 (Dispatch-Queue tot, 15 Claims ohne sv_id) ist der **Termin-Funnel-Scope**: Spec #4999 gemergt, aber der **Code ist erst ein Draft** (PR **#5012**, nur T1 = Termine überleben Konversion; die Dispatch-Queue-Abarbeitung T2/T3 existiert noch nicht). Deshalb ist Paket 1a nicht nur Backstop, sondern **der einzige aktive Fluss-Fix** — es zieht den Status nach, sobald *irgendein* Pfad `sv_id` setzt (flow-`findBestSV` heute, #5012-Dispatch später). Keine Datei-Kollision mit #5012 (`uebernehme-lead-termine.ts`/`bezug-filter.ts` vs. neuer Cron + `flow/actions.ts`).

### Paket 2 · Eine Wahrheitsquelle

Dashboard-JetztZuTun (`jetzt-zu-tun.ts`) + `FallKarte.derivePhase` auf `lifecycle`/`operative_status` umstellen (statt Legacy-faelle-Felder / Eigenheuristik). Behebt: Gap A (3 Quellen), **Gap B** (`abgelehnt`: Fallakte rot ↔ Dashboard „kein Bedarf"), Gap H (Mittelphase aktionslos → „woran wir gerade arbeiten").

### Paket 3 · Jeder Zustand vollständig

- **Gap C** (Raw-Slug-Leak): 10 `operative_status` fehlen im `fallStatus`-Namespace (`de.json:28`) → Übersicht-Header zeigt rohe Slugs bei **allen** Reparatur-Fällen + 6 Terminals. Labels ergänzen.
- **Gap D/I** (tote Terminals): `termin_durchgefuehrt` + negative Terminals (`abgelehnt_final`/`verjaehrt`/`an_externe_kanzlei`) brauchen einen Erklär-View (was ist passiert, kommt noch was) — nicht nur einen „fertigen" Stepper ohne Abschluss-Card.
- **Gap E/F** (Alert ohne Weg): `vs-kuerzt`/`klage`/`abgelehnt` + Termin-CTA → Handlungspfad + „was kommt als Nächstes".
- **Gap G** (Doppel-Stepper): `SelbstzahlerReparaturStepper` vs `reparatur-*`-`operative_status` konsolidieren auf eine Ableitung.

---

## 5 · Design-Direction (impeccable, product/Restrained)

- **Stepper = Anker** („wo stehe ich"), unverändert 4 Phasen (SV-Achse) bzw. 5 Schritte (Reparatur).
- **Neuer fester „Aktuell + Nächster Schritt"-Block** unter dem Stepper als Kern-Erzählung (Frage 2 + 4) — ersetzt die impliziten Leer-Zustände.
- **Handlungsbedarf immer ehrlich präsent** (Frage 3): CTA oder „wir kümmern uns — nächste Info bis X". Nie ein stummer Zustand.
- Claimondo-navy-Akzent, semantische Status-Tokens (`success`/`warning`/`danger`/`info`), `rounded-ios-*`. Keine neuen Card-Grids, keine Modals-first, keine Slop-Muster.

---

## 6 · Referenzen

Diagnose-Marker: [[audit-kunde-claim-operativ-termin-funnel-tot]] · Lane: [[coordination-status-achsen-konsolidierung]] · Read-Seite vorbereitet: [[coordination-an-status-achsen-lane-kasko-sa-offen]] · Termin-Funnel-Spec (#4999, Bruchstelle 1): `docs/superpowers/specs/2026-08-05-kunde-termin-funnel-design.md`.

Zentrale Files: `autoPhase.ts:48` · `autophase-decision.ts:41` · `flow/[token]/actions.ts:1533` · `sv-zuweisung/route.ts:307` · `lifecycle.ts:160` · `kunde-zonen.ts:29` · `jetzt-zu-tun.ts:138` · `StatusZone.tsx:76` · `ClaimStepper.tsx:25`.
