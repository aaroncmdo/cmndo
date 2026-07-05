# Werkstatt-Finder-Anfrage SP-B2 — Selbstzahler-Claim-Abschluss — Design

> Sub-Projekt B2 (2. Hälfte des Kerns). Baut auf SP-B1 (Quali-Router). Der Selbstzahler-Zweig (heute SP-B1-Hinweis) erzeugt jetzt den **partiellen Claim** und schleust den Kunden über den **bestehenden Account-Step** ins Portal. Werkstatt-Suche bleibt portal-seitig (SP-C), nicht im Flow.

**Datum:** 2026-07-05 · **Branch:** `kitta/schaden-finder-abrechnungsweg` (stackt auf SP-A #3624 + SP-B1) · **Vorgänger:** `2026-07-04-schaden-finder-abrechnungsweg-flowweiche-design.md`

---

## 1. Ziel & bestätigtes Modell (Aaron 04.07.)

Selbstzahler = **partieller Claim** (kein SV/Gutachten/SA/Regulierung) → **Kunde-Portal**. Die Werkstatt-Suche + Terminabstimmung passieren **portal-seitig** (SP-C Karte + SP4 `WerkstattCard`, claim-basiert, schon gebaut) — **nicht** im Flow. Das umgeht den beim SP-B1-Bau gefundenen **Mount-Cap** (`initialNeedsWerkstatt` wird beim Mount gecappt) vollständig.

**Flow (Selbstzahler):** `quali(selbstzahler)` → **partieller Claim erzeugen** → **Account-Step** (E-Mail → Konto → Magic-Link) → Portal.

## 2. Bestandsaufnahme (Code verifiziert, origin/staging + SP-B1)

- **`signSAandCreateFall`** (`actions.ts:591`) verlangt `signatureUrl` (Z.599 Guard) → **nicht** für Selbstzahler nutzbar (keine Abtretung). Ruft intern `convertLeadToClaim({ leadId, svIdFromTermin, signatureUrl })`.
- **`convertLeadToClaim`** ist idempotent; `svIdFromTermin`/`signatureUrl` sind **optional** → ohne beide = partieller Claim (`sv_id=null`, `sa_unterschrieben=false`). Trägt `abrechnungsweg` (SP-B1) + `reparaturwunsch` + `reparatur_werkstatt_*` schon.
- **Account-Step existiert + ist unbedingt in `STEPS`** (`FlowWizardKfz`: `{ id: 'account', label: 'Konto' }` in beiden Pfad-Varianten). Der SA-Handler macht `setFallId(claimId)` → `setStepIndex(stepIndexById('account'))`; der Step rendert ein E-Mail-Formular → `createKundeAccount(fallId, token, email, vorname, nachname, telefon)` → `magicLink` → Portal.
- **`createKundeAccount(fallId, flowToken, email, vorname, nachname, telefon)`** (`actions.ts:285`): braucht einen **existierenden** Claim (`fallId`), bindet `flowToken`→`flow_links.lead_id` gegen `v_claim_full.lead_id` (F1-Hijack-Schutz), liefert `magicLink`. Für Selbstzahler identisch nutzbar (der partielle Claim hat `lead_id`).

## 3. Komponenten (SP-B2)

1. **`erzeugeSelbstzahlerClaim(token)`** — neue Server-Action in `self-service-actions.ts`. Resolved den Flow-Lead → `convertLeadToClaim({ leadId })` **ohne** `svIdFromTermin`/`signatureUrl` → `{ ok: true; claimId } | { ok: false; error }`. Idempotent (via `convertLeadToClaim`). Guard: nur wenn `lead.abrechnungsweg === 'selbstzahler'` (defensive; sonst `{ ok:false }`).
2. **`FlowQualiStep`** — der Selbstzahler-Zweig (heute Hinweis-Endansicht) ruft `erzeugeSelbstzahlerClaim(token)`; bei Erfolg → neuer Callback `onSelbstzahler(claimId)`. Bei Fehler → Fehleransicht. (Zwischen-Ladezustand „Wir richten deinen Vorgang ein…".)
3. **`FlowWizardKfz`** — reicht `onSelbstzahler={(claimId) => { setFallId(claimId); setStepIndex(stepIndexById('account')) }}` an `FlowQualiStep` (spiegelt exakt den SA→Account-Handler). **1 Prop + 1 Handler**, additiv.

**Wiederverwendet, unverändert:** der komplette Account-Step (E-Mail-Form → `createKundeAccount` → Magic-Link → Portal). Keine Duplikation, keine Step-Machine-Chirurgie, kein Mount-Cap-Kampf.

## 4. Abgrenzung (SP-B2 NICHT)

- **Werkstatt-Suche im Portal** = SP-C (Karte) + SP4 `WerkstattCard`. SP-B2 bringt den Kunden nur *ins* Portal.
- **Reduzierter Reparatur-Stepper** (Portal-Anzeige) = SP-D.
- **KB-Skip für Selbstzahler:** `convertLeadToClaim` weist aktuell einen Kundenbetreuer zu (Round-Robin). Ein Selbstzahler braucht keinen Regulierungs-KB. **Follow-up** (nicht SP-B2, um das heiße `convert`-File minimal zu halten) — analog zum bestehenden `istEmbedB`-Gate ein `istSelbstzahler`-Gate. Bis dahin: KB wird zugewiesen (Daten-Artefakt, nicht brechend).
- Keine `reparatur_termine`-/RLS-Änderung.

## 5. Testing

- `erzeugeSelbstzahlerClaim` ist ein dünner Wrapper um `convertLeadToClaim` (Admin-Client) — **keine sinnvolle reine Unit-Logik** (Mocking würde den Mock testen). Verifikation = **voller Build** + **Prod-Smoke**: Selbstzahler-Lead anlegen → Flow `eigenverantwortung`+„nein" → Claim entsteht (`abrechnungsweg='selbstzahler'`, `sv_id=null`, `sa_unterschrieben=false`, `reparaturwunsch='reparatur'`) → Account-Step → `createKundeAccount` → Magic-Link → Portal zeigt den Fall (claim-owner-RLS).
- Der defensive `abrechnungsweg==='selbstzahler'`-Guard ist die einzige reine Verzweigung → optional als winziger Guard-Test.

## 6. Koordination

- **Hot-aar-956-Files:** `FlowQualiStep.tsx` (SP-B1 schon touched) + `FlowWizardKfz.tsx` (**neu** für SP-B2: 1 Prop + 1 Handler, additiv) + `self-service-actions.ts` (neue Action). `git diff staging...origin/aar-956` für diese = leer (committed aar-956 berührt sie nicht). Edit-Collision-Guard schützt zur Edit-Zeit; atomar committen.
- `convert-lead-to-claim.ts` **unberührt** in SP-B2 (KB-Skip ist Follow-up).

## 7. Definition of Done (SP-B2)

- [ ] `erzeugeSelbstzahlerClaim(token)` — reuse `convertLeadToClaim` ohne SV/SA, `abrechnungsweg`-Guard.
- [ ] `FlowQualiStep`: Selbstzahler-Zweig ruft die Action → `onSelbstzahler(claimId)` (+ Lade-/Fehleransicht, Umlaute).
- [ ] `FlowWizardKfz`: `onSelbstzahler`-Handler (`setFallId` + Nav zu `account`) + Prop-Durchreichung.
- [ ] **Voller Build grün**, tsc 0, 3 Ratchets 0-neu, `check:i18n(-render)` grün, 7-Punkt-Audit.
- [ ] Regression: gegner/kasko/unklar + der SA→Account-Pfad unverändert.
- [ ] Post-Deploy Prod-Smoke: Selbstzahler → partieller Claim → Portal-Eintritt (s. §5).
