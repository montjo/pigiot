import type { Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.projectId)

let pending: Promise<Firestore | null> | null = null

/**
 * Carga el SDK de Firebase solo cuando hace falta: son ~500 kB que no deben
 * retrasar la primera pantalla. Devuelve null si no está configurado, y en ese
 * caso la app funciona igual guardando el progreso solo en este dispositivo.
 */
export function getDb(): Promise<Firestore | null> {
  if (!isFirebaseConfigured) return Promise.resolve(null)
  if (!pending) {
    pending = (async () => {
      const [{ getApp, getApps, initializeApp }, firestore] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ])
      const { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } =
        firestore
      const app = getApps().length ? getApp() : initializeApp(config)
      try {
        // Caché persistente: el álbum es lo único que baja peso de la red, y así
        // las fotos ya vistas salen al instante, sin gastar tráfico y sin cobertura.
        return initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        })
      } catch (error) {
        // Ya estaba arrancado (recarga en caliente, o dos entradas al mismo
        // proyecto). Se reutiliza el que hay en vez de tirar la conexión.
        console.warn('Firestore ya estaba arrancado, se reutiliza.', error)
        return getFirestore(app)
      }
    })().catch((error) => {
      console.warn('No se pudo inicializar Firebase.', error)
      return null
    })
  }
  return pending
}
