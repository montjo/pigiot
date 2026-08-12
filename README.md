# Ábreme cuando…

Web de cartas para abrir según le vayan pasando cosas. Sitio estático (sin servidor),
alojado gratis en GitHub Pages.

- Las cartas se escriben en `content/letters.json`, que **nunca se sube al repo**.
- Un script las cifra en `public/letters.enc.json`. Eso sí se sube, pero es ilegible
  sin la contraseña: en el repo público solo hay ruido.
- El progreso (qué carta abrió y cuándo) se guarda en Firestore, así que le sigue
  entre el móvil y el ordenador y vosotros lo veis en `/#/progreso`.

## Comandos

```bash
npm install        # una sola vez
npm run dev        # desarrollo en http://localhost:5173/pigiot/
npm run letters    # cifra content/letters.json -> public/letters.enc.json
npm run hash -- "contraseña"   # hash para la contraseña del panel
npm run build      # comprueba que todo compila
```

## 1. Escribir las cartas

```bash
cp content/letters.example.json content/letters.json
```

Cada carta necesita `id`, `title` y `body`. Opcionales: `emoji`, `hint` y `unlockAt`
(`AAAA-MM-DD`, la carta no aparece antes de esa fecha). Los párrafos se separan con
una línea en blanco (`\n\n`).

**No cambies el `id` de una carta ya publicada**: el progreso se guarda por `id` y
si lo cambias parecerá que nunca la abrió.

### Las de misterio y la ruleta

Las cartas con `tipo: misterio` **no salen en la lista**: se reparten por las
casillas de la ruleta (`/#/ruleta`) y solo se leen si le tocan. El reparto es
automático y por orden de `id`, así que añadir una nueva no mueve las anteriores.
Con `casilla: verde` en la cabecera, esa carta va a una de las dos casillas verdes
(0 y 00), que son las raras; sin `casilla`, va a las rojas y negras.

Girar cuesta créditos, y los créditos salen de entrar cada día (con racha), abrir
cartas del mazo, cumplir pruebas y hacer planes del bombo. **Todos los números están
en `src/lib/economia.ts`, en la constante `ECONOMIA`**, para recalibrarlos de una
pasada. Tal y como están: una tirada son 200 créditos y una semana entrando cada día
da 150, así que sale una tirada cada nueve o diez días si no hace nada más. Al
terminar la intro se regalan 200 para que la primera tirada sea inmediata.

El saldo no se guarda en ningún sitio: se recalcula siempre a partir del registro.

Cuando estén escritas:

```bash
npm run letters
```

Te pedirá la contraseña que le vas a dar a él. **Guárdala en tu gestor de
contraseñas antes de seguir**: si la pierdes, las cartas no se pueden recuperar.
El script imprime también el `progressId`, que necesitas en el paso 2.

## 2. Firebase (progreso entre dispositivos)

1. Entra en <https://console.firebase.google.com> y crea un proyecto. Desactiva
   Google Analytics: no hace falta y complica la configuración.
2. **Agregar app** → **Web** (`</>`). **No** marques Firebase Hosting: el alojamiento
   es GitHub Pages. Copia los valores de `firebaseConfig`.
3. `cp .env.example .env` y rellena las cuatro variables `VITE_FIREBASE_*`.
4. Menú lateral → **Bases de datos y almacenamiento** → Firestore Database → Crear
   base de datos. Ubicación **eur3 (europe-west)**, que es permanente, y **modo de
   producción**.
5. Pestaña **Reglas**: borra lo que haya y pega el contenido de `firestore.rules`
   tal cual. Publicar.

El plan gratuito (Spark) no pide tarjeta y da 50.000 lecturas al día. Aquí vas a
gastar unas decenas al mes.

