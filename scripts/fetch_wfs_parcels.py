"""Read an explicitly selected public WFS using bounded WFS 1.0 XY requests.

No login, hidden fields, province-wide export or owner inference is attempted.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ENDPOINT = "https://geonode-cam.marketsis.com.ar/geoserver/wfs"


class WfsError(ValueError):
    """A failed or incomplete request is not a negative spatial result."""


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def exception_check(body):
    if body.lstrip().startswith(b"<"):
        try:
            root = ET.fromstring(body)
        except ET.ParseError as exc:
            raise WfsError("Respuesta XML inválida.") from exc
        failures = [node for node in root.iter() if local_name(node.tag) in {"ServiceException", "ExceptionText"}]
        if failures or local_name(root.tag) in {"ExceptionReport", "ServiceExceptionReport"}:
            message = "; ".join(" ".join(node.itertext()).strip() for node in failures)
            raise WfsError("WFS devolvió una excepción de servicio: " + message[:500])
        return root
    return None


class PublicWfs:
    def __init__(self, endpoint=DEFAULT_ENDPOINT, timeout=60, transport=None):
        parsed = urllib.parse.urlsplit(endpoint)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc or parsed.username or parsed.password:
            raise WfsError("Endpoint HTTP(S) público sin credenciales requerido.")
        self.endpoint = endpoint
        self.timeout = timeout
        self.transport = transport

    def get(self, **params):
        # Fix WFS 1.0.0 to avoid EPSG:4326 latitude/longitude axes in WFS 2.
        query = {"service": "WFS", "version": "1.0.0", **params}
        parsed = urllib.parse.urlsplit(self.endpoint)
        existing = dict(urllib.parse.parse_qsl(parsed.query))
        # Do not let an endpoint query override the explicit request profile.
        existing = {key: value for key, value in existing.items() if key.lower() not in {k.lower() for k in query}}
        url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode({**existing, **query})))
        if self.transport:
            body = self.transport(url)
        else:
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "tren-minero-public-wfs/1.0", "Accept": "application/json, application/xml, text/xml"})
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    if response.status != 200:
                        raise WfsError(f"HTTP {response.status} al consultar WFS.")
                    body = response.read()
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
                raise WfsError(f"Falló la consulta WFS: {type(exc).__name__}; revisar disponibilidad.") from exc
        exception_check(body)
        return body

    def capabilities(self):
        root = exception_check(self.get(request="GetCapabilities"))
        if root is None:
            raise WfsError("GetCapabilities no devolvió XML.")
        names = []
        for element in root.iter():
            if local_name(element.tag) == "FeatureType":
                name = next((node.text for node in element if local_name(node.tag) == "Name"), None)
                if name:
                    names.append(name)
        return sorted(set(names))

    def describe(self, type_name):
        root = exception_check(self.get(request="DescribeFeatureType", typeName=type_name))
        if root is None:
            raise WfsError("DescribeFeatureType no devolvió XML.")
        fields = {}
        for element in root.iter():
            if local_name(element.tag) == "element" and "name" in element.attrib:
                fields[element.attrib["name"]] = element.attrib.get("type", "")
        return fields

    def hits(self, type_name, bbox, source_crs, property_names, sort_field):
        # GeoServer may report a false zero in WFS 1.0 XML hits for a reprojected
        # bbox. Use the same GeoJSON query/profile as actual pages, bounded to
        # one feature, and require the server's full filtered totalFeatures.
        payload = decode_json(self.get(request="GetFeature", typeName=type_name,
            srsName=source_crs, bbox=bbox_parameter(bbox, source_crs),
            outputFormat="application/json", maxFeatures=1, startIndex=0,
            propertyName=",".join(property_names), sortBy=sort_field))
        features = payload.get("features")
        if payload.get("type") != "FeatureCollection" or not isinstance(features, list):
            raise WfsError("Sonda de total no devolvió una FeatureCollection verificable.")
        value = payload.get("totalFeatures", payload.get("numberMatched"))
        try:
            total = int(value)
        except (TypeError, ValueError) as exc:
            raise WfsError("WFS no informa un total GeoJSON verificable; no se garantiza integridad.") from exc
        if isinstance(value, bool) or total < 0 or str(total) != str(value):
            raise WfsError("Total GeoJSON WFS inválido.")
        if len(features) != min(total, 1):
            raise WfsError("Total GeoJSON contradice la sonda de entidades; no se acepta un cero falso.")
        return total


def decode_json(body):
    try:
        value = json.loads(body.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise WfsError("GetFeature no devolvió GeoJSON válido.") from exc
    if not isinstance(value, dict):
        raise WfsError("Respuesta WFS debe ser un objeto GeoJSON.")
    return value


def validate_bbox(bbox):
    if len(bbox) != 4 or not all(math.isfinite(float(n)) for n in bbox):
        raise WfsError("BBox requiere west south east north finitos.")
    west, south, east, north = map(float, bbox)
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise WfsError("BBox EPSG:4326 inválido; usar orden longitud/latitud XY.")
    return west, south, east, north


def bbox_parameter(bbox, crs):
    return ",".join(str(value) for value in validate_bbox(bbox)) + "," + crs


def geometry_bounds(geometry):
    if not isinstance(geometry, dict) or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        raise WfsError("Geometría parcelaria ausente o no poligonal.")
    points = []
    def walk(value):
        if not isinstance(value, list) or not value:
            raise WfsError("Coordenadas parcelarias vacías o inválidas.")
        if isinstance(value[0], (float, int)):
            if len(value) < 2 or not all(isinstance(n, (float, int)) and math.isfinite(n) for n in value[:2]):
                raise WfsError("Coordenadas no finitas.")
            x, y = value[:2]
            if not (-180 <= x <= 180 and -90 <= y <= 90):
                raise WfsError("Coordenadas fuera de EPSG:4326 XY.")
            points.append((x, y))
        else:
            for item in value:
                walk(item)
    walk(geometry.get("coordinates"))
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def fetch(client, type_names, bboxes, nc_field, owner_field=None, source_crs="EPSG:4326", page_size=500, max_features=100000, source_date=None, geometry_field="the_geom", sort_field="fid_1"):
    if source_crs.upper() != "EPSG:4326":
        raise WfsError("Este perfil admite sólo EPSG:4326 con WFS 1.0 y ejes XY.")
    source_crs = "EPSG:4326"
    if source_date:
        from datetime import date
        date.fromisoformat(source_date)
    if not type_names or not bboxes:
        raise WfsError("Elegir capas públicas y bbox del corredor explícitamente.")
    if not 1 <= page_size <= 5000 or max_features < 1:
        raise WfsError("Límite de página o total inválido.")
    bboxes = [validate_bbox(bbox) for bbox in bboxes]
    available = client.capabilities()
    output, global_ids, queries = [], {}, []
    for type_name in dict.fromkeys(type_names):
        if type_name not in available:
            raise WfsError(f"Capa seleccionada no publicada en catálogo público: {type_name}.")
        fields = client.describe(type_name)
        for name in [nc_field, geometry_field, sort_field] + ([owner_field] if owner_field else []):
            if name not in fields:
                raise WfsError(f"El campo explícito {name!r} no está publicado en {type_name}.")
        if fields[nc_field].split(":")[-1] not in {"string", "normalizedString", "token"}:
            raise WfsError("El esquema público no declara NC como texto; no se pueden preservar ceros iniciales.")
        property_names = list(dict.fromkeys([geometry_field, nc_field] + ([owner_field] if owner_field else [])))
        for bbox in bboxes:
            expected = client.hits(type_name, bbox, source_crs, property_names, sort_field)
            if expected > max_features:
                raise WfsError("Consulta demasiado amplia: reducir bbox a los corredores; no exportar la provincia completa.")
            start, seen_ids = 0, set()
            while start < expected:
                payload = decode_json(client.get(request="GetFeature", typeName=type_name, srsName=source_crs,
                    bbox=bbox_parameter(bbox, source_crs), outputFormat="application/json", maxFeatures=page_size, startIndex=start,
                    propertyName=",".join(property_names), sortBy=sort_field))
                features = payload.get("features")
                if payload.get("type") != "FeatureCollection" or not isinstance(features, list) or not features:
                    raise WfsError("Página vacía/inválida antes del total informado: respuesta truncada.")
                if len(features) > page_size or start + len(features) > expected:
                    raise WfsError("Paginación o total inconsistente; la fuente puede haber cambiado.")
                total = payload.get("totalFeatures", payload.get("numberMatched"))
                if total not in (None, "unknown") and str(total) != str(expected):
                    raise WfsError("El total cambió entre la sonda y la página; repetir sobre una fuente estable.")
                if payload.get("numberReturned") is not None and payload["numberReturned"] != len(features):
                    raise WfsError("numberReturned no coincide con la página recibida.")
                for feature in features:
                    fid = feature.get("id")
                    if not isinstance(fid, (str, int)) or isinstance(fid, bool) or not str(fid):
                        raise WfsError("Entidad pública sin identificador estable; no se puede verificar paginación.")
                    fid = str(fid)
                    if fid in seen_ids:
                        raise WfsError("Identificador repetido entre páginas: startIndex ignorado o duplicación de la fuente.")
                    seen_ids.add(fid)
                    props = feature.get("properties") or {}
                    nc = props.get(nc_field)
                    if not isinstance(nc, str) or not nc.strip():
                        raise WfsError("NC ausente o no textual en entidad pública; no equivale a parcela fuera del corredor.")
                    bounds = geometry_bounds(feature.get("geometry"))
                    if bounds[2] < bbox[0] or bounds[0] > bbox[2] or bounds[3] < bbox[1] or bounds[1] > bbox[3]:
                        raise WfsError("Geometría fuera de bbox solicitado: revisar ejes XY/latlon o filtros ignorados.")
                    # Save only requested, publicly exposed fields. Never infer an owner.
                    selected = {"nc": nc.strip(), "source_layer": type_name, "source_feature_id": fid}
                    if owner_field:
                        owner = props.get(owner_field)
                        if owner is not None and not isinstance(owner, str):
                            raise WfsError("El campo público de titular seleccionado no es texto.")
                        selected["owner"] = owner or ""
                    item = {"type": "Feature", "id": type_name + ":" + fid, "properties": selected, "geometry": feature["geometry"]}
                    key = (type_name, fid)
                    fingerprint = hashlib.sha256(json.dumps(item, sort_keys=True, allow_nan=False).encode()).hexdigest()
                    if key in global_ids and global_ids[key] != fingerprint:
                        raise WfsError("Entidad cambió entre bbox; repetir consulta con fuente estable.")
                    if key not in global_ids:
                        global_ids[key] = fingerprint
                        output.append(item)
                        if len(output) > max_features:
                            raise WfsError("Total acumulado excede el límite: reducir corredores/consultas.")
                start += len(features)
            # Check total again to detect edits/truncation during paging.
            if client.hits(type_name, bbox, source_crs, property_names, sort_field) != expected:
                raise WfsError("Total WFS cambió durante la descarga; no se emite un resultado completo.")
            queries.append({"type_name": type_name, "bbox_xy": list(bbox), "expected": expected, "received_unique": len(seen_ids), "complete": True})
    return {"type": "FeatureCollection", "metadata": {
        "schema_version": 1, "source": "public_wfs", "endpoint": client.endpoint,
        "fetched_at": datetime.now(timezone.utc).isoformat(), "source_date": source_date,
        "source_date_status": "operator_provided" if source_date else "unknown",
        "wfs_version": "1.0.0", "source_crs": source_crs, "axis_order": "XY_longitude_latitude",
        "type_names": list(dict.fromkeys(type_names)), "nc_field": nc_field, "owner_field": owner_field,
        "owner_inferred": False, "geometry_field": geometry_field, "sort_field": sort_field,
        "total_method": "bounded_GeoJSON_probe_totalFeatures_before_and_after", "queries": queries, "feature_count": len(output), "complete_download": True,
        "coverage_status": "unknown", "privacy": "local_private_do_not_publish_or_commit",
        "scope": "bbox_candidates_full_parcel_geometry_not_corridor_intersections",
        "tenure_status": "public_cadastral_source_not_registry_verified",
    }, "features": output}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    parser.add_argument("--type-name", action="append", required=True)
    parser.add_argument("--bbox", nargs=4, type=float, action="append", required=True, metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    parser.add_argument("--nc-field", required=True)
    parser.add_argument("--owner-field")
    parser.add_argument("--geometry-field", default="the_geom")
    parser.add_argument("--sort-field", default="fid_1", help="Campo público estable usado en sortBy")
    parser.add_argument("--source-crs", default="EPSG:4326")
    parser.add_argument("--source-date", help="Fecha de actualización documentada YYYY-MM-DD, si está publicada")
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("--max-features", type=int, default=100000)
    parser.add_argument("--output", type=Path, default=ROOT / "data/private/wfs_parcels.geojson")
    args = parser.parse_args()
    try:
        output = args.output.resolve()
        if not output.is_relative_to((ROOT / "data/private").resolve()):
            raise WfsError("Salida permitida exclusivamente dentro de data/private.")
        if args.source_date:
            from datetime import date
            date.fromisoformat(args.source_date)
        result = fetch(PublicWfs(args.endpoint), args.type_name, args.bbox, args.nc_field, args.owner_field,
                       args.source_crs, args.page_size, args.max_features, args.source_date, args.geometry_field, args.sort_field)
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary = output.with_suffix(output.suffix + ".tmp")
        temporary.write_text(json.dumps(result, ensure_ascii=False, allow_nan=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(output)
        print(json.dumps({"status": "complete_download", "features": len(result["features"]), "output": str(output)}))
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Error: {exc}\n")


if __name__ == "__main__":
    main()
