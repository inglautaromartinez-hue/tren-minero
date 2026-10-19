# LAUGIS · Tren Minero

**Proyecto personal de Ing. Agrim. LAUTARO DARIO MARTINEZ**, bajo la marca **LAUGIS**. Explorador territorial preliminar de tres propuestas ferroviarias de Mendoza, con ejes documentados, corredores de estudio de ±100 m, consulta parcelaria a una fuente WFS pública y perfiles de superficie Copernicus bajo demanda.

El proyecto no pertenece a IDECAM ni al Colegio de Agrimensura de Mendoza y no se presenta con su autoría o aval. El WFS público IDECAM sigue siendo la fuente parcelaria externa seleccionada: `https://geonode-cam.marketsis.com.ar/geoserver/wfs`. La procedencia de datos o el nombre de una cuenta de alojamiento no cambia la identidad personal del proyecto.

## Presentación e información interna

El visor se presenta como **LAUGIS · Tren Minero**. Equipo de agentes, gates, instrucciones, metodología operativa y configuración son organización interna: no se importan al frontend ni se muestran como una vista pública. La interfaz no ofrece descargas/exportaciones, enlaces al repositorio/documentos internos, hashes o detalles de ejecución. Conserva las aclaraciones necesarias para interpretar cobertura, relieve y resultados preliminares.

El repositorio está **público** en el estado comprobado. Su conversión a privado está solicitada y pendiente de capacidad para ejecutarla; no se registra como completada. Ocultar esos elementos en la interfaz no vuelve privados los archivos del repositorio ni los datos que el navegador necesita para mostrar el mapa. Esta documentación conserva esa distinción y no promete confidencialidad garantizada.

## Abrir y desarrollar

```bash
npm ci
npm run dev
npm test
npm run build
```

El mapa y el WFS funcionan en Vite. Los perfiles usan `/api/dem` (función Node de Vercel que lee bloques del COG público); para probar esa ruta localmente usar `vercel dev` con la conexión propia del desarrollador. Un `vite dev` solo no sirve las funciones `/api`.

Visor publicado: https://tren-minero.vercel.app. Actualización LAUGIS integrada por PR3 (`f306298`): Vercel/GitHub informó success y se comprobó HTTP200, título LAUGIS, asset del build esperado, manifiesto depurado, ausencia del corredor analítico completo (404) y lectura DEM parcial HTTP206. La conexión directa Vercel devuelve403, pero el despliegue Git funciona. Estas comprobaciones HTTP no equivalen a una revisión visual; interacción real en navegador y celular sigue pendiente.

## Funciones

- Tres propuestas y once segmentos seleccionados del KML y los PDF recibidos; ramales ajenos excluidos.
- Corredores disueltos por propuesta, superficies geodésicas WGS84 y métricas de continuidad.
- Mapa/satélite con vista general por alternativa al tocar su tarjeta o eje. Ajuste opcional de inicio y fin sobre una parte continua y regreso a Traza completa; los huecos se conservan.
- Paneles longitudinal/transversal/parcelas sobre el mismo tramo. Cursor por mouse, touch, rango o teclado enlazado a un marcador en el mapa; sección elegible en el eje.
- Análisis parcelario precensado de cada alternativa sobre cinco capas públicas de IDECAM, con consultas acotadas al corredor y controles de completitud. Intersección interactiva en Web Worker sin depender del zoom; detalle WFS visible opcional y totales generales conservados. Contornos dorados de contexto, intersección verde y tabla vinculados por NC.
- NC `NOMENCLATU` conservada como texto. Atributos solicitados: geometría, NC, padrón, departamento y número de plano. Los esquemas revisados no exponen nombre de titular; no se pide ni muestra `CUIT_TITUL`.
- Dashboard y tabla con cobertura explícita. Las cantidades corresponden al corredor y al alcance de las capas consultadas; la cobertura oficial sigue sin confirmar. Fallo o faltante nunca equivale a cero o a no afectación.
- Perfiles longitudinales y transversales ±100 m, pendientes del terreno en ‰ y NoData explícito. Copernicus GLO-30 Public, distribución AWS 2021, alturas EGM2008; no es rasante ni levantamiento de proyecto.
- La organización del equipo y sus controles se conserva en archivos internos; `config/project.json` no es contenido de la aplicación pública.

El censo de consultas WFS se prepara mediante el script reproducible; el recorte interactivo y las consultas de detalle se procesan en el navegador. No se guardan respuestas catastrales, titulares ni CUIT en el repositorio. Una fuente públicamente accesible no acredita por sí misma titularidad registral ni permiso irrestricto de redistribución.

## Uso del visor

