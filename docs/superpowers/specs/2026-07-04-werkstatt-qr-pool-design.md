# Werkstatt-QR-Pool — Design

> Admins im Vertrieb haben einen Pool vorgedruckter, universeller QR-Codes physisch dabei. Bei der Werkstatt-Registrierung wird ein Pool-QR der Werkstatt zugewiesen (statt pro Werkstatt einen zu generieren). Vertrieb kann vor Ort registrieren + sofort einen funktionierenden QR-Sticker übergeben.

**Datum:** 2026-07-04 · **Session:** cec48090 · **Branch:** `kitta/werkstatt-qr-pool` (off `staging`)

---

## 1. Ziel & Abgrenzung

**Heute:** `werkstattStartUrl(werkstatt.id)` → `/start/werkstatt/<werkstatt_id>`; der QR wird on-the-fly aus der werkstatt_id-URL gerendert (`/werkstatt/promo`). Kein Stored-Token.

**Neu (additiv, altes Modell bleibt):** Ein **Pool** vorgedruckter QR-Codes, jeder mit einem eindeutigen **Token** (`/start/werkstatt-qr/<token>`). Bei der Registrierung wird ein Pool-Token einer Werkstatt **zugewiesen**. Der Kunden-Scan des Pool-QR löst über den Token die zugewiesene Werkstatt auf → delegiert an die bestehende Inbound-Attribution.

**In Scope:**
1. `werkstatt_qr_pool`-Tabelle + RLS (admin-only).
2. Admin-Batch-Generierung (N Tokens) + druckbare QR-Sheet-Seite.
3. Zuweisung: In-App-Scanner (`BarcodeDetector`) + manueller Token-Fallback — **bei Neuanlage (`createWerkstatt`) UND für Bestands-Werkstätten** (separate Aktion).
4. Inbound-Route `/start/werkstatt-qr/[token]` → Pool-Lookup → Delegation an die bestehende Werkstatt-Attribution.

**Out of Scope (Follow-up):**
- Universelle iOS/Firefox-Kamera-Scan-Lib (MVP: `BarcodeDetector` nativ wo verfügbar, sonst manueller Token-Fallback — beides erfüllt, iOS-Kamera später).
- Migration bestehender Werkstätten aufs Pool-Modell (der on-the-fly-Promo-QR bleibt parallel gültig).
- Nachverfolgung Scan-Statistiken je Pool-Code.

---

## 2. Datenmodell (1 Migration — Plugin)

```sql
CREATE TABLE public.werkstatt_qr_pool (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token           text NOT NULL UNIQUE,          -- im QR + human-readable darunter (z.B. 'WQR-7F3K9M')
  werkstatt_id    uuid REFERENCES public.werkstaetten(id) ON DELETE SET NULL,  -- NULL bis zugewiesen
  status          text NOT NULL DEFAULT 'frei'
                    CHECK (status IN ('frei','zugewiesen','gesperrt')),
  charge          text,                           -- Druck-Charge/Batch-Label (optional)
  zugewiesen_am   timestamptz,
  zugewiesen_von  uuid,                           -- Admin-user_id
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid
);
CREATE INDEX werkstatt_qr_pool_werkstatt_id_idx ON public.werkstatt_qr_pool(werkstatt_id);
CREATE INDEX werkstatt_qr_pool_status_idx ON public.werkstatt_qr_pool(status);

ALTER TABLE public.werkstatt_qr_pool ENABLE ROW LEVEL SECURITY;
-- Admin-only: Pool-Verwaltung ist rein intern. Die Inbound-Resolution laeuft server-seitig
-- (Service-Client), NICHT ueber Client-RLS.
CREATE POLICY werkstatt_qr_pool_admin_all ON public.werkstatt_qr_pool
  FOR ALL TO authenticated
  USING ( is_staff() ) WITH CHECK ( is_staff() );
```

- **`token`**: kurz + eindeutig + druckbar (Base32-Crockford ohne verwechselbare Zeichen, z.B. `WQR-` + 8 Zeichen). Serverseitig generiert (crypto-random), Kollision per UNIQUE + Retry.
- **Kein Kunde-/Werkstatt-RLS-Zugriff** — die Verwaltung ist admin-only; die Inbound-Auflösung nutzt den Service-Client (kein Token-Enumeration-Risiko über RLS).

---

## 3. Batch-Generierung (Admin)

- **Action** `generateQrPoolBatch(anzahl: number, charge?: string): { ok: true; tokens: string[] } | { ok: false; error }` — `requireAdmin`; erzeugt N Tokens (crypto-random, UNIQUE), Insert `status='frei'`. Limit (z.B. ≤ 200/Batch).
- **Druck-Sheet:** eine Admin-Seite `/admin/werkstaetten/qr-pool` — listet freie/zugewiesene Codes + „Neue Charge erzeugen" + eine **Druckansicht** (`/admin/werkstaetten/qr-pool/drucken?charge=…`), die je Token einen QR (`generateQrCodeSvg('/start/werkstatt-qr/<token>')`) + den lesbaren Token rendert, im Print-Grid (CSS `@media print`). Der Admin druckt → Sticker.

