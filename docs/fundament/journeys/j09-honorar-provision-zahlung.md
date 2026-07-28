# J9 — Honorar / Provision / Zahlung

> Fundament A1 · Journey-Bibel. **Soll-Ablauf aus Nutzersicht** (Soll ≠ Ist — Abweichungen unter „⚠ IST weicht ab").
> **Soll = das Netzwerk-Ökosystem-Modell** (Lane 332d22f1, [[coordination-netzwerk-verbindungen-freemium-angebotsstruktur]] —
> paused). Vier getrennte Geldflüsse, oft verwechselt.

**Rollen:** SV (Honorar + Netzwerkpartner-Abo) · Makler/Werkstatt (Provision) · Kunde (Regulierungs-Auszahlung) · KB/Admin (Finance) · System (Stripe + Release-Cron).
**Vorbedingungen:** je Fluss — Gutachten (Honorar), vermittelter Haftpflicht-Fall abgeschlossen (Provision), Abo aktiv (Revenue), VS reguliert (Zahlung).
**Startpunkt(e):** SV-Gutachten-Abrechnung · Netzwerkpartner-Abo (Stripe) · Partner-Provisions-Ledger · VS-Regulierungseingang.

## Ablauf (Soll)

Vier **verschiedene** Geldflüsse sauber trennen:
- **Netzwerkpartner-Abo** = das **Haupt-Revenue** von Claimondo: Monats-Flat + Setup-Fee vom SV, **beide via Stripe** (J8).
- **SV-Honorar** = Vergütung des SV fürs Gutachten (zahlt die gegnerische VS bzw. der Kunde).
- **Provision** = Vermittlungs-Vergütung an einen Partner (Makler/Werkstatt).
- **Zahlung/Regulierung** = der Schadensbetrag, den die VS an den Kunden zahlt.

### A · Netzwerkpartner-Abo (Revenue)
1. SV schließt das Abo (Stripe Recurring + Setup-Fee-Item) → `sv_netzwerk_abonnements` aktiv → Entitlement (derive-at-read) → Ranking-Boost (J10). Kündigung → Boost fällt beim nächsten Read weg.

### B · SV-Honorar
2. Gutachten fertig → Honorar-Position; der Kanzlei/VS in Rechnung gestellt (`erstelleKanzleiAbrechnung`, `generateKanzleiAbrechnungPdf`).

### C · Provision (inbound-Haftpflicht + Freundes-Graph-Gate)
3. **Entstehen** — nur bei **inbound Haftpflicht**: Claimondo steuert einen Fall **ins** Netzwerk (Makler-inbound, oder Werkstatt→SV **außerhalb** dessen Netzwerk). `partner_provisionen`-Zeile, Status `pending`.
4. **Freundes-Graph-Suppression** — **intra-Netzwerk** (befreundete Parteien) → **keine Provision** (das Abo deckt die Vermittlung ab). Die Suppression greift an der **RELEASE-Zeit** (`completion-release-gate.ts`, completion+7d), **nicht** am Inbound-INSERT-Trigger.
5. **Freigabe → Auszahlung** — `freigebenProvision`/`gebeProvisionFrei` (`pending → freigegeben`, ereignisgekoppelt, `runProvisionsRelease`-Cron heilt nach) → `auszahlenProvision`/`zahleProvisionAus`. **Notif:** Makler `notifyMaklerProvisionStatus`. SV→Werkstatt-Referral = analog Makler, **aber kein Override**.

### D · Regulierungs-Auszahlung an den Kunden
6. VS reguliert → `kanzleiAuszahlungEingegangen` → an den Kunden weitergereicht. **Status:** `regulierung`/`reguliert_vollstaendig`/`zahlung-eingegangen`.

## Varianten / Abzweige

- **Kein Provisions-Fall:** Selbstzahler/Kasko-Reparatur, oder intra-Netzwerk-Vermittlung → **keine** Provision.
- **VS kürzt** (`vs-kuerzt`) → Teil-Regulierung; Differenz ggf. Klage (J6).
- **Storno** → `storniereProvision`/`erstelleStornoGutschrift` (J7).

## Fehlerfälle und ihr Soll-Verhalten

- **Provision trotz Freundschaft** → darf **nicht** ausgezahlt werden; die Release-Gate-Suppression muss den Freundes-Graph zur Completion-Zeit prüfen (nicht beim Insert — die Freundschaft kann sich bis dahin ändern).
- **Prämatur-Release** → Provision nicht vor Fertigstellung (ereignisgekoppelt + Cron-geheilt, 457ab612).
- **Doppel-Auszahlung** → idempotent über Status-Filter (`.eq('status','pending')` → Retry trifft 0 Rows).
- **Abo-Zahlung fehlschlägt** → Boost endet sauber (derive-at-read), kein Zugangsverlust.

## ⚠ IST weicht ab (mit Fundort)

1. **„inbound-Haftpflicht-only" NICHT enforced (K-Blocker):** eine Geschäftsregel ohne hartes Gate — der Freundes-Graph-Gate + die Release-Suppression sind **Soll**, noch nicht gebaut (Epic paused). IST: `finance/provision-status.ts` + `partner-billing-actions.ts` kennen kein Freundschafts-Konzept.
2. **Suppression-Ort:** Soll = RELEASE-Zeit (`completion-release-gate.ts`). IST: die Provisions-Entstehung ist Insert-nah, ohne Graph-Prüfung.
3. **Zwei Provisions-Achsen im Umbau:** `provision-status.ts` **und** `partner-billing-actions.ts` + angekündigte Alt-Tabellen-Drops (Phase 3) — heterogen.
4. **Stripe-Recurring greenfield:** Abo-Revenue existiert im Code noch nicht (Live-Webhook 0 subscription-Events); Stripe ist live (27.07.), aber nur für Einmal-/Embed-Billing.

## Offene Fragen an Aaron (max. 5)

1. **Freundes-Graph-Definition:** Wann gelten zwei Parteien als „befreundet" (Provisions-frei) — gegenseitige Bestätigung, Owner-Bindung, beides?
2. **Referral-Konditionen:** Höhe/Trigger der Makler- und SV→Werkstatt-Provision (außerhalb Netzwerk)?
3. **Abo vs. Provision-Balance:** Soll das Abo die Vermittlung vollständig ersetzen, oder bleiben inbound-Provisionen ein zweites Standbein?
