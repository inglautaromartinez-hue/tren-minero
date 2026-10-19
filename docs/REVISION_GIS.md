# Revisión independiente de geometrías y topografía

Fecha: 19/10/2026. Revisor: subagente de revisión GIS de esta sesión. Esta es una revisión de software y consistencia de fuentes; no constituye intervención de un profesional acreditado ni aprobación de un proyecto ferroviario.

## Alcance y evidencia

Se inspeccionaron `scripts/prepare_routes.py`, el KML original `TRAZAS.kml` y los datos derivados de `public/data`. El SHA-256 del KML se conserva en el manifiesto. Las fuentes originales no se modificaron. Se verificaron selección de ramales, recortes, proximidad de extremos, medición de longitudes y método de superficie. No se verificó en terreno el eje, el dominio, el estado operativo, la rasante ni las condiciones geotécnicas.

El archivo tiene 6.744 placemarks y una extensa base ferroviaria ajena a los itinerarios seleccionados. Se extrajeron **11 tramos**, agrupados en tres propuestas. No se incorporó toda la red azul.

| Propuesta | Tramos | Longitud geodésica WGS84 | Corredor de estudio disuelto |
|---|---:|---:|---:|
| T1 roja | 4 | 656,495 km | 13.105,836 ha |
| T2 naranja | 2 | 327,300 km | 6.551,127 ha |
| T3 azul | 5 | 489,417 km | 9.768,350 ha |

Son longitudes de las geometrías seleccionadas, sin sumar enlaces inexistentes. Las superficies representan el corredor nominal de ±100 m y no superficie legal de expropiación ni afectación parcelaria calculada.

## Selección de la propuesta azul

El trazado de Lencinas se recorta en el empalme norte, próximo a la latitud −34,48312. Desde allí se utiliza **el comienzo de Div 50**, de 11,6468 km, hasta Div 47 en Monte Comán. Div 47 se recorta en el empalme con Div 48 en Pedro Vargas: incluye Rodolfo Iselín y excluye la continuación a San Rafael. Div 48 se recorta al inicio de la línea Malargüe–Bardas Blancas. No se modificaron las geometrías para hacer coincidir sus extremos.

| Tramo T3 | Longitud |
|---|---:|
| Lencinas–empalme norte | 135,3420 km |
| Empalme norte–Monte Comán, comienzo de Div 50 | 11,6468 km |
| Monte Comán–Iselín–Pedro Vargas | 68,9847 km |
| Pedro Vargas–Malargüe | 179,7900 km |
| Malargüe–Bardas Blancas | 93,6531 km |

Las estaciones de la base son referencias: no son vértices obligatorios ni pruebas de estado operativo. El eje seleccionado pasa a unos 2,1 m del punto de referencia de Iselín.

## Continuidad y huecos

Se estableció una tolerancia explícita de **1 m**, medida geodésicamente entre extremos consecutivos. `topology_status` sólo evalúa estos empalmes. `complete_itinerary=false` y `railway_design_status=not_verified` se mantienen para las tres propuestas, porque la proximidad geométrica no demuestra integridad documental ni viabilidad del diseño.

- T1: huecos de 3.836,645 m en Colonia Alvear, 25.399,256 m entre el recorte a Carmensa y RP 190, y 36,757 m entre las líneas rojas. Estado `disconnected`.
- T2: hueco de 173,405 m. Estado `disconnected`. El tramo principal tiene sólo 70 vértices, incluyendo una arista de más de 45 km; su geometría es aproximada.
- T3: huecos de 0,492; 0,298; 0,655 y 0,610 m. Estado `connected_within_tolerance`; se conservan las separaciones originales.

T1 incluye el ramal desde Realicó y sectores externos a Mendoza. Un parcelario provincial no cubre el itinerario completo. Las propuestas tienen extremos y funciones distintos; estos totales no sustentan por sí solos una clasificación de alternativa óptima.

## Corrección de áreas y proyección

La versión inspeccionada inicialmente usaba área plana AEQD pese a presentarse como geodésica. Se corrigió el cálculo:

