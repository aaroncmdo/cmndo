# SP3 — Gutachten + OCR-Werte an die Werkstatt — Design

> Sub-Projekt 3 des Kunde→Werkstatt-Vermittlung-Ausbaus. Die Werkstatt bekommt — sobald das Gutachten vom SV fertiggestellt ist — die reparatur-relevanten OCR-Werte + den Gutachten-PDF-Download in ihrem Auftrags-Portal. Klein, baut auf `v_werkstatt_auftrag` (SP2, in staging) + `/werkstatt/auftraege` (#3501).

**Datum:** 2026-07-04 · **Session:** cec48090 · **Branch:** `kitta/werkstatt-gutachten-sicht` (off `staging`)

---

## 1. Ziel & Abgrenzung

**Ziel:** Aaron — „die Werkstatt muss das Gutachten, sobald es vom SV da ist, bekommen + die von der OCR ausgelesenen Werte." Die Werkstatt sieht in `/werkstatt/auftraege` je Auftrag (wenn ein **fertiggestelltes** Gutachten existiert) die kalkulations-relevanten Kennzahlen und kann das Gutachten-PDF herunterladen.

**In Scope (SP3):**
1. `v_werkstatt_auftrag` additiv um einen minimierten Gutachten-Satz erweitern (gated auf `gutachten.fertiggestellt_am IS NOT NULL`).
2. `getWerkstattAuftraege`/`WerkstattAuftrag` um die neuen Spalten erweitern.
3. Werkstatt-Fläche: Gutachten-Sektion (Kennzahlen) + PDF-Download.
4. Server-Action `oeffneGutachtenPdf(claimId)` → signed URL (werkstatt-access-verifiziert).

**Out of Scope:**
- Voller OCR-Positionen-Detailview (die Einzelpositionen stehen im PDF — die Werkstatt lädt es).
- SV-Honorar, Kunden-PII über das Nötige hinaus (die Werkstatt bekommt reparatur-relevante Werte + das Gutachten-PDF, das Aaron explizit freigibt).
- Bearbeiten/Kommentieren des Gutachtens durch die Werkstatt.

---

## 2. Datenmodell (1 Migration — Plugin)

`gutachten` ist über `gutachten.claim_id` an den Claim gebunden. Fertig-Signal = `fertiggestellt_am` (timestamptz). Reparatur-relevante Werte: `reparaturkosten_netto/brutto`, `minderwert`, `restwert`, `wiederbeschaffungswert`, `totalschaden`, + `bericht_pdf_url`.

`v_werkstatt_auftrag` (SECURITY DEFINER, Gate `is_staff() OR is_werkstatt_for_claim(c.id)`) bekommt einen additiven `LEFT JOIN LATERAL` auf das jüngste fertiggestellte Gutachten:

```sql
LEFT JOIN LATERAL (
  SELECT g.bericht_pdf_url, g.reparaturkosten_netto, g.reparaturkosten_brutto,
         g.minderwert, g.restwert, g.wiederbeschaffungswert, g.totalschaden, g.fertiggestellt_am
  FROM public.gutachten g
  WHERE g.claim_id = c.id AND g.fertiggestellt_am IS NOT NULL
  ORDER BY g.fertiggestellt_am DESC
  LIMIT 1
) gu ON true
```

Neue View-Spalten (additiv): `gutachten_bericht_pdf_url`, `gutachten_reparaturkosten_netto`, `gutachten_reparaturkosten_brutto`, `gutachten_minderwert`, `gutachten_restwert`, `gutachten_wiederbeschaffungswert`, `gutachten_totalschaden`, `gutachten_fertiggestellt_am`. Alle NULL, solange kein fertiggestelltes Gutachten existiert.

**Wichtig:** Die bestehende Definition (inkl. der SP2-Reparaturtermin-LATERAL + aller Spalten) wird 1:1 übernommen (`CREATE OR REPLACE VIEW`) und nur additiv ergänzt — aktuelle Definition vor dem Umbau per `pg_get_viewdef` lesen. Gate unverändert.

Regel-2-Flow (Plugin): `apply_migration` → `list_migrations` → File `supabase/migrations/<V>_v_werkstatt_auftrag_gutachten.sql` == getrackte Version → `execute_sql` (READ) verifizieren.

**Kein Storage-Pfad-Leak:** `bericht_pdf_url` in der View ist der Storage-Pfad/URL; der Client bekommt ihn NICHT direkt gerendert (kein `<a href={bericht_pdf_url}>`), sondern nur über die signed-URL-Action (s. §4).

---

## 3. Query-Erweiterung (queries.ts)

`src/lib/werkstatt/queries.ts` — `WerkstattAuftrag`-Typ + `getWerkstattAuftraege`-SELECT additiv um die 8 `gutachten_*`-Spalten erweitern (`bericht_pdf_url: string | null`, die 5 Numeric-Werte als `number | null`, `totalschaden: boolean | null`, `fertiggestellt_am: string | null`). **`gutachten_bericht_pdf_url` wird NICHT an den Client gereicht** — nur `fertiggestellt_am` als „Gutachten vorhanden"-Flag + die Kennzahlen. Der PDF-Pfad bleibt server-seitig (die Action liest ihn frisch).

---

## 4. PDF-Download (Server-Action)

**Neu:** `oeffneGutachtenPdf(claimId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }>` in `src/app/werkstatt/(shell)/auftraege/actions.ts` (additiv zu den SP2-Actions).

Ablauf (Werkstatt-Session = Access-Grenze):
1. `createClient()` (Werkstatt-Session). Access verifizieren: `v_werkstatt_auftrag` mit `claim_id=claimId` lesen (RLS-Gate `is_werkstatt_for_claim`) → keine Zeile → `{ ok:false }`.
2. Das fertiggestellte Gutachten lesen — `bericht_pdf_url` (via Service-Client, da `gutachten` keine Werkstatt-RLS hat; Access ist über Schritt 1 verifiziert). Kein PDF → `{ ok:false, 'Kein Gutachten verfügbar.' }`.
3. **Signed URL** erzeugen: den Storage-Helper aus `src/lib/storage/url.ts` bzw. `src/lib/supabase/storage.ts` (`createSignedUrl(path, ttl, { download })`) nutzen. Ist `bericht_pdf_url` bereits eine volle URL (kein Storage-Pfad), direkt zurückgeben. (Plan verifiziert Pfad-vs-URL an einem Sample.)
4. `{ ok:true, url }`.

Result-Object, kein throw. Der Client öffnet die zurückgegebene URL (`window.open`/Link).

---

## 5. Werkstatt-Fläche

`src/components/werkstatt/WerkstattAuftraege.tsx` (die SP2-`ReparaturterminSektion` liegt bereits hier) — additive **Gutachten-Sektion** je Auftrag, wenn `auftrag.gutachten_fertiggestellt_am` gesetzt:
- `SectionCard` „Gutachten" (+ „vom {formatBerlin(fertiggestellt_am)}").
- Kennzahlen-Grid: Reparaturkosten brutto (+ netto), Minderwert, Restwert, Wiederbeschaffungswert — als Euro formatiert (bestehenden Euro-Formatter nutzen). `totalschaden===true` → `StatusBadge` „Totalschaden" (warning-Ton).
- `primitives.Button` „Gutachten-PDF öffnen" → `oeffneGutachtenPdf(claimId)`; `useTransition`; `if (!res.ok) toast.error(...)` sonst `window.open(res.url, '_blank')`.
- Echte Umlaute; Claimondo-Tokens; kein raw Status-Scale.

