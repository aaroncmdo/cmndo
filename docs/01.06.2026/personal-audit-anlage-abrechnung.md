# Personal-Audit: Anlage & Abrechnung (DB-zentriert)

**Datum:** 2026-06-01
**DB:** `Claimondo-v2` / `paizkjajbuxxksdoycev` (eu-west-2, aktiv)
**Methode:** Read-only. Live-Schema, echte Row-Counts, RLS-Policies, Trigger, FK-Map und Stichproben via Supabase-MCP `execute_sql`; zwei Code-Explorer (Anlage-Flows + Abrechnungs-Flows); ein empirisches anon-Leak-Probe-Script (`scripts/probe-anon-sv-leak.mjs`). Es wurde **nichts** verandert.
**Scope:** "Personal" = Workforce + interne Rollen (SV, Mitarbeiter, Kanzlei, Makler) + deren Anlage (Account-Erstellung) und Abrechnung (Honorar/Provision/Onboarding). Hinweis: Lohn-Abrechnung im HR-Sinn existiert datenseitig nicht (s. Teil A).

---

## 0 · Verdict

**Anlage** ist gesund und live: 141 Profile, 10 SV durch einen sauberen Verifizierungs-Funnel, Rollen-/Privileg-Eskalation per DB-Trigger strukturell abgedichtet.

**Abrechnung** ist stark ubergebaut (~12 Tabellen-Familien, viele Crons), aber **operativ vor-Launch**: kein einziger Live-Zahlungsdatensatz. Alle vorhandenen Zeilen sind Smoke-/Seed-/Stripe-**Test**modus-Daten. Ausgerechnet das im Code als *@deprecated* markierte SV-Abrechnungs-System schreibt als einziges noch frische Zeilen.

**Ein Befund ist CRITICAL und sofort handlungsbedurftig:** die oeffentliche SV-Karten-Policy liefert anonymen Nutzern ganze `sachverstaendige`-Zeilen inkl. lebendem Google-OAuth-Token, Stripe-Customer-IDs und USt-IDs (empirisch bewiesen, s. Teil C / Anhang A).

| Schwere | Anzahl | Themen |
|---|---|---|
| 🔴 CRITICAL | 1 | anon-Leak sensibler Spalten auf `sachverstaendige` |
| 🟠 HIGH/MEDIUM | 6 | System-A/-B-Drift, Org-Doppelmodell, Makler-Anlage-Lucke, Betrags-Inkonsistenzen, polymorphe `abrechnungen.empfaenger`, Rechnungsnummern-Schemata |
| 🟡 LOW/Hygiene | 5 | 2FA ungenutzt, Payroll-Spalten staff-lesbar (latent), tote Tabellen, stale Seeds, `profiles.email` nicht UNIQUE |

---

## TEIL A — Anlage (Personal anlegen)

### A.1 Bestand (`profiles`, 141 Zeilen, alle `aktiv`)

| Rolle | n | 2FA an | force_password_change |
|---|--:|--:|--:|
| kunde | 119 | 3 | 99 |
| sachverstaendiger | 9 | 0 | 0 |
| admin | 5 | 1 | 1 |
| dispatch | 3 | 0 | 0 |
| kundenbetreuer | 2 | 0 | 1 |
| kanzlei | 2 | 0 | 0 |
| makler | 1 | 0 | 0 |

- 🟡 **2FA praktisch ungenutzt** bei Personal (0 bei SV/Dispatch/Kanzlei/Makler; 1 von 5 Admins). Fur interne Rollen + Makler/Kanzlei mit Geldzugriff eine Hartungs-Lucke.
- 🟢 `force_password_change` greift erwartbar (99/119 Kunden = Auto-Accounts aus Fallen, nie eingeloggt).

### A.2 Mitarbeiter-/Payroll-Struktur liegt auf `profiles` — ist aber leer

`profiles` tragt `position`, `gehaltsstufe`, `gehalt_brutto`, `eingestellt_am` — **0 befullt** (nur 1 Admin hat `eingestellt_am`). `mitarbeiter_performance` (KPI) = **0 Zeilen**. `createMitarbeiter()` setzt `eingestellt_am` laut Code; die 12 internen Accounts stammen also aus der Zeit vor dieser Verdrahtung bzw. aus Seeds.