1. Buffer plano de 100 m, extremos redondos, 16 segmentos por cuadrante, en AEQD centrada en −35,5; −67,5, WGS84.
2. Unión espacial por propuesta para evitar doble conteo de solapes.
3. Densificación del contorno a un máximo de 500 m antes de transformarlo a WGS84: así una larga arista proyectada no se reemplaza por una geodésica distinta al medir.
4. Área elipsoidal con `pyproj.Geod`: exteriores antihorarios, agujeros horarios, área absoluta por polígono y suma de polígonos. Los agujeros se restan.
5. La geometría simplificada a 2 m se usa para visualizar; no para obtener las hectáreas.

El buffer conserva una distancia **nominal en la proyección**, no una anchura geodésica exacta en cada posición. La escala principal se muestreó en vértices y cada ≤10 km: máximo 1,000371, aproximadamente 0,0371 % o 3,7 cm sobre 100 m. Es una estimación muestreada de distorsión de proyección, no un límite certificado ni una estimación de precisión posicional del KML. Esta última domina ampliamente esa diferencia. Para delimitaciones legales debe emplearse el sistema y procedimiento de mensura pertinentes.

## Validación ejecutable

`node --test tests/gis.test.mjs` ejecuta controles de:

- cantidad de segmentos, estados de continuidad y conservación de faltantes como `null`;
- magnitudes de longitudes/corredores y geometría naranja aproximada;
- resta de agujeros e invariancia al invertir anillos, además de multipolígonos;
- recálculo de la unión íntegra y estabilidad del área con bordes densificados a 100 m (diferencia <0,001 ha respecto al valor publicado);
- selección sobre el KML original: comienzo de Div 50, paso por Iselín, exclusión de la cola a San Rafael y pertenencia de los recortes a sus líneas originales.

Los controles que usan Python requieren las dependencias de `requirements.txt`. El control de fuente busca `data/source/TRAZAS.kml` o la copia de la sesión en `../upload/TRAZAS.kml`; si ninguna existe se declara omitido, no aprobado.

No se generaron cotas ni pendientes, ni conteos de parcelas o titulares: faltan insumos procesados y verificados. Los perfiles futuros deberán distinguir pendiente del terreno de rasante ferroviaria y registrar cobertura, resolución, datum vertical, NoData y método de muestreo del modelo de elevación.

## Geometría íntegra para el cruce con WFS

Se exportó `public/data/corridors-analysis.geojson`, separado del corredor simplificado de visualización. Contiene las uniones completas, sin simplificación (`tolerance=0`), con contornos densificados a ≤100 m en AEQD antes de transformar a WGS84. Conserva los agujeros y multipolígonos; `area_ha` coincide con la métrica del manifiesto. La densificación agrega vértices sobre el contorno proyectado y no rellena huecos ni modifica el buffer original. Se comprobó equivalencia con la unión íntegra en proyección por diferencia simétrica <0,01 m² y concordancia de área elipsoidal.

El cruce web mediante clipping en longitud/latitud y área WGS84 calculada posteriormente con GeographicLib es una aproximación numérica adecuada para explorar este corredor, siempre que se use esta geometría íntegra, se preserve el orden de anillos y agujeros y no se mida superficie en grados cuadrados. Los lados de la geometría densificada se tratan como segmentos en coordenadas geográficas durante el clipping y como geodésicas cortas al medir su área: son convenciones numéricas diferentes, de efecto pequeño con ese muestreo, pero no una intersección geodésica exacta. Los límites parcelarios WFS pueden contener lados más largos; su interpretación y precisión deben conservarse como limitación de la fuente. Ninguna densificación mejora la exactitud del levantamiento ni de la traza naranja.

La fuente WFS conserva sus identificadores, NC, titular informado y fecha/origen disponibles. Una intersección geométrica identifica **superficie comprendida en el corredor de estudio**, no una expropiación determinada, una certificación dominial ni una nueva delimitación catastral. Un titular informado no acredita por sí solo dominio vigente. Sin cobertura completa, paginación comprobada y tratamiento de errores explícito, el resultado debe declararse parcial y no debe convertir ausencia de respuesta en cero afectación. El parcelario de Mendoza tampoco resuelve el sector interprovincial de T1.

Esta revisión no descargó el WFS completo ni verificó su contenido o su actualidad; validó el insumo geométrico y el alcance del método para integrarlo. La geometría analítica puede cargarse sólo cuando se solicite el análisis, manteniendo el inicio del visor con los archivos livianos de visualización.
