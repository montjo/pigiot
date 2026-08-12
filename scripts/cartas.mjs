/**
 * Lee content/cartas/*.md y las cifra en public/letters.enc.json
 *
 *   npm run letters
 *
 * Una carta = un fichero de texto. Nada de JSON: escribir una carta con
 * sentimiento dentro de una cadena escapada es la forma más rápida de que
 * este regalo no llegue a existir.
 */
import { readFile, writeFile, readdir, access } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { extname, basename } from 'node:path'

const RAIZ = new URL('../', import.meta.url)
const DIR_CARTAS = new URL('content/cartas/', RAIZ)
const DIR_VOCES = new URL('content/voces/', RAIZ)
const DIR_BOMBO = new URL('content/bombo/', RAIZ)
const DIR_FOTOS = new URL('content/fotos/', RAIZ)
const SALIDA = new URL('public/letters.enc.json', RAIZ)
const ITERACIONES = 600_000

const TIPOS = ['primera', 'normal', 'misterio', 'reto', 'aparte']
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }

const avisos = []
const aviso = (m) => avisos.push(m)

function morir(mensaje) {
  console.error(`\n✗ ${mensaje}\n`)
  process.exit(1)
}

/** Cabecera `clave: valor` entre --- y ---, y el resto es el cuerpo. */
function parsear(texto, fichero) {
  const lineas = texto.replace(/\r\n/g, '\n').split('\n')
  if (lineas[0].trim() !== '---') {
    morir(
      `${fichero}, línea 1: el fichero tiene que empezar con una línea que sea solo ---\n` +
        `  He encontrado: ${JSON.stringify(lineas[0])}`,
    )
  }
  const cierre = lineas.indexOf('---', 1)
  if (cierre === -1) morir(`${fichero}: falta la línea --- que cierra la cabecera.`)

  const cabecera = {}
  for (let i = 1; i < cierre; i++) {
    const linea = lineas[i]
    if (!linea.trim()) continue
    const corte = linea.indexOf(':')
    if (corte === -1) {
      morir(
        `${fichero}, línea ${i + 1}: esperaba algo con la forma «clave: valor».\n` +
          `  He encontrado: ${JSON.stringify(linea)}`,
      )
    }
    const clave = linea.slice(0, corte).trim()
    const valor = linea.slice(corte + 1).trim()
    if (clave === 'foto') (cabecera.foto ??= []).push(valor)
    else cabecera[clave] = valor
  }

  const cuerpo = lineas
    .slice(cierre + 1)
    .join('\n')
    .trim()

  return { cabecera, cuerpo, primeraLineaCuerpo: cierre + 2 }
}

const parrafos = (texto) =>
  texto
    .split(/\n\s*\n/)
    .map((p) => p.trim().replace(/\n/g, ' '))
    .filter(Boolean)

async function leerVoces(lista, fichero) {
  const voces = []
  for (const nombre of lista.split(',').map((s) => s.trim()).filter(Boolean)) {
    const url = new URL(`${nombre}.txt`, DIR_VOCES)
    let texto
    try {
      texto = await readFile(url, 'utf8')
    } catch {
      morir(
        `${fichero}: la voz "${nombre}" no existe.\n` +
          `  Esperaba encontrar content/voces/${nombre}.txt`,
      )
    }
    if (texto.includes('[BORRADOR')) {
      aviso(`la voz "${nombre}" sigue siendo un borrador sin rellenar`)
    }
    voces.push({ de: nombre, cuerpo: parrafos(texto) })
  }
  return voces
}

