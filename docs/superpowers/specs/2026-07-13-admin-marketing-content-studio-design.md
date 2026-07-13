# Admin-Marketing Content-Studio — Slice 1 (Generierung)

- **Datum:** 2026-07-13
- **Status:** Final (Review abgeschlossen) → bereit fuer writing-plans
- **Branch:** `kitta/marketing-content-studio` (off `staging`)
- **URL-Ziel:** `https://app.claimondo.de/admin/marketing`

---

## 1. Kontext & Ziel

### 1.1 Vision (End-to-End)
Vollautomatische Content-Fabrik fuers Marketing: **Idee → Kurzvideo → automatischer Post auf TikTok + Meta**, getrieben ueber den VPS per Cron, ohne Handanlegen. Verwaltet aus einem neuen **Admin-Marketing-Bereich** der Haupt-App.

### 1.2 Zwei Haelften — warum Slice 1 nur eine baut
1. **Generierung** — das Video erzeugen. ← **diese Slice**
2. **Publishing** — automatisiert auf TikTok + Meta posten. ← spaetere Slices (§17)

**Value-first** (Nutzer-Entscheidung): Slice 1 liefert sofort nutzbaren Content (Team postet vorerst manuell), waehrend die buerokratisch langwierige Publishing-Haelfte (Direct-API, 2–4 Wochen Audits **je** Plattform) nachgelagert kommt. Die Audits werden **parallel** angestossen und blockieren Slice 1 nicht.

### 1.3 Evaluations-Ergebnis: `Open-Generative-AI` als Engine verworfen
Tief evaluiert (3 Agenten, file:line-Evidenz): MIT-lizenziert, aber nur eine duenne Oberflaeche vor der **kostenpflichtigen `MuAPI.ai`-Cloud** (generiert selbst nichts), **kein** Publishing/OAuth/Scheduler, kein Gratis-Video-Pfad. → **Als Engine verworfen.** Der Nutzer-Wunsch "komplett ueber Claude, mit wenigen APIs" fuehrt zu einem **in-house Remotion-Stack** (Code-Video, headless, ~0 € Grenzkosten). Der Download war reine Landscape-Recherche.

---

## 2. Finale Entscheidungen

| Dimension | Entscheidung |
|---|---|
| Ort | **`src/app/admin/marketing/`** (neu, Haupt-App; URL `/admin/marketing`) |
| Build-Reihenfolge | **Value-first** → Slice 1 = Generierung, manuelles Posten |
| Content-Formate | **Ratgeber** + **Ad** → 1 Engine, 2 Skript-Templates |
| Video-Engine | **Remotion** (Code-Video) — kein Avatar, kein MuAPI |
| Visueller Stil | **Rein grafisch, voll animiert (faceless)** — kein Mensch/Avatar (§9) |
| Skript + Visual-Plan | **Claude Opus** (`claude-opus-4-8`; neuere Sonnet bei Bau pruefen) |
| Voiceover | **ElevenLabs** (neutrale DE-Stimme), env `ELEVENLABS_API_KEY`; Interface-getrennt (OSS-Piper spaeter) |
| Visuals (B-Roll) | **Visual-Prompter (Claude) + Resolver-Prioritaet: kuratierte Marken-Bibliothek → Stock (Pexels, gratis) → generische Grafik** (§7/§5-U5/§9) |
| Marken-Bibliothek | kuratierte, getaggte **Remotion-Branded-Components** (Warndreieck, Kennzeichen-Look, Schaden-Frame, Zahlen-Motifs, Logo-Moves); waechst als Code. Upload realer Clips = spaeter |
| Design-Tokens | Claimondo `src/lib/design-tokens.ts` |
| API-Footprint | 2 bezahlt (Claude, ElevenLabs) + 1 gratis (Pexels) |
| Kosten-Cap | 10–20 Clips/Woche (~25 $/Monat) |
| Publishing | **Direct** TikTok + Meta API — spaetere Slices, Audits parallel |

---

## 3. Scope

### 3.1 In Scope (Slice 1)
- Neue Admin-Sektion `/admin/marketing` mit sichtbarem Nav-Einstieg (Rolle: Admin).
- Ein Job aus **Thema + Format** → Claude erzeugt **Skript + Visual-Plan je Segment** → (Admin-Review/Edit) → ElevenLabs-Voiceover → Visual-Resolver (Marke→Stock→Grafik) → Remotion-Render (9:16, **durchgehend animiert**, kinetische Untertitel, gebrandet) → mp4 in Supabase Storage → **Preview + Download**.
- Erste Charge **gebrandeter Remotion-Komponenten** als Marken-Bibliothek (getaggt, resolver-faehig).
- Persistente Job-Tabelle als SSoT mit Status-Lifecycle.
- Guardrails ab Tag 1: **Kosten-Cap + Kill-Switch** (env).
- **PoC-first**: 1 echter deutscher Clip end-to-end, bevor die UI ausgebaut wird.

