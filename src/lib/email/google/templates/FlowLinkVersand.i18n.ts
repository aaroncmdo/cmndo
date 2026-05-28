// i18n strings for FlowLinkVersand.tsx (Kunde-facing magic-link email).
// de = fallback and MUST stay byte-identical to the original German.
// VERBATIM (never translated): Claimondo, LexDrive, WhatsApp, URLs, ${APP_URL}, EUR, brand names.

type S = {
  // subject(vorname) — interpolated
  subject: (vorname: string) => string
  // preview(svVorname, svNachname) — interpolated, contains VERBATIM "Claimondo"
  preview: (svVorname: string, svNachname: string) => string
  // Heading: "Hallo {vorname}," — interpolated
  greeting: (vorname: string) => string
  // First paragraph (static)
  intro: string
  // <strong> label above the appointment table (static)
  terminLabel: string
  // InfoTable row labels (static)
  labelSachverstaendiger: string
  labelDatum: string
  labelUhrzeit: string
  // Paragraph before the button (static)
  linkIntro: string
  // Button text (static)
  buttonOeffnen: string
  // Last paragraph, split around the inline <a href={APP_URL}> link.
  // linkGueltigPre + <a>{APP_URL}</a> + linkGueltigSuf
  linkGueltigPre: string
  linkGueltigSuf: string
}

const de: S = {
  subject: (vorname) => `${vorname}, Ihr Schadenportal ist bereit`,
  preview: (svVorname, svNachname) => `Ihr Claimondo-Schadenportal — Termin mit ${svVorname} ${svNachname}`,
  greeting: (vorname) => `Hallo ${vorname},`,
  intro:
    'wir haben Ihren Fall aufgenommen. Ihr persönliches Schadenportal ist nun bereit. Dort laden Sie die nötigen Unterlagen hoch und unterschreiben Vollmacht + Sachverständigen-Auftrag.',
  terminLabel: 'Ihr Gutachter-Termin:',
  labelSachverstaendiger: 'Sachverständiger',
  labelDatum: 'Datum',
  labelUhrzeit: 'Uhrzeit',
  linkIntro: 'Über den untenstehenden Link kommen Sie direkt in Ihr Schadenportal:',
  buttonOeffnen: 'Schadenportal öffnen',
  linkGueltigPre:
    'Der Link ist 72 Stunden gültig. Bei Rückfragen antworten Sie einfach auf diese Email oder besuchen Sie ',
  linkGueltigSuf: '.',
}

const en: S = {
  subject: (vorname) => `${vorname}, your claim portal is ready`,
  preview: (svVorname, svNachname) => `Your Claimondo claim portal — appointment with ${svVorname} ${svNachname}`,
  greeting: (vorname) => `Hello ${vorname},`,
  intro:
    'we have registered your case. Your personal claim portal is now ready. There you upload the required documents and sign the power of attorney + assessor engagement.',
  terminLabel: 'Your assessor appointment:',
  labelSachverstaendiger: 'Assessor',
  labelDatum: 'Date',
  labelUhrzeit: 'Time',
  linkIntro: 'Use the link below to go directly to your claim portal:',
  buttonOeffnen: 'Open claim portal',
  linkGueltigPre:
    'The link is valid for 72 hours. If you have any questions, simply reply to this email or visit ',
  linkGueltigSuf: '.',
}

const tr: S = {
  subject: (vorname) => `${vorname}, hasar portalınız hazır`,
  preview: (svVorname, svNachname) => `Claimondo hasar portalınız — ${svVorname} ${svNachname} ile randevu`,
  greeting: (vorname) => `Merhaba ${vorname},`,
  intro:
    'dosyanızı oluşturduk. Kişisel hasar portalınız artık hazır. Orada gerekli belgeleri yükler ve vekaletname + bilirkişi görevlendirmesini imzalarsınız.',
  terminLabel: 'Bilirkişi randevunuz:',
  labelSachverstaendiger: 'Bilirkişi',
  labelDatum: 'Tarih',
  labelUhrzeit: 'Saat',
  linkIntro: 'Aşağıdaki bağlantıyı kullanarak doğrudan hasar portalınıza ulaşabilirsiniz:',
  buttonOeffnen: 'Hasar portalını aç',
  linkGueltigPre:
    'Bağlantı 72 saat geçerlidir. Sorularınız için bu e-postayı yanıtlamanız ya da şu adresi ziyaret etmeniz yeterlidir: ',
  linkGueltigSuf: '.',
}

