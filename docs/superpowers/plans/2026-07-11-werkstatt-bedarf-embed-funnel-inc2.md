# Werkstatt-Bedarf Embed-Foto-Funnel — Inc 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Der öffentliche Embed-Finder lässt den Besucher optional (inline) ein Schadenfoto einbringen → Bedarf abgeleitet (transient, base64) → Werkstatt-Liste qualifiziert (Fit-Chips aus Inc 1). Foto + Bedarf werden erst bei Conversion am Lead persistiert.

**Architecture:** Reuse Inc-1-Engine (`ermittleReparaturbedarf`-Bausteine, `qualifiziereWerkstaetten`, Fit-UI). Foto reist client→server als base64; Klassifizierung transient; Storage nur in `erstelleWerkstattFinderLead`.

**Tech Stack:** Next.js 15, TS, Supabase, vitest, Anthropic Vision.

**Spec:** `docs/superpowers/specs/2026-07-11-werkstatt-bedarf-embed-funnel-inc2-design.md`

## Global Constraints
- Foto NICHT gespeichert bis Conversion (transient base64). Kein Anon-Storage-Bucket.
- Abuse-Guard: max **3** Bilder, max **~5 MB**/Bild, Media-Type ∈ `image/jpeg|png|webp` → sonst früh-return `unbekannt` OHNE Vision-Call.
- Fail-safe Vision: Fehler/leer → `{kategorien:[], confidence:0}`.
- Server-Actions = Result-Objekt; non-kritische Uploads/Persist in try/catch (brechen Lead/Redirect nie).
- `sucheEchteWerkstaetten` ohne `bedarf` = heutiges Verhalten (kein Regress). Embed-Only-Lane.
- Umlaute in UI-Strings. Ratchets 0-neu.
- `Reparaturbedarf`/`Gewerk`/`qualifiziereWerkstaetten` aus `@/lib/werkstatt/bedarf/*` (Inc 1).

## File Structure
- `src/lib/ai/vision/client.ts` — +`buildImageBlocksBase64`.
- `src/lib/werkstatt/bedarf/schadenbild-gewerke.ts` — Refactor zu geteiltem Block-Kern + `klassifiziereSchadenbildBase64`.
- `src/lib/werkstatt/bedarf/embed-foto-guard.ts` (NEU) — `pruefeEmbedFotos` (rein).
- `src/app/embed/werkstatt-finder/actions.ts` — +`klassifiziereSchadenfotoEmbed`; `sucheEchteWerkstaetten`/`sucheWerkstaettenNachOrt` +`bedarf`; `erstelleWerkstattFinderLead` +`fotos`/`bedarf`.
- `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx` — Foto-Zone + Funnel-State.

---

### Task 1: base64-Vision-Block + geteilter Klassifizier-Kern

**Files:** Modify `src/lib/ai/vision/client.ts`, `src/lib/werkstatt/bedarf/schadenbild-gewerke.ts`; Test `.../__tests__/schadenbild-gewerke.test.ts` (erweitern).

**Produces:** `buildImageBlocksBase64`, `klassifiziereSchadenbildBase64(images): Promise<{kategorien: Gewerk[]; confidence: number}>`. `klassifiziereSchadenbild(urls)` bleibt extern unverändert (5 Bestands-Tests bleiben grün).