### 3.2 Out of Scope (YAGNI)
- **Kein** Auto-Posting / TikTok/Meta-Connector (Slice 2+).
- **Kein** Scheduler / Themen-Bank / Cron-Vollautomatik (Slice 3).
- **Kein** Mensch/Avatar, **kein** Lip-Sync, **kein** Voice-Cloning, **keine** Custom-KI-Visuals (reaktiviert Bezahl-API — spaeter).
- **Kein** DB-Upload-Asset-Management — die Marken-Bibliothek startet als **Code-Komponenten**; Upload realer Clips = spaetere Ausbaustufe.
- **Kein** Multi-User-Approval-Workflow (nur Admin generiert + laedt herunter).

---

## 4. Architektur — Units mit klaren Grenzen

**U1 — Route & Nav (`/admin/marketing`)** — Einstieg + Auth-Gate (Admin), Seitengeruest. Abh.: Admin-Auth-Guards, Komponenten-Set.

**U2 — Datenmodell (`marketing_content_jobs` + Storage-Bucket)** — SSoT + Ablage Audio/Video. **DDL nur via Supabase-Plugin** (Regel 2, Version-Tracking + File).

**U3 — Skript- + Visual-Plan-Generator (Server-Action, Claude Opus)** — `generiere(thema, format)` → Skript-JSON **inkl. Visual-Plan je Segment** (§7). Der "Prompter": entscheidet Stock/Grafik/Marke + erzeugt konkrete EN-Queries. Abh.: Claude API, Zod-Schema, **Compliance-Gate** (§7).

**U4 — TTS-Adapter (ElevenLabs)** — `synthesize(text): { audio; wordTimings[] }` (Interface-getrennt). Wort-Timings → kinetische Untertitel. Abh.: `ELEVENLABS_API_KEY`.

**U5 — Visual-Resolver** — `loeseVisual(plan): ClipRef` mit Prioritaet: **① Marken-Bibliothek** (getaggte Remotion-Component) → **② Stock** (Pexels/Pixabay, gratis, `PEXELS_API_KEY`) → **③ generische Grafik** (Remotion-Fallback). Nie leer → Clip bleibt gefuellt. Abh.: Marken-Registry (U6), Pexels.

**U6 — Remotion-Paket** — voll-animierte Composition `ContentClip` (§9) **+ getaggte Marken-Component-Bibliothek** (Registry). Skript + Audio + Timings + Visuals → 9:16-Video. Abh.: `@remotion/renderer` (headless), Claimondo-Tokens. **Isoliert vom Client-Bundle** (§16).

**U7 — Render-Orchestrator** — `verarbeiteJob(jobId)`: skript → audio → visuals → render → upload; Status/Kosten; Fehler pro Stufe isoliert, re-runbar; **asynchron**; Kosten-Cap + Kill-Switch.

**U8 — Admin-UI** — Job-Liste, "Neuer Clip"-Form, Job-Detail (editierbares Skript, Regenerate je Stufe, Preview-Player, Download, Status/Kosten). Komponenten-Set, kein handgerolltes Markup.

---

## 5. Datenmodell (Skizze — DDL via Plugin)

`marketing_content_jobs`:

| Spalte | Typ | Zweck |
|---|---|---|
| `id` | uuid PK | |
| `thema` | text | Eingabe-Thema |
| `format` | text CHECK in ('ratgeber','ad') | Skript-Template + Duktus |
| `status` | text CHECK (siehe §6) | Lifecycle-State |
| `skript` | jsonb | Claude-Output inkl. Visual-Plan (validiert) |
| `caption` | text | Post-Caption |
| `hashtags` | text[] | |
| `audio_url` | text | Storage mp3 |
| `video_url` | text | Storage mp4 (oeffentlich) |
| `dauer_sekunden` | int | |
| `ist_ki_generiert` | bool default true | fuer spaeteres KI-Label (§15) |
| `kosten_cents` | int | Cap/Reporting |
| `fehler_text` | text null | bei status=fehler |
| `erstellt_von` | uuid | Admin |
| `erstellt_am` / `aktualisiert_am` | timestamptz | (Naming gegen DB-Konvention verifizieren) |

