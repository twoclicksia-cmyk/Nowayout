// LA ÚLTIMA FRECUENCIA — textos del juego (fuente única de verdad del contenido)
// Contiene spoilers: no se muestra nada de aquí hasta que el jugador lo encuentra.

export const ROOM = {
  id: 'sala0',
  title: 'La Última Frecuencia',
  place: 'Faro de Cabo Néboa · Costa da Morte',
  startClock: { h: 23, m: 37 },   // hora del mundo al empezar
  durationMs: 15 * 60 * 1000,     // 23:37 → 23:52
};

export const ROLES = {
  radio:    { name: 'Radio',     floor: 'f2', short: 'Escuchas 1996 por onda media y manejas el transmisor.' },
  linterna: { name: 'Linterna',  floor: 'f3', short: 'Controlas la luz, la relojería y ves el mar desde arriba.' },
  archivo:  { name: 'Archivo',   floor: 'f1', short: 'Tienes los papeles: libros de guardia, expedientes y el manual.' },
  carta:    { name: 'Cartografía', floor: 'f0', short: 'Tienes la carta náutica, el Libro de Faros y el cuarto de baterías.' },
};
export const ROLE_ORDER = ['radio', 'linterna', 'archivo', 'carta'];

// Reparto por defecto según número de jugadores
export function defaultRoleSplit(n) {
  if (n <= 1) return [['radio', 'linterna', 'archivo', 'carta']];
  if (n === 2) return [['radio', 'archivo'], ['linterna', 'carta']];
  if (n === 3) return [['radio'], ['linterna'], ['archivo', 'carta']];
  return [['radio'], ['linterna'], ['archivo'], ['carta']];
}

export const FLOORS = {
  f3: { name: 'Linterna', sub: 'La luz' },
  f2: { name: 'Sala de radio', sub: 'Guardia' },
  f1: { name: 'Archivo', sub: 'El despacho del torrero' },
  f0: { name: 'Planta baja', sub: 'Cartografía y baterías' },
};

export const INTRO = {
  // [voz del narrador, texto en pantalla]
  solo: [
    ['n_intro_1', 'Cabo Néboa. Costa da Morte. 11 de noviembre.'],
    ['n_intro_2s', 'Viniste a revisar el radiofaro antes del temporal. Pero el temporal llegó antes. El mar ha cortado el camino y la corriente. El faro vive de sus baterías.'],
    ['n_intro_3', 'A las 23:37, en la sala de radio, una emisora muerta desde hace treinta años vuelve a hablar.'],
    ['n_intro_4s', 'Tienes quince minutos. Escucha. Y decide… antes de que suba la marea.'],
  ],
  coop: [
    ['n_intro_1', 'Cabo Néboa. Costa da Morte. 11 de noviembre.'],
    ['n_intro_2c', 'Vinisteis a revisar el radiofaro antes del temporal. Pero el temporal llegó antes. El mar ha cortado el camino y la corriente. El faro vive de sus baterías.'],
    ['n_intro_3', 'A las 23:37, en la sala de radio, una emisora muerta desde hace treinta años vuelve a hablar.'],
    ['n_intro_4c', 'Cada uno guarda una parte del faro: contadlo todo. Tenéis quince minutos… antes de que suba la marea.'],
  ],
};
// duración del prólogo narrado en cooperativo (todos lo oyen a la vez; el reloj arranca al terminar)
export const COOP_INTRO_MS = 37000;

