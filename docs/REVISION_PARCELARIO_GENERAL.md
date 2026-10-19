# Revisión independiente del parcelario general

Fecha: 2026-10-19. Rol QA independiente. Archivos de este rol: este registro y `tests/parcel-snapshot-ui.test.mjs`. No se inicia navegador ni servidor de desarrollo. Las consultas reales y el procesamiento de snapshots corresponden al rol GIS; QA revisa sus resultados y el flujo integrado.

## Problema de partida

La fuente anterior sólo se consultaba al acercar el mapa: `scheduleParcelQuery` detenía la consulta por debajo de zoom 11 y `queryParcels` la detenía por debajo de zoom 10 o ante un área visible extensa. Activar una alternativa completa la encuadraba a escala regional; por ello podía mostrar perfil general pero ningún parcelario ni conteo. Un mensaje de acercamiento no resuelve el requisito de disponer del análisis general al elegir la traza.

## Contrato de corrección

- La selección de alternativa carga un resultado parcelario general preparado de la fuente WFS, independientemente del zoom. La consulta visible queda como actualización o detalle adicional.
- El resultado mantiene NC de texto, una entidad analítica por NC y alternativa, intersecciones y contornos disponibles coherentes. Superficie del corredor, suma de afectaciones y unión cubierta son métricas diferentes.
- Ajustar inicio y fin recalcula el resultado sobre el tramo real seleccionado; no reutiliza como propio el total de la alternativa completa.
- Actualizaciones visibles no sustituyen silenciosamente el análisis general por un subconjunto. Un error de actualización no hace desaparecer el resultado general válido.
- Cambiar alternativa o selección invalida respuestas y workers anteriores antes de aceptar nuevos datos.
- La interfaz identifica y enlaza la fuente **WFS público IDECAM**, manteniendo la autoría del producto LAUGIS.
- No se publican CUIT, nombres de titulares ni datos originales privados. Los snapshots públicos contienen únicamente las geometrías y campos de análisis previstos.
- Completar las consultas realizadas no acredita cobertura catastral oficial de la alternativa entera ni dominio registral. Las limitaciones territoriales, temporales y de geometrías disponibles siguen explícitas.

## Flujo revisado y pruebas de ciclo de vida

`acceptBuffer` inicia `loadParcelCensus` con el corredor elegido sin exigir zoom ni una extensión visible pequeña. Para la alternativa completa, el cargador utiliza `parcel-analysis-Tn.geojson`, resultado de 100 m ya preparado, sin recomputarlo en un worker. Para el tramo personalizado, utiliza el apoyo de 125 m y calcula su intersección de 100 m en worker. Las cachés distinguen ambos productos. Las condiciones de acercamiento quedan en la consulta de detalle. Cada selección invalida controladores y workers anteriores; la aceptación de resultados comprueba revisión y controlador. El análisis del snapshot y el detalle WFS usan controladores separados.

La revisión de `src/main.js` y `src/parcel-snapshot.mjs` confirma que el recorte preserva la superficie original de la parcela como denominador y vuelve a calcular la intersección con el corredor seleccionado. Los contornos generalizados son una capa visual separada. Las actualizaciones WFS visibles incorporan contornos de NC alcanzadas y conservan la colección analítica general. Dashboard y resumen utilizan la unión cubierta para evitar sumar dos veces solapamientos.

Resultado final: `node --test tests/parcel-snapshot-ui.test.mjs`, **9/9 aprobadas**. Seis pruebas ejecutan las funciones reales del cargador y de consulta visible, extraídas mediante AST, con dobles explícitos de DOM, red y worker: carga general a zoom regional sin worker; descarga tardía; worker del recorte cancelado; fallo del contorno opcional; error HTTP seguido de reintento; y conservación del resultado general al actualizar el detalle visible. El worker doble devuelve únicamente una colección vacía de protocolo: estas seis pruebas no acreditan mediciones GIS, consultas remotas ni renderizado Leaflet.

## Verificación de datos reales

Las otras tres pruebas leen los archivos finales reales. Comprueban las tres alternativas, NC únicas por propuesta, correspondencia entre índice, apoyo y resultado preparado de 100 m, propiedades sin nombres/CUIT, superficies originales preservadas, porcentajes coherentes con el redondeo publicado, y distinción entre suma y unión. Ejecutan además el recorte geométrico completo de T2 con el buffer generado desde los ejes actuales, y un recorte real de aproximadamente 1 km: produce un subconjunto positivo, menor superficie y los mismos denominadores originales. No sustituyen datos catastrales por fixtures.

Fuente final consultada/compilada: 2026-10-19T16:06:14.784731+00:00. El plan declara 255/255 consultas terminadas, sin consultas fallidas ni conflictos de fuente. La revisión independiente de QA no repite esas consultas remotas; verifica los productos entregados por GIS.

| Propuesta | Consultas | NC alcanzadas a 100 m | Unión cubierta (ha) | Suma de afectaciones (ha) |
|---|---:|---:|---:|---:|
| T1 | 73/73 | 957 | 5.198,7739409 | 5.298,6619751 |
| T2 | 44/44 | 60 | 3.920,9556356 | 3.953,3530268 |
| T3 | 138/138 | 1.060 | 5.463,4269358 | 5.532,8479551 |

El productor registra tres incidencias geométricas de T3 cuyas envolventes son disjuntas del apoyo de 125 m, sin otras partes válidas de la misma NC. Se conservan como advertencias no contribuyentes; el producto final declara cero exclusiones que condicionen numerador o denominador. La auditoría independiente GIS del soporte y de esos registros corresponde a su propio informe. Completar este plan no convierte su cobertura geométrica en acreditación oficial: todos los productos conservan `coverage_status: unknown`. T1 contiene 20 piezas fuera de las extensiones publicadas de las capas admitidas.

## Cierre y límites

Revisión del flujo y de los productos descritos cerrada, sin bloqueantes encontrados dentro del alcance probado. La carga general usa el resultado preparado para evitar una intersección costosa al abrir la alternativa. Los tiempos observados en Node no representan rendimiento real de red, navegador o teléfono. Compilación integrada y publicación se verifican en el flujo del responsable del proyecto; esta revisión no afirma haberlas ejecutado ni observado.

No se ha realizado navegación de escritorio o móvil. Esta revisión no acredita cobertura oficial, vigencia catastral, titularidad ni factibilidad de expropiación. Los resultados son un análisis de las geometrías públicas disponibles en la fuente y del eje de referencia suministrado. El repositorio público y sus geometrías accesibles no equivalen a un entorno privado; quitar botones de descarga no cambia esa condición.
