# i18n Phase 3 — Upload & Signatur Route Mapping Worksheet

**Date:** 2026-05-26
**Scope:** 3 token-only routes that receive non-German Geschaedigte but have no i18n yet.
**Pattern reference:** `src/app/flow/[token]/page.tsx` (P1/P2) — scoped `NextIntlClientProvider` + `resolveFlowLocale` + `loadMessages`.
**Proposed namespaces:** `upload.signatur.*`, `upload.zb1.*`, `upload.dokumente.*`

---

## Route 1 — `/flow/signatur/[token]`

### Files
- `src/app/flow/signatur/[token]/page.tsx` (10 lines — pure passthrough, NO server-side DB query)
- `src/app/flow/signatur/[token]/SignaturPage.tsx` (298 lines client component)

### Locale-resolution finding — CRITICAL BLOCKER

The `page.tsx` is a trivial wrapper that receives `params.token` and immediately renders `<SignaturPage fallId={token} />`. **There is no DB query in the server component at all.** The `token` parameter is actually a `fallId` (a row from `faelle`), not a `flow_links` token.

The action `uploadFallSignatur` confirms this: it calls `.from('faelle').select('id').eq('id', fallId)`. The action `signaturClaimsWrite` goes `faelle → claim_id → claims`.

**`sprache` is NOT reachable** from this route without adding a server-side query. To add locale resolution for P3, the `page.tsx` must be converted to an `async` server component that does:

```ts
// Needed addition — two options:
// Option A: faelle → lead_id → leads.sprache (one extra join)
const { data: fall } = await db
  .from('faelle')
  .select('lead_id, leads!faelle_lead_id_fkey(sprache)')
  .eq('id', fallId)
  .maybeSingle()
const sprache = (fall?.leads as { sprache: string | null } | null)?.sprache ?? null
const fallLocale = resolveFlowLocale(null, sprache)

// Option B: claims → leads.sprache (if claim_id is more canonical)
// Option A is simpler since faelle.lead_id is a direct FK.
```

There is **no `flow_links` token** in this route — the `fallId` is a Supabase UUID for `faelle`. `resolveFlowLocale(null, leadSprache)` is the right call (no `flowSprache` source exists here).

### NextIntlClientProvider / dir
None. The component is a bare `'use client'` with no i18n infrastructure.

### Legal-module content
**YES — significant.** `SignaturPage.tsx` contains two inline legal text constants:
- `ABTRETUNGSTEXT` (~10 lines, hardcoded German legal prose)
- `VOLLMACHTTEXT` (~12 lines, hardcoded German legal prose)

These are rendered verbatim in `<pre>` blocks as the main content of each signature step. This is analogous to the `legalDocs` / `LegalDocPopover` content that was **out of scope in P2**. Recommend the same ruling for P3: **exclude ABTRETUNGSTEXT and VOLLMACHTTEXT from translation**. They are legal contracts — translation would require legal sign-off, not just a translator. A translator's note / header above the text ("The following document is in German — please ask your contact for a translation if needed") could be a separate i18n string.

### User-visible strings

**`SignaturPage.tsx` (client component, ~22 UI strings)**

| German string | Key | Note |
|---|---|---|
| `Abtretungserklärung` | `upload.signatur.step1Title` | Step 1 heading, also passed as `title` prop |
| `Vollmacht & Anwaltsmandat` | `upload.signatur.step2Title` | Step 2 heading |
| `Weiter zur Vollmacht →` | `upload.signatur.nextButton` | Button label step 1 |
| `Unterschriften absenden` | `upload.signatur.submitButton` | Button label step 2 |
| `Wird übermittelt …` | `upload.signatur.submitting` | Inline submitting state |
| `Zurück` | `upload.signatur.backButton` | Back button label |
| `Ihre Unterschrift` | `upload.signatur.canvasLabel` | Label above signature pad |
| `Hier unterschreiben` | `upload.signatur.canvasPlaceholder` | Placeholder overlay on empty pad |
| `Löschen` | `upload.signatur.clearButton` | Clear signature button |
| `{step} / 2` | `upload.signatur.stepProgress` | ICU: `{step} / 2` — step counter (thin-space thinsp used) |
| `Vielen Dank!` | `upload.signatur.successTitle` | SuccessScreen heading |
| `Wir melden uns innerhalb von 24 Stunden bei dir. Deine Dokumente wurden sicher übermittelt.` | `upload.signatur.successBody` | SuccessScreen body |
| `Fehler beim Hochladen` | `upload.signatur.errorFallback` | Catch-block fallback error string |
| `ABTRETUNGSTEXT` (const) | — | OUT OF SCOPE — legal contract text |
| `VOLLMACHTTEXT` (const) | — | OUT OF SCOPE — legal contract text |