// Documentos (se abren en el visor). type: paper | card | book | newspaper | letter | manual
export const DOCS = {
  workorder: {
    title: 'Orden de trabajo 2026-1187', type: 'paper',
    body: [
      'AUTORIDAD PORTUARIA · SERVICIO DE SEÑALES MARÍTIMAS',
      'Faro: Cabo Néboa (n.º 0415). Característica: GpD(3) B 15s.',
      'Trabajo: revisión del radiofaro y del AIS antes del temporal.',
      'Técnico/a asignado/a: {NAME}.',
      'Observaciones: la emisora de onda media (1980) se conserva por su valor histórico. Desconectada. No requiere mantenimiento.',
    ],
  },
  drawing: {
    title: 'Un dibujo en la mochila', type: 'drawing',
    body: ['Un faro con tres rayos amarillos, hecho con ceras.', 'Abajo, con letra de seis años: «PARA QUE NO TE PIERDAS. LÚA».'],
  },
  clipping: {
    title: 'El Eco de Fisterra · 12-XI-1996', type: 'newspaper',
    headline: 'TRAGEDIA EN LA LAXE DAS VIÚVAS',
    body: [
      'El pesquero Santa Ilia, de Camariñas, naufragó anoche en plena tormenta al encallar en la Laxe das Viúvas, al pie del Monte Facho.',
      'Cinco marineros han desaparecido, entre ellos su patrón, Andrés Lires. Un menor de 11 años, hijo del patrón, fue rescatado con vida al amanecer por el helicóptero de Salvamento, aferrado a un aro salvavidas.',
      'Según Fisterra Radio, el patrón pidió auxilio de viva voz en la antigua frecuencia de socorro de onda media, la que todos los barcos debían escuchar.',
      'La Comandancia investiga por qué el faro de Cabo Néboa estuvo apagado en el momento del naufragio.',
    ],
  },
  photo: {
    title: 'Una foto clavada en el corcho', type: 'photo',
    body: ['Un pesquero en el muelle de Camariñas. Un hombre con un niño a hombros.', 'Detrás, a bolígrafo: «Andrés e Grilo. Verán do 96».'],
  },
  freqcard: {
    title: 'Frecuencias de socorro (tarjeta plastificada)', type: 'card',
    rows: [
      ['VHF canal 16 · 156,800 MHz', 'Socorro y llamada en la costa (voz)'],
      ['2182 kHz · onda media', 'Socorro en radiotelefonía (voz). Escucha obligatoria hasta 1999'],
      ['500 kHz · onda media', 'Socorro en radiotelegrafía (Morse)'],
    ],
    foot: 'Antenas de la emisora: 1 látigo VHF · 2 hilo largo (onda media) · 3 dipolo (onda corta) · 4 carga ficticia (pruebas).',
  },
  calendar: {
    title: 'Calendario de pared', type: 'paper',
    body: ['NOVIEMBRE 1996. Nadie lo ha cambiado desde entonces.', 'El día 11 está rodeado con un círculo. Al lado, a lápiz: «San Martiño. Temporal».'],
  },
  phone: {
    title: 'Teléfono de baquelita', type: 'paper',
    body: ['El teléfono del torrero. Una etiqueta en la base: «Línea dada de baja en 1998».', 'El cable termina en el aire, cortado.'],
  },
  manual: {
    title: 'Manual de la estación · Faro de Cabo Néboa · rev. 1989', type: 'manual',
    sections: [
      { h: '1. Receptor de onda media', p: ['Seleccione la banda MF. Para escucha de socorro en onda media use la antena 2 (hilo largo).', 'Ajuste fino con el mando grande hasta leer la frecuencia exacta en el contador.'] },
      { h: '2. Interferencias', p: ['El balasto de la lámpara principal produce ráfagas de ruido sincronizadas con los destellos del faro.', 'Solución reglamentaria: ajuste el supresor de ruido (SUPRESOR) a la característica del faro: número de pulsos de cada grupo y período en segundos.', 'Otra solución: desconectar la linterna. Prohibido mientras el faro esté en servicio.', 'Con la señal limpia puede ENGANCHAR la portadora: el receptor la mantendrá aunque vuelva el ruido.'] },
      { h: '3. Transmisor de onda media (400 W)', p: ['Necesita el banco de baterías completo: mientras transmite, la linterna queda sin servicio.', 'Procedimiento: 1) CALDEO de válvulas. 2) SINTONÍA hasta el mínimo de la corriente de placa. 3) CARGA hasta el máximo de la corriente de antena.'] },
      { h: '4. Lámpara de reserva (queroseno)', p: ['Es la luz que no depende de nada: ni de la red ni de las baterías.', 'Encendido: bombear hasta 2 kg/cm². Precalentar el vaporizador con alcohol. Abrir la válvula solo con el vaporizador caliente. Encender.', 'Aviso: abrir la válvula en frío provoca una llamarada.'] },
      { h: '5. Relojería de rotación', p: ['Sin corriente, la óptica gira por la relojería de pesas. El tambor gira a 12 vueltas por minuto.', 'La óptica de Néboa da UN grupo de destellos por vuelta completa. Ajuste los engranajes para que el faro conserve su característica.'] },
      { h: '6. Sala de baterías', p: ['Banco de 48 V en la planta baja. Riesgo de inundación con pleamar y mar de fondo.'] },
    ],
  },
  libro: {
    title: 'Libro de Faros · Costa da Morte (extracto)', type: 'table',
    head: ['N.º', 'Luz', 'Característica', 'Alcance'],
    rows: [
      ['0412', 'Punta Insua', 'GpD(2) B 10s', '15 M'],
      ['0415', 'Cabo Néboa', 'GpD(3) B 15s', '23 M'],
      ['0418', 'Camariñas, dique', 'GpD(2) R 7s', '5 M'],
      ['0419', 'Monte Facho, torreta de comunicaciones', 'F R (obstrucción, no es ayuda a la navegación)', '—'],
    ],
    legend: 'D = destello · GpD(n) = grupo de n destellos · F = fija · B = blanca · R = roja · 15s = período: lo que tarda en repetirse la secuencia completa · M = millas.',
  },
  tides: {
    title: 'Mareas · noviembre 2026 · Camariñas', type: 'paper',
    body: ['Día 11: pleamares a las 11:31 (3,9 m) y a las 23:52 (4,3 m).', 'Alguien ha marcado la segunda con un rotulador: «!»'],
  },
  logbook: {
    title: 'Libros de guardia · Cabo Néboa', type: 'book',
    body: [
      'Libros de guardia de 1979 a 1997, con la letra apretada de Ramón Bouzas.',
      'Cada noche igual: hora, viento, mar, «luz en servicio». Treinta años de «luz en servicio».',
      'En el de 1996 falta una hoja: la del 11 de noviembre. Está arrancada de cuajo. Solo queda el borde.',
    ],
  },
  dossier: {
    title: 'Expediente 14/97 · Comandancia de Marina', type: 'dossier',
    body: [
      'Asunto: naufragio del pesquero Santa Ilia (11-XI-1996) en la Laxe das Viúvas. Cinco fallecidos. Un superviviente menor de edad.',
      'Hechos: la linterna del faro de Cabo Néboa estuvo apagada entre las 23:52 y las 23:55. A oscuras, el pesquero puso rumbo hacia una luz roja que confundió con la entrada de Camariñas.',
      'El torrero, D. Ramón Bouzas, niega haber tocado la luz. Declara que «se apagó sola» y que en ese momento «una voz llamaba al Santa Ilia en la radio, desde el propio faro, y sabía mi nombre». No aporta la hoja de su libro de guardia.',
      'Conclusión: se atribuye el apagón a una desconexión manual. Se propone el cese del torrero.',
    ],
    attachment: {
      title: 'Carta de Ramón Bouzas a la Comandancia (1998)',
      body: [
        'Yo no apagué la luz. Treinta años eligiendo la luz, y aquella noche también la elegí.',
        'Me piden la hoja del libro. No se la voy a dar: no me creerían.',
        'La verdad está escrita, y la dejé con la luz que no depende de nada.',
        'R. B.',
      ],
    },
  },
  page: {
    title: 'La hoja arrancada · 11-XI-1996', type: 'logpage',
    lines: [
      ['', 'Temporal del SW. Mar muy gruesa. Luz en servicio.'],
      ['23:41', 'Mayday del SANTA ILIA en 2182. No puedo contestar: el transmisor no tiene fuerza con la linterna en servicio. O luz ou voz. Elijo la luz.'],
      ['23:44', 'Llamo a Salvamento por teléfono. La línea hace cosas raras. Me contesta una respiración. Juro que había alguien.'],
      ['23:52', 'LA LUZ SE APAGA. Yo no la toco. En 2182, una voz llama al Santa Ilia DESDE ESTE FARO. Una voz que no conozco. Dice: «Ramón, perdóname».'],
      ['23:53', 'A oscuras, el Santa Ilia vira hacia la luz roja fija del Facho. Creen que es Camariñas. No me oyen.'],
      ['23:55', 'Enciendo la reserva a mano. Vuelve la luz. Tarde. Golpe en la Laxe das Viúvas.'],
      ['06:40', 'El helicóptero saca del agua a un niño. Solo a uno.'],
    ],
    margin: 'Quien seas: no apagues la luz. Ninguna voz vale más que la luz.',
    sketch: 'Boceto: «Conmutador O LUZ · OU VOZ. Detrás de la tapa del cuadro de baterías».',
  },
};

