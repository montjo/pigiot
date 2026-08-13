import type { Bundle, Carta, CifradoCartas } from './tipos'

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  // A trozos: fromCharCode con 800 KB de golpe se lleva por delante la pila.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

/** Cifra bytes con la clave de las cartas. El iv se devuelve aparte, en base64. */
export async function cifrarBytes(
  clave: CryptoKey,
  datos: Uint8Array,
): Promise<{ iv: string; ct: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, clave, datos as BufferSource)
  return { iv: toBase64(iv), ct: new Uint8Array(ct) }
}

export async function descifrarBytes(
  clave: CryptoKey,
  iv: string,
  ct: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const plano = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
      clave,
      ct as BufferSource,
    )
    return new Uint8Array(plano)
  } catch {
    return null
  }
}

/** Texto cifrado en una sola cadena «iv.contenido»: el base64 no lleva puntos. */
export async function cifrarTexto(clave: CryptoKey, texto: string): Promise<string> {
  const { iv, ct } = await cifrarBytes(clave, new TextEncoder().encode(texto))
  return `${iv}.${toBase64(ct)}`
}

export async function descifrarTexto(clave: CryptoKey, guardado: string): Promise<string | null> {
  const [iv, ct] = guardado.split('.')
  if (!iv || !ct) return null
  const plano = await descifrarBytes(clave, iv, fromBase64(ct))
  return plano ? new TextDecoder().decode(plano) : null
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** La clave se guarda para poder cifrar y descifrar también las fotos del álbum. */
export async function derivarClave(password: string, bundle: Pick<CifradoCartas, 'kdf'>): Promise<CryptoKey> {
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
export async function descifrarCartas(clave: CryptoKey, bundle: CifradoCartas): Promise<Carta[] | null> {
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
