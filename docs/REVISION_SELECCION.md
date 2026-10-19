# Revisión independiente: selección, perfiles y corredor interactivo

Fecha: 19/10/2026. Revisión de software por subagente GIS; no es certificación profesional ni validación de una rasante ferroviaria. Se revisaron `selection.mjs`, `geo.mjs` y `study-buffer.mjs`, sin editar la interfaz ni las geometrías canónicas.

## PASS: selección y coherencia de progresivas

- Las tres utilidades de selección usan GeographicLib WGS84. La validación ahora rechaza longitudes fuera de ±180° y latitudes fuera de ±90°, además de valores no finitos.
- `buildRouteChains` conserva el orden y no une extremos separados más de 1 m. En datos reales produce una cadena azul, cuatro rojas y dos naranjas. Los empalmes de ≤1 m conservan ambos extremos y su pequeña separación en `join_gaps_m`: no se desplazan coordenadas ni se afirma continuidad operativa.
- `nearestOnLine.distance_m` y `chainage_m` representan la misma progresiva; `offset_m` representa distancia al eje. El recorte interpola geodésicamente sobre ese mismo eje y respeta rangos invertidos.
- Se comprobaron secciones al inicio, mitad y final de un recorte azul de 2 km y de la mayor arista naranja (45.353,561 m). Ancho entre extremos: 200 m dentro de 0,001 m. El centro coincide con el eje y la progresiva obtenida por `nearestOnLine` difiere menos de 0,001 m. Es coherencia numérica, no exactitud topográfica del insumo.
- Se incorporó un control permanente de esa coherencia en `tests/selection.test.mjs`, usando un recorte de la arista real más larga.

## PASS con alcance exploratorio: buffer interactivo

La implementación utiliza normales y distancias WGS84, franjas de ≤500 m, círculos de 64 lados en vértices originales y extremos, y unión mediante `polygon-clipping`. La superficie se mide sobre el elipsoide. La construcción elimina duplicados adyacentes, disuelve solapes y valida radio, coordenadas, antimeridiano y límites de tamaño. Las pruebas incluyen doble recorrido sobre la misma línea, giro, geometría degenerada, anchura y extremos redondeados.

Se hizo una comparación independiente contra Python/Shapely: para **el mismo eje seleccionado** se creó el buffer canónico AEQD ±100 m con 16 segmentos por cuadrante; su área se midió en WGS84 sobre contornos densificados a 100 m. Los siguientes resultados se ejecutaron en esta sesión:

| Caso | Interactivo, ha | AEQD, ha | Diferencia de área | Hausdorff en AEQD |
|---|---:|---:|---:|---:|
| Recorte azul de 2 km | 43,136526 | 43,136338 | +0,00044 % | 0,111 m |
| Mayor arista naranja, 45,354 km | 910,207773 | 910,110475 | +0,01069 % | 0,378 m |

La diferencia simétrica fue de 28,891 m² (0,0067 %) y 22.277,508 m² (0,2447 %), respectivamente. Las áreas agregadas próximas no implican límites idénticos. Son dos casos de comprobación, no una cota de error general de todas las selecciones.

## WARN: métodos y limitaciones

El buffer interactivo **no reemplaza al corredor canónico**: el primero sigue interpolaciones geodésicas y normales WGS84; el segundo utiliza segmentos y distancias de una proyección AEQD. El clipping se realiza en longitud/latitud y las circunferencias son discretizadas. En los tramos fuente largos, estas decisiones pueden desplazar el límite respecto de la construcción canónica y cambiar pequeñas intersecciones parcelarias. La exactitud original del KML, especialmente de la naranja, sigue siendo una limitación mucho mayor y no mejora por densificar.

La selección rechaza sólo fuentes no válidas y preserva los huecos superiores a 1 m separando cadenas. El usuario puede seleccionar dentro de una cadena; ningún tramo debe construirse atravesando dos cadenas distintas. Las pequeñas separaciones admitidas para interacción quedan declaradas y pueden sumar unos metros a la progresiva conjunta.

El resultado representa un corredor de estudio, no ocupación definitiva, expropiación ni acreditación de dominio. Ningún perfil de terreno es por sí mismo una rasante de vía. Las secciones son normales locales al eje geodésico; en un vértice angular se usa la dirección de la arista elegida por la función, por lo que el sentido debe interpretarse con esa convención.

La observación inicial sobre paso cero en `transverse` fue corregida por el editor de `geo.mjs` y revisada de nuevo: ahora se validan coordenadas, paso positivo, ancho/progresiva finitos y límites de muestreo. También se conservan centro y extremos cuando el paso no divide exactamente el ancho. **Sin bloqueantes pendientes dentro del alcance revisado.** La ejecución final de `node --test tests/selection.test.mjs tests/study-buffer.test.mjs tests/geo.test.mjs` aprobó **23 controles, sin fallos ni omisiones**, incluyendo entradas inválidas y coherencia entre progresivas y secciones.
