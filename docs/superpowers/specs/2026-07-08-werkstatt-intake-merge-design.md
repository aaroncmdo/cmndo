# Werkstatt-getriebener Haftpflicht-Intake — Design

**Datum:** 2026-07-08
**Branch (Ziel):** kitta/werkstatt-flow-enrichment, PR gegen `staging`
**Status:** Approved (Aaron „das passt", 08.07.; Korrektur: Unterschrift **primär am
Werkstatt-Gerät**, Link-senden als Zusatz-Option)

## 1 · Ziel & Kontext

Heute hat die Werkstatt auf einer offenen Anfrage (`/werkstatt/anfragen`) **zwei getrennte
Aktionen**: „Bearbeiten" (13 Lead-Felder editieren) und „Flow öffnen/Link senden" (der Kunde
füllt den Flow selbst). Aaron: die Werkstatt soll **alle Datenzeilen sehen + selbst ausfüllen**,
der Kunde soll im nächsten Schritt **nur noch unterzeichnen**. Das führt „Bearbeiten" und
„Flowlink" zu **einem werkstatt-getriebenen Intake** zusammen.

**Scope-Entscheid (Aaron):** Der Intake gilt für **Haftpflicht-Vermittlungen**. Die Werkstatt
füllt die Falldaten (Kunde / Fahrzeug / Unfall / Gegner) → der Kunde unterschreibt nur die
**Sicherungsabtretung (SA)** → Haftpflicht-Claim + 150€ Vermittlungsprämie. Selbstzahler/Kasko
bleibt beim bestehenden schlanken Flow (dort gibt es keine SA — der partielle Claim entsteht
schon im Quali-Step).

**Signatur-Ort (Aaron 08.07., Korrektur):** Die Unterschrift passiert **primär auf dem Gerät der
Werkstatt** — der Kunde ist beim Ausfüllen physisch vor Ort (Tresen-Szenario), die Werkstatt
reicht ihm das Gerät zum Unterschreiben. **„Link an Kunden senden" (auf dessen eigenes Gerät) ist
die zusätzliche Option**, falls der Kunde nicht da ist. Beide Wege nutzen dieselbe
`/flow/[token]`-Signatur-Fläche und unterscheiden sich nur darin, **wer den Link öffnet**
(Werkstatt-Gerät im neuen Tab vs. Kunden-Gerät via Versand). Für die Extraktion / den Branch /
die Fläche ändert sich dadurch nichts — nur die Werkstatt-Aktionen.

**Technischer Entscheid (Aaron):** Approach **C — SA-Step extrahieren**. Der SA-Signatur-Block
wird einmal aus `FlowWizardKfz` in eine geteilte Komponente `SaSignaturStep` gezogen und in
beiden Kontexten genutzt (Flow + neuer Intake). Kein Duplikat, keine Drift.

**Abgeleitete Design-Punkte (mit Scope-Entscheid bestätigt):**
- Die Werkstatt weist **keinen SV** zu (kein SV-Picker in ihrem Portal) → die Signatur ist nur
  **SA + AGB, kein SV-Consent**. Der Gutachter wird danach von Dispatch/Orchestrator vergeben.
  `convertLeadToClaim` legt den Claim ohne SV/Termin an (validiert).
- Alle Datenfelder sind **editierbar-aber-optional**; für die Signatur ist nichts außer der SA
  selbst zwingend. Dispatch vervollständigt fehlende Gegner-Daten.

## 2 · Architektur-Überblick (End-to-End)

