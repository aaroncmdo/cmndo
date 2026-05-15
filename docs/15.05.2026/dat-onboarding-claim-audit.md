# DAT-Onboarding/Claim/Abrechnung — Konzept-Audit

**Datum:** 2026-05-15
**Reviewed:** Aaron + Claude (Session auf isoliertem Worktree `kitta/aar-dat-concepts-review`)
**Scope:** Spec-Review der drei Konzepte aus `docs/12.05.2026/`:
- `DAT-CLAIM-MAP-KONZEPT.md`
- `DAT-SELF-ONBOARDING-KONZEPT.md`
- `abrechnung-audit.md`

---

## TL;DR

| Konzept | Ready für Implementation? | Blocker |
|---|---|---|
| Claim-Map | ❌ Nein | RLS-Policies + `ulid`-Typ + `firma_key`-Strategie + `quelle`-Live-Check |
| Self-Onboarding | ❌ Nein | Bestehender Code-Audit + Paket-Rename-Plan + `qualifikationen[]`-Konsolidierung |
| Abrechnung-Audit | ✅ Ja (als Diagnose) | Reihenfolge der Top-5-Fixes neu sortieren — State-Trigger zuerst, dann Cron-Konsolidierung |

Alle drei sind inhaltlich stark. Die Lücken sind **Spec-technisch** (fehlende RLS, Type-Fehler, fehlende Pre-Build-Analyse), nicht konzeptionell.

---

## 1. DAT-CLAIM-MAP — Findings

### 1.1 Solide
- Mapbox-Setup, Pin-Logik, Side-Panel/Bottom-Sheet-States
- Edge-Cases-Tabelle (Abschnitt 9) sauber
- Multi-Standort-Claim per `firma_key` als psychologischer Hebel
- Layer-Overrides für Claimondo-Look statt eigenem Style

### 1.2 Blocker

#### B1 — RLS fehlt komplett
Public Map auf `/claim` liest mit anon-Key aus `sv_leads` und schreibt in `claim_activations`. Ohne Policies entweder:
- alles offen (Datenleck — Emails, Telefonnummern, Magic-Link-Token public),
- oder anon-Reader sieht nichts (Map bleibt leer).

**Erwartet im Spec:**
```sql
-- sv_leads: public-read auf Geo-Daten, aber KEINE PII bei warteliste_status='ausstehend'
CREATE POLICY claim_map_public_read ON sv_leads
  FOR SELECT TO anon
  USING (quelle = 'dat_expert' AND warteliste_status IN ('ausstehend', 'geclaimed', 'verifiziert', 'aktiv'));

-- claim_activations: NIE public-readable. Token wird per Function ausgegeben.
ALTER TABLE claim_activations ENABLE ROW LEVEL SECURITY;
-- KEINE SELECT-Policy für anon
```

Plus: Claim-Submit kann nicht direkt `UPDATE sv_leads … TO anon` — das wäre Mass-Assignment-Hole. Pattern muss eine `SECURITY DEFINER` Function sein (`claim_dat_standort(lead_id, vorname, nachname, email, …)`), die intern validiert + schreibt.

#### B2 — `id ulid PRIMARY KEY` ist kein Postgres-Typ
```sql
CREATE TABLE claim_activations (
  id ulid PRIMARY KEY,  -- ❌ existiert nicht nativ
  …
);
```
**Fix:** Entweder `uuid PRIMARY KEY DEFAULT gen_random_uuid()` oder `text PRIMARY KEY DEFAULT generate_ulid()` mit ULID-Function. Wenn ULID gewünscht: Extension prüfen, sonst `uuid` nehmen.

#### B3 — `firma_key`-Strategie nicht definiert
Spec verwendet `firma_key` als Gruppen-Identifier für Multi-Standort, sagt aber nicht wie er generiert wird:
- Slug aus Firmenname (`ing-buero-wester-gmbh`)?
- Manueller Eintrag beim Import?
- Konflikt-Strategie bei Duplikat-Firmen unterschiedlicher Inhaber?

