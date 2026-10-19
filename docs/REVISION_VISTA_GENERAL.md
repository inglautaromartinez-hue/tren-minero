# Revisión independiente de vista general por alternativa

Fecha: 2026-10-19. Rol: QA independiente de la implementación de UI y topografía. Archivos asignados a este rol: este registro y `tests/route-overview-ui.test.mjs`. No se inicia navegador, servidor de desarrollo ni consultas remotas desde esta revisión.

## Contrato del cambio

Seleccionar una propuesta desde su tarjeta o el mapa debe activar **la alternativa entera** y dejar visible su análisis general. En T1 y T2, «entera» incluye todas las partes disponibles y conserva sus huecos; no implica un itinerario ferroviario completo o conectado. El ajuste de inicio y fin es una acción posterior que conserva la alternativa activa; volver al recorrido completo debe restablecer todas sus partes.

Los controles de esta revisión se orientan a estos riesgos:

- Elegir una tarjeta no puede limitarse a desplazar el mapa ni seleccionar solamente la primera cadena.
- Las partes desconectadas se conservan como geometría multipartita; no se crea un segmento artificial entre extremos separados.
- Estaciones, perfiles y pendientes conservan la pertenencia a cada parte. Una discontinuidad no produce una pendiente ni un trazo continuo en el gráfico.
- El cambio de propuesta o selección invalida consultas, workers, gráficos y resultados anteriores. La clave del perfil general no puede reutilizarse como si representara un recorte personalizado.
- Los perfiles precalculados, cuando existan, deben coincidir con la propuesta, geometría, muestreo y modelo declarados. Falta de datos o error sigue siendo un estado explícito.
- El parcelario conserva el alcance de área visible y cobertura desconocida. No se inventan totales catastrales de toda la propuesta porque su perfil general esté preparado.
- El producto conserva marca LAUGIS, separación de organización interna, ausencia de exportaciones y limitaciones de exposición previamente documentadas.

## Insumos y método de prueba

Se usan las geometrías reales de `public/data/routes.geojson` para comprobar organización y progresivas, y fixtures geométricos controlados cuando sea necesario. Ninguna parcela sintética se presenta como resultado catastral real. La inspección de callbacks y bindings de UI no certifica interacción en navegador.

Interfaz topográfica acordada: `createRouteStudy`, `studyParts`, `studyStations`, `sectionAt` y `snapStudy`, del módulo `src/route-study.mjs`. La evaluación comprobará entradas y salidas del contrato, sin exigir que la implementación tenga una forma determinada.

## Resultados ejecutados

`tests/route-overview-ui.test.mjs`: **8/8 PASS**. Última ejecución independiente con `CHECK_BUILT_PRESENTATION=1`, junto con `tests/presentation.test.mjs`: **16/16 PASS, sin fallos ni omisiones**. Se revisó el paquete después del build final del coordinador.

| Control | Evidencia | Estado |
|---|---|---|
| Alternativa completa | T1 conserva cuatro partes, T2 dos y T3 una cadena continua de cinco segmentos originales; coordenadas idénticas a sus cadenas de origen. Longitud como suma de partes, sin sumar huecos entre ellas. | PASS |
| Fronteras de partes | Ambos extremos de cada discontinuidad conservan sus coordenadas y la misma progresiva acumulada; `break_before` identifica la interrupción y no se obtiene pendiente entre sus extremos. | PASS |
| Transversal y snap | En una progresiva compartida por dos partes desconectadas, `partId` determina el extremo real elegido. Snap conserva parte, progresiva local y acumulada. | PASS |
| Tarjeta y clic de mapa | Funciones reales `events`, `activateRoute`, `handleRouteClick` y `chooseStudy` ejecutadas en VM aislada: tarjeta T1 activa sus cuatro partes y filtra las demás; clic de T2 activa sus dos partes. | PASS con alcance de unidad |
| Ajuste y restablecimiento | Ajustar puntos sobre T1 conserva la alternativa activa; otra alternativa o cadena no puede completar el rango. Volver a completa restablece las cuatro partes de T1. | PASS con alcance de unidad |
| Perfiles preparados | Muestras comparadas punto por punto contra `studyStations`: pertenencia a parte y quiebres coincidentes, diferencia de progresiva menor a 1 mm y diferencia de posición menor a 1 cm. Longitud acumulada y sección central corresponden al estudio actual. | PASS |
| Assets de publicación | JSON desplegable conserva perfiles y secciones sin alterar; sólo incluye los campos previstos de presentación, sin metadatos de reanudación/procesamiento, hashes o agentes. Controles anteriores de marca, retirada de exportaciones y configuración interna siguen aprobados. | PASS |

