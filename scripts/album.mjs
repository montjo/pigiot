/**
 * Sube al álbum una carpeta entera de fotos, sin pasar por la web.
 *
 *   npm run album                      -> sube lo que haya en content/album
 *   npm run album -- ~/Desktop/fotos   -> sube esa carpeta
 *   npm run album -- --prueba          -> lo hace todo menos subir
 *
 * Las fotos NO van al repo: se cifran con la misma clave que las cartas y se
 * guardan en Firestore, igual que si las hubiera subido él desde la web. La
 * carpeta es solo el sitio desde donde se leen.
 *
 * Se puede parar y volver a lanzar: lleva la cuenta de lo ya subido en
 * `.subidas.json` dentro de la carpeta, así que nunca sube dos veces la misma.
 *
 * Las subcarpetas dicen de quién es cada foto:
 *
 *   content/album/pacuot/IMG-0001.jpg   -> aparece como «de pacuot»
 *   content/album/IMG-0002.jpg          -> sin firmar
 *
 * Y un `pies.txt` opcional en la carpeta les pone texto:
 *
 *   IMG-0001.jpg | La noche del karaoke
 */
import { execFile } from 'node:child_process'
import { readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { argv, exit, stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { promisify } from 'node:util'

const correr = promisify(execFile)
const RAIZ = new URL('..', import.meta.url)
const PAQUETE = new URL('public/letters.enc.json', RAIZ)

/** Los mismos topes que en el navegador: las reglas cortan en 800/150 KB. */
const LADO_GRANDE = 1600
const LADO_MINI = 400
const TOPE_GRANDE = 760_000
const TOPE_MINI = 130_000
/** Cuántas a la vez. Más no acelera: manda la subida, no el ordenador. */
const A_LA_VEZ = 4

const EXTENSIONES = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.tif', '.tiff'])

const morir = (msg) => {
  console.error(`\n✗ ${msg}\n`)
  exit(1)
}
const aviso = (msg) => console.warn(`  ! ${msg}`)

// --- Firestore por REST -----------------------------------------------------
// Sin SDK: son dos POST con la clave pública, y así el script no se queda
// colgado esperando a que Firestore cierre sus conexiones.

function leerEnv(texto) {
  const env = {}
  for (const linea of texto.split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linea)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

async function crear(cfg, coleccion, campos, id) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${coleccion}`,
  )
  url.searchParams.set('key', cfg.apiKey)
  if (id) url.searchParams.set('documentId', id)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fields: campos }),
  })
  if (!res.ok) {
    const cuerpo = await res.text()
    throw new Error(`Firestore ha dicho ${res.status}: ${cuerpo.slice(0, 300)}`)
  }
  const doc = await res.json()
  return doc.name.split('/').pop()
}

/**
 * Los ids que hay de verdad en el álbum. Sirve para que el registro de subidas
 * no mienta: si una foto se borra desde la consola de Firebase, aquí se nota y
 * se vuelve a subir en la siguiente pasada.
 *
 * La máscara es importante: sin ella, listar la colección bajaría todas las
 * miniaturas cifradas, y eso son megas de tráfico para no mirarlas.
 */
async function idsEnAlbum(cfg) {
  const ids = new Set()
  let pagina
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/photos`,
    )
    url.searchParams.set('key', cfg.apiKey)
    url.searchParams.set('pageSize', '300')
    url.searchParams.set('mask.fieldPaths', 'at')
    if (pagina) url.searchParams.set('pageToken', pagina)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Firestore ha dicho ${res.status} al listar el álbum`)
    const datos = await res.json()
    for (const doc of datos.documents ?? []) ids.add(doc.name.split('/').pop())
    pagina = datos.nextPageToken
  } while (pagina)
  return ids
}

// --- Cifrado ----------------------------------------------------------------
// Mismo formato exacto que src/lib/crypto.ts, o el navegador no lo sabría leer.

const b64 = (bytes) => Buffer.from(bytes).toString('base64')

async function cifrarBytes(clave, datos) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, datos)
  return { iv: b64(iv), ct: new Uint8Array(ct) }
}

async function cifrarTexto(clave, texto) {
  const { iv, ct } = await cifrarBytes(clave, new TextEncoder().encode(texto))
  return `${iv}.${b64(ct)}`
}

async function derivarClave(password, kdf) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: Buffer.from(kdf.salt, 'base64'),
      iterations: kdf.iterations,
      hash: kdf.hash,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** La prueba de que la contraseña es la buena: descifra las cartas o no. */
async function abreLasCartas(clave, paquete) {
  try {
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: Buffer.from(paquete.iv, 'base64') },
      clave,
      Buffer.from(paquete.ct, 'base64'),
    )
    return true
  } catch {
    return false
  }
}

// --- Fotos ------------------------------------------------------------------

async function medir(ruta) {
  const { stdout: salida } = await correr('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'creation', ruta])
  const num = (campo) => {
    const m = new RegExp(`${campo}: (\\d+)`).exec(salida)
    return m ? Number(m[1]) : 0
  }
  const creacion = /creation: (\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(salida)
  return {
    w: num('pixelWidth'),
    h: num('pixelHeight'),
    creacion: creacion ? new Date(`${creacion[1]}-${creacion[2]}-${creacion[3]}T${creacion.slice(4).join(':')}`) : null,
  }
}

/**
 * Reduce y recomprime con sips (que además abre los HEIC del iPhone) hasta que
 * el JPEG entra en el hueco que dejan las reglas. Baja primero la calidad, que
 * casi no se nota, y solo después el tamaño.
 */
async function comprimir(ruta, lado, tope, sufijo) {
  const destino = join(tmpdir(), `pigiot-${sufijo}-${process.pid}-${Math.random().toString(36).slice(2)}.jpg`)
  for (const [calidad, escala] of [
    [70, 1],
    [55, 1],
    [42, 1],
    [55, 0.75],
    [42, 0.6],
    [30, 0.5],
  ]) {
    await correr('sips', [
      '-Z',
      String(Math.round(lado * escala)),
      '-s',
      'format',
      'jpeg',
      '-s',
      'formatOptions',
      String(calidad),
      ruta,
      '--out',
      destino,
    ])
    const { size } = await stat(destino)
    if (size <= tope) {
      const { w, h } = await medir(destino)
      return { bytes: new Uint8Array(await readFile(destino)), w, h, borrar: () => rm(destino, { force: true }) }
    }
  }
  await rm(destino, { force: true })
  throw new Error('sigue pesando demasiado después de reducirla')
}

/** La fecha de la foto: la del EXIF, la del nombre de WhatsApp, o la del fichero. */
function fechaDe(nombre, creacion, mtime) {
  const wa = /(\d{4})(\d{2})(\d{2})/.exec(nombre)
  if (creacion && !Number.isNaN(creacion.getTime())) return creacion.toISOString()
  if (wa) {
    const d = new Date(`${wa[1]}-${wa[2]}-${wa[3]}T12:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return mtime.toISOString()
}

async function listar(carpeta) {
  const fotos = []
  for (const entrada of await readdir(carpeta, { withFileTypes: true })) {
    if (entrada.name.startsWith('.')) continue
    const ruta = join(carpeta, entrada.name)
    if (entrada.isDirectory()) {
      for (const hija of await readdir(ruta, { withFileTypes: true })) {
        if (hija.name.startsWith('.') || !hija.isFile()) continue
        if (EXTENSIONES.has(extname(hija.name).toLowerCase())) {
          fotos.push({ ruta: join(ruta, hija.name), de: entrada.name })
        }
      }
    } else if (EXTENSIONES.has(extname(entrada.name).toLowerCase())) {
      fotos.push({ ruta, de: null })
    } else if (entrada.name !== 'pies.txt') {
      aviso(`${entrada.name} no es una foto, la salto`)
    }
  }
  return fotos.sort((a, b) => (a.ruta < b.ruta ? -1 : 1))
}

async function leerPies(carpeta) {
  const pies = new Map()
  try {
    const texto = await readFile(join(carpeta, 'pies.txt'), 'utf8')
    for (const linea of texto.split('\n')) {
      const [nombre, ...resto] = linea.split('|')
      if (!nombre?.trim() || !resto.length) continue
      pies.set(nombre.trim(), resto.join('|').trim())
    }
  } catch {
    // No hay pies.txt, que es lo normal.
  }
  return pies
}

// --- El script --------------------------------------------------------------

const args = argv.slice(2)
const prueba = args.includes('--prueba')
const carpeta = resolve(args.find((a) => !a.startsWith('--')) ?? new URL('content/album', RAIZ).pathname)

let paquete
try {
  paquete = JSON.parse(await readFile(PAQUETE, 'utf8'))
} catch {
  morir('No encuentro public/letters.enc.json. Lanza antes `npm run letters`.')
}

let cfg
try {
  const env = leerEnv(await readFile(new URL('.env', RAIZ), 'utf8'))
  cfg = { apiKey: env.VITE_FIREBASE_API_KEY, projectId: env.VITE_FIREBASE_PROJECT_ID }
  if (!cfg.apiKey || !cfg.projectId) throw new Error('faltan valores')
} catch {
  morir('No encuentro los datos de Firebase en .env (VITE_FIREBASE_API_KEY y VITE_FIREBASE_PROJECT_ID).')
}

let fotos
try {
  fotos = await listar(carpeta)
} catch {
  morir(`No encuentro la carpeta ${carpeta}.\n  Créala y mete las fotos ahí, o pásame otra: npm run album -- ~/ruta`)
}
if (!fotos.length) morir(`No hay ninguna foto en ${carpeta}.`)

const contrasena = (process.env.LETTERS_PASSWORD ?? (await preguntar())).trim()
async function preguntar() {
  const rl = createInterface({ input: stdin, output: stdout })
  const v = await rl.question('Contraseña de las cartas (la suya): ')
  rl.close()
  return v
}

const clave = await derivarClave(contrasena, paquete.kdf)
if (!(await abreLasCartas(clave, paquete))) {
  morir(
    'Esa no es la contraseña de las cartas.\n' +
      '  Si la subes con otra clave, las fotos quedan ilegibles para siempre.',
  )
}

const LIBRO = join(carpeta, '.subidas.json')
let subidas = {}
try {
  subidas = JSON.parse(await readFile(LIBRO, 'utf8'))
} catch {
  // Primera vez.
}

// El álbum manda sobre el registro: lo que ya no está en Firebase se vuelve a
// subir, aunque aquí figure como subido. Si no se puede preguntar, el registro
// se deja tal cual: mejor no subir dos veces que subir por duplicado.
if (Object.keys(subidas).length) {
  try {
    const vivas = await idsEnAlbum(cfg)
    const perdidas = Object.entries(subidas).filter(([, id]) => !vivas.has(id))
    for (const [marca] of perdidas) delete subidas[marca]
    if (perdidas.length) {
      await writeFile(LIBRO, JSON.stringify(subidas, null, 2), 'utf8')
      console.log(
        `\n  ${perdidas.length} ${perdidas.length === 1 ? 'foto ya no está' : 'fotos ya no están'} en Firebase` +
          ' (¿borradas desde la consola?). Se vuelven a subir.',
      )
    }
  } catch (error) {
    aviso(`no he podido comprobar qué hay ya en el álbum: ${error.message}`)
  }
}

const pies = await leerPies(carpeta)
const pendientes = []
for (const foto of fotos) {
  const { size, mtime } = await stat(foto.ruta)
  const marca = `${basename(foto.ruta)}:${size}`
  if (subidas[marca]) continue
  pendientes.push({ ...foto, marca, size, mtime })
}

console.log(`\n  ${carpeta}`)
console.log(`  ${fotos.length} fotos, ${fotos.length - pendientes.length} ya subidas, ${pendientes.length} por subir.`)
if (prueba) console.log('  Modo prueba: se prepara todo pero no se sube nada.')
if (!pendientes.length) {
  console.log('\n✓ No hay nada nuevo que subir.\n')
  exit(0)
}

let hechas = 0
let fallidas = 0
let bytes = 0
const cola = [...pendientes]
/**
 * La primera va sola y, si falla, se para todo. Cada foto se guarda en dos
 * documentos (la grande y la miniatura) y la grande va primero: si lo que está
 * mal es la escritura, sin este freno un lote de 300 fotos dejaría 300 imágenes
 * grandes sueltas que no se ven en ninguna parte y hay que borrar a mano.
 */
let primera = true

async function trabajar() {
  while (cola.length) {
    const foto = cola.shift()
    const nombre = basename(foto.ruta)
    try {
      const original = await medir(foto.ruta)
      const grande = await comprimir(foto.ruta, LADO_GRANDE, TOPE_GRANDE, 'g')
      const mini = await comprimir(foto.ruta, LADO_MINI, TOPE_MINI, 'm')

      const cifradaGrande = await cifrarBytes(clave, grande.bytes)
      const cifradaMini = await cifrarBytes(clave, mini.bytes)
      const meta = await cifrarTexto(
        clave,
        JSON.stringify({
          pie: pies.get(nombre) || undefined,
          de: foto.de || undefined,
        }),
      )
      await grande.borrar()
      await mini.borrar()

      let id = 'prueba'
      if (!prueba) {
        // La grande primero: si falla, no queda una miniatura huérfana.
        id = await crear(cfg, 'photosFull', {
          iv: { stringValue: cifradaGrande.iv },
          b: { bytesValue: b64(cifradaGrande.ct) },
        })
        await crear(
          cfg,
          'photos',
          {
            at: { stringValue: fechaDe(nombre, original.creacion, foto.mtime) },
            w: { integerValue: String(grande.w) },
            h: { integerValue: String(grande.h) },
            iv: { stringValue: cifradaGrande.iv },
            miv: { stringValue: cifradaMini.iv },
            mini: { bytesValue: b64(cifradaMini.ct) },
            meta: { stringValue: meta },
          },
          id,
        )
        subidas[foto.marca] = id
        await writeFile(LIBRO, JSON.stringify(subidas, null, 2), 'utf8')
      }

      hechas++
      bytes += cifradaGrande.ct.length + cifradaMini.ct.length
      const kb = Math.round((cifradaGrande.ct.length + cifradaMini.ct.length) / 1024)
      console.log(
        `  ${String(hechas + fallidas).padStart(4)}/${pendientes.length}  ${nombre.padEnd(28)} ${String(kb).padStart(4)} KB${foto.de ? `  de ${foto.de}` : ''}`,
      )
    } catch (error) {
      if (primera) {
        morir(
          `no se ha podido subir la primera foto (${nombre}):\n  ${error.message}\n\n` +
            '  No he seguido con el resto. Comprueba las reglas de Firestore en la consola\n' +
            '  y los datos de .env. Puede haber quedado una imagen grande suelta: se borra\n' +
            '  desde la consola, en photosFull.',
        )
      }
      fallidas++
      aviso(`${nombre}: ${error.message}`)
    }
    primera = false
  }
}

const arranque = Date.now()
// La primera, sola: hasta que no se sabe que la subida funciona no se lanza el resto.
const abreCamino = cola.splice(0, 1)
if (abreCamino.length) {
  const resto = cola.splice(0)
  cola.push(...abreCamino)
  await trabajar()
  cola.push(...resto)
}
await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, cola.length) }, trabajar))
const segundos = Math.round((Date.now() - arranque) / 1000)

console.log(
  `\n✓ ${hechas} fotos subidas en ${segundos < 60 ? `${segundos}s` : `${Math.round(segundos / 60)} min`}, ${Math.round(bytes / 1024)} KB en total.`,
)
if (fallidas) console.log(`  ${fallidas} se han quedado fuera. Vuelve a lanzarlo y lo reintenta solo con esas.`)
if (prueba) console.log('  (modo prueba: no se ha subido nada de verdad)')
console.log('')
