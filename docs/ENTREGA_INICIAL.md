# Entrega inicial · 19/10/2026

## Resultado implementado

Visor Vite/Leaflet con 3 propuestas, 11 tramos, buffer ±100 m, dashboard, comparación, perfiles bajo demanda, consulta WFS pública por área y vista de equipo con 14 perfiles. El procesamiento de intersecciones ocurre en un Web Worker. La pasarela DEM es una función Node limitada a teselas/rangos del COG público.

El código se organiza en una rama y PR. Una integración en GitHub no equivale a despliegue verificado. La conexión Vercel respondió 403 para IDECAM y no hay credencial CLI disponible: el gate de publicación permanece bloqueado hasta comprobar el despliegue.

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
- Navegador, interacción de Web Worker en navegador, móvil, mapa base y función desplegada: **NOT_RUN**. No se afirma revisión visual o extremo a extremo del sitio publicado.

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
- Comprobar interfaz en escritorio/móvil y URL/commit desplegados en Vercel.