**`page.tsx` (server component):** No user-visible strings — pure passthrough.

**Rough string count:** ~13 translatable strings + 2 legal constants excluded.

---

## Route 2 — `/upload/zb1/[token]`

### Files
- `src/app/upload/zb1/[token]/page.tsx` (45 lines server component)
- `src/app/upload/zb1/[token]/Zb1UploadClient.tsx` (288 lines client component)

### Locale-resolution finding

The server component calls `getZb1TokenStatus(token)` which does:

```ts
await db
  .from('leads')
  .select('id, vorname, zb1_status, zb1_token_expires_at')
  .eq('zb1_token', token)
  .maybeSingle()
```

**`sprache` is NOT currently selected** — but the token resolves directly to a `leads` row. The fix is a one-field addition to the existing select:

```ts
// In getZb1TokenStatus (actions.ts) — add sprache to select:
.select('id, vorname, zb1_status, zb1_token_expires_at, sprache')
// And return it: { ok: true, vorname: lead.vorname, sprache: lead.sprache }
```

Then in `page.tsx`:

```tsx
const flowLocale = resolveFlowLocale(null, status.sprache ?? null)
const flowMessages = await loadMessages(flowLocale)
// Wrap Zb1UploadClient in:
<NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
  <Zb1UploadClient ... />
</NextIntlClientProvider>
// + dir on the outer div
```

**No `flow_links` token here** — `zb1_token` lives directly on `leads`. `resolveFlowLocale(null, leads.sprache)` is correct.

The error states (expired, already_uploaded, invalid) are **server-rendered** in `page.tsx` — they need to either be translated server-side (pass `flowLocale` + use a lookup map) or moved into the client component. They are currently hardcoded German strings in JSX inside the server component.

### NextIntlClientProvider / dir
None.

### Legal-module content
None.

### User-visible strings

**`page.tsx` (server component — error states, ~6 strings)**

| German string | Key | Note |
|---|---|---|
| `Link abgelaufen` | `upload.zb1.errorExpiredTitle` | Server-rendered — needs special handling (see below) |
| `Dieser Upload-Link ist nicht mehr gültig. Bitte kontaktieren Sie Ihren Ansprechpartner für einen neuen Link.` | `upload.zb1.errorExpiredBody` | Server-rendered |
| `Foto bereits empfangen` | `upload.zb1.errorAlreadyTitle` | Server-rendered |
| `Wir haben Ihren Fahrzeugschein bereits erhalten. Falls Sie ein neues Foto schicken möchten, kontaktieren Sie bitte Ihren Ansprechpartner.` | `upload.zb1.errorAlreadyBody` | Server-rendered |
| `Link nicht gültig` | `upload.zb1.errorInvalidTitle` | Server-rendered |
| `Dieser Upload-Link ist ungültig. Bitte prüfen Sie die URL oder kontaktieren Sie Ihren Ansprechpartner.` | `upload.zb1.errorInvalidBody` | Server-rendered |

Note: Server-rendered strings in `page.tsx` cannot use `useTranslations`. For P3 these can be translated via a server-side locale lookup map (similar to how Flow P1 handles the expired/abgeschlossen states in `flow/[token]/page.tsx` — those are also hardcoded there and were not extracted in P2).

**`Zb1UploadClient.tsx` (client component, ~26 strings)**

