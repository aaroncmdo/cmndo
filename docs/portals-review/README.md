# Portals-Review-Toolkit

Sammelt Screenshots aller Routen in den drei Portalen (Gutachter / Dispatch / Kunde) für strukturierte Design- und Code-Reviews. Ergänzt durch einen Architektur-Walkthrough für jedes Portal.

## Vorbereitung (einmalig)

```bash
# 1. Playwright-Browser installieren
npx playwright install chromium

# 2. Test-User mit Daten seeden (falls noch nicht passiert)
#    Erzeugt test-sv@/test-dispatch@/test-kunde@claimondo.de mit Passwort Test1234!
npx dotenv -e .env.local -- npx tsx src/scripts/seed-test-data.ts
```

## Screenshots erzeugen

Lokalen Dev-Server starten:
```bash
npm run dev
```

In zweitem Terminal:
```bash
# Alle drei Portale (Gutachter + Dispatch + Kunde)
npm run screenshots

# Einzelnes Portal
npm run screenshots:gutachter
npm run screenshots:dispatch
npm run screenshots:kunde

# Alternativ gegen Staging/Produktion
SCREENSHOT_BASE_URL=https://staging.claimondo.de npm run screenshots
```

Output:
```
docs/portals-review/screenshots/
├── gutachter/
│   ├── INDEX.md                    ← Übersicht aller PNGs + Routen
│   ├── gutachter-dashboard-desktop.png
│   ├── gutachter-dashboard-mobile.png
│   ├── auftraege-liste-desktop.png
│   ├── auftraege-liste-mobile.png
│   ├── ...
│   └── fall-detail-desktop.png     ← dynamisch aufgelöste ID
├── dispatch/
│   └── ...
└── kunde/
    └── ...
```

Für jede Route werden zwei PNGs erzeugt:
- **Desktop** (1440×900, scaleFactor 1)
- **Mobile** (390×844, scaleFactor 2 — iPhone-14-typisch)

Animations werden vor dem Screenshot deaktiviert für stabile Screenshots ohne flickern.

## Wie Du das Output verwendest

### Variante A — Visual-Review via Claude.ai (mit Vision)

1. Lade die PNG-Dateien des Portals in eine neue Claude.ai-Session hoch (Drag-and-Drop)
2. Frag z. B.: *„Review-Auftrag: Sieh dir die Screenshots des SV-Portals an. Bewerte: Hierarchie, Spacing, Konsistenz der CI-Tokens, Mobile-Responsive-Probleme, ungewöhnliche Pattern. Liste Findings mit Screenshot-Referenz."*
3. Claude.ai mit Vision liefert konkretes Findings-Listing mit Bildbezug

### Variante B — Visual-Review mit Designer (Mensch)

1. Zip-Bundle: `cd docs/portals-review/screenshots && zip -r portals.zip .`
2. Schick zip + Link zum Walkthrough-Doc im Repo
3. Designer kommentiert direkt auf Screenshots (Figma, etc.)

### Variante C — Code-Review via /ultrareview

`/ultrareview` ist ein Multi-Agent-Cloud-Review (siehe Claude-Code-Settings). Du kannst es nicht aus einer Agent-Session triggern — manuell starten:

```text
# In deiner aktuellen Claude-Code-Session:
/ultrareview
```

Das bündelt deinen lokalen Branch und schickt ihn zur Review. Mehrere Agents prüfen parallel auf:
- Code-Smells / Anti-Pattern
- Security-Issues
- TS-Type-Probleme
- Performance-Risiken
- Accessibility

Für portal-spezifische Reviews:
```text
/ultrareview <PR-Nummer>     # PR-bezogen
```
oder du erstellst dir vorab ein Review-Branch das nur die relevanten Dateien (gutachter/**, dispatch/**, kunde/**) enthält und triggerst `/ultrareview` darauf.

## Walkthroughs (Architektur)

Pro Portal gibt es ein Markdown-Doc mit:
- Routen-Map (URL → Server-/Client-Component → wichtigste Komponenten)
- Datenfluss (welche Server-Action ändert was, woher kommen Props)
- Bekannte Stolperstellen / Patterns

| Portal | Walkthrough |
|---|---|
| Sachverständiger | [`sv-walkthrough.md`](./sv-walkthrough.md) |
| Dispatch | [`dispatch-walkthrough.md`](./dispatch-walkthrough.md) |
| Kunde | [`kunde-walkthrough.md`](./kunde-walkthrough.md) |

## Empfohlener Review-Ablauf

1. **Setup einmal** — `npx playwright install chromium` + `npx dotenv -e .env.local -- npx tsx src/scripts/seed-test-data.ts`
2. **Screenshots erzeugen** — `npm run screenshots`
3. **Visual-Review starten** — Variante A oder B (siehe oben)
4. **Code-Review parallel** — `/ultrareview` in eigener Session laufen lassen
5. **Ergebnisse mergen** — Findings aus beiden Reviews in eine Issue-Liste / Linear-Tickets übersetzen
6. **Anpassungen umsetzen** — Markdown-Tickets, je Finding ein PR

## Limits

- Public-Token-Pages (`/flow/[token]`, `/kunde/re-termin/[token]` etc.) werden nicht abgedeckt — Token-Resolution würde Auth-Flow umgehen
- Onboarding-Wizards werden nicht durchklickert (Step-State wird nicht persistiert) — manuell screenshoten falls relevant
- Pages die spezifische DB-State erfordern (z.B. „Termin verpasst"-Status) sind ggf. leer wenn die Test-Daten den State nicht herstellen → seed-test-data.ts entsprechend erweitern
- Dynamische Routes nutzen jeweils den ersten Treffer aus Liste — bei mehreren Cases nur eine Variante im Bild

## Wenn etwas nicht klappt

| Symptom | Ursache | Fix |
|---|---|---|
| `Login redirected to /login` | Test-User existiert nicht | `npx dotenv -e .env.local -- npx tsx src/scripts/seed-test-data.ts` |
| Leere Listen-Pages | Keine Test-Fälle in der DB | Seed-Script ausführen, ggf. erweitern |
| Timeouts auf Realtime-Pages | networkidle wird nicht erreicht | Script wartet 10s, dann Screenshot ohnehin — meist OK |
| Browser-Launch-Fehler | Chromium nicht installiert | `npx playwright install chromium` |
| 2FA-Pflicht greift | Test-User hat 2FA aktiv | Profile-Eintrag: `twofa_aktiviert=false` (siehe Memory `project_e2e_test_users.md`) |
