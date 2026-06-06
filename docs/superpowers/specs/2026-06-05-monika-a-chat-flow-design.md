# Monika A-Flow — Chat-Redesign (Design-Spec)

**Datum:** 2026-06-05
**Branch:** `kitta/aar-939-monika-a-chat-flow`
**Scope:** Neugestaltung des Monika-Embed-Widgets, **nur Variante A** (free / callback).
**Status:** Design abgenommen (Aaron, 2026-06-05) — bereit für Implementierungs-Plan.

---

## 0. Kontext & Scope

Das Monika-Embed-Widget (`src/embed/monika/*`, gebaut via `scripts/build-monika.mjs` zu `public/embed/monika.js`) bekommt einen **chat-artigen 4-Pfad-Flow** statt des heutigen linearen Flows (`idle → qualify → day → time → form → success`).

**In Scope:**
- Variante **A** (kostenlos, Callback-Modell). Gilt für **beide A-Embed-Topologien**:
  - **sv_embed** (`data-site-id` → Config-Fetch via `/api/embed/config`)
  - **cluster-LP** (`data-cluster` → alles aus `data-*`-Attributen)
  - Gleicher Chat-Flow, **unterschiedliches Routing** (siehe §3).
- Customer Journey, Frontend (Chat-UI/Assets), Datenmodell (neue gfa-Spalten), proaktiver Teaser, Sound, übergreifender Resume.

**Out of Scope (siehe §10):**
- Variante B (paid / self-service / flowlink) — eigener Pfad, bleibt unangetastet.
- Echte Kalenderbuchung (A-Flow bestätigt nur Kapazität).
- Per-Site-Konfiguration (Teaser/Sound/Schwelle).

**Beziehung zu #2502 (funnel_modus A/B):** PR #2502 liefert die A/B-**Response-Mechanik** (`embed_sites.funnel_modus` callback↔flowlink + Admin-Toggle + `route.ts`-Zweig). Dieses Redesign baut den **A-Flow (callback)** UI/UX neu auf. Die `funnel_modus`-Logik bleibt; das Widget reagiert weiter auf die **Response-Form** der Submit-API. Implementierung teilt sich Files (`app.tsx`, `api.ts`, `route.ts`) → **Koordination mit #2502 + den aktiven `kitta/aar-939-monika-embed`-Sessions nötig** (Reihenfolge im Plan).

---

## 1. Customer Journey — 4 Pfade

**Persona:** Monika, **Schadenberaterin** (Foto `monika.png`). **Chat-Stil global:** mehrere *kurze* Bubbles mit **Tippen dazwischen** statt eines langen Absatzes; dezente Emojis (👋 😊, ~1 pro Bubble). Das "echt wirkt"-Gefühl ist verbindlicher Standard, nicht Deko.

**Eröffnung (alle Pfade, getippt):**
> „Hi, grüße Sie! 👋"
> *(tippt)* „Ich bin Monika, Ihre Schadenberaterin bei Claimondo. 😊"
> *(tippt)* „Wie kann ich Ihnen schnell weiterhelfen?"

→ Choice-Chips: **[Schadensberatung] [Haftpflichtschaden] [Wertgutachten] [Gegengutachten]** → setzt `anliegen`.

**Globale Regeln:**
- **Name + Telefon immer im letzten Schritt**, nie mid-flow.
- **Keine E-Mail** wird erhoben — der 25€-Tankgutschein wird **manuell** versendet.
- **Eine Anfrage pro Pfad**, am Terminal-Schritt (bündelt alle Antworten), nicht mid-flow.

### Pfad 1 — Schadensberatung
1. Monika: kurze Einordnung (1–2 Bubbles).
2. Zwei Aktionen: **[Jetzt anrufen]** (navy, `tel:`) + **[Rückruf anfordern]** (ondo).
3. **Rückruf** → Kontaktdaten (Name + Telefon) → Anfrage.
   **Anruf** → `tel:`-Link (Nummer siehe §3), keine Anfrage nötig (direkter Call).
- gfa: `anliegen=schadensberatung`.