1. Tocar **Traza 1, 2 o 3**: se activa la alternativa completa, se aísla visualmente y se abre el análisis parcelario. Se muestran NC identificadas y superficie cubierta por parcelas del WFS público **IDECAM**, citado con enlace como fuente. La cobertura oficial y la fecha de actualización catastral no se presumen.
2. El análisis general se carga desde un derivado de consultas reales a lo largo del corredor, sin exigir zoom o una extensión pequeña. El dorado dibuja el contorno de contexto de las parcelas alcanzadas y el verde su intersección de ±100 m. Los contornos precargados están generalizados a 2 m y son sólo visuales; no intervienen en superficies ni porcentajes.
3. Para profundizar, tocar **Ajustar inicio y fin** y marcar dos puntos de la misma parte continua. El cruce se recalcula contra ese buffer de 100 m usando intersecciones de apoyo de 125 m y conservando el denominador geométrico parcelario original disponible.
4. **Traza completa** recupera el análisis general. Las otras tarjetas cambian de propuesta. Acercar y consultar el WFS sirve para actualizar el detalle visible y no reemplaza el total analizado por un subconjunto local.
5. Los longitudinales generales tienen cotas Copernicus precalculadas a paso de 1 km. En **Transversales**, hay secciones fijas cada **100 m de eje**, más extremos, de ±100 m y nueve cotas. Se seleccionan por marca del mapa, flechas anterior/siguiente o rango discreto. No se consulta un perfil arbitrario ni se inventan elevaciones al tocar el mapa. Acercarse permite ver todas las marcas dentro de la vista; a escala regional se evita dibujar miles de símbolos superpuestos.
6. Al recorrer un perfil, su cursor marca la posición sobre el satélite. Las discontinuidades se conservan como cortes. Los recortes que no incluyen ninguna sección prefijada lo indican expresamente.

El manifiesto y los assets se depuran para presentación y no contienen configuración de agentes. No se ofrecen exportaciones. El repositorio sigue público; los datos necesarios para representar el mapa y los perfiles llegan al navegador y esa visualización no acredita confidencialidad. Las respuestas WFS originales, las geometrías fuente completas y checkpoints se conservan fuera del código publicado, en `data/private` excluido de Git. Los derivados de presentación contienen NC y geometría analítica limitada al soporte, junto con contornos generalizados sólo visuales; no se publica titular ni CUIT.

## Alternativas y alcance

| ID | Itinerario documentado | Estado |
|---|---|---|
| T1 roja | Realicó–Alvear–Carmensa, RP 190/180 hacia Pata Mora | Referencia interprovincial con enlaces faltantes |
| T2 naranja | Malargüe–Pata Mora–Potasio Río Colorado | Dibujo aproximado con un enlace abierto |
| T3 azul | Lencinas–Monte Comán–Iselín–Pedro Vargas–Malargüe–Bardas Blancas | Cinco segmentos, empalmes cercanos <1 m; operación no validada |

Los extremos y funciones difieren; no se genera un ranking automático. La superficie del corredor no es superficie de expropiación. La suma de ejes disponibles no agrega conexiones inexistentes. Las métricas autoritativas están en `public/data/manifest.json`.

## Procesamiento reproducible

```bash
python -m pip install -r requirements.txt
python scripts/prepare_routes.py /ruta/TRAZAS.kml
python -m unittest discover -s tests -p 'test_*.py'
```

El KML original y los PDF se conservan en la entrega de origen; el repositorio registra hashes/procedencia en [docs/FUENTES.md](docs/FUENTES.md). No se versionan parcelarios originales ni mosaicos TIFF. Las pruebas que requieren el KML se omiten con motivo cuando no está disponible en `data/source/TRAZAS.kml` ni en el entorno de adjuntos.

Para consultar WFS y reproducir el cruce fuera del navegador:

```bash
python scripts/fetch_wfs_parcels.py --type-name geonode:a__LGS_GRP_oct_SAN_RAFAEL --bbox -68.0086 -34.6426 -68.0075 -34.6416 --nc-field NOMENCLATU --output data/private/candidatas.geojson
python scripts/intersect_parcels.py data/private/candidatas.geojson --nc-column nc --output data/private/intersecciones.geojson
```

La fecha de consulta y la de actualización catastral se registran separadamente. La fecha del parcelario se mantiene desconocida si la fuente no la publica. Ver [contrato parcelario](docs/CONTRATO_PARCELARIO.md). La importación de un cruce local es opcional para reproducción, no reemplaza al WFS como fuente principal.

## Equipo y revisión internos

- [AGENTS.md](AGENTS.md): instrucciones obligatorias para colaboradores y agentes.
- [Equipo y controles](docs/EQUIPO_Y_CONTROLES.md): 14 roles y 6 gates.
- [Plan de trabajo](docs/PLAN_DE_TRABAJO.md): etapas, entradas y dependencias.
- [Decisiones](docs/REGISTRO_DECISIONES.md), [revisión GIS](docs/REVISION_GIS.md) y [revisión de aplicación](docs/REVISION_APLICACION.md).

Los agentes son funciones de apoyo activadas por tarea, no profesionales acreditados ni un servicio autónomo ejecutándose desde la web. El PM integra; los revisores informan alcance y evidencia. Estas instrucciones, enlaces y reportes pertenecen al trabajo interno y no deben aparecer en el visor. Trabajo importante mediante rama y PR, sin force-push.

## Estado y límites

Ver [registro de entrega](docs/ENTREGA_INICIAL.md) para comandos, pruebas reales, revisiones y pendientes. Build y pruebas de código no equivalen a validación ferroviaria, registral o topográfica. Siguen pendientes la cobertura catastral integral, el detalle de la naranja, conexiones faltantes, verificación de infraestructura, demanda logística, condicionantes y costos documentados y revisión visual en navegador/celular.
