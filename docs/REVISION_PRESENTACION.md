# Revisión de presentación y selección interactiva

Fecha: 2026-10-19. Revisor: rol QA independiente de quienes modifican UI, selección topográfica y presentación de parcelas. Alcance: capturas recibidas, fuentes locales, contratos geométricos y artefacto compilado. No se inició servidor ni navegador alternativo; la interacción de navegador permanece pendiente de verificación.

## Evidencia de partida

Se inspeccionaron las tres capturas aportadas por el usuario:

- `image(20261019-150124).png`: la vista Equipo presenta roles, evidencia de ejecución, nombres de agentes y enlaces a instrucciones/repositorio. Son elementos de organización interna que no aportan al uso del visor.
- `image(20261019-150147).png`: descargas de ejes, ficha, enlace al repositorio y hash del archivo fuente accesibles desde la interfaz.
- `image(20261019-150255).png`: perfil de un tramo sin una delimitación espacial inequívoca de su inicio, fin y extensión en el mapa. La validez parcial de elevaciones se informa numéricamente; la captura no permite comprobar cuál era el tramo consultado.

Estos puntos orientan la corrección; las capturas no muestran el resultado posterior a los cambios.

## Contratos de revisión

Los tests de `tests/presentation.test.mjs` cubren:

1. Marca LAUGIS en HTML y UI, retirada de la vista Equipo y de la importación de configuración interna.
2. Retirada de controles y handlers de descargas/CSV, enlaces al repositorio y hashes internos en el frontend.
3. Controles estáticos usados por el JavaScript presentes en el template o el HTML inicial, evitando fallos de arranque por IDs inexistentes. La existencia del ID no demuestra que un control funcione visualmente.
4. Sobre los ejes reales: T1 se conserva como cuatro cadenas, T2 como dos y T3 como una cadena de cinco segmentos. Ningún empalme de cadena excede un metro. La continuidad geométrica no acredita continuidad física ni operación ferroviaria.
5. Recorte sobre el eje azul entre progresivas 400 y 1.400 m: longitud de 1.000 m con tolerancia de 1 mm; snap de los extremos a sus progresivas con tolerancia de 1 cm; invertir los puntos revierte el mismo eje.
6. A 300 km de progresiva del azul real, corte de selección, muestra longitudinal y centro de la sección transversal coinciden con tolerancia de 1 cm. La nueva implementación usa GeographicLib WGS84 para estas operaciones; la prueba evita mezclar progresivas esféricas y elipsoidales.
7. Recorte real combinado con dos parcelas **sintéticas**: el perfil conserva ambos extremos del tramo; sólo la parcela ubicada dentro de ese recorte aparece en afectación y contorno, excluyendo una situada diez kilómetros más adelante sobre la misma traza. No representa un cruce con catastro real.
8. Después de una compilación reciente, inspección de assets para ausencia de configuración de agentes y procedencia interna; manifiesto de presentación sin hashes; propiedades de ejes depuradas; ausencia del corredor analítico completo en el paquete desplegable.

El control de artefacto se ejecuta explícitamente después de compilar, evitando validar silenciosamente un `dist` anterior:

```bash
npm run build
CHECK_BUILT_PRESENTATION=1 node --test tests/presentation.test.mjs
```

En `npm test` ordinario, anterior al build, ese control de artefacto se omite de forma explícita. Los controles de fuentes y geometría sí se ejecutan.

## Hallazgos y correcciones revisadas

| Hallazgo | Severidad | Resolución observada por inspección |
|---|---|---|
| El handler de `focus-study` se instalaba sin que existiera el control, provocando un error durante `init`. | Alta | Botón agregado; contrato de IDs del HTML/template aprobado. |
| Una consulta cancelada al elegir otro tramo podía dejar botones deshabilitados: el guard de identidad impedía que el `finally` anterior los restableciera. | Media | Restablecimiento explícito de botones, textos, cancelación y debounce al cambiar de estudio. |
| Un error encolado de un worker anterior podía terminar el worker actual por utilizar la referencia global. | Media | Worker local con controles de identidad y revisión antes de aceptar mensajes o errores. |
| La capa de foco parcelario interceptaba clics sobre la traza al quedar por encima de ella sin acciones propias. | Media | Capa visual de foco con `interactive:false`; las capas parcelarias base conservan sus acciones. |
| Un marcador longitudinal removido conservaba su referencia y no reaparecía en el perfil siguiente. | Media | Cursores separados para longitudinal/transversal y limpieza de referencias; el marcado comprueba también que la capa esté presente. |
| Elegir una sección en mapa podía iniciar dos consultas y reutilizar un gráfico de la sección anterior durante la espera. | Media | Apertura del panel sin disparo duplicado; gráfico y estadísticas transversales se limpian al consultar. |
| Múltiples panes con Canvas podían interceptar eventos en el canvas superior aun cuando los elementos dibujados no fueran interactivos, impidiendo alcanzar las trazas de un canvas inferior. | Alta | `preferCanvas:false`: SVG conserva hit-testing por path y deja pasar eventos por la raíz y elementos no interactivos. Confirmado contra el código local de Leaflet; interacción real pendiente de navegador. |

