# Werkstatt: Kostenvoranschlag-Upload → OCR → vorausgefüllter FlowLink

- **Datum:** 2026-06-26
- **Branch:** `kitta/werkstatt-kva-upload` (Worktree, Basis `staging`)
- **Status:** Design — Review

## Problem / Ziel

Eine Werkstatt hat einen Kunden mit Unfallschaden vor sich (oder am Telefon) und einen **Kostenvoranschlag (KVA)**. Heute muss der Kunde den Gutachter-Finder von Null ausfüllen. Ziel: Die Werkstatt lädt im `/werkstatt`-Portal den KVA hoch, **OCR liest** Schadenbetrag, Fahrzeug und (best-effort) Name/Anschrift aus, die Werkstatt **prüft/korrigiert**, und daraus entsteht ein **Lead + kanonischer FlowLink** — den der Kunde **vorausgefüllt** abschließt (Termin buchen + Beauftragung unterschreiben), entweder **vor Ort** (neuer Tab auf Werkstatt-Gerät) oder **per QR/WhatsApp** auf dem eigenen Handy.

Geschäftswert: weniger Friktion → höhere Conversion; die Werkstatt bekommt ihre 150 €-Provision (bestehende `werkstatt_id`-Attribution); Claimondo bekommt einen qualifizierten Lead mit Fahrzeug + Schadenkontext.

## Scope / Nicht-Ziele

**In Scope:** KVA-Upload-UI im bestehenden `/werkstatt`-Portal · KVA-OCR-Extraktor · Review/Korrektur-Schritt · gfa-Anlage (mit `werkstatt_id` + KVA-Daten) → FlowLink-Token · Übergabe-Screen (Tab / QR / optional WhatsApp) · Migration für die KVA-Betragsfelder.

**Nicht-Ziele:** Der Werkstatt-Vermittler selbst (Rolle `werkstatt`, `/werkstatt`-Portal, `/start/werkstatt/[id]`-QR, `werkstatt_id` auf gfa/leads/claims, `werkstatt_provisionen`) ist **bereits live** (DB-verifiziert) und wird **nur erweitert**. Der `/flow/[token]`-Pfad (Termin + SA/Vollmacht-Signatur) bleibt **unverändert**. Keine Bagatell-/Schuldfrage-Logik. Keine Änderung an `gutachten-ocr.ts` (SV-Pfad).

## Verifizierter Ist-Zustand (Wiederverwendung)

- **DB:** `user_role` enthält `werkstatt`; `werkstatt_id` liegt auf `gutachter_finder_anfragen`, `leads`, `claims`, `repairs`, `werkstatt_provisionen`. Tabellen `werkstaetten`, `repairs`, `werkstatt_provisionen`, `gutachten` existieren.
- **`issueCanonicalFlowLinkForAnfrage(anfrageId, {send?})`** (`src/lib/start-link/issue-canonical-flowlink.ts`): gfa → `createLead` (Round-Robin-Dispatcher) → ein `flow_links`-Token. Trägt gfa→lead: `fahrzeug_hersteller/modell/baujahr/fin/kennzeichen/hsn/tsn`, `fahrzeug_standort_*` (aus `besichtigungsort_adresse`/`schadenort`), `wunschtermin`, **`werkstatt_id`** (Z.164–166), `schadens_hergang` (aus `schadens_kurzbeschreibung`). `send:false` überspringt den Link-Versand (Client redirectet selbst). Idempotent.
- **`/flow/[token]`** (`FlowSlotStep` + Signatur): liest die vorausgefüllten Lead-Daten, bucht Termin, lässt SA/Vollmacht unterschreiben (`sa_unterschrieben`). Unverändert — exakt der QR-/Embed-Pfad.
- **OCR-Blueprint `gutachten-ocr.ts`:** Anthropic SDK, `AI_MODELS.ocr`, Input = `document`-Block mit `source:{type:'url', url}` (Claude liest PDF nativ; Bilder via `image`-Block), strenger JSON-Schema-System-Prompt mit Komma-→Dezimal-Normalisierung, JSON-Parse. **Reuse als Muster**, nicht forken (KVA ≠ Gutachten).

