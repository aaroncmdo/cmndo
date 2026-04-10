# Pre-Launch Code-Audit — 2026-04-11

## Executive Summary — Top 3 Kritische Findings

1. **N+1 Queries in admin/faelle + gutachter/faelle** (HIGH) — 5 Queries pro Fall, bei 100 Faellen = 500 DB-Calls statt 5-10. Performance-Blocker.
2. **4 fehlende DB-Indexes** (HIGH) — faelle.kundenbetreuer_id, leads.zugewiesen_an, faelle.status, leads.status ohne Index. Jede Listen-Page macht Full-Table-Scan.
3. **Kein Rate-Limiting auf API-Routes/Server-Actions** (HIGH) — Kein globaler Throttle. Authentifizierte User koennten Endpunkte abusieren.

---

## Statistik

| Metrik | Wert |
|--------|------|
| console.log Statements | 61 |
| alert() Calls | 22 |
| as any / as unknown as / @ts-ignore | 33 |
| TODO/FIXME/HACK Kommentare | 0 |
| loading.tsx Files | 0 von ~40 Pages |
| Schema-Duplikate | 3 identifiziert |
| N+1 Query Pages | 2 von 4 kritischen |
| Fehlende Indexes | 4 kritische Spalten |
| Supabase Error-Handling | 65% korrekt, 35% fehlt |

---

## 1. Schema-Cleanup Inventur

### Findings
- `leads.sa_datum` — Duplikat von `sa_unterschrieben_am`. DEPRECATE sa_datum.
- `sachverstaendige.offene_faelle` vs `paket_faelle_genutzt` — Code nutzt Fallback-Pattern. DEPRECATE offene_faelle.
- `sachverstaendige.guthaben` vs `werbebudget_guthaben_netto` — BUG-108 done, guthaben ist deprecated.
- `sachverstaendige.lat/lng` vs `standort_lat/standort_lng` — Code hat Fallback fuer beide. DEPRECATE lat/lng.

### Severity: MEDIUM

---

## 2. Tote Code-Pfade

### Findings
- knip nicht ausfuehrbar (lokales Build-Cache-Problem), manueller Check:
- 0 TODO/FIXME/HACK Kommentare (sauber)
- Keine auskommentierten Code-Bloecke gefunden
- Alte Routes: /admin/communities/, /admin/support/, /admin/sv-onboarding/ — unklar ob genutzt

### Severity: LOW

---

## 3. Console.log + Debug-Statements

### Findings
- **61 console.log/warn/error** Statements in src/
- Top Files: gutachter-matching (10), abrechnungen-generator (6), isochrone (5), dispatch/actions (5)
- **22 alert() Calls** — alle in FallakteClient.tsx (Error-Handling via browser alert statt Toast)
- **0 debugger Statements** (gut)
- Klassifizierung: ~40 sind Server-Logs (OK), ~15 sind Error-Handler (OK), ~6 sind Debug-Reste (LOESCHEN)

### Severity: MEDIUM (alert() sollte durch Toast ersetzt werden)

---

## 4. Hardcoded Magic Values

### Findings
- **150 EUR** Kanzlei-Provision: groesstenteils in FINANCE.constants.ts, aber 2 Stellen hardcoded (process-case-billing.ts:56, gutachterTasking.ts:113)
- **0.19 MwSt** in 5 Dateien hardcoded statt FINANCE.MWST_PROZENT zu nutzen: abrechnung-erstellen (2x), erstelle-abrechnung, abrechnungen-generator (2x)
- URLs: korrekt via env vars
- Email-Adressen: korrekt via RESEND_FROM

### Severity: MEDIUM

---

## 5. Ungepruefte Supabase Errors

### Findings
- **65% korrekt**, 35% ohne Error-Check
- Kritischste Stellen: admin/faelle/page.tsx (N+1 ohne Error-Handling), admin/dispatch/page.tsx (silent fallback)
- RPC-Calls besonders problematisch: kein Error-Destructuring

### Severity: MEDIUM-HIGH

---

