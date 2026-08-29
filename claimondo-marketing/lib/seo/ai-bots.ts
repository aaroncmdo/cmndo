// Einzige Quelle fuer die Bots, die wir aktiv aussperren.
//
// Zwei Stellen lesen diese Liste — sie wuerden auseinanderdriften, waere sie
// doppelt gepflegt:
//
//   app/robots.ts    das SIGNAL         `Disallow: /` in der robots.txt
//   middleware.ts    die DURCHSETZUNG   HTTP 403
//
// Warum es beides braucht: robots.txt ist eine Bitte, keine Sperre. Am
// 29.08.2026 aus den nginx-Logs gemessen: **191 HTML-Zugriffe von Bytespider in
// 14 Tagen** — trotz korrekt ausgeliefertem `Disallow: /`. Das Signal bleibt
// (hoefliche Crawler halten sich daran und wir dokumentieren die Absicht), die
// Middleware setzt es durch.
//
// Bytespider: aggressiver Scraper (ByteDance/TikTok) ohne Zitier-Oberflaeche im
// deutschen Kfz-Gutachten-Markt — reine Crawl-Last, kein Gegenwert. Aaron-
// Entscheid; Begruendung in docs/conversion-tracking-attribution-runbook.md (A3)
// und docs/superpowers/specs/2026-08-12-hyperlokal-geo-content-design.md §8.
//
// ⚠ Diese Liste ist bewusst KURZ. Jeder weitere Eintrag sperrt eine Quelle aus,
// die uns zitieren koennte — die uebrigen KI-Crawler stehen in `AI_BOTS_ALLOW`
// (app/robots.ts) und sind ausdruecklich erwuenscht: sie lieferten in denselben
// 14 Tagen rund 18.400 Zugriffe, etwa das Neunfache von Googlebot.
export const AI_BOTS_BLOCK = ['Bytespider'] as const
