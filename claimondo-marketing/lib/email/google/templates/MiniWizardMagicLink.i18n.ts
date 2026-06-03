// i18n strings for MiniWizardMagicLink email template (recipient = Kunde).
// de = fallback and must stay byte-identical to the original German source.
// VERBATIM (never translated): Claimondo, LexDrive, WhatsApp, URLs, EUR, brand,
// § 249 BGB (legal reference). Interpolated/branching strings are FUNCTION keys.

type S = {
  // subject line — branches on whether a Vorname (first name) is present
  subject: (vorname: string) => string
  // salutation — branches on whether a Vorname is present
  anrede: (vorname: string) => string
  // hidden preview text
  preview: string
  // body paragraph 1
  intro: string
  // body paragraph 2 (legal note about § 249 BGB)
  ablauf: string
  // CTA button label
  cta: string
  // paragraph 3 split around the inline <a href={APP_URL}> link
  linkHinweisPrefix: string
  linkHinweisSuffix: string
}

const de: S = {
  subject: (vorname) =>
    vorname
      ? `${vorname}, hier ist Ihr sicherer Login-Link`
      : 'Ihr sicherer Login-Link bei Claimondo',
  anrede: (vorname) => (vorname ? `Hallo ${vorname},` : 'Hallo,'),
  preview: 'Ihr sicherer Login-Link für Ihren Schadenfall',
  intro:
    'danke für Ihre Schadenmeldung bei Claimondo. Mit einem Klick auf den unten stehenden Button kommen Sie direkt in Ihren Schadenfall.',
  ablauf:
    'Im nächsten Schritt unterschreiben Sie Vollmacht + Sachverständigen-Auftrag — danach kümmern wir uns um Gutachter, Anwalt, Werkstatt und Auszahlung. Sie zahlen nichts dazu (§ 249 BGB bei unverschuldeten Schäden).',
  cta: 'Schadenfall öffnen',
  linkHinweisPrefix:
    'Der Link ist 72 Stunden gültig. Bei Rückfragen antworten Sie einfach auf diese Email oder besuchen Sie ',
  linkHinweisSuffix: '.',
}

const en: S = {
  subject: (vorname) =>
    vorname
      ? `${vorname}, here is your secure login link`
      : 'Your secure login link at Claimondo',
  anrede: (vorname) => (vorname ? `Hello ${vorname},` : 'Hello,'),
  preview: 'Your secure login link for your claim',
  intro:
    'thank you for reporting your claim with Claimondo. With one click on the button below you go straight to your claim.',
  ablauf:
    'In the next step you sign the power of attorney + assessor order — after that we take care of the assessor, lawyer, repair shop and payout. You pay nothing extra (§ 249 BGB for claims that are not your fault).',
  cta: 'Open claim',
  linkHinweisPrefix:
    'The link is valid for 72 hours. If you have any questions, simply reply to this email or visit ',
  linkHinweisSuffix: '.',
}

const tr: S = {
  subject: (vorname) =>
    vorname
      ? `${vorname}, güvenli giriş bağlantınız burada`
      : 'Claimondo güvenli giriş bağlantınız',
  anrede: (vorname) => (vorname ? `Merhaba ${vorname},` : 'Merhaba,'),
  preview: 'Hasar dosyanız için güvenli giriş bağlantınız',
  intro:
    'Claimondo üzerinden hasarınızı bildirdiğiniz için teşekkür ederiz. Aşağıdaki düğmeye bir tıklamayla doğrudan hasar dosyanıza ulaşırsınız.',
  ablauf:
    'Bir sonraki adımda vekaletname + eksper talimatını imzalarsınız — ardından eksper, avukat, tamirhane ve ödeme işlerini biz hallederiz. Ekstra hiçbir ücret ödemezsiniz (kusurunuz olmayan hasarlarda § 249 BGB).',
  cta: 'Hasar dosyasını aç',
  linkHinweisPrefix:
    'Bağlantı 72 saat geçerlidir. Sorularınız için bu e-postayı yanıtlamanız veya şu adresi ziyaret etmeniz yeterlidir: ',
  linkHinweisSuffix: '.',
}