> **Folgerung:** Es gibt aktuell **keine Personal-/Lohn-Abrechnung** in der DB. "Abrechnung" ist durchgangig Honorar/Provision/Onboarding, nicht Gehalt. Die HR-/Payroll-Felder werden im Betrieb nicht gepflegt.

### A.3 Sachverstaendige = die eigentliche Workforce (`sachverstaendige`, 100 Spalten, 10 Zeilen)

- 🟢 **Verknupfung sauber:** 0 Waisen, 0 fehlende Profile, 0 SV-Profile ohne SV-Zeile. (10 SV-Zeilen vs. 9 Profile mit `rolle=sachverstaendiger` -> eine SV-Zeile hangt an einem Profil anderer Rolle, vermutlich Admin-doppelt-als-Test-SV.)
- **Onboarding-Funnel:** 10 angelegt -> 8 Vertrag unterschrieben -> 8 Portal freigeschaltet -> 7 verifiziert. Konsistent.
- `sv_with_org = 0` — kein SV ist einer Organisation zugeordnet.

### A.4 Anlage-Flows (im Code verifiziert)

Architektur-Strength 🟢: **alle** Anlage-Pfade laufen uber `createAdminClient()` in `'use server'`-Actions; `rolle` wird nie aus FormData gelesen, immer serverseitig gesetzt.

| Rolle | Anlage-Pfad | Datei | schreibt | Gates |
|---|---|---|---|---|
| SV Solo | `anlegeSv()` | `src/app/admin/sachverstaendige/anlegen/actions.ts:120` | auth + profiles(`rolle=sachverstaendiger`) + sachverstaendige | `onboarding_status='vom_admin_angelegt'`, `ist_aktiv=false`, `portal_zugang_freigeschaltet=false`, 2FA off (AAR-697) |
| SV Buero/Sub/Akademie/Community | `anlegeBuero()` / `anlegeSubSv()` / `anlegeAkademie()` / `anlegeCommunity()` | dieselbe Datei (275–1250) | + **`organisationen`** (`typ=buero/akademie/community`) | Email-Dedup -> 1 auth.user, N SV-Zeilen pro Org |
| Mitarbeiter (admin/dispatch/kundenbetreuer/kanzlei) | `createMitarbeiter()` | `src/app/admin/team/actions.ts:28` | auth + profiles (rolle aus Form), **keine** SV-Zeile | `force_password_change=true`, 2FA off, Rolle sofort live |
| Kunde | `createKundeAccount()` (Self-Signup nach SA) | `src/app/flow/[token]/actions.ts:269` | auth + profiles(`rolle=kunde`) + faelle + claims | **Account-Hijack-Guard** (pruft bestehende `rolle` vor Email-Reuse) |
| Makler | **— kein Pfad —** | — | — | s. A.6 |

### A.5 🟢 Privileg-Guards (DB-Trigger) — Self-Eskalation abgedichtet

- `guard_profiles_rolle` — BEFORE INSERT + BEFORE UPDATE OF `rolle, sv_paket, aktiv`.
- `guard_sachverstaendige_privilegien` — BEFORE INSERT + BEFORE UPDATE OF `verifiziert, werbebudget_guthaben_netto, ist_aktiv, use_custom_branding, paket, paket_faelle_gesamt, paket_preis, paket_umkreis_km, gesperrt_grund, gesperrt_seit, verifizierung_status`.

-> Ein SV kann sich nicht selbst verifizieren, sein Guthaben/Paket andern oder entsperren; ein User kann seine Rolle nicht self-eskalieren — selbst wenn die UPDATE-RLS-Policy es zeilenweise erlaubt (die Guards sitzen darunter).

### A.6 🟠 Makler haben keinen Anlage-Pfad

Kein `createMakler()` in `admin/team` oder `admin/sachverstaendige`. Trotzdem existiert **1 Makler** in der DB (manuell/Seed). Gleichzeitig ist die komplette `makler_provisionen`-Maschinerie gebaut. -> Der Partner, der Provisionen verdienen soll, ist uber kein definiertes Onboarding anlegbar. **Lucke zwischen Anlage und Abrechnung.**

### A.7 🟠 Zwei parallele Organisations-Systeme — beide leer

