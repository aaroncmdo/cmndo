# CMM-44 SP-C1 — Kunde-Snapshot → claim_parties (rolle=geschaedigter)

**Datum:** 2026-05-21
**Sub-Projekt:** CMM-44 SP-C1 (erster Schnitt von SP-C Parteien-Snapshots; nach Rolle gesplittet — Aaron-Entscheidung)
**Master:** docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md

---

## 1 · Kontext

SP-C (33 Parteien-Snapshot-Spalten → `claim_parties`) wird **nach Rolle gesplittet** (Aaron 2026-05-21), weil die Rollen unterschiedliche Kardinalitaet/Reife haben:
- **SP-C1 (dieses Doc):** Kunde-Snapshot → `claim_parties` rolle=`geschaedigter` (**45 Zeilen existieren, 1:1 pro Claim**).
- SP-C2 (spaeter): `gegner_*` → rolle=`verursacher` (**0 Zeilen — muessen erzeugt werden**).
- SP-C3 (spaeter): `halter_*` → Partei mit `ist_halter=true` (kein `halter`-Rolle-Enum; cov 0).

**Kein ADD** — `claim_parties` hat die Zielspalten bereits (`vorname`/`nachname`/`telefon`/`adresse_*`), und die 45 geschaedigter-Zeilen existieren. SP-C1 = **Reader/Writer-Switch + Backfill** (Rename-Mapping `faelle.kunde_X` → `cp.Y`). **Rein additiv** — die `faelle.kunde_*`-Spalten bleiben stehen und sterben mit `DROP TABLE faelle` in Phase 6.

---

## 2 · Scope — 7 Snapshot-Spalten (Rename-Mapping)

| `faelle`-Spalte | Typ | Cov | → `claim_parties` (rolle=geschaedigter) |
|---|---|--:|---|
| `kunde_vorname` | text | 30 | `vorname` |
| `kunde_nachname` | text | 30 | `nachname` |
| `kunde_telefon` | text | 29 | `telefon` |
| `kunde_strasse` | text | 2 | `adresse_strasse` |
| `kunde_plz` | text | 2 | `adresse_plz` |
| `kunde_stadt` | text | 2 | `adresse_ort` |
| `kunde_adresse` | text | 1 | `adresse_strasse` (kombiniertes Legacy-Feld; nur Reader-Fallback wenn `kunde_strasse` leer — kein separates Backfill-Ziel) |

`claim_parties` ist via `claim_id` + `rolle='geschaedigter'` adressiert (1:1 pro Claim — 45 Zeilen). Die Zielspalten + Zeilen existieren live (2026-05-21 verifiziert).

### NICHT in SP-C1 (andere Heimat — Spec §6)
- **`kunde_id`** (FK, cov 26, ueberall genutzt) → `claims.geschaedigter_user_id` (claims-native, eigener Sweep — Aaron: separat).
- **`kunde_email`** → `claims` (DUP, CMM-60-Whitelist).
- **`kunde_lat`/`kunde_lng`** → `claims` (TBD Geocoding, deferred).
- **`kunde_match_via`** → DROP (0-cov Diagnose).

---

## 3 · Backfill (1:1 geschaedigter-Partei)

COALESCE in die existierende geschaedigter-Zeile (cp gewinnt — cp ist die SSoT-Partei; `faelle.kunde_*` ist der flache Snapshot, fuellt nur cp-NULL-Luecken):
```sql
UPDATE public.claim_parties cp SET
  vorname         = COALESCE(cp.vorname, f.kunde_vorname),
  nachname        = COALESCE(cp.nachname, f.kunde_nachname),
  telefon         = COALESCE(cp.telefon, f.kunde_telefon),
  adresse_strasse = COALESCE(cp.adresse_strasse, f.kunde_strasse),
  adresse_plz     = COALESCE(cp.adresse_plz, f.kunde_plz),
  adresse_ort     = COALESCE(cp.adresse_ort, f.kunde_stadt)
FROM public.faelle f
WHERE cp.claim_id = f.claim_id AND cp.rolle = 'geschaedigter';
```
**Keine Row-Creation** (geschaedigter existiert pro Claim). Falls eine Edge-Claim keine geschaedigter-Zeile hat: kein Backfill (skip) — in PR1 Verify zaehlen.

