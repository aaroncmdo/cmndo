# BG-Remover-Diagnose — warum greift er nicht?

**Datum:** 2026-05-14 21:30 UTC · **Branch:** kitta/aar-sv-logo-bg-removal

## Pipeline-Stand (heute)

Zwei-stufige BG-Removal-Pipeline ist seit `1f715d26` (heute 12:09 UTC) live:

1. **Client-Side imgly ONNX** (`src/components/branding/BrandingEditor.tsx:115-153`) — On-Device-ML im Browser, läuft beim Upload für alle Nicht-SVG/Nicht-tiny-Files. Trainiert auf Foto-Segmentation.
2. **Server-Side Sharp Chroma-Key** (`src/lib/branding/server-bg-remove.ts` → aufgerufen von `src/app/api/branding/upload/route.ts:56-72`) — deterministischer RGB-Distanz-Algorithmus als Fallback für Text-/Wordmark-Logos.

Manueller „Hintergrund entfernen"-Button in `LogoUploader.tsx:45-68` fährt nur die Client-Stufe (imgly) und triggert dann den Upload-Pfad neu.

## Wann greift's *nicht*?

### Server-Side Chroma-Key (`stripSolidBackground` Z. 26-105)

Die Funktion entscheidet, dass ein solider BG vorliegt, anhand der **4 Ecken** (2px Offset zum Rand):

```ts
const isUniform = corners.every(c => Math.abs(c.r - avg.r) < 12 && ... < 12 && ... < 12)
const isNearWhite = avg.r > 235 && avg.g > 235 && avg.b > 235
const isNearBlack = avg.r < 20 && avg.g < 20 && avg.b < 20
if (!isUniform || (!isNearWhite && !isNearBlack)) {
  return { ...srcBuffer, applied: false }  // durchgereicht ohne Removal
}
```

**Failure-Modes:**

| Logo-Eigenschaft | Was passiert | Konsequenz |
|---|---|---|
| Heller Grauton im BG (z.B. `#EEEEEE`) | `isNearWhite` false (< 235) | **kein** BG-Removal |
| Leichter Verlauf in Ecken (Cream → Weiß) | `isUniform` false (Distanz > 12) | **kein** BG-Removal |
| Subtile JPG-Artefakte am Rand | wie oben | **kein** BG-Removal |
| Schatten-Drop um das Logo | Ecken haben unterschiedliche Saturation | **kein** BG-Removal |
| Logo mit echtem PNG-Padding (transparente Ecken) | Ecken sind `rgb(0,0,0)` aus dem unter-Layer-Sample → near-black | BG-Removal greift, aber macht **alle dunklen Logo-Teile transparent** (Distanz-Threshold 28 → schwarzer Logo-Text wird mit der „BG" identifiziert) |
| Beige/cremiger BG (z.B. `#F5F1E8` wie Landing) | `isNearWhite` false (< 235) | **kein** BG-Removal |
| Farbiger Brand-BG (Logo auf Brand-Hex) | weder near-white noch near-black | **kein** BG-Removal |

### Client-Side imgly

| Logo-Typ | Risiko | Hinweis |
|---|---|---|
| Text-/Wordmark auf solidem BG | imgly trainiert auf Foto-Segmentation, kann Text vom BG nicht trennen | dafür existiert genau der Sharp-Fallback (zweite Stufe) |
| Sehr kleine Datei (<5KB) | `isTiny`-Check überspringt die Stufe komplett | Annahme: schon clean |
| SVG | `isVector`-Check überspringt | korrekt — Vector hat eigene Transparenz |
| ONNX-Model lädt nicht (CSP, Netzwerk) | try/catch → setError „übersprungen" | Upload mit Original geht trotzdem durch |
| Manueller Button: fetch(logoUrl) failed | wenn Supabase-Storage-Bucket keine CORS-Header sendet | `LogoUploader.tsx:54` wirft, setError sichtbar |

### Legacy-Logos

**Auto-BG-Removal landete erst heute 12:09 UTC (`1f715d26`).** Alle vorher hochgeladenen SV-Logos liegen unverändert in `gutachter-logos`-Bucket. Es gibt **keinen Backfill** — der existierende Logo-Stamm bleibt opaque bis der SV manuell neu hochlädt oder im Editor den „Hintergrund entfernen"-Button drückt.

## Was Aaron wahrscheinlich sieht

Drei mögliche Szenarien — Reihenfolge nach Häufigkeit:

1. **Test-SV-Logo wurde vor 12:09 hochgeladen** → liegt opaque in Storage → Display zeigt vollen BG (auch nach unserem heutigen Wrapper-Fix in PR #1239 sichtbar). Lösung: erneuten Upload anstoßen oder „Hintergrund entfernen"-Button im Editor klicken.
2. **Logo hat keinen near-white/near-black BG** → Server-Sharp lässt's durch → Display zeigt Original-BG. Lösung: Threshold-Range erweitern (z.B. `isNearWhite > 200`) ODER imgly-only fahren ohne Fallback (riskanter).
3. **Logo hat transparentes Padding** → Sharp identifiziert die transparenten Ecken als near-black BG → killt dunkle Logo-Teile. Lösung: vor `corners`-Sampling prüfen `corners[i].a > 200` (vollständig opak), sonst skip.

## Empfohlene Fixes (priorisiert)

### Quick (heute, in dieser PR / Follow-Up)

- [ ] **Alpha-Check vor Ecken-Sampling** — `corners[i].a < 200` → skip-Removal (verhindert den Padding-Bug)
- [ ] **Range erweitern auf hellgrau** — `isLight = avg.r > 200 && avg.g > 200 && avg.b > 200 && Math.max(r,g,b) - Math.min(r,g,b) < 8` (uniform-grau)
- [ ] **Server-side console.info** ergänzen mit `applied + bgColor` (heute nur bei `applied=true`)

### Mid (separater PR)

- [ ] **Backfill-Script** `scripts/branding/rerun-bg-removal.mjs` — iteriert alle `sachverstaendige.logo_url`, lädt das File, fährt `stripSolidBackground` + lädt zurück. One-Shot via VPS-Cron oder manuell.
- [ ] **Admin-Button** „Alle Logos neu segmentieren" in `/admin/sachverstaendige`-Detail-View für Einzel-Trigger.
- [ ] **UI-Feedback** im BrandingEditor: „BG entfernt: ja/nein" als Badge unter dem Logo-Preview — direkt nach Upload sichtbar.

### Long (eigenes Ticket)

- [ ] **Heuristik per Logo-Typ** vorschalten — Foto-Segmentation vs. Text-Trim erkennen (z.B. Farbvarianz prüfen) und dann nur das passende Verfahren fahren.
- [ ] **Manual-Override** für schwierige Logos: SV kann im Editor einen Pinsel-Eraser benutzen (z.B. tui-image-editor).

## Reproduktions-Tipps

Damit Aaron das Verhalten verifizieren kann:

1. **Test mit „garantiert sauberer" Logo:** Lade ein PNG mit echtem near-white BG hoch (z.B. Wikimedia-Commons-PNG). Sollte mit aktuellem Code transparent durchgehen.
2. **Test mit „garantiert problematischem" Logo:** Logo auf `#EEEEEE`-BG. Aktuell läuft Removal NICHT.
3. **Test Legacy:** SV der vor 12:09 hochgeladen hat → opaque, manueller Editor-Click nötig.

Server-Log-Hint: `[branding/upload] chroma-key applied — BG rgb(...)` erscheint nur wenn `applied=true`. Wenn keine Log-Zeile → Skip-Path.