**Aktion:** Vor Import-Skript: Strategie festlegen + im Bulk-Import-Skript implementieren.

#### B4 — `quelle = 'dat_expert'` ohne Live-Check
Memory + Spec sagen nichts über existierende Werte in `sv_leads.quelle`. **Vor Migration:**
```sql
SELECT DISTINCT quelle, count(*) FROM sv_leads GROUP BY quelle;
```
Lesson aus `feedback_information_schema_check.md`: Memory-Snapshots sind 1-2 Tage stale.

#### B5 — `supabase_functions.http_request()` als Trigger-Mechanismus
Spec Abschnitt 7.3:
```sql
SELECT supabase_functions.http_request(
  'POST', 'https://[project].supabase.co/functions/v1/send-activation-email', …
);
```
Das benötigt `pg_net`-Extension + die DB ruft direkt eine Edge-Function auf. Architektonisch heikel (timeout, retry-state in DB, error-handling). **Empfehlung:** Edge-Function vom Claim-Submit (Server-Action) aufrufen, nicht aus dem SQL-Trigger.

### 1.3 Nice-to-have / Spätere Risiken
- **Bot-Protection:** 62 Standorte = 62 potenzielle Fake-Claims. Captcha oder Honeypot in Spec ergänzen.
- **Magic-Link-Wiederversand:** Was wenn SV die Aktivierungs-Mail verliert? Spec hat keinen Resend-Flow.
- **Mapbox-Token im Frontend:** Public Token mit `URL-restrictions` auf `gutachter.claimondo.de` setzen (sonst Quota-Klau).

---

## 2. DAT-SELF-ONBOARDING — Findings

### 2.1 Solide
- Stepper-Flow mit Sub-Progress (Profil 1/4 … 4/4)
- Incremental-Save mit `onboarding_step`-Resume
- Free/Basic/Premium-Routing-Tabelle (Abschnitt 3)
- Gutschein-Code-Logik (`DAT2026`) mit Live-Validation
- Aktivierungs-Mail-Spec (Abschnitt 11) inkl. Foto-Strip + Webinar-Block

### 2.2 Blocker

#### B1 — Bestehender Code nicht analysiert
Abschnitt 12 sagt:
> Vor Bau muss der aktuelle Onboarding-Stand reviewed werden (was bleibt, was wird umgebaut).

Das ist **der Blocker schlechthin.** Ohne Inventur des existierenden `src/app/onboarding/*` + `src/components/onboarding/*` läuft die Implementation in Doppel-Bauten + Redundanz-Check-Fails.

**Aktion vor Build-Start:**
```bash
ls src/app/onboarding/
grep -rn "onboarding" src/app/ src/components/ src/lib/
```
Inventur-MD anlegen: Routes → Components → DB-Calls → Mapping zu neuen Screens 1-8.

#### B2 — Paket-Rename ohne Backwards-Compat
Spec sagt:
> `standard` → `basic`, `pro` → `premium`

**Was hängt an `paket = 'standard'`?**
- UI-Logik (welche Tabs zeigen, welche Features unlocken)
- Cron-Filter (`cron/abrechnung-erstellen` filtert eventuell auf Paket)
- Billing-Pfade (`paket_preis`-Berechnung)
- Stripe-Webhooks?

**Vor Rename:** `grep -rn "'standard'\|'pro'\|\"standard\"\|\"pro\"" src/` und alle Stellen mappen + Migration in zwei Phasen (ADD new value → backfill → DROP old value).

#### B3 — `qualifikationen_neu[]` schafft Drift
Spec Abschnitt 2.2:
> Titel-Auswahl → `qualifikationen_neu[]`

DB hat aktuell `qualifikationen[]` (laut Schema). **Nicht zweite Parallel-Spalte anlegen** — das ist CMM-44ff-Drift in klein. Entweder existierende Spalte erweitern oder umbenennen.

