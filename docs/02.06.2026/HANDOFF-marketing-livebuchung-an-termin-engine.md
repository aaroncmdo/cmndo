# Handoff → Termin-Engine-Strecke: 1 Verifikation entsperrt die Marketing-Live-Buchung

**Von:** Marketing-Session (`kitta/marketing-finder-anfrage-wizard`, Session 96e64dd5)
**An:** Termin-Engine-Session (`cdd8f4f3`, aktuell `kitta/termin-engine-p2-4`)
**Tracking:** **AAR-955** (Child von AAR-939, related AAR-940) · **Spec:** `docs/02.06.2026/marketing-finder-live-buchung-spec.md`
**Datum:** 2026-06-02

## Worum geht's (1 Satz)
Der öffentliche Finder `claimondo.de/gutachter-finden` soll Live-Slot-Buchung beim **karten-gewählten** SV bekommen — über **euren bestehenden** Self-Service-Flow (`/anfrage/[token]`), nicht über neuen Code. Es fehlt **eine Verifikation aus eurer Domäne**, dann baut Marketing den kleinen Rest (Redirect-Wiring).

## Die EINE Sache, die ich von euch brauche (der Blocker)

**Verifizieren: liefert `matchAndSlots(fixerSvId = <SV>)` für eine self-service-eligible Anfrage korrekt NUR diesen einen SV + dessen freie Slots?**

### Warum unklar / warum euch
- Der Finder erzeugt eine Anfrage, die **eligible** ist (`source=NULL`, Kontakt vorhanden) **UND** `zugeordneter_sv_id` gesetzt hat (der karten-geklickte SV).
- Bisherige Code-Annahme (`src/app/anfrage/[token]/actions.ts:283`): *eligible ⇒ `zugeordneter_sv_id` NULL ⇒ globales Matching*. Die Kombination **eligible + fixer SV** ist **neu**.
- Die SV-Weiche existiert (`actions.ts:284`: `const fixerSvId = anfrage.zugeordneter_sv_id ?? null` → `matchAndSlots({ … })`), könnte für eligible-Anfragen aber ein **nie gelaufener Pfad** sein (tote-Pfad-Risiko → latente Bugs).

### Konkrete Prüf-Fragen
1. **Override:** Bei gesetztem `fixerSvId` — gibt `matchAndSlots` ausschließlich diesen SV zurück (kein Ranking/kein „wer-zuerst-Vorrang", keine Radius-/Matching-Filter, die den karten-geklickten SV wieder rauswerfen)? Der User hat ihn explizit gewählt — Vorrang-Logik darf hier NICHT übersteuern.
2. **Slots:** Kommen für diesen fixen SV korrekt die freien Slots (gleiche Quelle wie im normalen Flow)?
3. **Leerfall:** Was passiert, wenn der fixe SV keine freien Slots hat / inaktiv ist? (Erwartung Marketing: sauberer Leer-Zustand → Fallback auf Rückruf-Anfrage, KEIN stiller globaler Re-Match auf einen anderen SV — sonst bricht das Finder-Versprechen „dieser SV".)

### Vorgeschlagener Schnell-Smoke
Eligible Test-Anfrage anlegen (`gutachter_finder_anfragen`: `source=NULL`, Telefon/Email, `zugeordneter_sv_id=<verifizierter Test-SV>`) → `matchAndSlots` mit dieser Anfrage aufrufen → assert: genau 1 SV (= der gesetzte) + dessen Slots. Negativ: SV ohne Slots → definierter Leer-Zustand.

## Was ihr mir zurückmeldet (dann starte ich)
- ✅/❌ je Prüf-Frage 1–3, plus:
- Falls die SV-Weiche für eligible+fixerSvId angepasst werden muss: kurz wie/wo (dann ist das euer kleiner Fix, Marketing wartet darauf).
- Den **Aufruf-Vertrag** den Marketing nutzen soll (reicht `issueSelfServiceFlowLink(anfrageId)` + Redirect `/anfrage/[token]`, oder braucht's einen Extra-Parameter, damit der fixe SV durchgereicht wird?).

→ Ping an die Marketing-Session (96e64dd5) oder Kommentar an **AAR-955**.

## Was Marketing dann macht (klein, eigener Branch)
1. Im Anfrage-Wizard (`GutachterFinderAnfrageWizard.tsx`, schon live, PR #2259): nach `erstelleGutachterFinderAnfrage({zugeordneter_sv_id})` → `issueSelfServiceFlowLink(anfrageId)` → **Inline-Redirect** auf `${APP_URL}/anfrage/${token}`.
2. i18n ×6 für den Wizard.
3. E2E-Smoke (Sentinel + Cleanup) + zero-downtime Deploy.
**Kein** neuer Buchungs-/Kalender-/Verfügbarkeits-Code — alles eures wird wiederverwendet.

## Referenzen
- `src/lib/self-service/issue-flowlink.ts` — `issueSelfServiceFlowLink(anfrageId)` (Token + `/anfrage/[token]`).
- `src/lib/self-service/eligibility.ts` — `istSelfServiceFaehig` (source∈{null,kfz_gutachter_lp}+Kontakt).
- `src/app/anfrage/[token]/actions.ts` — SV-Weiche (`:284`), `bucheTermin`, `matchAndSlots`-Aufruf.
- `src/lib/sv-matching-modul/match-and-slots.ts` — `matchAndSlots` (Ranking/Slots — hier sitzt die fixerSvId-Frage).
- Marketing live heute: SV-Profile (#2253), Anfrage-Wizard-Interim (#2259).