## 4 · Reader/Writer-Switch-Regelwerk

| Muster | Transform |
|---|---|
| **Read** `from('faelle').select('…kunde_vorname…')` | geschaedigter-Partei lesen: `from('claim_parties').select('vorname,nachname,telefon,adresse_*').eq('claim_id', claimId).eq('rolle','geschaedigter').maybeSingle()`. **Bestehende Fallbacks erhalten** (viele Stellen lesen `kunde_vorname ?? profile/lead` — der profile/lead-Zweig bleibt; nur die `faelle.kunde_*`-Quelle → cp). |
| **Read gemischt** | non-kunde-Cols bleiben auf faelle; kunde-Cols via nested `claims:claim_id(claim_parties(...))`-Embed + Array-Normalisierung + `rolle`-Filter in Code (claim_parties ist 1:N → mehrere Rollen im Embed; geschaedigter rausfiltern). Bei deterministischem Bedarf separate Query bevorzugen. |
| **Write** `from('faelle').update({kunde_vorname,…})` | auf die geschaedigter-Zeile schreiben (`claim_parties … .eq('claim_id',X).eq('rolle','geschaedigter')`); kunde-Cols aus dem faelle-Write entfernen. Kein Dual-Write. Guarded. |
| **View-Read** | PR1 repointet betroffene Views auf cp geschaedigter → kein Code-Change. |
| **TS-Typ/Property** | Property-Rename `kunde_vorname` → `vorname` beim Konsumenten nachziehen. |

## 5 · Views (PR1)
Live-Audit welche Views `kunde_vorname/nachname/telefon/strasse/plz/stadt/adresse` aus `f.` exponieren → repoint auf die geschaedigter-Partei via LEFT JOIN auf `claim_parties` (rolle=geschaedigter). Bei 1:1 ein einfacher LEFT JOIN (kein LATERAL noetig). Precision/Typ: alle text → kein Cast.

## 6 · PR-Struktur (3 PRs, additiv — kein ADD)
- **PR1** — Backfill-Migration (COALESCE in geschaedigter) + View-Repoint (falls Audit Treffer). Kein ADD COLUMN (Spalten existieren).
- **PR2** — Reader/Writer-Sweep (`scripts/cmm44-spc1-grep.mjs` paren-balanced, COLS=die 7): `faelle.kunde_*`-Reads/Writes → claim_parties geschaedigter. Property-Renames nachziehen.
- **PR3** — idempotenter COALESCE-Catch-up.
Sequencing: PR1 additiv jederzeit; PR2 nach PR1-staging; PR3 nach PR2-main.

## 7 · Non-Goals (YAGNI)
- Kein `kunde_id`/`kunde_email`/`kunde_lat`/`kunde_lng`/`kunde_match_via` (§2 — andere Heimat/Drop).
- Kein `gegner_*` (SP-C2), kein `halter_*` (SP-C3).
- Kein per-Spalten-Drop an faelle (additiv, Phase 6). Keine RLS-Aenderung. Keine neue Partei-Row-Creation (geschaedigter existiert).

## 8 · Verifikation
- Live `information_schema` + cp-Zielspalten + geschaedigter-Row-Count (45) vor Migration ([[feedback_information_schema_check]]).
- Werte-Konsistenz: cp.vorname vs faelle.kunde_vorname an verknuepften geschaedigter-Zeilen stichprobenartig (sollten gleich sein — Snapshot).
- Paren-balanced Re-Grep 0 live `faelle.kunde_*`-Zugriffe (der 7) nach PR2.
- Portal-Smoke (Kunde-Stammdaten, Fallakte-Kundendaten, SV-Kundenanzeige) mit Screenshot ([[feedback_post_drop_smoke]], [[feedback_smoke_screenshot_pflicht]]).

## 9 · Referenzen
- Phase-1-Mapping `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §3 (Kunde-Cluster), §4 (SP-C).
- Muster: SP-D (`docs/superpowers/*/2026-05-21-cmm44-spd-termin-cluster*`), SP-G (Rename-Mapping).
- Lessons: feedback_information_schema_check, feedback_post_drop_smoke, feedback_kein_auto_merge.
