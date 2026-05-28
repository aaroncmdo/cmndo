# Phase 2 / Track B — Notification-Template i18n (Doc 48) — SPEC (Review)

Datum: 2026-05-28 · Status: **SPEC zur Freigabe** (noch nicht implementiert)
Vorgänger: Track A (Wizard-Config DB-i18n, PR #1952). Locales: de/en/tr/ar/ru/pl, **de = Fallback**.

## Kernproblem (anders als alle bisherigen i18n-Tranchen)

Alle bisherigen Tranchen waren **request-gebunden** → Locale kam aus dem Cookie `claimondo-locale` (`getLocale()`/`useTranslations`). **Outbound-Notifications haben keinen Request** (Cron-WhatsApp, transaktionale Mails, SMS) → die Empfänger-Locale muss aus **gespeicherten Daten** kommen. Zwei harte Befunde aus der Code-Recherche:

1. **Locale-Quelle existiert, ist aber tot.** Migration `aar_316_sprache_feld` hat `sprache` auf `leads`, `faelle`, `flow_links` (CHECK `de/tr/ar/ru/pl/en/other`). **Wird nirgends geschrieben und nirgends gelesen.** Kein Cron/Send-Pfad selektiert `sprache`.
2. **Templates sind Code, nicht DB.** 39 react-email-TSX (`src/lib/email/google/templates/*.tsx`, hardcodiert deutsch) + ~40 WhatsApp-Funktionen (`src/lib/whatsapp/legacy-texts.ts`, `(vars)=>string` mit nummerierten Slots) + Registry (`src/lib/communications/registry.ts`). **Kein** `templates`/`mitteilungen`-Content-Table. → Track B = **code-level i18n** (wie das UI, NICHT wie Track As JSONB-Spalte), aber durch eine Send-Schicht gefädelt, die heute **keine** Locale kennt.

Damit ist Track B kein „Daten übersetzen" (Track A) sondern ein **Plumbing-Epic**: Locale erfassen → speichern → durch die Send-Kette fädeln → Templates übersetzen.

## Surfaces (Umfang)

| Surface | Ort | Menge | Kunden-/SV-sichtbar |
|---|---|---|---|
| WhatsApp-Templates | `src/lib/whatsapp/legacy-texts.ts` | ~40 Funktionen | überwiegend ja (Kunde), einige SV, wenige KB-intern |
| Email-Templates | `src/lib/email/google/templates/*.tsx` | 39 TSX | ~20 Kunde/SV, ~19 Kanzlei/Admin (intern) |
| Send-Layer (kein Locale-Param) | `communications/send.ts`, `send-fall.ts`, `whatsapp/send.ts`, `email/google/client.ts`+`flows.ts` | 5 Kernfns | — |
| Trigger | `src/app/api/cron/**` | 51 Routes | laden Entities ohne `sprache` |
| Registry | `communications/registry.ts` | ~50 Trigger | Trigger→Template-Map |

## Design-Entscheidungen (brauchen Aarons Freigabe)

### D1 — Wie wird `sprache` befüllt? (der eigentliche Blocker)
`sprache` ist leer. Vorschlag: **bei Lead-/Claim-Erstellung den `claimondo-locale`-Cookie persistieren** → `leads.sprache` (und via bestehender Inherit-Migration → `faelle.sprache`; `flow_links.sprache` beim Init). Dann lesen Crons `sprache` und fallen auf `'de'` zurück wenn leer (alle Bestandsfälle bleiben deutsch — keine Regression).
- **Frage:** Ist der Cookie zum Erstellungszeitpunkt die richtige Quelle? Alternativen: explizite Sprachwahl im Wizard, oder Telefon-Vorwahl-Heuristik (zu unsicher). **Empfehlung: Cookie → leads.sprache**, da der Nutzer den Funnel bereits in seiner Sprache durchläuft.

### D2 — Übersetzungs-Mechanismus
Zwei Optionen, **Empfehlung A** (Konsistenz mit der ganzen Strecke):
- **A) next-intl `getTranslations({ locale })`** mit neuen Namespaces (`notify_wa.*`, `notify_email.*`). `getTranslations` akzeptiert ein explizites `locale`-Argument (kein Request/Cookie nötig) → funktioniert im Cron. Subagent-Übersetzungspipeline (Lesson 6) direkt wiederverwendbar.
- B) Per-Locale-Template-Maps (`Record<Locale, …>` mit de-Fallback) analog Track A. Behält die WA-Funktions-Flexibilität (Conditionals wie `v['4']==='video'`), aber dupliziert Struktur + eigener Übersetzungsweg.
- **WhatsApp-Spezifika:** nummerierte Slots `${v['1']}` + Inline-Conditionals. Bei A → ICU mit benannten Args; die wenigen Conditionals (Video/Telefon) als getrennte Keys lösen. Bei B → Funktionen bleiben wie sind.