```
Werkstatt /werkstatt/anfragen (offene Anfrage)
  │
  ├─ sieht ALLE Falldaten (v_werkstatt_lead erweitert: Kunde/Fahrzeug/Unfall/Gegner)
  ├─ editiert sie (bearbeiteWerkstattLead, Whitelist erweitert)
  │
  ├─ PRIMÄR: „Zur Unterschrift (am Gerät)"
  │     → starteUnterschriftAmGeraet(leadId)
  │     → setzt leads.werkstatt_intake_am + _von; ensureCanonicalFlowLinkForLead → Token
  │     → öffnet /flow/[token] im BROWSER DER WERKSTATT (neuer Tab)
  │     → Werkstatt reicht Gerät → Kunde unterschreibt am Werkstatt-Gerät
  │
  └─ SEKUNDÄR (Zusatz-Option): „Link an Kunden senden"
        → sendeUnterschriftLink(leadId)
        → setzt Flag + Token; Versand (WhatsApp/Email, sendFlowLinkMultiChannelCore)
        → Kunde öffnet /flow/[token] auf SEINEM Gerät
             │
             ▼  (beide Wege → dieselbe Fläche)
/flow/[token]
  → page.tsx lädt lead (select('*'))  →  lead.werkstatt_intake_am gesetzt?
        JA  → <WerkstattIntakeSignatur>  (Signatur-only)
        NEIN → <FlowWizardKfz>            (unverändert)
             │
             ▼
WerkstattIntakeSignatur
  ├─ Read-only-Zusammenfassung der Werkstatt-Daten (Transparenz)
  ├─ <SaSignaturStep>  (SA-Signatur + AGB, KEIN SV-Consent)
  │     → uploadFlowSignatur(token, dataUrl)
  │     → signSAandCreateFall(leadId, signatureUrl, flowLinkId, false, token)
  │           → convertLeadToClaim  → Haftpflicht-Claim + 150€ Prämie
  └─ nach onSigned: createKundeAccount + Erfolgs-Screen
             │
             ▼
Dispatch/Orchestrator vergibt SV, ergänzt fehlende Gegner-Daten.
Lead hat jetzt konvertiert_zu_claim_id → fällt aus v_werkstatt_lead (offene Anfragen)
  und erscheint als Vermittlung in v_werkstatt_auftrag.
```

## 3 · DB-Änderungen (DDL nur via Supabase-Plugin `apply_migration`)

### 3.1 · Intake-Flag auf `leads`

```sql
ALTER TABLE public.leads
  ADD COLUMN werkstatt_intake_am  timestamptz,
  ADD COLUMN werkstatt_intake_von uuid;
```

- `werkstatt_intake_am` NULL = normaler Flow; gesetzt = werkstatt-getriebener Signatur-only-Pfad.
- `werkstatt_intake_von` = Audit (welcher Werkstatt-User den Intake abgeschlossen hat). Kein FK-
  Constraint nötig (weiche Audit-Spalte, konsistent mit `reparatur_werkstatt_zugewiesen_von`).

### 3.2 · `v_werkstatt_lead` erweitern (READ — Werkstatt sieht alle Felder)

`CREATE OR REPLACE VIEW` — Gate unverändert, neue Spalten **ans Ende angehängt** (Regel: CREATE
OR REPLACE darf nur appenden). Neu: `gegner_name`, `gegner_versicherung`, `gegner_kennzeichen`,
`gegner_telefon`, `gegner_email`, `gegner_bekannt`, `unfallhergang`, `unfall_konstellation`,
`fahrzeug_standort_adresse`, `fahrzeug_standort_plz`, `werkstatt_intake_am`.

```sql
CREATE OR REPLACE VIEW public.v_werkstatt_lead AS
SELECT id, werkstatt_id, vorname, nachname, telefon, email,
       fahrzeug_hersteller, fahrzeug_modell, kennzeichen, fin, erstzulassung,
       schadens_art, schadens_hergang, unfalldatum, unfallort,
       kostenvoranschlag_netto, kostenvoranschlag_brutto,
       status::text AS status, created_at, schadentyp,
       -- NEU (angehängt):
       gegner_name, gegner_versicherung, gegner_kennzeichen, gegner_telefon,
       gegner_email, gegner_bekannt, unfallhergang, unfall_konstellation,
       fahrzeug_standort_adresse, fahrzeug_standort_plz, werkstatt_intake_am
FROM leads l
WHERE werkstatt_id IN (SELECT w.id FROM werkstaetten w WHERE w.user_id = (SELECT auth.uid()))
  AND konvertiert_zu_claim_id IS NULL;
```