- **RLS:** Admin-only. **Storage-Bucket** `marketing-content`: oeffentlich lesbar.
- **Marken-Bibliothek** = Code-Registry (kein DB-Table in Slice 1). DB-gestuetzte Upload-Assets = spaetere Ausbaustufe.

---

## 6. Datenfluss / Lifecycle

```
entwurf
  → skript_generiert     (U3: Claude Opus — Skript + Visual-Plan)
    → [Admin review/edit] (optional, U8)
      → audio_erzeugt     (U4: ElevenLabs)
        → video_fertig    (U5+U6+U7: Visuals aufloesen → Remotion → Storage; Endzustand → manueller Download)
fehler  (an jeder Stufe; fehler_text gesetzt; ab Fehlerstufe re-runbar)
```
Publishing-Slices erweitern spaeter um `geplant` / `gepostet`.

---

## 7. Skript- + Visual-Plan-Generierung (U3) — der "Prompter"

- **Input:** `thema`, `format`.
- **Modell:** **Claude Opus** (`claude-opus-4-8`); neuere Sonnet-Version bei Bau pruefen.
- **Output-JSON (Zod-validiert):**
  ```
  { hook: string,
    segmente: [{
      text: string,
      on_screen_text?: string,
      visual: { typ: 'marke' | 'stock' | 'grafik',
                tags?: string[],        // fuer Marken-Bibliothek-Match
                queries?: string[] }    // konkrete EN-Stock-Queries + Fallback
    }],
    caption: string, hashtags: string[], disclaimer?: string }
  ```
  Der Visual-Plan ist der automatisierte "Prompter": konkrete Szene → `stock` mit guten EN-Queries; abstrakter Begriff → `grafik`; ikonisch/gebrandet (Warndreieck, Kennzeichen …) → `marke` mit Tags.
- **Zwei Prompt-Templates:** Ratgeber (aufklaerend) vs. Ad (verkaufend, CTA).
- **Compliance-Gate (hart):** keine Rechtsberatung; bei Versicherungs-/Rechtsthemen vorsichtige Formulierungen + Pflicht-Disclaimer; Claimondo-Ton; Ziel-Dauer 30–60 s.

---

## 8. TTS-Adapter (U4)

- **Interface:** `synthesize(text): { audio, wordTimings[] }`.
- **Impl:** ElevenLabs, Multilingual/Turbo, feste DE-Voice-ID (Config), Wort-Timestamps → kinetische Untertitel.
- **Key:** `ELEVENLABS_API_KEY`. Kosten → `kosten_cents`. Fallback (spaeter): Piper.

---

## 9. Remotion-Paket (U6) — voll animiert, faceless

- **Ort:** `src/remotion/` (isoliert; nicht ins Client-Bundle, §16).
- **Composition** `ContentClip`, parametrisiert per `format`. Kein Mensch/Avatar.
- **Qualitaets-Anspruch (verbindlich): jeder Frame gefuellt und in Bewegung** — gleichzeitige Ebenen:
  1. **Kinetische Untertitel** (Wort-fuer-Wort, synchron zur Stimme via `wordTimings`) — Haupt-Retention-Treiber.
  2. **Animierter Hintergrund** (Marken-Formen/Verlauf), nie flach.
  3. **Visual-Ebene** — pro Segment aufgeloest (U5): Marken-Component / Stock-Clip / animierte Grafik; Schnitt alle 2–4 s.
  4. **Uebergaenge** (Wipe/Zoom/Slide) + **Marken-Bumper** (Intro/Outro), Fortschrittsbalken.
- **Marken-Bibliothek:** getaggte, wiederverwendbare Branded-Components (`src/remotion/brand-library/`), vom Resolver per Tag gezogen. Startcharge in Slice 1, waechst als Code.
- **Format:** 1080×1920 (9:16), Claimondo-Tokens.
- **Render:** `@remotion/renderer` headless, gebuendeltes ffmpeg, Chromium via `ensureBrowser`.

---

## 10. Render-Orchestrator (U7)

- Server-seitig, **asynchron** (Render blockiert keinen Web-Request); UI pollt `status`.
- Stufen isoliert (Result-Object); Fehler → `status=fehler` + `fehler_text`, Re-Run ab Stufe.
- **Kosten-Cap:** env `MARKETING_MAX_CLIPS_PER_WEEK` (default 20). **Kill-Switch:** env `MARKETING_STUDIO_ENABLED`.
- Upload mp3 + mp4 → Supabase Storage → URLs am Job.

---

## 11. Admin-UI (U8)