| German string | Key | Note |
|---|---|---|
| `Fahrzeugschein-Upload` | `upload.zb1.pageSubtitle` | Header subtitle |
| `Hallo {vorname}!` / `Hallo und willkommen!` | `upload.zb1.greeting` | ICU: `{vorname, select, empty{und willkommen} other{Hallo {vorname}}}` or two keys |
| `Bitte fotografieren Sie Ihren **Fahrzeugschein (Zulassungsbescheinigung Teil I, Vorderseite)**. Wir lesen die Daten automatisch aus.` | `upload.zb1.instructions` | Contains `<strong>` — use rich-text or split |
| `Tipps für gute Lesbarkeit:` | `upload.zb1.tipsTitle` | |
| `Alle 4 Ecken des Dokuments sichtbar` | `upload.zb1.tip1` | |
| `Gutes Licht — keine Schatten` | `upload.zb1.tip2` | |
| `Scharfes Foto — nicht verwackelt` | `upload.zb1.tip3` | |
| `Kein Spiegel-Reflex auf der Folie` | `upload.zb1.tip4` | |
| `Jetzt fotografieren` | `upload.zb1.cameraButton` | |
| `Aus Galerie wählen` | `upload.zb1.galleryButton` | |
| `Bitte ein Bild wählen (JPG/PNG)` | `upload.zb1.errorNotImage` | Error shown below buttons |
| `Foto prüfen` | `upload.zb1.previewTitle` | |
| `Sind alle 4 Ecken gut zu sehen?` | `upload.zb1.previewSubtitle` | |
| `Fahrzeugschein-Vorschau` | `upload.zb1.previewAlt` | img alt text |
| `Nochmal` | `upload.zb1.retakeButton` | |
| `Verwenden` | `upload.zb1.useButton` | |
| `Wird hochgeladen ...` | `upload.zb1.uploadingTitle` | |
| `Daten werden ausgelesen — bitte warten` | `upload.zb1.uploadingSubtitle` | |
| `Vielen Dank!` | `upload.zb1.successTitle` | |
| `Ihr Fahrzeugschein wurde empfangen. Ihr Ansprechpartner meldet sich in Kürze.` | `upload.zb1.successBody` | |
| `Wir haben erkannt:` | `upload.zb1.ocrResultTitle` | OCR extracted section |
| `Kennzeichen: {value}` | `upload.zb1.ocrKennzeichen` | ICU |
| `Fahrzeug: {value}` | `upload.zb1.ocrFahrzeug` | ICU |
| `Halter: {value}` | `upload.zb1.ocrHalter` | ICU |
| `Sie können diese Seite jetzt schließen.` | `upload.zb1.closeHint` | |
| `Hat nicht geklappt` | `upload.zb1.errorTitle` | |
| `Daten konnten nicht ausgelesen werden.` | `upload.zb1.errorBodyFallback` | Fallback when no errorMsg |
| `Tipp: gutes Licht, alle 4 Ecken sichtbar, scharf — bitte erneut versuchen.` | `upload.zb1.errorTip` | |
| `Erneut versuchen` | `upload.zb1.retryButton` | |
| `Ihre Daten werden verschlüsselt übertragen und nur für die Bearbeitung Ihres Schadens verwendet.` | `upload.zb1.privacyNote` | Footer |

**Rough string count:** ~6 server-rendered + ~26 client strings = ~32 total.

---

## Route 3 — `/upload/dokumente/[token]`

### Files
- `src/app/upload/dokumente/[token]/page.tsx` (65 lines server component)
- `src/app/upload/dokumente/[token]/MultiSlotUploadClient.tsx` (482 lines client component — the largest of the three)

### Locale-resolution finding

The server component calls `getDokumenteAnfrageStatus(token)` which does:

```ts
await db
  .from('dokument_upload_anfragen')
  .select('id, lead_id, slots, status, expires_at')
  .eq('token', token)
  .maybeSingle()
// then:
await db.from('leads').select('vorname').eq('id', anfrage.lead_id).maybeSingle()
```

**`sprache` is NOT currently selected** — but the route already queries `leads` for `vorname`. The fix is minimal: add `sprache` to the existing leads select in `getDokumenteAnfrageStatus`:

```ts
// In getDokumenteAnfrageStatus (actions.ts):
await db.from('leads').select('vorname, sprache').eq('id', anfrage.lead_id).maybeSingle()
// Return sprache alongside vorname in DokumenteTokenStatus
```

Then in `page.tsx` (analogous to zb1):

```tsx
const flowLocale = resolveFlowLocale(null, status.sprache ?? null)
const flowMessages = await loadMessages(flowLocale)
// Wrap MultiSlotUploadClient in NextIntlClientProvider
// + dir on outer div
```

Token table: `dokument_upload_anfragen.token` → `lead_id` → `leads.sprache`. No `flow_links` involved.

The error states in `page.tsx` (`already_complete`, `expired`, `invalid`) are server-rendered — same note as zb1 applies.

### NextIntlClientProvider / dir
None.

### Legal-module content
None.

### User-visible strings

**`page.tsx` (server component — error states, ~5 strings)**

