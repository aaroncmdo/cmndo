# Ticket: CMM-28 Follow-up — Admin/KB-Fallakte (`app/faelle/[id]/page.tsx`) prüfen

**Typ:** Klärung / ggf. Re-Integration · **Owner:** CMM-28 / Admin-Portal · **Priorität:** mittel · **Aufgedeckt:** 13.05.2026 (Aufräum-Aktion `8f088031`-Merge — siehe `docs/13.05.26/8f088031-merge-regression-cleanup-bericht.md`)

## Kontext

`app/faelle/[id]/page.tsx` (die Admin-/Kundenbetreuer-Fallakte — nicht zu verwechseln mit `app/gutachter/fall/[id]/page.tsx`, der SV-Fallakte, die in PR #840 schon repariert wurde) hat ggü. dem glass-polish-Branch-Stand `8f088031^1` ~−219 Z. Netto. Die `-`-Zeilen enthalten u. a.:

- `import VsKorrespondenzCard, { type VsKorrespondenzEintrag } from '@/components/kb/VsKorrespondenzCard'` — VS-Korrespondenz-Card
- `import KanzleiSlaStatusCard from '@/components/kb/KanzleiSlaStatusCard'` — Kanzlei-SLA-Status-Card
- `import GutachtenOcrCard from '@/components/admin/fallakte/GutachtenOcrCard'` + die `loadGutachtenOcr()`-Funktion — Gutachten-OCR-Card

**Aber:** anders als bei den klaren Merge-Regressionen wurde diese Datei *auch* von `869c437f` (CMM-28-Sammel-Commit) stark berührt — der Commit-Header erwähnt explizit „**Admin-Fallakte** Features (QC-Modal, OCR) die …". Es ist daher **nicht klar, ob die fehlenden Cards der `8f088031`-Merge versehentlich gedroppt hat oder ob CMM-28 sie bewusst entfernt/relocated hat** (z. B. die OCR-Card könnte in ein QC-Modal gewandert sein).

## Frage / zu entscheiden

Pro Card (`VsKorrespondenzCard`, `KanzleiSlaStatusCard`, `GutachtenOcrCard`): existiert die Komponente noch (`git ls-files src/components/kb/VsKorrespondenzCard* src/components/kb/KanzleiSlaStatusCard* src/components/admin/fallakte/GutachtenOcrCard*`)? Wird sie noch woanders importiert? Was sagt der CMM-28-Commit/Spec — bewusst entfernt/relocated oder kollateral verloren?
- **bewusst** → kein Restore; ggf. orphaned Komponente löschen.
- **kollateral verloren** → in die aktuelle `faelle/[id]/page.tsx` re-integrieren (3-Wege-Merge: die `-`-Blöcke aus `8f088031^1` zurück, mit den CMM-28-Änderungen reconcilen — Methode siehe `docs/12.05.2026/glass-merge-regression-restore-plan.md` §3).

## Definition of Done

- [ ] Pro Card geklärt: „bewusst entfernt/relocated" oder „kollateral verloren"
- [ ] „bewusst": orphaned Komponenten ggf. gelöscht; knip grün
- [ ] „kollateral verloren": Card(s) re-integriert, mit CMM-28 reconciliert, `npm run build` grün, in der Admin/KB-Fallakte sichtbar
