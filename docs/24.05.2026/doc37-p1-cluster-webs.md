# Doc 37 P1 — Cluster-Webs + Hreflang

**Datum:** 2026-05-24 · **Branch:** `kitta/doc37-p1-cluster-webs` (off staging) · **PR:** gegen `staging`
**Kontext:** Folge auf #1646 (Doc 35 + Doc 37 P0). Doc 37 P1 (pre-release). Aaron-Entscheid: P1 als Nächstes. **Bewusst off staging gebrancht** (nicht off #1646) — P1 berührt ausschließlich Files, die #1646 NICHT anfasst → mergt konfliktfrei unabhängig, kein Stacked-Conflict.

## Umgesetzt (alle 3 P1-Punkte)

### §5 SV-Sibling-Web (8 MDX)
Jede der 8 `sachverstaendige/*.md` bekommt einen „## Verwandte Verbände"-Block mit 2 thematisch nächsten Verbänden (Doc 37 §5-Mapping). Vorher: pure Hub-and-Spoke (0 Sibling-Links). Mapping:
- bvsk → ihk-bestellung-oebv, dekra · dekra → gtue-kues-tuev-ifl, pruefdienstleister · gtue-kues-tuev-ifl → dekra, pruefdienstleister · ifs-leitsaetze → zak, zkf · ihk-bestellung-oebv → bvsk, dekra · pruefdienstleister → dekra, gtue-kues-tuev-ifl · zak → ifs-leitsaetze, zkf · zkf → zak, ifs-leitsaetze
- Append am EOF (SV-MDX haben **keinen** Schema-Block → kein stripSchemaSection-Konflikt). Bash-Append mit Trailing-Newline-Guard (verhindert `text\n---`-Setext-Heading-Falle).

### §6 Misstrauens-Trio-Sibling-Web (3 page.tsx)
Jede der 3 Seiten verlinkt jetzt die beiden Geschwister + den `/unfall-was-tun`-Cornerstone (war 1/6 Cross-Links):
- `gegnerische-versicherung-zahlt-nicht`: neue „Verwandte Themen"-Sektion vor ConversionAnchorBlock (bestehende Sektion war Verzug/Zinsen, themenfremd).
- `versicherung-schickt-gutachter`: 3 Links an die bestehende „Mehr zur freien Sachverständigenwahl"-Liste angehängt.
- `unverschuldeter-unfall-rechte`: 2 fehlende Links (versicherung-schickt + unfall-was-tun) an die bestehende Related-Liste (hatte gegnerische schon).

### §7 Hreflang (sitemap.ts, 11 URLs)
`alternates: { languages: langAlternates('/<slug>') }` für die 11 zuvor alternates-losen Einträge: 9 Sprint-2-Seiten + `/decoder` + `/sachverstaendige`. Helper + Locale-Set (`de-DE, en-US, ar, tr-TR, pl-PL, ru-RU` + `x-default`) waren vorhanden; Cornerstones-Loop nutzte sie schon (Vorlage). **Scope = exakt Doc 37 §7** (die 3 Spoke-Loops getHaftpflichtSpokes/getDecoder/getSachverstaendige bleiben ohne Alternates — bewusst, da nicht in §7 gelistet; optionaler Folge-Schliff).

## Verifikation
- `tsc --noEmit`: **0**. `npm run check:token-audit`: **1699 Files, 0 Verstöße**. 12 Files (4 page.tsx + sitemap + 8 SV-MDX).
- `next build`: **grün** (siehe Commit-Audit).
- Dev-Smoke (§5/§6): SV-Sibling-Links (bvsk → ihk + dekra, Heading „Verwandte Verbände"; alle 8 Files je section=1 + 2 Sibling-Links) · Misstrauens-Trio (jede der 3 Seiten → beide Geschwister + Cornerstone, alle 9 Cross-Links grün).
- §7 verifiziert gegen das **gebaute statische `sitemap.xml.body`** (45 KB): jede der 11 URLs exakt **7** `hreflang`-Alternates (6 Locales + x-default), 161 Alternates gesamt. (Dev-Server-Smoke war hier unzuverlässig — leere Responses bei Cold-Start unter Last; das Build-Output ist autoritativ.)

## 7-Punkte-Audit
- **Build:** grün (tsc 0 + next build + token-audit 1699/0)
- **UI:** SV-Sibling-Links + Misstrauens-„Verwandte Themen" in bestehenden/neuen Sektionen sichtbar; Hreflang nur in sitemap (kein UI).
- **Redundanz:** nutzt bestehende Link-Sektionen wo vorhanden; langAlternates wiederverwendet.
- **Dead-Code:** keiner.
- **Spec-Treue:** Doc 37 §5/§6/§7 (P1) vollständig; Spoke-Loop-Hreflang bewusst ausgelassen (Scope).
- **Inkonsistenz:** Claimondo-Tokens, Umlaute korrekt; SV-Append mit Newline-Guard.
- **Regression:** rein additive interne Links + sitemap-Props; disjunkt zu #1646.

## Offen (Doc 37 P2 — separat, nach #1646-Merge)
§8.1 Schadensreport-Cross-Links (überlappt #1646-Files) · §8.2 Footer-Standorte-Spalte (LandingFooter, in #1646) → erst nach #1646-Merge off updated staging.
