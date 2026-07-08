# Design: Storno-Belege zugänglich (Admin-Cockpit + Partner-Portal + Bezug-Verknüpfung)

**Goal:** Bei zurückgebuchten (stornierten) Partner-Provisionen sind sowohl die Original-Gutschrift als auch die Storno-Gutschrift herunterladbar — im Admin-Cockpit UND im Partner-Portal — und die beiden Belege sind sichtbar miteinander verknüpft („Storno zu CMNDO-GS-…"). Schließt den vom opus-Review der Storno-PR (#3794) geflaggten Audit-Trail-Gap.

**Tech-Stack:** Next.js 15, TypeScript, Supabase (RLS-gated reads + admin-client für signed URLs), react-pdf-Belege (bereits generiert), vitest.

## Ausgangslage (verifiziert im Code)

Zwei getrennte Download-Pfade:

1. **Admin-Cockpit** — `PartnerBillingPanel.tsx` → `ZeilenAktionen`. Der „Gutschrift ↓"-Button erscheint nur wenn `richtung==='auszahlung' && status_norm==='erledigt' && gutschriftLedgerKeys.includes(ledgerKey)`. Eine **zurückgebuchte** Provision wird `status_norm==='storniert'` → Button verschwindet, die Aktionen-Zelle zeigt nur `—`. Download-Action `getPartnerGutschriftDownloadUrl(ledgerTabelle, ledgerId)` liefert (nach dem #3794-Fix, `typ='gutschrift'`) nur das Original. **→ Weder Original noch Storno erreichbar.** = die echte Lücke.

2. **Partner-Portal** — `PartnerGutschriftenListe.tsx` + `eigene-gutschriften-actions.ts` (`getEigeneGutschriften` lädt RLS-gegatet `id, gutschrift_nr, betrag_brutto, erstellt_am, status` OHNE `typ`-Filter → Storno-Zeilen **erscheinen bereits**; Download `getEigeneGutschriftUrl(id)` klappt). Aber: Storno-Zeile ist generisch als „Gutschrift" gelabelt (negativer Betrag, roher Status), ohne Bezug. = kleine Politur.

Datenmodell (aus #3794, prod-live): `partner_gutschriften.typ ∈ {gutschrift, storno}`, `bezug_gutschrift_id uuid` (Storno → Original), `betrag_*` in Euro (Storno negativ), Original bei Storno `status='storniert'`. Ein Ledger hat **max. 1 Original + 1 Storno** (partieller Unique-Index + Idempotenz-Guard).

## Design

### 1. Datenschicht (Admin) — `partner-billing-actions.ts`
Der bestehende Loader, der `gutschriftLedgerKeys: string[]` produziert (ein Query auf `partner_gutschriften` je Partner, selektiert `ledger_tabelle, ledger_id`), wird **additiv** erweitert: selektiert zusätzlich `id, gutschrift_nr, typ, bezug_gutschrift_id, status` und baut eine Map

```ts
type LedgerGutschriftDocs = {
  original?: { nr: string }
  storno?: { nr: string; bezugNr: string | null }
}
// key = `${ledger_tabelle}:${ledger_id}`
gutschriftDocsByLedger: Record<string, LedgerGutschriftDocs>
```

`bezugNr` wird **client-frei, server-seitig aus derselben Ergebnismenge** aufgelöst (id→gutschrift_nr-Map über alle geladenen Zeilen des Partners; `storno.bezug_gutschrift_id` → nr). Ein Query, kein N+1.

**`gutschriftLedgerKeys` wird durch die Map ERSETZT** (nicht additiv): die Map subsumiert die Keys vollständig — ein Ledger „hat eine Gutschrift" gdw. er ein Key in `gutschriftDocsByLedger` mit `original` oder `storno` ist. Beides zu behalten wäre Dead-Code (AGENTS.md Dead-Code-/Redundanz-Check). Betroffen: der Loader + die 3 Admin-Clients (`WerkstaettenClient`, `ProvisionenClient`, `MaklerAdminClient` bzw. deren Server-Loader) + die Panel-Prop + `PartnerBillingPanel.types.ts`. **Bei der Umsetzung alle `gutschriftLedgerKeys`-Consumer per grep verifizieren** — falls einer die Keys für etwas anderes als die Download-Sichtbarkeit nutzt, dort auf die Map ableiten (`Object.keys(map)`).

### 2. Download-Action (Admin)
`getPartnerGutschriftDownloadUrl(ledgerTabelle, ledgerId, typ)` bekommt einen **optionalen dritten Parameter** `typ: 'gutschrift' | 'storno' = 'gutschrift'`. Der Query filtert `.eq('typ', typ)`. Default = bestehende Signatur → kein Caller-Bruch. Der Storno-Button ruft mit `'storno'`. (`typ` identifiziert eindeutig, da max. 1 je Ledger.) Result-Object unverändert (`{ok:true,url} | {ok:false,error}`), `requireAdmin` + `createAdminClient` + `abrechnungen-pdf`-Bucket + 5-Min-Signed-URL wie bisher.

### 3. Admin-UI — `PartnerBillingPanel` / `ZeilenAktionen`
Die Prop `gutschriftLedgerKeys: string[]` wird durch `gutschriftDocsByLedger: Record<string, LedgerGutschriftDocs>` (default `{}`) **ersetzt**. In `ZeilenAktionen` für `richtung==='auszahlung'`-Zeilen mit `status_norm ∈ {erledigt, storniert}`:
- Belege aus `gutschriftDocsByLedger[ledgerKey]` rendern — pro vorhandenem Beleg ein Button:
  - `original` → **„Gutschrift ↓"** (ruft Action mit `typ='gutschrift'`).
  - `storno` → **„Storno ↓"** (ruft mit `typ='storno'`), mit `title`/kleinem Label *„Storno zu {bezugNr}"*.
- `erledigt` (nur Original vorhanden) rendert genau wie heute einen Button. `storniert` rendert jetzt beide statt `—`.
- Fallback: gibt es für einen `storniert`-Ledger keine Docs in der Map (Alt-Storno vor diesem Feature / kein Beleg), bleibt `—`.

Die alte `hatGutschrift`-Logik (`status_norm==='erledigt'`-Gate) wird durch „welche Belege liegen in der Map" ersetzt — dadurch fällt das `erledigt`-Gate weg und der Storno-Fall wird abgedeckt.

### 4. Portal — `eigene-gutschriften-actions.ts` + `PartnerGutschriftenListe.tsx`
- Loader selektiert zusätzlich `typ, bezug_gutschrift_id`; `EigeneGutschrift`-Typ erweitert um `typ: string` + `bezugNr: string | null` (server-seitig aus der geladenen Menge aufgelöst).
- Liste: `typ==='storno'`-Zeilen labeln als **„Storno-Gutschrift"** (Titel-Spalte oder Badge), Betrag negativ (bereits so), zusätzliche kleine Zeile/Spalte *„Storno zu {bezugNr}"*. Original-Zeile (jetzt `status='storniert'`) bleibt, Status wird lesbar gemappt. Download-by-id unverändert.

### 5. Fehler-/Konsistenz-Handling
- Result-Object-Muster (kein throw); Umlaute in allen Labels („Storno-Gutschrift", „Storno zu …").
- `betrag_brutto` bleibt in Euro (kein `/100`); Storno-Beträge negativ, `Intl.NumberFormat` rendert `-…€` korrekt.
- Reine Anzeige + Download — **keine** Betrags-/Steuer-/Status-Logik, **kein DDL**, **kein** neuer Storage-Write.
- `bezug_gutschrift_id`/`typ` sind in `database.types.ts` (noch) nicht typisiert → über den bestehenden `SupabaseClient<any>`-Zugriff bzw. lokale Feld-Casts lesen (wie im übrigen `partner_gutschriften`-Code).

### 6. Tests (TDD)
- **Loader** (`partner-billing-actions`): Map-Bau + Bezug-Auflösung — (a) Ledger mit original+storno → beide Einträge + `storno.bezugNr` = Original-Nr; (b) nur original; (c) keiner. vitest, fakeDb.
- **Download-Action**: `typ`-Weiche (`'gutschrift'` vs `'storno'` filtert korrekt) + not-found → `{ok:false}`. vitest.
- **Portal-Loader**: `typ`/`bezugNr` werden gesetzt; Storno-Zeile bekommt `bezugNr`. vitest.
- **UI** (soweit Test-Infra trägt): `ZeilenAktionen` für eine `storniert`-Zeile mit Docs → beide Buttons; `PartnerGutschriftenListe` → Storno-Zeile trägt „Storno-Gutschrift"-Label. Leichtgewichtig (Element-Typ-Prüfung, kein voller DOM), analog bestehender Finance-Tests.

## Out of Scope (YAGNI)
- Kein manuelles Storno-Auslösen aus neuen UI-Stellen (das existierende `Stornieren` bleibt).
- Kein Sammel-/Jahres-Export (separates Ticket).
- Keine Änderung an Storno-Erzeugung, PDF, Email (aus #3794).

## Branch / Stacking
Branch `kitta/storno-belege-zugang`, **gestackt auf `kitta/storno-gutschrift`** (#3794 — hat den `typ`-Filter in `partner-billing-actions.ts` + den Storno-Code). Rebase auf `staging` sobald #3794 merged. Eigener PR gegen `staging`.
