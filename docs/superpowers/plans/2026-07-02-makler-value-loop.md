# Makler Value-Loop — Plan

> executing inline. Spec: `docs/superpowers/specs/2026-07-02-makler-value-loop-design.md`.

**Goal:** Die 2 gebauten-aber-toten Makler-N5-Events emittieren + Fall-Ausgang-Matrix + pro-Empfehlung-Dashboard-Story → der Makler sieht/spürt jeden Erfolgsschritt.

## Global Constraints
- Emits **best-effort** (`try/catch`, console.error) — dürfen Conversion/Cron nie brechen.
- UI-Umlaute Pflicht. Keine Schema-Änderung. Nur additive Matrix-/Payload-Erweiterung.
- Hot-Files (`convert-lead-to-claim.ts`, `channel-matrix.ts`) additiv anfassen — kein Verhalten bestehender Rollen ändern.

---

### T1: Payload + Templates — `makler.lead_eingegangen` aussagekräftig
- `src/lib/notifications/types.ts`: Payload `makler.lead_eingegangen` += `kundeName?: string`, `betragEur?: number`.
- `channels/email.ts` + `channels/in-app.ts` + `templates/web-push.ts`: Copy → „🎉 {kundeName} ist über Ihren Empfehlungs-Link Kunde geworden — {betragEur}€ vorgemerkt" (Fallback ohne Werte).

### T2: Conversion-Emit
- `src/lib/leads/convert-lead-to-claim.ts` (~L435-447): nach `makler_id`-Auflösung + Bridge/Provision-Trigger → best-effort `emitEvent('makler.lead_eingegangen', {leadId, maklerId, promoCode, kundeName, betragEur})`. kundeName aus Lead, betragEur aus frisch erstellter `makler_provisionen`-Row.

### T3: Fall-Ausgang-Matrix
- `src/lib/notifications/channel-matrix.ts` (~L309-356): 6 claim-terminale Events += `makler:['in_app']`; `claim.reguliert` zusätzlich `email`.

### T4: Provision-Status via N5
- `src/app/api/cron/release-makler-provisionen/route.ts`: Release + Storno → `emitEvent('makler.provision_status', {fallId, provisionId, maklerId, status, betragEur, grund?})` statt Ad-hoc-`sendProvisionReleaseEmail`. Storno bisher stumm → jetzt Notif.
- Danach `sendProvisionReleaseEmail`/`makler-notifications.ts` auf 0 Consumer prüfen → entfernen (Dead-Code) oder Copy ins N5-Email-Template ziehen.

### T5: Pull-Story im Dashboard
- `src/lib/makler/queries.ts` `getMaklerDashboardData` + `src/components/makler/MaklerDashboard.tsx`: Activity → pro-Empfehlung-Timeline (Lead↔Provision join → „{kundeName} · Kunde geworden {Datum} · {betragEur}€ {Status}").

### Verify + PR
tsc + vitest (Emit-Auslöser + Story-Mapping) + Ratchets. Prod-Smoke (Lead→convert→Bell/Email→release→Notif→Dashboard), Cleanup. PR base staging.
