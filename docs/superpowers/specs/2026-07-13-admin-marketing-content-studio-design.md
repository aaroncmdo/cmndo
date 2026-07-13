# Admin-Marketing Content-Studio — Slice 1 (Generierung)

- **Datum:** 2026-07-13
- **Status:** Draft (zur Review)
- **Branch:** `kitta/marketing-content-studio` (off `staging`)
- **Vorgeschichte:** Evaluation des heruntergeladenen `Open-Generative-AI` (siehe §1.3)

---

## 1. Kontext & Ziel

### 1.1 Vision (End-to-End)
Vollautomatische Content-Fabrik fuer das Marketing: **Idee → Kurzvideo → automatischer Post auf TikTok + Meta (Instagram/Facebook)**, getrieben ueber den VPS per Cron, ohne Handanlegen. Verwaltet aus einem neuen **Admin-Marketing-Bereich** der Haupt-App (`app.claimondo.de`).

### 1.2 Zwei Haelften — und warum Slice 1 nur eine baut
Das Ziel zerfaellt in zwei technisch getrennte Haelften:

1. **Generierung** — das Video erzeugen. (Diese Slice.)
2. **Publishing** — automatisiert auf TikTok + Meta hochladen. (Spaetere Slices.)

Der Nutzer hat **Value-first** gewaehlt: Slice 1 liefert sofort nutzbaren Content (Team postet vorerst manuell), waehrend die buerokratisch langwierige Publishing-Haelfte (Direct-API, siehe §15) nachgelagert kommt. Die Plattform-Audits (2–4 Wochen **je** Plattform) sind der lange Pol und werden **parallel** angestossen, sobald wir starten — sie blockieren Slice 1 nicht.

### 1.3 Evaluations-Ergebnis: `Open-Generative-AI` verworfen (als Engine)
Der heruntergeladene Tool-Kandidat wurde tief evaluiert (3 Agenten, file:line-Evidenz):
- MIT-lizenziert (Reuse erlaubt), **aber** nur eine duenne Oberflaeche vor der **kostenpflichtigen `MuAPI.ai`-Cloud** — generiert selbst nichts, jeder Call verbraucht bezahlte Credits.
- **Kein** Publishing (kein TikTok/Meta-API, kein OAuth, kein Scheduler) — die "Auto-Publish"-Erwaehnungen sind Links zu Fremdprodukten.
- Kein Gratis-/Local-Pfad fuer Video (Local-Inference ist Desktop-only + nur Bilder).

→ **Als Engine verworfen.** Der Nutzer-Wunsch "komplett ueber Claude, mit wenigen APIs" fuehrt stattdessen zu einem **in-house Remotion + Claude + ElevenLabs**-Stack (minimaler API-Footprint, headless-faehig, ~0 € Grenzkosten pro Render). Der Download war wertvoll als Landscape-Recherche, mehr nicht.

---

## 2. Finale Entscheidungen

| Dimension | Entscheidung |
|---|---|
| Ort | **`src/app/admin/marketing/`** (neu, Haupt-App) |
| Build-Reihenfolge | **Value-first** → Slice 1 = Generierung, manuelles Posten |
| Content-Formate | **Ratgeber-Clips** + **Ad-Clips** → 1 Engine, 2 Skript-Templates |
| Video-Engine | **Remotion** (Code-Video) — kein Avatar-API, kein MuAPI |
| Skript | **Claude** (Sonnet default) → Hook + Skript + Caption + Hashtags |
| Voiceover | **ElevenLabs** (DE-Stimme), env `ELEVENLABS_API_KEY`. Interface-getrennt → OSS-Piper spaeter als 0-API-Fallback |
| Look | **Motion-Graphic** + **Standbild-Presenter** (beide Remotion-Compositions, kein Lip-Sync) |
| Design-Tokens | Claimondo `src/lib/design-tokens.ts` |
| Kosten-Cap | 10–20 Clips/Woche (~25 $/Monat) |
| Publishing | **Direct** TikTok + Meta API — spaetere Slices, Audits laufen parallel an |