### Pfad 2 — Haftpflichtschaden (Hauptpfad)
1. **Unversehrtheits-Note** (plain, kein Input): „Ich hoffe, Sie sind unversehrt."
2. **Unfalltyp** (Chips): [Auffahrunfall] [Spurwechsel] [Vorfahrt] [Parken] [Sonstiges] → `unfalltyp`.
3. **Schuldfrage** (Chips): [Unverschuldet] [Nicht sicher] → `schuld_einschaetzung`.
   - **Nicht sicher** → Monika: Einordnung; Aktionen **[Jetzt anrufen]** + **[WhatsApp]** → Kontaktdaten → Anfrage. **Keine Termin-Strecke.**
   - **Unverschuldet** → Bestätigung: Kosten (Anwalt / Gutachter / Mietwagen) trägt die Gegenseite. Dann **Termin-Strecke**:
     1. **Wunsch-Tag** (Chips): [Morgen] [Übermorgen] [So schnell wie möglich] → `wunsch_tag`.
     2. **Wunsch-Zeit** (Chips): [Vormittag] [Nachmittag] [Abend] → `wunsch_zeit`.
     3. Bestätigung (plain): „Der Gutachter hat zu der Zeit Kapazität." (**keine echte Kalenderbuchung**.)
     4. **Kontaktdaten** (Name + Telefon).
     5. **25€-Tankgutschein-Visual** (gold).
     6. Abschluss-Bubble.
- gfa: `anliegen=haftpflichtgutachten`, `unfalltyp`, `schuld_einschaetzung`, (bei unverschuldet) `wunsch_tag`, `wunsch_zeit`.

### Pfad 3 — Wertgutachten
1. **Grund** (Chips): [Reparatur] [Verkauf] → `bewertungsgrund`.
2. **Termin-Strecke** wie Pfad 2 (`wunsch_tag` + `wunsch_zeit`) + Telefonat-Option + **[WhatsApp]**.
3. **Kontaktdaten** → Anfrage.
- gfa: `anliegen=wertgutachten`, `bewertungsgrund`, `wunsch_tag`, `wunsch_zeit`.

### Pfad 4 — Gegengutachten
1. Monika: kurze Einordnung. **Nur [Rückruf anfordern].**
2. **Kontaktdaten** → Anfrage.
- gfa: `anliegen=gegengutachten`.

---

## 2. Datenmodell — gfa-Spalten

Tabelle: **`gutachter_finder_anfragen`** (die *einzige* Anfragen-Tabelle). Eine Anfrage pro Pfad am Terminal-Schritt.

**Neue Spalten** (additiv, alle nullable — jeder Pfad füllt nur seine; Migration via Supabase-Plugin, AGENTS.md Regel 2):

| Spalte | Typ | CHECK-Werte |
|---|---|---|
| `anliegen` | text | `schadensberatung`, `haftpflichtgutachten`, `wertgutachten`, `gegengutachten` |
| `unfalltyp` | text | `auffahrunfall`, `spurwechsel`, `vorfahrt`, `parken`, `sonstiges` |
| `schuld_einschaetzung` | text | `unverschuldet`, `nicht_sicher` |
| `bewertungsgrund` | text | `reparatur`, `verkauf` |
| `wunsch_tag` | text | `morgen`, `uebermorgen`, `asap` |
| `wunsch_zeit` | text | `vormittag`, `nachmittag`, `abend` |

**Wiederverwendet:** `vorname`, `nachname`, `telefon`, `source`, `variante` (= `'A'`), `embed_site_id`, `cluster`, `stadt_slug`, `dsgvo_zustimmung_am`. **Keine** `email`.

> **Verifikation bei Migration:** exakte Spaltennamen/-typen + Nicht-Kollision werden vor der Migration gegen das Live-Schema geprüft (Supabase-Plugin `list_tables`/`execute_sql` READ). Begründung: `unfalltyp` ≠ `schadentyp` (existiert bereits, andere Semantik) — daher dedizierte neue Spalten, kein Reuse.

---

## 3. Zuweisung & Nummern (backend-technisch)

Die Zuweisung „welchem Gutachter gehört die Anfrage" ist **strukturell**, nicht algorithmisch:

### sv_embed (SV hat eigenes Embed auf seiner Seite)
- Zuweisung **strukturell via `embed_site_id`** → `embed_sites.inhaber_profile_id` / `sv_id`. `zugeordneter_sv_id` bleibt **NULL** (die SV-Inbox scoped über `embed_site_id`, nicht über `zugeordneter_sv_id`).
- **SV-Inbox:** View `v_sv_inbox` (scoped `embed_site_id` → `inhaber_profile_id = auth.uid()`).
- **WhatsApp-Notify:** `notifyAnfrage` → `site.baileys_routing_nummer`.
- **`tel:`-Nummer (Anruf-Button):** **NEUE Spalte `embed_sites.sv_telefon`**.

