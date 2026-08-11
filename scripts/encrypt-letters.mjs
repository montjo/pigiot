/**
 * Cifra content/letters.json -> public/letters.enc.json
 *
 *   npm run letters
 *
 * La contraseña se pide por consola, o se pasa en la variable LETTERS_PASSWORD.
 * Sin esa contraseña las cartas NO se pueden recuperar: guárdala en tu gestor
 * de contraseñas antes de seguir.
 */
import { readFile, writeFile, access } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const SRC = new URL('../content/letters.json', import.meta.url)
const OUT = new URL('../public/letters.enc.json', import.meta.url)
const ITERATIONS = 310_000

const b64 = (bytes) => Buffer.from(bytes).toString('base64')

async function askPassword() {
  if (process.env.LETTERS_PASSWORD) return process.env.LETTERS_PASSWORD
  const rl = createInterface({ input: stdin, output: stdout })
  const value = await rl.question('Contraseña de las cartas (la que le darás a él): ')
  rl.close()
  return value
}

async function readLetters() {
  try {
    await access(SRC)
  } catch {
    console.error(
      '\n✗ No existe content/letters.json.\n' +
        '  Copia el ejemplo y escribe ahí tus cartas:\n' +
        '    cp content/letters.example.json content/letters.json\n',
    )
    process.exit(1)
  }
  const letters = JSON.parse(await readFile(SRC, 'utf8'))
  if (!Array.isArray(letters) || letters.length === 0) {
    console.error('✗ content/letters.json debe ser un array con al menos una carta.')
    process.exit(1)
  }
  const ids = new Set()
  for (const letter of letters) {
    if (!letter.id || !letter.title || !letter.body) {
      console.error(`✗ Carta incompleta (hacen falta id, title y body): ${JSON.stringify(letter)}`)
      process.exit(1)
    }
    if (ids.has(letter.id)) {
      console.error(`✗ Hay dos cartas con el mismo id: "${letter.id}"`)
      process.exit(1)
    }
    ids.add(letter.id)
  }
  return letters
}

/**
 * El id del documento de Firestore se genera una sola vez y se reutiliza
 * siempre: si cambiara en cada build, se perdería el progreso anterior.
 */
async function stableProgressId() {
  try {
    const previous = JSON.parse(await readFile(OUT, 'utf8'))
    if (previous.progressId) return previous.progressId
  } catch {
    // Primera vez: no hay fichero previo.
  }
  return Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('hex')
}

const letters = await readLetters()
const password = (await askPassword()).trim()
if (password.length < 6) {
  console.error('✗ Usa una contraseña de al menos 6 caracteres.')
  process.exit(1)
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))

const baseKey = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(password),
  'PBKDF2',
  false,
  ['deriveKey'],
)
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
)
const ciphertext = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  new TextEncoder().encode(JSON.stringify(letters)),
)

const bundle = {
  v: 1,
  progressId: await stableProgressId(),
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
  iv: b64(iv),
  ct: b64(new Uint8Array(ciphertext)),
}

await writeFile(OUT, JSON.stringify(bundle), 'utf8')

console.log(`\n✓ ${letters.length} cartas cifradas en public/letters.enc.json`)
console.log(`  id del documento de progreso: ${bundle.progressId}`)
console.log('  (ese id va en firestore.rules — ver README)\n')
