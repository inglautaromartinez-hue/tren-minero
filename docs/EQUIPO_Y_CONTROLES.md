# Equipo, interfaces y controles

## Dirección y funcionamiento

**Director y responsable del proyecto:** Ing. Agrim. LAUTARO DARIO MARTINEZ.

El coordinador IA funciona como PM: transforma el objetivo en tareas, entrega insumos versionados, asigna un editor por archivo, integra resultados y comunica decisiones y faltantes. La estructura adapta el trabajo por especialidades, revisión cruzada y gates utilizado como referencia en Plan El Niño. Los especialistas aquí son perfiles de trabajo de IA; su existencia en el repositorio no significa que estén activos ni que sustituyan a profesionales habilitados.

En este arranque se distribuyó trabajo real de integración, gobernanza del equipo, revisión GIS, pipeline parcelario y QA de la aplicación. No se declara activada una revisión minera, legal, ferroviaria o geotécnica que no se haya ejecutado. Cada nueva sesión informa roles activados y resultados; la nómina permanente es un catálogo para asignar tareas, no una lista de procesos en ejecución.

| Trabajo delegado en esta sesión | Agente o responsable | Alcance asignado |
|---|---|---|
| Coordinación, frontend e integración | Coordinador principal | Integración del proyecto y entrega verificable |
| Gobernanza del equipo | `estructura_equipo` | AGENTS, equipo, plan, decisiones y contrato de configuración |
| Revisión de topografía y datos | `revision_topografia` | Revisión independiente de ejes, CRS, discontinuidades y terreno según insumos disponibles |
| Pipeline parcelario | `parcelas_pipeline` | Consulta de WFS público IDECAM, cruce y controles de completitud; importación local opcional |
| QA de la aplicación | `qa_aplicacion` | Verificación de aplicación y resultados disponibles |

La tabla registra asignaciones reales, no aprobaciones. Los informes de entrega deben registrar los resultados efectivos de cada tarea; no atribuir a QA de la aplicación una auditoría legal, ferroviaria o geotécnica.

## Roles e interfaces

