"""Private, reproducible cadastral screening of ±100 m study corridors.

CLI reads public WFS GeoJSON directly, or an optional derived GeoPackage through pyogrio. Geometry functions intentionally accept
plain records so that analytical invariants can be verified without GDAL.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import date
from functools import lru_cache
import hashlib
import json
import math
import numbers
from pathlib import Path

from pyproj import CRS, Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parents[1]
BUFFER_CRS = CRS.from_proj4(
    "+proj=aeqd +lat_0=-35.5 +lon_0=-67.5 +datum=WGS84 +units=m +no_defs"
)
AREA_CRS = CRS.from_proj4(
    "+proj=laea +lat_0=-35.5 +lon_0=-67.5 +datum=WGS84 +units=m +no_defs"
)
ROUTE_IDS = {"T1", "T2", "T3"}


@lru_cache(maxsize=32)
def transformer(source, target):
    return Transformer.from_crs(source, target, always_xy=True).transform


def project(geometry, source, target):
    return transform(transformer(CRS.from_user_input(source), CRS.from_user_input(target)), geometry)


def missing(value):
    return value is None or (isinstance(value, float) and math.isnan(value))


def validate_nc(value, row):
    if missing(value):
        return None
    # Even integral numeric values cannot recover leading zeroes safely.
    if isinstance(value, numbers.Number):
        raise ValueError(f"Fila {row}: NC numérica {value!r}; reexportar como texto desde la fuente original.")
    if not isinstance(value, str):
        raise ValueError(f"Fila {row}: NC debe ser texto, recibido {type(value).__name__}.")
    return value.strip() or None


def polygonal(geometry):
    """Extract polygon parts; touching lines/points do not count as affectation."""
    if geometry.is_empty:
        return None
    if geometry.geom_type in {"Polygon", "MultiPolygon"}:
        return geometry
    if geometry.geom_type == "GeometryCollection":
        polygons = [polygonal(part) for part in geometry.geoms]
        polygons = [part for part in polygons if part is not None]
        return unary_union(polygons) if polygons else None
    return None


def build_corridors(routes):
    """Rebuild unsimplified round-cap buffers; never consume display corridors."""
    grouped = defaultdict(list)
    segments = []
    for i, feature in enumerate(routes.get("features", [])):
        props = feature.get("properties", {})
        rid = props.get("route_id")
        if rid not in ROUTE_IDS:
            raise ValueError(f"Ruta inválida en feature {i}: {rid!r}.")
        geom = shape(feature["geometry"])
        if geom.is_empty or not geom.is_valid or geom.geom_type not in {"LineString", "MultiLineString"}:
            raise ValueError(f"Eje inválido en feature {i}; corregir la fuente, sin ajuste automático.")
        metric = project(geom, 4326, BUFFER_CRS)
        grouped[rid].append(metric.buffer(100, quad_segs=16))
        segments.append({"route_id": rid, "segment_id": props.get("segment_id"), "quality": props.get("quality")})
    if not grouped:
        raise ValueError("No hay ejes de rutas para procesar.")
    return {rid: project(unary_union(parts), BUFFER_CRS, AREA_CRS) for rid, parts in grouped.items()}, segments


def analyze(records, parcel_crs, routes, source_date=None):
    """Records have nc, optional owner, geometry and optional source_row fields."""
    source_date = source_date or "unknown"
    if source_date != "unknown":
        date.fromisoformat(source_date)
    source_date_status = "unknown" if source_date == "unknown" else "operator_provided"
    source_crs = CRS.from_user_input(parcel_crs)
    grouped, owners, rows = defaultdict(list), defaultdict(set), defaultdict(list)
    issues = []
    count = 0
    for position, record in enumerate(records):
        count += 1
        row = str(record.get("source_row", position))
        nc = validate_nc(record.get("nc"), row)
        geom = record.get("geometry")
        reasons = []
        if nc is None:
            reasons.append("missing_nc")
        if geom is None or geom.is_empty:
            reasons.append("missing_geometry")
        elif not geom.is_valid:
            reasons.append("invalid_geometry")
        elif geom.geom_type not in {"Polygon", "MultiPolygon"}:
            reasons.append("non_polygon_geometry")
        if reasons:
            issues.append({"source_row": row, "nc": nc, "issues": reasons})
            continue
        area_geom = project(geom, source_crs, AREA_CRS)
        if not area_geom.is_valid or not math.isfinite(area_geom.area) or area_geom.area <= 0:
            issues.append({"source_row": row, "nc": nc, "issues": ["invalid_projected_geometry"]})
            continue
        grouped[nc].append(area_geom)
        rows[nc].append(row)
        owner = record.get("owner")
        if not missing(owner) and str(owner).strip():
            owners[nc].add(str(owner).strip())
    parcels = {}
    for nc, parts in grouped.items():
        parcel = unary_union(parts)
        if not parcel.is_valid or parcel.is_empty or parcel.area <= 0:
            raise ValueError(f"Unión por NC inválida: {nc}.")
        parcels[nc] = parcel
    incomplete_ncs = {issue["nc"] for issue in issues if issue["nc"] is not None}
    corridors, segments = build_corridors(routes)
    output = []
    summaries = {rid: {"evaluated": False, "status": "pending", "coverage_status": "unknown",
                       "source_date": source_date, "source_date_status": source_date_status, "parcel_count": None, "corridor_m2": None,
                       "affected_sum_m2": None, "covered_union_m2": None, "uncovered_m2": None,
                       "coverage_pct": None, "overlap_excess_m2": None, "overlap_pairs": []}
                 for rid in sorted(ROUTE_IDS)}
    parcel_ncs = list(parcels)
    parcel_geoms = [parcels[nc] for nc in parcel_ncs]
    tree = STRtree(parcel_geoms)
    for rid, corridor in sorted(corridors.items()):
        intersections, affected_ncs = [], []
        for idx in tree.query(corridor, predicate="intersects"):
            nc = parcel_ncs[int(idx)]
            parcel = parcels[nc]
            clipped = polygonal(parcel.intersection(corridor))
            if clipped is None or clipped.area <= 0:
                continue
            area, parcel_area = clipped.area, parcel.area
            if not math.isfinite(area):
                raise ValueError(f"Área no finita: {rid}/{nc}.")
            names = sorted(owners[nc])
            props = {
                "nc": nc, "route_id": rid, "owner": " | ".join(names),
                "owner_values": names, "owner_conflict": len(names) > 1,
                "affected_m2": area, "affected_pct": min(100.0, max(0.0, 100 * area / parcel_area)),
                "parcel_m2": parcel_area, "source_date": source_date, "source_date_status": source_date_status,
                "source_rows": rows[nc], "source_part_count": len(grouped[nc]),
                "parcel_complete": nc not in incomplete_ncs,
                "tenure_status": "cadastral_source_not_registry_verified",
            }
            output.append({"type": "Feature", "properties": props, "geometry": mapping(project(clipped, AREA_CRS, 4326))})
            intersections.append(clipped)
            affected_ncs.append(nc)
        covered = unary_union(intersections)
        overlap_pairs = []
        clipped_tree = STRtree(intersections)
        for i, geometry in enumerate(intersections):
            for j in clipped_tree.query(geometry, predicate="intersects"):
                j = int(j)
                if j <= i:
                    continue
                area = geometry.intersection(intersections[j]).area
                if area > 0:
                    overlap_pairs.append({"nc_a": affected_ncs[i], "nc_b": affected_ncs[j], "overlap_m2": area})
        uncovered = corridor.difference(covered)
        summaries[rid] = {
            "evaluated": True, "status": "review_exclusions" if issues else "processed",
            "coverage_status": "unknown", "source_date": source_date, "source_date_status": source_date_status,
            "coverage_status_reason": "official_source_coverage_polygon_not_provided",
            "parcel_count": len(affected_ncs), "corridor_m2": corridor.area,
            "affected_sum_m2": sum(g.area for g in intersections), "covered_union_m2": covered.area,
            "uncovered_m2": uncovered.area,
            "coverage_pct": 100 * covered.area / corridor.area,
            "overlap_excess_m2": max(0.0, sum(g.area for g in intersections) - covered.area),
            "overlap_pairs": overlap_pairs,
            "uncovered_interpretation": "missing_cadastral_coverage_or_gaps_not_unowned_land",
        }
    output.sort(key=lambda f: (f["properties"]["route_id"], f["properties"]["nc"]))
    metadata = {
        "schema_version": 1, "source_date": source_date, "source_date_status": source_date_status,
        "buffer_each_side_m": 100, "buffer_end_cap": "round", "buffer_quad_segs": 16,
        "buffer_crs": BUFFER_CRS.to_string(), "area_crs": AREA_CRS.to_string(),
        "input_crs": source_crs.to_string(), "output_crs": "EPSG:4326",
        "area_method": "WGS84 regional Lambert azimuthal equal area; unsimplified geometry",
        "input_records": count, "accepted_records": count - len(issues), "unique_nc": len(parcels),
        "excluded_records": issues, "complete_input": not issues,
        "owner_conflict_ncs": sorted(nc for nc in owners if len(owners[nc]) > 1),
        "routes": summaries, "segments": segments,
        "study_scope": "study_corridor_not_expropriation_boundary",
        "tenure_status": "cadastral_source_not_registry_verified",
        "privacy": "local_private_do_not_publish_or_commit",
    }
    return {"type": "FeatureCollection", "metadata": metadata, "features": output}


def private_output(path):
    resolved = Path(path).resolve()
    allowed = (ROOT / "data/private").resolve()
    if not resolved.is_relative_to(allowed):
        raise ValueError(f"La salida debe estar dentro de {allowed}; nunca publicar titulares.")
    return resolved


def read_input(path, layer, nc_column, owner_column=None):
    """Accept the public WFS export directly; a derived GPKG remains optional."""
    path = Path(path)
    if path.suffix.lower() in {".geojson", ".json"}:
        payload = json.loads(path.read_text(encoding="utf-8"))
        meta = payload.get("metadata", {})
        if (payload.get("type") != "FeatureCollection" or meta.get("source") != "public_wfs"
                or meta.get("complete_download") is not True
                or meta.get("source_crs") != "EPSG:4326"
                or meta.get("axis_order") != "XY_longitude_latitude"):
            raise ValueError("Se requiere GeoJSON público WFS completo generado por fetch_wfs_parcels.py.")
        if not isinstance(payload.get("features"), list):
            raise ValueError("GeoJSON público sin lista de entidades.")
        records = []
        for i, feature in enumerate(payload["features"]):
            props = feature.get("properties") or {}
            if nc_column not in props:
                raise ValueError(f"No existe la columna {nc_column!r} en el GeoJSON público.")
            if owner_column and owner_column not in props:
                raise ValueError(f"No existe la columna {owner_column!r} en el GeoJSON público.")
            records.append({"source_row": feature.get("id", str(i)), "nc": props[nc_column],
                            "owner": props.get(owner_column) if owner_column else None,
                            "geometry": shape(feature["geometry"]) if feature.get("geometry") else None})
        source_info = {key: meta.get(key) for key in ["source", "endpoint", "fetched_at", "type_names", "nc_field", "owner_field", "queries", "source_date", "source_date_status"]}
        return records, CRS.from_epsg(4326), source_info
    if not layer:
        raise ValueError("--layer es obligatorio para un GeoPackage derivado de la fuente pública.")
    try:
        import geopandas as gpd
        import pandas as pd
        import pyogrio  # noqa: F401
    except ImportError as exc:
        raise ValueError("Instalar requirements.txt: geopandas y pyogrio para GeoPackage; GeoJSON WFS usa sólo shapely/pyproj.") from exc
    frame = gpd.read_file(path, layer=layer, engine="pyogrio")
    if frame.crs is None:
        raise ValueError("La capa no declara CRS; definirlo desde su documentación antes de analizar.")
    for column in [nc_column] + ([owner_column] if owner_column else []):
        if column not in frame.columns:
            raise ValueError(f"No existe la columna {column!r}.")
    if getattr(frame[nc_column].dtype, "kind", "") in "biufc":
        raise ValueError("La columna NC es numérica; reexportar texto desde la fuente original.")
    records = ({"source_row": str(index), "nc": None if pd.isna(row[nc_column]) else row[nc_column],
                "owner": (None if pd.isna(row[owner_column]) else row[owner_column]) if owner_column else None,
                "geometry": row[frame.geometry.name]} for index, row in frame.iterrows())
    return records, frame.crs, {"source": "optional_public_source_derived_geopackage", "layer": layer}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("geopackage", type=Path)
    parser.add_argument("--layer", help="Obligatoria para GeoPackage; no se usa en GeoJSON público WFS")
    parser.add_argument("--nc-column", required=True)
    parser.add_argument("--owner-column")
    parser.add_argument("--source-date", help="YYYY-MM-DD si consta fecha de actualización; desconocida al omitir")
    parser.add_argument("--routes", type=Path, default=ROOT / "public/data/routes.geojson")
    parser.add_argument("--output", type=Path, default=ROOT / "data/private/parcel_affected.geojson")
    args = parser.parse_args()
    try:
        output = private_output(args.output)
        if args.source_date:
            date.fromisoformat(args.source_date)
        records, parcel_crs, source_info = read_input(args.geopackage, args.layer, args.nc_column, args.owner_column)
        routes = json.loads(args.routes.read_text(encoding="utf-8"))
        result = analyze(records, parcel_crs, routes, args.source_date or source_info.get("source_date"))
        result["metadata"]["input_source"] = source_info
        if source_info.get("source") == "public_wfs":
            scope = "public_WFS_bbox_candidates_not_full_route_corridor_census"
            result["metadata"]["query_scope"] = scope
            for summary in result["metadata"]["routes"].values():
                summary["query_scope"] = scope
        result["metadata"].update({
            "input_filename": args.geopackage.name, "input_layer": args.layer,
            "input_sha256": file_hash(args.geopackage), "routes_sha256": file_hash(args.routes),
            "nc_column": args.nc_column, "owner_column": args.owner_column,
        })
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(output)
        # Logs do not expose NC values or owners.
        print(json.dumps({"status": "review_exclusions" if result["metadata"]["excluded_records"] else "ok",
                          "features": len(result["features"]), "excluded_count": len(result["metadata"]["excluded_records"]),
                          "output": str(output)}, ensure_ascii=False))
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Error: {exc}\n")


def file_hash(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


if __name__ == "__main__":
    main()
