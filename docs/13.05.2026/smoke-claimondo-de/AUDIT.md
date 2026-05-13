# Portal-Smoke Audit — 13.05.2026

## Kontext

Smoke-Lauf gegen `https://app.staging.claimondo.de` — alle 5 Portale:
- `/dispatch` (test-dispatch@claimondo.de)
- `/sv` (test-sv@claimondo.de)
- `/kanzlei` (test-kanzlei@claimondo.de) ← neu angelegt
- `/makler` (test-makler@claimondo.de) ← neu angelegt
- `/kunde` (test-kunde@claimondo.de)

Smoke-Script: `docs/13.05.2026/smoke-claimondo-de/smoke-portale-v2.mjs`

---

## Staging-DB = Prod-DB (Dokumentation)

**Befund:** Das Staging-Slot (PM2 Port 3001, VPS 212.132.119.110) nutzt **dieselbe Supabase-Instanz** wie Production:
- Supabase-Project: `paizkjajbuxxksdoycev`
- Kein `.env.staging` vorhanden — Staging liest `.env.local` / PM2-Env-Vars

**Konsequenz:** Seed-Records werden direkt in die Prod-DB geschrieben. Alle Records sind mit Smoke-Marker versehen:
```
SMOKE-SEED 13.05.2026 — Staging-Testdaten, löschen wenn Staging eigene DB bekommt
```

**Entscheidung:** Fortgefahren, da `test-*@claimondo.de`-Convention bereits vor diesem Seed existierte (test-dispatch, test-sv, test-kunde). Kein neues Muster.

---

## Staging-Test-User-Seed 13.05.2026

### Angelegte Auth-User (stable UUIDs, direkt via SQL bootstrap)

| E-Mail | Auth-UUID | Rolle | Org-Record |
|--------|-----------|-------|------------|
| `test-kanzlei@claimondo.de` | `bbbb1111-0000-4000-8000-000000000010` | kanzlei | `bbbb1111-0000-4000-8000-000000000011` |
| `test-makler@claimondo.de` | `bbbb2222-0000-4000-8000-000000000020` | makler | `bbbb2222-0000-4000-8000-000000000021` |

Passwort: `Test1234!` (identisch mit allen anderen Test-Usern, nur als Process-Env, nie im Repo)

### SV-Test-Fall (SMK-SV-2026-001)

| Tabelle | UUID | Wert |
|---------|------|------|
| `claims` | `bbbb3333-0000-4000-8000-000000000031` | schadenart=haftpflicht, status=in_bearbeitung |
| `faelle` | `bbbb3333-0000-4000-8000-000000000032` | aktenzeichen=SMK-SV-2026-001, phase=termin_bestaetigt |
| `leads` | `bbbb3333-0000-4000-8000-000000000033` | status=konvertiert, konvertiert_zu_fall_id→Fall |
| `auftraege` | `bbbb3333-0000-4000-8000-000000000034` | typ=erstgutachten, status=termin |
| `gutachter_termine` | `bbbb3333-0000-4000-8000-000000000035` | datum=2026-05-16, status=bestaetigt |

SV: `test-sv@claimondo.de` → sachverstaendige.id=`1da11741-a406-45ce-a27b-c041576cccbb`

### Kunden-Fall (SMK-KUNDE-2026-001)

| Tabelle | UUID | Wert |
|---------|------|------|
| `claims` | `bbbb4444-0000-4000-8000-000000000041` | schadenart=haftpflicht, status=in_bearbeitung |
| `faelle` | `bbbb4444-0000-4000-8000-000000000043` | aktenzeichen=SMK-KUNDE-2026-001, phase=fallakte_angelegt |
| `leads` | `bbbb4444-0000-4000-8000-000000000042` | status=konvertiert, konvertiert_zu_fall_id→Fall |

Kunde: `test-kunde@claimondo.de`

---

## Gelöste Blocker

| Blocker | Beschreibung | Gelöst mit |
|---------|-------------|------------|
| PS-P0-2 | `test-kanzlei@claimondo.de` fehlte → Kanzlei-Portal nicht testbar | Auth-User + Org-Record via SQL-Bootstrap |
| PS-P0-3 / B3 | `test-makler@claimondo.de` fehlte → Makler-Portal blockiert | Auth-User + Org-Record via SQL-Bootstrap |
| PS-P1-1 | Kein SV-Fall/Auftrag/Termin für test-sv → Feldmodus-Button nicht testbar | SMK-SV-2026-001 mit Termin 16.05.2026 |
| PS-P1-3 | Kein Phase-5-Lead → Magic-Link nicht testbar | SMK-KUNDE-2026-001 mit fallakte_angelegt |

---

## Constraint-Pitfalls (für künftige Seeds)

Beim Seed wurden folgende Constraints per `pg_constraint`-Query ermittelt und eingehalten:

```sql
-- claims
schadenart IN ('haftpflicht','vollkasko','teilkasko','eigenverschulden','unbekannt')
status IN ('dispatch_done','in_bearbeitung','in_kommunikation_vs','reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')
created_via IN ('web_formular','manuell_admin','import','api')
phase IN ('ersterfassung','dokumente_hochgeladen','sv_zugewiesen','termin_bestaetigt','bericht_fertig','abgeschlossen','storniert')

-- faelle
aktuelle_phase: langer Enum — 'termin_bestaetigt' (SV) und 'fallakte_angelegt' (Kunden) sind valide Werte

-- auftraege
status IN ('termin','besichtigung','gutachten','abgeschlossen')
```

**Zirkuläre FK:** `leads.konvertiert_zu_fall_id → faelle.id` erfordert:
1. Fall zuerst einfügen (ohne lead_id)
2. Lead einfügen (mit fall_id)
3. Fall updaten (lead_id setzen)

---

## Seed-Script

`scripts/seed-staging-test-users.mjs` — idempotent, stable UUIDs, `ON CONFLICT DO NOTHING`

Ausführung (lokal):
```bash
node scripts/seed-staging-test-users.mjs
```