async function leerBombo(nombre, fichero) {
  const url = new URL(`${nombre}.json`, DIR_BOMBO)
  let crudo
  try {
    crudo = await readFile(url, 'utf8')
  } catch {
    morir(`${fichero}: el bombo "${nombre}" no existe (content/bombo/${nombre}.json)`)
  }
  let planes
  try {
    planes = JSON.parse(crudo)
  } catch (e) {
    morir(`content/bombo/${nombre}.json no es JSON válido: ${e.message}`)
  }
  if (!Array.isArray(planes) || !planes.length) {
    morir(`content/bombo/${nombre}.json tiene que ser una lista con al menos un plan.`)
  }
  planes.forEach((p, i) => {
    if (!p.id || !p.plan || !Array.isArray(p.con)) {
      morir(
        `content/bombo/${nombre}.json, plan ${i + 1}: hacen falta "id", "plan" y "con" (lista).`,
      )
    }
  })
  return planes
}

async function leerFotos(lista, fichero) {
  const fotos = []
  for (const entrada of lista) {
    const [nombre, ...resto] = entrada.split('|')
    const url = new URL(nombre.trim(), DIR_FOTOS)
    let bytes
    try {
      bytes = await readFile(url)
    } catch {
      morir(`${fichero}: la foto "${nombre.trim()}" no está en content/fotos/`)
    }
    const tipo = MIME[extname(nombre.trim()).toLowerCase()]
    if (!tipo) morir(`${fichero}: "${nombre.trim()}" tiene que ser .jpg, .png o .webp`)
    if (bytes.length > 2_000_000) {
      morir(
        `${fichero}: "${nombre.trim()}" pesa ${(bytes.length / 1e6).toFixed(1)} MB.\n` +
          `  Máximo 2 MB: va incrustada en el fichero que descarga el móvil. Redúcela antes.`,
      )
    }
    if (bytes.length > 500_000) {
      aviso(`la foto "${nombre.trim()}" pesa ${Math.round(bytes.length / 1000)} KB, conviene bajarla`)
    }
    fotos.push({
      src: `data:${tipo};base64,${bytes.toString('base64')}`,
      pie: resto.join('|').trim() || undefined,
    })
  }
  return fotos
}

async function leerCartas() {
  let ficheros
  try {
    ficheros = (await readdir(DIR_CARTAS)).filter((f) => f.endsWith('.md')).sort()
  } catch {
    morir('No existe content/cartas/. Crea ahí un fichero .md por carta.')
  }
  if (!ficheros.length) morir('content/cartas/ está vacío. Hace falta al menos una carta.')

  const cartas = []
  const vistos = new Set()

  for (const f of ficheros) {
    const texto = await readFile(new URL(f, DIR_CARTAS), 'utf8')
    const { cabecera, cuerpo } = parsear(texto, f)
    const id = basename(f, '.md')

    if (!/^[a-z0-9-]+$/.test(id)) morir(`${f}: el nombre del fichero solo puede llevar a-z, 0-9 y guiones.`)
    if (vistos.has(id)) morir(`Hay dos cartas con el id "${id}".`)
    vistos.add(id)

    if (!cabecera.titulo) morir(`${f}: falta "titulo" en la cabecera.`)
    const tipo = cabecera.tipo || 'normal'
    if (!TIPOS.includes(tipo)) {
      morir(`${f}: tipo "${tipo}" desconocido.\n  Los válidos son: ${TIPOS.join(', ')}`)
    }
    if (cabecera.desde && !/^\d{4}-\d{2}-\d{2}$/.test(cabecera.desde)) {
      morir(`${f}: "desde" tiene que ser AAAA-MM-DD. He encontrado: ${cabecera.desde}`)
    }

    const carta = { id, tipo, titulo: cabecera.titulo }
    if (cabecera.pista) carta.pista = cabecera.pista
    if (cabecera.escritaEl) carta.escritaEl = cabecera.escritaEl
    if (cabecera.desde) carta.desde = cabecera.desde
    if (cabecera.oculta === 'true') carta.oculta = true
    if (cabecera.prueba) {
      carta.prueba = { texto: cabecera.prueba }
      if (cabecera.pregunta) carta.prueba.pregunta = cabecera.pregunta
      if (cabecera.camara === 'true') carta.prueba.camara = true
      if (cabecera.ubicacion === 'true') carta.prueba.ubicacion = true
    }
    if (cuerpo) carta.cuerpo = parrafos(cuerpo)
    if (cabecera.voces) carta.voces = await leerVoces(cabecera.voces, f)
    if (cabecera.bombo) carta.bombo = await leerBombo(cabecera.bombo, f)
    if (cabecera.foto) carta.fotos = await leerFotos(cabecera.foto, f)

    if (!carta.cuerpo && !carta.voces && !carta.bombo) {
      morir(`${f}: la carta no tiene contenido. Escribe algo debajo de la cabecera.`)
    }
    cartas.push(carta)
  }
  return cartas
}