## Datenmodell — die drei Beträge sauber trennen

**Invariante (Aaron):** Es gibt drei semantisch verschiedene Beträge, die **nie vermischt** werden:
1. **Werkstatt-KVA** — Schätzung der Werkstatt (unser Upload). Nicht neutral.
2. **SV-Gutachten** (`gutachten.reparaturkosten_netto/brutto`) — unabhängig berechnet, rechtlich relevant (§ 249). Neutralität = Claimondos Kern.
3. **`claims.schadens_hoehe_netto`** — aus dem Gutachten abgeleitet.

Der KVA-Betrag bleibt in **eigener Spur** und fließt **NIE** in `gutachten.*` oder `claims.schadens_hoehe_netto` (sonst Beeinflussung des SV / Verfälschung der offiziellen Zahl). Heißt im Schema **nicht** „schadenshoehe", sondern **`kostenvoranschlag`**.

**Migration** (via Supabase-Plugin, Regel 2):
- `gutachter_finder_anfragen`: `+ kostenvoranschlag_netto numeric`, `+ kostenvoranschlag_brutto numeric`.
- `leads`: `+ kostenvoranschlag_netto numeric`, `+ kostenvoranschlag_brutto numeric`.
- Roh-OCR (alle Felder inkl. Positionen) → bestehendes `gfa.ocr_rohdaten` (jsonb) + `ocr_extrahiert_am`.
- **Carry** gfa→lead: ein additiver `kostenvoranschlag_netto/brutto`-Mapping in `issueCanonicalFlowLinkForAnfrage` (analog zur bestehenden `werkstatt_id`-Zeile).
- **Carry** lead→claim (Convert-Zeit): in `repairs.kostenvoranschlag` schreiben (die Tabelle ist genau dafür), **nie** in `claims.schadens_hoehe_netto`. (Implementierungs-Detail: ob bei Convert bereits eine `repairs`-Zeile existiert, wird in der Plan-Phase verifiziert; sonst bleibt der Wert auf lead/gfa als gelabelte Referenz, bis ein Repair angelegt wird.)
- **Anzeige:** überall gelabelt „Kostenvoranschlag (Werkstatt): € X — Schätzung" vs. „SV-Gutachten: € Y — neutral", nie als eine Zahl.

## Architektur / Komponenten

### 1. OCR-Extraktor — `src/lib/ai/kostenvoranschlag-ocr.ts` (neu, PURE-nah)
Spiegelt `gutachten-ocr.ts`: Anthropic SDK + `AI_MODELS.ocr`, Input = KVA als `document`-URL (PDF) bzw. `image`-URL (Foto). System-Prompt extrahiert **nur KVA-relevante** Felder als striktes JSON:
```
{
  kostenvoranschlag_netto, kostenvoranschlag_brutto,         // Reparaturkosten-Summe der Werkstatt
  fahrzeug: { hersteller, modell, kennzeichen, fin, erstzulassung, baujahr },
  halter:   { vorname, nachname, strasse, plz, ort, telefon } // best-effort, oft nicht im KVA
}
```
Komma-→Dezimal-Normalisierung, fehlende Werte = `null`. Liefert ein getyptes `KvaOcrResult` (kein DB-Write hier — reine Extraktion, testbar). PDF→Bild-Handling über den Anthropic-`document`-Block (kein eigener Konverter nötig).

