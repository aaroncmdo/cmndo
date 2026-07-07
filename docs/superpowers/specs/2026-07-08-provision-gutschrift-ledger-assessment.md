# Provisions-/Gutschrift-Ledger — Normalisierungs-Assessment + Plan

> Assessment 2026-07-08 (Session `6f60c510`, nach der `claim_payments`-Normalisierung). Aaron:
> „admin gutschriften ledger sache" → „1 (Provisions-Ledger normalisieren assess+plan) und dann 2
> (das separate `gutschriften` klären)". **Dies ist ein Assessment + Plan — KEIN unilateraler Umbau**
> der aktiven `457ab612`-Files (partner-gutschrift/provision-status/partner-billing). Ausführung nur
> koordiniert.

## TL;DR / Empfehlung

Die Provisions-Buchhaltung ist **table-per-Partner-Typ** modelliert: `makler_provisionen` ≈
`werkstatt_provisionen` (nahezu identisch) und `makler_staffel_bonus` ≡ `werkstatt_staffel_bonus`
(identisch). Das ist **echte Struktur-Duplizierung** (Schema + symmetrische Logik in
`provision-status.ts`), aber — anders als beim `claims`-Cache-Chaos — **kein Korrektheits-Bug**
(die Tabellen halten *verschiedene* Zeilen, nicht redundante Kopien desselben Werts).