**Migrations-Ablauf (Regel 2):** `apply_migration` → `list_migrations` → committetes File exakt
nach getrackter Version benennen → `execute_sql` (READ) verifizieren. Eine kombinierte Migration
(Flag + View) = ein getrackter Schritt (sauberer als zwei).

## 4 · Komponenten & Interfaces

### 4.1 · `SaSignaturStep` (extrahiert) — `src/app/flow/[token]/SaSignaturStep.tsx`

Der SA-Signatur-Block (heute `FlowWizardKfz` `currentStep.id === 'sa'`, ~Z. 730–983) wird zur
eigenständigen Client-Komponente. Sie kapselt die SA-lokale State (`saAccepted`,
`svRechtsakzeptanz`, `saVolltextOffen`, `signatureBlob`, `submittingSA`, `error`) + den Handler
`handleSignSA`.

```typescript
interface SaSignaturStepProps {
  token: string
  leadId: string
  flowLinkId: string | null
  // Optional: nur im Flow-Kontext gesetzt (SV zugewiesen) → SV-Consent-Häkchen.
  // Im Werkstatt-Intake: undefined/null → kein SV-Consent.
  gutachterAnzeige?: GutachterInfo | null
  legalDocs: LegalDocs
  // Aufgerufen nach erfolgreichem signSAandCreateFall. Der Consumer entscheidet,
  // was danach passiert (Flow: Step → 'account'; Intake: Account + Erfolg).
  onSigned: (fallId: string) => void
}
```

- **Consumes:** `SignatureCanvas`, `LegalDocPopover`, `uploadFlowSignatur`,
  `signSAandCreateFall`, `useTranslations('flow')`.
- **Produces:** `onSigned(fallId)` Callback.
- **Parität:** `FlowWizardKfz` rendert im `'sa'`-Step nur noch
  `<SaSignaturStep ... onSigned={fallId => { setFallId(fallId); setStepIndex(accountIndex) }} />`.
  Verhalten **identisch** — per Unit-Test abgesichert (Signature-disabled-Logik,
  SV-Consent-Gating). Der Plan muss `handleSignSA` exakt lesen + prüfen, dass keine SA-State
  außerhalb des SA-Steps referenziert wird (grep vor Extraktion).

### 4.2 · `WerkstattIntakeSignatur` (neu) — `src/app/flow/[token]/WerkstattIntakeSignatur.tsx`

Die Signatur-only-Fläche. Client-Komponente, innerhalb des `NextIntlClientProvider` (nutzt
`useTranslations`). Kundensichtbar — läuft **entweder** auf dem Werkstatt-Gerät (Primär)
**oder** auf dem Kunden-Gerät (Link) — die Fläche ist in beiden Fällen identisch.

```typescript
interface WerkstattIntakeSignaturProps {
  token: string
  leadId: string
  flowLinkId: string | null
  legalDocs: LegalDocs
  // Read-only-Zusammenfassung (was die Werkstatt eingegeben hat)
  zusammenfassung: {
    vorname: string; nachname: string
    fahrzeug: string; kennzeichen: string
    unfalldatum: string | null; unfallort: string | null; unfallhergang: string | null
    gegnerName: string | null; gegnerVersicherung: string | null
  }
  kundeEmail: string
  kundeVorname: string
  kundeNachname: string
  kundeTelefon: string
}
```

