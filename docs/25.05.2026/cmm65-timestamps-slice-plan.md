# CMM-65 — `created_at`/`updated_at` (+ Finanz-Rest) → `claims` · Slice-Plan

**Stand:** 2026-05-25 · **Teil von:** CMM-44 (Claim-as-SSoT) · **SP-L-Blocker:** ja (CMM-49 `DROP TABLE faelle`).

---

## 0 · Verifizierte Vorbedingungen (diese Session, live geprüft)

- **`claims.created_at` + `claims.updated_at` existieren + sind befüllt** → **kein Schema-Migration** für die Timestamps nötig. Reiner Reader/Writer-Sweep.
- **Wert-Äquivalenz `claims.created_at ≈ faelle.created_at`:** 53 gepaarte Fälle geprüft → **52 ≤ 1 s, 1 Ausreißer 70 s** (claim+faelle entstehen quasi gleichzeitig bei der lead→claim-Konvertierung). ⇒ Reader von `faelle.created_at` auf `claims.created_at` umzustellen ist **behavior-preserving** (Order + Date-Filter ändern sich nicht auf Sekunden-/Tages-Granularität).
- **Phase 6 = `DROP TABLE faelle CASCADE`** (Master-Plan `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`) ⇒ die ~91 `created_at`/`updated_at`-Sites sind **Hard-Breaker** beim Drop und müssen auf `claims` umziehen.

---

## 1 · Scope

### IN (CMM-65-Kern): ~91 Timestamp-Sites — VALIDATED §V.TS
`docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` §V.TS. Top-Level auf `faelle`:
`.order/.gte/.lte/.lt('created_at', …)` + `.update({ updated_at })`. Domänen u.a.:
`lib/analytics/finance.ts` (20/87/101/108/147), `lib/prozess*` (`updated_at` ×4: 72/109/169/217),
`app/kunde/layout.tsx` (94/139/178/225 — teils via CMM-63 schon claims), admin/dispatch/cron-Reads.
→ **Re-grep pro PR Pflicht** (Inventar ist eine ~30er-Stichprobe, stale).

### OUT (separate Entscheidung/Ticket — NICHT in CMM-65)
- **`kanzlei_honorar` (3×: erstelle-abrechnung:105, analytics/finance:104, finance/fall-finanzen:57)** → liegt auf `kanzlei_faelle` ⇒ **CMM-61** (kanzlei_faelle-Rest).
- **`kanzlei_provision_status` / `kanzlei_provision_ausgezahlt_am` (stripe/webhook:338, erstelle-abrechnung:106/231)** → **OFFENE FRAGE (a):** relocatet auf kanzlei_faelle (CMM-61) oder faelle-nativ? `stripe/webhook:338` ist zudem **latent buggy** (schreibt in tote faelle-Kopie) → sollte unabhängig SOFORT via `upsertKanzleiFall` gefixt werden.
- **`marketing_provision` / `marketing_quelle` (analytics/finance:111, finance/fall-finanzen:57)** → existieren **NICHT** auf claims. **OFFENE FRAGE (b):** Heimat? (claims ADD+Backfill / kanzlei_faelle / bleibt faelle bis SP-L?)
- **`zahlungsweg`** → bleibt faelle (SP-J-Korrektur bestätigt), existiert **NICHT** auf claims. Aber Table-DROP-Breaker. **OFFENE FRAGE (c):** claims-Heimat jetzt (in CMM-65) oder als SP-L-Pre-Work?

---

## 2 · Approach (Slice-Rezept, behavior-preserving)

- **Reader:** `faelle … 'created_at'` → `claims … 'created_at'` (wert-neutral, s. §0). Reads die schon `claims`/Embed/`v_claim_*`-View nutzen: nichts.
- **Writer `updated_at`:** prüfen ob ein Sync-Trigger `updated_at` ohnehin pflegt; sonst die `updated_at`-Pflege auf den korrespondierenden `claims`-Write ziehen. (faelle.updated_at-Writes fallen mit dem DROP weg.)
- **Per-Domänen-PRs** statt 91-in-1: z.B. PR1 `analytics/finance` + `finance/*`, PR2 `prozess`, PR3 admin/dispatch, PR4 cron/rest. Jeder PR: Re-grep → ±20-Zeilen-Kontext → Edit → `npm run build` (8 GB) → Daten-/Domänen-Smoke → PR gegen `staging`.
- **2-Stufen-Review** (additive/maskierte Reader-Miss-Gefahr).

---

## 3 · Entscheidungen (Aaron, 2026-05-25)