---

## 4. Zuweisung (Scanner + manuell, Neuanlage + Bestand)

**Scanner-Komponente** `PoolQrScanner` (`'use client'`, wiederverwendbar):
- Versucht `BarcodeDetector` (`new BarcodeDetector({ formats: ['qr_code'] })` auf einem `<video>`-Stream via `getUserMedia`). Bei Erkennung: extrahiert den Token aus der dekodierten URL (`.../start/werkstatt-qr/<token>` → `<token>`) → `onToken(token)`.
- **Fallback (immer sichtbar):** ein Text-Input „Code manuell eingeben" (`WQR-…`) + Bestätigen → `onToken(token)`. Greift automatisch, wenn `BarcodeDetector` fehlt (iOS/Firefox) oder keine Kamera-Permission.
- Kein neues NPM-Package (MVP): nur die native `BarcodeDetector`-API + manueller Fallback.

**Zuweis-Action** `weiseQrPoolCodeZu(werkstattId: string, token: string): { ok: boolean; error? }` — `requireAdmin`; validiert: Token existiert + `status='frei'` (sonst „schon vergeben/gesperrt/unbekannt"); setzt `werkstatt_id`, `status='zugewiesen'`, `zugewiesen_am/_von`. `revalidatePath`.

**Einstiegspunkte:**
- **Neuanlage:** im `createWerkstatt`-Dialog (`WerkstaettenClient.tsx`) ein optionaler „QR-Code zuweisen"-Schritt (Scanner/Input) — nach erfolgreichem Create wird der Token der neuen `werkstattId` zugewiesen (die Action liefert die `werkstattId` bereits zurück). Rein additiv.
- **Bestand:** in der Werkstatt-Tabelle je Zeile ein „QR zuweisen"-Button → Modal mit `PoolQrScanner` → `weiseQrPoolCodeZu(w.id, token)`.

---

## 5. Inbound-Resolution

**Neue Route** `src/app/start/werkstatt-qr/[token]/page.tsx` (server, `force-dynamic`):
1. Token aus dem Pfad → `werkstatt_qr_pool` (Service-Client) lesen.
2. `status='zugewiesen'` + `werkstatt_id` gesetzt → **Delegation** an die bestehende Werkstatt-Inbound-Logik (dieselbe wie `/start/werkstatt/[werkstattId]`): entweder redirect auf `/start/werkstatt/<werkstatt_id>`, oder die geteilte Attribution-Funktion direkt aufrufen (Plan prüft, wie `/start/werkstatt/[werkstattId]/page.tsx` die Attribution macht → gemeinsame Funktion extrahieren oder redirecten).
3. `status='frei'`/`gesperrt` / Token unbekannt → freundliche „Dieser QR-Code ist noch nicht aktiviert."-Seite (kein 500).

**Backward-compat:** `/start/werkstatt/<werkstatt_id>` + der Promo-QR bleiben unverändert gültig.

---

## 6. Koordination

- `createWerkstatt` + `WerkstaettenClient.tsx` (`src/app/admin/werkstaetten/`) — SP1/Login-Mail haben sie schon additiv angefasst; QR fasst sie erneut **additiv** an (optionaler Zuweis-Schritt + Bestands-Button). Atomar committen.
- `generateQrCodeSvg` (`@/lib/kanzlei/qr-code`) + `QrCodeDownloadButtons` read-only reuse.
- Neue Route `/start/werkstatt-qr/*` — greenfield, keine Kollision.

---

## 7. Testing

- **`generateQrPoolBatch`**: Nicht-Admin → ok:false; Admin → N Tokens, alle UNIQUE + `status='frei'`. Limit greift.
- **`weiseQrPoolCodeZu`**: unbekannter/vergebener/gesperrter Token → ok:false (kein Insert); freier Token → zugewiesen. Nicht-Admin → ok:false.
- **Token-Generator** (rein): Format `WQR-` + Länge, kein verwechselbares Zeichen.
- **Inbound-Resolution**: zugewiesener Token → Delegation/Redirect auf die Werkstatt; freier/unbekannter → „nicht aktiviert"-Seite (kein Throw).
- **Prod (READ, nach Deploy):** Tabelle + RLS; ein zugewiesener Token löst zur Werkstatt auf; `BarcodeDetector`-Fallback auf manuell greift (manuelles Smoke).

---

## 8. Definition of Done

- [ ] `werkstatt_qr_pool` + RLS (admin-only) prod-live.
- [ ] Batch-Generierung + Druckansicht.
- [ ] `PoolQrScanner` (BarcodeDetector + manueller Fallback) + `weiseQrPoolCodeZu` (Neuanlage + Bestand).
- [ ] Inbound-Route `/start/werkstatt-qr/[token]` → Delegation; „nicht aktiviert"-Fallback.
- [ ] Backward-compat (alter Pfad + Promo-QR unverändert).
- [ ] vitest grün, tsc 0, `npm run build` (8 GB) grün, 3 Ratchets 0-neu, 7-Punkte-Audit.
