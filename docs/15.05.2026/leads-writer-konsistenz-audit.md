# leads-Audit — horizontal + vertikal (15.05.2026)

Auftrag: `leads` horizontal (Tabelle selbst) auditieren, parallel vertikal prüfen
ob alle Contributors konsistente Felder schreiben und der Dispatcher mitlesen kann.

---

## 1. Horizontal — die `leads`-Tabelle

- **201 Spalten**, fast alle nullable, keine Column-Defaults. Strukturell schreibt
  jeder Eintrittspunkt nur eine Teilmenge — ein Lead ist je nach Quelle
  unterschiedlich vollständig.
- **6 Trigger:**
  - `trg_leads_lead_nummer` (BEFORE INSERT) — `set_lead_nummer()`
  - `on_lead_created` (AFTER INSERT) — `trg_lead_benachrichtigung()`
  - `update_leads_updated_at` (BEFORE UPDATE)
  - `lead_changes_trigger` (AFTER UPDATE) — `log_lead_changes()`
  - `kanzlei_provision_trigger` (AFTER UPDATE) — `trigger_kanzlei_provision()`
  - `leads_whatsapp_invalidate` (BEFORE UPDATE OF telefon) — Cache-Invalidierung
- **RLS — 4 Policies:**
  - `leads_staff_all_consolidated` (ALL, authenticated): `is_admin() OR rolle IN
    ('admin','dispatch') OR (kundenbetreuer mit faelle.kundenbetreuer_id-Match)`.
    → **Dispatcher hat vollen Lese- + Schreibzugriff.**
  - `Flow anon select leads` (SELECT, anon): nur `status='flow-gesendet'`
  - `leads_kanzlei_kb_select_consolidated` (SELECT): kanzlei + KB via claims/faelle
  - `leads_makler_sv_select_consolidated` (SELECT): makler via promotion_code, SV via faelle

**Dispatcher-Lesefähigkeit: bestätigt.** RLS ist nicht das Drift-Problem.

---

## 2. Vertikal — Writer-Konsistenz

**13 Writer** schreiben in `leads`. Sie teilen **kein gemeinsames Basis-Feld-Set**.

| Feld | Public-Rückruf | Dispatcher-Insert | ZB1-Upload | Flow-Wizard |
|---|---|---|---|---|
| vorname/nachname/telefon/email | ✓ | ✓ | ✓ | — |
| `source_channel` | ✗ **NULL** | ✓ | ✓ | — |
| `status` | ✗ **NULL** | ✓ (`neu`) | ✗ | ✓ (update) |
| `qualifizierungs_phase` | ✓ | ✓ | ~✓ | ✓ (update) |
| `kunden_konstellation` | ✗ | ✓ (`kk-01`) | ✗ | ✗ |
| `zugewiesen_an` | ✗ | ✓ | ✗ | ✗ |

### Worst-Case-Befund

Ein Lead aus dem **öffentlichen Rückruf-Formular** (`src/lib/actions/public-rueckruf.ts:48`)
entstand mit nur 5 Feldern — `source_channel`, `status`, `kunden_konstellation`,
`zugewiesen_an` blieben NULL. Verglichen mit dem Dispatcher-Insert
(`src/lib/actions/dispatch-fall-actions.ts:252`, 14 Felder inkl. `status='neu'`,
`source_channel`, `zugewiesen_an`).

### Dispatcher-Lesepfad

`src/app/dispatch/leads/page.tsx:20` selektiert 14 Spalten:
```
id, vorname, nachname, telefon, email, qualifizierungs_phase, schadens_fall_typ,
service_typ, source_channel, flow_link_geoeffnet, flow_link_abgeschlossen,
whatsapp_verfuegbar, created_at, updated_at
```
Gefiltert wird per `qualifizierungs_phase`. `status`, `kunden_konstellation`,
`zugewiesen_an` werden **nicht** geladen — der Dispatcher *könnte* sie lesen (RLS
erlaubt es), die Listen-Query zieht sie nur nicht.

---

## 3. Fix in dieser PR (#1 aus dem Audit)

`public-rueckruf.ts` — der Lead-Insert setzt jetzt das Basis-Feld-Set:

- `status: 'rueckruf'` — konsistent zu `qualifizierungs_phase` (es gibt einen
  `rueckruf`-Wert im `lead_status`-Enum)
- `source_channel: input.quelle?.trim() || 'rueckruf'` — Marketing-Quelle
- `zugewiesen_an: erstellerId` — der Dispatch-User der den Rückruf bekommt

Damit entstehen keine NULL-Leads mehr aus dem öffentlichen Rückruf-Flow.

---

## 4. Nicht in dieser PR — empfohlene Follow-ups

| # | Was | Warum separat |
|---|---|---|
| 2 | `dispatch/leads/page.tsx`-SELECT um `status` + `kunden_konstellation` erweitern + in der Listen-UI anzeigen | UI-Change mit eigenem Scope (LeadsViewToggle-Component) |
| 3 | Zentrale `createLead()`-Helper-Funktion statt 13× direktem `.insert()` — erzwingt ein gemeinsames Basis-Feld-Set per Typ-Signatur | 13-File-Refactor, hohes Konflikt-Risiko bei paralleler Arbeit; eigener PR |

Empfehlung: #3 ist der eigentliche strukturelle Fix gegen Drift — eine
`createLead({ base, extra })`-Funktion, deren `base`-Typ Pflichtfelder
(Kontakt + `source_channel` + `status`) erzwingt. Solange jeder Contributor
direkt `.insert()` aufruft, driften die Feld-Sets weiter mit jedem neuen
Eintrittspunkt.

🤖 Audit + Fix von Claude Opus 4.7. Horizontal via Supabase-CLI, vertikal via Explore-Agent.
