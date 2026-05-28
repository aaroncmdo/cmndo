import type { TemplateName } from './template-sids'

// Track B1 (Doc 48): Polish translations of the WhatsApp legacy templates.
// Mirrors the de structure in legacy-texts.ts exactly; only the prose is translated.
export const TEMPLATES_PL: Partial<Record<TemplateName, (vars: Record<string, string>) => string>> = {
  fall_eroeffnet: (v) =>
    `Dzień dobry ${v['1'] ?? 'Kliencie'}, Pana/Pani sprawa ${v['2'] ?? ''} została otwarta w Claimondo. Zajmiemy się wszystkim pozostałym. W razie pytań wystarczy odpowiedzieć na tę wiadomość.`,

  // AAR-312: Direkt nach SA — erklärt Zwei-Stufen-Zahlung + Sachverständiger kommt.
  // Variablen: 1=Vorname, 2=Portal-Link
  info_nach_sa: (v) =>
    `Jeszcze krótka informacja, ${v['1'] ?? ''}: za likwidację szkody NIE płaci Pan/Pani NIC. Wszystkie koszty pokrywa ubezpieczyciel sprawcy. Wypłata następuje często w dwóch etapach (pierwsza częściowa wypłata szybko, reszta po zakończeniu). Rzeczoznawca przyjeżdża bezpośrednio do Pana/Pani — nie musi Pan/Pani nigdzie jechać. Wszystkie aktualizacje w Pana/Pani portalu: ${v['2'] ?? ''}`,

  flowlink_versand: (v) =>
    // AAR-116: Template erwartet 6 Variablen (Vorname, SV-Vorname, SV-Nachname, Datum, Uhrzeit, FlowLink-URL)
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani termin oględzin z rzeczoznawcą ${v['2'] ?? ''} ${v['3'] ?? ''} w dniu ${v['4'] ?? ''} o godz. ${v['5'] ?? ''} jest ustalony. Proszę teraz wypełnić formularz, aby uzupełnić sprawę szkodową: ${v['6'] ?? ''}`,

  sv_beauftragt: (v) =>
    `Dobre wiadomości, ${v['1'] ?? ''}! Zleciliśmy dla Pana/Pani rzeczoznawcę ${v['2'] ?? ''}. Wkrótce skontaktuje się z Panem/Panią, aby umówić termin oględzin.`,

  termin_bestaetigt: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani termin oględzin z rzeczoznawcą ${v['2'] ?? ''} jest potwierdzony na ${v['3'] ?? ''}. Rzeczoznawca przyjedzie bezpośrednio do Pana/Pani. Proszę zapewnić dostęp do pojazdu.`,

  reminder_24h: (v) =>
    `Przypomnienie: jutro o godz. ${v['2'] ?? ''} przyjedzie Pana/Pani rzeczoznawca. Proszę przygotować dowód rejestracyjny, dowód osobisty oraz pojazd, ${v['1'] ?? ''}.`,

  reminder_2h: (v) =>
    `${v['1'] ?? ''}, za ok. 2 godziny odbędzie się Pana/Pani termin oględzin. Rzeczoznawca jest już w drodze do Pana/Pani.`,

  sv_tagesroute: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani rzeczoznawca rozpoczął trasę dnia i dotrze do Pana/Pani za ok. ${v['2'] ?? ''} minut.`,

  gutachten_fertig: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani opinia rzeczoznawcy jest gotowa i zostaje teraz przekazana do kancelarii prawnej. Nie musi Pan/Pani nic więcej robić.`,

  kanzlei_uebergabe: (v) =>
    `${v['1'] ?? ''}, Pana/Pani sprawa została przekazana do naszej kancelarii partnerskiej. Kancelaria wyegzekwuje dla Pana/Pani likwidację szkody u ubezpieczyciela sprawcy.`,

  as_gesendet: (v) =>
    `${v['1'] ?? ''}, pismo do ubezpieczyciela zostało wysłane. Teraz biegnie standardowy termin rozpatrzenia przez ubezpieczyciela (4-6 tygodni).`,

  regulierung_angekuendigt: (v) =>
    `Świetne wiadomości, ${v['1'] ?? ''}! Ubezpieczyciel zapowiedział likwidację szkody. Sprawdzamy kwotę i odezwiemy się ze szczegółami.`,

  zahlung_eingegangen: (v) =>
    `${v['1'] ?? ''}, dla Pana/Pani sprawy wpłynęła płatność w wysokości ${v['2'] ?? ''} EUR. Szczegóły znajdzie Pan/Pani w swoim portalu klienta.`,

  fall_abgeschlossen: (v) =>
    `${v['1'] ?? ''}, Pana/Pani sprawa szkodowa została pomyślnie zakończona. Dziękujemy za zaufanie do Claimondo! Bylibyśmy wdzięczni za opinię w Google.`,

  eskalation_tag14: (v) =>
    `${v['1'] ?? ''}, ubezpieczyciel nie zareagował jeszcze na nasze pismo (14 dni). Ponowiliśmy zapytanie.`,

  eskalation_tag28: (v) =>
    `${v['1'] ?? ''}, po 28 dniach bez odpowiedzi ubezpieczyciela wysłaliśmy formalne wezwanie z wyznaczeniem terminu.`,


  chat_fallback_kunde: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, ma Pan/Pani nową wiadomość w swoim portalu Claimondo. Proszę sprawdzić skrzynkę odbiorczą.`,

  chat_fallback_kb: (v) =>
    `Nowa wiadomość od klienta do sprawy ${v['1'] ?? ''}. Proszę odpowiedzieć w portalu.`,

  kuerzung_eingetragen: (v) =>
    `${v['1'] ?? ''}, ubezpieczyciel dokonał obniżenia odszkodowania. Nasz zespół sprawdza, czy podejmiemy działania przeciwko temu. Szczegóły w portalu klienta.`,

  sv_losgefahren: (v) =>
    `${v['1'] ?? ''}, Pana/Pani rzeczoznawca wyruszył w drogę i dotrze do Pana/Pani za ok. ${v['2'] ?? ''} minut.`,

  sv_fast_da: (v) =>
    `${v['1'] ?? ''}, Pana/Pani rzeczoznawca ${v['2'] ?? ''} jest już prawie u Pana/Pani. Proszę przygotować pojazd.`,

  sv_angekommen: (v) =>
    `${v['1'] ?? ''}, Pana/Pani rzeczoznawca ${v['2'] ?? ''} dotarł na miejsce. Oględziny rozpoczynają się teraz.`,

  // ─── Neue Templates 24-27 (KFZ-181) ─────────────────────────────

  termin_storniert: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, niestety termin oględzin z rzeczoznawcą ${v['2'] ?? ''} w dniu ${v['3'] ?? ''} musi zostać odwołany. Wkrótce skontaktujemy się z Panem/Panią w sprawie terminu zastępczego.`,

  sv_verspaetet: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani rzeczoznawca ${v['2'] ?? ''} spóźni się o ok. ${v['3'] ?? ''} minut. Prosimy o wyrozumiałość.`,

  dokumente_nachreichen: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, do Pana/Pani sprawy szkodowej brakuje jeszcze następujących dokumentów: ${v['2'] ?? ''}. Proszę przesłać je tutaj: ${v['3'] ?? ''}`,

  rechnung_verfuegbar: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani faktura jest gotowa do pobrania: ${v['2'] ?? ''}`,

  // ─── KFZ-193: KB-Beratungstermin Templates ───────────────────────────────

  kb_termin_bestaetigt: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani termin konsultacji w dniu ${v['2'] ?? ''} o godz. ${v['3'] ?? ''} (${v['4'] === 'video' ? 'Rozmowa wideo' : 'Telefon'}) jest potwierdzony.${v['5'] ? ` Link do rozmowy wideo: ${v['5']}` : ''} Pana/Pani zespół Claimondo`,

  kb_termin_reminder_24h: (v) =>
    `Przypomnienie: ${v['1'] ?? ''}, jutro ${v['2'] ?? ''} o godz. ${v['3'] ?? ''} ma Pan/Pani termin konsultacji ze swoim opiekunem Claimondo (${v['4'] === 'video' ? 'Rozmowa wideo' : 'Telefon'}).`,

  kb_termin_reminder_1h: (v) =>
    `${v['1'] ?? ''}, za ok. 1 godzinę (o godz. ${v['2'] ?? ''}) ${v['3'] ? `rozpocznie się Pana/Pani rozmowa wideo. Link: ${v['3']}` : 'Pana/Pani opiekun Claimondo zadzwoni do Pana/Pani. Proszę przygotować telefon.'}`,

  // KFZ-202: No-Show — CMM-39: zusaetzlich Re-Termin-FlowLink (Variable 2)
  no_show_kunde: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, niestety nie zastaliśmy Pana/Pani w umówionym terminie oględzin. Proszę wybrać tutaj nowy termin: ${v['2'] ?? ''}`,

  // KFZ-207: Eskalation Tag 21
  eskalation_tag21: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, aktywnie prowadzimy Pana/Pani sprawę. Dziś ponownie skontaktowaliśmy się z ubezpieczycielem i wkrótce spodziewamy się odpowiedzi. Portal: ${v['2'] ?? ''}`,

  // KFZ-210: Nachbesichtigung
  nachbesichtigung_angefordert: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, ubezpieczyciel zażądał ponownych oględzin Pana/Pani pojazdu. Proszę wybrać termin w swoim portalu: ${v['2'] ?? ''}`,
  nachbesichtigung_termin: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani termin ponownych oględzin jest potwierdzony na ${v['2'] ?? ''}. Proszę przygotować pojazd. Szczegóły: ${v['3'] ?? ''}`,
  nachbesichtigung_abgeschlossen: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, ponowne oględziny Pana/Pani pojazdu zostały zakończone. Poinformujemy Pana/Panią, gdy tylko poznamy wynik. Portal: ${v['2'] ?? ''}`,

  // AAR-352: Multi-Slot-Upload-Anfrage — 1=Vorname, 2=Upload-Link
  dokumente_upload_anfrage: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, proszę przesłać żądane dokumenty za pomocą następującego linku: ${v['2'] ?? ''} (link ważny 7 dni). Claimondo`,

  // AAR-559 (C10): SV-Auftrag Technische Stellungnahme — 1=SV-Vorname, 2=Fall-Nr, 3=Grund-Kurzform, 4=Portal-Link
  stellungnahme_beauftragt: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, do sprawy ${v['2'] ?? ''} wymagana jest techniczna opinia rzeczoznawcy (powód: ${v['3'] ?? ''}). Szczegóły w portalu: ${v['4'] ?? ''}`,

  // AAR-561 (C12): SV-Konfrontations-Anfrage — 1=SV-Vorname, 2=Fall-Nr, 3=Termin, 4=Portal-Link
  sv_konfrontation_anfrage: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, do sprawy ${v['2'] ?? ''} zaplanowany jest termin konfrontacji z rzeczoznawcą ubezpieczyciela w dniu ${v['3'] ?? ''}. Proszę potwierdzić w portalu: ${v['4'] ?? ''}`,

  // AAR-561 (C12): Kunde-Zusage SV-Konfrontation — 1=Kunden-Vorname, 2=SV-Vorname, 3=Termin, 4=Portal-Link
  sv_konfrontation_bestaetigt_kunde: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani rzeczoznawca ${v['2'] ?? ''} będzie Panu/Pani towarzyszył w dniu ${v['3'] ?? ''} podczas ponownych oględzin z rzeczoznawcą ubezpieczyciela. Szczegóły: ${v['4'] ?? ''}`,

  // AAR-864 T31: SV bittet um Verlegung — 1=Vorname, 2=alterDatum, 3=alterUhrzeit,
  //   4=neuesDatum, 5=neuesUhrzeit, 6=SV-Vorname, 7=Portal-Link
  termin_verlegung_request: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, Pana/Pani rzeczoznawca ${v['6'] ?? ''} prosi o zmianę terminu. Zamiast ${v['2'] ?? ''} o godz. ${v['3'] ?? ''} termin miałby zostać przesunięty na ${v['4'] ?? ''} o godz. ${v['5'] ?? ''}. Proszę potwierdzić lub odrzucić: ${v['7'] ?? ''}`,

  // AAR-864 T32: Kunde hat Verlegung bestätigt — 1=SV-Vorname, 2=neuesDatum,
  //   3=neuesUhrzeit, 4=Kunden-Vorname
  termin_verlegung_bestaetigt: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, ${v['4'] ?? ''} potwierdził(a) zmianę terminu. Nowy termin: ${v['2'] ?? ''} o godz. ${v['3'] ?? ''}.`,

  // AAR-864 T33: Kunde hat Verlegung abgelehnt — 1=SV-Vorname, 2=Kunden-Vorname,
  //   3=Grund/leer
  termin_verlegung_abgelehnt: (v) =>
    `Dzień dobry ${v['1'] ?? ''}, ${v['2'] ?? ''} odrzucił(a) zmianę terminu${v['3'] ? ` (powód: ${v['3']})` : ''}. Pierwotny termin pozostaje w mocy.`,

  // AAR-864 T34: KB-Eskalation 48h vor altem Termin — 1=Vorname, 2=alterDatum,
  //   3=alterUhrzeit, 4=Portal-Link
  termin_verlegung_eskalation: (v) =>
    `Ważne, ${v['1'] ?? ''}: Pana/Pani rzeczoznawca wnioskował o zmianę terminu, jednak pierwotny termin w dniu ${v['2'] ?? ''} o godz. ${v['3'] ?? ''} jest już bliski. Proszę zdecydować TERAZ, w przeciwnym razie rzeczoznawca przyjedzie do Pana/Pani na próżno: ${v['4'] ?? ''}`,

  // AAR-864 T35: SV-WA — Kunde hat Termin proaktiv verschoben
  //   1=SV-Vorname, 2=alterDatum, 3=alterUhrzeit, 4=neuesDatum, 5=neuesUhrzeit
  termin_verschoben_durch_kunde: (v) =>
    `Cześć ${v['1'] ?? ''}, klient samodzielnie przesunął termin z ${v['2'] ?? ''} o godz. ${v['3'] ?? ''} na ${v['4'] ?? ''} o godz. ${v['5'] ?? ''}. Pamiętaj, aby dostosować swoją trasę.`,

}
