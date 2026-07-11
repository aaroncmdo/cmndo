# Werkstatt-Selbstauskunft + Verifizierung (Inc 3) — Design

**Datum:** 2026-07-11
**Ziel:** Eine Werkstatt pflegt ihre `faehigkeiten` **selbst** im Portal (heute nur Admin), und ein Admin-**verifiziert**-Marker macht die Qualifizierungs-Datenbasis vertrauenswürdig — Trust-**Badge** + **Vorreihung** im Finder.
**Baut auf:** Inc 1 (`qualifiziereWerkstaetten`, `WerkstattFinder`, Finder-Loader). Schließt die Daten-/Vertrauens-Lücke aus Inc 1 §Fork-2.

## Entschieden (Aaron 11.07.)
- **`verifiziert`-Effekt: Badge + Vorreihung** — selbst-deklarierte Fähigkeiten qualifizieren wie heute (neue Werkstätten nicht blockiert); verifizierte zeigen ein „geprüft"-Badge UND werden **innerhalb der passt-Gruppe** nach vorne gereiht (dann Distanz). Getrennt vom Tier-Rang.
- **Verify-Prozess: Admin-manuell** — Button „verifizieren" im Admin-Werkstatt-Detail (+ Notiz, `verifiziert_am`/`von`). Dokument-Upload = spätere Ausbaustufe.

## Ist-Zustand (verifiziert)
- Self-Service-Fläche: `src/app/werkstatt/(shell)/einstellungen/page.tsx` + `src/components/werkstatt/WerkstattSettings.tsx`. Owned-Action-Muster `src/lib/actions/werkstatt-settings.ts` (`auth.getUser()` → `.eq('user_id', user.id)`).
- Admin-Vorbild: `FaehigkeitenStaffelEditor.tsx` + `setWerkstattFaehigkeiten` (`admin/werkstaetten/actions.ts`, `requireAdmin` + Whitelist `FAEHIGKEITEN_VALUES`). Vokabular `karosserie|lackierung|mechanik|glas|smart_repair`.
- Trust-Vorbild: SV `oeffentlich_bestellt` → Chip in `SvProfilePopup.tsx`. Werkstatt hat `status`/`aktiviert_*`/`gesperrt_*`, **kein `verifiziert`** → DDL nötig. Kein Verify-Workflow existiert.
- Linkage: `werkstaetten.user_id` ↔ `auth.uid()`. Kollision: keine (Portal ~1 Woche unberührt).

## Teil A — Werkstatt-Selbstauskunft (Portal)
1. **Action** `setMeineFaehigkeiten(faehigkeiten: string[])` in `werkstatt-settings.ts` — `auth.getUser()` → Whitelist gegen `FAEHIGKEITEN_VALUES` → `admin.from('werkstaetten').update({ faehigkeiten: clean }).eq('user_id', user.id)` (self-scoped, KEIN werkstattId-Param → kein IDOR). Result-Object. `revalidatePath('/werkstatt/einstellungen')`.
2. **UI** „Meine Leistungen"-Card in `WerkstattSettings.tsx` (Toggle-Buttons, gespiegelt vom Admin-Editor; „nichts gewählt = Vollservice"-Hinweis). `einstellungen/page.tsx` lädt `faehigkeiten` zusätzlich.
3. Schließt die 3 Datenlücken (echte Werkstätten ohne `faehigkeiten`) selbst-bedient + skaliert.

## Teil B — Verifizierung (DDL + Admin + Finder)
1. **DDL** (via Supabase-Plugin, Regel 2): `werkstaetten` +`verifiziert boolean not null default false`, +`verifiziert_am timestamptz`, +`verifiziert_von uuid`, +`verifizierung_notiz text`.
2. **Admin-Verify:** Action `setWerkstattVerifiziert(werkstattId, verifiziert: boolean, notiz?: string)` (`admin/werkstaetten/actions.ts`, `requireAdmin`) → setzt `verifiziert` + `verifiziert_am = now()` + `verifiziert_von = admin.id` (+ notiz). `revalidatePath('/admin/werkstaetten')`. Button/Toggle im `WerkstattDetailClient.tsx` (Admin-Werkstatt-Detail).
3. **Finder-Badge:** `WerkstattFinder.tsx` zeigt einen `verifiziert`-Chip (`StatusBadge tone="success"`, „✓ Verifizierter Partner") wenn `w.verifiziert` — parallel zum SV-Muster, additiv zur Fit-Anzeige. Rows tragen `verifiziert` aus dem `werkstaetten`-Select.
4. **Vorreihung:** innerhalb der `passt`-Gruppe verifiziert-first, dann Distanz. **Komposition NACH der Qualifizierung** (getrennt vom Tier-Rang): `qualifiziereWerkstaetten` (Inc 1) wird um einen optionalen `verifiziert`-Sekundär-Sort erweitert — Sort-Key `(fitRang, verifiziertRang, [stabile Distanz-Reihenfolge])`. `verifiziert` optional auf dem Row-Typ (`T & { verifiziert?: boolean }`) → Bestands-Caller ohne das Feld unverändert (kein Reorder).

## Datenfluss
Finder-Loader (`findWerkstaetten` + die Inc-1/2-Wrapper/Actions) selektieren zusätzlich `verifiziert` → `qualifiziereWerkstaetten` reiht verifiziert-first innerhalb passt → `WerkstattFinder` zeigt Fit-Chip + Verifiziert-Chip + verifizierte oben.

## Test-Strategie
- **Rein/TDD:** `qualifiziereWerkstaetten`-Vorreihung (verifiziert-first innerhalb passt, Distanz erhalten; ohne `verifiziert` = unverändert); `setMeineFaehigkeiten`-Whitelist (nur gültige Gewerke).
- **Action (gemockt):** `setMeineFaehigkeiten` (self-scope `user_id`, kein werkstattId); `setWerkstattVerifiziert` (requireAdmin, setzt Felder).
- **UI:** Build-Check; `WerkstattFinder` rendert Verifiziert-Chip (Snapshot/Logik).

## Koordination
Berührt: `werkstatt/(shell)/einstellungen` + `WerkstattSettings.tsx` (Portal, frei), `admin/werkstaetten/{actions.ts, [id]/WerkstattDetailClient.tsx}` (Admin), `werkstaetten`-DDL, `WerkstattFinder.tsx` + `findWerkstaetten` + `qualifiziere.ts` (Inc-1-Lane, meins). Gestackt auf Inc-1-Branch (`kitta/werkstatt-faehigkeiten-verify`), separater PR (base = Inc-1-Branch) → retarget staging nach #4101.

## Offene Punkte (Impl)
- `WerkstattDetailClient.tsx` — exakte Einfüge-Stelle für den Verify-Toggle (beim Lesen).
- Ob `findReparaturWerkstaettenForTarget` (Claim-Finder) + `sucheEchteWerkstaetten` (Embed) das `verifiziert`-Feld schon durchreichen oder ergänzt werden müssen (Select erweitern).
- Backfill der 3 leeren Werkstätten: primär Self-Service; optional Admin-Nudge (kein Migration-Bedarf, reine Daten).