| ID / rol | Entradas necesarias | Salida y destinatario | Criterio para aceptar el trabajo |
|---|---|---|---|
| PM · Coordinación e integración | Objetivo, restricciones, inventario, informes de roles | Plan, contratos de datos, registro de decisiones y versión integrada → director y QA | Alcance, dependencias, responsables, evidencias y pendientes explícitos; ninguna conclusión supera sus insumos |
| INV · Investigación y fuentes | KML, cuatro PDF, catálogos oficiales, consultas autorizadas | Registro de fuentes, trazabilidad por propuesta, cuestiones contradictorias → todas las especialidades | Cada afirmación remite a una fuente y fecha; distinguir documento, interpretación y testimonio; no inventar parámetros |
| TOPO · Topografía, geodesia y MDE | Ejes versionados, CRS, mosaicos/COG y metadatos | Justificación de CRS, muestras longitudinales/transversales, pendientes y cobertura → FER, GEO, HID, DEV y QA | Datum/unidades/resolución/NoData declarados; perfiles interrumpidos en huecos; pendiente en ‰ y ventana explícita; terreno separado de rasante |
| CAT · GIS y catastro | Corredores, WFS público IDECAM, capa/esquema NC/ID, fecha y cobertura; snapshot local opcional | Intersecciones, métricas únicas, registro de consulta/completitud y cuarentena de geometrías → PRED, ECO, DEV y QA | NC como texto; paginación y truncamiento controlados; sin duplicar superficie; errores y cobertura desconocida no son cero ni «fuera» |
| FER · Ingeniería ferroviaria | Trazas, topografía, infraestructura y estado de vías verificados, especificaciones del proyecto | Segmentación existente/proyectada/por verificar, restricciones y necesidades de estudio → LOG, ECO y PM | No deducir operatividad de un mapa; radios/rasante/obras sólo con definición suficiente; no certificar aptitud desde GLO-30 |
| MIN · Minería y nodos productivos | Localización, producto, proyecto/fase, fuentes de producción y autorizaciones disponibles | Inventario de nodos, escenarios de carga y requisitos de terminal → LOG, ECO y PM | Volúmenes y horizontes con fuente; separar potencial de producción efectiva; sin afirmar habilitaciones no verificadas |
| LOG · Logística e intermodalidad | Nodos MIN, conectividad FER, origen/destino, demanda, terminales y restricciones | Escenarios comparables de servicio, vacíos de conectividad y requerimientos → FER, ECO y PM | Comparar igual servicio/horizonte; no equiparar tres recorridos diferentes; demanda, tiempos, capacidades y supuestos visibles |
| PRED · Gestión predial y expropiaciones | Intersecciones CAT, titularidad y documentos de respaldo, jurisdicción y reglas aportadas/verificadas | Matriz de expedientes a revisar, condición documental y dudas → director, asesor legal y ECO | «Intersección preliminar» separada de adquisición/servidumbre/expropiación; sin dictamen, indemnización ni trámite automático; datos nominales restringidos |
| GEO · Geología y geotecnia | Relieve, cartografía geológica oficial, antecedentes y estudios de campo disponibles | Sectores con condicionantes y programa de investigación → FER, HID y ECO | Evidencia y escala de cartografía explícitas; sin propiedades resistentes ni estabilidad inferidas únicamente del MDE |
| HID · Hidrología y cruces | Cauces, drenajes, relieve, antecedentes, puentes y datos hidrológicos disponibles | Cruces candidatos y prioridades de estudio → FER, GEO y ECO | Intersección cartográfica separada de dimensionamiento hidráulico; no trasladar escenarios de Plan El Niño al nuevo alcance |
| ECO · Economía y evaluación multicriterio | Longitudes, obras, escenarios LOG, matriz PRED, costos verificados y bases temporales | Escenarios CAPEX/OPEX o matriz cualitativa cuando falten precios → PM y director | Moneda/fecha/alcance/fuentes; sin falsa precisión; pesos y sensibilidad públicos; no calcular rentabilidad sin demanda y costos suficientes |
| DEV · Arquitectura, datos y desarrollo | Contratos GIS, metadatos, resultados QA y requisitos UX | Pipeline reproducible, esquemas, APIs si hacen falta, app y despliegue → QA y PM | Datos ausentes representados correctamente; no cálculos pesados al abrir el mapa; secretos fuera del cliente; pruebas/build y procedencia preservada |
| UX · Experiencia y cartografía | Casos de uso, límites de datos, alternativas y perfiles | Mapa, dashboard, selección sincronizada y textos → DEV y QA | Color más etiqueta; móvil usable; métricas con unidad/cobertura; incertidumbre visible junto al dato; sin controles engañosos |
| QA · Auditoría independiente | Fuentes, derivados, parámetros, cambios y evidencia de ejecución | Informe `PASS/WARN/BLOCKED/NOT_RUN`, regresiones y recomendación de gate → PM y director | Revisor distinto del autor; verificar extremos, ejes, gaps, áreas, conteos, perfiles y flujos; declarar lo que no pudo comprobar |

## Protocolo de entrega

Cada tarea tiene un responsable y una versión de insumos fija. Su informe contiene:

1. Pregunta, alcance y criterio de aceptación.
2. Archivos/fuentes, hash o versión, fecha y cobertura.
3. Método, parámetros, CRS, unidades y clasificación de evidencia.
4. Salidas y comandos verificables.
5. Controles ejecutados y resultados, con incidencias.
6. Limitaciones, dependencias y destinatario siguiente.

El PM integra únicamente entregas coherentes con el contrato. Si dos roles discrepan, registra la discrepancia y conserva ambas evidencias hasta resolverla. QA no modifica en silencio el cálculo que audita: informa el defecto y el autor corrige o el PM reasigna la edición.

## Clasificación de evidencia

| Clase | Significado y ejemplo | Regla de presentación |
|---|---|---|
| Medida | Observación instrumental con método y precisión conocidos | Informar instrumento/método, fecha, referencia y precisión disponible |
| Documentada | Fuente identificable: PDF, catastro, metadato de MDE | Citar fuente y alcance; un documento no prueba por sí solo vigencia u operación |
| Testimonial | Aclaración de un informante, como la selección del azul | Conservar texto/procedencia y señalar corroboración pendiente |
| Estimada | Cálculo sobre eje preliminar, raster o escenario | Informar insumo, método y limitación; redondeo acorde con el dato |
| Supuesta | Parámetro adoptado sin constatación, como una demanda hipotética | Etiqueta explícita, responsable y sensibilidad; no tratarlo como hecho |