1. `organisationen` (39 Spalten, `parent_user_id->profiles`) + `sachverstaendige.organisation_id` + `sv_onboarding_rechnungen.organisation_id` — **vom Anlage-Code beschrieben (canonical).**
2. `sv_organisation` (`inhaber_sv_id->sachverstaendige`) + `sv_organisation_memberships` + `sv_organisation_laeufer_reports` — **von keinem Anlage-Pfad beschrieben (toter Zwilling).**

Beide modellieren dasselbe (SV-Buero mit Sub-SV/Laufern), alle **0 Zeilen**. -> `organisationen` behalten, `sv_organisation*` droppen (jetzt billig, weil leer).

### A.8 🟡 `profiles.email` nicht UNIQUE

Nur `auth.users.email` ist unique; Profil-Dedup ist "soft" (Upsert on `id`). Sub-SV-Email-Reuse uber Org-Grenzen ohne Konflikt-Check (evtl. gewollt, undokumentiert).

---

## TEIL B — Abrechnung

### B.1 Fragmentierungs-Karte (wer wird wie abgerechnet)

| Familie | Zweck | Empfanger-FK | Zeilen | Code-Status | Daten-Status |
|---|---|---|--:|---|---|
| `sv_onboarding_rechnungen` | SV zahlt Einstieg (Anzahlung) | `sv_id`, `organisation_id` | 4 | aktiv (Stripe-Webhook, `createOnboardingRechnung`) | 🟢 real-strukturiert, aber Stripe **`cs_test_`** = Testmodus |
| `gutachter_monatsabrechnungen` (+`gutachter_abrechnungspositionen`) | SV zahlt Monats-/Lead-Paket | `sv_id` | 2 / 1 | **@deprecated** Cron `monatsabrechnung` ("System A") | 🔴 schreibt trotzdem die neuesten Zeilen (2026-06-01 02:00) |
| `gutachter_abrechnungen` | Vorganger-Variante | `sv_id` | 0 | tot | leer |
| `abrechnungen` (+`abrechnung_positionen` +`abrechnung_reminders`) | "System B" konsolidiert (sv/makler/kanzlei/marketing) | **polymorph, kein FK** | 3 / 0 / 0 | kanonisch (Crons `abrechnung-erstellen`/`-einzug`/`-reminder`/`-faellig-check`) | 🟠 nur 3 SMOKE-Zeilen, 2 mit `empfaenger_id = NULL` |
| `kanzlei_abrechnungen` (+pos/+rem) | Kanzlei zahlt pro Vollmacht (Magic-Link, 150 EUR netto) | `kanzlei_id->kanzleien` | 0 | aktiv (Crons `abrechnung-kanzlei-erstellen`/`-reminder`) | leer |
| `embed_abrechnung_positionen` (+View `v_embed_billing_faellig`) | EUR-70-Embed-Light-Claim | `anfrage_id`,`termin_id`,`embed_site_id` | 0 | **keine Writer gefunden** | 🟠 Schema-only, nie gefeuert |
| `makler_provisionen` | Makler-Provision | `makler_id->makler` | 0 | aktiv (Cron `release-makler-provisionen`) | leer (1 Makler, 0 Provisionen) |
| `provisionen_maik` | Google-Ads-Partner CPL/CPA (150 EUR) | `lead_id` (kein Maik-FK) | 0 | aktiv (Cron `maik-monatsabrechnung`) | leer |
| `claim_payments` | VS-Zahlungseingang pro Claim | `claim_id` | 0 | aktiv (LexDrive/State-Machine, Phase-Trigger) | leer |
| `finance_eintraege` | Ledger | `referenz_typ/id` (kein FK) | 5 | keine Writer gefunden | 🟠 stale Seed: 5x "Gutachter-Anzahlung … offen" seit Anfang April |
| `finance_monatsberichte` | Monats-P&L (Maik/Kanzlei/DB-II/Gewinn-Split 75/25) | — | 2 | keine Reader gefunden | Seed/manuell |
| `sla_tracking` | SLA-Uberwachung (kein Geld) | `claim_id`,`fall_id`,`eskalation_task_id` | 26 | aktiv (Cron `kanzlei-sla-check`) | 🟠 24/26 = "breached" |
| `rechnungs_konfiguration` / `rechnungs_nr_counter` | Rechnungssteller-Stammdaten / Zahler | — | 1 / 1 | nur Konfig genutzt (Onboarding); **Counter ungenutzt** | Infra |
| `sv_payment_reminders` | Onboarding-Zahlungs-Mahnungen | `sv_id` | 2 | aktiv (Cron `sv-payment-reminders`) | aktiv |