## 6. N+1 Queries in Listen

### Findings

| Page | Queries | Pattern | Status |
|------|---------|---------|--------|
| /admin/dispatch | 5 parallel | Promise.all + batch | OK |
| /admin/faelle | 5 x N Faelle | N+1 Loop | KRITISCH |
| /admin/sachverstaendige | 2 + Join | Batch | OK |
| /gutachter/faelle | 3 x N Faelle | N+1 Loop | KRITISCH |

Bei 100 Faellen: admin/faelle macht ~500 Queries, gutachter/faelle ~150.

### Severity: HIGH

---

## 7. Type-Luegen (as any / @ts-ignore)

### Findings
- **33 Stellen** mit as any / as unknown as / eslint-disable
- Top: StatistikenClient (7, Recharts-Generics), ocr-trigger (4), performance/page (3), FallakteClient (2)
- Alle mit eslint-disable-next-line kommentiert (bewusste Entscheidung)
- 0 @ts-ignore, 0 @ts-nocheck (gut)
- Empfehlung: Recharts-Types langfristig fixen, Rest akzeptabel

### Severity: LOW

---

## 8. Loading + Empty States

### Findings
- **0 von ~40 Pages** haben ein loading.tsx
- Kein einziges Skeleton/Loading-UI
- Empty-States: teilweise vorhanden (z.B. "Keine Faelle"), aber inkonsistent

### Severity: MEDIUM

---

## 9. Naming-Konsistenz

### Findings
- **532x "Gutachter"** vs **58x "sachverstaendiger"** vs **10x "Sachverstaendige"** im Code
- DB-Tabelle heisst `sachverstaendige`, aber alle FK heissen `gutachter_*` (gutachter_termine, gutachter_abrechnungen, etc.)
- TypeScript-Types mischen: `SV`, `Gutachter`, `Sachverstaendige`

### Severity: LOW (kosmetisch, funktional kein Problem)

---

## 10. Fehlende Indexes

### Findings

| Spalte | Tabelle | Index? | Impact |
|--------|---------|--------|--------|
| kundenbetreuer_id | faelle | FEHLT | Jede KB-gefilterte Abfrage |
| zugewiesen_an | leads | FEHLT | Jede KB-gefilterte Lead-Liste |
| status | faelle | FEHLT | Jede Status-Filter-Abfrage |
| status | leads | FEHLT | Jede Lead-Status-Filter |

### Severity: HIGH

---

## 11. Stripe Webhook Idempotenz

### Findings
- Idempotenz korrekt implementiert via stripe_events Tabelle
- Duplikat-Check vor Processing
- Webhook-Signatur-Verifizierung vorhanden

### Severity: PASS

---

## 12. Soft-Deletes

### Findings
- sachverstaendige: geloescht_am vorhanden
- fall_dokumente: geloescht_am vorhanden
- faelle: FEHLT (nutzt ist_aktiv statt soft-delete)
- leads: FEHLT
- abrechnungen: FEHLT

### Severity: MEDIUM

---

## 13. Rate Limiting

### Findings
- Twilio Verify: lokales In-Memory Rate-Limit (60s Cooldown) — gut fuer Dev, nicht persistent
- API Routes: KEIN Rate-Limiting
- Server Actions: KEIN Rate-Limiting
- Cron Routes: nur CRON_SECRET, kein Throttle

### Severity: HIGH

---

## 14. Health-Check

### Findings
- /api/health existiert, checkt: Supabase, Stripe, Resend
- Returnt status ok/degraded mit Per-Service-Breakdown
- Fehlt: Google Maps, OSRM, Twilio Checks

### Severity: PASS

---

## 15. Backup-Restore-Test

### Findings
- Backup-Cron laeuft taeglich 03:00 UTC (KFZ-165)
- Woechentlich via GitHub Action Sonntag 04:00
- DR-Runbook dokumentiert 4 Szenarien
- ABER: **Restore wurde NIE getestet**
- Kein automatisiertes Restore-Script

### Severity: MEDIUM (Backup existiert, Restore ungetestet)
