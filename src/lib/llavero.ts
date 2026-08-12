/**
 * Guarda la clave derivada en IndexedDB en vez de la contraseña en claro en
 * localStorage. Los CryptoKey son estructurado-clonables y siguen siendo no
 * extraíbles al recuperarlos, así que ni el propio navegador la puede leer.
 * De paso, evita rederivar 600.000 iteraciones de PBKDF2 en cada carga.
 */
const BD = 'pigiot'
const ALMACEN = 'claves'
const ID = 'cartas'

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(BD, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(ALMACEN)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function guardarClave(clave: CryptoKey): Promise<void> {
  const db = await abrir()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put(clave, ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}

export async function recuperarClave(): Promise<CryptoKey | null> {
  const db = await abrir()
  if (!db) return null
  const clave = await new Promise<CryptoKey | null>((resolve) => {
    const req = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(ID)
    req.onsuccess = () => resolve((req.result as CryptoKey) ?? null)
    req.onerror = () => resolve(null)
  })
  db.close()
  return clave
}

export async function olvidarClave(): Promise<void> {
  const db = await abrir()
  if (!db) return
  await new Promise<void>((resolve) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).delete(ID)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
  db.close()
}
