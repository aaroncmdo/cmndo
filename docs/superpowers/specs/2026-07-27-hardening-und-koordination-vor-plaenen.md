# Härtung & Koordination — VOR den Implementierungs-Plänen lesen

**Datum:** 2026-07-27
**Status:** Blocker-/Korrektur-Liste aus der adversarialen Härtungs-Runde (3 Audit-Agenten + 2 Kollisions-Scouts)
**Verdikt:** **NICHT one-shot-bereit.** ~9 Spec-Korrekturen + 4 aktive-Session-Koordinationen müssen VOR/IN den Plänen honoriert werden.

---

## A · MUST-FIX Spec-Korrekturen (in unserer Hand)

**K1 · Entitlement = derive-at-read, NICHT stored bool.** Spec 2 §5.1 (`netzwerk_abo_status` denormalisiert auf `sachverstaendige`) **widerspricht** Epic §3.3 + §13b (LOCKED, jünger). → **derive-at-read aus Subscription-Row** gewinnt (Flag-Drift-Ratchet verbietet rohen Presence-Bool). Falls ein Read-Cache nötig: **service-role-only Write-Guard** — sonst kann der SV per RLS (`profile_id=auth.uid()`) sich `abo='aktiv'` selbst setzen; `guard_sachverstaendige_privilegien` deckt die Abo-Spalten heute NICHT (Trigger-`UPDATE OF`-Liste **und** Body-`IS DISTINCT FROM` beide erweitern, sonst feuert der Guard nie). Hot-Path: Subscription-Rows pro Ranking-Call **batch-joinen**.

**K2 · Provisions-Suppression an RELEASE-Zeit, nicht am Inbound-INSERT.** Die Inbound-Trigger feuern **AFTER INSERT** (`create_werkstatt_provision` auf `claims`; `create_makler_/firmen_flotte_provision` auf `faelle_claim_bridge`) — da sind `sv_id`/`reparatur_werkstatt_id` noch **NULL**. Der Freundes-Graph-Check ist dort **nicht auswertbar**. → Suppression gehört an **`release-runner.ts` / `completion-release-gate.ts`** (Completion+7d, wo alle Zuweisungen stehen). Der plpgsql/Release-Check löst Entity→Profil (`werkstaetten.user_id`/`sachverstaendige.profile_id`/`firmen_flotten_konten.user_id`) und liest `v_netzwerk_freunde` (Definer). **Spec 2 §13b entsprechend umschreiben.**

**K3 · Entitlement ist eine SEPARATE Achse — `paket` NIE überschreiben.** 5 Consumer lesen roh `paket`: `istKontingentBlockiert` (basic-Ausnahme), Lead-Pricing (`calculate-lead-price.ts`), MRR (`admin/finance`), Stripe-Kontingent (`stripe/webhook`), Lifecycle-Gates (`getSvStatus`/`sv-checkout`). Comping = **eigene Abo-Row**, nicht `paket='netzwerk'`. `istKontingentBlockiert`s basic-Ausnahme bleibt am **Billing**-Begriff, nicht am Ranking-Prädikat (sonst wird ein Pay-per-Lead-SV mit vollem Kontingent hart aus dem Dispatch gefiltert).

**K4 · BEIDE Dispatch-Engines patchen + Flag reconcilen.** `matching-score.ts` `bewerteSvKandidat` ist NICHT die einzige: **`src/app/api/sv-zuweisung/route.ts`** ist ein eigenständiger Zuweisungs-Algorithmus (sortiert `schaden_match`+`partner_seit`, ruft weder `bewerteSvKandidat` noch `PAKET_PRIO`). Beide brauchen „Netzwerkpartner zuerst". **`PARTNER_RANG_MATCHING`-Flag: Code-Default OFF (`matching.ts:196`) vs. Spec-1-Behauptung „prod=an" → echten prod-Wert verifizieren** (bestimmt, wie stark der Rang-Feinsort greift). Tote Dead-Copy `PAKET_PRIO`/`istKontingentBlockiert` in `dispatch/findBestSV.ts` (nur Test-referenziert) = Drift-Falle. `istTopPartner`-Badge: nur 1 Live-Consumer (`api/v1/gutachter-termine`) → leicht umzubiegen.