#### B4 — `onboarding_step text` ohne CHECK
```sql
ADD COLUMN IF NOT EXISTS onboarding_step text;
```
Ohne CHECK-Constraint → Resume-Logik prüft Strings; Typo in Code fängt keiner. **Fix:**
```sql
ADD COLUMN onboarding_step text CHECK (onboarding_step IN (
  'welcome', 'profil_quali', 'profil_fahrzeuge', 'profil_schaden',
  'profil_radius', 'reward', 'tier', 'kalender', 'verfuegbarkeit',
  'bewertungen', 'fertig'
));
```

#### B5 — Magic-Link kollidiert mit 2FA-Default
Memory `project_e2e_test_users.md` sagt: neue Accounts haben `twofa_aktiviert=false`, aber das ist Test-Setup. Production-Default ist 2FA-on.

**Spec Abschnitt 11 sagt:**
> Nach Passwort-Setzen: Auto-Login + Redirect zu `/onboarding/willkommen`

Wenn 2FA-on default ist, kommt 2FA-Setup VOR Onboarding und bricht den Flow ab. **Klärung:** 2FA während Onboarding deaktiviert, am Ende (Screen 8) als optionale Aktion anbieten — ODER 2FA-Setup als Screen 0.5 zwischen Magic-Link und Welcome.

### 2.3 Nice-to-have / Spätere Risiken
- **Google Places API Kosten:** Place-Details-Calls teuer. Field-Mask auf `place_id,rating,user_ratings_total` setzen (sonst Free-Tier-Quota schnell weg).
- **Premium-Vormerkung** schreibt `premium_wunsch_plz` direkt in `sachverstaendige`. Wenn SV von Basic→Premium aufsteigt: was passiert mit den Wunsch-Feldern? Separates `premium_waitlist`-Table wäre sauberer.
- **Outlook-OAuth (Screen 5):** Phase 2 — OK, aber Spec sollte das im Stepper deutlicher als „Coming Soon" labeln.

---

## 3. ABRECHNUNG-AUDIT — Findings

### 3.1 Diagnose ist stark
- Zwei parallele Cron-Jobs identifiziert + sauber gegenübergestellt
- `processCaseBilling()` als toter Code dokumentiert (Grep-Befund)
- UI-Drift zwischen Hub (alte Tabelle) und Detail-Page (neue Tabelle) erkannt
- 3 Edge-Case-Lücken (Disqualifikation, SV-Ablehnung, Stripe-Webhook-Drift) gefunden

### 3.2 Reihenfolge der Top-5-Fixes neu sortieren

Spec empfiehlt **Fix 1 (Cron-Konsolidierung) zuerst**. **Besser umdrehen:**

| # | Fix | Begründung |
|---|---|---|
| **1** | Fix 2 — `processCaseBilling()` triggern | Ohne Trigger schreibt System B nichts. Cron-Konsolidierung würde 0 Abrechnungen produzieren. |
| **2** | Shadow-Mode Cron A + B parallel laufen lassen | Verifizieren dass B die gleichen Daten produziert wie A (1 Monat) |
| **3** | Fix 1 — System A abschalten + Legacy-Daten migrieren | Erst nach Shadow-Mode-OK |
| **4** | Fix 3 — `revertCaseBilling()` triggern | Disqualifikation-Pfad schließen |
| **5** | Fix 4 — `sv_payment_reminders` befüllen | Cron + Email |
| **6** | Fix 5 — Admin-Hub-Reports | UI auf neue Datenquelle umstellen + neue Reports |

### 3.3 Trigger-Strategie für `processCaseBilling()` — (a) vor (b)

Spec sagt „(b) zuerst, dann (a) für Live-Sichtbarkeit". **Umdrehen:**

- **(a) State-Machine-Trigger** in `transitionFallStatus()` bei `gutachten_erstellt` / `abgeschlossen` → atomar, sofortige SV-Sichtbarkeit
- **(b) Batch-Cron** als Backstop für Fälle die den State-Trigger verpasst haben (Crashes, manuelle DB-Updates)

Begründung: zwischen Fall-Abschluss und Berechnung sonst bis zu 24h Lag — SV sieht im Portal „X Fälle, Y € erwartet" erst am Folgetag.

