# Revisión independiente GIS del censo parcelario

Fecha: 19/10/2026. Revisión de consistencia de datos y software por subagente GIS. No es certificación profesional, informe dominial, determinación de expropiación ni declaración de cobertura catastral oficial.

## Resultado: PASS con límites de fuente explícitos

Se revisaron el plan y los datos efectivamente descargados, los derivados publicados y el helper de recortes. Se completaron **255/255 consultas**, sin errores ni conflictos entre entidades repetidas: 73 en T1, 44 en T2 y 138 en T3. Los resultados de 100 m son:

| Propuesta | NC únicas afectadas | Suma por NC, m² | Unión espacial cubierta, m² | Porción del corredor cubierta por geometrías recibidas |
|---|---:|---:|---:|---:|
| T1 | 957 | 52.986.619,751 | 51.987.739,409 | 39,664416 % |
| T2 | 60 | 39.533.530,268 | 39.209.556,356 | 59,847944 % |
| T3 | 1.060 | 55.328.479,551 | 54.634.269,358 | 55,925963 % |

La suma de superficies por NC difiere de la unión espacial porque distintas geometrías parcelarias se superponen en la fuente. Los excesos son 998.880,342; 323.973,912 y 694.210,193 m², respectivamente. No se los sumó dos veces en el indicador de cobertura espacial. No corresponde sumar las tres alternativas como si fueran afectaciones independientes de un mismo proyecto aprobado.

## Cobertura del plan de consultas

El plan contiene 152 piezas de hasta 10 km, sin conectar huecos, con márgenes geodésicos de 200 m y muestreo de envolventes cada 500 m. Se revisaron las cinco capas publicadas: General Alvear, La Paz, Malargüe, Santa Rosa y San Rafael.

Se verificó espacialmente que la unión de los bbox de cada propuesta contiene **todo su soporte de 125 m**, sin superficie omitida. Para cada una de las cinco capas se comprobó además que `(soporte ∩ extensión publicada de la capa) − unión de sus consultas` es vacío. Esto prueba cobertura del plan dentro de las extensiones publicadas, no integridad oficial de la base catastral.

En T1 hay aproximadamente 5.375,219 ha del soporte de 125 m fuera de la unión de esas cinco extensiones. Esa medida no es una delimitación oficial de Mendoza: identifica un sector que las capas consultadas no pueden resolver. `coverage_status` permanece `unknown` en todas las propuestas. Superficie sin geometría recibida no significa tierra sin propietario ni afectación nula.

Se aceptó la estrategia de una respuesta autocontenida cuando `totalFeatures` es entero verificable, coincide con las entidades devueltas y no supera el tamaño de página. Para respuestas paginadas se conservan controles de totales e identificadores. Las candidatas adicionales producidas por reproyectar envolventes entre EPSG:4326 y EPSG:22172 se conservan y se recortan geométricamente después; no se excluyen por superar el bbox geográfico original.

## Verificación independiente de geometrías y áreas

Se reprocesaron con Shapely y `pyproj.Geod` los snapshots de apoyo contra los buffers de 100 m. Los tres conteos coincidieron exactamente. Las diferencias respecto al índice fueron menores de 0,001 m² para las sumas por NC y menores de 0,28 m² para las uniones cubiertas. Estas pequeñas diferencias derivan del orden numérico y de los vértices añadidos al repetir intersecciones. Los balances `corredor − unión cubierta = superficie residual` coincidieron dentro de 0,28 m².

Se recalculó el denominador para **todas las 2.636 NC de apoyo por alternativa** —1.197 en T1, 63 en T2 y 1.376 en T3— a partir de las parcelas originales privadas, disueltas por NC. La diferencia máxima con `parcel_m2` publicado fue 0,0005 m², consistente con el redondeo a tres decimales. No se utilizó el área del soporte como denominador. Las NC conservaron su representación textual y no hubo duplicados dentro de una alternativa.

Los tres registros fuente inválidos de T3 se verificaron individualmente: cada NC tiene un único componente y **su envolvente completa es disjunta tanto del buffer de 100 m como del apoyo de 125 m**. Por ello su contribución a estos cruces es demostrablemente nula sin reparar geometrías. Se mantuvieron como tres advertencias de fuente no contribuyentes; no existen exclusiones analíticas dentro del soporte ni errores ocultos detrás de un cero.

## Derivados y privacidad

- `parcel-analysis-T*.geojson`: intersecciones efectivas de 100 m, preparadas para cargar inmediatamente la alternativa completa.
- `parcel-census-T*.geojson`: apoyo de 125 m, con área original parcelaria numérica y geometría de soporte para recortes posteriores. Su superficie no se presenta como afectación de 100 m.
- `parcel-outlines-T*.geojson`: dibujos generalizados de contornos, con atributos limitados a NC y marcados como visualización. Los conteos son 957, 60 y 1.060. No se utilizan en cálculos ni como denominadores.

No se publican respuestas WFS originales ni geometrías originales completas de análisis. Los contornos visibles son generalizados; los snapshots analíticos contienen sólo intersecciones. No se incorporaron titulares ni CUIT. El nombre de un propietario o la vigencia de un derecho no pueden inferirse de estas geometrías.

## Recortes interactivos

`clipSnapshot` conserva `parcel_m2`, vuelve a unir componentes de la misma NC, recorta contra el buffer efectivo y calcula áreas WGS84. Verifica que el corredor seleccionado esté dentro del soporte consultado: la diferencia debe ser menor de 0,01 m². Si falta soporte, falta constancia del plan, aparecen geometrías inválidas o se contradicen denominadores, el análisis se marca incompleto y el porcentaje desconocido queda `null`.

Se comprobaron 21 recortes reales de 1 km, al inicio, mitad y final de las siete cadenas: ninguno salió del soporte de 125 m. Después de optimizar por bbox y disolución en lotes de 32, se cronometraron otros siete recortes centrales: entre 5 y 78 ms de cálculo en este entorno, sin advertencias. Es una observación de rendimiento local, no garantía para todos los equipos o longitudes.

Una comprobación Node independiente de T2 completa coincidió en las 60 NC; la suma difirió 0,0004 m² y la unión 0,641 m² frente al índice Python. La primera unión iterativa de T1 produjo errores de anillos al agregar muchos polígonos; se sustituyó por unión por lotes y se incorporó estado explícito: si falla una unión, su área queda desconocida, nunca se presenta una unión parcial como completa. Las alternativas completas cargan el derivado de 100 m ya verificado; el recálculo en navegador se reserva para selecciones.

`tests/parcel-snapshot.test.mjs` aprobó diez controles, sin omisiones, de denominadores, duplicados, agujeros, lotes, soporte, ausencia de información y protección de atributos. No se modificaron los datos del agente productor durante esta revisión.

## Limitaciones

Estos resultados describen intersecciones con el corredor de estudio a partir del servicio público disponible. La fecha de actualización catastral permanece desconocida. La traza naranja sigue siendo aproximada, las alternativas tienen extremos distintos y los corredores geodésicos de exploración no sustituyen un proyecto ferroviario ni una mensura. Completar consultas y controlar sus sumatorios no acredita por sí mismo dominio, disponibilidad de tierras o viabilidad jurídica de una expropiación.