---

## 6. Koordination

- `v_werkstatt_auftrag`, `queries.ts`, `WerkstattAuftraege.tsx`, `auftraege/actions.ts` sind **meine** SP2-Files (in staging gemerged) — SP3 erweitert sie rein additiv. Geringe Fremd-Kontention.
- Keine Überschneidung mit SP4 (#3580, Kunde-Files) — andere Files.

---

## 7. Testing

- **`oeffneGutachtenPdf`**: kein Auftrag/kein Access (v-Query leer) → `{ ok:false }`; kein PDF → `{ ok:false }`; Erfolg → `{ ok:true, url }` (signed-URL-Helper gemockt). vitest.
- **View (READ, Prod)**: `gutachten_*`-Spalten existieren; ein Claim mit fertiggestelltem Gutachten liefert die Werte unter Werkstatt-JWT; ohne Gutachten NULL.
- **Prod-Smoke (nach Deploy):** Werkstatt sieht die Kennzahlen + kann das PDF öffnen (signed URL lädt).

---

## 8. Definition of Done

- [ ] `v_werkstatt_auftrag` +8 `gutachten_*`-Spalten (LATERAL, gated `fertiggestellt_am`), additiv, Gate unverändert, prod-live.
- [ ] `queries.ts` erweitert (PDF-Pfad NICHT client-seitig).
- [ ] `oeffneGutachtenPdf`-Action (signed URL, access-verifiziert).
- [ ] Gutachten-Sektion in `/werkstatt/auftraege` (Kennzahlen + PDF-Download).
- [ ] vitest grün, tsc 0, `npm run build` (8 GB) grün, 3 Ratchets 0-neu.
- [ ] 7-Punkte-Audit je Commit.
