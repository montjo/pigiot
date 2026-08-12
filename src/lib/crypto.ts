import type { Bundle, Carta } from './tipos'

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

/** La clave se guarda para poder cifrar y descifrar también las fotos del álbum. */
export async function derivarClave(password: string, bundle: Bundle): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(bundle.kdf.salt),
      iterations: bundle.kdf.iterations,
      hash: bundle.kdf.hash,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Devuelve las cartas si la clave es la buena, o null si no lo es. No hace
 * falta guardar ningún hash: AES-GCM lleva su propia comprobación, así que
 * descifrar solo funciona con la contraseña correcta.
 */
export async function descifrarCartas(clave: CryptoKey, bundle: Bundle): Promise<Carta[] | null> {
  try {
    const plano = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(bundle.iv) },
      clave,
      fromBase64(bundle.ct),
    )
    return JSON.parse(new TextDecoder().decode(plano)) as Carta[]
  } catch {
    return null
  }
}

export async function cargarBundle(): Promise<Bundle> {
  const res = await fetch(`${import.meta.env.BASE_URL}letters.enc.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`No se pudo cargar el fichero de cartas (${res.status})`)
  return (await res.json()) as Bundle
}
