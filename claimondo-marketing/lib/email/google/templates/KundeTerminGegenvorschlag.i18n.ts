// i18n strings for KundeTerminGegenvorschlag email template.
// de = fallback and source of truth (byte-identical to the original German).
// Recipient = KUNDE (accident victim, possibly non-German).
// VERBATIM (never translated): Claimondo, LexDrive, WhatsApp, URLs, EUR,
// brand names, date/time values, the recipient's name and the assessor's name.

type S = {
  // subject(p): `Neuer Terminvorschlag von ${svName} — ${neuerTerminDatum}`
  subject: (svName: string, neuerTerminDatum: string) => string
  // preview header text (hidden inbox snippet)
  preview: (svName: string, neuerTerminDatum: string, neuerTerminUhrzeit: string) => string
  heading: string
  // greeting paragraph, split around the two interpolated names
  begruessung: (kundenVorname: string, svName: string) => string
  labelFall: string
  labelUrspruenglicherTermin: string
  labelNeuerVorschlag: string
  labelBegruendung: string
  // InfoTable value: `${datum} um ${uhrzeit} Uhr`
  terminWert: (datum: string, uhrzeit: string) => string
  hinweis: string
  button: string
  linkFallback: string
}

const de: S = {
  subject: (svName, neuerTerminDatum) => `Neuer Terminvorschlag von ${svName} — ${neuerTerminDatum}`,
  preview: (svName, neuerTerminDatum, neuerTerminUhrzeit) =>
    `${svName} schlägt einen neuen Termin vor: ${neuerTerminDatum} ${neuerTerminUhrzeit}`,
  heading: 'Neuer Terminvorschlag vom Sachverständigen',
  begruessung: (kundenVorname, svName) =>
    `Hallo ${kundenVorname}, Ihr Sachverständiger ${svName} kann den ursprünglich vereinbarten Termin leider nicht halten und schlägt einen Alternativtermin vor.`,
  labelFall: 'Fall',
  labelUrspruenglicherTermin: 'Ursprünglicher Termin',
  labelNeuerVorschlag: 'Neuer Vorschlag',
  labelBegruendung: 'Begründung',
  terminWert: (datum, uhrzeit) => `${datum} um ${uhrzeit} Uhr`,
  hinweis:
    'Sie können den Vorschlag direkt über den Button unten annehmen oder einen eigenen Termin vorschlagen. Kein Login nötig.',
  button: 'Termin annehmen oder Gegenvorschlag',
  linkFallback: 'Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:',
}

const en: S = {
  subject: (svName, neuerTerminDatum) => `New appointment proposal from ${svName} — ${neuerTerminDatum}`,
  preview: (svName, neuerTerminDatum, neuerTerminUhrzeit) =>
    `${svName} proposes a new appointment: ${neuerTerminDatum} ${neuerTerminUhrzeit}`,
  heading: 'New appointment proposal from the assessor',
  begruessung: (kundenVorname, svName) =>
    `Hello ${kundenVorname}, unfortunately your assessor ${svName} cannot keep the originally agreed appointment and proposes an alternative date.`,
  labelFall: 'Case',
  labelUrspruenglicherTermin: 'Original appointment',
  labelNeuerVorschlag: 'New proposal',
  labelBegruendung: 'Reason',
  terminWert: (datum, uhrzeit) => `${datum} at ${uhrzeit}`,
  hinweis:
    'You can accept the proposal directly via the button below or suggest your own appointment. No login required.',
  button: 'Accept appointment or counter-proposal',
  linkFallback: 'If the button does not work, copy this link into your browser:',
}

const tr: S = {
  subject: (svName, neuerTerminDatum) => `${svName} tarafından yeni randevu önerisi — ${neuerTerminDatum}`,
  preview: (svName, neuerTerminDatum, neuerTerminUhrzeit) =>
    `${svName} yeni bir randevu öneriyor: ${neuerTerminDatum} ${neuerTerminUhrzeit}`,
  heading: 'Ekspertten yeni randevu önerisi',
  begruessung: (kundenVorname, svName) =>
    `Merhaba ${kundenVorname}, eksperiniz ${svName} ne yazık ki başlangıçta kararlaştırılan randevuyu gerçekleştiremiyor ve alternatif bir tarih öneriyor.`,
  labelFall: 'Dosya',
  labelUrspruenglicherTermin: 'Asıl randevu',
  labelNeuerVorschlag: 'Yeni öneri',
  labelBegruendung: 'Gerekçe',
  terminWert: (datum, uhrzeit) => `${datum} saat ${uhrzeit}`,
  hinweis:
    'Öneriyi aşağıdaki düğmeden doğrudan kabul edebilir veya kendi randevunuzu önerebilirsiniz. Giriş yapmanız gerekmez.',
  button: 'Randevuyu kabul et veya karşı öneri sun',
  linkFallback: 'Düğme çalışmazsa bu bağlantıyı tarayıcınıza kopyalayın:',
}

