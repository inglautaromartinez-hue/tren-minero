# Revisión independiente de aplicación

Fecha: 2026-10-19. Rol: QA independiente del autor del frontend. Alcance: `src/main.js`, `src/elevation.js`, `src/geo.mjs`, `src/parcel-data.mjs`, `src/style.css` e `index.html`. Entregables de QA: este registro y `tests/app-contract.test.mjs`. Las correcciones de producto las integra el coordinador; QA no editó esas fuentes.

## Resultado y límites

**PASS en los controles automatizados locales ejecutados; WARN para la experiencia visual y la integración remota pendientes.** Este resultado permite revisar la implementación preliminar, no aprobar elevaciones reales, resultados catastrales ni viabilidad ferroviaria.

| Control | Resultado | Evidencia |
|---|---|---|
| Contrato de carga parcelaria local | PASS | Rechazo de NC numérica, duplicados por propuesta, área no finita, porcentaje fuera de rango, titular no textual, Feature incorrecto, anillos vacíos/abiertos, coordenadas no finitas o fuera de WGS84 y CRS proyectado explícito. |
| Ausencia de cobertura | PASS | `routeSummary` conserva `null` para propuesta sin datos y sin cobertura confirmada; cargar otra propuesta no produce cero en ésta. Observaciones positivas con cobertura no confirmada se distinguen como parciales. |
| Orientación transversal | PASS | Prueba con avance norte y sur: izquierda negativa, derecha positiva; ancho total de 200 m. |
| Lector de elevación aislado | PASS | Lectura por ventana acotada, caché compartida, cota cero válida, NoData, falta de cobertura y cancelación anterior/durante la última muestra. |
| Suite completa local | PASS | `npm test`: 16 pruebas aprobadas, ninguna omitida, al cierre de esta revisión local. |
| Compilación | PASS | `npm run build`: Vite compiló 81 módulos, salida sin errores. |
| Mapa, perfiles y carga de archivos en navegador | NOT_RUN | Sin navegador autorizado disponible en este entorno. No se inició servidor, navegador alternativo ni instalación de browser. |
| Experiencia móvil, teclado, zoom táctil y gráficos | NOT_RUN | Inspección estática de controles, estados y CSS; falta ejecución visual. |
| AWS Copernicus real, CORS, Range y valores de terreno | NOT_RUN | Las pruebas COG usan un doble TIFF sintético explícito y no hacen solicitudes de red. No validan la disponibilidad ni exactitud del servicio. |
| API parcelaria IDECAM en vivo y paginación real | NOT_RUN | Integración nueva solicitada durante la revisión; requiere validación propia posterior. No se acreditan disponibilidad, conteos ni titulares reales por pruebas unitarias. |
| Cruce con parcelario real | NOT_RUN | No se recibió un parcelario real para esta revisión; ninguna geometría de prueba equivale a una parcela del proyecto. |

Los números de pruebas y módulos describen la ejecución realizada, no posteriores cambios concurrentes. El coordinador debe repetir los controles relevantes si cambia la integración.

## Defectos detectados y correcciones revisadas

Las líneas son aproximadas porque varias funciones están compactadas.

