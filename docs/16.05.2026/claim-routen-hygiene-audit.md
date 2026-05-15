# Claim-SSoT — Routen-Hygiene-Audit

**Datum:** 2026-05-16
**Zweck:** Pro Nutzer-Journey die vertikalen Routen erfassen — was muss auf `claims` migriert werden, was ist überflüssig (Hygiene). Teil-Audit von `claim-ssot-vollmigration-audit-strategie.md` (§3.1e).
**Regel:** Alles Gutachten- + Fahrzeug-/Cardentity-bezogene ist immer relevant — nie als überflüssig geflaggt.

---

## 1 · Gesamtzahlen

| Portal | Routen | mit `faelle`-Bezug | Cleanup-Kandidaten |
|---|---:|---:|---:|
| Kunde | 16 | 12 | 2 |
| SV/Gutachter | 28 | 16 | 2 + Nav-Bug |
| Admin | 52 | ~22 | **12** |
| faelle (geteilt) | 2 | 2 | 0 |
| mitarbeiter | 10 | 8 | 0 |
| Dispatcher | 11 | 6 | 0 |
| Kanzlei | 4 | 4 | 0 (+ 1 toter Link) |
| **Summe** | **123** | **~70** | **~17 + 2 Defekte** |

**~70 von 123 Routen** lesen/schreiben `faelle` — meist **indirekt über Views** (`v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`). Die Views sind der Migrations-Hebel: solange sie `faelle`-gebunden bleiben, müssen die Konsumenten nicht einzeln angefasst werden — aber die Views selbst müssen claims-nativ werden.

---

## 2 · Priorisierte Befunde

### HIGH-1 — Admin Legacy-Hub-Drift (9 Doppel-Routen)
`/admin/{sla,tasks,meine-tasks,reklamationen,versicherungen,organisationen,kanzlei-board,kanzlei-abrechnungen,statistiken}` existieren **doppelt** — als Standalone-`page.tsx` UND als `(hub)`-Tab-Re-Export (`export { default } from …`). Migration AAR-526/527/528/531 hat die Pages an die Hubs gehängt, aber die geplante Redirect-Umstellung (AAR-530) **nie abgeschlossen**.
→ **Cleanup:** Alt-Pfade als HTTP-308 in `next.config.ts`. **Vorsicht:** `AdminNav`-TasksPill verlinkt noch `/admin/meine-tasks` — erst `href` auf `/admin/aufgaben/meine` umziehen, dann Redirect.

### HIGH-2 — GutachterShell Nav-Bug (Erreichbarkeits-Defekt)
`GutachterShell.tsx:168` filtert `if (sec.title !== 'Geschäft')` — es gibt **keine** Sektion `'Geschäft'` (sie heißen `Tagesgeschäft`/`Finanzen`/`Verwaltung`). Folge: `/gutachter/team`, `/gutachter/community`, `/gutachter/verifizierung` werden **nie in die Sidebar injiziert**. Team + Community haben gar keinen UI-Einstieg.
→ **Bug-Fix** (nicht Cleanup) — verstößt gegen AGENTS.md-Audit-Punkt 2 (UI-Erreichbarkeit).

### MEDIUM — toter Link `/kanzlei/fall/[id]`
`kanzlei/mandate/page.tsx` (2×) + Email-Template `KanzleiAuftragszusammenfassung.tsx` linken auf `/kanzlei/fall/[id]` — **Route existiert nicht** (404). „PR 2b" (Read-only-Kanzlei-Fallakte) nie gebaut.
→ Entweder Route bauen (Teil der Kanzlei-Journey-Migration) oder Links umbiegen.