- **Route:** `src/app/admin/marketing/` (+ Nav-Eintrag; Admin-Rolle).
- **Komponenten-Set:** `shared/DataTable`, `StatusBadge`, `primitives.*`, `forms/*`.
- **Views:** Job-Liste · "Neuer Clip"-Form · Job-Detail (editierbares Skript inkl. Visual-Plan, Regenerate je Stufe, Preview-Player, Download, Kosten/Status).

---

## 12. Cron-Readiness (Zukunft)

U7 ist headless ausloesbar → spaeter Cron-Route `src/app/api/cron/marketing-content-generate/` + Themen-Bank → Vollautomatik.

---

## 13. Testing-Strategie

- **Schritt 0 — PoC (zuerst!):** 1 echter deutscher Ratgeber-Clip end-to-end (Skript+Visual-Plan → TTS → Resolver → Render); Qualitaet + "durchgehend bewegt"-Anspruch beurteilt, **bevor** UI-Ausbau.
- **Unit:** Skript+Visual-Plan-Schema (Zod); TTS-Adapter (mock); Visual-Resolver-Prioritaet (mock Pexels + Marken-Registry); Remotion-Props-Mapping.
- **Render-Smoke:** Composition rendert Fixture ohne Crash.
- **Playwright:** `/admin/marketing` erreichbar + Form legt Job an (Generierung gemockt).
- **7-Punkte-Audit** vor jedem Commit.

---

## 14. Kostenmodell

- **ElevenLabs Creator $22/Mo (121k Credits)** deckt 10–20 Clips/Woche mit Puffer; Turbo halbiert.
- **Claude Opus** (Skript+Visual-Plan): kurze Outputs → wenige $/Mo.
- **Pexels/Pixabay + Marken-Bibliothek (Code) + Remotion-Render:** gratis / eigene CPU → **0 € Grenzkosten**.
- **Summe:** ~25 $/Monat fuer die komplette Generierungs-Pipeline.

---

## 15. Compliance (ab Publishing-Slice — ab jetzt tracken)

- **KI-Kennzeichnung:** Faceless-Motion-Graphic hat **kein** synthetisches Gesicht (Hauptrisiko vermieden), aber die synthetische **Stimme** kann labelpflichtig sein → `ist_ki_generiert=true` tracken fuer die Publishing-Slice.
- **Ratgeber-Content:** Rechts-/Versicherungsaussagen → Disclaimer + keine Rechtsberatung (Compliance-Gate §7).

---

## 16. Ops & Build-Integration

- **VPS:** Remotion braucht Node + Headless-Chromium-Libs + ffmpeg (gebuendelt). Deploy-Pipeline ergaenzen.
- **Client-Bundle:** Remotion-Compositions + Marken-Bibliothek **nicht** ins Next-Client-Bundle (nur Render-Zeit/Server). Sauber isolieren.
- **Regeln:** DDL nur via Supabase-Plugin (Regel 2); kein Direct-Push auf `main` (Regel 1) — PR gegen `staging`.

---

## 17. Spaetere Slices (Roadmap)

- **Slice 2 — Publishing-Connectors:** TikTok Content Posting API + Meta IG-Reels/FB-Video; OAuth/Token (Meta System-User, TikTok Refresh); KI-Label; Direct-Post nach Audit (2–4 Wo je Plattform → parallel starten).
- **Slice 3 — Vollautomatik:** Themen-Bank + Scheduler + Cron + Redaktionskalender.
- **Slice 4 — Ausbaustufen:** DB-gestuetzte Upload-Marken-Bibliothek (reale Clips) + Management-UI; optional Custom-KI-Visuals; Performance-Analytics je Clip.

---

## 18. Geloeste Review-Punkte (2026-07-13)

1. **Claude-Modell:** Opus (`claude-opus-4-8`); Sonnet-Neuversion bei Bau pruefen.
2. **DE-Stimme:** neutrale ElevenLabs-Stimme.
3. **Visueller Stil:** rein grafisch, voll animiert (faceless) — kein Presenter/Avatar; "alles gefuellt + bewegt" als harter Qualitaets-Anspruch (§9).
4. **Remotion-Ort:** `src/remotion/`, isoliert vom Client-Bundle.
5. **Sektion:** neue eigene `/admin/marketing`-Sektion.
6. **Visuals/B-Roll:** Visual-Prompter (Claude) + Resolver-Prioritaet **kuratierte Marken-Bibliothek (Remotion-Components) → Stock (Pexels, gratis) → generische Grafik**; Upload realer Clips + Custom-KI-Visuals bewusst spaeter.