### cluster-LP (Claimondo-Marketing-Landingpages)
- Anfrage entsteht mit Status **`neu`** → läuft **zentral ins Dispatch** (round-robin, für alle Dispatcher verfügbar). `zugeordneter_sv_id` wird später im Dispatch gesetzt.
- **WhatsApp-Notify:** zentrale Nummer via `KFZ_LP_BAILEYS_TARGET`-Env.
- **`tel:`-Nummer:** zentrale Claimondo-Nummer **+49 1515 3608515** (`4915153608515`). Anfragen landen beim Claimondo-eigenen WhatsApp → Team-Bearbeitung.

> **Env-Change (VPS, Aarons Task):** `KFZ_LP_BAILEYS_TARGET=4915153608515` (falls noch nicht gesetzt). Nicht in Git.

---

## 4. Visual-Layer (impeccable · Claimondo-Tokens · Light · mobile-first)

**Register:** product. **Szene:** gestresstes Unfallopfer, am Handy, braucht Beruhigung → **Light-Theme**, warm, beruhigend, **keine Glas-Deko**.

**Farb-Rollen (bewusst, nicht dekorativ):**

| Element | Token |
|---|---|
| Header + Primär-CTA „Jetzt anrufen" | navy `#0D1B3E` |
| Kunde-Antwort-Bubbles + Chip-Rand | ondo `#4573A2` |
| Monika-Bubbles | weiß auf bg `#f8f9fb` |
| 25€-Tankgutschein | gold `#C9A961` (greift die Siegel-Sterne auf) |
| online-Dot / „unversehrt"-Marker | emerald (semantisch, bleibt grün) |