// Planta inicial de la hoja en cada final (la hoja cambia ante tus ojos)
export const PAGE_AFTER = {
  luz: [
    ['23:41', 'Mayday del SANTA ILIA en 2182. Elijo la luz.'],
    ['23:52', 'Temporal duro. La luz aguanta.'],
    ['00:20', 'El Santa Ilia entra en Camariñas. Sin novedad.'],
  ],
  adv: [
    ['23:52', 'Se apaga la luz. Una voz desde este faro avisa al Santa Ilia: «No sigáis la roja». Ganan mar.'],
    ['23:55', 'Enciendo la reserva a mano.'],
    ['06:30', 'El Santa Ilia entra en puerto con la primera luz.'],
  ],
  resc: [
    ['23:52', 'Se apaga la luz. Una voz desde este faro da a Fisterra la posición exacta de la Laxe.'],
    ['23:55', 'Golpe en la Laxe das Viúvas.'],
    ['00:20', 'El helicóptero saca a seis del agua. A los seis.'],
  ],
  fail: [
    ['23:52', 'LA LUZ SE APAGA. Esta vez, nadie habla.'],
    ['23:55', 'Golpe en la Laxe das Viúvas.'],
  ],
};

// Eventos de radio. ch: mf (1996, sala de radio) | vhf (2026, radio y linterna)
export const RADIO = {
  r96_mayday1: { ch: 'mf', who: 'SANTA ILIA · 1996' },
  r96_fisterra1: { ch: 'mf', who: 'FISTERRA RADIO · 1996' },
  r96_grilo1: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_andres1: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_fisterra2: { ch: 'mf', who: 'FISTERRA RADIO · 1996' },
  r96_andres2: { ch: 'mf', who: 'SANTA ILIA · 1996' },
  r96_xose1: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_andres3: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_andres4: { ch: 'mf', who: 'SANTA ILIA · 1996' },
  r96_grilo2: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_andres5: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_xose_off: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_andres_off: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_xose_on: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  r96_andres_on: { ch: 'mf', who: 'SANTA ILIA · 1996', far: true },
  vhf_salv1: { ch: 'vhf', who: 'SALVAMENTO FISTERRA · canal 16' },
  vhf_maree1: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_off: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree2: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_wrong_red: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_wrong_white: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_ok: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_safe: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_declined: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
  vhf_maree_again: { ch: 'vhf', who: 'VELERO MARÉE · canal 16' },
};

