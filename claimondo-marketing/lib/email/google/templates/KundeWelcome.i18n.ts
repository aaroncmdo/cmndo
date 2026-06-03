// Per-locale strings for KundeWelcome. de = source (byte-identical), de-fallback.
// Recipient is a KUNDE (accident victim, possibly non-German). Keep VERBATIM
// (never translate): Claimondo, LexDrive, WhatsApp, URLs, EUR, email/password
// values, brand names. Translate German prose + InfoTable labels only.
type S = {
  // ── Layout-/meta-strings ──
  subject: (vorname: string) => string
  preview: (fallNummer: string) => string
  heading: (vorname: string) => string
  // ── Intro ──
  p1a: string
  p1strong: string
  p1b: string
  p2: string
  // ── Auftragszusammenfassung ──
  headingSummary: string
  labelFallnummer: string
  labelUnfalldatum: string
  labelAdresse: string
  labelFahrzeug: string
  labelVersicherung: string
  labelGutachter: string
  // ── Termin (BUG-72) ──
  terminTitle: string
  labelDatum: string
  labelUhrzeit: string
  uhrzeitValue: (uhrzeit: string) => string
  labelSachverstaendiger: string
  terminHint: string
  // ── loginInfo branch (AAR-127) ──
  loginIntro: string
  loginButton: string
  loginLinkHint: string
  zugangsdatenTitle: string
  zugangsdatenHint: string
  labelPortal: string
  labelEmail: string
  labelPasswort: string
  passwortHint: string
  // ── accountExists branch ──
  accountExistsIntro: string
  accountExistsButton: string
  // ── else branch (no account yet) ──
  noAccountIntro: string
  noAccountButtonCreate: string
  noAccountButtonPortal: string
  // ── Closing ──
  closing: string
  // ── P2: Hero / Fall-Card / Trust ──
  heroSubline: string
  fallUeberblick: string
  statusLabel: string
  beraterLabel: string
  trustItems: string[]
}

const de: S = {
  subject: (vorname) => `Willkommen bei Claimondo, ${vorname}!`,
  preview: (fallNummer) => `Willkommen bei Claimondo — Ihr Fall ${fallNummer}`,
  heading: (vorname) => `Willkommen bei Claimondo, ${vorname}!`,
  p1a: 'Vielen Dank für Ihr Vertrauen. Wir kümmern uns um die komplette Schadensabwicklung nach Ihrem Unfall — ',
  p1strong: 'für Sie völlig kostenfrei',
  p1b: '.',
  p2: 'Was passiert jetzt? Ein unabhängiger Sachverständiger begutachtet Ihr Fahrzeug, danach übernimmt unsere Partnerkanzlei die Regulierung mit der gegnerischen Versicherung.',
  headingSummary: 'Ihre Auftragszusammenfassung',
  labelFallnummer: 'Fallnummer',
  labelUnfalldatum: 'Unfalldatum',
  labelAdresse: 'Adresse',
  labelFahrzeug: 'Fahrzeug',
  labelVersicherung: 'Versicherung',
  labelGutachter: 'Gutachter',
  terminTitle: 'Ihr Besichtigungstermin',
  labelDatum: 'Datum',
  labelUhrzeit: 'Uhrzeit',
  uhrzeitValue: (uhrzeit) => `${uhrzeit} Uhr`,
  labelSachverstaendiger: 'Sachverständiger',
  terminHint: 'Bitte stellen Sie sicher, dass das Fahrzeug zum Termin zugänglich ist. Sie werden kurz vorher per WhatsApp erinnert.',
  loginIntro: 'Ihr persönliches Portal-Konto ist eingerichtet. Sie können sich jetzt einloggen.',
  loginButton: 'Jetzt einloggen',
  loginLinkHint: 'Dieser Link loggt Sie automatisch ein. Er ist 1 Stunde gültig.',
  zugangsdatenTitle: 'Ihre Zugangsdaten',
  zugangsdatenHint: 'Falls Sie den Login-Button nicht nutzen, können Sie sich auch klassisch anmelden:',
  labelPortal: 'Portal:',
  labelEmail: 'E-Mail:',
  labelPasswort: 'Passwort:',
  passwortHint: 'Wir empfehlen Ihnen, das Passwort nach dem ersten Login in den Einstellungen zu ändern.',
  accountExistsIntro: 'In Ihrem Kunden-Portal können Sie den Fortschritt Ihres Falls verfolgen, Dokumente einsehen und direkt mit uns kommunizieren.',
  accountExistsButton: 'Zum Kunden-Portal',
  noAccountIntro: 'Erstellen Sie jetzt Ihr persönliches Portal-Konto, um den Fortschritt Ihres Falls zu verfolgen und Dokumente einzusehen.',
  noAccountButtonCreate: 'Konto erstellen',
  noAccountButtonPortal: 'Zum Portal',
  closing: 'Bei Fragen erreichen Sie uns jederzeit über den Chat im Portal oder per WhatsApp.',
  heroSubline: 'Ihr Schaden liegt jetzt bei uns. Wir regeln alles — Gutachten, Anwalt, Auszahlung. Für Sie 0 €.',
  fallUeberblick: 'Ihr Fall im Überblick',
  statusLabel: 'In Bearbeitung',
  beraterLabel: 'Ihr persönlicher Ansprechpartner',
  trustItems: ['0 € bei Fremdverschulden', '§249 BGB', 'Unabhängiges Gutachten'],
}

