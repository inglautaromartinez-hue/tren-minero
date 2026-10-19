# Tren Minero · instrucciones de trabajo

Este repositorio contiene una evaluación territorial preliminar y su visor. Responsable del proyecto: **Ing. Agrim. LAUTARO DARIO MARTINEZ**. Las tareas de IA apoyan al responsable: no constituyen acreditaciones profesionales, dictámenes legales ni aprobación de un proyecto ferroviario.

## Equipo obligatorio

El agente coordinador actúa como PM e integrador. Antes de un cambio importante debe identificar los roles pertinentes de `docs/EQUIPO_Y_CONTROLES.md`, sus entradas, salidas y un revisor independiente. Usar subagentes reales de manera proporcional para tareas que puedan ejecutarse en paralelo; declarar cuáles se activaron, su alcance y resultado. Un perfil documentado no equivale a un agente ejecutándose. No crear un servicio de agentes permanente ni llamadas pagas a modelos sin una necesidad explícita del producto.

Roles previstos: investigación y fuentes; topografía/geodesia/MDE; GIS y catastro; ingeniería ferroviaria; minería; logística; gestión predial y expropiaciones; geología/geotecnia; hidrología; economía; arquitectura y desarrollo; UX/cartografía; QA independiente. El PM puede asumir varios roles en una tarea acotada, declarando esa limitación. El autor no se declara auditor independiente de su propia salida.

## Contrato científico y de datos

- Mantener originales inmutables y registrar archivo, hash, fecha, procedencia, licencia cuando se conozca, CRS, método y versión de cada derivado. Corregir en una capa nueva con historial; nunca disimular modificaciones del eje recibido.
- Separar evidencia **medida**, **documentada**, **testimonial**, **estimada** y **supuesta**. Un valor calculado sobre un dibujo aproximado sigue siendo una estimación. Registrar fuente y alcance espacial/temporal de cada afirmación.
- Valores ausentes, consultas fallidas y cobertura desconocida se expresan como `null` o estado explícito. Nunca convertirlos en cero ni en ausencia de afectación.
- Definir el CRS de cada operación por el alcance del trabajo y registrar su justificación. No medir áreas o buffers en grados ni en Web Mercator. No copiar el CRS de otro proyecto sin evaluar distorsión. Informar por separado longitudes geodésicas, métricas proyectadas y superficies.
- El corredor de estudio es de **100 m a cada lado del eje**. Disolver superposiciones dentro de cada alternativa antes de totalizar. No denominar su superficie «expropiación». El área del corredor completo y el área de parcelas intersectadas son métricas distintas.
- La fuente parcelaria principal indicada por el usuario es el **WFS público IDECAM**: `https://geonode-cam.marketsis.com.ar/geoserver/wfs`. Descubrir capacidades, capas y esquema; consultar el corredor con paginación y comprobar completitud. GPKG/importación local es sólo una opción de reproducción o respaldo, no un requisito para iniciar las consultas públicas. No declarar validado el acceso ni disponible el titular sin una respuesta comprobada.
- Cada ejecución WFS registra endpoint, versión, capa, campos reales, filtro y CRS, fecha/hora de consulta, paginación, registros anunciados/devueltos, deduplicación, cobertura y estado de completitud/truncamiento. Conservar hash o snapshot controlado para reproducción. Una respuesta parcial no produce un total completo; error, capa faltante, límite o timeout no equivalen a «fuera» ni a cero parcelas.
- Preservar NC e identificadores como texto. Identificar fuente, fecha, alcance y calidad de titulares; no inferir titularidad de la mera geometría. No publicar titulares o datos personales en GitHub ni en el visor público por defecto; mantener esos insumos en almacenamiento de acceso controlado.
- No cerrar huecos, completar itinerarios, cambiar radios, suavizar ejes ni unir extremos automáticamente sin una decisión registrada. La cercanía geométrica no demuestra conexión física u operación ferroviaria.
- La revisión `docs/REVISION_GIS.md` documenta buffers AEQD nominales, superficies elipsoidales WGS84 tras densificar contornos y una distorsión de escala muestreada máxima aproximada de 0,0371 %. No usar área plana AEQD como área elipsoidal ni convertir esa cifra muestreada en una garantía de precisión del eje. G0 conserva `WARN` por gaps y aproximaciones: no hay aprobación completa de itinerarios.
- Las tres propuestas tienen extremos y funciones diferentes. No producir un ranking de «mejor traza» por totales brutos. Toda comparación exige alcance, criterios, pesos, restricciones y análisis de sensibilidad explícitos; no inventar demanda, costos, normas ni estado de vías.
- El perfil del terreno no es la rasante ferroviaria. Registrar modelo, resolución, datum vertical, NoData, muestreo y ventana de pendiente. No crear relieve sintético cuando falte MDE ni presentar interpolación densa como mayor resolución del insumo.

## Repositorio y coordinación

- Revisar el estado existente antes de editar. Un editor por archivo durante trabajo paralelo; asignar áreas por escrito y comunicar interfaces.
- Cambios importantes en ramas y PR revisable. Nunca hacer force-push ni reescribir historia ajena. No fusionar cambios metodológicos sin revisión de otro rol y registro de la decisión.
- No subir secretos, credenciales, titulares, parcelarios originales, mosaicos MDE ni grandes datasets GIS al repositorio. Versionar código, esquemas, manifiestos, muestras sanitizadas y derivados públicos livianos. Las fuentes adjuntas se conservan en su ubicación original; el manifiesto guarda sus referencias.
- Mantener `config/project.json`, manifiestos y documentación coherentes. Los estados deben describir evidencias comprobadas, no planes futuros como resultados.
- Los resultados de cada rol entregan: tarea, insumos/versiones, método/parámetros, archivos, comprobaciones, limitaciones, estado y siguiente responsable. Usar `PASS`, `WARN`, `BLOCKED` o `NOT_RUN` para controles.

## Verificación y publicación

Seguir los gates de `docs/EQUIPO_Y_CONTROLES.md`. Se puede publicar un visor preliminar con faltantes claramente identificados, pero eso no aprueba los gates científicos pendientes. No anunciar disponibilidad remota sin una URL comprobada ni declarar probado un flujo que no se ejecutó.

Antes de integrar: ejecutar `npm test`, `npm run build` y las verificaciones GIS pertinentes (`python scripts/prepare_routes.py` según sus argumentos y pruebas Python disponibles). Registrar comandos y resultados reales. Verificar interacción de mapa y perfiles, estados vacíos/error, cobertura, conteos y móvil cuando el cambio afecte esos flujos. Los fallos bloquean la función afectada; no obligan a inventar datos para completar la pantalla.

Ante contradicción entre fuente, código y resultado, conservar evidencia, abrir una incidencia y detener solamente la conclusión o capa afectada. Resolver incertidumbres ordinarias dentro del alcance autorizado; llevar al responsable decisiones de criterio profesional, metodología o publicación que requieran su definición.