// Llamada de Ramón: segmentos. Máscaras cooperativas: con N jugadores, el jugador i oye los segmentos cuyo índice está en MASKS[N][i]
export const CALL = {
  caller: 'Faro Cabo Néboa',
  number: 'fijo · 981 ·· ·· 96',
  segs: ['call_r01', 'call_r02', 'call_r03', 'call_r04', 'call_r05', 'call_r06', 'call_r07', 'call_r08', 'call_r09', 'call_r10', 'call_r11', 'call_r12', 'call_r13', 'call_r14'],
  gapMs: 650,
};
export const CALL_MASKS = {
  1: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]],
  2: [[0, 1, 3, 5, 7, 9, 11, 13], [0, 2, 4, 6, 7, 8, 10, 12]],
  3: [[0, 1, 4, 7, 10, 13], [2, 5, 7, 8, 11, 12], [0, 3, 6, 9, 12, 13]],
  4: [[0, 1, 5, 9, 13], [2, 6, 7, 10], [3, 7, 8, 11], [4, 8, 12, 13]],
};

export const NARRATION = {
  grilo: { solo: { t: 'Grilo. Hace treinta años que nadie te llama así.', vo: 'n_grilo_s' }, coop: { t: 'Grilo. Hace treinta años que nadie llamaba así a {HOST}.', vo: 'n_grilo_c' } },
  lampOff: 'En la radio, alguien grita que el faro se ha apagado. El faro de 1996. El tuyo.',
  cross: 'El cruce cae a menos de una milla de la Laxe das Viúvas. El Santa Ilia no está donde cree: va derecho al bajo.',
  page: { solo: { t: 'La respiración en el teléfono de Ramón eras tú. Y la voz de las 23:52, también.', vo: 'n_page_s' }, coop: { t: 'La respiración en el teléfono de Ramón era la de {HOST}. Y la voz de las 23:52, también.', vo: 'n_page_c' } },
  surge: {
    solo: { t: '23:47. El mar ya entra por la puerta de abajo. Y las dos noches empiezan a tocarse: cuanto más se acerquen las 23:52, menos sabrás cuál de las dos estás viendo.', vo: 'n_blur_s' },
    coop: { t: '23:47. El mar ya entra por la puerta de abajo. Y las dos noches empiezan a tocarse: cuanto más se acerquen las 23:52, menos sabréis cuál de las dos estáis viendo.', vo: 'n_blur_c' },
  },
};

