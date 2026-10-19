# Plan interno de trabajo · LAUGIS · Tren Minero

## Objetivo y alcance

Construir, como **proyecto personal LAUGIS**, una base reproducible y un visor para explorar las tres propuestas, sus corredores de ±100 m, intersecciones parcelarias, relieve y condicionantes. No es un proyecto institucional de IDECAM ni del Colegio de Agrimensura de Mendoza. El WFS público conserva su procedencia como fuente técnica externa. El resultado inicial es una evaluación territorial preliminar. Elegir una solución ferroviaria requiere además definir el servicio logístico y completar ingeniería y estudios especializados.

Responsable: **Ing. Agrim. LAUTARO DARIO MARTINEZ**. El equipo y sus controles están en `EQUIPO_Y_CONTROLES.md`; las decisiones metodológicas están en `REGISTRO_DECISIONES.md`.

Equipo, gates, metodología operativa y configuración se mantienen como documentación interna: no se importan a la aplicación ni se enlazan desde el visor. Se retiran vistas de equipo, descargas/exportaciones, enlaces al repo y detalles de ejecución de la presentación pública. El repo sigue público en el estado conocido: cambiarlo a privado está solicitado y pendiente de capacidad, sin presumir que ocultar enlaces garantice privacidad.

## Itinerarios de referencia

| ID | Color | Itinerario documental | Tratamiento |
|---|---|---|---|
| T1 | Rojo | Sarmiento: Realicó–General Alvear–Carmensa; conexión por RP 190/RP 180 hacia Pata Mora | Combina referencia ferroviaria y líneas proyectadas; revisar enlaces; alcance interprovincial |
| T2 | Naranja | Malargüe–Pata Mora–Potasio Río Colorado | Eje aproximado, con segmentos largos y un empalme abierto; análisis preliminar |
| T3 | Azul | Lencinas–Monte Comán–Rodolfo Iselín–Pedro Vargas–Malargüe–Bardas Blancas | Extraer itinerario pertinente de la base ferroviaria; excluir continuación Pedro Vargas–San Rafael |

Los PDF y las aclaraciones permiten identificar intención, no un eje de proyecto validado. La relación con empresas/propuestas se conserva como referencia de los documentos, sin atribuir aprobación u operatividad. No se fuerza un origen/destino común. Azul + naranja sólo podría estudiarse como escenario combinado explícito, una vez revisado su empalme.

## Etapas y entregables

| Etapa | Trabajo concreto | Responsable y dependencias | Entrega / control |
|---|---|---|---|
| 0 · Arranque | Inventariar fuentes, conservar hashes, instrucciones de agentes, esquema de datos y registro de decisiones | PM + INV; KML y cuatro PDF | Manifiesto y selección inicial; G0 |
| 1 · Ejes y corredor | Separar propuestas/tramos, orientar líneas, medir discontinuidades, calcular longitudes y buffer disuelto ±100 m | TOPO + CAT; QA | GeoJSON liviano, métricas con método y mapa de gaps; no unir silenciosamente |
| 2 · Terreno | Obtener cobertura GLO-30 u otro MDE documentado; recortar o consultar COG, verificar acceso y datum; perfiles longitudinales y transversales | TOPO; G0 con alcance conocido | Muestras con progresiva/offset/cota/estado, ventanas de pendiente, cobertura y pruebas; G1 |
| 3 · Parcelas | Descubrir WFS público IDECAM, capas y campos; consultar corredor paginado, comprobar completitud/truncamiento y cobertura; intersección y agregación por parcela única | CAT + PRED; validar respuesta/esquema del servicio | Tablas analíticas, registro endpoint/capa/campos/fecha, cobertura y métricas; snapshot/GPKG opcional para reproducción; G2 |
| 4 · Restricciones y servicio | Inventariar nodos mineros, vías/estado/trocha, terminales, cruces, condicionantes geológicos/hídricos; definir origen/destino y escenarios de carga | MIN + FER + LOG + GEO + HID; fuentes por completar | Registro de restricciones y escenarios comparables, con evidencia y faltantes; G3 |
| 5 · Gestión predial y economía | Separar corredor de estudio de derechos a adquirir; matriz de expedientes; costos sólo con bases verificadas; multicriterio y sensibilidad | PRED + ECO + director/asesoría; G2 y escenarios G3 | Análisis de escenarios, sin dictamen expropiatorio automático ni costos inventados |
| 6 · Visor y entrega | Identidad personal LAUGIS; mapa de alternativas/gaps/corredores, tabla enlazada, dashboard y perfiles sincronizados; responsive; sin equipo, exportaciones, enlaces internos o branding institucional | DEV + UX; resultados anteriores | Build/pruebas, revisión independiente y comprobación de URL; organización interna fuera del frontend; G4/G5 |

