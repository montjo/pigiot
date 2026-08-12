import { Link } from 'react-router-dom'
import { useSession } from '../lib/session-context'
import { introPendiente } from '../lib/estado'
import { NOMBRE_TIPO, TIPOS_CARTA } from '../lib/tipos'

/** La frase corta es la misma que sale en la intro: si cambia una, cambia la otra. */
const QUE_ES: Record<string, string> = {
  primera: 'Solo hay una y ya la has abierto. Era el principio.',
  normal: '«Me pasó algo.» Un logro, una experiencia, algo que deja marca.',
  misterio:
    '«Ni idea de lo que hay dentro.» Una misión que hemos montado nosotros. No están en la lista: se ganan girando la ruleta, y girar cuesta créditos.',
  reto: '«Me puse a prueba y lo conseguí.» Primero la lees, luego cumples.',
  aparte: '«Mi vida cambió.» Las gordas, las que abren capítulo. No las gastes antes de tiempo.',
}

export default function ComoVa() {
  const { progreso } = useSession()

  return (
    <main className="pantalla">
      <Link to="/" className="volver">
        ← todas las cartas
      </Link>

      <article className="papel">
        <h1>Cómo va esto</h1>

        <p>
          Esto no es una web, es un sitio donde te hemos dejado cosas guardadas. Cada carta tiene
          un momento. Tú decides cuándo ha llegado.
        </p>

        <h2>Una carta se abre una vez</h2>
        <p>
          No hay forma de volver a cerrarla ni de hacer como que no la has leído. Por eso te
          preguntamos dos veces antes. Si abres una y no era el momento, tampoco pasa nada: seguirá
          ahí para releerla.
        </p>

        <h2 id="colores">Hay cinco tipos</h2>
        <ul className="tipos">
          {TIPOS_CARTA.map((t) => (
            <li key={t} data-tipo={t}>
              <span className="carta__marca" aria-hidden="true" />
              <span>
                <strong>{NOMBRE_TIPO[t]}</strong>
                <br />
                {QUE_ES[t]}
              </span>
            </li>
          ))}
        </ul>

        <h2>Algunas te piden algo</h2>
        <p>
          Unas cuantas no se abren hasta que subes una foto de que ha pasado lo que dicen. No hay
          nada que compruebe si es verdad: nos fiamos de ti. La foto es más para nosotros que para
          la carta, y va a parar al álbum del grupo.
        </p>

        <h2>Nosotros vemos lo que abres</h2>
        <p>
          Vemos qué carta abres y cuándo, y la foto que subes. No es vigilancia, es que nos hace
          ilusión enterarnos. <strong>No te vamos a preguntar por ninguna.</strong> Si abres una y
          no dices nada, no pasa nada.
        </p>

        <h2>Si pierdes la contraseña</h2>
        <p>
          No hay botón de recuperarla, porque las cartas están cifradas con ella. Guárdala en el
          móvil cuando te lo pregunte, y si un día no aparece, escríbenos.
        </p>

        <p className="apagado">
          Esto no está acabado. Iremos metiendo cartas nuevas sin avisar.
        </p>

        {/* Antes de acabarla, a la intro solo se llega leyendo «La primera». */}
        {!introPendiente(progreso) && (
          <p>
            <Link to="/intro" className="enlace">
              volver a ver la explicación del principio →
            </Link>
          </p>
        )}

        <Link to="/" className="enlace">
          ← volver a las cartas
        </Link>
      </article>
    </main>
  )
}