// Objetivos (se muestran en el HUD)
export const OBJECTIVES = {
  power: 'Da corriente a la sala de radio',
  tune: 'Averigua qué está escuchando la vieja radio',
  noise: 'Limpia la señal de onda media',
  call: 'Contesta el teléfono',
  cross: 'Sitúa al Santa Ilia en la carta',
  maree: 'Responde al velero Marée (canal 16)',
  page: 'Encuentra la hoja arrancada del libro de guardia',
  decide: 'Antes de las 23:52: o luz, o voz',
};

// Pistas progresivas por objetivo: [orientación, ayuda concreta, solución]
export const HINTS = {
  power: [
    'La sala está a oscuras porque su circuito está cortado.',
    'Busca el cuadro gris de diferenciales junto a la escalera.',
    'Sube el diferencial «SALA DE RADIO» en el cuadro de la sala de radio.',
  ],
  tune: [
    'El recorte de periódico del archivo cuenta por dónde pidió auxilio el Santa Ilia.',
    'Pidió auxilio «de viva voz» en onda media. La tarjeta de frecuencias distingue la voz del Morse, y su pie dice qué antena usar.',
    'Receptor: banda MF, antena 2 (hilo largo) y sintoniza 2182,0 kHz.',
  ],
  noise: [
    'El ruido no es aleatorio: llega en ráfagas con un ritmo. ¿Qué más en este faro tiene ese ritmo?',
    'El manual del archivo explica de dónde viene y cómo se suprime. Necesitas la característica del faro de Néboa: el Libro de Faros, la linterna o la propia radio te la dan.',
    'Supresor encendido con PULSOS 3 y PERÍODO 15 s (GpD(3) B 15s). La otra vía es apagar la linterna y pulsar ENGANCHAR, con sus consecuencias.',
  ],
  call: [
    'Tu móvil está sonando. Desliza para contestar.',
    'Si colgaste, la llamada quedó como mensaje de voz en tu cuaderno.',
    'Contesta o abre el mensaje de voz desde el cuaderno.',
  ],
  cross: [
    'Dos personas te han dicho, sin saberlo, dónde está el Santa Ilia: una por teléfono y otra por la radio.',
    'Ramón los ve desde la galería del faro en una dirección. Fisterra los sitúa en otra dirección desde Punta Insua. Traza las dos demoras en la carta.',
    'En la carta: demora 230° desde Cabo Néboa y 205° desde Punta Insua. Se cruzan junto a la Laxe das Viúvas.',
  ],
  maree: [
    'El velero describe tres luces. El Libro de Faros dice qué es cada una.',
    'La roja fija no es un puerto: es la torreta del Monte Facho, encima de la Laxe. En la carta, el fondeadero está entre dos faros.',
    'Peligro: la roja fija. Refugio: entre las dos luces blancas (Enseada da Lagoa).',
  ],
  page: [
    'Ramón escribió a la Comandancia. Su carta está en el expediente del archivador.',
    'La carta dice dónde dejó la hoja: «con la luz que no depende de nada». El manual de la estación usa esa misma frase para algo.',
    'La lámpara de reserva de queroseno. En la linterna, abre la caja de la reserva y busca en el doble fondo.',
  ],
  decide: [
    'La hoja de Ramón explica qué pasa a las 23:52 y por qué. El conmutador está detrás de la tapa del cuadro de baterías.',
    'LUZ: relojería ajustada y reserva de queroseno encendida. VOZ: transmisor caldeado y sintonizado y un mensaje con datos correctos. Después, la palanca.',
    'LUZ: engranajes 1:3 (10→30, 15→45 o 20→60) para 4 v/min y queroseno a 2 kg/cm², precalentado, válvula y encender. VOZ: caldeo, sintonía al mínimo de placa, carga al máximo, y un mensaje: «evitad la roja fija, rumbo 280» o la posición de la Laxe das Viúvas.',
  ],
};