**Anatomie:**
- **FAB (geschlossen):** inline **Siegel-SVG** (navy Kreis, „CLAIMONDO PARTNER · UNFALL ASSISTANCE", Schild+Haken, 5 gold Sterne), ~62px, weicher Schatten.
- **Hover-Pill (Desktop):** beim Hover fährt links eine Pill aus — Monika-Mini-Avatar + zweizeilig **„Claimondo"** (navy fett) / **„Schadensberatung"** (ondo). Retract bei mouse-leave. Ease-out-expo ~200ms.
  - **Mobile (kein Hover):** einmaliger **Auto-Peek** derselben Pill ~1,5s nach Laden, ~3s sichtbar, dann zurück.
  - **Unterdrückt**, sobald Teaser läuft oder Chat offen ist (nie zwei Bubbles gleichzeitig).
- **Panel (offen):**
  - **Header (navy):** Monika-Foto (rund) · **„Monika"** · **„Schadenberaterin"** · ● online · 🔊/🔇 Mute · ✕.
  - **Chat-Area:** bg `#f8f9fb`.
  - **Monika-Bubbles:** weiß, links, Mini-Avatar daneben.
  - **Kunde-Antwort-Bubbles:** ondo, rechts, weiße Schrift.
  - **Choice-Chips:** weiß, ondo-Rand, navy-Text, große Tap-Targets, gestapelt.
  - **Primär-CTA** (Jetzt anrufen): navy. **Sekundär** (Rückruf / WhatsApp): ondo-outline.
  - **25€-Tankgutschein:** gold Karte.
- **Responsive:** Desktop ~380×600 Karte bottom-right; Mobile Sheet von unten.

**Emotionaler Bogen:** geschlossen = **Siegel** (Institution, Vertrauen) → Tap → öffnet zu einem **Menschen** (Monika). Badge → Person.

**Assets:** Siegel **inline** (Vektor, ~1KB gzip); `monika.png` als **URL** (`public/embed/monika.png`, ~256px optimiert); Sounds als URLs (§7). Gzip-Budget Bundle **<30KB** (Foto/Sounds extern, kein Inline). Typo: system/Inter-Stack (Shadow-DOM isoliert).

---

## 5. Multi-Message-Player

Der Flow ist ein **Skript aus Schritten**: `{ id, messages: string[], then: chips | actions | input }`.

Ein **Message-Player** spielt pro Schritt: für jeden Chunk → **Typing-Indicator** → **Bubble-Reveal** → nächster Chunk; nach dem letzten → `then` (Chips / Action-Buttons / Input) erscheinen.

- **Typing-Dauer** ≈ `clamp(chunkLänge × 35ms, 500, 1200)`; Gap ~250ms.
- **`prefers-reduced-motion`** → alle Chunks sofort, kein Typing.
- **Zwei Modi:** `live` (Typing + Sound) vs `instant-silent` (History-Replay beim Resume, §8).

---

## 6. Proaktiver Teaser (Scroll-getriggert)

**Trigger:** `scrollY / (scrollHeight − innerHeight) ≥ 0.30` — page-length-relativ. Implementierung: **passiver, rAF-gedrosselter Scroll-Listener** (kein injizierter Sentinel ins Host-DOM), koppelt nach dem Feuern ab.
- **Edge-Cases:** Seite nicht scrollbar / 30% above-the-fold → **Zeit-Fallback ~8s**. **Min-Dwell ~3s** auch beim Scroll-Trigger.

**2-Beat-Drip:**
- **Beat 1** (30% Seite A): „Hi, grüße Sie! 👋" als **Peek** (Tipp-Punkte deuten an, dass mehr kommt). **Stumm** (Autoplay-Block vor erster Geste + Etikette).
- **Beat 2** (nur wenn Beat 1 *gezeigt, nicht weggeklickt, nicht geöffnet* **und** [neue Seite @30% **ODER** dieselbe Seite @70%] **und** ≥20s seit Beat 1): „Kein Stress, lassen Sie sich Zeit. 😊 Ich helfe bei Unfall, Gutachten oder Wertgutachten — tippen Sie einfach an."
- **Max 2 Beats / Session.** Danach Stille.

**Frequenz & Gedächtnis:**
- 1 Sequenz / Session (`sessionStorage`).
- **✕ → 2 Tage Ruhe** (`localStorage`-Stempel).
- **Nie** wenn `engaged` (laufendes Gespräch) oder `completed`.
- `prefers-reduced-motion` → kein Typing-Tanz.

**Continuity-Trick:** die Teaser-Nachricht *ist* Monikas erste echte Zeile. Tap → Vollchat öffnet, die Zeile steht schon da, dann tippt sie die Vorstellung + Frage weiter → die persönliche Vorstellung ist die **Belohnung fürs Antippen**, nicht im Teaser verbraucht.

---

## 7. Sound

Zwei Events, beide als URL aus `public/embed/sounds/`:

| Event | Datei | Wann |
|---|---|---|
| **Incoming** (Monika-Nachricht) | `monika-incoming.mp3` (`universfield-…`, 77KB) | **1× pro Monika-Turn** (erste Bubble), Min-Gap ~1s |
| **Sent** (Antwort eingereicht) | `monika-sent.mp3` (`…message-envoye-iphone`, 16KB) | bei **Chip-Klick + finalem Kontakt-Absenden** |

**Autoplay-Realität (zwingt das Design):** Browser blocken Ton **ohne vorherige Nutzer-Geste** (Scrollen zählt nicht). Daher:
- **Proaktiver Teaser bleibt stumm** (technisch geblockt *und* unaufgefordertes Geräusch = feindselig).
- Sound startet erst nach dem **FAB-Tap** — dieser Tap **entsperrt** die Audio-Engine (`AudioContext` synchron im Click-Handler `resume()`-n). Ab da spielt jede Monika-Bubble den Ton.

**Technik:** Web Audio API (`AudioContext` + dekodierte Buffer, niedrige Latenz, Gain-Node). Beide MP3s on-first-gesture fetchen + dekodieren. **Gain ~0.4** (dezenter Blip). Fallback `no-op` bei fehlendem Web-Audio.

**Mute:** 🔊/🔇 im Header, **`localStorage`-persistiert**, default **AN**. 1 Tap stumm + gemerkt.

**Nicht** abspielen: History-Replay beim Resume (kein Ton-Gewitter für den Backlog).

> **Lizenz-Hinweis (Aarons Entscheidung, blockt nicht):** der Sent-Ton ist ein Apple-System-Sound-Nachbau — Marken-/Lizenz-Check empfohlen vor Prod.

---

## 8. Übergreifender Chat / Resume (Resume B)

**Ziel:** eine **durchgehende Unterhaltung über Seitenwechsel** hinweg („am gleichen Punkt weiter").

**Storage:** **`sessionStorage`** (überlebt Seitenwechsel im selben Tab, stirbt mit dem Besuch = **pro Besuch**). Key pro Embed: `monika:<siteId|cluster>:state`.

**Persistierter State:** `{ v, open, path, stepId, answers, history }` — `answers` = wachsendes gfa-Payload, `history` = gezeigte Bubbles (`{role, text}`, gedeckelt auf ~40).

**Zustands-Logik (eine Quelle):**
- `cold` (keine History) → Teaser-fähig.
- `engaged` (History vorhanden) → Resume, **kein kalter Teaser**.
- `completed` (Anfrage abgesendet) → Ruhe.

**Resume-Render auf Folgeseite (1b — auto-open, viewport-bewusst):**
- **Desktop:** Panel **auto-öffnet** (schwebende Eck-Karte, verdeckt nur die Ecke). History **instant + stumm** gerendert, scrollt nach unten, aktueller Schritt läuft **live** weiter.
- **Mobile:** **Resume-Peek** (Monika + letzte Zeile + „weiter ↑"), Tap → volles Sheet. *Begründung:* ein Vollbild-Auto-Takeover auf jeder Folgeseite würde das eigentliche Seitenziel verdecken → der Peek ist die mobile Form von „offen".
- `completed` → FAB bleibt zu; beim Öffnen „Danke, wir melden uns 😊".

**Gehärtet:** Storage aus / Private-Mode → `try/catch` → In-Memory-Fallback (funktioniert auf der Seite, nur nicht übergreifend). `v`-Versionsfeld → bei Schema-Mismatch nach Deploy verwerfen + Kaltstart. Pro Origin getrennt (kein Cross-Site-Leak).

---

## 9. Architektur / Module (für die Plan-Phase)

| Modul | Zweck |
|---|---|
| `script.ts` | 4-Pfad-Skript-Definition (Steps, messages, then) — eine Quelle der Journey |
| `message-player.ts` | Chunk-Renderer mit Typing (live / instant-silent) |
| `store.ts` | Widget-State + `sessionStorage`-Persistenz (Resume) + `localStorage` (dismiss / mute) |
| `teaser.ts` | Scroll-Trigger + 2-Beat-Drip + Frequenz-Gedächtnis |
| `sound.ts` | `AudioContext`-Unlock + Buffer-Cache + `play(incoming\|sent)` + Mute |
| `submit` (`api.ts`) | gfa-Anfrage am Terminal-Schritt; reagiert auf `funnel_modus`-Response (#2502) |
| `boot` (`index.tsx`) | sv_embed (Config) vs cluster (`data-*`), Shadow-DOM, FAB, Hover-Pill, Theme |

Jedes Modul: ein klarer Zweck, testbar isoliert. **Gzip-Budget <30KB** beachten.

---

## 10. Out of Scope / Später

- Variante-B-Whitelabel-Theming dieses Flows.
- Per-Site-Konfiguration (Teaser an/aus, Schwelle, Copy, Sound) via `embed_sites`.
- Echte Kalenderbuchung (A-Flow bestätigt nur „Gutachter hat Kapazität").
- Tage-übergreifender Resume (nur pro Besuch).
- Mid-flow-Resume über Schema-Versionen hinweg (`v`-Feld verwirft erstmal bei Mismatch).

---

## 11. Akzeptanzkriterien

1. **Journey:** alle 4 Pfade vollständig durchspielbar; jeder Pfad erzeugt **genau eine** gfa-Anfrage am Terminal-Schritt mit den korrekten Spalten.
2. **Daten:** 6 neue gfa-Spalten additiv + CHECK-Constraints; bestehende Spalten wiederverwendet; keine E-Mail.
3. **Zuweisung:** sv_embed strukturell via `embed_site_id` (zugeordneter_sv_id NULL); cluster-LP → Dispatch `neu`. `tel:`-Nummern korrekt (sv_telefon / zentrale Nr).
4. **Visual:** FAB = Siegel; Hover-Pill (Desktop) / Auto-Peek (Mobile); Header mit Monika-Foto + „Schadenberaterin"; Claimondo-Tokens, kein Inline-Hex.
5. **Chat-Feel:** mehrere kurze Bubbles mit Typing dazwischen; Emojis; getippte Vorstellung.
6. **Teaser:** 30%-Scroll-Trigger (page-length-relativ); 2-Beat-Drip; 1/Session + 2-Tage-Ruhe nach ✕; stumm; reduced-motion respektiert.
7. **Sound:** Incoming 1×/Turn, Sent bei Submit; Unlock erst nach Geste; Mute persistiert; History-Replay stumm.
8. **Resume:** durchgehender Chat über Seitenwechsel (`sessionStorage`, pro Besuch); Desktop auto-open, Mobile Resume-Peek; History instant+stumm; gehärtet.
9. **Build:** `npm run build` grün; `build:embed` + `typecheck:embed` grün; Gzip <30KB; token-audit grün.