Las pruebas VM usan dobles explícitos para renderizado, efectos de mapa y `applyStudy`; comprueban el binding y la transición de selección, **no ejecutan Leaflet, DOM, workers ni eventos táctiles de navegador**. La inspección de esas funciones permite verificar el contrato sin presentar el resultado como una prueba completa de UI.

## Archivo real de elevaciones revisado

Se leyó `public/data/overviews.json` finalizado el 2026-10-19 a las 15:31:20 UTC, junto con `docs/REVISION_OVERVIEWS.md`. Declara Copernicus GLO-30, muestreo de 1.000 m, estado `complete` y **1.510/1.510 cotas disponibles**, sin ausentes:

| Alternativa | Partes | Longitud del estudio (m) | Muestras longitudinales | Transversales | Cotas disponibles |
|---|---:|---:|---:|---:|---:|
| T1 | 4 | 656.494,963 | 662 | 9 | 671 |
| T2 | 2 | 327.300,162 | 330 | 9 | 339 |
| T3 | 1 | 489.418,661 | 491 | 9 | 500 |

La revisión de generación registra 1.504 cotas reales reutilizadas de una corrida compatible y seis completadas en la última ejecución. QA verificó la correspondencia geométrica, estructura, cantidades, estado y representación explícita de ausentes como `null`. No volvió a descargar los COG ni comparó alturas con levantamiento de campo. La tolerancia centimétrica indicada es un control numérico de correspondencia entre posiciones, **no precisión del modelo de elevación ni de la traza**. El archivo contiene superficie DSM; no una rasante ferroviaria.

## Revisión de regresión asíncrona y alcance

Por inspección de la integración final:

- `applyStudy` cancela solicitudes y workers, aumenta revisión y limpia gráficos, cursores, límites, afectaciones y métricas anteriores.
- La clave de perfil de alternativa completa (`route:T1`, etc.) es distinta de la de un recorte personalizado. Perfiles estáticos sólo se eligen para alternativa completa y paso compatible; resultados tardíos comprueban revisión e identidad antes de mostrarse.
- Highlights se dibujan por parte; el aplanamiento de coordenadas se utiliza para encuadre, no para crear una vía entre huecos. El buffer multipartito construye partes por separado y disuelve sus superficies.
- El gráfico reinicia el path en `break_before`; las pendientes descartan cambios de parte. La selección de sección conserva `part_id` en extremos ambiguos.
- Se conservan SVG por path, transformación inversa de coordenadas responsive, captura de puntero, range y teclado. Su funcionamiento real en touch sigue sin ejecutarse en navegador.
- La consulta parcelaria mantiene su extensión visible y cobertura desconocida. Preparar el perfil general no crea un conteo completo de parcelas ni transforma ausencia de cobertura en cero afectaciones.

**Estado final:** sin bloqueantes pendientes por las pruebas e inspección de este alcance. Clic/touch visual, experiencia de carga y navegación real: **NOT_RUN**. La suite general y el build integrado los registra el coordinador; la presente revisión no anuncia disponibilidad remota de la nueva versión.

La retirada de controles y metadatos del paquete no transforma el repositorio en privado ni evita inspeccionar los datos necesarios del mapa. Continúan vigentes las limitaciones de exposición documentadas en `docs/REVISION_PRESENTACION.md`; no se acreditó un cambio de visibilidad del repositorio.
