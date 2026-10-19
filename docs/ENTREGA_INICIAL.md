# Entrega inicial · 19/10/2026

## Resultado implementado

Visor Vite/Leaflet con 3 propuestas, 11 tramos, buffer ±100 m, dashboard, comparación, perfiles bajo demanda, consulta WFS pública por área y vista de equipo con 14 perfiles. El procesamiento de intersecciones ocurre en un Web Worker. La pasarela DEM es una función Node limitada a teselas/rangos del COG público.

El código se organiza en una rama y PR. Una integración en GitHub no equivale a despliegue verificado. La conexión directa Vercel respondió403 para IDECAM y no hay credencial CLI disponible. La integración GitHub/Vercel sí construyó la rama y `main` en estado Ready. Producción https://tren-minero.vercel.app responde HTTP200 con título y manifiesto correctos, commit de integración3336452. El gate de publicación se acepta con limitaciones; interacción visual pendiente.

## Asignaciones ejecutadas realmente

| Agente | Trabajo | Revisión y evidencia |
|---|---|---|
| Coordinador principal | Análisis de fuentes, frontend, integración y pruebas remotas acotadas | Integra las revisiones; no se declara auditor independiente del frontend |
| estructura_equipo | AGENTS, roles, plan, decisiones y configuración | Validación del contrato de configuración y correspondencia con fuentes |
| revision_topografia | Selección, recortes, CRS, áreas y controles GIS | Hallazgos y pruebas en REVISION_GIS.md; cambios revisados por coordinador |
| parcelas_pipeline | Cliente WFS batch y cruce GIS reproducible | Pruebas sintéticas y regresión remota acotada; no es auditor de su código |
| qa_aplicacion | Revisión independiente del frontend, geometría web y DEM | REVISION_APLICACION.md y pruebas; también implementó el cliente WFS, revisado por coordinador |

Minería, logística, ferroviaria, gestión predial, geología, hidrología y economía tienen perfiles y entregables definidos, pero sus estudios no se ejecutaron ni se aprobaron. No hay un sistema de agentes persistentes en el visor.

## Comprobaciones

- `npm test`: 37 pruebas Node aprobadas, sin omisiones en el entorno de adjuntos. Incluye GIS, NoData, cancelación, intersección, duplicados, privacidad, API DEM y WFS simulado.
- `python -m unittest discover -s tests -p 'test_*.py'`: 23 pruebas aprobadas (11 parcelarias + 12 WFS), incluida regresión de falso cero del servicio.
- `npm run build`: aprobado, datos pesados y módulos de elevación/cruce cargados bajo demanda.
- WFS real: GetCapabilities, 5 DescribeFeatureType y GetFeature acotado con salida EPSG:4326. NC textual disponible, nombre del titular ausente. No se solicitaron CUIT ni nombres en la consulta del cliente integrado.
- Muestra real acotada: `docs/WFS_COMPROBACION_PUBLICA.json`. Una candidata y una intersección azul; no es el conteo total del recorrido.
- Contraste del mismo sector: cliente web numérico 46.177,040016 m²; pipeline Python 46.177,040015 m². Es una comprobación de un caso, no validación exhaustiva del parcelario o del método.
- Copernicus real: en longitud −68,008055 / latitud −34,642143 la lectura del píxel produjo 551,545898 m; lectura de la función DEM en proceso Node devolvió HTTP206 y bytes0–2047 coherentes. No acredita precisión altimétrica de campo ni despliegue de la función.
- Función DEM en producción: HTTP206, Content-Range bytes0–2047/38176492 y cuerpo TIFF de2048bytes comprobados.
- Navegador, interacción de Web Worker en navegador, móvil, mapa base: **NOT_RUN**. La función desplegada se comprueba por HTTP por separado, sin afirmar interacción de navegador. No se afirma revisión visual o extremo a extremo del sitio publicado.

## Hallazgos importantes resueltos

1. El KML incluye 6.744 elementos nacionales: se seleccionaron únicamente los ramales documentados.
2. El azul necesita el tramo norte de Div50 para llegar a Monte Comán; se excluye el desvío hacia San Rafael.
3. Áreas corregidas a WGS84 elipsoidal; corredor íntegro separado del derivado visual simplificado.
4. Resultados parciales y rutas ausentes conservan estado desconocido; no se convierten en ceros concluyentes.
5. Normal transversal corregida: izquierda negativa/derecha positiva según avance.
6. Cancelación, parámetros de consulta, validación de polígonos, NC y rangos DEM controlados.
7. Cobertura de NC superpuestas se mide por unión geométrica, conservando por separado la superficie por parcela.
8. GeoServer WFS1.0 devolvió hits XML cero para un sector con una entidad. El batch ahora confronta el total de GetFeature GeoJSON con maxFeatures1; regresión comprobada con la misma consulta real.

