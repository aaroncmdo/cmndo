// Audit-Dedup 04.08.: EINE Initial-Passwort-Generierung fuer admin-angelegte
// Konten — ersetzt 2 byte-identische Kopien (admin/sachverstaendige/[id] +
// /anlegen). Alphabet ohne verwechselbare Zeichen (I/l/1, O/0) + Sonderzeichen,
// 16 Zeichen Default — erfuellt die prod-Weak-PW-Policy.
// (team/actions.generatePassword ist eine bewusst andere Variante — 12 alnum;
// bei Anfassung hierher heben.)
import { randomBytes } from 'crypto'

export function randomPassword(length = 16): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%&*+-='
  const bytes = randomBytes(length)
  let pw = ''
  for (let i = 0; i < length; i++) {
    pw += alphabet[bytes[i] % alphabet.length]
  }
  return pw
}