---

## 3. Scope

### 3.1 In Scope (Slice 1)
- Neue Admin-Sektion `admin/marketing` mit sichtbarem Nav-Einstieg (Rolle: Admin).
- Ein Job aus **Thema + Format** → Claude-Skript → (Admin-Review/Edit) → ElevenLabs-Voiceover → Remotion-Render (9:16, untertitelt, gebrandet) → mp4 in Supabase Storage → **Preview + Download**.
- Persistente Job-Tabelle als Single Source of Truth (SSoT) mit Status-Lifecycle.
- Guardrails ab Tag 1: **Kosten-Cap + Kill-Switch** (env).
- **PoC-first**: 1 echter deutscher Clip end-to-end, bevor die UI ausgebaut wird.

### 3.2 Out of Scope (YAGNI — bewusst NICHT)
- **Kein** Auto-Posting / TikTok- oder Meta-Connector (Slice 2+).
- **Kein** Scheduler / Themen-Bank / Cron-Vollautomatik (Slice 3).
- **Kein** Lip-Sync-Avatar, **kein** Voice-Cloning.
- **Kein** Multi-User-Approval-Workflow (nur Admin generiert + laedt herunter).
- **Kein** B-Roll-Stock-API (Slice 1: Marken-Grafik/Text; Stock spaeter optional).

---

## 4. Architektur — Units mit klaren Grenzen

Jede Unit hat: *Verantwortung / Schnittstelle / Abhaengigkeiten*. Ziel: klein, isoliert testbar.

**U1 — Route & Nav (`admin/marketing`)**
Verantwortung: Einstiegspunkt + Auth-Gate (Admin-Rolle), Seitengeruest.
Schnittstelle: Next-Route + Nav-Eintrag in der Admin-Navigation.
Abh.: bestehende Admin-Auth-Guards, Komponenten-Set (`primitives`/`shared`).

**U2 — Datenmodell (`marketing_content_jobs` + Storage-Bucket)**
Verantwortung: SSoT fuer Job-Lifecycle; Ablage von Audio + Video.
Schnittstelle: Supabase-Tabelle + Storage-Bucket `marketing-content` (oeffentlich lesbar → passend fuer spaetere Publishing-URL).
Abh.: Supabase. **DDL ausschliesslich via Supabase-Plugin** (`apply_migration`, Regel 2), inkl. Version-Tracking-Dance + Migration-File.

**U3 — Skript-Generator (Server-Action, Claude)**
Verantwortung: `thema + format` → strukturiertes Skript-JSON (Hook, Segmente, On-Screen-Text, Caption, Hashtags, optional Disclaimer).
Schnittstelle: `generiereSkript(thema, format): Promise<{ ok; data?; error? }>` (Result-Object-Pattern).
Abh.: Claude API (env-Key), Zod-Schema fuer Output-Validierung, **Compliance-Gate** (§7).

**U4 — TTS-Adapter (ElevenLabs)**
Verantwortung: Skript-Text → mp3 + Wort-Timings (fuer Untertitel-Sync).
Schnittstelle: `synthesize(text): Promise<{ audio: Buffer; wordTimings: WordTiming[] }>` hinter einem schmalen Interface (Impl austauschbar).
Abh.: ElevenLabs API (`ELEVENLABS_API_KEY`, Voice-ID via Config).

**U5 — Remotion-Paket (2 Compositions)**
Verantwortung: Skript-JSON + Audio + Timings → 9:16-Video (gebrandet, eingebrannte Untertitel, Intro/Outro).
Schnittstelle: zwei Compositions `MotionGraphicClip`, `StillPresenterClip`; Props = typisiertes Job-JSON.
Abh.: Remotion + `@remotion/renderer` (headless), Claimondo-Tokens. **Isoliert vom Next-Client-Bundle** (server/dev-only, §16).