1. **`marketing_provision` / `marketing_quelle` → `claims` ADD** (claim-globale Marketing-Attribution) + Backfill aus faelle.
2. **`zahlungsweg` → `claims` ADD.** Geklärt (Code `faelle/[id]/actions.ts:250-255`): `faelle.zahlungsweg` = **Auszahlungs-ZIEL des Kunden** `{kundenkonto, werkstatt_direkt}` ("wie der Kunde sein Geld bekommt"), claim-global, aktuell **all-null** (kein Backfill). **Nicht** = `claim_payments.zahlungsweg` (Zahlungs-METHODE `{ueberweisung, scheck, bar, verrechnung}`, schon auf claim_payments, SP-J). Kein Kanzlei-Bezug.
3. **`kanzlei_provision_status` (+ `kanzlei_honorar`, `kanzlei_provision_ausgezahlt_am`) → `kanzlei_faelle`** (= **CMM-61**). Begründung (Aaron): die Kanzlei zahlt die Provision erst, wenn wir ihr die Vollmacht übermittelt haben → Provision gehört zum kanzlei_fall. (`stripe/webhook:338` ist zudem latent buggy → via `upsertKanzleiFall` fixen.)

### 3a · Architektur-Entscheidung: Vollmacht ↔ kanzlei_faelle (Aaron 2026-05-25, → CMM-61)

**Prinzip (Aaron):** Die Vollmacht ist der entscheidende Trigger der Kanzlei-Provision → die Vollmacht muss dem kanzlei_fall zugeordnet sein.

**Ist-Modell (live geprüft):** `claims.vollmacht_signiert_am` + `vollmacht_status` + `sa_unterschrieben` + `kanzlei_uebergeben_am` liegen auf **claims**. `kanzlei_faelle` hat NUR Mandat-Basis (`claim_id`, `kanzlei_id`, `mandatsnummer` + SP-I: `regulierung_am`/`anschlussschreiben_am`/`vs_kuerzung_grund`). **Keine** vollmacht-/provision-Spalte auf kanzlei_faelle; Provision liegt noch auf faelle (#3).

**Bestätigte Architektur (Aaron 2026-05-25, → CMM-61) — Vollmacht auf BEIDE Ebenen, getrennte Rollen:**
- `claims.vollmacht_signiert_am`/`vollmacht_status` **bleibt** = Kunde-Signatur-SSoT + **Claim-Flow-Gate**: schaltet das Kundenkonto frei (Thema **Flowlink**) + gated den **Komplettpaket-Pfad** (daraus Provision + fast die gesamte Marge); ggf. Vollmacht im Nachgang vom Kunden nachholen. → claim-flow-kritisch, NICHT entfernen.
- `kanzlei_faelle` bekommt die **Vollmacht-ÜBERGABE an DIESE Kanzlei**: `vollmacht_uebergeben_am` (Übermittlung an die Partner-Kanzlei) + Doc-Ref (`vollmacht_dokument_id`/`vollmacht_url`). **Das** ist der Provisions-Trigger.
- `kanzlei_provision_status`/`kanzlei_honorar` (#3) hängen am selben kanzlei_fall → Provision wird durch `kanzlei_faelle.vollmacht_uebergeben_am` getriggert (Kausal-Bezug auf einer Row).
- **Zu klären:** Ist `claims.kanzlei_uebergeben_am` deckungsgleich mit der Vollmacht-Übergabe (dann auf kanzlei_faelle ziehen) — oder bleibt es der claim-Level „Fall an Kanzlei übergeben"-Marker und `vollmacht_uebergeben_am` ist die spezifischere Vollmacht-Transmission?

> **BESTÄTIGT (Aaron 2026-05-25):** Vollmacht auf BEIDE Ebenen — `claims.vollmacht_signiert_am` (Signatur → Claim-Flow: Kundenkonto-Freischaltung/Flowlink + Komplettpaket-Gate) **und** `kanzlei_faelle.vollmacht_uebergeben_am` + Doc-Ref (Übergabe → Kanzlei-Provision). Architektur-Vorgabe für **CMM-61**. Offenes Detail (bei CMM-61-Umsetzung): `claims.kanzlei_uebergeben_am` vs. neues `vollmacht_uebergeben_am` reconcilen.

> Der **Timestamp-Kern (~91 Sites)** ist von all dem **unabhängig** und kann sofort starten.

---

## 4 · Verify / Smoke

- **Daten-Layer (erledigt):** `claims.created_at == faelle.created_at` (52/53 ≤ 1 s) → Sweep value-neutral.
- **Pro-Domäne:** betroffene Listen/Filter (finance-Reports, prozess-Status-Updates, Termin-Cron-Fenster) liefern identische Ergebnisse vor/nach.
- **Build grün** (NODE_OPTIONS=8192). Windows-Flakes: s. `project_cmm44_spc_kunde_ownership.md` (EBUSY→`rm .next`, `--workers=1`, kein `; echo`).

---

## 5 · Regeln (AGENTS.md)

PR gegen `staging`; nicht selbst mergen (Merge-Watcher); DDL nur CLI (falls FRAGE b/c „claims ADD" ergibt); 7-Punkt-Audit; `information_schema` live vor jeder Migration.