> **Si ya las tenías pegadas, vuelve a pegarlas.** Las reglas llevan la lista de
> campos permitidos, y los créditos añadieron dos (`dias` y `tiradas`). Sin
> republicarlas, los días y las tiradas no llegan a la nube: el saldo funciona en
> el móvil donde esté jugando, pero no le sigue a otro aparato.

## 3. Contraseña del panel de progreso

```bash
npm run hash -- "vuestra-contraseña"
```

Pega el resultado en `VITE_ADMIN_PASSWORD_HASH` dentro de `.env`. El panel está en
`/#/progreso`.

### Ver la web como el primer día

Añade `?ensayo` a la dirección (`/pigiot/?ensayo`, hay un enlace en el panel de
progreso). Se entra con su contraseña de siempre, pero el progreso arranca vacío y
vive solo en memoria: ni se lee lo que ya había ni se guarda nada, ni en el móvil ni
en Firestore. Sirve para repasar el arranque —todo el mazo sellado menos «La
primera», y la intro que lo desbloquea— sin tocar su registro, que es
irrecuperable. Se sale recargando sin `?ensayo`.

## 4. Publicar en GitHub Pages

Cuenta: **montjo**. El repo ya está inicializado con esa identidad y con el correo
privado `74719024+montjo@users.noreply.github.com`, para no dejar el Gmail personal
en el historial de un repo público. La identidad es **local a este repo**, así que
no toca la global (la del trabajo).

1. Crea el repo en GitHub con el nombre exacto **`pigiot`** y en **público** (Pages
   sobre repos privados es de pago). Sin README ni .gitignore, que ya los hay.
2. En el repo: Settings → Pages → Source: **GitHub Actions**.
3. En Settings → Secrets and variables → Actions → *New repository secret*, añade los
   cinco (los valores están en tu `.env` local):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_APP_ID` y `VITE_ADMIN_PASSWORD_HASH`.
4. Sube el código:

```bash
git remote add origin https://github.com/montjo/pigiot.git
git push -u origin main
```

Cada push a `main` vuelve a desplegar solo. La web queda en
<https://montjo.github.io/pigiot/> y el panel en
<https://montjo.github.io/pigiot/#/progreso>.

## Qué está protegido y qué no

- **El contenido de las cartas sí**: va cifrado con AES-GCM y una clave derivada de
  su contraseña con PBKDF2 (310.000 iteraciones). Sin la contraseña no hay forma
  práctica de leerlas, ni desde el repo ni desde el navegador.
- **La contraseña del panel no del todo**: el hash viaja en el JavaScript, así que
  alguien con ganas podría saltarse la pantalla. Solo protege la vista, no los datos.
- **El documento de progreso es legible** por quien encuentre el `progressId` en el
  repo. Son fechas de apertura, nada delicado. Si te importa, la solución de verdad
  es activar Firebase Auth anónimo y exigirlo en las reglas.
- La clave de Firebase en el JavaScript es normal y esperado: lo que protege la base
  de datos son las reglas de `firestore.rules`.

## Antes de regalarlo

- [ ] Cartas de verdad en `content/letters.json` y `npm run letters` con la
      contraseña definitiva. Mientras no se haga, lo que hay publicado son las
      cartas de ejemplo cifradas con una contraseña de pruebas.
- [ ] `VITE_ADMIN_PASSWORD_HASH` cambiado, en `.env` y en los secretos de GitHub.
- [ ] **Borrar los datos de prueba**: consola de Firebase → Firestore → pestaña
      *Datos* → colección `progress` → borrar el documento. Si no, el panel le
      contará visitas y aperturas que no son suyas. Ojo: las reglas no permiten
      borrar desde la web, solo desde la consola (así nadie puede cargarse su
      progreso).
- [ ] Abrir la web publicada desde el móvil y comprobar que entra con la
      contraseña.

## Añadir cartas más adelante

Edita `content/letters.json`, ejecuta `npm run letters` con **la misma contraseña de
siempre**, y haz push. El `progressId` se conserva, así que no se pierde el progreso.
