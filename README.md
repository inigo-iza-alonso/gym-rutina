# Rutina Gym

Web app (PWA) con una rutina de 3 días (Pierna y glúteo / Torso / Glúteo) para Marta y Candela.

- Registro de kilos y repeticiones por perfil, con lo de la última vez y aviso de cuándo subir peso.
- Temporizador de descanso automático al marcar cada serie.
- Animación de cada ejercicio con el ritmo de la técnica e indicaciones con flecha, más foto real de referencia.
- Ficha de cada entreno con sus pesos y sus fotos post-entreno.
- Galería para comparar fotos (antes/después) por ángulo: frente, lado y espalda.
- Funciona sin conexión.

## Dónde se guardan los datos
Todo se guarda **solo en el móvil** de cada una, nunca en un servidor:
- Pesos e historial: `localStorage`.
- Fotos: IndexedDB (comprimidas a ~1280 px).

Si se borran los datos del navegador, se desinstala la app o se cambia de móvil, se pierden. No hay copia de seguridad.

## Archivos
- `index.html`: app principal. La rutina está en la constante `DAYS`.
- `anim.js`: animaciones de los ejercicios (posturas clave + secuencia con tiempos e indicaciones).
- `photos.js`: fotos de progreso, ficha del entreno y galería.
- `sw.js`: caché offline. Sube `VERSION` cada vez que cambies archivos.
- `manifest.webmanifest` + `icons/`: instalación como app.
- `img/ex/`: fotos de referencia de [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (dominio público).

## Probar en local
```
python -m http.server 8000
```
Abre http://localhost:8000.

## Instalar en el móvil
Abre la web publicada (HTTPS):
- **iPhone (Safari):** Compartir → "Añadir a pantalla de inicio".
- **Android (Chrome):** menú ⋮ → "Instalar aplicación".
