# NOWAYOUT

Escape rooms para jugar en directo, solo o con amigos, desde el navegador del móvil o del ordenador. No hay nada que instalar.

**Sala 0 · La Última Frecuencia.** Un faro en la Costa da Morte, una tormenta y una vieja radio que habla con 1996. Unos 15 minutos, dificultad media, de 1 a 4 jugadores. Quien la supera desbloquea el catálogo.

## Jugar

Enlace para jugar: **https://twoclicksia-cmyk.github.io/Nowayout/**

- **Solo:** abre la web y pulsa «Jugar solo».
- **Con amigos:** pulsa «Jugar con amigos», escribe tu nombre y «Crear sala». Comparte el enlace (botón de WhatsApp o «Copiar enlace»). Los demás lo abren, escriben su nombre y pulsan «Entrar en la sala». Cuando todos marcan «listo», el anfitrión empieza la partida.

Mejor con auriculares y con el sonido activado.

## Publicarlo en tu propio hosting

Es una web estática: no necesita compilar nada ni servidor propio.

1. Sube **todo el contenido de esta carpeta** (con `index.html` en la raíz) a cualquier hosting estático: tu servidor, Netlify, Vercel, Cloudflare Pages, GitHub Pages…
2. Sírvelo por **HTTPS** (necesario para el modo cooperativo).
3. Si lo publicas en una subcarpeta funciona igual: todas las rutas son relativas.
4. Para que la vista previa de WhatsApp muestre la imagen, cambia en `index.html` la URL de `og:image` por la de tu dominio.

Para probarlo en local: `python3 -m http.server 8080` dentro de esta carpeta y abre `http://localhost:8080`.

## Cómo funciona el cooperativo

La partida se sincroniza en directo con MQTT sobre WebSocket seguro usando brókers públicos y gratuitos (EMQX, HiveMQ, Eclipse, Mosquitto). Si uno no responde, se prueba el siguiente. El dispositivo que crea la sala hace de anfitrión: aplica las acciones y publica el estado; si se cae, otro jugador toma el relevo. Si alguien se desconecta, sus plantas pasan a otro jugador y las recupera al volver.

- Los brókers públicos son de uso libre y sin garantía: casi siempre funcionan, pero pueden tener cortes. Para un servicio estable, usa un bróker propio con WebSocket seguro y ponlo el primero en `js/net/session.js` (`BROKERS`).
- El código de sala no es secreto: cualquiera con el código puede entrar.

## Progreso y puntuación

El acceso al catálogo, los finales vistos y los récords («Parte de guardia») se guardan solo en el navegador del jugador (`localStorage`). No es un control de acceso seguro. Un ranking público necesitará un pequeño servidor: el objeto `record` de `js/game/report.js` ya tiene el formato pensado para enviarlo.

## Créditos y licencias

- Motor 3D: [three.js](https://threejs.org) (MIT). Conexión: [MQTT.js](https://github.com/mqttjs/MQTT.js) (MIT).
- Voces sintéticas generadas con [Kokoro](https://github.com/hexgrad/kokoro) (Apache-2.0) y procesadas para cada momento (radio, teléfono, emociones).
- Tipografías Archivo, Big Shoulders Display e IBM Plex Mono (SIL Open Font License, ver `assets/fonts/OFL.txt`).
- Faro, texturas, sonido ambiente, tonos de llamada y música: originales, creados para este proyecto (modelado y horneado en Blender, sonido procedural).
- Historia, personajes y lugares (Cabo Néboa, el Santa Ilia, el Marée) son ficticios.
