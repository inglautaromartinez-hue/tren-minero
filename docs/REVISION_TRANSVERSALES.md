# Revisión de transversales precalculados

Proyecto personal LAUGIS. Generación iniciada 2026-10-19T15:58:31.284Z, finalizada 2026-10-19T15:58:31.840Z.

Estado **complete**. Se calcularon 14744 secciones, cada 100 m por cadena continua y en ambos extremos. La progresiva local reinicia en cada cadena; la global acumula longitudes sin sumar huecos. Nueve cotas reales consultadas por sección a offsets −100, −75, −50, −25, 0, 25, 50, 75 y 100 m. Datos ausentes quedan null con estado explícito, sin interpolación de cotas ni relieve sintético.

Fuente: Copernicus GLO-30 DSM, COG público AWS https://copernicus-dem-30m.s3.amazonaws.com/. Mismo lector src/elevation.js, bloques compartidos de 64 píxeles y hasta cuatro workers; lotes de 432 puntos. Valores almacenados con tres decimales por formato, no por exactitud: el modelo tiene resolución nominal de 30 m y no representa una rasante ferroviaria ni relevamiento de campo. Orientación transversal perpendicular a la tangente geodésica local. Extremos y esquinas usan el segmento precedente, según el helper geodésico existente.

| Traza | Secciones | Cotas válidas | Ausentes | Estado |
|---|---:|---:|---:|---|
| T1 | 6572 | 59148 | 0 | complete |
| T2 | 3276 | 29484 | 0 | complete |
| T3 | 4896 | 44064 | 0 | complete |

Metadatos de reproducción internos:
- Geometría SHA-256: cb39aa0f4b7553b6931c34e433c3c61cec810c1233e940cce525e1f3103c2220
- Lector SHA-256: 0ebfbecf1f3c47f83841428b6c73a0dc9befdca4db14a01adf1667cd193297e5
- Firma del checkpoint: 7637a66c173196d9c975efda9931339ab038f1c7ee1289134d8f227c34b040f9
- Reproducir: node scripts/prepare_cross_sections.mjs --resume
- Checkpoints: data/private/cross-sections/checkpoint.json, no incluidos en la publicación.
- Inicio de esta corrida: 0 secciones pendientes/incompletas; 14744 entradas de checkpoint compatibles.

No se registraron incidencias de consulta en esta ejecución.

La verificación de geometría, distancias y formato se realiza en tests/cross-sections.test.mjs; la ausencia de huecos en el catálogo no demuestra continuidad ferroviaria operativa. Esta generación no certifica la precisión ni resuelve incertidumbre de los ejes originales.

## Completitud, faltantes y dependencias

Generación completa significa que todas las estaciones fueron consultadas/procesadas y ninguna queda pending. No exige inventar cotas si el raster devuelve NoData: all_samples_valid y elevation_status informan por separado la cobertura de elevación. Cada sección ausente conserva null, status, missing_reason y attempts. El lector compartido no permite distinguir NoData de fallos individuales de lectura: nodata_or_read_failure conserva esa ambigüedad; query_failure identifica un lote que lanzó excepción. Máximo tres intentos por sección, preservando las cotas reales ya obtenidas.

Primera generación compatible: 2026-10-19T15:54:13.045Z. Los archivos públicos contienen únicamente contrato de visualización; hashes y checkpoint son internos.

- src/geo.mjs SHA-256: b46acd935d755cf04ae5b4323497fbc58723b60368a0b09add0914b63cf4dd51
- src/selection.mjs SHA-256: 8a160435a3293a3f061b6e744bed771e6acff87de6fb06b129d493f446d47e74
- src/route-study.mjs SHA-256: 73c86c73145b8b95201393482e0839301178c6f891ff372c7e1e4d4b2ecbdaa3
- src/cross-sections.mjs SHA-256: 557e8ae40837d4ebd00c93996c7d9245e288115f6201d699c047f69adf5b5628

Los hashes de todos los helpers intervienen en la firma y bloquean reusar un checkpoint si cambia la geometría o el código de muestreo. Esta normalización migró explícitamente el checkpoint de la primera corrida v1 mediante --accept-legacy-checkpoint: mismas fuentes/lector y cotejo de ID, progresiva y centro antes de reutilizar cotas. No se recalcularon ni interpolaron las cotas.

## Verificación ejecutada de esta entrega

La primera corrida consultó realmente S3 y terminó en 248,4 segundos: 14.744 secciones y 132.696 cotas finitas. No hubo muestras ausentes ni errores registrados. La segunda ejecución normalizó el contrato JSON y metadatos mediante `--resume --accept-legacy-checkpoint`: reutilizó las 14.744 entradas compatibles, sin nuevas consultas, en 0,6 segundos. La fecha de primera generación permanece en el índice y el checkpoint.

`node --test tests/cross-sections.test.mjs`: **7/7 PASS**, sin omisiones. Se verificaron reinicio por cadena, exclusión de huecos, extremos e IDs deterministas sin duplicados, nueve offsets geodésicos ±100 m, preservación de cotas/faltantes, búsqueda más cercana restringible por parte, catálogo real 6.572/3.276/4.896 y completitud del contrato público. El test distingue completitud de procesamiento de cobertura de elevación; no exige sustituir NoData por cotas.

Archivos finales: `cross-sections-T1.json` (~1,7 MB), `cross-sections-T2.json` (~851 KB), `cross-sections-T3.json` (~1,3 MB) e índice (~1 KB), cargables por alternativa. Cada entrada conserva progresiva local, acumulada sin huecos, centro, parte, nueve cotas y estado; no contiene hashes de fuentes. No se verificó aquí la interacción de la interfaz ni se dio por aprobado un despliegue.