const en: S = {
  subject: (vorname) => `Welcome to Claimondo, ${vorname}!`,
  preview: (fallNummer) => `Welcome to Claimondo — your case ${fallNummer}`,
  heading: (vorname) => `Welcome to Claimondo, ${vorname}!`,
  p1a: 'Thank you for your trust. We take care of the complete claim settlement after your accident — ',
  p1strong: 'completely free of charge for you',
  p1b: '.',
  p2: 'What happens now? An independent assessor inspects your vehicle, then our partner law firm handles the claim settlement with the other party’s insurer.',
  headingSummary: 'Your order summary',
  labelFallnummer: 'Case number',
  labelUnfalldatum: 'Accident date',
  labelAdresse: 'Address',
  labelFahrzeug: 'Vehicle',
  labelVersicherung: 'Insurance',
  labelGutachter: 'Assessor',
  terminTitle: 'Your inspection appointment',
  labelDatum: 'Date',
  labelUhrzeit: 'Time',
  uhrzeitValue: (uhrzeit) => `${uhrzeit}`,
  labelSachverstaendiger: 'Assessor',
  terminHint: 'Please make sure the vehicle is accessible for the appointment. You will be reminded shortly beforehand via WhatsApp.',
  loginIntro: 'Your personal portal account is set up. You can log in now.',
  loginButton: 'Log in now',
  loginLinkHint: 'This link logs you in automatically. It is valid for 1 hour.',
  zugangsdatenTitle: 'Your login details',
  zugangsdatenHint: 'If you do not use the login button, you can also sign in the classic way:',
  labelPortal: 'Portal:',
  labelEmail: 'E-mail:',
  labelPasswort: 'Password:',
  passwortHint: 'We recommend that you change the password in the settings after your first login.',
  accountExistsIntro: 'In your customer portal you can track the progress of your case, view documents and communicate directly with us.',
  accountExistsButton: 'To the customer portal',
  noAccountIntro: 'Create your personal portal account now to track the progress of your case and view documents.',
  noAccountButtonCreate: 'Create account',
  noAccountButtonPortal: 'To the portal',
  closing: 'If you have any questions, you can reach us at any time via the chat in the portal or via WhatsApp.',
  heroSubline: 'Your claim is now in our hands. We handle everything — assessment, lawyer, payout. For you 0 €.',
  fallUeberblick: 'Your case at a glance',
  statusLabel: 'In progress',
  beraterLabel: 'Your personal contact',
  trustItems: ['0 € if not at fault', '§249 BGB', 'Independent assessment'],
}

