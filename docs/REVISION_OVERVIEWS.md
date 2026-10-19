# Revisión de perfiles generales

Generados: 2026-10-19T15:31:10.877Z. Finalizados: 2026-10-19T15:31:20.010Z.

Estado: **complete**, 1510/1510 muestras procesadas (1504 cotas reales reutilizadas de la corrida previa compatible). Las cotas ausentes se conservan como null y no se interpolan.

Fuente: Copernicus GLO-30, espejo público AWS copernicus-dem-30m, COG GeoTIFF. Acceso mediante src/elevation.js desde Node (URL directa S3), lecturas parciales de bloques, concurrencia máxima 4 y cachés compartidas durante esta ejecución. El endpoint no fija una versión de distribución: la revisión del proveedor no se infiere. El hash identifica el código y la geometría de esta corrida, no los píxeles del dataset remoto. Las cotas representan superficie DSM y no una rasante ferroviaria.

- Dataset: https://copernicus-dem-30m.s3.amazonaws.com/
- Geometría routes.geojson SHA-256: cb39aa0f4b7553b6931c34e433c3c61cec810c1233e940cce525e1f3103c2220
- Lector elevation.js SHA-256: 0ebfbecf1f3c47f83841428b6c73a0dc9befdca4db14a01adf1667cd193297e5
- Muestreo: 1000 m WGS84 por cadena continua; extremos incluidos. No se suman ni interpolan los huecos entre cadenas. part_id identifica cada cadena y break_before interrumpe el gráfico al comenzar otra.
- Transversal inicial: 50% de la longitud acumulada de cada alternativa, localizado en su cadena real; ±100 m y paso 25 m.
- Reproducir: node scripts/prepare_overviews.mjs --timeout-ms 420000

| Alternativa | Partes | Longitud m | Cotas válidas | Ausentes | Estado |
|---|---:|---:|---:|---:|---|
| T1 | 4 | 656494.963 | 671 | 0 | complete |
| T2 | 2 | 327300.162 | 339 | 0 | complete |
| T3 | 1 | 489418.661 | 500 | 0 | complete |

No se registraron errores de consulta en esta ejecución.