### 2. Server-Actions — `src/app/werkstatt/.../actions.ts`
- **`extrahiereKvaOcr({ fileUrl, contentType })` → `{ ok; data: KvaOcrResult }`** — lädt den hochgeladenen KVA per URL, ruft den Extraktor, gibt die Felder zurück (für den Review-Screen). Auth-Gate: Rolle `werkstatt`.
- **`erstelleWerkstattLeadAusKva(bestätigteDaten)` → `{ ok; token; leadId }`** — schreibt die gfa **direkt** (admin client) mit den bestätigten KVA-Feldern + `werkstatt_id` (aus dem eingeloggten Werkstatt-Profil) + `kostenvoranschlag_netto/brutto` + `ocr_rohdaten`; Besichtigungsort-Default = **Werkstatt-Adresse** (Auto steht dort); dann `issueCanonicalFlowLinkForAnfrage(gfa.id, { send: telefonVorhanden && perWhatsApp })` → Token. Hängt den KVA als Dokument an den Lead (Storage-Reuse). **Schlanke, eigene gfa-Anlage** statt `erstelleGutachterFinderAnfrage` — voller Feldzugriff, ohne die GF-spezifischen Side-Effects („SV anrufen"-Task, GF-Team-WA, GA4-`generate_lead`).
- **Identität best-effort:** fehlt Name/E-Mail (OCR/Werkstatt liefern nichts), werden sichere Platzhalter gesetzt; der Kunde vervollständigt im `/flow`. Telefon **optional** (Entscheidung): ohne Telefon nur Tab/QR-Übergabe, kein WA.

### 3. Portal-Seite — `src/app/werkstatt/.../page.tsx` „Neuer Kunde aus Kostenvoranschlag"
Ein 3-Schritt-Client-Flow (eine Route, Client-State):
1. **Upload** — Drag/Drop PDF/Bild → Storage (werkstatt-scoped Pfad) → `fileUrl`.
2. **OCR-Review** — `extrahiereKvaOcr` → erkannte Felder **editierbar** (Fahrzeug, KVA-Betrag, Name/Anschrift, Telefon optional); Werkstatt bestätigt/korrigiert.
3. **Übergabe** — `erstelleWerkstattLeadAusKva` → Token. Screen mit: (a) **„Auf diesem Gerät öffnen"** → `/flow/[token]` im neuen Tab, (b) **QR** des Links (Reuse vorhandener QR-Util im Portal-Promo), (c) optional **„Per WhatsApp senden"** (falls Telefon).

Komponenten aus dem verbindlichen Set (`primitives/*`, `shared/*`); Portal-Shell wiederverwenden (Werkstatt-Portal existiert).

### 4. `/flow/[token]` — unverändert
Kunde sieht vorausgefüllte Daten → Termin buchen → Beauftragung (SA/Vollmacht) unterschreiben → fertig.

## End-to-End-Datenfluss

```
Werkstatt (Rolle werkstatt) → /werkstatt „KVA-Upload"
  → [Upload PDF/Bild] → Storage-URL
  → extrahiereKvaOcr(url) → KvaOcrResult        (Claude Vision, document-URL)
  → [Review: editierbar, + Telefon optional]
  → erstelleWerkstattLeadAusKva(bestätigt)
       → gfa.insert(admin): KVA-Felder + werkstatt_id + kostenvoranschlag_* + ocr_rohdaten,
         besichtigungsort = Werkstatt-Adresse; KVA-Doc an Lead
       → issueCanonicalFlowLinkForAnfrage(gfa.id, {send}) → lead (werkstatt_id+kostenvoranschlag carry) + token
  → Übergabe-Screen: Tab (/flow/token) | QR | optional WhatsApp
→ Kunde im /flow/[token]: vorausgefüllt → Termin + Beauftragung-Signatur → abgeschlossen
→ (später) Lead→Claim: werkstatt_id + kostenvoranschlag → claim/repairs; 150€-Provision via bestehendem Trigger
```

## Fehlerbehandlung

- Server-Actions: Result-Object `{ ok; … }` (AGENTS.md), kein `throw`.
- OCR-Fehler / unlesbarer KVA: Action liefert `{ ok:false, error }`; der Review-Screen zeigt **leere, manuell ausfüllbare** Felder (Werkstatt kann trotzdem manuell anlegen — OCR ist Komfort, kein Blocker).
- Niedrige OCR-Qualität: kein Auto-Submit — der Review-Schritt fängt Fehler ab (Aaron-Entscheidung).
- Nicht-kritische Sub-Ops (Doc-Attach, WA-Versand): try/catch + log, brechen die Lead-Anlage nicht.
- `revalidatePath` für die Werkstatt-Portal-Routen nach Anlage.

## Auth / RLS

- Portal-Seite + Actions: Gate auf Rolle `werkstatt`; `werkstatt_id` = das Profil des eingeloggten Users (nicht aus dem Client). gfa-Insert via **service-role** (admin) → keine anon-RLS-Stolperfalle.
- Storage-Upload: werkstatt-scoped Pfad/Bucket; nur eigene Uploads lesbar (RLS/Policy beim Plan verifizieren).

## Tests

- **vitest (PURE):** KVA-OCR-Parsing — JSON-Extraktion + Komma-Normalisierung + Feld-Mapping (Fixtures aus Beispiel-JSON-Antworten; kein echter API-Call). Mehrere KVA-Layouts (Audatex/DAT/Freitext).
- Server-Actions: getypte Result-Shapes; gfa-Insert-Felder (KVA-Betrag-Trennung) per Smoke gegen die DB.
- `tsc --noEmit` + voller `npm run build` (Route + Server-Action) + die vier Ratchets (component-set/token-audit/knip/termin-contract).
- Manuell nach Deploy: echter KVA-Upload → genau 1 gfa+lead mit `werkstatt_id` + `kostenvoranschlag_*`, korrekt im `/flow` vorausgefüllt, Übergabe Tab/QR/WA.

## Audit-Vorausschau (7 Punkte)

1. **Build:** voller `npm run build` (neue Route + Server-Actions).
2. **UI-Erreichbarkeit:** neuer Einstieg im `/werkstatt`-Portal (Nav/Button „Neuer Kunde aus KVA"), nur Rolle `werkstatt`.
3. **Redundanz:** OCR spiegelt `gutachten-ocr.ts`-Muster (kein Fork); FlowLink/Flow/Signatur/QR/Storage wiederverwendet.
4. **Dead-Code:** keine Altpfade.
5. **Spec-Treue:** Upload → OCR → Review → vorausgefüllter FlowLink → Tab/QR/WA; KVA-Betrag getrennt.
6. **Inkonsistenz:** ok-Shape, `revalidatePath`, Umlaute in UI-Strings, DB-Spalten verifiziert; `kostenvoranschlag` ≠ `schadens_hoehe`.
7. **Regression:** `issueCanonicalFlowLinkForAnfrage` nur **additiv** (kostenvoranschlag-carry); `/flow` + `erstelleGutachterFinderAnfrage` (GF-Pfad) unberührt.

## Offene Punkte / Annahmen (korrigierbar)

- Besichtigungsort = Werkstatt-Adresse (im `/flow` editierbar).
- KVA-Doc landet als Dokument am Lead (Storage-Reuse `leads/{id}/kostenvoranschlag_*`).
- OCR-Modell = `AI_MODELS.ocr` (wie Gutachten).
- gfa-Identität best-effort + Platzhalter; Kunde vervollständigt im `/flow`.
- `repairs.kostenvoranschlag`-Carry zur Convert-Zeit (repairs-Lifecycle in Plan-Phase verifizieren).

## Rollout

- Branch `kitta/werkstatt-kva-upload` → PR gegen `staging`. Migration via Supabase-Plugin (Regel 2: apply_migration → list_migrations → File benennen → execute_sql verify; Types-Regen aufschiebbar).
- Verifikation: KVA-Upload im Werkstatt-Portal → DB-Check (1 gfa+lead, `werkstatt_id` + `kostenvoranschlag_*`, ocr_rohdaten) → `/flow/[token]` vorausgefüllt → Übergabe-Modi.