// Finales
export const ENDINGS = {
  // beats: [voz del narrador, texto]; el texto puede llevar el rumbo o la posición exactos
  luz: {
    title: 'La luz que no habla',
    beats: [
      ['n_luz_1', '23:52. El mar revienta la puerta de abajo. Las baterías chisporrotean… y mueren.'],
      ['n_luz_2', 'Arriba, la llama de queroseno no tiembla. La relojería cuenta: uno, dos, tres… y quince.'],
      ['n_luz_3', 'Nadie transmite nada. El faro solo hace lo que sabe hacer: alumbrar.'],
    ],
    message: 'Un faro no habla. Alumbra. A veces, salvar a los tuyos es seguir haciendo lo correcto por quien no conoces.',
    msgVo: 'n_msg_luz',
  },
  adv: {
    title: 'Tu voz',
    beats: [
      ['n_voz_1', '23:52. La palanca baja. El faro se apaga en las dos noches.'],
      ['n_adv_2', 'Una voz desde Cabo Néboa llama al Santa Ilia: «No sigáis la luz roja fija: debajo está la Laxe. Ganad mar al {HDG}. El faro volverá».'],
      ['n_voz_3', 'Y a esa voz, sin querer, se le escapa: «Ramón… perdóname».'],
    ],
    message: 'Cambiaste el pasado con tu voz. Pero toda luz que apagas se apaga para alguien. Y quien cambia una noche cambia todas las que vienen después.',
    msgVo: 'n_msg_adv',
  },
  resc: {
    title: 'La posición',
    beats: [
      ['n_voz_1', '23:52. La palanca baja. El faro se apaga en las dos noches.'],
      ['n_resc_2', 'Una voz desde Cabo Néboa da a Fisterra Radio la posición exacta de la Laxe das Viúvas: {POS}. «Envíen el helicóptero. Ya».'],
      ['n_voz_3', 'Y a esa voz, sin querer, se le escapa: «Ramón… perdóname».'],
    ],
    message: 'Salvaste a los tuyos sin borrar quién eres. Pero la verdad tiene un precio: alguien cargó con tu oscuridad. Y esta vez sabes quién.',
    msgVo: 'n_msg_resc',
  },
  fail: {
    title: 'La tormenta decide',
    beats: [
      ['n_fail_1', '23:52. El mar entra en la sala de baterías. Chispas. Oscuridad.'],
      ['n_fail_2', 'Arriba, la linterna se apaga. En las dos noches.'],
    ],
    message: 'No elegir también es elegir. Esta noche volverá a repetirse… hasta que alguien decida.',
    msgVo: 'n_msg_fail',
  },
};


export const MAREE_OUTCOME = {
  helped: ['n_maree_helped', 'En la Enseada da Lagoa, el Marée sigue fondeado. Léo duerme. Camille escribe en su cuaderno: «Una voz nos guio».'],
  luzSafe: ['n_maree_luzSafe', 'El Marée vio la luz a tiempo y viró. Camille nunca sabrá lo cerca que estuvo de la Laxe.'],
  dark: ['n_maree_dark', 'Durante tres minutos, el Marée navegó a ciegas. Encalló en las piedras del Facho. Al amanecer, Salvamento rescató a Camille y a Léo, heridos. El velero, no.'],
  darkWorse: ['n_maree_darkWorse', 'Durante tres minutos, el Marée navegó a ciegas. Al amanecer, Salvamento encontró el velero volcado en la Laxe. Siguen buscando.'],
};

// Epílogo narrado: [voz, texto] o { solo: [...], coop: [...] } cuando cambia la persona
export const EPILOGUE = {
  luz: [['n_epi_page', 'Amanece. La hoja de Ramón ha cambiado.'], ['n_epi_luz_2', 'Vibra un móvil. En la pantalla, un nombre que llevaba treinta años sin llamar: «Papá».']],
  adv: [['n_epi_page', 'Amanece. La hoja de Ramón ha cambiado.'], { solo: ['n_epi_adv_2s', 'En tu mochila ya no está el dibujo de Lúa. Intentas recordar su cara… y no puedes.'], coop: ['n_epi_adv_2c', 'En la mochila de Grilo ya no está el dibujo de Lúa. Grilo intenta recordar su cara… y no puede.'] }],
  resc: [['n_epi_resc_1', 'Amanece. El dibujo de Lúa sigue en la mochila.'], ['n_epi_resc_2', 'Y en el móvil hay un número que no estaba: «Papá».'], { solo: ['n_epi_resc_3s', 'A Ramón volvieron a culparle del apagón. Tú sabes de quién fue.'], coop: ['n_epi_resc_3c', 'A Ramón volvieron a culparle del apagón. Vosotros sabéis de quién fue.'] }],
  fail: [['n_epi_fail', 'Amanece. En el corcho del archivo, el recorte sigue en su sitio: cinco desaparecidos… y un niño.']],
};

