# Makler Value-Loop — Design-Spec

**Datum:** 2026-07-02 · **Autor:** Session fbca7869 (mit Aaron) · Follow-up der Onboarding-Aktivierung ([[coordination-makler-onboarding-aktivierung]]).

## Ziel (ein Satz)
Der Makler **sieht und spürt** jeden Schritt seines Erfolgs (teilen → Kontakt konvertiert → verdient → Fall reguliert), damit aus Einmal-Teilern **Wiederholungs-Vermittler** werden.

## Befund (Audit, prod- + code-gegroundet)
Der Value-Loop ist **tote Verkabelung**: die zwei Makler-N5-Events (`makler.lead_eingegangen`, `makler.provision_status`) sind komplett gebaut (Types, alle 3 Kanäle, Matrix, Templates, Opt-Outs) — aber an **null Stellen emittiert**. Konkret:
- `convert-lead-to-claim.ts` setzt `claims.makler_id`, emittiert aber nichts → DB-Trigger legt die Provision **stumm** an.
- Provision **freigegeben** = nur Ad-hoc-Email (außerhalb N5, email-only). Provision **entstanden (pending)** + **Storno** = stumm.
- Claim-native Endzustände (`claim.reguliert` etc.) lassen den Makler aus der Matrix (split-brain ggü. Legacy-state-machine).
- Verdienst-Sicht = Ledger zum Selber-Nachschauen, kein Push-Moment (obwohl „Empfehlung X → Y€"-Daten schon zusammengesetzt vorliegen).
Delivery-Worker ist gesund (Cron `*/10`, In-App-Bell live) → **wenn ich emittiere, kommt es an.** Funnel real: 2 Makler (Test), 3 Leads, 2 Provisionen — pre-launch, aber der Loop muss stehen bevor echte Makler kommen.

## Entscheidungen (Aaron)
Voller Loop: **Push** (alle Money-Moments) **+ Pull** (pro-Empfehlung-Dashboard-Story).

---

## PUSH — die toten Events an die Auslöser anschließen

### 1. Conversion-Moment → `makler.lead_eingegangen`
- **Trigger:** `src/lib/leads/convert-lead-to-claim.ts` (~L435-447), nachdem `promotion_code_id → makler_id` aufgelöst, `claims.makler_id` gesetzt UND die `faelle_claim_bridge` (+ DB-Provision-Trigger) gelaufen ist. **Best-effort** `try/catch` (darf die Conversion nie brechen; `emitEvent` ist ohnehin fire-and-forget).
- **Emit:** `emitEvent('makler.lead_eingegangen', { leadId, maklerId, promoCode, kundeName?, betragEur? }, …)`.
- **Payload-Erweiterung** (TS-only, `src/lib/notifications/types.ts:141`): `kundeName?: string` + `betragEur?: number` ergänzen, damit das Template aussagekräftig ist. Werte aus dem eben konvertierten Lead (Name) + der frisch erstellten `makler_provisionen`-Row (Betrag) lesen.
- **Templates** (`channels/email.ts:95`, `channels/in-app.ts:191`, `templates/web-push.ts:231`): Copy → **„🎉 Ihr Kontakt {kundeName} ist über Ihren Empfehlungs-Link Kunde geworden — {betragEur}€ vorgemerkt."** + CTA zum Portal (Leads/Akten).
- Kanäle bleiben wie Matrix (`web_push + email + in_app`); Opt-Out `neuer_lead` bleibt respektiert (preferences.ts).

### 2. Provision-Status → `makler.provision_status` (statt Ad-hoc-Email)
- **Trigger:** `src/app/api/cron/release-makler-provisionen/route.ts` — im **Release-Pass** (`status pending→freigegeben`) und **Storno-Pass** (`→storniert`).
- **Ersetzt** den Direkt-Aufruf `sendProvisionReleaseEmail(...)` durch `emitEvent('makler.provision_status', { fallId, provisionId, maklerId, status, betragEur, grund? }, …)` → **alle 3 Kanäle** + Audit-Log + Opt-Out (Matrix/Prefs existieren).
- **Storno** (aktuell stumm) → Notif „Provision {betrag}€ wurde storniert: {grund}".
- `sendProvisionReleaseEmail` + `makler-notifications.ts` werden damit **obsolet** → nach Umstellung entfernen (Dead-Code-Check), sofern kein anderer Consumer. `ProvisionReleased.tsx`-Copy in das N5-Email-Template überführen falls dessen Text besser ist.

### 3. Fall-Ausgang → Makler in die claim-native Matrix
- **Fix:** `src/lib/notifications/channel-matrix.ts` (~L309-356) — die 6 claim-terminalen Events (`claim.reguliert`, `claim.abgelehnt`, `claim.storniert`, `claim.an_externe_kanzlei_uebergeben`, `claim.klage_rechtsstreit`, `claim.verjaehrt`) um **`makler: ['in_app']`** ergänzen; bei `claim.reguliert` zusätzlich **`email`** (der Makler will das Ergebnis wissen).
- **Gate:** Fan-out liefert an Makler nur bei aktivem `makler_fall_consent` (auto-erstellt bei Conversion, #3349) → kein Leak, keine fremden Fälle.
- Schließt den split-brain: egal ob Legacy-state-machine oder claim-native den Fall finalisiert, der Makler erfährt das Ergebnis.

---

## PULL — der Moment im Portal

### 4. Pro-Empfehlung-Story im Dashboard
- **Dateien:** `src/lib/makler/queries.ts` `getMaklerDashboardData` (~L707-863) + `src/components/makler/MaklerDashboard.tsx` Activity-Liste (~L101-135).
- **Statt** zwei parallele Logs (Leads + Provisionen) → **eine pro-Empfehlung-Timeline**: Lead ↔ Provision über `lead_id`/`fall_id` joinen → Zeile „**{kundeName}** · Kunde geworden {Datum} · **{betragEur}€** {Status-Badge: vorgemerkt/freigegeben/ausgezahlt/storniert}", klickbar zur Akte.
- Keine neuen Daten — `getMaklerAbrechnungsData.provisionen[]` hat schon `kunde_name` + `claim_nummer` + `betrag` + `status` + `trigger_at`; die Dashboard-Query analog zusammenführen (oder das Dashboard nutzt die vorhandene Abrechnungs-Query für die Story).

---

## Datenmodell
Keine Schema-Änderung. Nur **TS-Payload-Erweiterung** in `notifications/types.ts` (`makler.lead_eingegangen` um `kundeName?`/`betragEur?`) — alle Consumer (Templates) additiv anpassen. Events/Deliveries-Tabellen + Provision + Consent existieren prod-live.

## Error-Handling
Neue Emits **best-effort** (`try/catch`, console.error) — der Loop darf weder die Conversion noch den Cron-Durchlauf brechen. Result-Object-Pattern gilt für keine der Änderungen (Emits sind Sub-Ops).

## Testing
- **vitest:** (a) `convert-lead-to-claim` emittiert `makler.lead_eingegangen` genau dann, wenn `promotion_code_id → makler_id` auflöst (und NICHT bei nicht-makler-Leads); (b) der Release-Cron emittiert `provision_status` bei freigegeben + storniert; (c) das Dashboard-Story-Mapping (pure Funktion Lead↔Provision→Story-Row).
- **Prod-Smoke (mit Cleanup):** Test-Lead über einen Makler-Promo anlegen → konvertieren → Makler-**Bell + Email** „Kunde geworden" prüfen (`notification_events`/`notification_deliveries` + `mitteilungen`) → Provision freigeben → `provision_status`-Notif → Dashboard zeigt die pro-Empfehlung-Story. Danach cleanupen.

## Out of Scope (Folge-Increments)
- **Lead-IN-Notif** (pre-conversion „jemand hat deinen Link benutzt") — noisier, später.
- SV-en-route/verspätet-Granularität für den Makler.
- **web-push VAPID**-Verifikation (Infra/Aaron) + Cron-Observability für `/api/notifications/process` (audit-note #3) — nicht makler-spezifisch.

## Koordination
Shared/Hot-Files: `convert-lead-to-claim.ts` (Kern-Conversion, viele Consumer — **additiver best-effort-Emit**, kein Verhalten bestehender Rollen geändert), `channel-matrix.ts` (additive Matrix-Einträge), `notifications/types.ts` (additive Payload-Felder), `release-makler-provisionen`-Cron, `makler/queries.ts` + `MaklerDashboard.tsx`. Branch `kitta/makler-value-loop` off staging.
