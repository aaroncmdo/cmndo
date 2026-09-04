# Auftrag: Die unverbindliche Auswertung muss in den Lead — und vom Lead in den Claim

**Ziel (Aaron, 30.08.2026):** Alles, was ein Interessent in der Anspruchsprüfung und im
Foto-Check erzeugt, soll als **unverbindliche Auswertung** am Vorgang hängen — erst im Lead,
dann im Claim. Heute geht davon fast alles verloren.

> ⚠ **Abgrenzung:** Es gibt einen zweiten, parallel laufenden Auftrag
> `docs/2026-08-30-auftrag-check-lead-datenverlust.md` (vier Befunde, Session arbeitet daran).
> **Überschneidung nur bei Quelle A** — dort steht der payload-Transfer als „Befund 1". Sprich
> dich ab, wer ihn baut, bevor ihr beide dieselbe DB-Funktion anfasst.

---

## ⭐ Der Kern: die Kette ist gebaut — sie ist nur nicht verbunden

Das Wichtigste vorweg, damit niemand neu erfindet, was schon existiert.

`src/lib/anspruch/get-anspruch-vorschau-fuer-fall.ts` wird in der **SV-Fallakte** aufgerufen
(`src/app/gutachter/fall/[id]/page.tsx:117`) und tut genau das, was Aaron will:

```ts
claims.lead_id  →  anspruch_schaetzungen WHERE lead_id = <leadId>  →  positionen  →  Anzeige für den SV
```

Und sie liefert **immer `null`**. Auf prod gemessen:

```
anspruch_schaetzungen:  62 Zeilen gesamt
   davon mit lead_id:    0        ← die Spalte wird nie gefüllt
```

**Die KI-Vorschätzung hat den Sachverständigen also noch nie erreicht.** Nicht weil die Anzeige
fehlt — die ist fertig — sondern weil das eine verbindende Feld leer bleibt.

⚠ Diese Klasse ist hier bekannt: *jeder Baustein grün, die Kette trotzdem tot.* Der Fix ist
klein, aber ohne die Messung oben sieht man ihn nicht, weil nirgends ein Fehler auftritt.

---

## Was durchgereicht werden muss — drei Quellen

### Quelle A · Die drei Antworten der Anspruchsprüfung

Liegen in `anfragen.payload.check`, erreichen den Lead nicht. Beispiel (echter Lead
`5c39b0ac-914c-4662-9543-d7f524bdb581`, Anfrage `3612682f-1529-47a9-ad10-afce92c92e98`):

```jsonc
{ "check": { "schuld": "gegner", "gutachten": "versicherung", "unfall_her": "bis_monat" } }
```
→ im Lead: `schuldfrage = NULL`, Rest existiert nirgends.

Ursache: `public.convert_anfrage_zu_lead(uuid)` überträgt sechs Felder und liest `payload` nie
(die einzigen payload-Zugriffe stehen auskommentiert). **Das ist Befund 1 des anderen Auftrags —
abstimmen.**

### Quelle B · Das Ergebnis der Anspruchsprüfung

`buildCheckResult()` (`claimondo-marketing/lib/check/result-model.ts`) erzeugt aus den drei
Antworten ein Ergebnis, das dem Kunden **angezeigt** wird — und danach verfällt. Gespeichert
wird nur der `tier`-String als Analytics-Event (`trackEvent('check_complete')`), nirgends am
Vorgang.

Für Ernest Sefa war das:

```
tier        voll        (= §249 Vollanspruch; die anderen: quote | pruefen | kasko)
Überschrift "Das steht Ihnen zu – 0 € Eigenkosten"
Positionen  Gutachten · Wertminderung · Nutzungsausfall · Anwalt · Auslagenpauschale
Spannen     Auslagen 25–30 € · Nutzungsausfall 23–219 €/Tag · Wertminderung oft vierstellig
Hinweis     "Sie dürfen einen eigenen, unabhängigen Sachverständigen wählen"
```

⚠ **Die Spannen sind statisch.** Sie werden nicht gerechnet, sondern sind für jeden mit
`schuld = gegner` identisch (`RANGE_KEYS` + i18n-Texte). Sie taugen als *Kontext*, **nicht** als
Betrag. Wer sie in ein Feld namens `geschaetzter_wert` schreibt, erzeugt eine Zahl, die nach
Berechnung aussieht und keine ist.

**Sinnvoll zu speichern ist deshalb der `tier` plus der Zeitpunkt** — daraus lässt sich der Rest
jederzeit wieder herleiten, und es bleibt ehrlich.

### Quelle C · Der Foto-Check (`anspruch_schaetzungen`)

Hier stehen die echten, fallbezogenen Werte: `foto_pfade`, `positionen` (mit `minEur`/`maxEur`
je Position), `erkanntes_segment`, `schweregrad`, `fahrbereit`, `ez_jahr`, `totalschaden`.

**Das ist das einzige, was einer Bezifferung nahekommt** — und genau das, was heute nirgends
ankommt (0/62 mit `lead_id`).

