# Implementierungs-Roadmap — Netzwerk-Ökosystem (phasiert, K-korrigiert)

**Datum:** 2026-07-27
**Governt durch:** dieses Doc + `2026-07-27-hardening-und-koordination-vor-plaenen.md` (K1–K15). **Bei Konflikt gilt Hardening + Roadmap über Spec 1/2/3.**
**Prinzip:** planen jetzt, **bauen nach den Substrate-Merges** der 4 Lanes. Fundamente zuerst, dann Consumer.

---

## Korrigierte Kern-Entscheidungen (aus der Härtung)
- **Entitlement = derive-at-read Subscription-Row** `sv_netzwerk_abonnements` (partner-typ-agnostisch: `partner_typ`+`partner_id`, `status`/`gueltig_bis`/`stripe_subscription_id`), **service-role-only** setzbar. **KEIN** `netzwerk_abo_status`-Bool auf `sachverstaendige` (überschreibt Spec 2 §5.1). **`paket` NIE überschreiben** — separate Achse; Comping = Abo-Row. (K1/K3)
- **Prädikat `istZahlenderNetzwerkPartner` per Rolle:** SV = aktive Abo-Row; **Werkstatt/Flotte = frei** (Gate hängt am SV-Kandidaten). **Batch-vorgeladen** pro Ranking-Call, nie per-Kandidat. (K10)
- **Boost = 2 Ebenen in 2 (nicht 1) Engines:** global (Netzwerkpartner > Free) in `matching-score.ts` **UND** `api/sv-zuweisung/route.ts`; relational („Dein Netzwerk") nach `rankeWerkstattVorschlaege` **+ den 2 Extra-Reorderings** (#4101/#4125). Paket-Stufen-Kreuzen ist gewollt (paket retired). (K3/K4/K12)
- **Provisions-Suppression an RELEASE-Zeit** (`completion-release-gate.ts`, completion+7d — NICHT `hold_until`, NICHT die INSERT-Trigger); nur `partner_provisionen`-Zweig, `makler_fall_consent` behalten. (K2/K13)
- **Bindung:** `claims.netzwerk_owner_id` beim Claim-Create; `profiles.netzwerk_owner_id` erst in `finalizeKundeSetup`. (K6)

---

## Phasen

| P | Inhalt | K-Korrekturen | Koordinations-Gate | Status |
|---|---|---|---|---|
| **0 · Fundament (DDL)** | `netzwerk_verbindungen`+`v_netzwerk_freunde` (RLS+Grants) · `sv_netzwerk_abonnements` (derive-at-read) + service-role-Guard · `claims.netzwerk_owner_id`+`profiles.netzwerk_owner_id` · Prädikat + Batch-Loader | K1,K3,K6,K10 | **#4789 claims-RLS** (`netzwerk_owner_id` muss `claim_sichtbar_fuer_aktuellen_user` erweitern, nicht forken); DDL-Reihenfolge absprechen | **buildable** (nach #4789-Merge) |
| **1 · Verbindungen-UI + Invite** | Tabs Verbindungen/Anfragen in `/{portal}/netzwerk` (Feed existiert) · Profi-Verzeichnis (Such-RPC, RLS) · Einladen (PartnerOnboardingEinladung+partner-lead→auto-Kante) + `/flotte/netzwerk` | RLS-Directory | Feed-Lane (gemergt) | buildable nach P0 |
| **2 · Boost + Badge** | `applyNetzwerkPraeferenz` (relational) · global-Boost in beiden Engines · `istTopPartner`→Entitlement (1 Consumer) · Owner-**Injektion** im anon Finder · Metadaten überleben `coverageUnion`-Trim | K3,K4,K10,K11,K12 | **a8fc2a40 Finder-Engine** (`rank-vorschlaege`/`ladeWerkstattVorschlaege` API erweitern, nicht neu); `PARTNER_RANG_MATCHING`-prod-Wert verifizieren | blocked bis Finder-Lane-Merge |
| **3 · Bindung-Seed + Provisions-Gate** | Seed claims/profiles.netzwerk_owner_id · Freundes-Graph-Suppression an Release-Zeit | K2,K6,K13 | **#4789/a6c863e2 Provisionen** (release-runner, hold_until-DROP pending; abrechnungsweg-Gate = Aaron-Entscheid) | blocked bis Provisions-Lane |
| **4 · SV-Vermittlungs-Flow (D)** | SV-Selbstanlage · datengetriebener Initial-State · **sign-into-existing-claim** · alle Mid-Funnel-Reader + `assignReparaturWerkstatt` auf `onboarding_complete` gaten · Empfehl-Batch-Ablösung | K4,K5 | **b0e963b6 FlowLink** (`/flow/[token]`, Matching); `convert-lead-to-claim.ts` Hot-File | blocked bis FlowLink-Lane-Merge |
| **5 · Freemium-Billing (B-Rest)** | Stripe-**Recurring** + Live-Webhook `invoice.*`/`customer.subscription.*` · **Setup-Fee (Einmal) + Monats-Abo BEIDE via Stripe** (Single Subscription-Checkout mit Setup-Fee als Erst-Rechnungs-Item erwägen; `stripe-best-practices`-Skill) · DB-getriebene §14-Rechnungen (nicht Legacy-PDFs) · **Grandfather-Backfill** (comped aktive SVs) · Registrierung-Umbau + DAT-Audit (minimal) · Abo-Ask + In-App-Upgrade · Dunning-Cron (pg_cron+Vault) | K7,K14,K15 | **Aaron-Blocker:** live `whsec`, echte IBAN/USt, Custom-SMTP; UG-`rechnungssteller`-CHECK-Kollision | blocked bis Aaron-Blocker |
| **6 · Fahrzeug-zentrisch (H) + Netzwerkkarte (E)** | `vehicles.current_owner_id`-Writer + Backfill · zwei-vehicles-pro-Auto-Merge · `/kunde/fahrzeuge` (FM-Muster) · Netzwerkkarte-Rebrand (SKT-Token, token-basiert, ON-DELETE-Fix) · Scan→Bindung | K8,K9 | **63fe43f9 Schadenkarte** (`mintSchadenkarten`, `/flotte/fahrzeug/[id]`) + FM-Fahrzeug-Lane | blocked bis Schadenkarte-Lane |

**Abhängigkeiten:** P0 → alles. P2/P3 → P0. P4 → P0+P3. P6 → P0(Bindung)+K8-Datenbasis.

---

## Verifikation (K15-bewusst)
- Kein prod-Partner-Login → **Wegwerf-SV/Werkstatt seeden** (`scripts/smoke/throwaway-account.mjs`).
- prod+staging teilen LIVE-Stripe → **kein Zahl-Smoke off-prod**; Billing gegen prod mit Test-clock/comped-Pfad, nie echte Charge.
- Claim-Views service-role=0 → **Admin-JWT-Sim** für Stat-Checks.
- Ratchets grün halten: `check:flag-drift` (neue Enums in CHECK + Snapshot-Regen VOR Code), `check:token-audit`, `check:component-set`, `check:knip`, `check:rls-policies`, `check:rls-grants`.

## Nächster Schritt — PAUSE (Aaron 27.07., Option b)
Design-Meilenstein gesetzt. **Kein Code jetzt** — wir warten auf die Substrate-Merges der 4 Lanes (#4789 claims-RLS, FlowLink, Finder-Engine, Schadenkarte).

**PRE-PLAN-GATE (Pflicht, Aaron 27.07.):** BEVOR wir die detaillierten Pläne schreiben, **nochmal ein vollständiger Check** — die Härtungs-Runde (Edge-Cases + Reuse-Reality + Kollisions-Scan) gegen den DANN-aktuellen Code neu fahren, weil sich das Fundament bis dahin bewegt hat. K1–K15 + die 4 Lane-Stände re-verifizieren; erst dann schreiben.

Danach: detaillierte Pläne **pro Phase** (writing-plans), **P0 (Fundament)** zuerst (startet nach #4789-Merge). Jede Phase = eigener Branch/PR gegen `staging`, koordiniert mit ihrer Lane.
