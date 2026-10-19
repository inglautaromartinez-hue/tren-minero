# Tren Minero · IDECAM

Explorador territorial preliminar de tres propuestas ferroviarias de Mendoza, dirigido por **Ing. Agrim. LAUTARO DARIO MARTINEZ**. Incluye ejes documentados, corredores de estudio de ±100 m, consulta parcelaria al WFS público IDECAM y perfiles de superficie Copernicus bajo demanda.

## Abrir y desarrollar

```bash
npm ci
npm run dev
npm test
npm run build
```

El mapa y el WFS funcionan en Vite. Los perfiles usan `/api/dem` (función Node de Vercel que lee bloques del COG público); para probar esa ruta localmente usar `vercel dev` con la conexión propia del desarrollador. Un `vite dev` solo no sirve las funciones `/api`.

Proyecto Vercel previsto: https://vercel.com/idecam/tren-minero. `vercel.json` define Vite y `dist`. Visor publicado: https://tren-minero.vercel.app. GitHub/Vercel informó Ready para el commit de integración `3336452`; se comprobó HTTP200, título y manifiesto correctos. La conexión directa Vercel devuelve403, pero el despliegue Git funciona. La verificación visual e interacción en navegador siguen pendientes.

## Funciones

- Tres propuestas y once segmentos seleccionados del KML y los PDF recibidos; ramales ajenos excluidos.
- Corredores disueltos por propuesta, superficies geodésicas WGS84 y métricas de continuidad.
- Mapa/satélite, selección y visibilidad por propuesta, navegación por tramo y descarga de ejes.
- Consulta **pública** WFS por área visible, cinco capas departamentales, paginación comprobada, máximo 5.000 candidatas y cruce en Web Worker contra el corredor íntegro sin simplificar.
- NC `NOMENCLATU` conservada como texto. Atributos solicitados: geometría, NC, padrón, departamento y número de plano. Los esquemas revisados no exponen nombre de titular; no se pide ni muestra `CUIT_TITUL`.
- Dashboard y tabla con cobertura explícita. `≥` significa resultados observados con cobertura incompleta/no confirmada. Fallo o faltante nunca equivale a cero o a no afectación.
- Perfiles longitudinales y transversales ±100 m, pendientes del terreno en ‰ y NoData explícito. Copernicus GLO-30 Public, distribución AWS 2021, alturas EGM2008; no es rasante ni levantamiento de proyecto.
- Vista Equipo alimentada por `config/project.json`: roles, entregables y gates con estados verificables.

Las consultas WFS se procesan localmente en el navegador. No se guardan respuestas catastrales, titulares ni CUIT en el repositorio. Una fuente públicamente accesible no acredita por sí misma titularidad registral ni permiso irrestricto de redistribución.

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

## Equipo y revisión

- [AGENTS.md](AGENTS.md): instrucciones obligatorias para colaboradores y agentes.
- [Equipo y controles](docs/EQUIPO_Y_CONTROLES.md): 14 roles y 6 gates.
- [Plan de trabajo](docs/PLAN_DE_TRABAJO.md): etapas, entradas y dependencias.
- [Decisiones](docs/REGISTRO_DECISIONES.md), [revisión GIS](docs/REVISION_GIS.md) y [revisión de aplicación](docs/REVISION_APLICACION.md).

Los agentes son funciones de apoyo activadas por tarea, no profesionales acreditados ni un servicio autónomo ejecutándose desde la web. El PM integra; los revisores informan alcance y evidencia. Trabajo importante mediante rama y PR, sin force-push.

## Estado y límites

Ver [registro de entrega](docs/ENTREGA_INICIAL.md) para comandos, pruebas reales, revisiones y pendientes. Build y pruebas de código no equivalen a validación ferroviaria, registral o topográfica. Siguen pendientes la cobertura catastral integral, el detalle de la naranja, conexiones faltantes, verificación de infraestructura, demanda logística, condicionantes y costos documentados, revisión visual en navegador y verificación de despliegue.
