# Contrato parcelario y corredor de estudio

## Alcance

Este proceso calcula qué superficies del parcelario recibido quedan dentro del corredor de estudio de ±100 m de los ejes documentados. **No determina expropiaciones, derechos de vía, dominio registral, necesidad de adquisición, indemnizaciones ni aptitud ferroviaria.** La titularidad se conserva tal como la informa la fuente catastral y requiere cotejo registral independiente.

La fuente parcelaria principal obligatoria es el **WFS público IDECAM**: <https://geonode-cam.marketsis.com.ar/geoserver/wfs>. No usar originales internos ni fuentes privadas para sustituir el servicio público. Mientras no se complete una consulta pública y su intersección, no existe un conteo real procesado. Las pruebas sintéticas no constituyen datos del proyecto. Los roles de IA ayudan al análisis y a la revisión; no sustituyen responsabilidad ni incumbencias profesionales.

## Consulta pública acotada y ejecución local

`scripts/fetch_wfs_parcels.py` consulta GetCapabilities y DescribeFeatureType antes de solicitar entidades. Los nombres de capa y campos deben elegirse explícitamente desde el catálogo/esquema público; no se deducen titulares ni se buscan campos ocultos. **No se descarga una provincia completa:** proporcionar bbox ajustados a los tramos de corredor, repitiendo `--bbox` cuando sea necesario. Un bbox devuelve parcelas completas candidatas; el recorte preciso al corredor ocurre en el siguiente paso.

```bash
python scripts/fetch_wfs_parcels.py \
  --endpoint https://geonode-cam.marketsis.com.ar/geoserver/wfs \
  --type-name CAPA_PUBLICA_VERIFICADA \
  --bbox OESTE SUR ESTE NORTE \
  --nc-field CAMPO_NC_PUBLICO
```

Los términos en mayúsculas son marcadores y deben sustituirse por valores reales, no ejemplos para ejecutar literalmente. Puede repetirse `--type-name` sólo para capas públicas elegidas explícitamente; `--owner-field CAMPO_PUBLICO` es opcional y únicamente válido si ese campo está expuesto por DescribeFeatureType. Sin ese argumento no se exporta ningún titular. El cliente usa la biblioteca estándar de Python, sin autenticar ni instalar GDAL.

El perfil está fijado a **WFS 1.0.0, EPSG:4326, ejes XY longitud/latitud**. Aunque la capa se publique en otro CRS, `srsName=EPSG:4326` solicita reproyección al servidor. Se comprueba que las geometrías devueltas sean compatibles con el bbox XY solicitado. No se usa la convención latitud/longitud de WFS 2 para EPSG:4326.

Antes y después de paginar se requiere un total verificable mediante una sonda **GetFeature GeoJSON con `maxFeatures=1` y `totalFeatures`**. No se confía en `resultType=hits` XML WFS 1.0 para concluir cero: se observó que devolvía cero aunque GetFeature GeoJSON del mismo bbox contenía una parcela. Todas las sondas y páginas llevan el mismo bbox, CRS, `propertyName` y `sortBy=fid_1` estable. Se solicita únicamente `the_geom` y el campo NC elegido; titular sólo cuando se elige explícitamente un campo público de nombre, sin pedir el resto de atributos (incluido CUIT). Los campos de geometría y ordenamiento se validan en DescribeFeatureType y pueden elegirse mediante `--geometry-field`/`--sort-field` si otra capa pública utiliza nombres diferentes. Se controlan páginas vacías prematuras, conteos cambiantes, duplicados dentro de una consulta, `startIndex` ignorado, ausencia de identificador estable o NC textual y excepciones WFS incluso con HTTP 200. Cualquier error interrumpe la escritura del resultado: no se transforma en cero parcelas ni en una conclusión de fuera del corredor. Las entidades repetidas por bbox solapados se deduplican por capa e identificador, exigiendo contenido idéntico. El límite predeterminado de 100.000 entidades impide consultas demasiado amplias y puede bajarse con `--max-features`.

La salida `data/private/wfs_parcels.geojson` conserva endpoint, fecha/hora UTC de consulta `fetched_at`, capas elegidas, campos públicos solicitados, consultas/bbox y controles de integridad. `source_date` es `null` si no se publica/no se conoce fecha de actualización; la fecha de consulta no la reemplaza. `--source-date YYYY-MM-DD` sólo se usa si esa fecha consta en la fuente y debe documentarse. Un total GeoJSON de cero, corroborado por la sonda vacía antes y después de la consulta, puede ser una consulta completa, pero sigue sin acreditar cobertura oficial.