const tr: S = {
  subject: (vorname) => `Claimondo’ya hoş geldiniz, ${vorname}!`,
  preview: (fallNummer) => `Claimondo’ya hoş geldiniz — dosyanız ${fallNummer}`,
  heading: (vorname) => `Claimondo’ya hoş geldiniz, ${vorname}!`,
  p1a: 'Güveniniz için teşekkür ederiz. Kazanızın ardından hasarın eksiksiz şekilde düzenlenmesini biz üstleniyoruz — ',
  p1strong: 'sizin için tamamen ücretsiz',
  p1b: '.',
  p2: 'Şimdi ne olacak? Bağımsız bir bilirkişi aracınızı inceler, ardından ortak hukuk büromuz karşı tarafın sigortası ile hasar tazminatı sürecini yürütür.',
  headingSummary: 'Sipariş özetiniz',
  labelFallnummer: 'Dosya numarası',
  labelUnfalldatum: 'Kaza tarihi',
  labelAdresse: 'Adres',
  labelFahrzeug: 'Araç',
  labelVersicherung: 'Sigorta',
  labelGutachter: 'Bilirkişi',
  terminTitle: 'İnceleme randevunuz',
  labelDatum: 'Tarih',
  labelUhrzeit: 'Saat',
  uhrzeitValue: (uhrzeit) => `${uhrzeit}`,
  labelSachverstaendiger: 'Bilirkişi',
  terminHint: 'Lütfen aracın randevu için erişilebilir olduğundan emin olun. Randevudan kısa bir süre önce WhatsApp üzerinden hatırlatılacaksınız.',
  loginIntro: 'Kişisel portal hesabınız oluşturuldu. Şimdi giriş yapabilirsiniz.',
  loginButton: 'Şimdi giriş yap',
  loginLinkHint: 'Bu bağlantı sizi otomatik olarak giriş yaptırır. 1 saat geçerlidir.',
  zugangsdatenTitle: 'Giriş bilgileriniz',
  zugangsdatenHint: 'Giriş düğmesini kullanmazsanız, klasik yolla da oturum açabilirsiniz:',
  labelPortal: 'Portal:',
  labelEmail: 'E-posta:',
  labelPasswort: 'Şifre:',
  passwortHint: 'İlk girişinizden sonra şifreyi ayarlardan değiştirmenizi öneririz.',
  accountExistsIntro: 'Müşteri portalınızda dosyanızın ilerlemesini takip edebilir, belgeleri görüntüleyebilir ve bizimle doğrudan iletişim kurabilirsiniz.',
  accountExistsButton: 'Müşteri portalına git',
  noAccountIntro: 'Dosyanızın ilerlemesini takip etmek ve belgeleri görüntülemek için şimdi kişisel portal hesabınızı oluşturun.',
  noAccountButtonCreate: 'Hesap oluştur',
  noAccountButtonPortal: 'Portala git',
  closing: 'Sorularınız için portaldaki sohbet üzerinden veya WhatsApp üzerinden istediğiniz zaman bize ulaşabilirsiniz.',
  heroSubline: 'Hasarınız artık bizde. Her şeyi biz hallederiz — ekspertiz, avukat, ödeme. Sizin için 0 €.',
  fallUeberblick: 'Dosyanıza genel bakış',
  statusLabel: 'İşleniyor',
  beraterLabel: 'Kişisel iletişim kişiniz',
  trustItems: ['Kusur karşı taraftaysa 0 €', '§249 BGB', 'Bağımsız ekspertiz'],
}