const ar: S = {
  subject: (svName, neuerTerminDatum) => `اقتراح موعد جديد من ${svName} — ${neuerTerminDatum}`,
  preview: (svName, neuerTerminDatum, neuerTerminUhrzeit) =>
    `${svName} يقترح موعدًا جديدًا: ${neuerTerminDatum} ${neuerTerminUhrzeit}`,
  heading: 'اقتراح موعد جديد من الخبير المثمّن',
  begruessung: (kundenVorname, svName) =>
    `مرحبًا ${kundenVorname}، للأسف لا يستطيع الخبير المثمّن ${svName} الالتزام بالموعد المتفق عليه أصلًا ويقترح موعدًا بديلًا.`,
  labelFall: 'الملف',
  labelUrspruenglicherTermin: 'الموعد الأصلي',
  labelNeuerVorschlag: 'الاقتراح الجديد',
  labelBegruendung: 'السبب',
  terminWert: (datum, uhrzeit) => `${datum} الساعة ${uhrzeit}`,
  hinweis:
    'يمكنك قبول الاقتراح مباشرةً عبر الزر أدناه أو اقتراح موعد خاص بك. لا حاجة لتسجيل الدخول.',
  button: 'قبول الموعد أو تقديم اقتراح مضاد',
  linkFallback: 'إذا لم يعمل الزر، فانسخ هذا الرابط في متصفحك:',
}

const ru: S = {
  subject: (svName, neuerTerminDatum) => `Новое предложение по встрече от ${svName} — ${neuerTerminDatum}`,
  preview: (svName, neuerTerminDatum, neuerTerminUhrzeit) =>
    `${svName} предлагает новую встречу: ${neuerTerminDatum} ${neuerTerminUhrzeit}`,
  heading: 'Новое предложение по встрече от эксперта',
  begruessung: (kundenVorname, svName) =>
    `Здравствуйте, ${kundenVorname}! К сожалению, ваш эксперт ${svName} не может прийти на первоначально согласованную встречу и предлагает альтернативную дату.`,
  labelFall: 'Дело',
  labelUrspruenglicherTermin: 'Первоначальная встреча',
  labelNeuerVorschlag: 'Новое предложение',
  labelBegruendung: 'Причина',
  terminWert: (datum, uhrzeit) => `${datum} в ${uhrzeit}`,
  hinweis:
    'Вы можете принять предложение прямо с помощью кнопки ниже или предложить свою встречу. Вход в систему не требуется.',
  button: 'Принять встречу или предложить другую',
  linkFallback: 'Если кнопка не работает, скопируйте эту ссылку в браузер:',
}

const pl: S = {
  subject: (svName, neuerTerminDatum) => `Nowa propozycja terminu od ${svName} — ${neuerTerminDatum}`,
  preview: (svName, neuerTerminDatum, neuerTerminUhrzeit) =>
    `${svName} proponuje nowy termin: ${neuerTerminDatum} ${neuerTerminUhrzeit}`,
  heading: 'Nowa propozycja terminu od rzeczoznawcy',
  begruessung: (kundenVorname, svName) =>
    `Witaj ${kundenVorname}, niestety Twój rzeczoznawca ${svName} nie może dotrzymać pierwotnie ustalonego terminu i proponuje termin alternatywny.`,
  labelFall: 'Sprawa',
  labelUrspruenglicherTermin: 'Pierwotny termin',
  labelNeuerVorschlag: 'Nowa propozycja',
  labelBegruendung: 'Powód',
  terminWert: (datum, uhrzeit) => `${datum} o ${uhrzeit}`,
  hinweis:
    'Możesz przyjąć propozycję bezpośrednio za pomocą przycisku poniżej albo zaproponować własny termin. Logowanie nie jest wymagane.',
  button: 'Przyjmij termin lub złóż kontrpropozycję',
  linkFallback: 'Jeśli przycisk nie działa, skopiuj ten link do przeglądarki:',
}

const ALL: Record<string, S> = { de, en, tr, ar, ru, pl }

export function getKundeTerminGegenvorschlagStrings(locale: string): S {
  return ALL[locale] ?? de
}