- [ ] **Step 1: Test** — neue base64-Fälle (Client gemockt): gültiges JSON aus base64-Bild → kategorien+confidence; keine Bilder → `{[],0}`; Client null → `{[],0}`. (Bestehende URL-Tests unangetastet lassen.)
- [ ] **Step 2: RED**.
- [ ] **Step 3: `client.ts`** — hinzufügen:
```ts
export function buildImageBlocksBase64(
  images: readonly { data: string; media_type: string }[],
  limit = 8,
): Anthropic.Messages.ImageBlockParam[] {
  return images.slice(0, limit).map((img) => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.media_type as 'image/jpeg' | 'image/png' | 'image/webp', data: img.data },
  }))
}
```
- [ ] **Step 4: `schadenbild-gewerke.ts` refactor** — den Client+create+parse+fail-safe-Kern in eine interne `klassifiziereAusBlocks(blocks: Anthropic.Messages.ImageBlockParam[]): Promise<{kategorien: Gewerk[]; confidence: number}>` extrahieren (identische Prompt/Parsing/Fail-safe wie heute). `klassifiziereSchadenbild(urls)` → wie bisher, ruft `klassifiziereAusBlocks(buildImageBlocks(urls,8))`. NEU:
```ts
export async function klassifiziereSchadenbildBase64(
  images: { data: string; media_type: string }[],
): Promise<{ kategorien: Gewerk[]; confidence: number }> {
  if (images.length === 0) return { kategorien: [], confidence: 0 }
  return klassifiziereAusBlocks(buildImageBlocksBase64(images, 8))
}
```
(Client-null / Parse-Fehler / leer → `{[],0}` bleibt im Kern.)
- [ ] **Step 5: GREEN** (`npx vitest run src/lib/werkstatt/bedarf/__tests__/schadenbild-gewerke.test.ts`).
- [ ] **Step 6: Commit** `feat(werkstatt-bedarf): base64-Vision-Variante klassifiziereSchadenbildBase64`.

---

### Task 2: Abuse-Guard `pruefeEmbedFotos` (rein)

**Files:** Create `src/lib/werkstatt/bedarf/embed-foto-guard.ts`; Test `__tests__/embed-foto-guard.test.ts`.

**Produces:** `pruefeEmbedFotos(images): { ok: true; images: EmbedFoto[] } | { ok: false }`, Typ `EmbedFoto = { data: string; media_type: string }`, Konstanten `MAX_FOTOS=3`, `MAX_BYTES=5_000_000`, `ERLAUBTE_TYPEN`.

- [ ] **Step 1: Test** — >3 Bilder → nur erste 3; falscher media_type → gefiltert; base64 zu groß (len*0.75 > MAX_BYTES) → gefiltert; alle raus → `{ok:false}`; gültig → `{ok:true, images}`.
- [ ] **Step 2: RED**.
- [ ] **Step 3: Implement**
```ts
export type EmbedFoto = { data: string; media_type: string }
export const MAX_FOTOS = 3
export const MAX_BYTES = 5_000_000
export const ERLAUBTE_TYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const

const bytesFromBase64 = (data: string): number => Math.floor((data.length * 3) / 4)

export function pruefeEmbedFotos(images: EmbedFoto[]): { ok: true; images: EmbedFoto[] } | { ok: false } {
  const gefiltert = (images ?? [])
    .filter((i) => i && typeof i.data === 'string' && (ERLAUBTE_TYPEN as readonly string[]).includes(i.media_type))
    .filter((i) => bytesFromBase64(i.data) <= MAX_BYTES)
    .slice(0, MAX_FOTOS)
  return gefiltert.length > 0 ? { ok: true, images: gefiltert } : { ok: false }
}
```
- [ ] **Step 4: GREEN**. **Step 5: Commit** `feat(werkstatt-bedarf): Embed-Foto-Abuse-Guard`.

---

### Task 3: Action `klassifiziereSchadenfotoEmbed`

**Files:** Modify `src/app/embed/werkstatt-finder/actions.ts`; Test (neu) `__tests__/embed-actions.test.ts`.

**Consumes:** `pruefeEmbedFotos` (T2), `klassifiziereSchadenbildBase64` (T1), `Reparaturbedarf`/`Gewerk` (Inc 1). **Produces:** `klassifiziereSchadenfotoEmbed(images: EmbedFoto[]): Promise<Reparaturbedarf>`.

