# Provisions- + Vermittlungs-Modell — Konsolidierung (Audit + Spec, 2026-07-13)

**Lane:** 6f60c510 (Task #8). **Auslöser:** Aaron 13.07. — „haben wir das Provisions-Thema + die Auftragsvermittlung immernoch nicht sauber geklärt?". Über viele Sessions stückweise gewachsen, nie in EIN Modell konsolidiert.

Read-only verifiziert gegen prod (`paizkjajbuxxksdoycev`) + Code (staging).

## Kern-Erkenntnis: es gibt ZWEI Provisions-Welten (nicht eine)

**Welt A — Claim-Vermittlungs-Provisionen** (`partner_provisionen`): ein Vermittler bringt uns EINEN Claim → einmalige Provision, an den Claim gebunden, Release nach Completion+7d. **Das ist die Welt, die konsolidiert werden muss.**

**Welt B — separate Engines** (LEGITIM getrennt, andere Geschäftsmodelle, KEIN Bug):
- **kanzlei** — Monats-Mandats-Abrechnung (`claims.kanzlei_provision_*` + `kanzlei_abrechnungen`/`_positionen`, Monats-Cron `erstelle-abrechnung.ts`). Mandat+Zahlungseingang-basiert, nicht claim-vermittlung.
- **marketing** — Monats-CPL (`provisionen_maik`: `marketing_partner_id, monat, cpl_actual, netto_provision`, Admin-Finance-Portal). Cost-per-Lead, nicht claim-vermittlung.
- **SV (sachverstaendiger)** — **OUTBOUND, umgekehrte Richtung** (SV-Audit 13.07.): der SV **ZAHLT UNS**. Onboarding-Anzahlung (Stripe) → `sachverstaendige.werbebudget_guthaben_netto`; wenn WIR ihm einen Gutachter-Fall zuweisen (`claims.sv_id`) → Lead-Gebühr (200–1081€ je Schadenhöhe, `process-case-billing.ts`), Rest `sv_nachzahlung_netto` → Monats-Rechnung (`abrechnung-erstellen`, `empfaenger_typ='sv'`). **KEIN inbound-Vermittler, KEINE Provision** — die „Gutschrift-Engine" ist das Gegenteil der partner_provisionen-Welt.

→ **Diese drei gehören NICHT in `partner_provisionen`.** (Meine frühere „kanzlei ist inkonsistent"-Vermutung war falsch — es ist ein anderes Modell.)

## Welt A — Ist-Zustand (verifiziert)

| partner_typ | Trigger (Event) | Betrag | Release-Cron |
|---|---|---|---|
| makler | `create_makler_provision` @ `faelle_claim_bridge` AFTER INS (via `promotion_code_id → promotion_codes.makler_id → claims.makler_id`) | dual-rate | `release-makler-provisionen` (`.eq(partner_typ,makler)`, completion+7d + N5-Notify) |
| werkstatt | `create_werkstatt_provision` @ `claims` AFTER INS (WHEN `werkstatt_id`, inbound-QR) | `werkstaetten.provision_betrag_netto` (def 150) | `release-werkstatt-provisionen` (`.eq(partner_typ,werkstatt)`, completion+7d, kein Notify) |
| firmen_flotte | `create_firmen_flotte_provision` @ `claims` AFTER INS (Join `vehicle_id→flotten_fahrzeuge→firmen_flotten_konten aktiv`, Exklusivität `werkstatt_id/makler_id IS NULL`) | 150 fix | **KEINER** ⚠️ |

- Tabelle: `partner_provisionen(id, partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status, storniert_am, storno_grund, ...)`.
- Unique: `(partner_typ, claim_id) WHERE claim_id IS NOT NULL`.
- Release-Logik SSoT: `src/lib/provisionen/completion-release-gate.ts` (FG4-A, unified: `deriveCompletionTs`/`istReleaseBerechtigt`/`istClaimStorniert`) — von beiden Crons genutzt.
- Consumer: `/makler/abrechnungen` (`getMaklerAbrechnungsData`), `/werkstatt/abrechnungen` (`getWerkstattProvisionen`).

## Das klare Ziel-Modell (Welt A)

**Invariante (Aaron 13.07.):** genau **EINE Vermittlungs-Provision pro Claim**. Ein Claim kommt von EINEM Vermittler (makler ODER werkstatt ODER firmen_flotte).

Alle Claim-Vermittlungs-Provisionen in `partner_provisionen`, EINE Release-Mechanik (completion+7d), genau eine Row pro Claim, klarer Vermittler-Bezug.

## Lücken + Fix-Plan (priorisiert)

### P1 — „Eine Provision pro Claim" DB-enforced ⭐ (Kern von Aarons Anliegen)
**Problem:** unique-index `(partner_typ, claim_id)` erlaubt makler+werkstatt+firmen_flotte gleichzeitig (bis zu 3 Rows/Claim). Nur mein flotte-Trigger prüft Exklusivität; makler↔werkstatt können sich doppeln (makler @ bridge, werkstatt @ claim — beide feuern wenn beide ids gesetzt).
**Fix (DDL, koordiniert):**
1. Partieller unique-index `partner_provisionen(claim_id) WHERE claim_id IS NOT NULL` (die Tabelle hält NUR Claim-Vermittlungs-Provisionen → ein Claim = eine Row).
2. Alle 3 Trigger: `ON CONFLICT (partner_typ, claim_id)` → `ON CONFLICT (claim_id)` DO NOTHING (sonst wirft der 2. Trigger statt graceful zu skippen).
3. Präzedenz = Trigger-Reihenfolge (werkstatt/flotte @ claim-insert VOR makler @ bridge) → „first vermittler wins". ⚠ **Aaron-Entscheidung falls beide je gesetzt:** werkstatt vor makler ok, oder explizite Präzedenz? (In der Praxis one-source → selten relevant.)
4. Die Exklusivitäts-IF im flotte-Trigger wird dann redundant (Index enforced) — als Fast-Path behalten oder entfernen.
**Tabelle leer (0 Rows) → Index-Add instant + risikofrei.**

### P2 — firmen_flotte Release (sonst zahlt die 150€ nie aus)
**Problem:** die 2 Crons filtern per partner_typ → `firmen_flotte`-Provision bleibt ewig `pending`.
**Fix (Code, nach FG4-A-Merge #4157):** **generischer Release-Cron** statt per-Typ — EIN `release-partner-provisionen` über ALLE `partner_typ` via `completion-release-gate`, mit per-Typ-Notify (makler→N5, werkstatt/flotte→still). Ersetzt die 2 bestehenden Crons (DRY) ODER minimal: 3. Cron `release-firmen-flotte-provisionen` (Copy). **Empfehlung: generisch** (behebt Lücke + DRY + zukunftssicher für weitere Typen).

### P3 — `PartnerTyp` TS-Type konsistent
`src/lib/partner-rang/types.ts:2` = `'sachverstaendiger' | 'makler' | 'werkstatt'` — kennt `firmen_flotte` nicht. Das ist der **Rang**-Type (SV-Rang etc.), NICHT der provision-partner_typ (der wird im Code als String-Literal genutzt). **Fix:** einen dedizierten `ProvisionPartnerTyp = 'makler'|'werkstatt'|'firmen_flotte'` einführen + die provision-lesenden Queries darauf typen; exhaustive Switches prüfen (keiner darf firmen_flotte silent droppen). Klein.

### P4 — Vermittler-SSoT ⭐ (Aaron 13.07. bestätigt: „vermittler ssot ist gut" → das ist der Kern)
**Richtungs-Prinzip (Aaron 13.07. + SV-Audit):** Provision NUR für **INBOUND**-Vermittlung (wer hat uns DEN Claim gebracht). **NIE für OUTBOUND** (Aufträge, die WIR in eine Werkstatt / zu einem SV steuern): `reparatur_werkstatt_id` (wohin wir die Reparatur steuern) + `sv_id` (den wir zuweisen) lösen **KEINE** Provision aus — der SV zahlt sogar umgekehrt (Welt B).
**Design:** EINE Spalte `claims.vermittler_typ` (`makler|werkstatt|firmen_flotte|NULL`) + `claims.vermittler_id` (uuid), am Convert gesetzt = der EINE inbound-Vermittler. Konsolidiert die verstreuten INBOUND-Signale (`werkstatt_id`=inbound-QR / `makler_id` / `promotion_code_id` / flotte-via-vehicle). EIN Trigger liest `vermittler_typ/_id` → EINE Provision (Betrag je Typ). Damit sind P1 (unique-index), die 3 getrennten Trigger UND die Exklusivitäts-IFs strukturell obsolet — der SSoT enforced „eine Provision pro Claim" by design.
**⚠ Abgrenzung inbound vs outbound:** `werkstatt_id` (inbound-QR = Werkstatt, die uns vermittelt hat → Provision) ≠ `reparatur_werkstatt_id` (outbound = wohin wir die Reparatur steuern → keine Provision). Der Vermittler-SSoT nimmt NUR inbound.
**Aufwand:** Refactor (Convert-Writer + 1 Trigger + Consumer) = die saubere Ziel-Architektur. **Empfehlung: P4 ist das Ziel; P1 (unique-index) nur als schneller Zwischenschritt, falls der SSoT-Refactor später kommt.**

## Nicht-Ziele (bewusst unangetastet)
kanzlei / marketing (provisionen_maik) / SV-Gutschrift bleiben eigene Engines. Nur **dokumentieren**, dass sie bewusst getrennt sind (verhindert künftige „das ist inkonsistent"-Fehldiagnosen — wie meine eigene).

## Reihenfolge
**P1** (enforcement, DDL, sofort — Tabelle leer) → **P3** (TS-Type, klein) → **P2** (generischer Release, nach FG4-A-Merge) → **P4** (Vermittler-SSoT, optional/Ticket).

## Verwandt
[[program-6f60c510-flowlink-werkstatt-abrechnungsweg]] · [[broadcast-provision-modell-inbound-haftpflicht-only]] · [[audit-werkstatt-provision-dbdriven-model]] · [[coordination-firmen-flotte-provision-mechanismus]].