| German string | Key | Note |
|---|---|---|
| `Vielen Dank!` | `upload.dokumente.alreadyCompleteTitle` | `already_complete` state heading (no body — design is minimal) |
| `Link abgelaufen` | `upload.dokumente.errorExpiredTitle` | |
| `Dieser Upload-Link ist nicht mehr gültig. Bitte kontaktieren Sie Ihren Ansprechpartner für einen neuen Link.` | `upload.dokumente.errorExpiredBody` | Shared with zb1 — consider a shared `upload.common.*` namespace |
| `Link nicht gültig` | `upload.dokumente.errorInvalidTitle` | |
| `Dieser Upload-Link ist ungültig. Bitte prüfen Sie die URL oder kontaktieren Sie Ihren Ansprechpartner.` | `upload.dokumente.errorInvalidBody` | |

**`MultiSlotUploadClient.tsx` (client component, ~40 strings including SLOT_HINTS)**

| German string | Key | Note |
|---|---|---|
| `Dokumenten-Upload` | `upload.dokumente.pageSubtitle` | Header subtitle |
| `Hallo {vorname}!` / `Hallo und willkommen!` | `upload.dokumente.greeting` | Same ICU pattern as zb1 |
| `Bitte laden Sie die folgenden Dokumente hoch. Sie können das einzeln erledigen — jedes Dokument wird sofort gespeichert.` | `upload.dokumente.instructions` | |
| `{uploaded} von {total} hochgeladen` | `upload.dokumente.progressLabel` | ICU with two numeric vars |
| `{label}` (slot label, dynamic) | — | Comes from server via `slots[].label` — needs server-side i18n or a fixed lookup |
| `Empfangen — danke!` | `upload.dokumente.slotDoneLabel` | Shown on completed slot |
| `Fotografieren` | `upload.dokumente.cameraButton` | |
| `Galerie` | `upload.dokumente.galleryButton` | |
| `Bitte ein Bild wählen (JPG/PNG)` | `upload.dokumente.errorNotImage` | |
| `Nochmal` | `upload.dokumente.retakeButton` | |
| `Verwenden` | `upload.dokumente.useButton` | |
| `Wird hochgeladen ...` | `upload.dokumente.uploadingTitle` | |
| `Daten werden ausgelesen — bitte warten` | `upload.dokumente.ocrWait` | OCR slot only |
| `Empfangen!` | `upload.dokumente.slotSuccessLabel` | |
| `Kennzeichen: {value}` | `upload.dokumente.ocrKennzeichen` | Same as zb1 — candidate for `upload.common.ocrKennzeichen` |
| `Fahrzeug: {value}` | `upload.dokumente.ocrFahrzeug` | Same |
| `Halter: {value}` | `upload.dokumente.ocrHalter` | Same |
| `Weiteres Foto hochladen` | `upload.dokumente.addMorePhotos` | unfallfotos slot only |
| `Upload fehlgeschlagen` | `upload.dokumente.slotErrorFallback` | |
| `Erneut` | `upload.dokumente.retryButton` | |
| `Vielen Dank{vorname}!` | `upload.dokumente.allDoneTitle` | ICU: `Vielen Dank{vorname, select, empty{} other{, {vorname}}}!` |
| `Alle Dokumente sind angekommen. Ihr Ansprechpartner meldet sich in Kürze.` | `upload.dokumente.allDoneBody` | |
| `Sie können diese Seite jetzt schließen.` | `upload.dokumente.closeHint` | Shared with zb1 → `upload.common.closeHint` |
| `Ihre Daten werden verschlüsselt übertragen und nur für die Bearbeitung Ihres Schadens verwendet.` | `upload.dokumente.privacyNote` | Shared with zb1 → `upload.common.privacyNote` |

**`SLOT_HINTS` record (~9 hint strings):**

