/**
 * Las fotos de las pruebas, guardadas dentro de Firestore y cifradas con la
 * misma clave que las cartas.
 *
 * Firebase Storage exige plan Blaze con tarjeta, así que aquí no hay Storage:
 * cada foto va como bytes dentro de un documento. Un documento de Firestore
 * aguanta 1 MiB, y las reglas cortan la grande en 800 KB y la miniatura en
 * 150 KB, así que hay que recomprimir antes de subir. Con el gigabyte del plan
 * gratuito caben más de mil fotos, que para lo que es esto sobra de largo.
 *
 * La miniatura y los metadatos viven en `photos` (se leen para pintar el álbum)
 * y la grande en `photosFull` con el mismo id (solo se lee al ampliarla).
 */
import { getDb } from './firebase'
import { esEfimero } from './progress'
import { cifrarBytes, cifrarTexto, descifrarBytes, descifrarTexto } from './crypto'
import type { FotoAlbum } from './tipos'

const LADO_GRANDE = 1600
const LADO_MINI = 400
/** Las reglas cortan en 800 000 y 150 000: dejamos margen para el cifrado. */
const TOPE_GRANDE = 760_000
const TOPE_MINI = 130_000

export type MetaFoto = { cartaId?: string; pie?: string }

async function aBitmap(archivo: File): Promise<ImageBitmap> {
  try {
    // Con la orientación del EXIF, o las fotos verticales del móvil salen tumbadas.
    return await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    return await createImageBitmap(archivo)
  }
}

function aBlob(lienzo: HTMLCanvasElement, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => lienzo.toBlob(resolve, 'image/jpeg', calidad))
}

/** Reduce y recomprime hasta que el JPEG entra en el hueco que dejan las reglas. */
async function comprimir(
  bitmap: ImageBitmap,
  lado: number,
  tope: number,
): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  let escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  let calidad = 0.75

  for (let intento = 0; intento < 7; intento++) {
    const w = Math.max(1, Math.round(bitmap.width * escala))
    const h = Math.max(1, Math.round(bitmap.height * escala))
    const lienzo = document.createElement('canvas')
    lienzo.width = w
    lienzo.height = h
    const pincel = lienzo.getContext('2d')
    if (!pincel) throw new Error('Este navegador no sabe recomprimir la foto.')
    pincel.drawImage(bitmap, 0, 0, w, h)

    const blob = await aBlob(lienzo, calidad)
    if (!blob) throw new Error('No se ha podido preparar la foto.')
    if (blob.size <= tope) {
      return { bytes: new Uint8Array(await blob.arrayBuffer()), w, h }
    }
    // Primero se baja calidad, que casi no se nota; luego ya el tamaño.
    if (calidad > 0.45) calidad -= 0.12
    else escala *= 0.8
  }
  throw new Error('La foto sigue pesando demasiado después de reducirla.')
}

/**
 * Sube la foto y devuelve su id, o null si no hay Firestore configurado.
 * Lanza si la foto no se puede preparar o si Firestore rechaza la escritura:
 * quien llama decide qué hacer, pero nunca debe impedirle terminar la carta.
 */
export async function subirFoto(
  clave: CryptoKey,
  archivo: File,
  meta: MetaFoto & { ancla?: boolean },
): Promise<string | null> {
  // En un ensayo se hace todo menos escribir: así se puede probar la carta
  // entera sin dejar fotos de mentira en el álbum de verdad.
  if (esEfimero()) return null
  const db = await getDb()
  if (!db) return null

  const bitmap = await aBitmap(archivo)
  const grande = await comprimir(bitmap, LADO_GRANDE, TOPE_GRANDE)
  const mini = await comprimir(bitmap, LADO_MINI, TOPE_MINI)
  bitmap.close()

  const cifradaGrande = await cifrarBytes(clave, grande.bytes)
  const cifradaMini = await cifrarBytes(clave, mini.bytes)
  const metaCifrada = await cifrarTexto(clave, JSON.stringify({ cartaId: meta.cartaId, pie: meta.pie }))

  const { addDoc, collection, doc, setDoc, Bytes } = await import('firebase/firestore')
  // La grande primero: si falla, no queda una miniatura huérfana en el álbum.
  const creada = await addDoc(collection(db, 'photosFull'), {
    iv: cifradaGrande.iv,
    b: Bytes.fromUint8Array(cifradaGrande.ct),
  })
  await setDoc(doc(db, 'photos', creada.id), {
    at: new Date().toISOString(),
    w: grande.w,
    h: grande.h,
    iv: cifradaGrande.iv,
    miv: cifradaMini.iv,
    mini: Bytes.fromUint8Array(cifradaMini.ct),
    meta: metaCifrada,
    ...(meta.ancla ? { ancla: true } : {}),
  })
  return creada.id
}

type FilaFoto = {
  at: string
  w: number
  h: number
  ancla?: boolean
  iv: string
  miv: string
  meta: string
  mini: { toUint8Array(): Uint8Array }
}

async function aFoto(clave: CryptoKey, id: string, fila: FilaFoto): Promise<FotoAlbum> {
  const bytes = await descifrarBytes(clave, fila.miv, fila.mini.toUint8Array())
  const metaPlana = await descifrarTexto(clave, fila.meta)
  let meta: MetaFoto = {}
  try {
    meta = metaPlana ? (JSON.parse(metaPlana) as MetaFoto) : {}
  } catch {
    meta = {}
  }
  return {
    id,
    at: fila.at,
    w: fila.w,
    h: fila.h,
    ancla: fila.ancla,
    url: bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' })) : undefined,
    meta,
  }
}

/** Una foto suelta, para enseñarla dentro de su carta. */
export async function cargarMiniatura(clave: CryptoKey, id: string): Promise<FotoAlbum | null> {
  const db = await getDb()
  if (!db) return null
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'photos', id))
  if (!snap.exists()) return null
  return aFoto(clave, id, snap.data() as FilaFoto)
}

/** Todas, de la más nueva a la más vieja. Para el panel y para el álbum. */
export async function cargarFotos(clave: CryptoKey): Promise<FotoAlbum[]> {
  const db = await getDb()
  if (!db) return []
  const { collection, getDocs } = await import('firebase/firestore')
  const snap = await getDocs(collection(db, 'photos'))
  const fotos = await Promise.all(snap.docs.map((d) => aFoto(clave, d.id, d.data() as FilaFoto)))
  return fotos.sort((a, b) => (a.at < b.at ? 1 : -1))
}

/** La grande, solo cuando se abre a pantalla completa. */
export async function cargarFotoGrande(clave: CryptoKey, id: string): Promise<string | null> {
  const db = await getDb()
  if (!db) return null
  const { doc, getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'photosFull', id))
  if (!snap.exists()) return null
  const fila = snap.data() as { iv: string; b: { toUint8Array(): Uint8Array } }
  const bytes = await descifrarBytes(clave, fila.iv, fila.b.toUint8Array())
  if (!bytes) return null
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/jpeg' }))
}