El exportador normaliza siempre el identificador al campo **`nc`**, aunque el campo público original se llame `NOMENCLATU`. El cruce debe usar `--nc-column nc`, y se ejecuta directamente sobre ese GeoJSON público, sin geopandas/pyogrio:

```bash
python scripts/intersect_parcels.py data/private/wfs_parcels.geojson \
  --nc-column nc
```

Agregar `--owner-column owner` únicamente si se solicitó el campo público en la descarga. Si la fecha catastral es desconocida, los resultados declaran `source_date="unknown"` y `source_date_status="unknown"`. Una fecha ISO aportada explícitamente lleva `source_date_status="operator_provided"`; no inferirla desde el nombre de la capa, el mes escrito en él ni `fetched_at`.

Un GeoPackage **derivado de esa fuente pública** es entrada opcional para trabajar con QGIS. Debe conservar geometrías completas, CRS declarado, NC textual y procedencia; en ese caso son necesarios `requirements.txt`, `--layer` y los nombres reales de campos:

```bash
python scripts/intersect_parcels.py /ruta/derivado_wfs_publico.gpkg \
  --layer PARCELAS --nc-column NOMENCLATU
```

Se rechaza una entrada GeoJSON sin las marcas de descarga pública completa del cliente. `--routes` permite elegir otra versión de `public/data/routes.geojson`; nunca se usa `corridors.geojson`, simplificado para visualización. La referencia interprovincial de T1 excede Mendoza: el WFS IDECAM no acredita cobertura de los tramos fuera de la provincia.

La salida de intersecciones es `data/private/parcel_affected.geojson`, para carga local en el visor. Ambos scripts sólo permiten `--output` dentro de `data/private`, incluso con rutas relativas o enlaces simbólicos; no copiar esos archivos a `public`, GitHub ni al despliegue. La exclusión de Git no autoriza publicar los titulares del servicio.

## Método geométrico

1. Transformar los ejes originales EPSG:4326 a una proyección azimutal equidistante WGS84 regional, centrada en latitud −35,5° y longitud −67,5°. Construir buffers de 100 m a cada lado, con extremos redondos y 16 segmentos por cuadrante. Disolver por propuesta; los tramos repetidos o superpuestos no suman área de corredor dos veces. No cerrar huecos ni fabricar empalmes.
2. Transformar corredores íntegros y parcelas a Lambert azimutal igual área WGS84 con el mismo centro. Todas las superficies y proporciones se calculan en esa proyección, en m², sin simplificación. La separación entre proyección para buffer y proyección para superficie es deliberada. La equidistante conserva distancias desde su centro; el ancho local tiene distorsión residual fuera de ese punto y debe revisarse si cambia la extensión regional o se requiere definición de obra.
3. Agrupar todas las partes del mismo NC y disolverlas antes de intersectar. El denominador de porcentaje es el área geométrica total disuelta de esa NC en la capa recibida; no es una superficie de título ni un atributo declarado. Si el archivo ya fue recortado, el denominador será incompleto. Debe proporcionarse la parcela completa aunque quede mayormente fuera del corredor.
4. Intersectar parcela y corredor. Admitir solamente componentes Polygon/MultiPolygon con área estrictamente mayor que cero. Un contacto por punto o línea no cuenta. Emitir una sola entidad por combinación `(route_id, nc)`; las diferentes porciones permanecen en su geometría multiparte.
5. Exportar únicamente la geometría de intersección a EPSG:4326. Guardar los hashes SHA-256 del GeoPackage y de los ejes para reproducibilidad. Los archivos pueden contener registros fuera del corredor: se incluyen al validar la entrada, pero se exportan sólo las intersecciones positivas.

Los valores de superficie del pipeline prevalecen para el análisis parcelario sobre las áreas aproximadas del corredor que utiliza el mapa. No sumar conteos entre propuestas para obtener parcelas únicas del conjunto: una misma NC puede aparecer en varias propuestas.

## Validaciones y calidad