| German string | Key | Note |
|---|---|---|
| `Zulassungsbescheinigung Teil I (Vorderseite). Alle 4 Ecken sichtbar, gutes Licht, scharf.` | `upload.dokumente.hints.fahrzeugschein` | |
| `Der Zettel, den Sie nach dem Unfall von der Polizei bekommen haben.` | `upload.dokumente.hints.polizeibericht` | |
| `Fotos vom Fahrzeugschaden — mehrere Ansichten willkommen (Front, Heck, Seiten, Detail)...` | `upload.dokumente.hints.unfallfotos` | |
| `Beliebiges Dokument zum Fall — z. B. Kaufvertrag, Rechnung, Foto.` | `upload.dokumente.hints.sonstiges` | |
| `Fotos des beschädigten Gegenstands — mehrere Ansichten, gutes Licht.` | `upload.dokumente.hints.sachschaden_foto` | |
| `Reparaturrechnung oder Kostenvoranschlag für den beschädigten Gegenstand.` | `upload.dokumente.hints.sachschaden_rechnung` | |
| `Ärztliche Bescheinigung über Ihre Verletzungen — Vorder- und Rückseite falls vorhanden.` | `upload.dokumente.hints.aerztliches_attest` | |
| `Ärztlicher Befundbericht oder Entlassungsbericht — alle Seiten hochladen.` | `upload.dokumente.hints.diagnosebericht` | |
| `Schriftliche Zeugenaussage oder Visitenkarte / Notizzettel mit Kontaktdaten.` | `upload.dokumente.hints.zeugenaussage` | |

**Slot labels** (`slots[].label`) are stored in `dokument_upload_anfragen.slots` JSONB and set server-side when the Dispatcher creates the request. These are already German strings baked into the DB row. Translating them requires either (a) storing a slot_id and doing client-side label lookup from translations, or (b) storing them as slot_id keys and resolving the label in the client. The current code passes `slot.label` from the server — this is a **non-trivial i18n concern** but scoped to P3+ since slot labels could be mapped from `slot_id` (the typed enum already exists).

**Rough string count:** ~5 server-rendered + ~24 client UI strings + 9 SLOT_HINTS = ~38 total.

---

## Shared / Common strings (candidate `upload.common.*` namespace)

These strings appear identically in both `zb1` and `dokumente`:

| German string | Candidate key |
|---|---|
| `Sie können diese Seite jetzt schließen.` | `upload.common.closeHint` |
| `Ihre Daten werden verschlüsselt übertragen und nur für die Bearbeitung Ihres Schadens verwendet.` | `upload.common.privacyNote` |
| `Kennzeichen: {value}` | `upload.common.ocrKennzeichen` |
| `Fahrzeug: {value}` | `upload.common.ocrFahrzeug` |
| `Halter: {value}` | `upload.common.ocrHalter` |
| `Nochmal` | `upload.common.retakeButton` |
| `Verwenden` | `upload.common.useButton` |

---

## Summary table

| Route | Token table | `sprache` source | sprache in select? | Provider exists | Server strings | Client strings | Legal content |
|---|---|---|---|---|---|---|---|
| `/flow/signatur/[token]` | `faelle` (fallId, not a link token) | `faelle → leads.sprache` (two-step join) | NOT SELECTED — requires new async server component | No | 0 | ~13 (+ 2 legal consts excluded) | YES — `ABTRETUNGSTEXT` + `VOLLMACHTTEXT` hardcoded (OUT OF SCOPE) |
| `/upload/zb1/[token]` | `leads.zb1_token` | `leads.sprache` | NOT SELECTED — add to `getZb1TokenStatus` select | No | ~6 | ~26 | None |
| `/upload/dokumente/[token]` | `dokument_upload_anfragen.token → leads` | `leads.sprache` | NOT SELECTED — add to `getDokumenteAnfrageStatus` select | No | ~5 | ~33 + 9 hints | None |

---

## P3 implementation notes

1. **Signatur route needs an async server component rewrite** — currently `page.tsx` is a 10-line passthrough with no DB call. It must become `async`, query `faelle.lead_id → leads.sprache`, and wrap `SignaturPage` in `NextIntlClientProvider`. The `SignaturPage` client component itself does not need changes to its data flow.

2. **zb1 + dokumente are one-field additions** — cheapest P3 wins: just add `sprache` to the existing `select` in each `actions.ts` function and add it to the return type. No table join needed.

3. **Server-rendered error states** — all three routes render error screens in the server component (expired/invalid/etc.) before any client component is mounted. These cannot use `useTranslations`. Options:
   - (A) Translate them server-side using a locale-keyed lookup object (simplest, no next-intl dependency)
   - (B) Move error rendering into client components (more work)
   - Recommend (A) for P3.

4. **ABTRETUNGSTEXT / VOLLMACHTTEXT** — out of scope for P3, same ruling as `legalDocs` in P2. Add a translated "this document is in German" notice above the `<pre>` block as a single i18n string if desired.

5. **Slot labels** in `dokument_upload_anfragen.slots[].label` are DB-stored German strings. For P3, recommend translating from `slot_id` on the client side (the typed `SlotId` enum already covers all 9 values). This avoids touching the DB schema.