| ID | Severidad | Hallazgo inicial | Resolución observada |
|---|---|---|---|
| QA-01 | Alta | `main.js`, carga parcelaria, antes ~35: admitía polígonos vacíos, coordenadas proyectadas y Feature incorrecto; la tabla podía presentar métricas antes de fallar al dibujar. | Validador puro `parcel-data.mjs`, líneas ~1–14. Casos inválidos rechazados antes de aceptar el archivo. No sustituye validación topológica GIS de autointersecciones, agujeros o coherencia de superficies. |
| QA-02 | Alta | `main.js`, métricas y comparación, ~24/27: una propuesta ausente de una carga parcial figuraba con cero parcelas y cero hectáreas. | `routeSummary` y estados de cobertura; ausencia de evaluación conserva `null`/Pendiente. Cero exige cobertura completa explícita. La declaración de cobertura debe tener respaldo de la fuente. |
| QA-03 | Alta | `geo.mjs`, `transverse`, ~6: la normal matemática positiva correspondía a izquierda, contradiciendo la leyenda izquierda negativa/derecha positiva. | Normal corregida. El test falló en la versión inicial y pasó después de la corrección, en ambos sentidos del eje. |
| QA-04 | Media | `main.js`, `loadProfile`/`loadCross`, ~31–32: selección y muestreo se leían después de una espera; resultados obsoletos se asignaban al estado global antes del control de revisión. El paso mostrado podía diferir del muestreado. | Captura previa de feature, paso y fracción; resultado local y guard antes de asignación. Confirmado por inspección estática; carreras de UI no ejecutadas en navegador. |
| QA-05 | Media | `elevation.js`, ~6: cancelar durante la última lectura podía devolver resultado normal y progreso tardío. | Chequeos después del `await` y al finalizar; AbortError se propaga. Prueba reprodujo el fallo inicial y verifica descarte del resultado corregido. Cancelar resultados no demuestra interrupción física inmediata del tráfico de geotiff. |

## Observaciones pendientes

- **WARN, progresivas:** el muestreo JavaScript utiliza distancia Haversine esférica e interpolación de longitud/latitud; las métricas de longitud de los ejes son elipsoidales WGS84. Declarar la diferencia y evitar presentar las progresivas del visor como replanteo o definición de ingeniería.
- **WARN, controles transversales:** cuando el usuario mueve la progresiva durante una consulta, debe quedar claro a qué posición corresponde el resultado. Capturar la fracción evita mezclar cálculos; deshabilitar el control durante la espera o rotular la fracción calculada evita ambigüedad visual.
- **PASS, identidad parcelaria:** el validador ahora rechaza NC con espacios extremos, evitando que `001234` y ` 001234 ` eludan la deduplicación. El pipeline recorta esos espacios antes de exportar; se añadió un caso de rechazo al contrato web.
- **WARN, móvil y layout:** la leyenda usa posición inferior fija mientras el perfil puede expandirse a 52dvh/44dvh. Revisar solapamientos con transversal abierto, pantallas de poca altura, sidebar y controles de zoom. Es una hipótesis de revisión estática, no un defecto visual demostrado.
- **WARN, elevación remota:** la apertura completa de metadatos (`fromUrl` y `getImage`) ya comparte timeout por inspección del código corregido. Queda validar mosaicos de diferentes grados, NoData, límites de tiles y comparación puntual con una fuente conocida. La prueba aislada no valida los metadatos ni el datum vertical de los archivos reales.

## Privacidad y trazabilidad

La carga manual inspeccionada lee el archivo en el navegador y mantiene sus datos en memoria. No incorpora una subida del GeoJSON a GitHub ni a Vercel. Los campos mostrados como HTML pasan por escape; la exportación CSV usa neutralización de prefijos de fórmula. Esto es revisión de código y contratos, no una captura de tráfico de un navegador.

Los fixtures de pruebas son sintéticos, breves y no contienen titulares reales. No se agregó parcelario privado ni un MDE al repositorio. La futura consulta WFS pública debe respetar la misma separación: obtener datos de una fuente pública no autoriza incorporar titulares a los assets públicos o al historial Git.

Siguiente responsable: coordinador DEV/UX para la integración; QA de navegador y responsable GIS para validar los flujos completos con insumos reales. G1 (terreno), G2 (parcelas) y la aprobación de ingeniería permanecen sujetos a sus controles propios.

## Adenda: cliente WFS acotado

Por asignación posterior del coordinador, este agente implementó `src/wfs-client.mjs` y `tests/wfs-client.test.mjs`. **Para este módulo ya no se considera revisor independiente de su propia implementación**; el coordinador debe revisar el contrato y la integración antes de aceptarlo.

`node --test tests/wfs-client.test.mjs`: **10/10 PASS**, con respuestas HTTP sintéticas y ninguna consulta en vivo. Los casos cubren paginación con total estable, NC como texto, whitelist de campos, IDs entre capas, consulta vacía con cobertura desconocida, total desconocido/inestable, duplicación de página, página vacía prematura, límite global, HTTP/HTML/XML, CRS/geometría/atributos incompatibles, allowlist, bbox y cancelación.