**U6 — Render-Orchestrator**
Verantwortung: fuehrt einen Job durch die Pipeline (skript → audio → render → upload), aktualisiert Status + Kosten, behandelt Fehler pro Stufe.
Schnittstelle: `verarbeiteJob(jobId)`; jede Stufe idempotent/re-runbar ab Fehlerpunkt.
Abh.: U3, U4, U5, Supabase Storage. **Nicht synchron im Web-Request** (Render ist schwer) → asynchron/hintergruendig; UI pollt Status.

**U7 — Admin-UI**
Verantwortung: Job-Liste, "Neuer Clip"-Form, Job-Detail (editierbares Skript, Regenerate, Preview-Player, Download, Status/Kosten).
Schnittstelle: Client-Components auf `admin/marketing`.
Abh.: U2 (Daten), Server-Actions (U3/U6), Komponenten-Set (`shared/DataTable`, `StatusBadge`, `primitives`).

---

## 5. Datenmodell (Skizze — DDL folgt via Plugin in der Implementierung)

`marketing_content_jobs`:

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK | |
| `thema` | text | Eingabe-Thema |
| `format` | text CHECK in ('ratgeber','ad') | Skript-Template-Wahl (§7) |
| `vorlage` | text CHECK in ('motion_graphic','standbild_presenter') default 'motion_graphic' | waehlt die Remotion-Composition (§9) |
| `status` | text CHECK (siehe §6) | Lifecycle-State |
| `skript` | jsonb | Claude-Output (validiert) |
| `caption` | text | Post-Caption |
| `hashtags` | text[] | |
| `audio_url` | text | Storage-URL mp3 |
| `video_url` | text | Storage-URL mp4 (oeffentlich) |
| `dauer_sekunden` | int | |
| `ist_ki_generiert` | bool default true | fuer spaeteres KI-Label (§15) |
| `kosten_cents` | int | TTS-Kosten fuer Cap/Reporting |
| `fehler_text` | text null | bei status=failed |
| `erstellt_von` | uuid | Admin-User |
| `erstellt_am` / `aktualisiert_am` | timestamptz | (Naming an DB-Konvention pruefen) |

- **RLS:** Admin-only (analog bestehender Admin-Tabellen).
- **Storage-Bucket** `marketing-content`: oeffentlich lesbar (Publishing-Slices brauchen eine oeffentliche URL fuer den Plattform-Pull).
- Nach DDL: `generate_typescript_types` regenerieren (oder aufschieben bis Consumer die Spalte nutzt).

---

## 6. Datenfluss / Lifecycle (State Machine)

```
entwurf
  → skript_generiert        (U3: Claude)
    → [Admin review/edit]    (optional, U7)
      → audio_erzeugt        (U4: ElevenLabs)
        → video_fertig       (U5+U6: Remotion → Storage; Slice-1-Endzustand → manueller Download)
fehler  (an jeder Stufe; fehler_text gesetzt; ab Fehlerstufe re-runbar)
```

Publishing-Slices erweitern den Enum spaeter um `geplant` / `gepostet`.

---

## 7. Skript-Generierung (U3)

- **Input:** `thema`, `format` (ratgeber | ad).
- **Modell:** Claude **Sonnet** (Default — Qualitaet/Marken-Ton wichtig; Skripte sind kurz → Kosten trivial). Haiku als Spar-Option konfigurierbar.
- **Output-JSON (Zod-validiert):**
  ```
  { hook: string,
    segmente: [{ text: string, on_screen_text?: string, b_roll_hint?: string }],
    caption: string,
    hashtags: string[],
    disclaimer?: string }
  ```
- **Zwei Prompt-Templates:** Ratgeber (aufklaerend, Vertrauen) vs. Ad (verkaufend, CTA).
- **Compliance-Gate (System-Prompt, hart):** keine Rechtsberatung; bei Versicherungs-/Rechtsthemen vorsichtige, allgemeine Formulierungen + Pflicht-Disclaimer; Claimondo-Tonalitaet; Ziel-Dauer 30–60 s (Zeichen-Budget passend zum Kosten-Cap).

---

## 8. TTS-Adapter (U4)