const ar: S = {
  subject: (vorname) => `مرحبًا بك في Claimondo، ${vorname}!`,
  preview: (fallNummer) => `مرحبًا بك في Claimondo — ملفك ${fallNummer}`,
  heading: (vorname) => `مرحبًا بك في Claimondo، ${vorname}!`,
  p1a: 'شكرًا لثقتك. نحن نتولى تسوية المطالبة بالكامل بعد حادثك — ',
  p1strong: 'مجانًا تمامًا بالنسبة لك',
  p1b: '.',
  p2: 'ماذا يحدث الآن؟ يقوم خبير مستقل بمعاينة سيارتك، ثم تتولى شركة المحاماة الشريكة تسوية المطالبة مع شركة تأمين الطرف الآخر.',
  headingSummary: 'ملخص طلبك',
  labelFallnummer: 'رقم الملف',
  labelUnfalldatum: 'تاريخ الحادث',
  labelAdresse: 'العنوان',
  labelFahrzeug: 'المركبة',
  labelVersicherung: 'التأمين',
  labelGutachter: 'الخبير',
  terminTitle: 'موعد المعاينة الخاص بك',
  labelDatum: 'التاريخ',
  labelUhrzeit: 'الوقت',
  uhrzeitValue: (uhrzeit) => `${uhrzeit}`,
  labelSachverstaendiger: 'الخبير',
  terminHint: 'يرجى التأكد من إمكانية الوصول إلى المركبة في الموعد. سيتم تذكيرك قبيل الموعد عبر WhatsApp.',
  loginIntro: 'تم إعداد حساب البوابة الشخصي الخاص بك. يمكنك تسجيل الدخول الآن.',
  loginButton: 'سجّل الدخول الآن',
  loginLinkHint: 'يقوم هذا الرابط بتسجيل دخولك تلقائيًا. وهو صالح لمدة ساعة واحدة.',
  zugangsdatenTitle: 'بيانات تسجيل الدخول الخاصة بك',
  zugangsdatenHint: 'إذا لم تستخدم زر تسجيل الدخول، يمكنك أيضًا تسجيل الدخول بالطريقة التقليدية:',
  labelPortal: 'البوابة:',
  labelEmail: 'البريد الإلكتروني:',
  labelPasswort: 'كلمة المرور:',
  passwortHint: 'نوصيك بتغيير كلمة المرور من الإعدادات بعد أول تسجيل دخول.',
  accountExistsIntro: 'في بوابة العملاء يمكنك متابعة تقدّم ملفك والاطلاع على المستندات والتواصل معنا مباشرة.',
  accountExistsButton: 'إلى بوابة العملاء',
  noAccountIntro: 'أنشئ الآن حساب البوابة الشخصي الخاص بك لمتابعة تقدّم ملفك والاطلاع على المستندات.',
  noAccountButtonCreate: 'إنشاء حساب',
  noAccountButtonPortal: 'إلى البوابة',
  closing: 'إذا كانت لديك أي أسئلة، يمكنك التواصل معنا في أي وقت عبر المحادثة في البوابة أو عبر WhatsApp.',
  heroSubline: 'مطالبتك الآن بين أيدينا. نتولى كل شيء — التقييم، المحامي، الدفع. بالنسبة لك 0 €.',
  fallUeberblick: 'نظرة عامة على ملفك',
  statusLabel: 'قيد المعالجة',
  beraterLabel: 'جهة الاتصال الشخصية الخاصة بك',
  trustItems: ['0 € إذا لم تكن المتسبب', '§249 BGB', 'تقييم مستقل'],
}

const ru: S = {
  subject: (vorname) => `Добро пожаловать в Claimondo, ${vorname}!`,
  preview: (fallNummer) => `Добро пожаловать в Claimondo — ваше дело ${fallNummer}`,
  heading: (vorname) => `Добро пожаловать в Claimondo, ${vorname}!`,
  p1a: 'Благодарим за ваше доверие. Мы берём на себя полное урегулирование ущерба после вашего ДТП — ',
  p1strong: 'для вас совершенно бесплатно',
  p1b: '.',
  p2: 'Что происходит дальше? Независимый эксперт осматривает ваш автомобиль, затем наша партнёрская юридическая фирма занимается урегулированием ущерба со страховой компанией виновника.',
  headingSummary: 'Сводка по вашему заказу',
  labelFallnummer: 'Номер дела',
  labelUnfalldatum: 'Дата ДТП',
  labelAdresse: 'Адрес',
  labelFahrzeug: 'Автомобиль',
  labelVersicherung: 'Страхование',
  labelGutachter: 'Эксперт',
  terminTitle: 'Ваша запись на осмотр',
  labelDatum: 'Дата',
  labelUhrzeit: 'Время',
  uhrzeitValue: (uhrzeit) => `${uhrzeit}`,
  labelSachverstaendiger: 'Эксперт',
  terminHint: 'Пожалуйста, убедитесь, что автомобиль доступен к моменту осмотра. За некоторое время до встречи вы получите напоминание через WhatsApp.',
  loginIntro: 'Ваш личный аккаунт на портале создан. Теперь вы можете войти.',
  loginButton: 'Войти сейчас',
  loginLinkHint: 'Эта ссылка автоматически выполняет вход. Она действительна 1 час.',
  zugangsdatenTitle: 'Ваши данные для входа',
  zugangsdatenHint: 'Если вы не используете кнопку входа, вы также можете войти обычным способом:',
  labelPortal: 'Портал:',
  labelEmail: 'Эл. почта:',
  labelPasswort: 'Пароль:',
  passwortHint: 'Рекомендуем изменить пароль в настройках после первого входа.',
  accountExistsIntro: 'В клиентском портале вы можете отслеживать ход вашего дела, просматривать документы и общаться с нами напрямую.',
  accountExistsButton: 'В клиентский портал',
  noAccountIntro: 'Создайте сейчас свой личный аккаунт на портале, чтобы отслеживать ход вашего дела и просматривать документы.',
  noAccountButtonCreate: 'Создать аккаунт',
  noAccountButtonPortal: 'На портал',
  closing: 'Если у вас возникнут вопросы, вы в любое время можете связаться с нами через чат в портале или через WhatsApp.',
  heroSubline: 'Ваш ущерб теперь у нас. Мы берём на себя всё — экспертиза, юрист, выплата. Для вас 0 €.',
  fallUeberblick: 'Обзор вашего дела',
  statusLabel: 'В обработке',
  beraterLabel: 'Ваше личное контактное лицо',
  trustItems: ['0 € при вине другой стороны', '§249 BGB', 'Независимая экспертиза'],
}