La revisión estática también confirma captura de revisión/identidad para resultados asincrónicos, reinicio de modos de selección, cache con progresivas exactas, SVG con transformación inversa de coordenadas para letterboxing responsive, pointer capture, `touch-action:none`, recorrido del gráfico mediante range y teclado. Mapa y tabla se enlazan por NC; contornos disponibles y superficies intersectadas son capas diferentes. Estas comprobaciones no sustituyen la ejecución de eventos y navegación táctil real.

### Fundamento del cambio de renderer

Se inspeccionó Leaflet 1.9.4 instalado. `Renderer.getRenderer.js` crea un renderer propio por pane y selecciona Canvas cuando `preferCanvas` está habilitado. `Canvas.js` registra los eventos sobre el elemento canvas completo; su `_onClick` busca sólo en las capas de ese renderer y comunica el resultado al mapa. No realiza un segundo hit-test sobre otro canvas situado debajo. Por ello un canvas en el pane `study` (z=440) puede recibir el evento antes que el renderer de las trazas (z=400), aunque no encuentre un path interactivo propio en esa posición.

En `SVG.js`, la raíz se crea con `pointer-events="none"`, y sólo las capas interactivas reciben la clase `leaflet-interactive`. El CSS distribuido con Leaflet deshabilita eventos en los paths por defecto y los habilita para esa clase. El cambio a SVG permite que los paths decorativos del estudio dejen pasar el evento hasta el path interactivo correspondiente. El razonamiento está sustentado por estas fuentes locales, sin simular una prueba de clic de navegador. No se añadió un test que simplemente exigiera el valor literal de `preferCanvas`.

## Exposición de datos y origen

**Quitar botones no convierte el sitio ni el repositorio en privados.** El repositorio sigue siendo público mientras no se compruebe un cambio de visibilidad. Los activos necesarios para representar un mapa web se envían al navegador y pueden inspeccionarse; una geometría visible tampoco queda protegida por retirar su enlace de descarga.

La medida proporcional de esta revisión consiste en retirar la organización interna de los assets y controles de presentación, generar un manifiesto mínimo de publicación y conservar las geometrías necesarias para visualizar los recorridos. Los originales y el registro científico deben conservarse para reproducibilidad en su destino correspondiente. Sanear `dist` no elimina copias previas, historial Git ni archivos originales que permanezcan en un repositorio público.

El cambio de marca identifica al producto como LAUGIS. No cambia quién provee los datos: el endpoint WFS público conserva su URL real y las atribuciones/licencias legítimas de mapas y Copernicus deben mantenerse. No se atribuye el origen catastral a LAUGIS.

La herramienta de GitHub disponible al coordinador no ofrece en este flujo la operación necesaria para cambiar la visibilidad del repositorio. La revisión no da por cumplido ese cambio y no declara confidencialidad total ni control de acceso.

## Verificación pendiente y estado

**Resultado del control ejecutado:** `CHECK_BUILT_PRESENTATION=1 node --test tests/presentation.test.mjs`: **8 pruebas PASS, 0 FAIL y 0 omitidas**. Se revisaron fuentes finales y assets del build disponible del coordinador. La marca, retirada de elementos internos, controles estáticos, geometría de selección y saneamiento de los assets superan los contratos de esta revisión. No se encontró un bloqueante pendiente por inspección en este alcance.

La compilación completa y la suite general se registran por el coordinador para la versión integrada; estos ocho contratos no sustituyen esas verificaciones. No se afirma despliegue remoto ni cambio de visibilidad del repositorio por inspeccionar `dist` local.

La validación de clic/touch, paneles, cursor sobre el mapa, recorrido seleccionado, consulta parcelaria sobre ese mismo recorrido, parcela completa con contorno dorado y afectación verde requiere revisión de la integración final y, para su aspecto visual, un navegador autorizado. Una prueba estática o un fixture geométrico no certifica esa interacción.

**Límite parcelario de la fuente:** una consulta WFS por bbox puede devolver la geometría completa de cada registro que la intersecta, pero no garantiza haber recibido todas las partes de una misma NC si existen otros registros fuera de la extensión consultada. El contorno completo dibujado se refiere a la geometría disponible; no acredita integridad del estado parcelario ni del denominador del porcentaje. La cobertura oficial sigue sin confirmarse.
