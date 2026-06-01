# Personal-Cleanup — Remediation-Strecke (Umbrella-Spec)

- **Status:** Draft — zur Review
- **Datum:** 2026-06-01
- **Track-Branch:** `kitta/personal-cleanup` (⟵ `staging`)
- **Quelle:** `docs/01.06.2026/personal-audit-anlage-abrechnung.md` (Audit, PR #2173) + `scripts/probe-anon-sv-leak.mjs`
- **DB:** `paizkjajbuxxksdoycev`

## 1 · Ziel

Alle 10 Befunde des Personal-Audits (Anlage + Abrechnung) sauber abarbeiten — von CRITICAL-Security bis Pre-Launch-Hygiene — als **eine sequenzierte Strecke** mit kleinen, einzeln review- und deploybaren PRs. Diese Umbrella-Spec definiert die Strecke; jedes Work-Item bekommt danach eine **Einzel-Spec** und einen **Plan**.

## 2 · Prinzipien (verbindlich)

1. Eine Track-Branch `kitta/personal-cleanup`; **pro Work-Item ein eigener PR** gegen `staging`. Nie direkt auf `main`/`staging` pushen.
2. **DDL nur via Supabase-Plugin** `apply_migration` (AGENTS.md Regel 2). `execute_sql` nur READ. Migration-File-Name == getrackte Version (Twin-Drift-Falle).
3. **Vor jeder Migration** `information_schema` live prüfen (Shared-Prod-DB, viele parallele Sessions; Memory-Snapshots sind 1–2 Tage stale).
4. **Schema-/Policy-Drops:** Reader-Sweep im Code + **Post-Drop/Policy-Smoke** aller betroffenen Portale (Public/Admin/Kunde/SV) mit Screenshot. Coverage=0 ≠ tot.
5. **Reihenfolge-Gates** der Wellen beachten (insb. W0.1: Policy-Drop erst nach Repoint-Deploy).
6. Server-Actions: Result-Object-Pattern (`{ ok, error? }`), kein `throw`-Mix; `revalidatePath` nicht vergessen.

## 3 · Wellen-Übersicht

| Welle | Fokus | Work-Items |
|---|---|---|
| **W0** | Security (sofort) | W0.1 anon-Leak |
| **W1** | Abrechnungs-Korrektheit | W1.1 System-A/-B · W1.2 empfaenger-FK · W1.3 Paket-Taxonomie · W1.4 Rechnungsnummern |
| **W2** | Anlage & Struktur | W2.1 Makler-Anlage · W2.2 Org-Dedup · W2.3 Payroll-Auslagerung |
| **W3** | Hygiene | W3.1 SLA-Triage · W3.2 Tote Tabellen/Seeds/Smoke |

---

## 4 · Work-Items

### W0.1 — anon-Leak `sachverstaendige` schließen 🔴 CRITICAL

**Problem:** Policy `sachverstaendige_anon_select_map_ready` (`TO anon`) gibt für die öffentliche Karte ganze Zeilen frei. RLS ist zeilen-, nicht spaltenbasiert (Spalten-REVOKE wirkt nicht bei Table-GRANT). Empirisch (Probe): `anon` liest 6 Zeilen inkl. **1× lebendem `gcal_refresh_token`+`gcal_access_token`**, 3× `stripe_customer_id`, 2× `ust_id`.

**Ziel / Akzeptanz:** `scripts/probe-anon-sv-leak.mjs` liefert 0 sensible Treffer; öffentliche Gutachter-Karte funktioniert unverändert (Smoke grün).

**Ansatz — 3 sequenzielle PRs:**
- **(a)** `security_invoker`-View `v_sv_map_public` mit **nur** Karten-Spalten (`id, anzeigename/firmenname, gutachter_typ, standort_lat, standort_lng, isochrone_polygon`, ggf. `logo_url`/Brand für gebrandete Marker), `grant select to anon`; **Legacy `gcal_access_token`/`gcal_refresh_token`/`gcal_token_expiry` auf NULL** (verifiziert: keine Reader, nur `gcal_connected`-Flag wird genutzt). *Additiv, safe.*
- **(b)** **Code-Repoint:** alle anon-Leser der öffentlichen Karte (`/gutachter-finden`, Embed-Sites, `GutachterFinderMap*`, `lib/actions/gutachter-finder-actions.ts`) auf `v_sv_map_public` umstellen → **PR + Deploy**.
- **(c)** anon-Table-Policy `sachverstaendige_anon_select_map_ready` **droppen** → **erst nach (b)-Deploy** → Re-Probe + Public-Map-Smoke.

**Parallel (Aaron, sofort):** Google-Grant des betroffenen SV widerrufen/rotieren — das exponierte Token gilt als kompromittiert.
**Risiko:** Map bricht, wenn (c) vor (b)-Deploy. Mitigation: strikte Reihenfolge, Smoke nach (c).

### W1.1 — System-A/-B Abrechnungs-Drift auflösen 🟠

**Problem:** Code deklariert `abrechnungen` (`abrechnung-erstellen`, „System B") als kanonisch, `gutachter_monatsabrechnungen` (`monatsabrechnung`, „System A") als @deprecated. Daten widersprechen: System A schreibt die jüngsten Zeilen (2026-06-01 02:00), System B nur Smoke.
**Gate:** **VPS-Crontab prüfen** — welcher Cron läuft real?
**Ziel/Akzeptanz:** genau ein kanonischer SV-Monats-Billing-Pfad aktiv; der andere Cron abgeschaltet; Bestandsdaten migriert/abgegrenzt; AAR-924/925 geschlossen.
**Abhängigkeit:** Investigation-Gate vor Code/DDL. Ergebnis evtl. „System A bleibt, B verwerfen" — bewusst entscheiden.

### W1.2 — `abrechnungen.empfaenger` → typisierte FK 🟠

**Problem:** Polymorph (`empfaenger_typ` + `empfaenger_id`) ohne FK; 2/3 Smoke-Zeilen haben `empfaenger_id = NULL`. Auf die Tabelle zeigen `makler_provisionen.abrechnung_id` + `embed_abrechnung_positionen.abrechnung_id`.
**Ziel/Akzeptanz:** referenzielle Integrität (typisierte FK-Spalten je Empfängerart oder saubere Polymorphie mit CHECK + Trigger-Guard); keine NULL-Empfänger mehr möglich.
**Abhängigkeit:** eigene Smoke-Reste vorher löschen (überlappt W3.2 — hier nur die 3 `abrechnungen`-Zeilen). Pre-Launch → jetzt billig.

### W1.3 — Betrags-/Paket-Taxonomie vereinheitlichen 🟠

**Problem:** `standard`/`pro` (DB) vs. `starter-10`/`standard-25`/`premium-50` (Code, 750/1.875/3.750 €); pro-Anzahlung 3.000 €/3.570 € (`sv_onboarding_rechnungen`) vs. 3.750 € (`finance_eintraege`).
**Ziel/Akzeptanz:** eine Quelle der Wahrheit für Paketnamen + Preise; konsistente Beträge über alle Tabellen/Code-Konstanten; Mapping-/Migrations-Notiz für Altzeilen.

### W1.4 — Rechnungsnummern: atomarer Counter 🟠

**Problem:** 3 Schemata (`CMNDO-`, `CMNDO-K-`, `CM-ONB-`) per inline-COUNT/LIKE; `rechnungs_nr_counter` ungenutzt → Lücken-/Kollisionsrisiko bei Nebenläufigkeit.
**Ziel/Akzeptanz:** zentrale atomare Vergabe (`rechnungs_nr_counter` via `UPDATE ... RETURNING` / SECURITY-DEFINER-Funktion) für alle drei Serien; GoBD-Lückenlosigkeit; Bestandsnummern unberührt.

### W2.1 — Makler-Anlage-Flow (`createMakler`) 🟠

**Problem:** kein Anlage-Pfad für `rolle='makler'` (1 existiert manuell/Seed), aber `makler_provisionen`-Maschinerie gebaut.
**Ziel/Akzeptanz:** `createMakler()`-Server-Action (admin-only, analog `createMitarbeiter`: auth + profiles, `force_password_change`, Einladung), erreichbar über `admin/team` o. ä.; ein Makler kann sauber angelegt werden und taucht in Provisions-Flows auf.

### W2.2 — Org-Modell entdoppeln 🟠

**Problem:** zwei parallele Systeme — `organisationen` (vom Anlage-Code beschrieben) vs. `sv_organisation` + `sv_organisation_memberships` + `sv_organisation_laeufer_reports` (0 Zeilen, kein Writer).
**Ziel/Akzeptanz:** `sv_organisation*` gedroppt; `organisationen` ist alleinige Wahrheit. **Gate:** Reader-Sweep (Code + Views/FKs) + Post-Drop-Smoke.

### W2.3 — Payroll aus `profiles` auslagern 🟡

**Problem:** `gehalt_brutto`/`gehaltsstufe`/`position`/`eingestellt_am` auf `profiles`; via `staff_read_all` (`is_staff()` = admin+kundenbetreuer+dispatch) für alle Staff lesbar. Heute leer → latent.
**Ziel/Akzeptanz:** neue admin-only Tabelle `mitarbeiter_verguetung` (RLS `is_admin()`), Spalten von `profiles` migriert + gedroppt; Reader/Writer repointet. **Optional:** 2FA-Pflicht für interne Rollen + Makler/Kanzlei.

### W3.1 — SLA 24/26 breached triagieren 🟡

**Problem:** 24 von 26 `sla_tracking` = `breached`, 0 `completed`.
**Ziel/Akzeptanz:** Ursache geklärt (Test-Rauschen vs. Cron-Über-Flagging vs. echte Ops-Lücke); ggf. Cron-/Daten-Fix oder dokumentierte Entwarnung. Evtl. **kein Code-Change** — dann nur Befund + Empfehlung.

### W3.2 — Tote Tabellen + Seeds + Smoke-Reste 🟡

**Problem:** viele 0-Zeilen-/Legacy-Tabellen; `finance_eintraege` Stale-Seeds (offen seit April); `abrechnungen` Smoke-Reste.
**Ziel/Akzeptanz:** jede 0-Zeilen-Familie als „bald scharf" vs. „tot" gelabelt; Totes gedroppt; Seeds/Smoke bereinigt. **Zuletzt** (nichts droppen, das W1/W2 noch braucht). **Gate:** Post-Drop-Smoke alle Portale.

---

## 5 · Reihenfolge & Abhängigkeiten

```
W0.1(a) → W0.1(b)[deploy] → W0.1(c)          # Security zuerst, harte Reihenfolge
W1.1(Gate VPS) → W1.1 fix                      # disjunkt zu W1.2–W1.4, parallelisierbar
W1.2 / W1.3 / W1.4                             # unabhängig
W2.1 / W2.2(Sweep) / W2.3                      # unabhängig; nach/parallel W1
W3.1                                           # jederzeit (Investigation)
W3.2                                           # ZULETZT — nach W1+W2 (Drop-Sicherheit)
```

## 6 · Artefakt-Plan

- **Einzel-Specs:** `docs/superpowers/specs/2026-06-0X-personal-cleanup-w<NN>-<slug>-design.md`
- **Pläne:** `docs/superpowers/plans/2026-06-0X-personal-cleanup-w<NN>-<slug>.md`
- **Linear:** Parent „Personal-Cleanup (Audit 01.06.)" + 10 Sub-Issues (W0.1…W3.2), Prompt-Feld je Issue mit Spec-Summary + Link.
- Reihenfolge der Vertiefung: **W0.1 zuerst** (writing-plans), dann W1.x, W2.x, W3.x.

## 7 · Out of Scope (bewusst nicht hier)

- Stripe Live-Mode-Umstellung / echtes Go-Live der Abrechnung.
- Echte Lohn-/Gehaltsabrechnung (HR) — W2.3 strukturiert nur die Spalten, baut keine Payroll-Engine.
- Mobile-App-Pendants.