**K5 · Sofort-Claim: alle Mid-Funnel-Reader auf `onboarding_complete` gaten + „sign-into-existing" = UPDATE.** Kein DB-CHECK koppelt `operative_status` an SA/Onboarding (App-only-Invariante). Beim INSERT feuern heute unabhängig: KB-Round-Robin, Kanzlei-Push, `emitEvent`, Provisions-Trigger, Reparatur-Notify — und **`assignReparaturWerkstatt` hat KEIN onboarding/SA-Gate**. Jeder muss zusätzlich auf `onboarding_complete` gaten. `signSAandCreateFall` ist **CREATE-only** (lead-scoped idempotent) → der SV-Sofort-Claim braucht einen **neuen „sign-into-existing"-Pfad** (direktes UPDATE von `abtretung_pdf`/`sa_unterschrieben`/`onboarding_complete`), sonst Duplikat-Claim ODER `signatureUrl` still verworfen. **Status via State-Machine setzen, aber Billing/SLA (`processCaseBilling`/`completeSla`) auf POST-Onboarding verschieben** (direkter Spalten-Write umgeht Billing; State-Machine feuert es verfrüht).

**K6 · Bindung-Seed-Timing.** Kein Kunden-Profil beim Sofort-Claim (entsteht erst in `finalizeKundeSetup`) → nur **`claims.netzwerk_owner_id` (per-Claim)** ist beim Sofort-Claim seedbar; `profiles.netzwerk_owner_id` (Default) erst nach Onboarding. `profiles.entstanden_via`/`entstanden_aus_claim_id` haben **NULL Writer** → NICHT als Seed-Anker verlassen.

**K7 · Stripe-Recurring = 100% Greenfield.** Kein Subscription-Code/Webhook heute (nur Einmal-`mode:'payment'`; Webhook kennt kein `invoice.*`/`customer.subscription.*`). Monats-Abo = net-new Subscription-Create + neue Handler. Spec 2 §2 „keine neue Billing-Engine" **untertreibt** — nur die einmalige Setup-Fee reused. Aaron-Blocker: live `whsec`, echte IBAN/USt (Rechnungen=Dummies).

**K8 · WS H (fahrzeug-zentrisch) hat KEINE Datenbasis.** `vehicles.current_owner_id` = **0/14 befüllt** (kein Writer; `ensure-vehicle.ts` lässt ownerId leer). Braucht (a) ownerId in den Vehicle-Write-Path bei Account-Anlage + (b) Backfill aus `claims.vehicle_id` (nur 7/22 Claims haben ein Fahrzeug). **Zwei `vehicles`-Zeilen pro Auto** (FIN-loser Stub + FIN-Row; `ensureVehicleFromFin` repointet `claims.vehicle_id` auf die FIN-Row, verwaist den Stub, an dem `flotten_fahrzeuge`+`schadenkarten` hängen) → Schadenhistorie/Karte splitten. Stub→FIN-Merge ist ein **ungebautes** Datenmodell-Projekt. „FM firma-scoped → owner-scoped generalisieren" ist **kein sauberer Param-Swap** (verschiedene Dimensionen: `flotten_fahrzeuge.firma_id` vs `vehicles.current_owner_id`).

