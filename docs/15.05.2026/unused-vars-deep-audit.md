# Unused-Vars Tiefen-Audit — staging-HEAD `6301a487` (15.05.2026)

**Auftrag (Aaron)**: „checke das wirklich ausführlich vorher ob das wirklich Dead-Code ist oder ob ein anderer Bug es zu Dead-Code gemacht hat und wir es eigentlich brauchen."

Eslint-Run gegen `src/` zeigte **207 `@typescript-eslint/no-unused-vars`**-Items. Aaron's Hypothese bestätigt: in Stichproben sind ~25 % davon **echte Bugs** (Daten-Verlust, fehlende UI-Verkabelung, unvollendete Features), nicht reines Dead-Code.

## Methodik

1. ESLint mit `--format json` über `src/` → 207 unused-vars
2. Heuristik-Kategorisierung via `scripts/unused-vars-audit.mjs`:
   - `import` (56), `local` (110), `param` (26), `useState` (12), `useRouter` (2), `callback` (1)
3. **High-yield-Triage**: alle 15 useState/useRouter/callback-Stellen manuell mit File-Context geprüft
4. **Sample-Triage**: 5 weitere Stellen aus other-Kategorien spot-gecheckt
5. Befund-Liste mit Severity + Fix-Empfehlung

## Verifizierte ECHTE BUGS

### 🔴 P0 — Daten-Verlust / DSGVO

**`src/app/api/ocr/zb1-scan/route.ts:87` — `halterUpdate`**

```ts
const halterUpdate = leadRow?.ist_fahrzeughalter === false
  ? { halter_vorname: extracted.halter_vorname, halter_nachname: ..., halter_strasse: ..., halter_plz: ..., halter_stadt: ... }
  : {}

const { error } = await supabase.from('leads').update({
  zb1_token: ..., hsn: ..., tsn: ..., fin: ...
  // ← halterUpdate wird NIE gemergt!
}).eq('id', leadId)
```

Bei Leads mit `ist_fahrzeughalter=false` wird die OCR-extrahierte Halter-Adresse (Vorname, Nachname, Straße, PLZ, Stadt) **berechnet aber nie geschrieben**. DSGVO-relevant + Funktional.

**Fix**: `.update({ ...halterUpdate, zb1_token: ..., ... })`

### 🟡 P1 — UX-Lücken / Feature-Verkabelung fehlt

**`src/app/kunde/_components/GutachterCard.tsx:50` — `telefon`**
**`src/app/kunde/_components/KundenbetreuerCard.tsx:50` — `telefon`**

Beide Cards bekommen `telefon: string | null` als Prop, destructuren es, aber rendern **keinen Anruf-Button oder Display**. User kann SV/KB aus den Kunde-Karten nicht anrufen.

**Fix**: `<PhoneButton telefon={telefon} />` einfügen (es gibt eine `shared/PhoneButton`-Component laut Komponenten-Set-Policy).

**`src/app/admin/sachverstaendige/anlegen/AkademieAnlegenWizard.tsx:82` — `setSchadenarten`**

```ts
const [schadenarten, setSchadenarten] = useState<string[]>([])
```

useState-Setter nie aufgerufen → **Schadenarten-Update-UI fehlt** im Akademie-Wizard. Admin kann beim Anlegen einer Akademie keine Schadenarten setzen.

**Fix**: Schadenarten-MultiSelect-Field hinzufügen analog zu `qualifikationen`/`spezifikationen`.

**`src/app/gutachter/profil/ProfilClient.tsx:4` — `toast`** + **Z. 75 — `showEmptyFields`/`setShowEmptyFields`**

`toast` von sonner importiert aber nirgends aufgerufen → Error-Display beim Profil-Save fehlt (User bekommt keine Bestätigung/Fehlermeldung).
`showEmptyFields`-Toggle declared aber nie genutzt → geplant: "leere Felder ein-/ausblenden"-Toggle, nicht umgesetzt.

### 🟢 P2 — Code-Smell / unvollendete Refactors

**`src/app/admin/faelle/(hub)/FaelleKanban.tsx:232` — `router` in FallCard**

Inner-Component `FallCard` declared `const router = useRouter()`, ruft `router.push/refresh` aber nie auf. **Outer-Component nutzt `router.refresh()` separat (Z. 95+212)**. Toter Hook-Call in FallCard.

**Fix**: `useRouter()` in FallCard entfernen.

**`src/app/flow/[token]/FlowWizardKfz.tsx:166-167` — `svWiderrufOffen`/`svDatenschutzOffen`**