### 3.4 Stripe-Drift = eigenes Ticket
> 200+ `stripe_events` vs. 0 Rows `gutachter_einzahlungen`

Das ist nicht „Verdacht zu verifizieren" — das ist eindeutiger Drift. Eigenes Ticket: `cron/stripe-events-reconcile` der `stripe_events` mit `abrechnungen.bezahlt_am` cross-checked.

### 3.5 Ergänzung — Fix 6 (nicht im Original)
**Org-Sammelrechnung-Smoke fehlt.** Spec Abschnitt 1 erwähnt „Org-Sammelrechnungen für Büro/Akademie (KFZ-152)" — wurde der Pfad jemals end-to-end gesmoked? Wenn 0 Rows in `abrechnungen` mit `empfaenger_typ='org'`: nein. Eigener Smoke nach Fix 2 nötig.

---

## 4. Konkrete nächste Schritte

### Sofort (vor Build-Start)
1. **Claim-Map:** Spec-Update mit RLS-Policies + `uuid` statt `ulid` + `firma_key`-Strategie. Diff-Commit auf `DAT-CLAIM-MAP-KONZEPT.md`.
2. **Self-Onboarding:** Inventur des bestehenden Onboarding-Codes — neue MD `docs/15.05.2026/onboarding-bestehender-code-inventur.md`. Mapping existierende Routes/Components → neue Screens 1-8.
3. **Abrechnung:** Top-5-Fixes als 5 Linear-Tickets in neuer Reihenfolge (Fix 2 → 1 → 3 → 4 → 5). Plus Stripe-Drift-Reconcile als 6. Ticket.

### Tickets-Vorschlag
- **AAR-XXX:** DAT Claim-Map — Spec-Cleanup (RLS, ulid→uuid, firma_key, quelle-Live-Check, Edge-Function-Trigger)
- **AAR-XXX:** DAT Self-Onboarding — Pre-Build-Inventur bestehender Code + Paket-Rename-Plan
- **AAR-XXX:** Abrechnung — `processCaseBilling()` via State-Machine-Trigger + Batch-Cron-Backstop
- **AAR-XXX:** Abrechnung — Cron-Konsolidierung (System A abschalten nach Shadow-Mode)
- **AAR-XXX:** Abrechnung — `revertCaseBilling()` an Disqualifikation/Storno hängen
- **AAR-XXX:** Abrechnung — `sv_payment_reminders`-Cron + Email-Template
- **AAR-XXX:** Abrechnung — Admin-Hub-Reports (säumige SVs, offene Berechnungen, per-SV-Balance)
- **AAR-XXX:** Stripe-Drift-Reconcile-Cron (`stripe_events` × `abrechnungen.bezahlt_am`)

---

## 5. Was bewusst NICHT in diesem Audit

- Webinar-Pitch-Deck-Inhalt (blockiert auf Philipps Datum)
- Outbound-Mail von Philipp (separates Konzept, blockiert auf Webinar-Datum)
- Stripe-Webhook-Robustheit im Detail (eigenes Audit-Thema)
- Kanzlei-Abrechnung-Pfad (eigene Tabellen-Familie, eigener Audit)
- VS-Auszahlungen (`claim_payments`, AAR-823)
- Mobile-App-Spiegelung der Onboarding-Screens (Phase 2 nach React-Native-Decision)

---

## Anhang — Branch & Session

- **Branch:** `kitta/aar-dat-concepts-review`
- **Worktree-Pfad:** `.claude/worktrees/aar-dat-concepts-review/`
- **Begründung Worktree:** 2 andere Sessions liefen parallel auf `kitta/aar-gutachter-heute-isochrone-fix` — isolierter Branch verhindert Trampeln (Lesson aus `feedback_branch_kollision_absprache.md`).
- **Commit-Strategie:** Nur diese eine MD, kein Code-Touch, kein anderes File. PR optional (Aaron entscheidet — auch Direct-Doc-Merge möglich da nur `docs/`).