### B.2 🔴/🟠 Kern-Befund: System-A/-B-Drift (Code sagt X, Produktion macht Y)

Der Code deklariert `abrechnungen` ("System B", `abrechnung-erstellen`) als kanonisch und `gutachter_monatsabrechnungen` ("System A", `monatsabrechnung`) als *@deprecated, VPS-Crontab nach Migration zu loschen*. **Die Daten widersprechen:** `abrechnungen` hat nur 3 Smoke-Zeilen, wahrend System A am 2026-06-01 um 02:00 die jungste Zeile erzeugt hat (200 EUR / 400 EUR SV-Monatsabrechnung).

-> Der "deprecatete" VPS-Cron lauft offenbar weiter und ist real die einzige SV-Abrechnungs-Quelle; das kanonische System B feuert auf dieser DB nicht.

**Aktion: VPS-Crontab prufen** — welcher der beiden Crons ist scheduled? Einen zur Wahrheit machen, den anderen abschalten + Daten migrieren (AAR-924/925 abschliessen).

### B.3 🟠 Drei Rechnungsnummern-Schemata, ein ungenutzter Counter

- SV/Org-`abrechnungen`: `CMNDO-{YYYY}-{MM}-{NNNN}` (inline-COUNT pro Monat)
- `kanzlei_abrechnungen`: `CMNDO-K-{YYYY}-{MM}-{NNN}` (LIKE-Parse des letzten)
- `sv_onboarding_rechnungen`: `CM-ONB-{YYYY}-{NNNNN}` (Helper `generateRechnungsNr`)

Die dedizierte `rechnungs_nr_counter`-Tabelle wird von keinem genutzt -> inline-COUNT/LIKE ist bei Nebenlaufigkeit lucken-/kollisionsanfallig (GoBD: Nummernkreise sollten luckenlos & kollisionsfrei sein).

### B.4 🟠 Inkonsistente Betrage fur "dasselbe"

- "pro"-Anzahlung: `sv_onboarding_rechnungen` = **3.000 EUR netto / 3.570 EUR brutto**, aber `finance_eintraege` bucht "… (pro)" = **3.750 EUR**.
- Zwei Paket-Taxonomien: DB nutzt `standard`/`pro`; Admin-Code nutzt `starter-10`/`standard-25`/`premium-50` mit 750/1.875/3.750 EUR. Gleiche Sache, unterschiedliche Namen & Zahlen.

### B.5 🟠 `abrechnungen.empfaenger` ist polymorph ohne FK

`empfaenger_typ` + `empfaenger_id` ohne Foreign Key -> 2 von 3 vorhandenen Zeilen haben `empfaenger_id = NULL` (nicht abbuchbar). Auf diese FK-lose Tabelle zeigen `makler_provisionen.abrechnung_id` und `embed_abrechnung_positionen.abrechnung_id`. Integritats-Risiko, sobald es scharf wird. Der `abrechnung-einzug`-Cron muss `empfaenger_id` erst per Lookup (sv.id / org.id) aufloesen.

### B.6 Raten & Konstanten (aus Code-Audit)

| Konstante | Wert | genutzt von |
|---|--:|---|
| MWST_PROZENT | 19 % | alle Rechnungen |
| KANZLEI_PROVISION / Vollmacht | 150 EUR netto | `kanzlei_abrechnung_positionen` |
| CPA_MARKETING (Maik) | 150 EUR netto | `provisionen_maik` |
| LEAD_PREIS min/max | 200 / 1.081 EUR | Lead-Preis-Bounds |
| PAKET_RABATT | 25 % | Paket-Preis |
| EINZEL_PREIS-Aufschlag | 30 % | Einzelfall |
| ANZAHLUNG / Kontingent | 150 EUR | SV-Onboarding-Deposit |
| PAKET_PREIS | 750 / 1.875 / 3.750 EUR | starter-10 / standard-25 / premium-50 |

### B.7 🟠 `sla_tracking`: 24 von 26 "breached"