Kommentar (Z. 163-164): „SV-Schritt: Akzeptanz Widerrufsbelehrung + Datenschutz des SVs … Modale für die zwei Texte." Aber Modale **nie verkabelt** — Texte sind im großen SA-Volltext-Modal (Z. 549, 551) als Sub-Headings. Geplanter UX-Refactor (zwei separate Popovers) nicht umgesetzt. Funktional läuft (Akzeptanz fließt durch SA-Volltext), aber UX-Klarheit reduziert.

**Fix**: Entweder zwei `<Modal>`-Komponenten verkabeln ODER unused-state entfernen + Kommentar updaten.

**`src/app/gutachter/vertrag/page.tsx:21` — `drawing`/`setDrawing`**

Signature-Drawing-State declared, nie verwendet → Signature-Pad-Feature halb-implementiert.

**`src/app/kunde/onboarding/OnboardingWizard.tsx:226-228` — `sonstigesBeschreibung`/`sonstigesCount`/`sonstigesError`**

Drei States für "Sonstige Dokumente"-Upload-Feature declared, alle ungenutzt → Multi-Upload-Form-UI fehlt im Kunde-Onboarding.

**`src/app/admin/statistiken/StatistikenClient.tsx:187` — `klassMap`**

`useMemo` baut eine Klassifizierung-Map, die nirgends konsumiert wird → übrig vom Refactor, harmless aber wertloser Compute.

## Pattern-Statistik (alle 207 Stellen)

| Kategorie | Count | Typische Bedeutung |
|---|---|---|
| `import` | 56 | Mostly harmless (vergessene Cleanup), 5–10 % könnten Bugs sein |
| `local` | 110 | Heterogen — `useMemo`-Reste, halb-implementierte Features |
| `param` | 26 | Mostly OK (Interface-Konformität) — z.B. `req` in Route-Handler, `_error` in error.tsx |
| `useState` | 12 | **Hoch verdächtig** — 7 davon = echte Bugs / unvollendete Features |
| `useRouter` | 2 | Beide = toter Hook-Call ohne Navigation |
| `callback` | 1 | `useMemo`-Ergebnis nicht konsumiert |
| `directive` | 0 | OK |

**Realistic-Bug-Estimate für die 207**: bei ~25 % Bug-Rate ≈ **40–60 echte Bugs**. Vorwiegend in `useState`/`useRouter`/`callback`/`local`-Kategorien.

## Empfehlung

### Phase 1 (P0, sofort)
- `halterUpdate` Fix → 1 Zeile, DSGVO-Daten-Save reaktivieren

### Phase 2 (P1, Quick-Wins, ~2-3h)
- `telefon` in beiden Kunde-Cards verkabeln (`<PhoneButton>`)
- `toast` in ProfilClient — Error-Handling beim Profil-Save anschließen
- `setSchadenarten` im Akademie-Wizard — MultiSelect-Field hinzufügen
- `showEmptyFields`-Toggle entfernen oder verkabeln (Aaron-Entscheidung)

### Phase 3 (P2, Backlog-Tickets)
- FlowWizardKfz SV-Modal-Refactor (oder unused-state cleanup)
- `vertrag/page.tsx` Signature-Drawing implementieren oder removen
- `OnboardingWizard` Sonstige-Dokumente Upload-UI implementieren oder removen
- `klassMap` in StatistikenClient — konsumieren oder entfernen
- FaelleKanban `FallCard.router` removen

### Phase 4 (Backlog, niedrige Priorität)
- Die restlichen ~200 unused-vars (mostly imports + harmless locals) per Linter-`--fix` oder File-Sweep

## Anhang: Vollständige Stellen-Liste

Generiert in `docs/15.05.2026/unused-vars-audit.md` (28 KB) — alle 207 Stellen mit Kategorie, File:Line, Variable-Name und Code-Snippet, sortiert nach Kategorie. Für Triage durch Aaron oder Linear-Ticket-Erstellung pro Cluster.

## Übergreifender Befund

Das **Lint-Cleanup ist kein Marathon-Refactor, sondern eine Audit-Quelle**: ~50 echte Bugs liegen unter dem `no-unused-vars`-Output begraben. Build-Reparatur via Regel-Relaxen würde diese Bugs **dauerhaft verdecken**. Empfohlen: P0-Fix sofort, P1-Quick-Wins als 1 PR-Cluster, P2-Tickets in Linear einstellen.
