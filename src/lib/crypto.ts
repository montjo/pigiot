export type Letter = {
  id: string
  title: string
  body: string
  emoji?: string
  hint?: string
  /** AAAA-MM-DD: la carta no se muestra antes de esa fecha. */
  unlockAt?: string
}

export type LetterBundle = {
  v: number
  progressId: string
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  iv: string
  ct: string
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Devuelve las cartas si la contraseña es correcta, o null si no lo es.
 * No hace falta guardar ningún hash de la contraseña de él: AES-GCM lleva su
 * propia comprobación de integridad, así que descifrar solo funciona con la
 * contraseña buena.
 */
export async function decryptLetters(
  password: string,
  bundle: LetterBundle,
): Promise<Letter[] | null> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(bundle.kdf.salt),
      iterations: bundle.kdf.iterations,
      hash: bundle.kdf.hash,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(bundle.iv) },
      key,
      fromBase64(bundle.ct),
    )
    return JSON.parse(new TextDecoder().decode(plaintext)) as Letter[]
  } catch {
    return null
  }
}

export async function loadBundle(): Promise<LetterBundle> {
  const response = await fetch(`${import.meta.env.BASE_URL}letters.enc.json`, { cache: 'no-cache' })
  if (!response.ok) throw new Error(`No se pudo cargar letters.enc.json (${response.status})`)
  return (await response.json()) as LetterBundle
}
