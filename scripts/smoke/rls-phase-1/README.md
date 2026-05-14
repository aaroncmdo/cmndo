# RLS-Hardening Phase 1 — Smoke-Skripte

**Spec:** `docs/superpowers/specs/2026-05-13-rls-hardening-phase-1-design.md`

Jede `.sh`-Datei reproduziert einen heute funktionierenden Angriff aus dem
RLS-Audit (12.05.2026). Reihenfolge: erst Smoke schreiben, dann lokal/staging
verifizieren dass sie HEUTE rot sind (= Angriff klappt), dann Migration fahren,
dann Smoke grün-checken (Angriff blockiert).

## Skripte (in Reihenfolge der Sprengweite)

| # | Skript | Angriff |
|---|---|---|
| 03 | `03-flow-links.sh` | Anon dumpt alle Magic-Link-Token + Lead-IDs |
| 05 | `05-abrechnungen.sh` | Jeder authenticated User liest alle Abrechnungen |
| 02 | `02-mass-assignment.sh` | SV setzt `verifiziert=true` an sich selbst, Makler setzt `provision_aktiv` |
| 04 | `04-storage-buckets.sh` | Anon downloaded private Fall-Dokumente / Schadensfotos; Anon-Write auf `unterschriften` |

Nummern stammen aus dem Audit-Item-Tracking (`#3`/`#5`/`#2`/`#4`).

## Voraussetzungen

```bash
export SUPABASE_URL="https://paizkjajbuxxksdoycev.supabase.co"
export SUPABASE_ANON_KEY="..."                  # aus .env.local
export SMOKE_SV_EMAIL="test-sv@claimondo.de"
export SMOKE_KUNDE_EMAIL="test-kunde@claimondo.de"
export SMOKE_PASSWORD="Test1234!"
```

Optional für gezielte Angriffe:

```bash
export SMOKE_FALL_ID="<uuid einer Fallakte>"
export SMOKE_BUCKET_OBJECT="<bucket>/<path>"    # für Storage-Smoke
```

## Ausführung

```bash
bash scripts/smoke/rls-phase-1/03-flow-links.sh
bash scripts/smoke/rls-phase-1/05-abrechnungen.sh
bash scripts/smoke/rls-phase-1/02-mass-assignment.sh
bash scripts/smoke/rls-phase-1/04-storage-buckets.sh
```

Jedes Skript liefert:
- Exit 0 + Output „ANGRIFF BLOCKIERT" wenn die geprüfte Lücke geschlossen ist
- Exit 1 + Output „ANGRIFF MOEGLICH" wenn die Lücke noch offen ist (Heute-Zustand)

Damit kann CI später pro Sub-Plan-PR-Smoke das passende Skript ausführen und
sehen ob die Migration den Angriff geschlossen hat.

## Pre-Run-Verifikation (heute, vor Migrationen)

```bash
bash scripts/smoke/rls-phase-1/03-flow-links.sh    # erwartet: ANGRIFF MOEGLICH (rot)
bash scripts/smoke/rls-phase-1/05-abrechnungen.sh  # erwartet: ANGRIFF MOEGLICH (rot)
bash scripts/smoke/rls-phase-1/02-mass-assignment.sh # erwartet: ANGRIFF MOEGLICH (rot)
bash scripts/smoke/rls-phase-1/04-storage-buckets.sh # erwartet: ANGRIFF MOEGLICH (rot)
```

Wenn schon vor der Migration ein Skript grün ist → entweder die Lücke ist
bereits geschlossen (in welchem PR? — dokumentieren) oder die Test-Daten fehlen
(z.B. kein `SMOKE_FALL_ID` gesetzt). Im zweiten Fall: Skript explizit als SKIP
markieren, nicht als grün werten.