- [ ] **Step 1: Test** (mock `klassifiziereSchadenbildBase64`): gültige Fotos + KI liefert kategorien → `{kategorien, quelle:'schadenbild', confidence}`; Guard `{ok:false}` (0 gültig) → `{kategorien:[], quelle:'unbekannt', confidence:0}` OHNE KI-Call (assert mock not called); KI leer → unbekannt.
- [ ] **Step 2: RED**. **Step 3:**
```ts
export async function klassifiziereSchadenfotoEmbed(images: EmbedFoto[]): Promise<Reparaturbedarf> {
  const guard = pruefeEmbedFotos(images)
  if (!guard.ok) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  const { kategorien, confidence } = await klassifiziereSchadenbildBase64(guard.images)
  if (kategorien.length === 0) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  return { kategorien, quelle: 'schadenbild', confidence }
}
```
- [ ] **Step 4: GREEN**. **Step 5: Commit** `feat(werkstatt-bedarf): Embed-Foto-Klassifizier-Action (guarded, transient)`.

---

### Task 4: `sucheEchteWerkstaetten`/`sucheWerkstaettenNachOrt` qualifizieren

**Files:** Modify `src/app/embed/werkstatt-finder/actions.ts`; Test erweitern.

**Consumes:** `qualifiziereWerkstaetten` (Inc 1). **Produces:** neue Return-Shapes (Embed-only Caller → Client in T6 angepasst):
- `sucheEchteWerkstaetten(input & { bedarf?: Reparaturbedarf }): Promise<{ werkstaetten: (WerkstattFinderRow & { fit?: Fit })[]; keineSpezialisierte: boolean }>`
- `sucheWerkstaettenNachOrt(query, bedarf?): Promise<{ werkstaetten: ...; center; keineSpezialisierte }>`

- [ ] **Step 1:** Caller prüfen (`grep -rn 'sucheEchteWerkstaetten\|sucheWerkstaettenNachOrt' src/` → nur der Embed-Client). Test: mit `bedarf` (hohe conf) → rows haben `fit`, passt_nicht gefiltert, `keineSpezialisierte` korrekt; ohne `bedarf` → alle rows, `keineSpezialisierte:false`, kein `fit`.
- [ ] **Step 2: RED**. **Step 3:** `findWerkstaetten(...)` wie bisher; wenn `bedarf` gesetzt → `const q = qualifiziereWerkstaetten(rows, bedarf); return { werkstaetten: q.werkstaetten, keineSpezialisierte: q.keineSpezialisierte }`; sonst `{ werkstaetten: rows, keineSpezialisierte: false }`. (Für NachOrt zusätzlich `center` durchreichen.)
- [ ] **Step 4: GREEN** + `npx tsc --noEmit` (Client folgt in T6, Zwischenstand darf im Client rot sein — T4+T6 zusammen grün; wenn getrennt committet: T4-Commit darf Client-Typfehler haben, T6 räumt auf — ODER T4+T6 als eine Task zusammenlegen, Implementer-Entscheidung).
- [ ] **Step 5: Commit** `feat(werkstatt-bedarf): Embed-Suche optional bedarf-qualifiziert`.

---

### Task 5: `erstelleWerkstattFinderLead` — Foto + Bedarf bei Conversion persistieren

**Files:** Modify `src/app/embed/werkstatt-finder/actions.ts`; Test erweitern.

**Consumes:** `getStorageUrl` (`@/lib/storage/url`), `EmbedFoto`, `Reparaturbedarf`. **Produces:** erweiterte Signatur.

- [ ] **Step 1:** `uploadSchadensfotoKunde` (`src/app/kunde/faelle/[id]/schadensfoto-actions.ts`) als Muster lesen (Bucket `fall-dokumente`, `getStorageUrl`, `leads.schadensfoto_urls`-Append). Test (mock sb + storage): nach Lead-Anlage werden Fotos hochgeladen + `leads.schadensfoto_urls` gesetzt + `lead.bedarf_*` gesetzt; Upload-Fehler bricht NICHT den `{ok,token}`-Return.
- [ ] **Step 2: RED**. **Step 3:** `WerkstattFinderLeadPayload` um `fotos?: EmbedFoto[]` + `bedarf?: Reparaturbedarf` erweitern. NACH `createLead(...)` (leadId vorhanden), in try/catch (non-kritisch, VOR dem FlowLink-Return):
  - Fotos: je Foto `Buffer.from(data,'base64')` → `admin.storage.from('fall-dokumente').upload('leads/'+leadId+'/schadensfoto_'+Date.now()+'_'+rand+'.'+ext, buffer, { contentType: media_type })` → `getStorageUrl(admin,'fall-dokumente',path)` → sammeln. KEINE `fall_dokumente`-Row (noch kein Claim/Fall). `admin.from('leads').update({ schadensfoto_urls: urls }).eq('id', leadId)`.
  - Bedarf: `admin.from('leads').update({ bedarf_kategorien: bedarf.kategorien, bedarf_quelle: bedarf.quelle, bedarf_confidence: bedarf.confidence, bedarf_ermittelt_am: new Date().toISOString() }).eq('id', leadId)` (kann mit dem schadensfoto_urls-Update kombiniert werden).
  - `ext` aus media_type (`image/jpeg`→`jpg`, `png`→`png`, `webp`→`webp`).
