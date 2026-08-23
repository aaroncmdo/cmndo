# WhatsApp-Erstkontakt wird Lead — Design

**Datum:** 2026-08-23
**Status:** Entwurf zur Freigabe
**Kontext:** Folgearbeit zum LID-Bruch (PR #5508, Memory `AUDIT-baileys-inbound-lid-bruch`)

## 1 · Problem

Der LID-Fix hat die Telefonnummern repariert — eingehende WhatsApp-Nachrichten tragen
wieder eine echte Rufnummer. **Sichtbar sind sie deshalb noch nicht.**

Auf prod gemessen (23.08.2026):

| Messung | Wert |
|---|---|
| inbound-WhatsApp-Nachrichten gesamt | 200 |
| davon mit `thread_id` | **0** |
| davon mit `fall_id` / `lead_id` / `claim_id` | **0** |
| Absender ohne jeden Bezug (weder Lead noch Kunde) | **16 von 20** |

Die Sichtbarkeitskette bricht an drei Stellen:

1. Beide Posteingänge (`api/chat/inbox-threads/route.ts:69`, `admin/nachrichten/page.tsx:33`)
   filtern `.not('thread_id','is',null)` plus `chat_threads!inner`.
2. `chat_threads.claim_id` ist **`NOT NULL`** — ein Thread setzt einen Claim voraus.
   `holeOderErstelleGruppenThreadService` bricht ohne existierenden Claim ab (`if (!claim) return null`).
3. **Keine einzige Dispatch-Ansicht liest `nachrichten`** (verifiziert per Grep über `src/app/dispatch/`).

Ein Absender ohne Fall hat also keinen Thread, und ohne Thread keinen Ort, an dem
sein Text erscheint. Real verlorengegangen sind dadurch u.a.: ein Kunde, der
**zweimal** um sein Gutachten bat; ein Neukunde mit 12 Nachrichten inkl. Mailadresse
und Terminvorschlag; ein Neukunde mit zwei Schäden und Schadennummer; **40 Schadensfotos**.

## 2 · Ziel

Eine WhatsApp von einer unbekannten Nummer wird als Lead erfasst, und ihr Text ist
in Dispatch lesbar — dauerhaft, nicht nur als flüchtige Benachrichtigung.

**Nicht-Ziele** (bewusst ausgeschlossen):

* Kein Thread für Leads. Das erforderte DDL auf `chat_threads` (claim_id nullable +
  lead_id + RLS) — ein Eingriff in eine zentrale, claim-zentrierte Tabelle, dessen
  Risiko in keinem Verhältnis zum Gewinn steht.
* Keine Spam-Heuristik auf Freitext. Sie würde Fälle verpassen, und ein stiller
  Fehlschlag ist genau das Problem, das wir gerade behoben haben.
* Kein Backfill der 200 Altnachrichten zu Leads. Ihr Wert lag in der rückrufbaren
  Nummer, die der LID-Backfill bereits hergestellt hat.

## 3 · Warum Partner ausgenommen werden

`matchInboundToFall` prüft ausschließlich `leads` und `profiles` mit `rolle='kunde'`.
Jeder Partner ohne Kundenrolle gilt dort als „unbekannt" — und würde als Kunden-Lead
angelegt.

Gemessen unter den bisherigen 20 WhatsApp-Absendern:

| Nummer | Nachrichten | Rolle |
|---|---|---|
| `4917620289514` | **17** | **admin — Nicolas Kitta** |
| `491735633541` | 6 | sachverständiger — Gaith Hamed |
| `4915127115565` | 2 | sachverständiger — Kelvin Tyron Gall |
| `491722036183` | 2 | sachverständiger — Hasan Cakmak |

**4 von 20 Absendern, 27 Nachrichten.** Ohne Ausnahme landete der zweitaktivste
Absender — ein Admin — als Interessent in der Dispatch-Warteschlange.

Breiter betrachtet: Von 37 `profiles` mit Telefonnummer sind nur **8 Kunden**;
die übrigen 29 sind Partner oder Staff.

## 4 · Architektur

### 4.1 Partner-Erkennung — `src/lib/inbound/ist-partner-nummer.ts` (neu)

```ts
export type PartnerTreffer = {
  istPartner: boolean
  /** Kurzname der Fundstelle; Zuordnung zur Tabelle siehe Tabelle unten. */
  quelle: 'profil' | 'werkstatt' | 'makler' | 'mietwagen' | 'sv_buero' | null
  bezeichnung: string | null   // fuer die Benachrichtigung, z.B. "SV Gaith Hamed"
}

export async function istPartnerNummer(
  admin: AdminClient,
  phoneNumber: string,
): Promise<PartnerTreffer>
```

Matcht über die **letzten 9 Ziffern** — identisch zu `matchInboundToFall`, damit beide
dieselbe Nummer gleich beurteilen. Geprüfte Quellen:

| Tabelle | Bedingung | `quelle` | Nummern (23.08.) |
|---|---|---|---|
| `profiles` | `rolle <> 'kunde'` | `profil` | 29 |
| `werkstaetten` | `telefon` | `werkstatt` | 25 |
| `makler` | `telefon` | `makler` | 7 |
| `mietwagenunternehmen` | `telefon` | `mietwagen` | 0 |
| `sv_buero` | `telefon` | `sv_buero` | 0 |

Die beiden leeren Tabellen werden **trotzdem** geprüft: Füllen sie sich später, entsteht
sonst genau ein stiller Fehler der Sorte, die dieses Dokument behandelt. Die Kosten sind
zwei zusätzliche Lesequeries bei wenigen Nachrichten pro Tag.

Nicht geprüft werden `parteien` und `personen` — das sind Fallbeteiligte
(Geschädigte, Gegner, Zeugen), also potenzielle Kunden, keine Partner.

### 4.2 Route-Erweiterung — `src/app/api/baileys/inbound/route.ts`

Einschub **nach** `matchInboundToFall` und **vor** dem `nachrichten`-Insert — sonst
kann `lead_id` auf der Zeile nicht gesetzt werden.

```
match = matchInboundToFall(db, phone)
wenn fallId ODER leadId vorhanden  -> unveraendert weiter (Bestandsfall)
sonst:
  partner = istPartnerNummer(db, phone)
  wenn partner.istPartner:
      kein Lead; Benachrichtigung "Partner <bezeichnung> hat geschrieben"
  sonst:
      createCase({ mode: 'lead-first',
                   base: { source_channel: 'whatsapp-inbound', status: 'neu', telefon: phone },
                   extra: { qualifizierungs_phase: 'neu', notiz: <Zeitpunkt + Textauszug> } })
      leadId = created.leadId
      Benachrichtigung "WhatsApp von <Nummer>"
```

`mode: 'lead-first'` — eine Nachricht ist noch kein Fall; die Konversion läuft später
über `/flow`. Kein `dedup`-Key: Der generische Key ist ohne Kennzeichen unbrauchbar
(`dedupKeyIsUsable`), und der präzisere Telefonabgleich lief eine Zeile vorher über
`matchInboundToFall`. Beim zweiten Kontakt findet dieser den beim ersten Mal erzeugten
Lead — dadurch entsteht kein Zweit-Lead. Identische Begründung wie im matelso- und
Aircall-Pfad.

`source_channel: 'whatsapp-inbound'` ist ein neuer Wert. `leads.source_channel` trägt
**keinen CHECK-Constraint** (verifiziert über `pg_constraint`) und ist im Typ als
freier `string` deklariert — kein Flag-Drift-Risiko.

Der Aufruf läuft über `createCase`, nicht über `createLead`: Das verlangt die
Intake-Funnel-Regel (AGENTS.md) und liefert den FlowLink mit, über den der Absender
einen Weg zurück in seinen Vorgang bekommt.

### 4.3 Sichtbarkeit — `LeadNachrichtenPanel` (neu)

Server-Komponente unter `src/app/dispatch/leads/[id]/_components/`, eingehängt auf der
Lead-Detailseite. Liest:

```ts
admin.from('nachrichten')
  .select('id, kanal, richtung, nachricht, hat_anhang, created_at, empfaenger_kontakt')
  .eq('lead_id', leadId)
  .order('created_at', { ascending: true })
```

`nachrichten.lead_id` wird seit PR #5508 befüllt und hat bis heute **keinen Leser** —
diese Komponente ist der erste.

Darstellung über `shared/SectionCard` + das `DataTable`-Set (Komponenten-Set-Policy).
Leerzustand über `shared/EmptyState`. Kein neuer Einstiegspunkt nötig: Die Sektion sitzt
auf einer Seite, die Dispatch ohnehin öffnet.

Position: unterhalb der bestehenden Panels der Lead-Detailseite, vor den Aktionsflächen —
die Nachricht ist Kontext für die Bearbeitung, kein eigener Arbeitsschritt.

Zeilen mit `hat_anhang = true` erhalten einen sichtbaren Anhang-Hinweis. Solange der
Medien-Pfad Bytes liefert (seit 23.08. auf dem VPS aktiv), ist die Datei über die
bestehende Dokumenten-Anzeige des Leads erreichbar; liefert er keine, bleibt der Hinweis
stehen und macht wenigstens erkennbar, **dass** etwas geschickt wurde. Genau dieser
Unterschied — „nichts zu sehen" gegen „hier fehlt etwas" — ist der Kern des ganzen Befunds.

### 4.4 Benachrichtigung

`createNotification(staffId, 'whatsapp-eingegangen', titel, beschreibung, link)` an alle
`profiles` mit `rolle in ('dispatch','admin')` — dasselbe Muster wie der matelso-Webhook.

| Fall | Titel | Link |
|---|---|---|
| Neuer Lead | `WhatsApp von <Nummer>` | `/dispatch/leads/<leadId>` |
| Partner | `WhatsApp von <bezeichnung>` | `/dispatch` |

Beschreibung: Textauszug, auf 120 Zeichen gekürzt. Bei Medien ohne Text:
`[Medien-Nachricht]`.

Fire-and-forget in `try/catch` — ein fehlgeschlagener Versand darf den
`nachrichten`-Insert nicht brechen (Non-Critical-Sub-Operation, AGENTS.md).

## 5 · Fehlerbehandlung

* `istPartnerNummer` schlägt fehl → als **Partner behandeln** (kein Lead). Sicherer
  Rückfall: Ein fehlender Lead ist reparabel, ein fälschlich angelegter Kunden-Lead
  für einen Admin ist Rauschen im operativen Betrieb.
* `createCase` schlägt fehl → `leadId` bleibt null, Nachricht wird trotzdem gespeichert,
  Fehler geloggt. Der Insert bleibt atomar.
* Beide Aufrufe stehen in eigenen `try/catch`-Blöcken; die Route liefert weiterhin
  `{ ok: true }`, damit Baileys die Nachricht nicht als fehlgeschlagen wiederholt.

## 6 · Tests

**Unit** (`src/lib/inbound/__tests__/ist-partner-nummer.test.ts`)
* Profil mit `rolle='sachverstaendiger'` → `istPartner: true`, quelle `profil`
* Profil mit `rolle='kunde'` → `istPartner: false`
* Nummer nur in `werkstaetten` → `istPartner: true`, quelle `werkstatt`
* Unbekannte Nummer → `istPartner: false`
* Leere/zu kurze Nummer → `istPartner: false`, keine Query
* DB-Fehler → `istPartner: true` (sicherer Rückfall)

**Unit** (Route-Verzweigung): `createCase` mocken — der direkte Import zieht
`'server-only'` und wirft sonst schon beim Laden (AGENTS.md, Intake-Funnel-Gate).
Prüfen: Bestandsfall legt keinen Lead an · Partner legt keinen Lead an · Unbekannter
legt genau einen an · `lead_id` landet auf der `nachrichten`-Zeile.

**Prod-Smoke (Regel 4):** WhatsApp von einer nicht erfassten Nummer an
`4915153608515` → Lead erscheint in `/dispatch/leads`, Text steht im
`LeadNachrichtenPanel`, Benachrichtigung ist zugestellt. Gegenprobe: Nachricht von
einer SV-Nummer erzeugt **keinen** Lead.

## 7 · Risiken

**Spam erzeugt Leads.** Die erste Nachricht nach dem LID-Fix kam aus dem Irak mit
„مرحبا يا أصدقاء" — offenkundig Spam. Bewusst akzeptiert: Ein überzähliger Lead ist
löschbar, eine verlorene Kundenanfrage nicht. Zeigt sich im Betrieb zu viel Rauschen,
ist der nächste Schritt eine Landesvorwahl-Regel (nicht `+49` → kein Auto-Lead), keine
Textheuristik.

**Zusätzliche Leads verschieben Dispatch-Kennzahlen.** Neue Quelle
`source_channel='whatsapp-inbound'` macht das filterbar und in Auswertungen trennbar.

## 8 · Abgrenzung

Unabhängig von diesem Design bleibt offen (siehe Memory): Der Baileys-Service wird von
App-Deploys **nicht** mitgezogen — der VPS-Checkout hängt 2144 Commits hinter `main`,
aktuell ist dort nur die von Hand hochgeladene `src/index.js`. Jede künftige
Service-Änderung braucht einen manuellen Schritt oder einen eigenen Deploy-Pfad.
Dieses Design berührt **nur App-Code** und ist davon nicht betroffen.
