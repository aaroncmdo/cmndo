# Sweep — WhatsApp-href + Telefon zentralisieren (Stream-B-Folge)

**Datum:** 2026-05-23 · **Branch:** `kitta/sweep-whatsapp-phone` (off clean staging, nach #1580-Merge)
**Auftrag:** Aaron — „WA + Phone, jetzt" (Founder-Sweep deferred). Folge-Stream zu Stream B (HQ-Adresse).

## Was gemacht

Einzige Code-Quelle geschaffen + alle Consumer darauf umgestellt:
- **`WHATSAPP_HREF`** neu in `jsonld.ts` (= einzige Code-Quelle des wa.me-Deep-Links). `conversion-handoff.HANDOFF_WHATSAPP_HREF` referenziert es jetzt (kein Literal-Duplikat).
- **`PHONE_DISPLAY` / `PHONE_E164`** existierten bereits in `jsonld.ts` — 4 Files, die sie **lokal neu definierten**, importieren jetzt (StickyCallBar, HauptseiteClient, LandingHero, FaqClient).

**24 Files** umgestellt:
- WA-Modul-Consts (`const WA = '…'`): decoder/haftpflicht/kfz-haftpflicht-schaden/ratgeber/sachverstaendige[slug]+hub, SpokeCtaBand → `= WHATSAPP_HREF`.
- WA-Inline-href: gutachter-finden, vorteile, wie-es-funktioniert, kfz-gutachter/[stadt], HauptseitePremium, beratung-anfragen, FaqClient → `href={WHATSAPP_HREF}`.
- Phone-Inline-Anzeige: ersteinschaetzung (2×), schaden-melden/selbstverschulden, kfz-gutachter/[stadt]/actions (2 Error-Strings) → `{PHONE_DISPLAY}` / `${PHONE_DISPLAY}`.
- llms.txt + llms-full.txt: WA + Telefon in der Prosa → `${WHATSAPP_HREF}` / `${PHONE_DISPLAY}` (Output byte-identisch).

## Bewusst NICHT (dokumentiert)

- **Founder-Namen** (Nicolas Kitta / Aaron Sprafke): NICHT angefasst — die Vorkommen stecken in **Legal-Seiten** (Impressum/Datenschutz, gesetzlich wörtlich), **PDF-Generierung** und einem **Namens-Util** (`anrede.ts`); keine sauberen „Brand-String"-Fälle. Eigener Folge-Stream bei Bedarf.
- **2 intentionale Phone-Literale bleiben** (kein Bug):
  - `brand-constants.ts` D2 (`Sitz: … Telefon: 0221 25906530 …`) — SOT-Satz; `brand-constants` darf `jsonld` nicht importieren (würde zirkulär, da jsonld→brand-constants).
  - `conversion-handoff.ts` Hand-off-Satz — bewusst Literal für GEO-Direct-Quotation (File-Header-Policy).
- Legal-Markdown + i18n-JSON + Email/PDF: kein Import-Mechanismus → behalten Literale (wie bei Stream B).

## Verifikation

- `grep wa.me/4922125906530 src --include=*.ts*` (excl i18n/legal/email/pdf) → **nur `jsonld.ts`** (single source).
- `grep "0221 25906530"` (dito) → `jsonld.ts` (Quelle) + 2 dokumentierte SOT-Ausnahmen.
- `tsc --noEmit` exit 0 · `check:token-audit` 0 Verstöße.
- `next build`: **303/303 static pages generiert** in 93s; Exit rot **nur** an `/gutachter-partner` (Export-Timeout >60s = Parallel-Session-Prod-DB-Contention, **nicht** angefasst, CI isoliert grün — bestätigtes Muster).
- Dev-Smoke (`next dev`): `/vorteile`, `/faq`, `/ersteinschaetzung` HTTP 200 mit gerenderten WA-Links + Telefon; `/llms.txt` HTTP 200, wa.me/0221 vorhanden, **0× literale `${`** (Interpolation aufgelöst).

## Effekt

Telefonnummer / WhatsApp-Link ändern = jetzt **1 Stelle** (`jsonld.ts`) statt ~24. Konsistent mit Stream B (HQ-Adresse).
