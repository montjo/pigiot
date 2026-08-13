/**
 * Contratos compartidos de toda la app. Si algo se usa en más de un módulo,
 * su tipo vive aquí y no se redefine en ningún otro sitio.
 */

export const TIPOS_CARTA = ['primera', 'normal', 'misterio', 'reto', 'aparte'] as const
export type TipoCarta = (typeof TIPOS_CARTA)[number]

/** Nombre visible de cada tipo, tal cual se pinta en la interfaz. */
export const NOMBRE_TIPO: Record<TipoCarta, string> = {
  primera: 'La primera',
  normal: 'Normal',
  misterio: 'Misterio',
  reto: 'Reto',
  aparte: 'Punto y aparte',
}

/** Lo que hay que aportar en una carta: el QUEST. */
export type Prueba = {
  /** Qué tiene que hacer, en su idioma: «Una foto tuya con nosotros, de ahora mismo». */
  texto: string
  /** Las preguntas que se le hacen, en orden. La primera es obligatoria. */
  preguntas?: string[]
  /**
   * Si además de contestar hay que aportar algo, qué. Solo foto: un vídeo no
   * cabe en un documento de Firestore (1 MiB) y Storage es de pago.
   */
  pide?: 'foto'
  /** true en las pruebas que piden una foto del momento (abre la cámara). */
  camara?: boolean
  /** true cuando la carta debe comprobar que está fuera de España. */
  ubicacion?: boolean
  /**
   * true si se aporta DESPUÉS de leer la carta, no antes. En los retos siempre
   * es así; en las normales, cuando el QUEST habla de lo que acaba de leer.
   */
  despues?: boolean
}

/** Un escrito firmado por una persona del grupo. */
export type Voz = {
  de: string
  cuerpo: string[]
}

/** Un plan del bombo de las cartas de misterio. */
export type Plan = {
  id: string
  /** El plan en sí: «Ver el amanecer». */
  plan: string
  /** Quién lo propone y con quién se hace. */
  con: string[]
  /** Detalle opcional que se lee debajo. */
  detalle?: string
}

/** Foto incrustada dentro de una carta. Va cifrada dentro del bundle. */
export type FotoCarta = {
  /** data: URI ya incrustada por scripts/cartas.mjs */
  src: string
  pie?: string
}

/** Color de la casilla que le toca en la ruleta a una carta de misterio. */
export const COLORES_CASILLA = ['rojo', 'negro', 'verde'] as const
export type ColorCasilla = (typeof COLORES_CASILLA)[number]

export type Carta = {
  id: string
  tipo: TipoCarta
  /**
   * Solo en las de misterio: en qué color de la ruleta vive. Si no se dice,
   * se reparte sola entre rojas y negras. Las verdes (0 y 00) son las raras.
   */
  casilla?: ColorCasilla
  /** «Ábreme cuando…» */
  titulo: string
  /** Subtítulo que se lee en la lista sin abrir la carta. */
  pista?: string
  /** Cuándo se escribió: «marzo de 2026». Se pinta como matasellos. */
  escritaEl?: string
  /** AAAA-MM-DD. Antes de esa fecha la carta no se puede abrir. */
  desde?: string
  /** Si es true, la carta ni aparece en la lista hasta que se puede abrir. */
  oculta?: boolean
  prueba?: Prueba
  cuerpo?: string[]
  fotos?: FotoCarta[]
  voces?: Voz[]
  bombo?: Plan[]
}

/** En las de reto la prueba se aporta DESPUÉS de abrirla; en el resto, si lo pide. */
export function pruebaVaDespues(carta: Carta): boolean {
  return carta.tipo === 'reto' || Boolean(carta.prueba?.despues)
}

// --- Lo que viaja cifrado ---------------------------------------------------

export type CifradoCartas = {
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  iv: string
  ct: string
}

export type Bundle = CifradoCartas & {
  v: number
  progressId: string
  /** Pista de la contraseña, EN CLARO a propósito: es la única red de seguridad. */
  pista?: string
  /** Segundo cifrado para enseñar la web sin tocar el progreso real. */
  revision?: CifradoCartas
}

// --- Progreso (documento único de Firestore) --------------------------------

export type Apertura = { at: string; device: string }

export type PruebaAportada = {
  at: string
  /** Id del documento de la colección `photos`, si se subió foto. */
  fotoId?: string
  /** Lo que contestó, una entrada por pregunta. Viaja EN CLARO: ojo con esto. */
  lineas?: string[]
}

/** Una tirada de la ruleta: lo que se paga y lo que sale. */
export type Tirada = {
  at: string
  /** La casilla que salió: '0', '00', '7'… */
  casilla: string
  /** La carta de misterio que había detrás. */
  cartaId: string
}

export type Sorteo = {
  planId: string
  at: string
  /** Cuándo marcaron el plan como hecho. Mientras no exista, no se puede resortear. */
  hechoAt?: string
}

export type Progreso = {
  opened: Record<string, Apertura>
  pruebas: Record<string, PruebaAportada>
  /** Varios sorteos por carta: el bombo se puede volver a girar. */
  sorteos: Record<string, Sorteo[]>
  /**
   * Los días que ha entrado, en 'AAAA-MM-DD' de su reloj. De aquí salen los
   * créditos y la racha; el saldo no se guarda nunca, se recalcula.
   */
  dias: Record<string, true>
  /** Tiradas de la ruleta, con la hora en milisegundos como clave. */
  tiradas: Record<string, Tirada>
  visits?: number
  lastSeen?: string
  tutorialAt?: string
}

export const PROGRESO_VACIO: Progreso = {
  opened: {},
  pruebas: {},
  sorteos: {},
  dias: {},
  tiradas: {},
}

// --- Estado derivado de una carta -------------------------------------------

export type EstadoCarta =
  /** El mazo sigue sellado: todavía no ha terminado la intro de «La primera». */
  | 'sellada'
  /** Aún no ha llegado su fecha. */
  | 'futura'
  /** Hay que aportar la prueba antes de poder abrirla. */
  | 'pide-prueba'
  /** Se puede abrir ya. */
  | 'cerrada'
  /** Abierta, pero le falta aportar la prueba (solo retos). */
  | 'a-medias'
  | 'abierta'

// --- Álbum ------------------------------------------------------------------

export type FotoAlbum = {
  id: string
  /** ISO. En claro: no dice nada por sí solo. */
  at: string
  w: number
  h: number
  /** true solo en la foto de la carta `primera`: la que abre la historia. */
  ancla?: boolean
  /** Miniatura ya descifrada, lista para <img src>. */
  url?: string
  /** Metadatos descifrados. */
  meta?: { cartaId?: string; de?: string; pie?: string }
}