Una geometría documentada y una superficie calculada sobre ella pueden tener clases distintas: el origen documental no convierte el cálculo en medición de campo.

## Contrato de fuente parcelaria pública

La fuente principal es `https://geonode-cam.marketsis.com.ar/geoserver/wfs`, indicada por el usuario como WFS público IDECAM. Se inicia por descubrimiento de capacidades y esquema de capas, sin exigir un archivo parcelario al usuario. La disponibilidad efectiva, las capas pertinentes y los campos de titularidad se declaran únicamente después de verificarlos. GPKG o un snapshot de respuestas se admiten como respaldo/reproducción y conservan identidad de fuente y fecha.

Cada extracción registra endpoint/versión WFS, nombre de capa, campos observados y mapeo de ID/NC/titular si existe, CRS y filtro espacial, instante de consulta y fecha de fuente si consta, páginas, `numberMatched`/`numberReturned` o equivalentes, límites, conteos únicos y hash de respuesta/snapshot. El contrato distingue `complete`, `partial`, `truncated`, `error` y `unknown`: sólo una consulta completa y espacialmente pertinente habilita interpretar un resultado vacío. Un error no es «fuera»; un total parcial debe identificarse como parcial, sin mezclarse con el área completa del corredor.

## Gates de calidad

`Pendiente` significa que falta evidencia; `En revisión` que existen salidas sin aprobación completa; `Aprobado con alcance` sólo habilita el uso declarado. Los gates científicos no se aprueban por publicar una web.

| Gate | Evidencias y aceptación | Revisión / salida permitida | Estado del arranque |
|---|---|---|---|
| G0 · Fuentes, ejes y topología | Inventario/hashes, relación KML–PDF, itinerarios, orientación, extremos, discontinuidades y CRS justificado. Sin enlaces inventados | INV + TOPO/CAT; QA independiente → ejes/corredores preliminares con gaps visibles | En revisión / `WARN`: revisión GIS ejecutada, área elipsoidal y distorsión muestreada documentadas; T1/T2 desconectadas, T3 sólo conectada dentro de tolerancia; itinerarios sin aprobación integral |
| G1 · Terreno y geodesia | Modelo/licencia/cobertura/datum; muestreo longitudinal y transversal reproducible; prueba contra valores de referencia y control de NoData | TOPO + QA; FER revisa interpretación → perfiles del terreno con alcance declarado | Pendiente: consulta COG por demanda todavía sin validación integral |
| G2 · Parcelas y cobertura | WFS endpoint/capa/campos/fecha/filtro/CRS, paginación, completitud/truncamiento, IDs/NC, geometrías, cobertura y controles de intersección; snapshot opcional | CAT + QA; PRED revisa términos y datos nominales → dashboard de intersección | En implementación: fuente pública indicada; acceso, esquema, disponibilidad de titular y consulta completa pendientes de verificación; totales no comprobados ausentes |
| G3 · Ingeniería, minería y logística | Estado de infraestructura, demanda, nodos, servicio comparable, cruces, condicionantes y supuestos. Costos sólo cuando existan fuentes | FER + MIN + LOG + GEO/HID/ECO/PRED según alcance; QA → comparación sustentada | Pendiente: no hay estudio técnico de operación, costos o alternativa óptima |
| G4 · Implementación y experiencia | Contratos, pruebas GIS pertinentes, `npm test`, `npm run build`, controles de estados vacíos/error, mapa/perfil y móvil | DEV + UX + QA distinto del autor → versión candidata | En implementación; registrar resultados reales de la entrega |
| G5 · Publicación y comunicación | Revisión del diff y metodología, privacidad, fuente/versionado, proyecto Vercel correcto, URL comprobada y alcance visible | PM + QA; criterio profesional por director → visor preliminar o versión validada según gates previos | Pendiente de verificación remota; un 403 no demuestra un despliegue funcional |

Una publicación preliminar puede mostrar G0 en revisión y G1–G3 pendientes siempre que esas métricas estén explícitamente incompletas. No puede ofrecer un «óptimo», informar cero parcelas por falta de base ni presentar un fallo de MDE como cota cero. La autorización existente para trabajar en GitHub/Vercel permite avanzar; los gates son controles de evidencia y revisión, no pedidos de permiso repetidos al usuario.
