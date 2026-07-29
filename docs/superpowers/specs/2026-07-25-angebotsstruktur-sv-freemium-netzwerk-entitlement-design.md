# Angebotsstruktur — SV-Freemium, Netzwerk-Entitlement & Werkstatt-Referral — Design

**Datum:** 2026-07-25
**Status:** Spec (brainstormed, wartet auf Review → Plan)
**Branch:** `kitta/netzwerk-verbindungen-freundschaft` (Basis `origin/staging`)
**Linear:** _TBD — AAR-Ticket anlegen_
**Verwandt:** Spec 1 »Netzwerk-Verbindungen« (`2026-07-21-netzwerk-verbindungen-freundschaft-design.md`) — dieses Spec **implementiert** das `istZahlenderNetzwerkPartner`-Gate, das der Boost + die Finder-Sektion dort (§5.4, §7.4) lesen.

---

## 1 · Kontext & Ziel

Die SV-Seite bekommt eine **Freemium-Angebotsstruktur**:

- **Kostenlose Registrierung** ist immer möglich (Free-Tier; baut auf dem bestehenden „Basic"-Onboarding auf).
- Optional wird ein SV **zahlender Netzwerk-Partner**: **monatliche Flatrate** (Annahme **29,99 €**, TBD) **+ einmalige Einrichtungsgebühr** (Annahme **39,90 €**, TBD).
- **Nur zahlende Partner** bekommen den Netzwerk-Boost — ihre Partner-Werkstätten erscheinen oben in der dedizierten „Aus Ihrem Netzwerk"-Sektion (Spec 1 §7.4). Ein Free-SV disponiert **ohne** Partner-Boost = normales Matching.
- Ein **zahlender SV** kann **neue Werkstätten ins Netzwerk werben** (analog Makler-Referral). **Ohne Provisions-Override** (kein MLM-Downline-Anteil). Die geworbene Werkstatt ist von der **(künftigen) Werkstatt-Einrichtungsgebühr befreit**.

Zweck: wiederkehrender Umsatz auf der SV-Seite + Netzwerk-Wachstum durch SV-getriebene Werkstatt-Akquise, ohne die Provisions-Ökonomie zu verändern.

---

## 2 · Nicht-Ziele

- **Keine neue Billing-Engine.** Wiederverwendung von `onboarding_anzahlung` (Setup-Fee), `sv_onboarding_rechnungen`, `rechnungs_konfiguration` (Preise), `sv_payment_reminders` (Dunning), Stripe.
- **Werkstatt-Einrichtungsgebühr selbst = spätere Phase.** Hier nur der **Waiver-Haken** + Attribution (`geworben_von_sv_id`).
- **Keine Preis-Hardcodes.** 29,99 / 39,90 sind Platzhalter; alle Beträge kommen aus Config.
- **Keine Änderung** am bestehenden pro-Fall-Billing (`gutachter_monatsabrechnungen`) außer der Koexistenz-Klärung (§14).
- **Kein Umbau der Provisions-Trigger** (Makler/Werkstatt/Flotte-Provision bleibt am Inbound-Vermittler-SSoT).

---

## 3 · Decision Log

| # | Entscheidung | Begründung / Quelle |
|---|---|---|
| E1 | **Free-vs-Paid ist eine NEUE Achse**, orthogonal zu `sv_paket_typ` (`solo/buero_inhaber/sub_buero/akademie_*` = Org-Struktur). | Enum-Befund; Freemium ≠ Org-Rolle. |
| E2 | **Paywall = nur der Boost/Finder-Sektion.** Free-SVs bekommen das volle soziale Netzwerk (Freundschaften, Netzwerk-Seite, später Chat). | User-Wahl „Nur der Boost". |
| E3 | **Free-SV disponiert = normales Matching** (kein Partner-Boost, keine Sektion). | User-Wahl „Normales Matching". |
| E4 | **Paid = Monats-Flatrate + einmalige Einrichtungsgebühr**, beide **config-getrieben**. | User-Vorgabe; `rechnungs_konfiguration` existiert. |
| E5 | **Gate = SSoT-Prädikat `istZahlenderNetzwerkPartner(ownerId)`**; Spec 1 konsumiert. | Lose Kopplung Spec 1 ↔ Spec 2. |
| E6 | **SV→Werkstatt-Referral analog Makler, OHNE Override** (kein Downline-Provisions-Anteil). Effekt: Partner-Kante + Fee-Waiver. | „Override" = Makler-Provisions-Override (`get_makler_empfehlung_uebersicht`), nicht Ranking. |
| E7 | **Werkstatt-Setup-Fee selbst = später**; jetzt nur Waiver-Haken + Attribution. | User: „zukünftig". |

---

## 4 · Bestehende Infra (reuse map)

| Zweck | Bestehend | Nutzung hier |
|---|---|---|
| Setup-/Einrichtungsgebühr | `sachverstaendige.onboarding_anzahlung_betrag` / `anzahlung_status` / `stripe_anzahlung_bezahlt_am`; `sv_onboarding_rechnungen` (`typ`, `*_cent`, Stripe) | SV-Setup-Fee = Anzahlung mit `typ='netzwerk_einrichtung'` |
| Preis-Config (versioniert) | `rechnungs_konfiguration` (`version`, `gueltig_ab/bis`) | Monats-/Setup-Preis als versionierte Config |
| Dunning / Reminder | `sv_payment_reminders` (`reminder_typ`) | Abo-Zahlungserinnerung + Deaktivierung |
| Status / Aktivität | `sachverstaendige.ist_aktiv`, `partner_seit`, `portal_zugang_freigeschaltet`, `basic_onboarding_abgeschlossen_am` | Free = Basic; Paid = Abo aktiv |
| Referral-Vorbild | `lib/makler/empfehlung.ts` + `get_makler_empfehlung_uebersicht` (upline/downline/**override**) | SV-Referral spiegelt Onboarding-Teil **ohne** Override |
| Bestehende SV→Werkstatt-Empfehlung (in-claim) | `empfehleWerkstaettenAlsGutachter` (`gutachter/fall/[id]/_actions/werkstatt-empfehlung.ts`) | **anderer** Flow (empfiehlt bestehende Partner an Kunden) — hier NICHT gemeint |

**Wichtige Abgrenzung:** „SV empfiehlt Werkstatt" hat **zwei** Bedeutungen: (a) *in-claim* bestehende Partner an den Kunden empfehlen (existiert) — dort greift der Boost/Sektion aus Spec 1; (b) *Onboarding* — eine **neue** Werkstatt in die Plattform werben (E6, neu). Dieses Spec meint (b).

---

## 5 · Datenmodell

**5.1 Entitlement-Status (Read-Model an `sachverstaendige`)** — schneller Read im Hot-Path (jeder Dispo-Ranking-Aufruf):
```sql
alter table public.sachverstaendige
  add column netzwerk_abo_status  text not null default 'inaktiv'
       check (netzwerk_abo_status in ('inaktiv','aktiv','ueberfaellig','gekuendigt')),
  add column netzwerk_abo_seit    timestamptz,
  add column netzwerk_abo_bis     timestamptz,          -- aktuelles Perioden-Ende
  add column stripe_subscription_id text;
```

**5.2 Referral-Attribution (an `werkstaetten`)**:
```sql
alter table public.werkstaetten
  add column geworben_von_sv_id         uuid references public.sachverstaendige(id),
  add column geworben_am                timestamptz,
  add column einrichtungsgebuehr_erlassen boolean not null default false;  -- Waiver-Haken (E7)
```

**5.3 Preis-Config** — `rechnungs_konfiguration` erweitern (versioniert):
```sql
alter table public.rechnungs_konfiguration
  add column netzwerk_monat_cent   integer,   -- z.B. 2999 (TBD)
  add column netzwerk_setup_cent   integer,   -- z.B. 3990 (TBD)
  add column werkstatt_setup_cent  integer;   -- future (E7)
```

**5.4 Abo-Historie (optional, P2)** — falls Webhook-Events/Perioden protokolliert werden sollen: `sv_netzwerk_abo_events` (sv_id, event, stripe_event_id, periode_start/ende). Der Hot-Path liest weiter das denormalisierte Read-Model (5.1).

---

## 6 · Entitlement-Prädikat (SSoT)

```ts
// src/lib/netzwerk/entitlement.ts
export async function istZahlenderNetzwerkPartner(
  supabase, ownerProfileId: string,
): Promise<boolean>
```
- Löst `ownerProfileId` → Rolle auf.
- **SV-Owner:** `true` gdw. `sachverstaendige.netzwerk_abo_status = 'aktiv'` **und** `netzwerk_abo_bis >= now()` (+ optionale Karenz) **und** `ist_aktiv`.
- **Werkstatt-/Flotte-Owner (v1):** `true` (ungegated — noch kein Zahlprodukt; Annahme, s. §11 & Review).
- **Einzige Gate-Quelle.** Spec 1 (Boost + Finder-Sektion) ruft ausschließlich diese Funktion.

---

## 7 · Billing-Flows

**7.1 Upgrade Free → Paid (Self-Service):**
1. SV klickt „Netzwerk-Partner werden" (§10).
2. Stripe-Checkout/PaymentIntent für die **Einrichtungsgebühr** (reuse `onboarding_anzahlung`-Pfad; Betrag aus Config). Beleg als `sv_onboarding_rechnungen` (`typ='netzwerk_einrichtung'`).
3. **Stripe-Subscription** für die Monats-Flatrate (Preis aus Config). Bei aktiver Subscription → Webhook setzt `netzwerk_abo_status='aktiv'`, `netzwerk_abo_seit=now()`, `netzwerk_abo_bis=Perioden-Ende`.

**7.2 Wiederkehrend / Dunning:**
- Stripe-`invoice.paid` → `netzwerk_abo_bis` verlängern. `invoice.payment_failed` → `ueberfaellig` (+ `sv_payment_reminders`). Nach Karenz ohne Zahlung → `inaktiv` (Boost/Sektion aus).
- Kündigung → `gekuendigt`, wirkt zum Perioden-Ende (`netzwerk_abo_bis`).

**7.3 Stripe-Go-Live-Koordination:** koordiniert mit dem laufenden Stripe-Cutover — **keine** test-mode Price/Product-IDs in prod, Webhook-Secret live (`whsec_…`). Siehe Go-Live-Runbook.

---

## 8 · Referral-Flow (SV → Werkstatt, Onboarding)

Ein **zahlender** SV wirbt eine **neue** Werkstatt (Invite-Link, analog Makler-`EmpfehlungShareCard`). Beim Werkstatt-Onboarding über diesen Link:
1. **Partner-Kante** in `netzwerk_verbindungen` (Spec 1): SV ↔ Werkstatt, `status='angenommen'` (gemeinsam onboarded → auto-akzeptiert; Alternative `offen` beim Review abwägen).
2. **Attribution:** `werkstaetten.geworben_von_sv_id = <sv>`, `geworben_am=now()`, `einrichtungsgebuehr_erlassen=true`.
3. **KEIN Override:** der SV erhält **keine** Downline-Provision auf Geschäft der geworbenen Werkstatt (Abgrenzung zum Makler — dort feuert der Override; hier bewusst nicht).

Gate: nur zahlende SVs dürfen werben (Free-SV → Upgrade-CTA).

---

## 9 · Preis-Config

- Alle Beträge aus `rechnungs_konfiguration` (versioniert). **29,99 / 39,90 sind Platzhalter** und werden vor Go-Live bestätigt.
- UI, Checkout und Rechnungen lesen die Config; **nie** hardcodierte `price_…`-IDs im Code (Stripe-Best-Practice + Token/Preis-Konsistenz).

---

## 10 · UI-Flächen

- **SV-Portal Upgrade-CTA:** „Netzwerk-Partner werden" (Free-Tier) — erklärt den Nutzen („Ihre Partner-Werkstätten oben"), zeigt Monats- + Einrichtungspreis (aus Config).
- **Abo-/Billing-Seite:** Status, nächstes Abbuchungsdatum, Kündigung — im bestehenden SV-Konto-Bereich (reuse), inkl. Rechnungen (`sv_onboarding_rechnungen`).
- **Free-Tier-Hinweis:** dort, wo die Partner-Sektion wäre, ein dezenter „Warum sehe ich meine Partner nicht oben?"-Upsell (statt der Sektion aus Spec 1 §7.4).
- **Werkstatt einladen:** Share-/Invite-Flow analog Makler-`EmpfehlungShareCard` (nur für zahlende SVs).

---

## 11 · Invarianten

- **Preise nur aus Config**, nie hardcodiert.
- **Prädikat = einzige Gate-Quelle**; Spec 1 konsumiert, entscheidet nicht selbst.
- **Provisionen unverändert:** Referral gibt dem SV **keinen** Override; die Inbound-Vermittler-Provision (Makler/Werkstatt/Flotte) bleibt unberührt.
- **Kostenlose Registrierung immer möglich** (Basic-Tier bleibt erhalten).
- **Sozialer Graph ungegated** — nur Boost + Finder-Sektion sind zahlungspflichtig.
- **v1-Gate-Asymmetrie** (nur SV-Owner gegated) ist bewusst und dokumentiert (Review-Punkt).

---

## 12 · Sicherheit / RLS / DDL

- **RLS:** SV sieht/ändert nur den **eigenen** Abo-Status; `geworben_von_sv_id` nur für beteiligten SV/Admin sichtbar. Policies PERMISSIVE mit explizitem `TO authenticated`.
- **Grants** explizit (neue Spalten/Tabellen granten anon nichts).
- **DDL ausschließlich via Supabase-Plugin** `apply_migration` (Regel 2), File nach getrackter Version benennen.
- **Stripe:** Live-Keys/Webhook, keine Test-IDs in prod (Go-Live-Runbook).

---

## 13 · Implementierungs-Phasen

1. **P1 — Entitlement + Gate scharf:** `netzwerk_abo_status`-Feld (5.1) + `istZahlenderNetzwerkPartner` (§6) + Verdrahtung in Spec-1-Boost/Sektion. **Admin-setzbarer Status** → Boost/Sektion sofort testbar, **noch ohne** Self-Service-Billing. _Schaltet den Netzwerk-Boost aus Spec 1 überhaupt erst scharf._
2. **P2 — Billing:** Einrichtungsgebühr (Stripe + `sv_onboarding_rechnungen`) + Monats-Subscription + Webhooks + Dunning/Deaktivierung + Preis-Config + Upgrade-/Abo-UI.
3. **P3 — Referral:** SV→Werkstatt-Invite (Partner-Kante + Attribution + Waiver-Haken) + Invite-UI.
4. **Später:** Werkstatt-Einrichtungsgebühr selbst (aktiviert den Waiver-Haken aus P3).

**Abhängigkeit:** Spec 1 Phase 3 (Boost) braucht **P1** hier. Sinnvolle Reihenfolge: Spec 1 P1+P2 → Spec 2 P1 → Spec 1 P3 → Spec 2 P2/P3.

---

## 13b · WS-B Durchsprache (27.07.) — LOCKED

**Geschäftsmodell:** Das **Netzwerkpartner-Abo ist das Haupt-Preismodell.** Neu-SVs: kostenlose Registrierung ODER direkt Netzwerkpartner (Monats-Flat + einmalige Einrichtungsgebühr). **Per-Fall-`paket` (standard/pro/premium/Paketfälle) wird NICHT mehr verkauft** — Netzwerkpartner haben kein Kontingent. **Bestand:** alle aktiven SVs werden **comped Netzwerkpartner** (Backfill) + behalten ihr `paket`-**Fulfillment** (Kontingent/Billing) + Netzwerk freigeschaltet.

**Terminologie (Aaron):** „**Netzwerkpartner**" (zahlender Abo-Status) ist NICHT „**(empfohlenes) Netzwerk**" (Freundes-Graph). Boost/Badge gaten am **Abo-Status**; Provisions-Suppression am **Freundes-Graph**.

**Ranking (`matching-score.ts` `bewerteSvKandidat`) — Signal UMBIEGEN, nicht neu bauen:**
- `paketPrio·W_PAKET(100)` → **`istZahlenderNetzwerkPartner·W_NETZWERK(100)`** (Netzwerkpartner-Bucket über Free).
- `partner_rang` (rangOrdinal gold/silber/bronze) verfeinert **innerhalb** — unverändert (`2·W_RANG < W_NETZWERK`).
- `istTopPartner` (projection.ts) → **`istZahlenderNetzwerkPartner`** (= „Netzwerkpartner"-Badge, löst `paket≠basic` ab).
- `istKontingentBlockiert`: Netzwerkpartner nie blockiert (flach); nur Legacy-Pakete tracken Kontingent (Fulfillment).
- `paket` = **Legacy** (Fulfillment/Billing, kein Ranking-Treiber, nicht verkauft).
- **Zwei Boost-Ebenen:** #1 global (Netzwerkpartner > Free, überall + Badge) via matching-score; #2 relational („Dein Netzwerk"-Sektion, `applyNetzwerkPraeferenz`) für gebundene Kunden.

**Provisionen — Freundes-Graph-Gate (LOCKED, „rein operativ"):**
- Bestehende Inbound-Trigger unverändert (`create_werkstatt_provision` 150€, `create_makler_provision` 100/50€ **+10€ sponsor-Override**, `create_firmen_flotte_provision` 150€; inbound-Haftpflicht-only, `provision_aktiv`, 7d-Hold, Ledger `partner_provisionen`).
- **NEU: pro-Fall Freundes-Graph-Check** — Provision **unterdrückt**, wenn intra-Freundesnetzwerk (Inbound-Partner ↔ zugewiesener Gegenpart befreundet). **Makler = extern** → feuert immer. **Cross-network** → feuert. **Kein neuer SV-seitiger Provisions-Typ.**
- SV→Werkstatt-Referral (WS A/B): Partnerschaft + Einrichtungsgebühr-Waiver, **KEIN** Override (anders als das Makler-sponsor-10€).

**Offen (WS-B-Rest, implementierungsgetrieben):** Registrierung-Umbau + DAT-Gating-Removal (WS F, Verifizierungs-Freigabe bleibt), Abo-Ask im Onboarding (skippbar), In-App-Upgrade (reuse SV-Konto), Entitlement-Subscription-Row (derive-at-read, partner-typ-agnostisch) + Stripe-Recurring + Grandfather-Backfill.

## 14 · Offene Verifikationen (für den Plan)

- **Heutige Free-vs-Paid-Unterscheidung** genau (Basic-Onboarding vs `paket`/`onboarding_anzahlung`/`portal_zugang_freigeschaltet`) — den Prädikat-Term daran anlehnen, keine Doppel-Wahrheit schaffen.
- **Koexistenz** flache Monats-Subscription ↔ bestehendes pro-Fall-`gutachter_monatsabrechnungen`: ersetzt, ergänzt, oder getrennte Produkte? (Mit Billing-Owner klären.)
- **Makler-Referral-Onboarding** (Code) als exaktes Vorbild lesen (`lib/makler/*`, `EmpfehlungShareCard`, promo/Invite-Token).
- **Bestehender Stripe-Subscription-Integrationspunkt/Webhook-Handler** — gibt es schon recurring, oder nur PaymentIntents? (Anzahlung ist einmalig.)
- **Gate-Asymmetrie bestätigen:** bleiben Werkstatt-/Flotte-Owner v1 ungegated?
- **`werkstatt_setup_cent`-Aktivierung** (wann wird die Werkstatt-Gebühr scharf → Waiver wirkt real).