### LOW — RSC-Redirect-Stubs + verwaiste Routen
- `/kunde/termin` — reiner `permanentRedirect('/kunde')` → gehört als 308 in `next.config.ts` ([[feedback_rsc_redirect_stubs]]).
- `/gutachter/onboarding` — conditional Redirect-Logik (kann kein HTTP-Redirect sein, bleibt).
- `/admin/abrechnungen` (Finance-Hub hat eigene), `/admin/communities` (Doppel zu `partner/communities`), `/admin/support` (kein Einstiegspunkt) — verwaiste Einzelrouten, vor Löschung Client-Component-Konsumenten verifizieren.
- `/gutachter/gebiet` — aus Nav entfernt (CMM-17), nur noch `revalidatePath`-Referenz; laut Code-Kommentar bewusst für späteres Feature-Ticket geparkt.

---

## 3 · Routen-Migration je Journey (faelle → claims)

| Journey | Kern-Routen | Migrations-Bedarf |
|---|---|---|
| **Kunde** | `/kunde`, `/kunde/faelle/[id]` (+kalender), `/kunde/termin*`, `/kunde/nachbesichtigung/[fall_id]`, `/kunde/onboarding*` | `/kunde` schreibt `faelle` direkt; Detail liest claims+faelle. Magic-Link-Routen (`termin/[token]`, `re-termin/[token]`) lesen `faelle` direkt. |
| **SV** | `/gutachter/{heute,auftraege,faelle,fall/[id],kalender,feldmodus}`, `/gutachter/termine/[id]/*` | Fast alle lesen `faelle` direkt. `fall/[id]` ist R+W. SV-Portal ist am stärksten faelle-gebunden. |
| **KB/Admin** | `/faelle/[id]` (geteilte Fallakte, R+W), `/admin/faelle*`, `/admin/finance*`, `/admin/kalender` | `/faelle/[id]` ist die zentrale Fallakte — höchste Migrations-Priorität. `/mitarbeiter/*` ist bereits CMM-47 auf `v_claim_full` migriert (nur noch FK-Joins für `fall_nummer`). |
| **Dispatcher** | `/dispatch/leads/[id]` (bereits `v_claim_full`), `/dispatch/{dashboard,kalender}` | Geringster Bedarf — `leads/[id]` schon CMM-47-D-migriert. Dispatcher ist Lead-Welt, claim-nah nur am Übergabepunkt. |
| **Kanzlei** | `/kanzlei/{mandate,kanban,termin}`, `/kanzlei/abrechnung/[token]` | Alle 4 lesen `faelle` direkt. Plus die fehlende `/kanzlei/fall/[id]` (Read-only-Fallakte) — gehört gebaut, claims-nativ. |

---

## 4 · Empfehlung Hygiene-Reihenfolge

1. **HIGH-2 Nav-Bug** sofort fixen (`GutachterShell.tsx:168`) — eigenständiger Bug, unabhängig von der Migration.
2. **HIGH-1** Admin-Legacy-Hub-Routen: 9× 308-Redirect + TasksPill-href-Fix — ein PR, vor der Migration (verkleinert die Migrations-Fläche um 9 Routen).
3. RSC-Redirect-Stubs (`/kunde/termin`) → `next.config.ts`.
4. Verwaiste Routen (`/admin/abrechnungen`, `/admin/communities`, `/admin/support`) prüfen + droppen.
5. `/kanzlei/fall/[id]` bauen (claims-nativ, Teil der Kanzlei-Journey-Migration).
6. Dann die ~70 faelle-Routen migrieren — primär über die **Views** (`v_claim_full` etc. claims-nativ machen), erst danach die Direkt-`faelle`-Reads.

> Gutachten-/Fahrzeug-/Cardentity-Routen (`fall/[id]/stellungnahme`, OCR-API-Routen, cardentity-actions) sind alle aktiv + korrekt eingebunden — kein Cleanup, immer relevant.

---

## 5 · Quellen

Routen-Inventar 16.05.2026 (`Glob src/app/<portal>/**/page.tsx` + Grep faelle/claims/Link-Referenzen). Ergänzt `claim-ssot-vollmigration-audit-strategie.md` §3.1e.