Verknüpfungs-Hinweis: über den **Gutachter-Finder** existiert bereits ein anderer Weg —
`gutachter_finder_anfragen.schaetzung_session_id` ist ein FK auf `anspruch_schaetzungen(id)`
(`src/app/embed/gutachter-finder/actions.ts:68-102`). Für den `/check`-Pfad greift der nicht, weil
dort keine `gutachter_finder_anfragen`-Zeile entsteht. **Erst diesen bestehenden Weg verstehen,
dann entscheiden**, ob `lead_id` nachgezogen wird oder ob die Session-Verknüpfung verallgemeinert
gehört — nicht einen dritten Weg danebenstellen.

---

## Zielfelder — es gibt sie noch nicht

Nachgesehen: **weder `leads` noch `claims`** haben ein Feld für eine Auswertung.

```
claims:  kostenvoranschlag_netto/brutto, schuldfrage        (nichts Passendes)
leads:   qualifizierungs_phase, schadensfoto_urls           (nichts Passendes)
```

Also braucht es DDL. Vorschlag zur Diskussion — **nicht ungeprüft bauen**:

* ein `jsonb`-Feld (z. B. `auswertung_unverbindlich`) auf **beiden** Tabellen, das Quelle A + B
  zusammen trägt, plus einen Zeitstempel. Ein Feld statt sechs Spalten, weil sich die Fragen der
  Anspruchsprüfung ändern werden.
* für Quelle C **keine Kopie** — die Daten stehen bereits vollständig in `anspruch_schaetzungen`.
  Dort gehört nur die `lead_id` gesetzt; `claims.lead_id` existiert schon, die Kette schließt sich
  dann von selbst.

⚠ **Regel 2:** DDL ausschließlich über `mcp__plugin_supabase_supabase__apply_migration`, danach
`list_migrations`, File exakt nach der getrackten Version benennen, Typen regenerieren und im
selben PR committen.

---

## „Unverbindlich" ist eine inhaltliche Anforderung, keine Formulierung

Was gespeichert wird, ist eine **Einschätzung aus drei Klicks** — kein Gutachten und keine Zusage.
Der Kunde sieht dazu bereits den Disclaimer *„Typische Größenordnungen, kein verbindliches
Angebot."* Das muss die Datenhaltung überleben:

* Feldbenennung, die nicht nach Zusage klingt (`auswertung_unverbindlich`, nicht `anspruchshoehe`).
* Datum mitspeichern — eine Einschätzung von heute ist in vier Wochen etwas anderes.
* Die Quelle mitspeichern (`anspruchspruefung` vs. `foto_check`): die eine ist statisch, die andere
  fallbezogen. Wer sie später gleich behandelt, verwechselt Kontext mit Messung.
* In jeder Ansicht, die den Wert zeigt (SV-Fallakte, Dispatch), muss erkennbar bleiben, dass er
  unverbindlich ist.

---

## Reihenfolge

1. **Quelle C zuerst** — `anspruch_schaetzungen.lead_id` setzen. Kleinster Eingriff, größte
   Wirkung: die Anzeige beim SV existiert bereits und wird sofort lebendig. Kein DDL nötig.
2. **Quelle A** — payload-Transfer in `convert_anfrage_zu_lead` *(mit dem anderen Auftrag
   abstimmen)*.
3. **Quelle B** — `tier` + Zeitstempel persistieren, danach Lead → Claim durchreichen
   (`convertLeadToClaim` bzw. `convert-lead-to-claim.ts`).

## Nachweis (Regel 4)

* **Quelle C:** Foto-Check mit echten Bildern durchlaufen, danach in der **SV-Fallakte** prüfen,
  ob die Vorschätzung erscheint. Das ist der eigentliche Beweis — nicht ein `SELECT` auf
  `anspruch_schaetzungen`.
* **Quelle A/B:** `/check` per Playwright mit echter Eingabe durchklicken, dann in **`leads`**
  nachlesen (nicht in `anfragen` — dort stehen die Daten heute schon).
* ⚠ Beides erzeugt **echte Leads und echte WhatsApps** an Kunde und Team. Test-Telefonnummer
  verwenden, hinterher aufräumen, oder vorher mit Aaron abstimmen.
* ⚠ **Positivkontrolle:** vor dem Fix muss der Detektor die Lücke auch *zeigen* — erst gegen den
  alten Stand messen (`getAnspruchVorschauFuerFall` liefert `null`), dann gegen den neuen. Sonst
  beweist ein „es steht da" nichts.

---

## Belege (alle auf prod gemessen, 30.08.2026)

```
anspruch_schaetzungen           62 Zeilen · 0 mit lead_id · neuester 20:04:27 (leer, 0 Fotos)
Lead 5c39b0ac…                  schadensfoto_urls = []  ·  kostenvoranschlag = NULL
                                schuldfrage = NULL  ·  unfalldatum = NULL  ·  kennzeichen = NULL
anfragen 3612682f…              payload.check = { schuld: gegner, gutachten: versicherung,
                                                  unfall_her: bis_monat }
```

Der Lead hat also **weder Bilder noch einen Betrag** — er hat den FlowLink geöffnet und nicht
ausgefüllt. Die drei Klicks der Anspruchsprüfung sind alles, was wir von ihm haben, und genau die
kommen im Vorgang nicht an.