const ar: S = {
  subject: (vorname) => `${vorname}، بوابة المطالبة الخاصة بك جاهزة`,
  preview: (svVorname, svNachname) => `بوابة المطالبة Claimondo الخاصة بك — موعد مع ${svVorname} ${svNachname}`,
  greeting: (vorname) => `مرحباً ${vorname}،`,
  intro:
    'لقد سجّلنا حالتك. أصبحت بوابة المطالبة الشخصية الخاصة بك جاهزة الآن. هناك ترفع المستندات المطلوبة وتوقّع التوكيل + تكليف الخبير.',
  terminLabel: 'موعدك مع الخبير:',
  labelSachverstaendiger: 'الخبير',
  labelDatum: 'التاريخ',
  labelUhrzeit: 'الوقت',
  linkIntro: 'استخدم الرابط أدناه للوصول مباشرةً إلى بوابة المطالبة الخاصة بك:',
  buttonOeffnen: 'فتح بوابة المطالبة',
  linkGueltigPre:
    'الرابط صالح لمدة 72 ساعة. إذا كانت لديك أي أسئلة، فما عليك سوى الرد على هذا البريد الإلكتروني أو زيارة ',
  linkGueltigSuf: '.',
}

const ru: S = {
  subject: (vorname) => `${vorname}, ваш портал по урегулированию ущерба готов`,
  preview: (svVorname, svNachname) => `Ваш портал Claimondo по урегулированию ущерба — встреча с ${svVorname} ${svNachname}`,
  greeting: (vorname) => `Здравствуйте, ${vorname},`,
  intro:
    'мы зарегистрировали ваше дело. Ваш персональный портал по урегулированию ущерба теперь готов. Там вы загружаете необходимые документы и подписываете доверенность + поручение эксперту.',
  terminLabel: 'Ваша встреча с экспертом:',
  labelSachverstaendiger: 'Эксперт',
  labelDatum: 'Дата',
  labelUhrzeit: 'Время',
  linkIntro: 'По ссылке ниже вы сразу попадёте на свой портал по урегулированию ущерба:',
  buttonOeffnen: 'Открыть портал',
  linkGueltigPre:
    'Ссылка действительна 72 часа. При возникновении вопросов просто ответьте на это письмо или посетите ',
  linkGueltigSuf: '.',
}

const pl: S = {
  subject: (vorname) => `${vorname}, Twój portal szkodowy jest gotowy`,
  preview: (svVorname, svNachname) => `Twój portal szkodowy Claimondo — termin z ${svVorname} ${svNachname}`,
  greeting: (vorname) => `Cześć ${vorname},`,
  intro:
    'przyjęliśmy Twoją sprawę. Twój osobisty portal szkodowy jest już gotowy. Tam prześlesz niezbędne dokumenty oraz podpiszesz pełnomocnictwo + zlecenie dla rzeczoznawcy.',
  terminLabel: 'Twój termin u rzeczoznawcy:',
  labelSachverstaendiger: 'Rzeczoznawca',
  labelDatum: 'Data',
  labelUhrzeit: 'Godzina',
  linkIntro: 'Skorzystaj z poniższego linku, aby przejść bezpośrednio do swojego portalu szkodowego:',
  buttonOeffnen: 'Otwórz portal szkodowy',
  linkGueltigPre:
    'Link jest ważny przez 72 godziny. W razie pytań po prostu odpowiedz na tę wiadomość lub odwiedź ',
  linkGueltigSuf: '.',
}

const ALL: Record<string, S> = { de, en, tr, ar, ru, pl }

export function getFlowLinkVersandStrings(locale: string): S {
  return ALL[locale] ?? de
}
