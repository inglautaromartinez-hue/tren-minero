# Registro de decisiones

Fecha de apertura: 2026-10-19. Responsable: **Ing. Agrim. LAUTARO DARIO MARTINEZ**.

Estas decisiones fijan la implementación preliminar; no equivalen a aprobar la ingeniería, el catastro, el método económico o una expropiación. Los cambios de metodología se revisan por un segundo rol y se registran con motivo, evidencia y versión afectada.

| ID | Decisión y fundamento | Estado / seguimiento |
|---|---|---|
| D001 | Tres propuestas independientes T1 roja, T2 naranja y T3 azul, con extremos documentales distintos. La selección azul sigue Monte Comán–Iselín–Pedro Vargas y continúa hacia Malargüe/Bardas Blancas; la rama a San Rafael no integra ese itinerario | Adoptada para la selección inicial; confirmar ejes/empalmes en G0 |
| D002 | Conservar KML/PDF originales y registrar SHA-256. La base ferroviaria nacional incluida en KML no es íntegramente una alternativa del proyecto | Adoptada; manifiesto de derivados con trazabilidad |
| D003 | Corredor de estudio de ±100 m, extremos redondos y disolución por alternativa. Su área no representa superficie parcelaria afectada ni expropiación | Adoptada por alcance del usuario; CAT/QA verifican implementación |
| D004 | Mantener discontinuidades y aproximación de la naranja. No crear enlaces ni suavizar un eje aproximado para aparentar precisión | Adoptada; correcciones posteriores en derivado separado |
| D005 | Longitudes WGS84 geodésicas; buffer nominal AEQD de ±100 m centrado en lat. −35,5°, lon. −67,5°, unión por propuesta y área elipsoidal WGS84 con contornos densificados. `REVISION_GIS.md` documenta corrección del área plana inicial y revisión independiente del método | Revisada con alcance preliminar: escala máxima muestreada 1,000371 (≈0,0371 %, no límite certificado). No prueba precisión posicional del KML ni validez legal del corredor. G0 permanece `WARN` por discontinuidades y aproximaciones |
| D006 | Datos parcelarios y elevaciones precalculadas ausentes se expresan como `null` o estados explícitos. Fallo de consulta no equivale a cero | Adoptada; contrato común pipeline–visor–QA |
| D007 | Separar pipeline GIS del visor. Repositorio para código, metodología, manifiestos y derivados livianos; MDE y parcelarios completos en almacenamiento adecuado | Adoptada; no requiere un backend de agentes ni ejecutar análisis masivos al abrir el mapa |
| D008 | Incorporación de Copernicus GLO-30 como fuente candidata para reconocimiento del relieve, con comprobación de acceso, cobertura, licencia y referencia vertical. Consulta COG por demanda no equivale a G1 aprobado | Provisional; validar perfiles/NoData y distinguir terreno de rasante |
| D009 | Equipo por roles con PM, entregas y revisión independiente, inspirado en la estructura de Plan El Niño. Activación de subagentes reales según tareas, con un editor por archivo | Adoptada; no declarar activos todos los perfiles ni presentarlos como profesionales acreditados |
| D010 | La intersección con el buffer es una detección preliminar. Cualquier adquisición, servidumbre o expropiación requiere analizar documentos, jurisdicción, derechos y criterio profesional | Adoptada; PRED entrega matriz de revisión, no dictamen/trámite automático |
| D011 | No publicar titulares ni insumos nominales en repo o app pública por defecto. Mantener NC como texto y procedencia de la titularidad en salidas controladas cuando exista base | Adoptada; revisión de datos antes de subir derivados |
| D012 | No ranking automático de óptimo. Comparar un servicio/alcance acordado y mostrar datos, incertidumbre, restricciones, pesos y sensibilidad | Adoptada; minería/logística/economía pendientes de insumos |
| D013 | Publicación preliminar permitida con faltantes visibles; G0–G3 no se aprueban por tener web. Probar build y datos, luego comprobar URL antes de anunciar disponibilidad | Adoptada; registrar evidencia de G4/G5 al entregar |
| D014 | Por instrucción expresa del usuario, la fuente parcelaria principal será el WFS público IDECAM `https://geonode-cam.marketsis.com.ar/geoserver/wfs`. GPKG/importación local queda como opción de reproducción o respaldo, no prerrequisito para avanzar | Adoptada para implementación; acceso, capas, esquema y titularidad todavía por comprobar en vivo |
| D015 | Registrar endpoint, versión/capa/campos/filtro/CRS, fecha, paginación, conteos y completitud/truncamiento de cada extracción WFS. Error, límite o falta de cobertura no equivalen a «fuera» ni cero. Un snapshot opcional debe conservar fuente/fecha/hash | Adoptada; G2 depende de evidencia de consulta completa y controles de cruce, no de la mera configuración de una URL |

## Cómo agregar una decisión

Agregar un ID consecutivo con fecha, pregunta, opciones cuando aporten valor, elección, fuentes, responsable, revisor, archivos/commit afectados y consecuencia. Una decisión revocada conserva su fila y enlaza la nueva. Una propuesta pendiente no se aplica silenciosamente ni se comunica como aprobada.

## D014 · WFS público y disponibilidad de campos · 19/10/2026

Instrucción expresa del director: usar el WFS público IDECAM como fuente parcelaria principal. El coordinador comprobó catálogo, esquemas de cinco capas y una consulta acotada. `NOMENCLATU` es textual; no hay nombre de titular en los esquemas revisados. Se solicita una lista limitada de campos; se excluye CUIT. La actualización catastral se mantiene desconocida cuando no está publicada. Las consultas por área no implican cobertura integral del corredor.

## D015 · Aceptación del código preliminar y límites de publicación · 19/10/2026

El coordinador integra las revisiones de roles distintos y las pruebas registradas en ENTREGA_INICIAL.md. Se acepta preparar e integrar esta versión preliminar por PR: no aprueba viabilidad, titularidad, expropiación, calidad de campo ni el óptimo ferroviario. Las limitaciones de fuentes y los enlaces faltantes quedan visibles. Vercel devuelve 403 con la conexión disponible; no se declara publicación verificada.