- Rechazar una columna NC numérica o un valor NC numérico; convertir números a texto después no recupera ceros iniciales. Conservar los caracteres del NC de texto, retirando sólo espacios en los extremos.
- Registrar filas sin NC, sin geometría, no poligonales o geométricamente inválidas en `metadata.excluded_records`. No repararlas ni eliminarlas silenciosamente. `complete_input=false` exige revisión. Si alguna parte excluida tiene NC conocida, la entidad resultante de esa NC declara `parcel_complete=false`; ni su denominador ni su porcentaje deben tratarse como completos.
- Conservar todos los nombres de titular informados para cada NC en `owner_values`. `owner` contiene esos textos unidos por ` | `; `owner_conflict=true` indica múltiples valores y no elige quién tiene mejor derecho. La mera igualdad de nombre no acredita identidad personal.
- Por propuesta informar área del corredor, suma de áreas parcelarias intersectadas, unión de superficies cubiertas, superficie sin cobertura y porcentaje cubierto. `uncovered_m2` significa ausencia de cobertura catastral o huecos, **nunca terreno sin dueño**.
- Identificar solapamientos de área positiva entre NC diferentes en `overlap_pairs` y contabilizar `overlap_excess_m2 = suma de intersecciones − unión cubierta`. La suma parcelaria puede superar la cobertura por estas inconsistencias. Los solapamientos fuera del corredor no se evalúan.
- `coverage_pct` expresa cobertura geométrica, no confiabilidad ni validación de los límites. Los segmentos aproximados siguen siendo aproximados: el buffer no mejora la precisión del eje.

## Esquema de salida

FeatureCollection con `metadata.source_date` ISO `YYYY-MM-DD` o texto `unknown`; `source_date_status` indica la incertidumbre. Cada feature tiene geometría Polygon/MultiPolygon EPSG:4326 y estas propiedades:

| Campo | Contrato |
|---|---|
| `route_id` | `T1`, `T2` o `T3` |
| `nc` | Texto no vacío, conservando ceros iniciales |
| `owner` | Texto; cadena vacía si no informado |
| `owner_values`, `owner_conflict` | Valores originales normalizados y bandera de conflicto |
| `affected_m2` | Número finito y estrictamente positivo |
| `parcel_m2` | Área completa disuelta de la NC recibida, positiva |
| `affected_pct` | Número entre 0 y 100 |
| `source_date`, `source_date_status` | Fecha de actualización informada o `unknown`; nunca fecha de consulta inferida |
| `source_rows`, `source_part_count` | Referencias a filas y número de partes válidas recibidas |
| `parcel_complete` | Falso si existen partes excluidas con la misma NC |
| `tenure_status` | `cadastral_source_not_registry_verified` |

`metadata.routes` contiene T1, T2 y T3. Una ruta con ejes efectivamente procesados tiene `evaluated=true`, `status=processed` (o `review_exclusions` si hubo filas excluidas), fecha `source_date` y sus métricas geométricas. Una ruta ausente tiene `evaluated=false`, `status=pending` y métricas `null`: **ausencia de análisis no equivale a cero parcelas**.

En esta versión `coverage_status=unknown` en todas las rutas porque no se recibió un polígono oficial de cobertura de la fuente. Ni un corredor completamente cubierto por parcelas permite declarar cobertura oficial completa. `coverage_pct` es sólo una medida geométrica de la unión de parcelas disponibles y el residuo se identifica como no cubierto por esas geometrías.

La metadata declara CRS de entrada, buffer, áreas y salida; método; filas recibidas y aceptadas; exclusiones; conflictos de titular; resumen por propuesta y calidad informada de los segmentos. Su marca de privacidad es `local_private_do_not_publish_or_commit`.

## Verificación disponible

```bash
python -m unittest discover -s tests -p test_parcels.py -v
```

Para el cliente WFS:

```bash
python -m unittest discover -s tests -p test_wfs.py -v
```

Los mocks no realizan llamadas de red. Verifican catálogo/esquema público, campos elegidos, paginación y totales, deduplicación por bbox, excepciones, truncaciones, NC/IDs faltantes, esquema NC numérico, ejes XY, regresión de hits XML cero con GeoJSON positivo y vacío comprobado sin atribuir cobertura.

Los casos geométricos controlan NC con ceros iniciales, rechazo de NC numéricas, disolución por NC y por ruta, conflictos de titular, exclusiones explícitas, contacto sin área, solapamientos entre NC, balance de cobertura, geometría recortada, porcentajes y restricción de salida privada. La lectura de GeoPackage requiere geopandas y pyogrio; el GeoJSON WFS se procesa sin ellos. Se comprobó además una consulta pública real acotada en `geonode:a__LGS_GRP_oct_SAN_RAFAEL`, bbox XY `[-68.0086, -34.6426, -68.0075, -34.6416]`: una candidata completa, una intersección con T3 y **46.177,040015 m²**, coincidente con la comprobación del cliente web (46.177,040016 m²). Se solicitaron sólo geometría y NC; no se leyó CUIT ni titular. La fecha de actualización permanece desconocida. Esta verificación no constituye un censo completo del corredor. La salida de cruce WFS incluye `query_scope=public_WFS_bbox_candidates_not_full_route_corridor_census` a nivel general y por propuesta para evitar interpretar estos números como totales del proyecto.
