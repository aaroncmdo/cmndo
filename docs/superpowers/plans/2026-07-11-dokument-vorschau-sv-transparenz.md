# Dokument-Vorschau (Kunde + SV) + SV volle Doku-Transparenz — Plan

> Extends WS6 (repair-loop-closure branch, PR #4109). Subagent-driven.

**Goal:** In-App-Vorschau für alle Dokumente (Kunde + SV) + der SV bekommt Zugriff auf die mandatsinternen Kunden-Rechtsdokumente (Sicherungsabtretung, Vollmacht).

**Architecture:** Ein geteiltes `DokumentVorschau`-Modal (primitives Modal → iframe für PDF, img für Bild, Tab-Fallback sonst). Eingehängt NUR in Kunde- + SV-Doku-Oberflächen (Makler/Admin unberührt → opt-in-Prop). SV-Sichtbarkeit via Write-Path + `DOKUMENT_SICHTBAR_FUER`-Map erweitern.

## Global Constraints
- Umlaut-korrekt (UI-Strings), primitives `Modal`/`Button`, Tokens (kein raw hex / Tailwind-Default-Farben/-Radien).
- Server-Actions: `{ ok, error }`-Pattern. Ratchets 0-neu (token-audit, component-set, status-registry, knip, redirect-stubs).
- Vorschau-Scope = **nur Kunde + SV** (Aaron 11.07.). SV-Sichtbarkeit = **volle Transparenz** (Aaron 11.07.).
- tsc grün (Known-Noise: caldav-probe/write-termin-caldav/jsqr/@turf/union ignorieren).

---

## Task A — `DokumentVorschau`-Modal + Typ-Erkennung
**Files:** Create `src/components/shared/DokumentVorschau.tsx`, `src/lib/dokumente/vorschau-typ.ts` (pure), Test `src/lib/dokumente/__tests__/vorschau-typ.test.ts`.
**Produces:** `<DokumentVorschau open onClose url dateiname typ />` + `erkenneVorschauTyp(url, typ): 'pdf'|'bild'|'andere'`. Optional Hook `useDokumentVorschau()` → `{ oeffnen(doc), modal }`.
- `erkenneVorschauTyp`: pdf (url endet `.pdf` ODER typ enthält 'pdf') → 'pdf'; Bild-Endungen (jpg/jpeg/png/webp/heic/gif/avif) → 'bild'; sonst 'andere'. Case-insensitive, query-string-tolerant (`.pdf?token=…`).
- Modal (primitives, groß): 'pdf' → `<iframe src={url} className="h-[70vh] w-full" title={dateiname}/>`; 'bild' → `<img src={url} className="max-h-[70vh] mx-auto object-contain"/>`; 'andere' → EmptyState „Diese Datei kann nicht direkt angezeigt werden." + `primitives.Button` „Im neuen Tab öffnen" (`window.open(url,'_blank')`). Header = dateiname + „Öffnen"-Action. `url===null` → nicht öffnen.
- TDD: Test `erkenneVorschauTyp` (pdf/bild/andere + query-string + case).

## Task B — Kunde: Vorschau in DokumenteDownloadListe + BelegePaketCard
**Files:** Modify `src/components/shared/DokumenteDownloadListe.tsx`, `src/components/kunde/claim-view/BelegePaketCard.tsx`, `src/app/kunde/faelle/[id]/FallDetailSections.tsx`.
**Consumes:** Task A.
- `DokumenteDownloadListe`: optionale Prop `enableVorschau?: boolean` (default false → Makler unberührt). Wenn true: pro Zeile ein Augen-Button („Vorschau") neben dem Download-Link, der `DokumentVorschau` für `{url, dateiname, typ}` öffnet. Ein Modal-Instanz je Liste (Hook/State).
- Kunde-Caller (`FallDetailSections` dokumente-Tab) setzt `enableVorschau`.
- `BelegePaketCard`: jeder Beleg bekommt zusätzlich zur Download-Aktion eine „Vorschau"-Aktion (öffnet `DokumentVorschau`).

## Task C1 — SV volle Doku-Transparenz (Sichtbarkeit)
**Files:** Modify `src/lib/dokumente/sichtbarkeit.ts` (Map), + Write-Path(s) die `sicherungsabtretung`/`sa_vollmacht` inserten (grep: `src/app/flow/[token]/actions.ts` u.a.). Test wenn Map-Helper getestet ist.
**Sicherheitssensibel — sauber grounden.**
- `DOKUMENT_SICHTBAR_FUER`: `sicherungsabtretung` + `sa_vollmacht` um `'sachverstaendiger'` erweitern.
- Row-Write-Path: beim Insert dieser Typen `'sachverstaendiger'` in die row-`sichtbar_fuer`-Array aufnehmen (der SV-Portal-Query filtert `.contains('sichtbar_fuer',['sachverstaendiger'])` → nur Row-Änderung wirkt für neue Docs).
- Bestehende Rows (Backfill) NICHT in diesem Task — als Folge-Notiz dokumentieren (Daten-Update, separate Entscheidung; Regel 2: kein DDL nötig, aber Bulk-Update = Ops-Call).
- Verify: der SV-Query + `getSichtbarFuerRolle('sachverstaendiger')` liefern die zwei Typen jetzt durch.

## Task C2 — SV: Vorschau in der SV-Doku-Oberfläche
**Files:** Modify `src/components/gutachter/WeitereDokumenteCard.tsx` + `src/app/gutachter/fall/[id]/_components/FallakteDrawer.tsx` (bzw. dessen `DateienListe`).
**Consumes:** Task A.
- Pro Dokument einen „Vorschau"-Augen-Button neben dem bestehenden Download-Link, öffnet `DokumentVorschau`. Bestehende Kategorisierung/Download-Links bleiben.

---
## Offene Folge-Notiz
- **Backfill bestehender Rows** (SV-Sichtbarkeit für Alt-Claims' `sicherungsabtretung`/`sa_vollmacht`): Bulk-`UPDATE fall_dokumente SET sichtbar_fuer = array_append(sichtbar_fuer,'sachverstaendiger') WHERE dokument_typ IN (…) AND NOT ('sachverstaendiger' = ANY(sichtbar_fuer))` — Ops-Entscheidung, nicht Teil dieses PRs.