const pl: S = {
  subject: (vorname) => `Witamy w Claimondo, ${vorname}!`,
  preview: (fallNummer) => `Witamy w Claimondo — Twoja sprawa ${fallNummer}`,
  heading: (vorname) => `Witamy w Claimondo, ${vorname}!`,
  p1a: 'Dziękujemy za zaufanie. Zajmujemy się kompleksową likwidacją szkody po Twoim wypadku — ',
  p1strong: 'dla Ciebie całkowicie bezpłatnie',
  p1b: '.',
  p2: 'Co dzieje się teraz? Niezależny rzeczoznawca ogląda Twój pojazd, a następnie nasza kancelaria partnerska prowadzi likwidację szkody z ubezpieczycielem strony przeciwnej.',
  headingSummary: 'Podsumowanie Twojego zlecenia',
  labelFallnummer: 'Numer sprawy',
  labelUnfalldatum: 'Data wypadku',
  labelAdresse: 'Adres',
  labelFahrzeug: 'Pojazd',
  labelVersicherung: 'Ubezpieczenie',
  labelGutachter: 'Rzeczoznawca',
  terminTitle: 'Twój termin oględzin',
  labelDatum: 'Data',
  labelUhrzeit: 'Godzina',
  uhrzeitValue: (uhrzeit) => `${uhrzeit}`,
  labelSachverstaendiger: 'Rzeczoznawca',
  terminHint: 'Prosimy upewnić się, że pojazd będzie dostępny w terminie oględzin. Krótko przedtem otrzymasz przypomnienie przez WhatsApp.',
  loginIntro: 'Twoje osobiste konto w portalu zostało utworzone. Możesz się teraz zalogować.',
  loginButton: 'Zaloguj się teraz',
  loginLinkHint: 'Ten link loguje Cię automatycznie. Jest ważny przez 1 godzinę.',
  zugangsdatenTitle: 'Twoje dane logowania',
  zugangsdatenHint: 'Jeśli nie korzystasz z przycisku logowania, możesz też zalogować się w klasyczny sposób:',
  labelPortal: 'Portal:',
  labelEmail: 'E-mail:',
  labelPasswort: 'Hasło:',
  passwortHint: 'Zalecamy zmianę hasła w ustawieniach po pierwszym logowaniu.',
  accountExistsIntro: 'W portalu klienta możesz śledzić postęp swojej sprawy, przeglądać dokumenty i komunikować się z nami bezpośrednio.',
  accountExistsButton: 'Do portalu klienta',
  noAccountIntro: 'Utwórz teraz swoje osobiste konto w portalu, aby śledzić postęp swojej sprawy i przeglądać dokumenty.',
  noAccountButtonCreate: 'Utwórz konto',
  noAccountButtonPortal: 'Do portalu',
  closing: 'W razie pytań możesz skontaktować się z nami w dowolnym momencie przez czat w portalu lub przez WhatsApp.',
  heroSubline: 'Twoja szkoda jest teraz w naszych rękach. Zajmujemy się wszystkim — ekspertyza, prawnik, wypłata. Dla Ciebie 0 €.',
  fallUeberblick: 'Przegląd Twojej sprawy',
  statusLabel: 'W trakcie',
  beraterLabel: 'Twoja osobista osoba kontaktowa',
  trustItems: ['0 € przy winie drugiej strony', '§249 BGB', 'Niezależna ekspertyza'],
}

const ALL: Record<string, S> = { de, en, tr, ar, ru, pl }

export function getKundeWelcomeStrings(locale: string): S {
  return ALL[locale] ?? de
}
