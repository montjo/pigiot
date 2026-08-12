/**
 * Lectura en voz alta de la intro, con la voz del propio dispositivo.
 *
 * No hay audio grabado en el repo a propósito: así el texto y lo que se oye no
 * pueden descuadrarse, y no hay que volver a grabar nada al cambiar una frase.
 */

const hayVoz = typeof window !== 'undefined' && 'speechSynthesis' in window

/** true si el dispositivo sabe leer. Si es false, no se pinta el botón. */
export const vozDisponible = hayVoz

let elegida: SpeechSynthesisVoice | null = null

/** Preferimos una voz de España instalada en el aparato: suena mejor y no gasta red. */
function elegirVoz(): SpeechSynthesisVoice | null {
  if (!hayVoz) return null
  if (elegida) return elegida
  const voces = window.speechSynthesis.getVoices()
  elegida =
    voces.find((v) => v.lang === 'es-ES' && v.localService) ??
    voces.find((v) => v.lang === 'es-ES') ??
    voces.find((v) => v.lang.startsWith('es')) ??
    null
  return elegida
}

if (hayVoz) {
  // En Chrome la lista de voces llega más tarde que la primera pintada.
  window.speechSynthesis.onvoiceschanged = () => {
    elegida = null
    elegirVoz()
  }
  elegirVoz()
}

export function callar() {
  if (hayVoz) window.speechSynthesis.cancel()
}

/** Corta lo que hubiera empezado y lee el texto nuevo. */
export function hablar(texto: string) {
  if (!hayVoz) return
  window.speechSynthesis.cancel()
  const frase = new SpeechSynthesisUtterance(texto)
  frase.lang = 'es-ES'
  const voz = elegirVoz()
  if (voz) frase.voice = voz
  frase.rate = 0.96
  window.speechSynthesis.speak(frase)
}