`termin_bestaetigung` breached 9, `gutachter_zuweisung` breached 8, `besichtigung` breached 7 (+ 2 pending). Kein "completed". Auf Test-/Staging-Daten evtl. Rauschen, aber 0 erfolgreiche SLAs ist auffallig -> triagieren (Cron uber-flaggt vs. echte Ops-Lucke).

---

## TEIL C — Sicherheit / RLS

🟢 **Gut:** RLS ist auf **allen 27** Tabellen an. `sv_onboarding_rechnungen` ist `service_role`-only. Geld-Tabellen lesen nur Admin/Eigentumer (`abrechnungen`: `is_admin() OR own-makler OR own-sv`; `gutachter_monatsabrechnungen`: Admin + eigener SV). Privileg-Guards (A.5) sitzen.

### C.1 🔴 CRITICAL — `sachverstaendige` leakt sensible Spalten an `anon` (EMPIRISCH BEWIESEN)

Die Public-Map-Policy `sachverstaendige_anon_select_map_ready` (`TO anon`, `USING verifiziert AND ist_aktiv AND geloescht_am IS NULL AND standort_lat/lng/isochrone NOT NULL`) gibt **ganze Zeilen** frei. RLS ist zeilen-, nicht spaltenbasiert; Spalten-REVOKE wirkt in diesem Setup nicht (table-GRANT, vgl. Live-RLS-Audit 12.05.).

**Probe mit dem oeffentlichen publishable-Key (keine Session, Postgres-Rolle `anon`)** — `scripts/probe-anon-sv-leak.mjs`:

- anon liest **6** `sachverstaendige`-Zeilen.
- Davon anon-lesbar: **1x `gcal_refresh_token` (len 103) + `gcal_access_token` (len 253)** = lebendes Google-OAuth-Tokenpaar; **3x `stripe_customer_id`**; **2x `ust_id`** (echte DE-USt-IDs).
- Kontrolle `profiles` als anon: **0 Zeilen** -> RLS greift dort; der Leak ist spezifisch diese Policy.

> Mit dem Refresh-Token ist potenziell Zugriff auf den Google-Kalender des betroffenen SV moglich; Stripe-Customer-IDs + USt-IDs sind PII. Schwere: **CRITICAL.**

**Fix-Optionen:**
1. Public-Map uber einen `security_invoker`-View mit **nur** den Karten-Spalten bedienen (`id, anzeigename/firmenname, standort_lat, standort_lng, isochrone_polygon, gutachter_typ`); die `TO anon`-Table-Policy entfernen.
2. `gcal_*`-Token von `sachverstaendige` entfernen/nullen — laut Memory ist `profiles.google_*` kanonisch, `sachverstaendige.gcal_*` Legacy. Das eine vorhandene Token ist also Altlast.
3. Danach `get_advisors(security)` + Re-Probe (Script erneut laufen lassen, erwartet 0 sensible Treffer).

### C.2 🟡 MEDIUM (latent) — Payroll fur gesamtes "staff" lesbar

`is_staff()` = `admin + kundenbetreuer + dispatch`. Policy `staff_read_all` auf `profiles` lasst diese alle **jede** Zeile lesen — inkl. `gehalt_brutto`/`gehaltsstufe`. Heute leer = kein Live-Leak; sobald Gehalter befullt werden, sehen Dispatch & Kundenbetreuer sie. -> Payroll in separate, admin-only Tabelle (`mitarbeiter_verguetung`) auslagern.

---

## TEIL D — Integritat & Hygiene

- 🟠 `finance_eintraege`: 5 Seed-Zeilen "gutachter-anzahlung … offen" seit 2026-04-01/03, nie verbucht; Betrag (3.750) kollidiert mit `sv_onboarding_rechnungen` (3.000/3.570). Aufraumen/versohnen.
- 🟠 `abrechnungen`: nur SMOKE-Zeilen in der Produktiv-DB; 2/3 mit `empfaenger_id NULL`. Smoke-Daten entfernen.
- 🟡 Tote/Schema-only-Familien (0 Zeilen): `gutachter_abrechnungen`, `embed_abrechnung_positionen`(+View), `claim_payments`, `kanzlei_*`, `provisionen_maik`, `makler_provisionen`, `sv_organisation*`, `mitarbeiter_performance`, `organisationen`. Pro Familie "bald scharf" vs. "tot" labeln; Totes droppen.
- ℹ️ Stripe lauft im **Testmodus** (`cs_test_`) -> es ist real noch kein Live-Geld geflossen; die gesamte Abrechnungsschicht ist Pre-Launch.