## Pendientes técnicos y profesionales

- Revisar y completar enlaces de T1/T2 sin inventar conexiones; afinar el eje naranja.
- Consulta parcelaria integral por corredores con cobertura jurisdiccional documentada; el WFS provincial no cubre el tramo interprovincial de T1.
- Para nombres de titulares, obtener una fuente pertinente y condiciones de acceso/uso; no inferirlos de CUIT ni de geometría.
- Contrastar elevaciones y restricciones ferroviarias con datos de mayor detalle, infraestructura y terreno.
- Definir escenarios de servicio, nodos/demanda minera, restricciones, obras, costos con fuente y criterios de comparación.
- Comprobar interfaz e interacción completa en escritorio/móvil; URL, título, manifiesto y estado Ready ya comprobados por HTTP/GitHub.

## Actualización LAUGIS y selección vinculada · 19/10/2026

El PM integró cuatro subagentes reales: estructura/equipo, pipeline parcelario/buffer, selección/topografía y QA independiente. La estructura se conserva como organización interna y ya no forma parte de la UI. La presentación adopta LAUGIS, retira exportaciones, enlaces internos y hashes; el build sanea manifiesto/propiedades y excluye el corredor analítico canónico de dist. El repositorio continúa público: esa medida no garantiza privacidad ni revoca copias previas.

La nueva UI selecciona inicio y fin en una cadena continua del mapa, resalta su eje y extremos y permite abrir pestañas longitudinal, transversal y parcelaria. Los perfiles enlazan su cursor con un marcador sobre el satélite; la sección transversal puede elegirse sobre el eje. Consulta WFS y superficies se calculan contra el buffer del tramo, con contornos disponibles y afectación diferenciados, y enlace mapa/tabla por NC. Las consultas se limitan al área visible.

Validación final local sobre esta implementación: `npm run build && CHECK_BUILT_PRESENTATION=1 npm test`: **64 PASS, 0 FAIL, 0 omitidas**; `python -m unittest discover -s tests -p 'test_*.py'`: **23 PASS**. Revisión independiente de selección/buffer/perfiles: 23 controles PASS y comparación de dos ejes reales contra Python AEQD, registrada con WARN de no equivalencia exacta en REVISION_SELECCION.md. Revisión de presentación: 8 contratos PASS. Estos conteos se solapan y no se suman como pruebas independientes.

Verificación de interacción visual/móvil en navegador: **NOT_RUN**; no se la presenta como realizada. Publicación de esta actualización: pendiente de comprobación remota al momento de este registro; el resultado se añadirá luego de integrar y consultar producción.

### Comprobación remota de la actualización

PR3 integrada como `f306298296f3625ed26e174f3e53225df558590d`, con estado Vercel success para la rama revisada y para la integración. Producción `https://tren-minero.vercel.app` comprobada: HTTP200, título LAUGIS, asset `/assets/index-DZH6qnOp.js` igual al build local, tres propuestas y manifiesto sólo de presentación, propiedades de ejes depuradas, corredor analítico completo HTTP404 y sin controles internos/exportaciones en el bundle. `/api/dem` devolvió HTTP206, Content-Range `bytes 0-15/38176492` y exactamente 16 bytes para una tesela Copernicus.

Smoke de consulta WFS real ejecutado a las 15:22:44 UTC del 19/10/2026: bbox acotado en San Rafael y buffer de un recorte azul de 2.000 m; una candidata, una NC intersectada y un contorno disponible. Corredor interactivo 43,13654294 ha; intersección 46.177,040016 m². El servidor respondió además Access-Control-Allow-Origin `*` ante Origin de producción. Es una comprobación CLI de consulta y cruce, no del navegador ni de cobertura integral. No se guardó la respuesta parcelaria ni datos nominales en el repositorio.

El repositorio continúa público; la conexión disponible no ofrece la operación para cambiar su visibilidad. No se da por realizada privacidad a nivel de repositorio. Navegador/celular: NOT_RUN.