- **Komposition:** Read-only-Summary-Card → `<SaSignaturStep gutachterAnzeige={null} onSigned=…>`
  → nach `onSigned(fallId)`: `createKundeAccount({ fallId, flowToken: token, email, vorname,
  nachname, telefon })` + Erfolgs-Screen („Danke, dein Vorgang läuft — wir richten dein Konto
  ein.").
- Kein Datenschritt, kein Termin, kein SV-Picker.
- **Kundensichtbare Strings:** Umlaut-korrektes Deutsch (Brand-Standard). `SaSignaturStep` nutzt
  die bestehenden `t('flow.step_sa.*')`-Keys unverändert; für die neuen Intake-Strings
  (Summary-Labels + Erfolg) neue `flow`-Namespace-Keys anlegen (konsistent mit `SprachBanner`/
  `flowLocale`), nicht als nackte Literale — sonst bricht die Mehrsprachigkeit des Flows.

### 4.3 · `/flow/[token]/page.tsx` — Branch

Nach dem `lead`-Load (Z. 166–172), **vor** der ganzen Termin-/Gutachter-/Feststellung-Logik:

```typescript
if (lead.werkstatt_intake_am) {
  // Signatur-only-Pfad — die teure Wizard-Vorbereitung (Termin/SV/Feststellung) überspringen.
  return (
    <div style={brandStyle} dir={…}>
      <LeadRealtimeRefresh leadId={lead.id} />
      <NextIntlClientProvider locale={flowLocale} messages={flowMessages}>
        <WerkstattIntakeSignatur
          token={token} leadId={leadId} flowLinkId={flowLinkId}
          legalDocs={getAllLegalDocs()}
          zusammenfassung={{ … aus lead … }}
          kundeEmail={lead.email ?? ''} kundeVorname={lead.vorname ?? ''}
          kundeNachname={lead.nachname ?? ''} kundeTelefon={lead.telefon ?? ''}
        />
      </NextIntlClientProvider>
    </div>
  )
}
```

Die `flowLocale`/`flowMessages`-Auflösung wird vor den Branch gezogen (sie hängt nur an
`flowLink.sprache`/`lead.sprache`). Expiry- + `abgeschlossen`-Checks (Z. 85–112) laufen **vor**
dem Branch (unverändert) — ein bereits unterschriebener Intake zeigt den Done-Screen.
**Hinweis:** Der Branch liegt **nach** dem „geoeffnet_am/Mitteilung"-Block (Z. 118–145). Für den
Primär-Pfad (Werkstatt öffnet auf ihrem Gerät) feuert die „Kunde hat FlowLink geöffnet"-
Mitteilung leicht ungenau — akzeptabel für v1 (der Plan darf sie optional für
`werkstatt_intake_am`-Leads unterdrücken).

### 4.4 · `bearbeiteWerkstattLead` — Whitelist erweitern

`src/app/werkstatt/(shell)/anfragen/actions.ts` — `EDITIERBARE_FELDER` von 13 auf die
Haftpflicht-Felder erweitern: `+ gegner_name, gegner_versicherung, gegner_kennzeichen,
gegner_telefon, gegner_email, unfallhergang, unfall_konstellation, fahrzeug_standort_adresse,
fahrzeug_standort_plz`. Empty-String → NULL bleibt. `schadentyp`-Validierung bleibt.

### 4.5 · `WerkstattAnfragen.tsx` — UI

- **Edit-Modal:** neue Feld-Gruppen „Unfall" (unfallhergang, unfall_konstellation) + „Gegner"
  (name, versicherung, kennzeichen, telefon, email). Bestehende Gruppen (Kunde/Fahrzeug/Schaden)
  bleiben. Felder nutzen `shared/forms/TextField` (Komponenten-Set-Regel).
- **Primär-Button „Zur Unterschrift (am Gerät)"** → `starteUnterschriftAmGeraet(lead.id)` →
  öffnet `/flow/[token]` (Signatur-Fläche) in einem neuen Tab auf dem Werkstatt-Gerät; die
  Werkstatt reicht das Gerät dem anwesenden Kunden zum Unterschreiben.
- **Sekundär-Option „Link an Kunden senden"** → `sendeUnterschriftLink(lead.id)` → Toast „Link
  an Kunden gesendet (WhatsApp/E-Mail)"; der Kunde unterschreibt auf seinem eigenen Gerät.
- Die alten „Flow öffnen" (Voll-Flow-Vorschau) + „Link senden" (Voll-Flow) entfallen — beide
  gehen in den zwei Signatur-Optionen auf.

### 4.6 · Signatur-Aktionen (neu) — `anfragen/actions.ts`

Interner (nicht-exportierter) Helper + zwei Server-Actions:

```typescript
// Helper (nicht exportiert): Flag setzen + Token sichern
async function markiereIntakeBereit(leadId: string):
  Promise<{ ok: true; token: string } | { ok: false; error: string }>

// PRIMÄR: am Werkstatt-Gerät unterschreiben — gibt die URL zum Öffnen zurück
export async function starteUnterschriftAmGeraet(leadId: string):
  Promise<{ ok: true; url: string } | { ok: false; error: string }>

// SEKUNDÄR: Link an den Kunden senden
export async function sendeUnterschriftLink(leadId: string):
  Promise<{ ok: true; kanal: 'whatsapp' | 'email' } | { ok: false; error: string }>
```

- `markiereIntakeBereit`: Ownership-Gate via `v_werkstatt_lead` (RLS); setzt
  `werkstatt_intake_am = now()`, `werkstatt_intake_von = auth.uid()` (service-role UPDATE,
  idempotent); `ensureCanonicalFlowLinkForLead(leadId)` → Token; `revalidatePath('/werkstatt/anfragen')`.
- `starteUnterschriftAmGeraet`: ruft Helper → gibt `${appUrl}/flow/${token}` zurück; der Client
  öffnet die URL (neuer Tab) auf dem Werkstatt-Gerät.
- `sendeUnterschriftLink`: ruft Helper → Versand via `sendFlowLinkMultiChannelCore` (WhatsApp
  bevorzugt, Email-Fallback) → `kanal`.
- Alle Result-Object (`ok`), kein throw (Server-Action-Pattern).

## 5 · Fehlerbehandlung & Edge-Cases

| Fall | Verhalten |
|---|---|
| Flag gesetzt, Kunde noch offen | Werkstatt kann nachbearbeiten; Token bleibt gültig; „am Gerät" öffnet erneut, „Link senden" re-sendet (idempotent). |
| Kunde hat unterschrieben | `signSAandCreateFall` setzt `konvertiert_zu_claim_id` + `flow_links.status='abgeschlossen'` → Lead fällt aus `v_werkstatt_lead`; Reload zeigt Done-Screen. |
| Token abgelaufen | `markiereIntakeBereit` (via beide Aktionen) re-issued den Token (72h). |
| Re-Entry (Link 2×) | `signSAandCreateFall` idempotent (`lead.sa_unterschrieben`-Check, IDOR-Guard `assertLeadBoundToToken`). |
| Kunde ohne Email/Telefon | Betrifft nur „Link senden" (→ `{ ok:false, error }` + Toast). Der Primär-Pfad „am Gerät" braucht keinen Versand und funktioniert immer. |
| SV noch nicht vergeben | `gutachterAnzeige={null}` → kein SV-Consent-Häkchen; Claim ohne SV; Dispatch vergibt danach. |

## 6 · Testing

- **Unit — `SaSignaturStep`-Parität:** Signatur-Disabled-Logik (`!signatureBlob || !saAccepted ||
  (gutachterAnzeige && !svRechtsakzeptanz)`), SV-Consent nur bei `gutachterAnzeige`. Sichert, dass
  die Extraktion das Flow-Verhalten nicht ändert.
- **Unit — `starteUnterschriftAmGeraet` / `sendeUnterschriftLink`:** setzen Flag, rufen
  ensureCanonicalFlowLinkForLead; erstere gibt `url` zurück, zweitere `kanal`; Ownership-Gate;
  „Link senden" ohne Kontakt → Fehler.
- **Prod-Smoke** (SW-freier Browser, nur Test-Accounts): SMOKE-Werkstatt füllt eine Test-Anfrage
  (Gegner-Felder) → „Zur Unterschrift (am Gerät)" → öffnet `/flow/[token]` (Werkstatt-Gerät) →
  sieht Signatur-only-Fläche (kein Datenschritt) → signiert → DB-assert: `claims`-Zeile entsteht,
  `lead.sa_unterschrieben=true`, `konvertiert_zu_claim_id` gesetzt, Lead aus `v_werkstatt_lead`
  raus. Smoke-Script lokal, **nie committen** (enthält Passwort).

## 7 · Audit-Hooks (7-Punkte)

- **Build:** voller `npm run build` (page.tsx = Route → Next-Validator).
- **UI-Erreichbarkeit:** „Zur Unterschrift (am Gerät)" (primär) + „Link an Kunden senden"
  (sekundär) an der Anfrage-Zeile (Werkstatt-Rolle).
- **Redundanz:** `SaSignaturStep` extrahiert statt dupliziert (Approach C); `SignatureCanvas`,
  `createKundeAccount`, `signSAandCreateFall`, `sendFlowLinkMultiChannelCore` wiederverwendet;
  Felder via `shared/forms/TextField`.
- **Inkonsistenz:** UI-Strings mit echten Umlauten (ä/ö/ü/ß); DB-Spalten MCP-verifiziert (§3);
  Server-Actions Result-Object; `revalidatePath('/werkstatt/anfragen')`; RLS-Gate der View
  erhalten (DEFINER/Gate unverändert).
- **Regression:** `FlowWizardKfz` verhaltensgleich (Parität-Test); `v_werkstatt_lead`-Consumer
  (WerkstattAnfragen) verträgt angehängte Spalten; `konvertiert_zu_claim_id`-Filter unberührt.

## 8 · Out-of-Scope / Follow-ups

- **SV-Zuweisung durch die Werkstatt** — bewusst nicht (kein SV-Picker im Werkstatt-Portal);
  Dispatch/Orchestrator vergibt.
- **Selbstzahler/Kasko-Intake** — bleibt beim schlanken Flow (kein SA).
- **Gegner-Versicherung-Auswahl per `gegner_versicherung_id`** (Dropdown statt Freitext) — später;
  v1 nutzt `gegner_versicherung` (Freitext) + `gegner_kennzeichen`.
- **„Kunde hat geöffnet"-Mitteilung für werkstatt_intake-Leads unterdrücken** — Feinschliff.

## 9 · Datei-Übersicht

| Datei | Art | Zweck |
|---|---|---|
| `supabase/migrations/<V>_werkstatt_intake_flag_und_view.sql` | neu | Flag-Spalten + v_werkstatt_lead-Erweiterung |
| `src/app/flow/[token]/SaSignaturStep.tsx` | neu (extrahiert) | Geteilter SA-Signatur-Step |
| `src/app/flow/[token]/FlowWizardKfz.tsx` | ändern | SA-Step → `<SaSignaturStep>` (Parität) |
| `src/app/flow/[token]/WerkstattIntakeSignatur.tsx` | neu | Signatur-only-Fläche |
| `src/app/flow/[token]/page.tsx` | ändern | Branch auf `werkstatt_intake_am` |
| `src/app/werkstatt/(shell)/anfragen/actions.ts` | ändern | Whitelist + `starteUnterschriftAmGeraet` + `sendeUnterschriftLink` (+ Helper) |
| `src/components/werkstatt/WerkstattAnfragen.tsx` | ändern | Unfall/Gegner-Felder + 2 Signatur-Buttons |
| `src/lib/werkstatt/queries.ts` (o. ä. Lead-Type) | ändern | v_werkstatt_lead-Type um neue Felder |
