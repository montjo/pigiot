/**
 * Genera el hash de la contraseña del panel de progreso (la vuestra).
 *
 *   npm run hash -- "vuestra-contraseña"
 *
 * El resultado va en VITE_ADMIN_PASSWORD_HASH (.env y secrets de GitHub).
 */
const password = process.argv[2]

if (!password) {
  console.error('Uso: npm run hash -- "vuestra-contraseña"')
  process.exit(1)
}

const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

console.log(`\nVITE_ADMIN_PASSWORD_HASH=${hex}\n`)
