// Zentrale LP-Konstanten — Telefon- und WhatsApp-Routing-Werte.
//
// 21.08.2026 — PRIMAERNUMMER JETZT MOBIL (Aaron-Entscheid). Vorher stand hier
// das Festnetz +49 221 25 906 530 fest verdrahtet.
//
// ⚠ AUF DIESER SEITE KOSTET DER WECHSEL AM MEISTEN: `/kfzgutachter-lp` ist
// eine reine Paid-Traffic-Landingpage (noindex). Das Festnetz war die
// matelso/aircall-Nummer — der Anruf von hier WAR die Ads-Conversion. Ueber
// die Mobilnummer laesst sich ein Anruf nicht mehr der Anzeige zuordnen, die
// ihn ausgeloest hat. Zurueck geht es ueber PHONE_FESTNETZ_E164.
//
// Die Werte werden ABGELEITET statt wiederholt: eine zweite Schreibweise
// derselben Nummer ist genau die Duplikation, die den Wechsel zur 25-Datei-
// Aufgabe gemacht hat.
import { PHONE_E164, PHONE_DISPLAY } from '@/lib/seo/jsonld'

export const TEL_HREF = `tel:${PHONE_E164}`
/** ⚠ Format-Wechsel 21.08.: national („0151 …") statt international
 *  („+49 221 …", Aaron 20.05.2026) — dafuer ueberall dieselbe Schreibweise. */
export const TEL_DISPLAY = PHONE_DISPLAY
export const WA_HREF = 'https://wa.me/4915153608515'