## Estado verificable del arranque (19/10/2026)

- Hay un KML con 6.744 elementos y cuatro PDF de referencia; se prepararon 11 segmentos distribuidos en tres propuestas y sus buffers. Las cifras deben consultarse en el manifiesto generado, no copiarse manualmente a esta hoja.
- La app local usa Vite y Leaflet. La consulta COG de elevación por demanda es una implementación por verificar; no existen perfiles de proyecto validados.
- La fuente parcelaria principal es el WFS público IDECAM: `https://geonode-cam.marketsis.com.ar/geoserver/wfs`. No se exige subir una base local. En este registro aún no se acredita acceso, capa, campos de titularidad ni extracción completa; los conteos no comprobados permanecen ausentes, diferenciados del área del corredor. GPKG/importación local es una vía opcional para repetir cálculos.
- La revisión independiente `REVISION_GIS.md` verificó selección, continuidad y cálculo de áreas elipsoidales sobre el corredor disuelto. La distorsión de escala AEQD muestreada fue aproximadamente 0,0371 % como máximo; esto no certifica precisión del KML. G0 sigue en revisión con `WARN`: los gaps T1/T2 permanecen y T3 sólo cumple conectividad dentro de 1 m.
- No se verificó el estado operativo de los ramales, el alcance de adquisición de derechos, los volúmenes mineros, los costos ni una alternativa óptima.
- La disponibilidad de un despliegue Vercel debe comprobarse antes de anunciarla. El acceso al proyecto del equipo presentó 403 durante el arranque; eso se registra como bloqueo de acceso, no como resultado del visor.

## Próximos insumos concretos

1. Verificar capacidades, capas, CRS y campos NC/ID del WFS público IDECAM; extraer por corredor con paginación y comprobar que no hay truncamiento. Registrar endpoint/capa/campos/filtro/fecha/completitud; confirmar si existe titular y su procedencia, sin presuponerlo. Snapshot/GPKG local opcional para reproducción.
2. Validación de extremos y conexiones pendientes del eje; cualquier corrección se entrega como nueva versión.
3. MDE accesible y metadatos: cobertura, resolución, datum vertical, licencia y tratamiento de NoData. Si se incorpora un modelo mejor, conservar comparación y método.
4. Definición del servicio: nodos, productos, horizonte, demanda por escenario, terminales y empalmes. Fuentes del estado real de la infraestructura.
5. Cartografía/antecedentes oficiales de cruces, geología, drenajes y restricciones, con escala y fecha.

No hace falta esperar todos los insumos para trabajar: ejes, metodología, visor, contratos de datos y pruebas pueden avanzar en paralelo. Cada función muestra con claridad qué está calculado, pendiente o sin cobertura.

## Reproducción y revisión

Mantener un manifiesto por ejecución y un reporte QA asociado al commit. La revisión compara geometrías/longitudes, áreas disueltas, ids únicos, cobertura de MDE y de parcelario; la interfaz se contrasta contra los mismos derivados. La comparación final conserva tanto los totales de cada propuesta como los indicadores por unidad de longitud, sin convertir esas normalizaciones por sí solas en una elección de trazado.