**Empfehlung:** Unifizieren auf `partner_provisionen(partner_typ)` + `partner_staffel_bonus(partner_typ)`
ist ein sinnvoller DRY-Refactor **und JETZT einmalig billig** (alle Tabellen **0 rows** auf prod →
kein Backfill, keine Downtime). Wenn es je gemacht wird, ist *jetzt* das Fenster (bevor Partner-Daten
auflaufen). ABER: es ist `457ab612`'s aktive Domäne + ein DRY-Refactor (nicht dringend) → **als
koordinierten Effort planen, sequenziert NACH deren laufenden Gutschrift-PRs** (#3841 etc.). Die
polymorphe `ledger_tabelle`-String-FK (Quelle des T6b-CRITICAL-Bugs) sollte **unabhängig** typsicher
gemacht werden — das ist der eigentliche Bug-Risiko-Hebel.

## 1 · Current-State-Map

### Earning-Side (Provisionen — was Partner/SV verdienen)
| Tabelle | Sp. | Modell | Duplikat von |
|---|---|---|---|
| `makler_provisionen` | 19 | per-Lead/Fall Referral-Provision (makler_id) | — |
| `werkstatt_provisionen` | 17 | per-Claim/Fall Referral-Provision (werkstatt_id) | ≈ makler_provisionen |
| `provisionen_maik` | 16 | monatlich CPL-basiert (marketing_partner_id) | distinkt (kein Duplikat) |
| `makler_staffel_bonus` | 10 | Staffel-Bonus (makler_id, stufe_id) | — |
| `werkstatt_staffel_bonus` | 10 | Staffel-Bonus (werkstatt_id, stufe_id) | ≡ makler_staffel_bonus (identisch) |

`makler_provisionen` vs `werkstatt_provisionen` — gemeinsamer Kern: `{partner}_id, claim_id, fall_id,
betrag_netto_eur, trigger_event, trigger_at, hold_until, status, storniert_am, storno_grund,
erstellt_am, ust_satz, ust_betrag, betrag_brutto`. Divergenz: makler hat `lead_id/promotion_code_id/
service_typ/abrechnung_id`, werkstatt hat `ausgezahlt_am/claim_nummer`. → 1 Tabelle `partner_provisionen`
mit `partner_typ` + den Union-Spalten (die typ-fremden nullable).

### Credit-Note-Side (Gutschriften — Auszahlungen/Refunds)
| Tabelle | Sp. | Modell |
|---|---|---|
| `partner_gutschriften` | 21 | Self-Billing §14 beim Partner-Payout. `partner_typ` (makler/werkstatt/marketing) + **polymorphe** `ledger_tabelle`+`ledger_id` → zeigt auf die Provisions-Tabelle. (457ab612, #3692/#3762/#3794/#3841) |
| `gutschriften` | 14 | **SV-Credit-Note** (`sv_id`, `betrag_netto/mwst/brutto`, `referenz_fall_id/abrechnung_id`, `stripe_refund_id`). Case-Billing-Reversal (`revert-case-billing.ts`). **Anderer Party-Strom (SV ≠ Partner).** |

Alles **0 rows auf prod** (pre-launch).

## 2 · claim_payments-Analogie — wo sie trägt, wo nicht

- **Trägt:** identische Struktur je „Typ" → EIN Ledger mit Typ-Diskriminator (dort `partei` vs/kunde/sv,
  hier `partner_typ` makler/werkstatt). Symmetrische Logik gegen parallele Tabellen (dort die Cache-Writer,
  hier `provision-status.ts`). 0-rows-Fenster für billige Migration.
- **Trägt NICHT:** `claim_payments` behob **redundante Caches desselben Werts** (`regulierungs_betrag`
  4-fach geschrieben → Drift-Korrektheits-Bug). Die Provisions-Tabellen sind **kein Cache-Duplikat** —
  makler- und werkstatt-Provisionen sind *verschiedene* Zeilen. Also: DRY/Wartbarkeit, **nicht** ein
  Korrektheits-Fix. Entsprechend geringere Dringlichkeit.

## 3 · Ziel-Modell (falls unifiziert)

```
partner_provisionen(
  id, partner_typ text CHECK (makler|werkstatt), partner_id uuid,
  claim_id, fall_id, lead_id,                    -- lead_id nullable (werkstatt claim-getrieben)
  betrag_netto_eur, ust_satz, ust_betrag, betrag_brutto,
  service_typ, trigger_event, trigger_at, hold_until,
  status, storniert_am, storno_grund, ausgezahlt_am, abrechnung_id,
  promotion_code_id, claim_nummer, erstellt_am
)
partner_staffel_bonus(
  id, partner_typ, partner_id, stufe_id, schwelle,
  bonus_betrag_netto, ust_satz, ust_betrag, betrag_brutto, status, erstellt_am
)
```
- `provisionen_maik` bleibt separat (monatlich/CPL-Modell, schlechter Fit).
- `partner_gutschriften.ledger_tabelle` schrumpft auf {partner_provisionen, partner_staffel_bonus,
  provisionen_maik} → **typsichere Konstante/Enum** statt roher Strings (verhindert die T6b-Bug-Klasse).
- `gutschriften` (SV) bleibt **separat** (anderer Party-Strom) — siehe §5.

## 4 · Migrations-Ansatz (0-rows = billigster Pfad)

Weil alles 0 rows ist: **kein Backfill nötig.** Phasen (jede 1 PR, Golden-Finance-Tests grün):
1. **Additiv:** `partner_provisionen` + `partner_staffel_bonus` per `apply_migration` anlegen (RLS
   admin-all/partner-self, REVOKE anon — wie partner_gutschriften). Regel 2 (File==recorded-version).
2. **Writer umbiegen:** `provision-status.ts` (+ Provisions-Erzeuger) auf die Union-Tabelle mit
   `partner_typ`. Ein Code-Pfad statt zwei parallelen.
3. **Reader umbiegen:** Admin-Cockpit (`PartnerBillingPanel`/`ProvisionenClient`) + Portal + `partner-billing.ts`
   auf die Union-Tabelle. `partner_gutschriften.ledger_tabelle`-Konstanten einführen.
4. **Alt-Tabellen droppen** (`makler_provisionen`/`werkstatt_provisionen`/`makler_staffel_bonus`/
   `werkstatt_staffel_bonus`) — 0-rows, drop-safe, nach Reader-Migration. `database.types.ts` regen.
5. **Prod-Smoke:** Provisions-Trigger (makler + werkstatt) + Payout→Gutschrift + Staffel-Bonus.

## 5 · Teil 2 — das separate `gutschriften` (SV-Credit-Notes)

**Befund:** `gutschriften` ist **kein Legacy/Redundanz**, sondern ein **eigener, lebender SV-Credit-Note-Ledger**:
`revert-case-billing.ts:136` bucht bei einem Fall-Billing-Reversal eine SV-Gutschrift ein
(`sv_id`, `betrag_netto`, `mwst_betrag`, `referenz_fall_id/abrechnung_id`, `verrechnet_in_abrechnung_id`,
`stripe_refund_id`) + bucht das SV-Werbebudget-Guthaben zurück. 0 rows nur, weil noch kein Reversal lief.
**Nicht droppen.** Party = **SV** (nicht makler/werkstatt/marketing) → gehört NICHT in `partner_gutschriften`.
Optionaler Long-Term-Gedanke: ein *einheitliches* Gutschrift-Modell über alle Empfänger-Parteien (SV + Partner)
wäre die maximale Normalisierung — aber die USt-/PDF-/§14-Logik divergiert (Partner=Self-Billing §14 Abs.2,
SV=Refund/Stripe) → **derzeit bewusst getrennt lassen.** Einzige empfohlene Härtung: falls `gutschriften`
je einen §14-Beleg braucht, an das `partner_gutschriften`-PDF/Nummern-Muster anlehnen (Code-Reuse), Tabelle
aber getrennt.

## 6 · Ownership / Koordination

- **`457ab612`** besitzt die aktive Gutschrift-/Provisions-Feature-Lane (`partner-gutschrift.ts`,
  `provision-status.ts`, `partner-billing-actions.ts`, `PartnerBillingPanel`). Eine Unifikation berührt
  genau diese Files → **sequenziert NACH deren #3841 + laufenden PRs**, oder als Joint-Effort mit ihnen.
- **`6f60c510`** (ich, Ledger-Normalisierung) liefert dieses Assessment + das Ziel-Modell zu; Ausführung
  koordiniert.
- **Entscheidung offen (Aaron):** Lohnt der DRY-Win (2 Tabellen→1, ein Code-Pfad, weniger polymorphe
  FK-Targets) die Churn in 457ab612's aktiver Lane? Pro: 0-rows = einmalig billig. Contra: kein
  Korrektheits-Bug, funktioniert. **Minimal-Alternative:** nur die `ledger_tabelle`-Konstanten härten
  (T6b-Bug-Klasse zu), Tabellen-Unifikation aufschieben.

**Marker:** `memory/COORDINATION-partner-payout-gutschrift.md` (457ab612's Lane) +
`memory/COORDINATION-payment-ledger-normalisierung.md` (meine Ledger-Arbeit).
