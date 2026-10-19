# Revisión del censo parcelario público

Fuente: **IDECAM, servicio WFS público**, https://geonode-cam.marketsis.com.ar/geoserver/wfs. Fecha de consulta/compilación: 2026-10-19T16:06:14.784731+00:00. Fecha de actualización catastral: desconocida. No se solicitaron CUIT ni titulares.

Se completó el plan previsto: 255/255 consultas. El plan contiene 152 piezas geodésicas de hasta 10 km sin unir huecos, con 200 m de margen y muestras cada 500 m para envolver los arcos. Las cinco capas permitidas se eligen por intersección con sus LatLongBoundingBox publicadas. Cuatro hilos; respuesta única autocontenida si totalFeatures entero coincide con el número de entidades (máximo 500); si se pagina, totales estables, IDs únicos y sonda final. Orden estable fid_1; únicamente the_geom,NOMENCLATU. Las capas nativas EPSG:22172 pueden devolver candidatas fuera del bbox WGS84 por la envolvente reproyectada; se registran y conservan, verificando CRS y coordenadas, y se recortan exactamente después. Respuestas originales seleccionadas, geometrías parcelarias completas e identificadores estables se conservan sólo en data/private/census.

## Geometría y áreas

Los buffers utilizados son los geodésicos nominales WGS84 de data/private/census-buffers.geojson: tiras de hasta 500 m y círculos de 64 lados, disueltos sin puentes por propuesta. Se mide superficie elipsoidal WGS84, conservando orientación y huecos. Las parcelas se disuelven por NC antes de medir su superficie completa.

El snapshot público contiene solamente **parcela ∩ soporte de 125 m**, con parcel_m2 calculado desde la parcela original completa y support_m2 para el recorte auxiliar. No se lo presenta como superficie afectada. El visor vuelve a intersectar ese apoyo con el buffer efectivo de 100 m. El índice informa las estadísticas verdaderas de 100 m. Cada `analysis_url` apunta a `parcel-analysis-T1/T2/T3.geojson`: intersecciones de100m ya calculadas, con NC, denominador original y superficies. La vista general las carga directamente sin recalcular polígonos en el navegador; el apoyo125m queda para selecciones personalizadas. El margen de 25 m facilita recortes consistentes; una selección fuera del soporte requiere nueva consulta WFS.

Los contornos completos se publican exclusivamente como dibujos generalizados con tolerancia de 2 m en AEQD y atributos NC. Están marcados visual_only y nunca se usan como denominador ni geometría analítica. No se publican originales WFS, nombres, CUIT ni archivos de descarga.

| Propuesta | Consultas completas | Candidatas | NC afectadas 100 m | Suma m² | Unión cubierta m² | Cobertura geométrica % | Estado |
|---|---:|---:|---:|---:|---:|---:|---|
| T1 | 73/73 | 5660 | 957 | 52986619.751 | 51987739.409 | 39.664416 | complete_public_queries |
| T2 | 44/44 | 3720 | 60 | 39533530.268 | 39209556.356 | 59.847944 | complete_public_queries |
| T3 | 138/138 | 15820 | 1060 | 55328479.551 | 54634269.358 | 55.925963 | complete_public_queries |

Completar el plan de consultas no acredita cobertura catastral oficial: coverage_status permanece unknown. La superficie residual no equivale a terreno sin propietario. T1 contiene recorridos fuera de las extensiones de estas capas y fuera de Mendoza. Geometrías inválidas o cambios de una misma entidad entre consultas se registran explícitamente y condicionan el estado de revisión.

Hash interno de los ejes: cb39aa0f4b7553b6931c34e433c3c61cec810c1233e940cce525e1f3103c2220

Reproducir descarga: python scripts/prepare_route_parcels.py. Reanalizar sin red usando descargas privadas: python scripts/prepare_route_parcels.py --analyze-only.

Incidencias geométricas de la fuente fuera del soporte: 3. Sus envolventes son disjuntas del soporte de125m, no tienen otras partes válidas de la misma NC y no afectan numerador ni denominador. Permanecen registradas en data/private/census/source-geometry-warnings.json. Exclusiones que sí condicionan el análisis: 0.

Hash interno buffer100/125: 14a6cdc1fc5f2ec89dc4116e7f007b93b40eab3f7a785e88702e6ff0a9d43a08
El índice público no contiene hashes internos. La auditoría independiente del plan comprobó que las envolventes cubren todo el soporte de125m y, por cada capa, su intersección con la extensión publicada.
