# Registro interno de decisiones · LAUGIS · Tren Minero

Fecha de apertura: 2026-10-19. Responsable: **Ing. Agrim. LAUTARO DARIO MARTINEZ**.

Proyecto personal bajo marca **LAUGIS**. Este registro es documentación de trabajo interna; no se importa al frontend ni se enlaza desde el visor. Su presencia en un repositorio actualmente público no equivale a confidencialidad.

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

## D016 · Publicación mediante integración Git · 19/10/2026

La conexión directa Vercel permanece403, pero el bot Vercel registró Ready para la PR1 y el commit de integración3336452. Producción https://tren-minero.vercel.app comprobada por HTTP200 y manifiesto con el hash original y tres propuestas. Se conserva separación entre disponibilidad HTTP y verificación visual, aún pendiente. La PR1 fue integrada después de las revisiones registradas y el build remoto exitoso.

## D017 · Organización interna y presentación del visor · 19/10/2026

Por instrucción del responsable, equipo de agentes, gates, instrucciones, planes, decisiones, reportes y configuración son organización interna. Se retiran del visor la vista Equipo, importaciones de esa configuración, enlaces al repositorio/documentación, hashes, detalles de ejecución y acciones de descarga/exportación. La interfaz conserva las limitaciones útiles para interpretar el análisis, sin exponer la organización del trabajo. Esta decisión no altera originales, procedencia de fuentes o registros reales de pruebas.

El coordinador comprobó que el repositorio es público. El cambio solicitado a privado sigue pendiente de una capacidad de ejecución; la autorización del usuario ya existe. Ocultar enlaces o secciones de la web no cambia la visibilidad del repositorio ni garantiza que los datos enviados al navegador sean confidenciales. No se afirma privacidad implementada a nivel de repositorio ni eliminación de copias previas.

## D018 · Identidad personal LAUGIS · 19/10/2026

El responsable aclara que **Tren Minero es un proyecto personal**, bajo marca **LAUGIS**, de **Ing. Agrim. LAUTARO DARIO MARTINEZ**. No corresponde presentarlo como proyecto de IDECAM, del Colegio de Agrimensura de Mendoza ni con su dirección o aval institucional. Se actualizan identidad, títulos y presentación pública en ese sentido.

La fuente técnica seleccionada sigue siendo el WFS público IDECAM, con su URL real `https://geonode-cam.marketsis.com.ar/geoserver/wfs`; no se altera ni se oculta su procedencia en los registros internos. También se conservan las URLs reales del repositorio y del proyecto Vercel: el nombre del equipo en una URL de infraestructura no atribuye autoría institucional. La actualización de marca no aprueba la metodología, no cambia los resultados ni reescribe la evidencia histórica de despliegues anteriores.

## D019 · Tramo interactivo y análisis vinculados · 19/10/2026

El usuario solicita seleccionar inicio/fin sobre el mapa y abrir perfiles longitudinales, transversales y dashboard parcelario vinculados a ese tramo. Se adopta una progresiva común GeographicLib WGS84 para snap, recorte, muestreo y secciones. Se agrupan sólo extremos separados hasta 1 m, preservando sus coordenadas; los huecos mayores permanecen en cadenas diferentes y no pueden ser atravesados por una selección.

El buffer de la selección se construye en Web Worker con normales WGS84 ±100 m, franjas subdivididas hasta 500 m, discos de 64 lados y unión de solapes. Su superficie es elipsoidal. El método es exploratorio y difiere del corredor canónico AEQD; no reemplaza los derivados de referencia ni justifica precisión catastral. El rol independiente de topografía revisó dos casos reales, secciones y coherencia de progresivas, sin bloqueantes dentro de ese alcance; sus diferencias y límites están en REVISION_SELECCION.md. Se acepta para interacción preliminar con esas limitaciones.

Los contornos dorados muestran la geometría parcelaria disponible en la consulta visible; el verde identifica su intersección con el buffer elegido. La NC enlaza mapa y tabla. El dashboard informa resultados observados, no cobertura total. Perfiles y resultados de consultas anteriores se cancelan o descartan al cambiar de selección. El cursor funciona por pointer, range y teclado; las coordenadas del SVG se transforman con su matriz de pantalla. El renderizado SVG conserva hit-testing por geometría entre panes superpuestos. QA revisó contratos, carreras y controles por inspección; navegador/touch real sigue NOT_RUN.