**K9 · WS E (Netzwerkkarte) — Reuse-Annahmen falsch.**
- **NICHT `werkstatt_qr_pool`** — Schadenkarte hat ihr **eigenes** Token-System (`generateSchadenkarteToken`→`SKT-…`, `schadenkarten.token`, `mintSchadenkarten`). Ziel = `src/lib/schadenkarte/schadenkarte.ts`.
- **Token-basiert, NICHT NFC/UID:** Web-NFC = Android+Chrome+blanko-NTAG-only, Desktop nie; **0 `nfc_uid` auf prod** (nie geschrieben); Bind-by-UID beim Gegner-Tap unmöglich (OS liefert nur URL). Karte+QR funktioniert ohne NFC. Alter NFC-Provisioner **gelöscht** (#4754/#4779) → aktuellen Pfad (`NfcKarteSchreibenButton`/`nfc.ts`) targeten.
- **ON DELETE definieren:** Fahrzeug-Delete nullt `schadenkarten.fahrzeug_id`, lässt `status='gebunden'` → **Zombie-Karte** (Live-Bug). „Karte überlebt Schäden" muss Delete-Semantik regeln.
- ✅ **`schadenkarten_fahrzeug_gebunden_uniq` (partial, status='gebunden')** = eine aktive Karte pro Fahrzeug — stützt „eine Netzwerkkarte pro Fahrzeug".

---

## B · Aktive Session-Koordinationen (bauen unser Fundament um — NICHT forken)

- **`a6c863e2` — Operative Bestandsaufnahme 9 Rollen (HEUTE aktiv):** rewrote **claims-RLS/Visibility** (PR **#4789**, Mig `20260727120255`, `claim_sichtbar_fuer_aktuellen_user` + 5 Policies, `is_kanzlei_mandat()`) + **`partner_provisionen`**-Release (completion+7d, `release-runner.ts`) + **status-axes** single-writer. → Unser `claims.netzwerk_owner_id` + Owner-Scoping **muss dieselbe Visibility-Funktion erweitern**; Provisions-Arbeit koordinieren; DDL auf `claims`/`partner_provisionen` absprechen.
- **`b0e963b6` — FlowLink-Lane („du bist die lane"):** besitzt `/flow/[token]/*`, Matching `plane-termin-oeffentlich.ts`, `FlowWizardKfz`, kasko/selbstzahler-Routing (#4778/#4780), Mig `20260724143028`. Offene PRs #4758/61/63/71/72/78/80. → Direkter Overlap mit unserem `/flow/[token]` + `issueCanonicalFlowLinkForAnfrage` + Matching. **Sync vor Anfassen, rebase nach deren Merge.**
- **`a8fc2a40` — Werkstatt-Embed-Rebuild:** besitzt die Finder-Engine (`ladeWerkstattVorschlaege`/`findWerkstattVorschlaegeFuer`/`rank-vorschlaege.ts`, `auftrag-gate.ts`). → **Die bestehende Engine-API erweitern, nicht neu bauen.** Empfehl-Batch-Ablösung muss `findWerkstattVorschlaegeFuer({target})` berücksichtigen.
- **`63fe43f9` — NFC/Schadenkarte-Lane (`kitta/admin-karten-erklaertext-fmbind`):** baut Bind/NFC-Flow um (`mintSchadenkarten`, `/flotte/fahrzeug/[id]/page.tsx` = genau WS-H-Datei, hohe Churn #4679/78/54/57/75/79). → **Koordinieren vor Anfassen** von schadenkarte.ts/nfc.ts + fahrzeug/[id]/page.tsx.

**Gut:** unser Branch ist frisch von staging (1 hinter, 5 voraus) — kein stale-aar-956-Risiko (der gitStatus-Name war veraltet). aar-956 reservierung-rueckruf = gemergt/prod, kein Overlap.

---

## C · Empfohlener Pfad (statt naivem one-shot)
1. **Specs korrigieren** (K1–K9 einarbeiten) — in unserer Hand, jetzt.
2. **Koordinieren** mit den 4 Lanes (claims-RLS #4789, FlowLink, Finder-Engine, Schadenkarte) — deren Substrate-Merges abwarten, dann rebasen.
3. **Phasierte Pläne** schreiben, die AUF dem gemergten Substrat landen — Fundamente zuerst (Graph + Entitlement-Subscription), dann Boost/Provisionen/Bindung, dann Flows/UI.