- **Interface:** `synthesize(text): { audio: Buffer, wordTimings: WordTiming[] }`.
- **Impl (Slice 1):** ElevenLabs, mehrsprachiges/Turbo-Modell, feste DE-Voice-ID (Config). Wort-Level-Timestamps ueber die ElevenLabs-Timestamps-API → speist Untertitel-Sync in U5.
- **Key:** `ELEVENLABS_API_KEY` (env, nie hardcoded).
- **Kosten-Messung:** Zeichenzahl → `kosten_cents` am Job (fuer Cap + Reporting).
- **Fallback (spaeter):** self-hosted Piper (0-API) — Interface macht den Wechsel trivial.

---

## 9. Remotion-Paket (U5)

- **Ort:** `src/remotion/` (isoliertes Verzeichnis; **nicht** ins Client-Bundle, §16).
- **Compositions:**
  - `MotionGraphicClip` — animierte Text-/Grafik-/B-Roll-Kacheln + Voiceover + eingebrannte Untertitel. (Format 1 = Ratgeber-tauglich.)
  - `StillPresenterClip` — festes Marken-Gesicht (Standbild) + animierter Rahmen + Voiceover + Untertitel, **kein** Lip-Sync. (Format 2.)
- **Props:** typisiertes Skript-JSON + Audio + `wordTimings`.
- **Brand:** Claimondo-Tokens (Farben/Fonts), 1080×1920 (9:16), Intro/Outro-Bumper.
- **Untertitel:** aus `wordTimings`, Phrasen-/Wort-Highlight (Standard fuer Short-Form-Retention).
- **Render:** `@remotion/renderer` headless (Node), gebuendeltes ffmpeg, Chromium via `ensureBrowser`.

---

## 10. Render-Orchestrator (U6)

- Server-seitig, **asynchron** (Render blockiert keinen Web-Request). Slice-1-Minimal: eine Server-Action stösst die Verarbeitung an, UI pollt `status`.
- Stufen isoliert (Result-Object); Fehler → `status=failed` + `fehler_text`, kein Teilzustand-Verlust, Re-Run ab Stufe.
- **Kosten-Cap:** env `MARKETING_MAX_CLIPS_PER_WEEK` (default 20) → Zaehler vor Generierung pruefen, sonst Block + Hinweis.
- **Kill-Switch:** env `MARKETING_STUDIO_ENABLED` (default true) → global aus.
- Upload mp3 + mp4 → Supabase Storage → URLs am Job.

---

## 11. Admin-UI (U7)

- **Route:** `src/app/admin/marketing/` (+ Nav-Eintrag; Admin-Rolle).
- **Komponenten-Set:** `shared/DataTable` (Liste), `StatusBadge`, `primitives.Button`/Card, `forms/*` — **kein** handgerolltes Markup (Komponenten-Policy).
- **Views:**
  - Job-Liste (Status, Thema, Format, Dauer, Kosten, Datum).
  - "Neuer Clip"-Form (Thema + Format).
  - Job-Detail: **editierbares Skript** (Admin justiert vor Render), Regenerate-Buttons je Stufe, Video-Preview-Player, Download, Kosten/Status.

---

## 12. Cron-Readiness (Zukunft, nicht Slice 1)

Der Orchestrator (U6) ist bewusst headless ausloesbar. Spaeter: Cron-Route `src/app/api/cron/marketing-content-generate/` (bestehendes ~60-Routen-Muster) + Themen-Bank → Vollautomatik.

---

## 13. Testing-Strategie

- **Schritt 0 — PoC (zuerst!):** 1 echter deutscher Ratgeber-Clip end-to-end (Skript → TTS → Render), Qualitaet beurteilt, **bevor** die UI ausgebaut wird. Beantwortet direkt "testen wie gut das funktioniert".
- **Unit:** Skript-JSON-Schema (Zod); TTS-Adapter (gemockt); Remotion-Props-Mapping.
- **Render-Smoke:** eine Composition rendert ein kurzes Fixture ohne Crash.
- **Playwright:** `admin/marketing` erreichbar + Form legt Job an (Generierung gemockt).
- **7-Punkte-Audit** (Build gruen, UI-Erreichbarkeit, Redundanz, Dead-Code, Spec-Treue, Inkonsistenz, Regression) vor jedem Commit.