- [ ] **Step 4: GREEN**. **Step 5: Commit** `feat(werkstatt-bedarf): Embed-Conversion persistiert Foto+Bedarf am Lead`.

---

### Task 6: Embed-Client — Inline-Foto-Zone + Funnel

**Files:** Modify `src/app/embed/werkstatt-finder/WerkstattFinderEmbedClient.tsx`.

**Consumes:** `klassifiziereSchadenfotoEmbed`, neue Such-/Lead-Signaturen. **Produces:** funktionierender Funnel.

- [ ] **Step 1:** Client anpassen:
  - State: `fotos: EmbedFoto[]`, `bedarf: Reparaturbedarf | null`, `klassifiziert: boolean`, `keineSpezialisierte: boolean`.
  - **Foto-Zone** (inline, unter/neben dem Standortfeld): `<input type="file" accept="image/jpeg,image/png,image/webp" capture multiple>` (max 3 im Handler kappen). Dateien → base64 (`FileReader.readAsDataURL` → data-URL splitten in `{media_type, data}`). Nach Upload: `klassifiziereSchadenfotoEmbed(fotos)` → `setBedarf` → Re-Search **mit bedarf** (`sucheEchteWerkstaetten({...loc, bedarf})`). Kurzer Datenschutz-Hinweis („Foto wird nur zur Werkstatt-Zuordnung analysiert, gespeichert erst beim Absenden").
  - Such-Aufrufe (`useEffect` initial + `sucheOrt`) auf die neue `{ werkstaetten, keineSpezialisierte }`-Shape umstellen (mit `bedarf ?? undefined`); `setRows(r.werkstaetten)`, `setKeineSpezialisierte(r.keineSpezialisierte)`.
  - `keineSpezialisierte` an `WerkstattFinderMap` durchreichen (Inc-1-Prop).
  - `absenden`: `erstelleWerkstattFinderLead({ ..., fotos, bedarf: bedarf ?? undefined })`.
  - `rows`-State-Typ → `(WerkstattFinderRow & { fit?: Fit })[]`.
- [ ] **Step 2: VERIFY** — `npm run build` (Client + Server-Actions; falls env-blocked: `npx tsc --noEmit` + Notiz). Ratchets `check:component-set`/`check:token-audit` 0-neu. Umlaute geprüft.
- [ ] **Step 3: Commit** `feat(werkstatt-bedarf): Embed-Inline-Foto-Funnel (Bedarf → qualifizierte Werkstaetten)`.

---

## Self-Review (Autor)
**Spec-Abdeckung:** base64-Vision (T1) · Guard (T2) · Klassifizier-Action (T3) · qualifizierte Suche (T4) · Persist-on-Conversion (T5) · Inline-Funnel-UI (T6). ✅
**Typ-Konsistenz:** `EmbedFoto` (T2) durchgängig (T3/T5/T6); `Reparaturbedarf`/`Fit`/`qualifiziereWerkstaetten` aus Inc 1; neue Such-Return-Shape T4→T6 threaded. ✅
**Reihenfolge:** T1–T2 rein/sofort. T3 braucht T1+T2. T4+T6 (Shape-Change+Client) ggf. zusammen. T5 unabhängig (Persist). ✅
**Platzhalter:** Storage-Details/Query-Shapes via Muster-File (`uploadSchadensfotoKunde`) — kein Raten. ✅