### D3 — Scope & Phasen (Empfehlung: nur kunden-/SV-sichtbar, phasen-weise)
- **Intern bleibt deutsch:** Kanzlei-/Admin-/Büro-Mails + KB-interne WA (`chat_fallback_kb`, Dispatcher-Mails) — interne Tools werden nicht gebrandet/übersetzt (analog branding-rules).
- **Phase 0 (Plumbing, KEIN sichtbarer Change):** `sprache` bei Erstellung schreiben (D1) + `locale`-Param durch `sendCommunication`/`sendFallCommunication`/`sendNachricht`/`sendEmail` fädeln (default `'de'`), Crons selektieren `sprache`. de byte-identisch verifizierbar.
- **Phase 1 (WhatsApp):** ~40 Templates in einem File → höchstes Volumen, einfachste Struktur. Kunden-Templates zuerst.
- **Phase 2 (Email):** 39 TSX, react-email-i18n (D4), nur die ~20 kunden-/SV-sichtbaren.

### D4 — react-email-i18n-Ansatz
react-email `render()` läuft im Cron **ohne** Request-Context → `getLocale()`(Cookie) geht nicht. → Template-Funktionen bekommen `locale` als Prop und holen Strings via `getTranslations({locale})` ODER ein vorab geladenes `t`/Strings-Objekt als Prop. **Empfehlung:** `locale`-Prop + `getTranslations({locale})` am Render-Einstieg (`flows.ts`), Strings als Props in die TSX → TSX bleibt dünn.

## Vorgeschlagene PR-Sequenz
1. **PR B0** — Plumbing: `sprache`-Population (D1) + Locale-Threading (default de) + Cron-Selects. Smoke: de byte-identisch, `sprache` wird bei neuem Lead gesetzt.
2. **PR B1** — WhatsApp-Templates i18n (Phase 1), kundensichtbar. Smoke: Sende-Pfad pro Locale (de/en/ar) verifizieren.
3. **PR B2** — Email-Templates i18n (Phase 2), kunden-/SV-sichtbar.

## Non-Goals
- Interne Mails/WA (Kanzlei/Admin/Büro/KB-intern) — bleiben deutsch.
- PDF-Generation, Auth-Mails (`TwoFactorCode`) — nicht gebrandet/übersetzt (branding-rules).
- Rückwärts-Übersetzung von Bestands-`nachrichten`/`email_log` (Audit-Log, historisch).
- SMS-only-Pfade falls separat (zuerst WA+Email).

## Verifikations-Plan (pro PR)
- Build grün (tsc + voller `next build`), `check:i18n` Key-Parität.
- Send-Pfad-Smoke: Test-Lead mit `sprache='en'`/`'ar'` → Trigger feuern → gerenderten WA-Text / Email-HTML pro Locale prüfen (Screenshot/Snapshot), de byte-identisch.
- Kein RLS-/Auth-Change; `sprache`-Default `'de'` ⇒ Bestandsfälle unverändert.

## Offene Fragen an Aaron
1. **D1**: Cookie→`leads.sprache` als Quelle ok? (oder explizite Wizard-Sprachwahl?)
2. **D2**: next-intl `getTranslations({locale})` (Empfehlung A) oder Per-Locale-Maps (B)?
3. **D3**: Scope „nur kunden-/SV-sichtbar, intern bleibt deutsch" ok? Phasen-Reihenfolge (Plumbing→WA→Email) ok?
4. Start mit **PR B0 (Plumbing)** — einverstanden? (Ohne B0 wirkt keine Template-Übersetzung, weil keine Locale ankommt.)
