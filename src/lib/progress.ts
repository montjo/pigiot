import { getDb } from './firebase'

export type OpenedEntry = { at: string; device: string }

export type Progress = {
  opened: Record<string, OpenedEntry>
  visits?: number
  lastSeen?: string
}

const EMPTY: Progress = { opened: {} }
const localKey = (progressId: string) => `pigiot:progress:${progressId}`

function deviceLabel(): string {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return 'otro'
}

function readLocal(progressId: string): Progress {
  try {
    const raw = localStorage.getItem(localKey(progressId))
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Progress) } : EMPTY
  } catch {
    return EMPTY
  }
}

function writeLocal(progressId: string, progress: Progress) {
  try {
    localStorage.setItem(localKey(progressId), JSON.stringify(progress))
  } catch {
    // Modo privado o almacenamiento lleno: Firestore sigue siendo la copia buena.
  }
}

/** Fusiona copia local y remota quedándose con la fecha más antigua de cada carta. */
function merge(a: Progress, b: Progress): Progress {
  const opened: Record<string, OpenedEntry> = { ...a.opened }
  for (const [id, entry] of Object.entries(b.opened ?? {})) {
    const existing = opened[id]
    if (!existing || entry.at < existing.at) opened[id] = entry
  }
  return {
    opened,
    visits: Math.max(a.visits ?? 0, b.visits ?? 0),
    lastSeen: (a.lastSeen ?? '') > (b.lastSeen ?? '') ? a.lastSeen : b.lastSeen,
  }
}

/** Carga el progreso al entrar y registra la visita. */
export async function loadProgress(progressId: string): Promise<Progress> {
  const local = readLocal(progressId)
  const db = await getDb()
  if (!db) return local

  try {
    const { doc, getDoc, setDoc, increment } = await import('firebase/firestore')
    const reference = doc(db, 'progress', progressId)
    const snapshot = await getDoc(reference)
    const remote = snapshot.exists() ? (snapshot.data() as Progress) : EMPTY
    const merged = merge(local, remote)
    writeLocal(progressId, merged)

    await setDoc(
      reference,
      { opened: merged.opened, visits: increment(1), lastSeen: new Date().toISOString() },
      { merge: true },
    )
    return merged
  } catch (error) {
    console.warn('No se pudo leer el progreso remoto, se usa el local.', error)
    return local
  }
}

/** Marca una carta como abierta. La primera apertura es la que cuenta. */
export async function markOpened(progressId: string, letterId: string): Promise<Progress> {
  const current = readLocal(progressId)
  if (current.opened[letterId]) return current

  const entry: OpenedEntry = { at: new Date().toISOString(), device: deviceLabel() }
  const next: Progress = { ...current, opened: { ...current.opened, [letterId]: entry } }
  writeLocal(progressId, next)

  const db = await getDb()
  if (db) {
    try {
      const { doc, setDoc } = await import('firebase/firestore')
      await setDoc(
        doc(db, 'progress', progressId),
        { opened: { [letterId]: entry }, lastSeen: entry.at },
        { merge: true },
      )
    } catch (error) {
      console.warn('No se pudo guardar la apertura en remoto.', error)
    }
  }
  return next
}

/** Para el panel de progreso: escucha los cambios en vivo. */
export async function watchProgress(
  progressId: string,
  onChange: (progress: Progress | null) => void,
): Promise<() => void> {
  const db = await getDb()
  if (!db) {
    // Sin Firebase solo se puede enseñar lo de este dispositivo, que al menos
    // sirve para probar el panel antes de configurar nada.
    onChange(readLocal(progressId))
    return () => {}
  }
  const { doc, onSnapshot } = await import('firebase/firestore')
  return onSnapshot(
    doc(db, 'progress', progressId),
    (snapshot) =>
      onChange(snapshot.exists() ? ({ ...EMPTY, ...snapshot.data() } as Progress) : EMPTY),
    (error) => {
      console.error('Error escuchando el progreso.', error)
      onChange(null)
    },
  )
}