async function contrasena() {
  if (process.env.LETTERS_PASSWORD) return process.env.LETTERS_PASSWORD
  try {
    const env = await readFile(new URL('.env', RAIZ), 'utf8')
    const m = env.match(/^LETTERS_PASSWORD=(.+)$/m)
    if (m) return m[1].trim()
  } catch {
    // No hay .env: se pregunta.
  }
  const rl = createInterface({ input: stdin, output: stdout })
  const v = await rl.question('Contraseña de las cartas: ')
  rl.close()
  return v
}

/** Se conserva SIEMPRE: si cambia, se pierde el progreso y hay que rehacer las reglas. */
async function progressIdEstable() {
  try {
    const previo = JSON.parse(await readFile(SALIDA, 'utf8'))
    if (previo.progressId) return previo.progressId
  } catch {
    // Primera vez.
  }
  return Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('hex')
}

async function avisarIdsPerdidos(cartas) {
  const url = new URL('content/.ids-anteriores.json', RAIZ)
  const ahora = cartas.map((c) => c.id)
  try {
    await access(url)
    const antes = JSON.parse(await readFile(url, 'utf8'))
    for (const id of antes) {
      if (!ahora.includes(id)) {
        aviso(
          `el id "${id}" ha desaparecido. Si la has renombrado, se pierde el registro de esa apertura`,
        )
      }
    }
  } catch {
    // Primera vez.
  }
  await writeFile(url, JSON.stringify(ahora), 'utf8')
}

// --- Ejecución --------------------------------------------------------------

const cartas = await leerCartas()
await avisarIdsPerdidos(cartas)

const clave = (await contrasena()).trim()
if (clave.length < 6) morir('Usa una contraseña de al menos 6 caracteres.')

let pista
try {
  pista = (await readFile(new URL('content/pista.txt', RAIZ), 'utf8')).trim() || undefined
} catch {
  // Opcional.
}

const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, [
  'deriveKey',
])
const key = await crypto.subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERACIONES, hash: 'SHA-256' },
  base,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt'],
)
const ct = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv },
  key,
  new TextEncoder().encode(JSON.stringify(cartas)),
)

const bundle = {
  v: 2,
  progressId: await progressIdEstable(),
  pista,
  kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERACIONES, salt: Buffer.from(salt).toString('base64') },
  iv: Buffer.from(iv).toString('base64'),
  ct: Buffer.from(new Uint8Array(ct)).toString('base64'),
}

const json = JSON.stringify(bundle)
await writeFile(SALIDA, json, 'utf8')

const mb = json.length / 1e6
if (mb > 8) aviso(`el fichero pesa ${mb.toFixed(1)} MB y lo descarga entero al entrar`)

console.log(`\n✓ ${cartas.length} cartas cifradas (${mb < 1 ? Math.round(json.length / 1000) + ' KB' : mb.toFixed(1) + ' MB'})`)
for (const c of cartas) console.log(`   ${c.tipo.padEnd(9)} ${c.id.padEnd(4)} ${c.titulo}`)
if (avisos.length) {
  console.log('\n  Avisos:')
  for (const a of avisos) console.log(`   · ${a}`)
}
console.log(`\n  id de progreso: ${bundle.progressId}\n`)
