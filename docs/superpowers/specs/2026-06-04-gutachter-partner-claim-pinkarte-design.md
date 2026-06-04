# gutachter.claimondo.de — Claim-Flow live + Pin-Karte (Standort-Vorbefüllung)

- **Datum:** 2026-06-04
- **Status:** Design freigegeben (Aaron, „akay" 04.06.) → Spec-Review ausstehend
- **Branch:** `kitta/gutachter-partner-pinkarte` (off `origin/staging` @ 19d3b3e67)
- **App:** `claimondo-marketing` (Next, :3006, host-geroutet `gutachter.claimondo.de` → `/gutachter-partner`)
- **Verwandt:** [[project_sv_basic_tier]] (Claim-Flow #2291), [[project_anon_sv_leak_fix]] (#2177/#2208 GRANT), `GutachterFinderMapClient` (Pin-Referenz), [[feedback_marketing_3006_deploy_fragil]]

---

## 1 · Problem / Ist-Zustand

Aaron-Befund auf `gutachter.claimondo.de`: „Wo soll der Gutachter seinen Standort claimen? Die Pins sind nicht auf der Karte." Live-Browser-Probe + Code-Audit ergaben **zwei getrennte Ursachen**:

1. **Claim-Flow ist nicht live (Deploy-Lücke).** Canonical `GutachterPartnerClient.tsx` auf `staging`+`main` rendert bereits `<SvClaimClient />` (4-Schritt-Claim: suche → beanspruchen/neu → bestätigung). Das deployte :3006-Bundle ist aber **veraltet** und zeigt noch das alte Warteliste-Formular (`WaitlistApply`). Klassisches „Code-auf-main ≠ live" (Marketing-:3006 hat kein CI).
2. **Die Karte ist tote Deko (Code-Bug).** Im canonical `GutachterPartnerClient.tsx` ist `updateMap` per `void updateMap` / `void ortLabel` / `void setOrtLabel` stillgelegt und bekommt nie eine PLZ. Ergebnis: immer leeres Deutschland, **0 Marker**, **0 Daten-Requests** (Probe bestätigt). Zusätzlich fehlt der `import 'mapbox-gl/dist/mapbox-gl.css'` → Mapbox-Konsolen-Warnung, Marker/Controls positionieren nicht sauber.

**Anon-Datenschutz-Constraint (hart):** `sv_leads` ist nach #2177/#2208 für `anon` auf `id, lat, lng, ist_aktiv` reduziert (REVOKE + Spalten-GRANT). Ein Karten-Pin darf einem anonymen Besucher **keine SV-Identität** verraten — sonst reißt es genau dieses Leck wieder auf. Auf `gutachter-finden` ist das bereits gelöst: `sv_leads` werden als anonyme **Dead-Pins** gerendert (`addDeadPin`, nur `lat/lng`, nicht klickbar).

## 2 · Ziel

Auf der einen Seite `gutachter-partner`:
- **(Deploy)** Den schon gemergten Claim-Flow live bringen → der SV kann seinen DAT-Eintrag finden + beanspruchen.
- **(Build)** Die Karte mit anonymen Pins der **offenen, claimbaren DAT-Leads** beleben; ein Pin-Klick **befüllt den Standort vor** (zentriert Karte + Radius + setzt PLZ ins Claim-Suchfeld), ohne Identitäts-Leak.

## 3 · Gelockte Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| E1 | **Pin-Klick = Standort-Vorbefüllung** (nicht direkter Claim) | Anon kennt pro Pin nur `lat/lng`; direkter Claim bräuchte Identitäts-Preisgabe → Leak #2177/#2208. Aaron-Wahl 04.06. |
| E2 | **Pins = nur offene/claimbare DAT-Leads** (`claim_status='offen'`/legacy-NULL, `quelle='dat_expert'`, `lat/lng` gesetzt) | Karte zeigt echt claimbare Spots, nicht schon-vergebene; ehrlich. |
| E3 | **Bidirektional** (Ansatz A): Pin→Claim **und** Claim-PLZ→Karte | Belebt die tote `updateMap`-Logik statt sie als Dead-Code zu lassen (Audit-Punkt 4). |
| E4 | **Kein Auto-Submit** der Suche bei Pin-Klick | Pin setzt nur die PLZ ins Suchfeld; der SV ergänzt seinen Namen/drückt selbst „Suchen" → Nudge statt Massen-Enumeration. |
| E5 | **Deploy macht Aaron** | :3006 ohne CI, `deploy-marketing-vps.py` fragil (hat claimondo.de mal kurz auf 502 geworfen). Ich baue + smoke lokal. |
| E6 | **Kein Clustering** (vorerst) | Pool aktuell ~Dutzende; individuelle Dead-Pins wie im Finder. Schwelle als Kommentar hinterlegen. |

## 4 · Architektur & Komponenten

Alle drei Bausteine hängen am gemeinsamen Parent `GutachterPartnerClient` → State-Lift ist der saubere Verdrahtungsweg. Keine Logik wird verschoben, nur ein Daten-Port ergänzt.

```
GutachterPartnerClient (Parent, 'use client')
├── State (neu): pins: SvLeadPin[]   (geladen beim Mount)
│             aktivePlz: string      (Single Source für Karte↔Claim)
├── Map (rechts)
│     • addDeadPin(open leads) — klickbar gemacht (cursor:pointer + onClick)
│     • Pin-Klick → reverseGeocode(lat,lng) → setAktivePlz(plz) + updateMap
│     • import 'mapbox-gl/dist/mapbox-gl.css'  (FIX)
│     • void updateMap/ortLabel/setOrtLabel  ENTFERNT (durch echte Nutzung ersetzt)
└── <SvClaimClient
        initialQuery={aktivePlz}      // Prop NEU (optional)
        onPlzChange={setAktivePlz} /> // Prop NEU (optional) → Claim-PLZ zieht Karte nach
```

### Komponenten-Verträge (Isolation)

- **`SvClaimClient`** — bleibt self-contained. Neue **optionale** Props:
  - `initialQuery?: string` — vorbefüllt das Suchfeld in Schritt „suche" (und sinnvollerweise das PLZ-Feld in Schritt „neu"). Default `''` → identisches Bestandsverhalten, keine Regression.
  - `onPlzChange?: (plz: string) => void` — feuert, wenn der User eine 5-stellige PLZ in Suche/„neu" eingibt. Default `undefined` → no-op.
  - **Keine** Änderung an `sucheSvLeadKandidaten` / `beanspracheSvLead` / `registriereSvBasicNeu`.
- **Pin-Daten** — eine Server-Action, die nur `{ id, lat, lng }[]` offener DAT-Leads liefert (anon-safe Projektion = exakt der GRANT). **Reuse-zuerst:** Falls die bestehende Finder-Action (`lib/actions/gutachter-finder-actions`, liefert `SvLeadPublic[]`) bereits genau das liefert, wird sie wiederverwendet bzw. um einen `nurOffen`-Filter ergänzt — sonst dünne neue Action `ladeOffeneSvLeadPins()`. (Exakter Pfad bei Implementierung verifizieren.)
- **`addDeadPin`** — bestehendes Muster aus `GutachterFinderMapClient` wiederverwenden/portieren; für die Partner-Karte um `cursor:pointer` + Click-Handler erweitert (Finder-Variante bleibt unverändert nicht-klickbar).

## 5 · Datenfluss

1. **Mount:** Parent ruft Pin-Action → `pins`. Map `on('load')` rendert für jeden Pin einen (klickbaren) Dead-Pin.
2. **Pin-Klick:** `reverseGeocode(lat,lng)` (Mapbox, im File schon genutzt) → PLZ. → `updateMap(plz)` (flyTo + Radius-Polygon) + `setAktivePlz(plz)`. `SvClaimClient` erhält `initialQuery=plz` → Suchfeld zeigt die PLZ. **Kein** Auto-Submit.
3. **Claim-PLZ-Eingabe:** Tippt der SV in der Suche/„neu" eine 5-stellige PLZ → `onPlzChange(plz)` → Parent `setAktivePlz` → `updateMap` zieht die Karte nach.

## 6 · Datenmodell / Query

- Tabelle `sv_leads` (Supabase project `paizkjajbuxxksdoycev`).
- Query (server-seitig, Service-Role in der Marketing-App): `select id, lat, lng where quelle='dat_expert' and claim_status in ('offen') /* + legacy NULL */ and lat is not null and lng is not null and ist_aktiv = true`.
- Rückgabe-Projektion **ausschließlich** `id, lat, lng`. Kein Name/Firma/PLZ/Adresse verlässt den Server für die Karte.
- `claim_status`-Werte real: `offen | beansprucht_pending | konvertiert` (P0-Mig 20260601194439). Bei Implementierung verifizieren, ob legacy-Zeilen `NULL` sind → dann `(claim_status = 'offen' OR claim_status IS NULL)`.

## 7 · Privacy

- Pins tragen nur `lat/lng` → keine Identität. Reverse-Geocode arbeitet auf der **geklickten Geo-Position**, nicht auf einer SV-Identität.
- Identitätsauflösung passiert ausschließlich über die bestehende `sucheSvLeadKandidaten`-Suche (server-kontrolliert, liefert Kandidatennamen zum Wiedererkennen) — **unverändert**. Das ist Bestands-#2291-Verhalten, kein neuer Leak.
- Bewusst dokumentiert: PLZ-Suche gibt mehrere Kandidaten einer PLZ zurück (mildes Enumerations-Profil) — **bestehend**, nicht durch dieses Feature eingeführt; E4 (kein Auto-Submit) hält die Schwelle bei aktiver User-Geste.

## 8 · Korrektheits-Fixes (mitgenommen)

- `import 'mapbox-gl/dist/mapbox-gl.css'` ergänzen (behebt Konsolen-Warnung; Marker/Controls).
- `void updateMap` / `void ortLabel` / `void setOrtLabel` entfernen — durch echte Nutzung (E3) ersetzt.

## 9 · Fehlerbehandlung

- Pin-Action-Fehler → leeres `pins`, Karte rendert ohne Pins (kein Crash). Optional: still loggen.
- Reverse-Geocode-Fehler → Pin-Klick zentriert trotzdem per `lat/lng` (flyTo) + Radius; Suchfeld bleibt leer (graceful).
- Kein `NEXT_PUBLIC_MAPBOX_TOKEN` → bestehender „no_token"-Overlay greift; Pins werden nicht versucht.
- Map-Status/Timeout-Diagnostik aus `GutachterFinderMapClient` als Vorbild optional übernehmen (nice-to-have, nicht Pflicht).

## 10 · Testing / Smoke (lokal, vor Übergabe)

- Marketing-Dev-Server (`claimondo-marketing`) lokal starten, `/gutachter-partner` öffnen.
- **Screenshot-Pflicht** (Memory): (a) Pins sichtbar auf der Karte, (b) Pin-Klick → Karte zentriert + Radius + PLZ im Suchfeld, (c) PLZ in Suche tippen → Karte zieht nach, (d) Claim-Suche nach Name findet Kandidat (Bestand).
- Netzwerk-Check: **kein** PII in der Pin-Response (nur id/lat/lng).
- Build-Gate: `npm run build` der Marketing-App grün; Token-Audit (raw-hex nur mit Skip-Header wie im Finder).

## 11 · Deploy / Rollout (Aaron)

- Ein Deploy bringt **beides** live: Claim-Flow (schon auf main) + Pins (dieser Branch, nach Merge).
- Ablauf: PR `--base staging` → Review/Merge → Aaron tar't current Marketing-Source → `deploy-marketing-vps.py` (mit `VPS_SSH_PASSWORD`). Ich liefere den fertigen Branch + lokalen Smoke-Beweis.
- **Script-Verbesserung:** Verify-Schleife in `deploy-marketing-vps.py` um `/gutachter-partner` ergänzen (prüft aktuell nur `/`, `/kfz-gutachter`, `/schaden-melden`).

## 12 · Out of Scope

- Direkter „Pin = Claim" (Identitäts-Gate / Leak-Risiko).
- Änderungen an `sucheSvLeadKandidaten` / Claim-Actions.
- Clustering / Heatmap.
- Änderungen an `gutachter-finden` (Referenz bleibt unangetastet).

## 13 · Akzeptanzkriterien

1. `/gutachter-partner` zeigt anonyme Pins der offenen DAT-Leads (Map nicht mehr leer).
2. Pin-Klick: Karte zentriert + 30-km-Radius + PLZ steht im Claim-Suchfeld; **kein** Auto-Submit; **kein** Name/Identität sichtbar.
3. PLZ-Eingabe im Claim zieht die Karte nach (E3).
4. Pin-Response enthält ausschließlich `id/lat/lng` (Netzwerk-verifiziert).
5. `mapbox-gl.css` importiert; keine Mapbox-CSS-Warnung; kein `void`-Dead-Code mehr.
6. Marketing-Build grün; lokaler Smoke mit Screenshots dokumentiert.
7. Nach Aaron-Deploy: Live-:3006 zeigt Claim-Flow (nicht Warteliste) + Pins.

## 14 · Risiken / Offene Punkte

- **R1 Deploy-Fragilität** (:3006, [[feedback_marketing_3006_deploy_fragil]]) — Mitigation: Aaron deployt, temp-build→atomar; `/gutachter-partner` in Verify aufnehmen.
- **R2 Finder-Action-Reuse** — exakter Pfad/Signatur der `SvLeadPublic`-Action im canonical (`app/[locale]`) Marketing-Layout bei Implementierung verifizieren (im makler-`src/app`-Layout lag sie unter `lib/actions/gutachter-finder-actions`).
- **R3 `claim_status`-Legacy-NULL** — Filter ggf. `('offen' OR NULL)`; per `execute_sql` (READ) gegen Live-DB prüfen.
- **R4 Marketing-App-Deps** — Worktree off staging hat keine `node_modules` in `claimondo-marketing/`; vor lokalem Build `npm install` dort.
