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
      const [{ initializeApp }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/firestore'),
      ])
      return getFirestore(initializeApp(config))
    })().catch((error) => {
      console.warn('No se pudo inicializar Firebase.', error)
      return null
    })
  }
  return pending
}
