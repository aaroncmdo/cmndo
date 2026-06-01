// i18n strings for the shared EmailLayout footer (src/lib/email/google/templates/layout.tsx).
// de = fallback. getLayoutStrings(locale) returns de for any unknown/undefined locale,
// keeping the ~39 existing callers (which pass no locale) byte-identical to before.
// Brand tokens stay verbatim: "Claimondo", "Claimondo GmbH", URLs are NOT translated here.

type S = {
  autoVersendet: string
  abwicklungUeber: string
  impressum: string
  datenschutz: string
}

const de: S = {
  autoVersendet:
    'Diese E-Mail wurde automatisch versendet. Bei Fragen antworten Sie nicht auf diese E-Mail, sondern kontaktieren Sie uns über das Portal.',
  abwicklungUeber: 'Abwicklung über die Claimondo-Plattform',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
}

const en: S = {
  autoVersendet:
    'This email was sent automatically. If you have any questions, please do not reply to this email — contact us through the portal instead.',
  abwicklungUeber: 'Processed via the Claimondo platform',
  impressum: 'Legal notice',
  datenschutz: 'Privacy policy',
}

const tr: S = {
  autoVersendet:
    'Bu e-posta otomatik olarak gönderildi. Sorularınız için lütfen bu e-postayı yanıtlamayın, bunun yerine portal üzerinden bizimle iletişime geçin.',
  abwicklungUeber: 'Claimondo platformu üzerinden işlenir',
  impressum: 'Künye',
  datenschutz: 'Gizlilik politikası',
}

const ar: S = {
  autoVersendet:
    'تم إرسال هذا البريد الإلكتروني تلقائيًا. إذا كانت لديك أي أسئلة، فيرجى عدم الرد على هذا البريد الإلكتروني، بل تواصل معنا عبر البوابة.',
  abwicklungUeber: 'تتم المعالجة عبر منصة Claimondo',
  impressum: 'بيانات الناشر',
  datenschutz: 'سياسة الخصوصية',
}

const ru: S = {
  autoVersendet:
    'Это письмо отправлено автоматически. Если у вас возникли вопросы, пожалуйста, не отвечайте на это письмо, а свяжитесь с нами через портал.',
  abwicklungUeber: 'Обработка через платформу Claimondo',
  impressum: 'Выходные данные',
  datenschutz: 'Политика конфиденциальности',
}

const pl: S = {
  autoVersendet:
    'Ten e-mail został wysłany automatycznie. W razie pytań prosimy nie odpowiadać na tę wiadomość, lecz skontaktować się z nami przez portal.',
  abwicklungUeber: 'Obsługa za pośrednictwem platformy Claimondo',
  impressum: 'Nota prawna',
  datenschutz: 'Polityka prywatności',
}

const ALL: Record<string, S> = { de, en, tr, ar, ru, pl }

export function getLayoutStrings(locale: string): S {
  return ALL[locale] ?? de
}

export type { S as LayoutStrings }
