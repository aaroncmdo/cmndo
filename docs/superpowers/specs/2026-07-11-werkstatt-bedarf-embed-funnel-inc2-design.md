# Werkstatt-Bedarf — Embed-Foto-Funnel (Inc 2) — Design

**Datum:** 2026-07-11
**Ziel:** Der öffentliche Embed-Werkstatt-Finder (`/embed/werkstatt-finder`) lässt den anonymen Besucher **optional ein Schadenfoto** einbringen; daraus wird der Reparatur-Bedarf abgeleitet und die Werkstatt-Liste **qualifiziert** (Fit-Chips). Adressiert Aarons Ursprungs-Fall („nicht jede Werkstatt macht Lackierung — der Standalone-Finder zeigt trotzdem alle").
**Baut auf:** Inc 1 (`docs/.../2026-07-11-werkstatt-bedarf-qualifizierung-design.md`) — Resolver + `qualifiziereWerkstaetten` + Fit-UI existieren.

## Entschieden (Aaron 11.07.)
- **Funnel-Form: INLINE** — Foto-Upload + Standortfeld beide auf dem ersten Screen, Foto **optional**. Foto vorhanden → Re-Qualifizierung in-place.
- **Architektur:** Foto **transient** klassifizieren (base64, kein Speichern); Foto + Bedarf **erst bei Conversion** an den erzeugten Lead hängen. Kein verfrühter Lead, kein Anon-Foto-Müll, datensparsam. + **Abuse-Guard** am öffentlichen Vision-Endpoint.

## Ist-Zustand
`WerkstattFinderEmbedClient.tsx`: ein Screen — Standort (PLZ/Ort) → `sucheEchteWerkstaetten`/`sucheWerkstaettenNachOrt` → `WerkstattFinderMap` (rendert `WerkstattFinder`, hat seit Inc 1 Fit-Chips, aber hier ohne `fit`, da kein Bedarf) → Werkstatt wählen → Kontaktform → `erstelleWerkstattFinderLead` → Lead + FlowLink → `/flow`. Kein Foto, keine Qualifizierung.

## Architektur (maximale Wiederverwendung von Inc 1)

**Datenfluss (Foto bleibt client-seitig base64 bis Conversion):**
```
Foto (client, base64) ──► klassifiziereSchadenfotoEmbed(base64[]) ──► Reparaturbedarf (state)
                                                                          │
Standort ──► sucheEchteWerkstaetten({lat,lng,plz, bedarf?}) ◄────────────┘
                          │
                          ▼ qualifiziereWerkstaetten (Inc 1) → {werkstaetten(+fit), keineSpezialisierte}
                          ▼ WerkstattFinderMap → WerkstattFinder (Fit-Chips, Inc-1-UI)
Conversion ──► erstelleWerkstattFinderLead({..., fotos: base64[]?, bedarf?})
                          ▼ Lead anlegen → Fotos in Storage (leads.schadensfoto_urls) + lead.bedarf_* persistieren
```

**Neu / geändert:**
1. **Vision base64:** `src/lib/ai/vision/client.ts` → `buildImageBlocksBase64(images: {data,media_type}[])` (Spiegel von `buildImageBlocks`, aber `source.type='base64'`). ODER eine `klassifiziereSchadenbildBase64`-Variante in `bedarf/schadenbild-gewerke.ts`. Fail-safe-Contract bleibt (Fehler/leer → `{kategorien:[], confidence:0}`).
2. **Neue Server-Action** `klassifiziereSchadenfotoEmbed(bilder: {data:string; media_type:string}[]): Promise<Reparaturbedarf>` (in `embed/werkstatt-finder/actions.ts`). Ruft die base64-Klassifizierung → mappt zu `Reparaturbedarf` (quelle `'schadenbild'`). **Abuse-Guard** (s.u.).
3. **`sucheEchteWerkstaetten`/`sucheWerkstaettenNachOrt`** um optionales `bedarf?: Reparaturbedarf` erweitern → wenn gesetzt: `qualifiziereWerkstaetten(rows, bedarf)` → Rückgabe `{ werkstaetten: Qualifiziert<Row>[]; keineSpezialisierte }` (analog Inc-1-Claim-Finder). Ohne `bedarf` = heutiges Verhalten (unbekannt-Zustand, kein Regress).
4. **`erstelleWerkstattFinderLead`** um optionales `fotos?: {data,media_type}[]` + `bedarf?: Reparaturbedarf` erweitern → NACH Lead-Anlage (admin client): Fotos in Storage hochladen + `leads.schadensfoto_urls` setzen + `lead.bedarf_*` persistieren (Muster wie `uploadSchadensfotoKunde`, aber server-seitig aus base64). Non-kritisch (try/catch — ein Upload-Fail bricht die Lead-Anlage/Redirect nicht).
5. **`WerkstattFinderEmbedClient.tsx`**: Foto-Upload-Zone (mobil `capture`), state `fotos` + `bedarf`; on-upload → `klassifiziereSchadenfotoEmbed` → `bedarf` → Re-Search mit Bedarf; `keineSpezialisierte` an die Karte durchreichen (Inc-1-Prop); bei `absenden` Fotos+Bedarf mitschicken. Kurzer Datenschutz-Hinweis am Foto-Schritt („nur zur Zuordnung analysiert, gespeichert erst beim Absenden").

**Kein Anon-Storage-Bucket nötig:** das Foto reist als base64 (client→server-action); Storage passiert nur in `erstelleWerkstattFinderLead` (admin client, nach Lead-Existenz).

## Abuse-Guard (öffentlicher, paid-API-Endpoint)
`klassifiziereSchadenfotoEmbed` ist anon-aufrufbar → Kosten-/Spam-Vektor. Schutz:
- **max 3 Bilder**, **max ~5 MB** je Bild (server-seitig geprüft; Überschreitung → früh-return `unbekannt`, kein API-Call).
- **Rate-Limit** je IP/Session (bestehende Rate-Limit-Util nutzen falls vorhanden; sonst simpler In-Memory-Token-Bucket). Bei Limit → `{kategorien:[], confidence:0}` (unbekannt, kein API-Call).
- Media-Type-Whitelist (`image/jpeg|png|webp`).

## Datenschutz
Foto zeigt ggf. Kennzeichen (personenbezogen). Transient-Klassifizierung (nicht gespeichert bis Conversion) ist datensparsam. Am Foto-Schritt kurzer Hinweis; die eigentliche Daten-Einwilligung passiert bei Conversion (bestehender `/flow`).

## Test-Strategie
- **Rein:** `buildImageBlocksBase64` (Block-Shape), das `sucheEchteWerkstaetten`-Bedarf-Mapping (mit/ohne bedarf), Abuse-Guard-Limits (>3 Bilder / zu groß → früh-return, kein Vision-Call).
- **Action (gemockt):** `klassifiziereSchadenfotoEmbed` (Vision gemockt → Reparaturbedarf; Guard-Fälle); `erstelleWerkstattFinderLead` Foto/Bedarf-Persist (mocked sb, non-kritisch bei Upload-Fail).
- **Kein neuer UI-Test-Zwang** (WerkstattFinder-Fit ist Inc-1-getestet).

## Koordination
Berührt v.a. `src/app/embed/werkstatt-finder/*` (eigene Lane, kein Overlap mit 6c630247/anderen) + `src/lib/ai/vision/client.ts` (additive base64-Helper). `vermittlung-server.ts` NICHT berührt (Embed hat eigene Actions). Gestackt auf Inc-1-Branch (`kitta/werkstatt-bedarf-embed-funnel`), separater PR → base = Inc-1-Branch bis Inc 1 merged, dann retarget staging.

## Offene Punkte (Impl)
- Rate-Limit-Util: prüfen ob eine existiert (z.B. für andere public actions); sonst minimal bauen.
- Genaues Storage-Ziel für Lead-Fotos (Bucket/Pfad) aus `uploadSchadensfotoKunde` spiegeln (dort `fall-dokumente` claim-basiert; für Lead ggf. `leads.schadensfoto_urls`-only ohne fall_dokumente-Row, da noch kein Claim).