La API acepta exclusivamente el endpoint público IDECAM y cinco capas nominales verificadas por el coordinador. Solicita páginas de 500, orden por `fid_1`, `startIndex`, WFS 1.0.0 y EPSG:4326 con orden longitud/latitud. El límite global es de 5.000 entidades como máximo; superar el límite produce error y requiere acotar el área. No se devuelve una colección parcial como completa.

La salida conserva sólo los cuatro atributos catastrales previstos, NC canónica, capa de origen, identificador prefijado y geometría. Omite nombres no solicitados y CUIT incluso si la respuesta los incluyera. No usa credenciales, no publica la respuesta ni atribuye fecha de actualización desconocida a la fecha de descarga. `query_complete=true` significa completitud de esa bbox y esas capas bajo las comprobaciones de paginado; `coverage_status` permanece `unknown`. Un total estable y orden fijo reducen inconsistencias pero no garantizan una instantánea transaccional si el servidor cambia entidades manteniendo el mismo total.

La verificación real del endpoint, permisos, CORS, esquema y conteos corresponde al coordinador y se registra por separado. Las diez pruebas nuevas no certifican ese funcionamiento remoto ni la integración del botón de consulta con mapa/cruce.

## Adenda: intersecciones web y pasarela de elevación

Revisión independiente de `src/parcel-intersection.mjs`, `src/parcel-worker.js` y `api/dem.js`, implementados por el coordinador. Los tests agregados por QA son `tests/parcel-intersection.test.mjs` (6/6 PASS) y `tests/dem-api.test.mjs` (4/4 PASS). Se añadió además un contrato aislado de la rama web del lector COG: simula la presencia de `window` únicamente para comprobar que la URL utiliza `/api/dem`; no inicia ni valida un navegador.

| Hallazgo inicial | Severidad | Corrección revisada y evidencia |
|---|---|---|
| Varios componentes de corredor con igual ruta podían emitir pares NC/ruta repetidos y duplicar la suma. | Alta | Disolución de corredores por ruta antes del cruce; test con corredor duplicado emite una entidad y una sola superficie. |
| Las rutas ausentes se marcaban evaluadas con métricas cero. | Alta | Sólo rutas presentes se evalúan; las demás conservan conteos y superficies `null`. |
| Rango HTTP inclusivo admitía un byte por encima del máximo de 2 MiB e índices no seguros. | Media | Rango verificado con `end-start+1`, números enteros seguros y caso límite exacto. |
| Un 206 de otra posición o sin Content-Range podía entregarse como bloque válido. | Alta | Validación de posición inicial, posición final, tamaño total y cantidad de bytes contra Content-Range; tests rechazan posición equivocada, encabezado ausente y cuerpo truncado. |

Los casos de intersección comprueban disolución por NC, ceros iniciales, omisión de atributos privados, agujeros y orientación, porcentaje respecto a parcela completa, contacto sin área y unión de cobertura de NC superpuestas. Se verifican propiedades geométricas con polígonos sintéticos; no reemplazan una comparación del cruce web con la salida GIS de producción sobre parcelas reales.

Las pruebas de la pasarela sustituyen `fetch` con respuestas sintéticas. Comprueban endpoint S3 fijo, teselas permitidas, denegación de URLs arbitrarias, redirecciones deshabilitadas, rangos acotados y errores del upstream. No acreditan despliegue de funciones Vercel, CORS en navegador, tráfico real, CDN ni exactitud altimétrica. Tampoco ejecutan el Web Worker o sus mensajes en un navegador.

**WARN residual:** las intersecciones geométricas se realizan en longitud/latitud y sus superficies se miden elipsoidalmente. El método queda declarado; la comparación con GIS sobre ejes y parcelario reales sigue pendiente. Las exclusiones geométricas deben conservar sus advertencias y no presentarse como ausencia de afectación. Toda suma observada mantiene cobertura oficial desconocida y fuente temporal desconocida cuando el WFS no la informa.