---

## 14. Kostenmodell

- **ElevenLabs Creator $22/Mo (121k Credits)** deckt 10–20 Clips/Woche (~40–80k Zeichen/Mo) mit Puffer; Turbo-Modell 0,5 Credit/Zeichen halbiert. Pro ($99/600k) erst bei 5–7× Skalierung.
- **Claude** (Skripte): Cent-Betraege, ~1–4 $/Mo gesamt.
- **Remotion-Render:** eigene VPS-CPU → **0 € Grenzkosten**.
- **Summe:** ~25 $/Monat fuer die komplette Generierungs-Pipeline. TTS ist die einzige pro-Clip skalierende Kost.

---

## 15. Compliance (relevant ab Publishing-Slice — aber ab jetzt tracken)

- **KI-Kennzeichnung:** TikTok (ab 03/2026) und Meta (ab 02/2026) verlangen ein "KI-generiert"/"Made with AI"-Label fuer synthetische Inhalte (unsere Stimme, evtl. Standbild-Presenter). TikTok erkennt KI automatisch; unmarkiert → Reichweiten-Drosselung. → **`ist_ki_generiert` ab Generierung am Job** setzen, damit die Publishing-Slice das Flag korrekt setzt.
- **Ratgeber-Content:** Rechts-/Versicherungsaussagen → Disclaimer + keine Rechtsberatung (Compliance-Gate §7). Strategischer Hinweis: KI-Label + Vertrauensmarke = Gegenwind; Motion-/Template-Look ist markensicherer als foto-realistische Avatare (bewusst so gewaehlt).

---

## 16. Ops & Build-Integration

- **VPS:** Remotion braucht Node + Headless-Chromium-Systemlibs + ffmpeg (Remotion bringt ffmpeg mit; Chromium via `ensureBrowser`). Deploy-Pipeline entsprechend ergaenzen.
- **Client-Bundle:** Remotion-Compositions **duerfen nicht** ins Next-Client-Bundle geraten (nur Render-Zeit/Server). Sauber isolieren (eigenes Verzeichnis, keine Imports aus Client-Komponenten).
- **DDL:** nur via Supabase-Plugin (Regel 2). **Kein** Direct-Push auf `main` (Regel 1) — PR gegen `staging`.

---

## 17. Spaetere Slices (Roadmap)

- **Slice 2 — Publishing-Connectors:** TikTok Content Posting API + Meta IG-Reels/FB-Video; OAuth/Token-Infra (Meta System-User-Token, TikTok Refresh-Rotation); KI-Label; Direct-Post nach bestandenem Audit. (Audits 2–4 Wochen je Plattform → parallel starten.)
- **Slice 3 — Vollautomatik:** Themen-Bank + Scheduler + Cron + Redaktionskalender.
- **Slice 4 — Rueckkanal:** Performance-Analytics je Clip.

---

## 18. Offene Annahmen (beim Review bestaetigen)

1. **Claude-Modell** fuer Skripte = Sonnet (ok?).
2. **DE-Stimme** (ElevenLabs Voice-ID) — konkrete Stimme spaeter waehlbar; Default = neutrale DE-Stimme.
3. **Standbild-Presenter-Asset** (Marken-Gesicht) — habt ihr eins? Falls nein: Slice 1 startet **Motion-Graphic-only**, Standbild-Presenter als kleiner Nachzug.
4. **Remotion im Haupt-App-Repo** unter `src/remotion/` (vs. eigenes Workspace-Package) — Default: `src/remotion/`, isoliert vom Client-Bundle.
5. "Es gibt schon einen Marketing-Bereich": aktuell existiert **kein** `admin/marketing`-Ordner (naechstes Verwandtes: `admin/statistiken` mit Marketing-KPIs). Default = neue Sektion; alternativ an Statistiken andocken.
