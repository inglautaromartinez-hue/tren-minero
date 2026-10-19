# Revisión GIS independiente de transversales cada 100 m

Fecha: 19/10/2026. Alcance: consistencia geométrica y numérica del catálogo, no certificación profesional, validación en terreno ni aprobación de una rasante ferroviaria. Se revisaron los helpers y el generador sin editar los archivos del agente autor.

## Geometría: PASS

`tests/cross-sections-gis.test.mjs` incorpora tres controles independientes sobre las geometrías reales y el catálogo publicado. Resultado: **3 aprobados, sin fallos ni omisiones**.

El catálogo contiene **14.744 secciones**: 6.572 en T1, 3.276 en T2 y 4.896 en T3. Cada una define nueve posiciones a −100, −75, −50, −25, 0, 25, 50, 75 y 100 m, totalizando 132.696 posiciones de muestreo. Las estaciones de 100 m reinician en cada cadena continua e incluyen sus extremos; no se distribuyen estaciones dentro de huecos entre cadenas. La progresiva global acumula las longitudes disponibles y excluye esas separaciones.

Se verificaron independientemente 21 secciones —inicio, mitad y final de cada una de las siete cadenas reales— contra la acumulación de distancias y azimuts de los vértices fuente con GeographicLib WGS84. Los centros coincidieron a menos de 0,001 m; las nueve distancias horizontales al centro coincidieron a menos de 0,001 m y la perpendicularidad difirió menos de 0,00001°. Estas tolerancias describen consistencia de algoritmos sobre las mismas coordenadas, no exactitud de la topografía ni del KML.

Las cotas de entrada se conservaron exactamente en el helper, incluyendo `null`; no se interpolaron ni reemplazaron por cero. La reconstrucción utiliza la tangente geodésica de la arista correspondiente. En un vértice angular se adopta la arista precedente. La consulta de una cadena ajena devuelve ausencia de sección; la selección más cercana devuelve una sección existente y su distancia lateral, sin inventar estaciones o conexiones. El consumidor debe conservar la restricción `partId` cuando el usuario selecciona una cadena.

Los identificadores son únicos y estables al regenerar sobre las mismas cadenas y progresivas. No se modificaron geometrías canónicas, fuentes ni parcelarios durante esta revisión.

## Generación y datos ausentes

El generador consulta el lector compartido de Copernicus GLO-30, conserva checkpoints privados y publica los perfiles compactos. La revisión geométrica anterior no implica que todas las consultas de elevación hayan terminado: ese estado se verifica separadamente al cerrar la corrida.

Se observó durante la revisión que la primera versión confundía «todas las cotas válidas» con «todas las consultas procesadas». El agente autor informó la corrección: separar finalización del procesamiento y cobertura de cotas, conservar motivos explícitos para ausencias y limitar reintentos. La ausencia válida de datos no debe impedir marcar una corrida como procesada ni transformarse en relieve sintético. Cuando el lector no distingue NoData de una falla de lectura, la razón debe declararlo; no corresponde atribuirla automáticamente a NoData genuino.

También se solicitó incorporar los helpers geométricos a la firma del checkpoint y mantener un único contrato entre generador, índice, datasets, pruebas y visor. Las diferencias temporales de contrato durante una corrida en ejecución no constituyen una entrega aprobada.

## Límites de interpretación

Copernicus GLO-30 es un modelo de superficie de resolución nominal de 30 m. El espaciado transversal de 25 m y el intervalo longitudinal de 100 m no mejoran su resolución ni la precisión de los ejes originales. Los decimales almacenados expresan formato numérico; no acreditan precisión milimétrica. Las pendientes y los perfiles describen el modelo muestreado y no una rasante, cubicación o diseño ferroviario definitivo.

La traza naranja sigue siendo aproximada. Incorporar muchas secciones sobre sus largas aristas no convierte el recorrido en un eje relevado o aprobado. La proximidad de pequeños empalmes de las cadenas tampoco acredita continuidad operativa.

## Cierre del catálogo publicado: PASS

Se verificó el índice final, actualizado el 19/10/2026 a las 15:58:31 UTC: 14.744 secciones procesadas y 132.696 cotas finitas, sin estaciones pendientes ni cotas ausentes. Los JSON por alternativa coinciden con el índice: T1 6.572/59.148; T2 3.276/29.484; T3 4.896/44.064, expresados como secciones/cotas. El contrato final utiliza `spacing_m`, `offsets`, `sections` e índice con `url`/`count`.

Se contrastaron 21 centros almacenados contra la reconstrucción sobre vértices fuente; coinciden a menos de 0,002 m, incluyendo el redondeo de progresivas y coordenadas del formato compacto. No se realizaron nuevas consultas de elevación durante esta revisión independiente; las cotas proceden de la corrida S3 del agente productor, con provenance y checkpoint descritos en su informe.

La revisión conjunta del helper y su contrato final aprobó diez controles automatizados de estaciones, geometría, ausencia explícita de datos y conteos publicados. La firma del checkpoint se inspeccionó en el código del generador. La normalización de la única corrida legacy fue explícita y no presentó cambios geométricos en las comprobaciones. **No quedan bloqueantes dentro del alcance GIS revisado.** Esto no certifica precisión vertical ni elimina las limitaciones de los ejes o del modelo.