const ar: S = {
  subject: (vorname) =>
    vorname
      ? `${vorname}، إليك رابط تسجيل الدخول الآمن الخاص بك`
      : 'رابط تسجيل الدخول الآمن الخاص بك لدى Claimondo',
  anrede: (vorname) => (vorname ? `مرحبًا ${vorname}،` : 'مرحبًا،'),
  preview: 'رابط تسجيل الدخول الآمن الخاص بملف الضرر الخاص بك',
  intro:
    'شكرًا لك على الإبلاغ عن الضرر الخاص بك لدى Claimondo. بنقرة واحدة على الزر أدناه تنتقل مباشرة إلى ملف الضرر الخاص بك.',
  ablauf:
    'في الخطوة التالية توقّع التوكيل + تكليف الخبير — وبعد ذلك نتولى نحن أمر الخبير والمحامي والورشة والدفع. لا تدفع أي شيء إضافي (§ 249 BGB في الأضرار التي لا ذنب لك فيها).',
  cta: 'فتح ملف الضرر',
  linkHinweisPrefix:
    'الرابط صالح لمدة 72 ساعة. إذا كانت لديك أي أسئلة، ما عليك سوى الرد على هذا البريد الإلكتروني أو زيارة ',
  linkHinweisSuffix: '.',
}

const ru: S = {
  subject: (vorname) =>
    vorname
      ? `${vorname}, вот ваша безопасная ссылка для входа`
      : 'Ваша безопасная ссылка для входа в Claimondo',
  anrede: (vorname) => (vorname ? `Здравствуйте, ${vorname},` : 'Здравствуйте,'),
  preview: 'Ваша безопасная ссылка для входа в ваше дело о страховом случае',
  intro:
    'благодарим вас за сообщение о страховом случае в Claimondo. Одним нажатием на кнопку ниже вы попадёте прямо в ваше дело.',
  ablauf:
    'На следующем шаге вы подписываете доверенность + поручение эксперту — после этого мы берём на себя эксперта, адвоката, автосервис и выплату. Вы ничего не доплачиваете (§ 249 BGB при ущербе не по вашей вине).',
  cta: 'Открыть дело',
  linkHinweisPrefix:
    'Ссылка действительна 72 часа. Если у вас есть вопросы, просто ответьте на это письмо или посетите ',
  linkHinweisSuffix: '.',
}

const pl: S = {
  subject: (vorname) =>
    vorname
      ? `${vorname}, oto Twój bezpieczny link do logowania`
      : 'Twój bezpieczny link do logowania w Claimondo',
  anrede: (vorname) => (vorname ? `Cześć ${vorname},` : 'Cześć,'),
  preview: 'Twój bezpieczny link do logowania do Twojej sprawy szkodowej',
  intro:
    'dziękujemy za zgłoszenie szkody w Claimondo. Jednym kliknięciem przycisku poniżej przejdziesz bezpośrednio do swojej sprawy szkodowej.',
  ablauf:
    'W następnym kroku podpisujesz pełnomocnictwo + zlecenie dla rzeczoznawcy — następnie my zajmujemy się rzeczoznawcą, prawnikiem, warsztatem i wypłatą. Nie dopłacasz nic (§ 249 BGB przy szkodach niezawinionych).',
  cta: 'Otwórz sprawę szkodową',
  linkHinweisPrefix:
    'Link jest ważny 72 godziny. W razie pytań po prostu odpowiedz na tę wiadomość lub odwiedź ',
  linkHinweisSuffix: '.',
}

const ALL: Record<string, S> = { de, en, tr, ar, ru, pl }

export function getMiniWizardMagicLinkStrings(locale: string): S {
  return ALL[locale] ?? de
}