---

## TEIL E — Empfehlungen (priorisiert)

| # | Schwere | Aktion | Aufwand |
|---|---|---|---|
| 1 | 🔴 | anon-Leak schliessen: `security_invoker`-View fur Public-Map, `TO anon`-Table-Policy weg; Legacy-`gcal_*` nullen; Re-Probe | S–M |
| 2 | 🟠 | System-A/-B entscheiden: VPS-Crontab prufen, einen SV-Abrechnungs-Pfad zur Wahrheit machen, anderen abschalten + Daten migrieren | M |
| 3 | 🟠 | Org-Modell entdoppeln: `sv_organisation*` droppen, `organisationen` behalten | S |
| 4 | 🟠 | Makler-Anlage-Flow bauen (`createMakler()`), damit Provisions-Empfanger onboardbar sind | M |
| 5 | 🟠 | Betrags-/Paket-Taxonomie versohnen (`standard/pro` vs `starter-10/standard-25/premium-50`; 3.000 vs 3.750) | S |
| 6 | 🟠 | `rechnungs_nr_counter` aktivieren (atomar) statt inline-COUNT/LIKE — GoBD-Luckenlosigkeit | M |
| 7 | 🟡 | Payroll-Spalten von `profiles` loesen (admin-only Tabelle); 2FA fur interne Rollen + Makler/Kanzlei erzwingen | M |
| 8 | 🟡 | `sla_tracking` 24/26 breached triagieren; Smoke-/Seed-Reste (`abrechnungen`, `finance_eintraege`) aufraumen; tote Tabellen droppen | M |

---

## Anhang A — Probe-Output (anon-Leak, redigiert)

```
=== Probe: anon-Zugriff auf sachverstaendige ===
URL      : https://paizkjajbuxxksdoycev.supabase.co
Key-Typ  : publishable
Session  : KEINE (Postgres-Rolle: anon)

[1] anon konnte 6 sachverstaendige-Zeile(n) lesen.
    Nicht-NULL sensible Felder ueber alle anon-sichtbaren Zeilen:
      gcal_refresh_token : 1
      gcal_access_token  : 1
      stripe_customer_id : 3
      ust_id             : 2
      steuernummer       : 0
      unterschrift_url   : 0

    LEAK BESTAETIGT — 3 Zeile(n) mit sensiblen Werten, anon-lesbar:
     - <sv-id-1> { stripe_customer_id: 'cus_***', ust_id: 'DE44******' }
     - <sv-id-2> { stripe_customer_id: 'cus_***', ust_id: 'DE44******' }
     - <sv-id-3> { gcal_refresh_token: PRESENT(len=103), gcal_access_token: PRESENT(len=253), stripe_customer_id: 'cus_***' }

[2] Kontrolle profiles als anon: 0 Zeilen (erwartet: 0 / blocked)
```

Reproduzieren (publishable Key, read-only):
```
SUPABASE_URL="https://paizkjajbuxxksdoycev.supabase.co" \
SUPABASE_ANON_KEY="<publishable-key>" \
node scripts/probe-anon-sv-leak.mjs
```

## Anhang B — Tabellen-Inventar (27)

Personal-Anlage: `profiles` (141), `sachverstaendige` (10), `organisationen` (0), `sv_organisation` (0), `sv_organisation_memberships` (0), `sv_organisation_laeufer_reports` (0), `mitarbeiter_performance` (0).

Abrechnung: `abrechnungen` (3), `abrechnung_positionen` (0), `abrechnung_reminders` (0), `gutachter_abrechnungen` (0), `gutachter_abrechnungspositionen` (1), `gutachter_monatsabrechnungen` (2), `kanzlei_abrechnungen` (0), `kanzlei_abrechnung_positionen` (0), `kanzlei_abrechnung_reminders` (0), `embed_abrechnung_positionen` (0), `sv_onboarding_rechnungen` (4), `makler_provisionen` (0), `provisionen_maik` (0), `claim_payments` (0), `finance_eintraege` (5), `finance_monatsberichte` (2), `sla_tracking` (26), `rechnungs_konfiguration` (1), `rechnungs_nr_counter` (1), `sv_payment_reminders` (2).
