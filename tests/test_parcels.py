"""Synthetic invariants only; no cadastral result is implied by these fixtures."""
import importlib.util
import json
from pathlib import Path
import unittest
import tempfile

from shapely.geometry import LineString, Polygon, box, mapping, shape

SPEC = importlib.util.spec_from_file_location("intersect_parcels", Path(__file__).resolve().parents[1] / "scripts/intersect_parcels.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def fixture_routes():
    line = mod.project(LineString([(-1000, 0), (1000, 0)]), mod.BUFFER_CRS, 4326)
    feature = {"type": "Feature", "properties": {"route_id": "T1", "segment_id": "T1-test"}, "geometry": mapping(line)}
    # Duplicate an input segment deliberately: corridor must be dissolved.
    return {"type": "FeatureCollection", "features": [feature, feature]}


def record(nc, geometry, owner=None):
    return {"nc": nc, "owner": owner, "geometry": geometry}


class ParcelScreeningTests(unittest.TestCase):
    def setUp(self):
        self.routes = fixture_routes()

    def run_analysis(self, records):
        return mod.analyze(records, mod.AREA_CRS, self.routes, "2026-10-19")

    def test_duplicate_nc_union_owner_conflicts_and_leading_zero(self):
        records = [record("00123", box(-500, -50, 0, 50), "Titular A"),
                   record("00123", box(-100, -50, 500, 50), "Titular B")]
        result = self.run_analysis(records)
        self.assertEqual(len(result["features"]), 1)
        props = result["features"][0]["properties"]
        self.assertEqual(props["nc"], "00123")
        self.assertEqual(props["owner_values"], ["Titular A", "Titular B"])
        self.assertTrue(props["owner_conflict"])
        self.assertAlmostEqual(props["parcel_m2"], 100000, places=4)
        self.assertAlmostEqual(props["affected_m2"], 100000, places=3)
        self.assertAlmostEqual(props["affected_pct"], 100, places=5)
        self.assertEqual(result["metadata"]["routes"]["T1"]["parcel_count"], 1)
        self.assertEqual(shape(result["features"][0]["geometry"]).geom_type, "Polygon")
        json.dumps(result, allow_nan=False)

    def test_absent_route_pending_and_coverage_unknown(self):
        result = self.run_analysis([record("0001", box(-50, -50, 50, 50))])
        evaluated = result["metadata"]["routes"]["T1"]
        absent = result["metadata"]["routes"]["T2"]
        self.assertTrue(evaluated["evaluated"])
        self.assertEqual(evaluated["coverage_status"], "unknown")
        self.assertFalse(absent["evaluated"])
        self.assertIsNone(absent["parcel_count"])
        self.assertIsNone(absent["affected_sum_m2"])
        self.assertEqual(absent["status"], "pending")
        self.assertEqual(evaluated["source_date"], "2026-10-19")

    def test_unknown_source_date_is_not_fetch_date(self):
        result = mod.analyze([record("0001", box(-50, -50, 50, 50))], mod.AREA_CRS, self.routes)
        self.assertEqual(result["metadata"]["source_date"], "unknown")
        self.assertEqual(result["metadata"]["source_date_status"], "unknown")
        self.assertEqual(result["features"][0]["properties"]["source_date"], "unknown")

    def test_read_public_geojson_without_gdal_and_reject_incomplete(self):
        payload = {"type": "FeatureCollection", "metadata": {"source": "public_wfs", "complete_download": True,
                   "source_crs": "EPSG:4326", "axis_order": "XY_longitude_latitude", "fetched_at": "2026-10-19T12:00:00Z"},
                   "features": [{"type": "Feature", "id": "public.1", "properties": {"nc": "0001"},
                                 "geometry": mapping(mod.project(box(-50, -50, 50, 50), mod.AREA_CRS, 4326))}]}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "wfs.geojson"
            path.write_text(json.dumps(payload))
            records, crs, meta = mod.read_input(path, None, "nc")
            self.assertEqual(records[0]["nc"], "0001")
            self.assertEqual(crs.to_epsg(), 4326)
            self.assertEqual(meta["fetched_at"], "2026-10-19T12:00:00Z")
            payload["metadata"]["complete_download"] = False
            path.write_text(json.dumps(payload))
            with self.assertRaisesRegex(ValueError, "público WFS completo"):
                mod.read_input(path, None, "nc")

    def test_numeric_nc_rejected(self):
        with self.assertRaisesRegex(ValueError, "NC numérica"):
            self.run_analysis([record(123, box(-50, -50, 50, 50))])

    def test_missing_nc_and_invalid_geometry_reported(self):
        bowtie = Polygon([(-10, -10), (10, 10), (-10, 10), (10, -10), (-10, -10)])
        result = self.run_analysis([record(None, box(-50, -50, 50, 50)), record("0002", bowtie)])
        self.assertEqual(len(result["features"]), 0)
        self.assertEqual(len(result["metadata"]["excluded_records"]), 2)
        self.assertFalse(result["metadata"]["complete_input"])
        route = result["metadata"]["routes"]["T1"]
        self.assertAlmostEqual(route["uncovered_m2"], route["corridor_m2"])

    def test_touching_only_does_not_count(self):
        corridor = mod.build_corridors(self.routes)[0]["T1"]
        xmax = corridor.bounds[2]
        result = self.run_analysis([record("0003", box(xmax, -1, xmax + 100, 1))])
        self.assertEqual(result["metadata"]["routes"]["T1"]["parcel_count"], 0)

    def test_overlap_across_distinct_nc_is_reported_not_hidden(self):
        result = self.run_analysis([record("0001", box(-200, -50, 100, 50)),
                                    record("0002", box(0, -50, 200, 50))])
        route = result["metadata"]["routes"]["T1"]
        self.assertEqual(route["parcel_count"], 2)
        self.assertAlmostEqual(route["overlap_excess_m2"], 10000, places=3)
        self.assertAlmostEqual(route["covered_union_m2"], 40000, places=3)
        self.assertEqual(len(route["overlap_pairs"]), 1)
        self.assertAlmostEqual(route["covered_union_m2"] + route["uncovered_m2"], route["corridor_m2"], places=3)

    def test_geometry_is_clipped_and_percent_valid(self):
        result = self.run_analysis([record("0001", box(-100, -1000, 100, 1000))])
        feature = result["features"][0]
        props = feature["properties"]
        self.assertGreater(props["affected_pct"], 0)
        self.assertLess(props["affected_pct"], 100)
        self.assertLess(props["affected_m2"], props["parcel_m2"])
        restored = mod.project(shape(feature["geometry"]), 4326, mod.AREA_CRS)
        self.assertAlmostEqual(restored.area, props["affected_m2"], delta=0.01)

    def test_outputs_restricted_to_private_directory(self):
        with self.assertRaisesRegex(ValueError, "nunca publicar"):
            mod.private_output(mod.ROOT / "public/data/parcel_affected.geojson")
        with self.assertRaises(ValueError):
            mod.private_output(mod.ROOT / "data/private/../../public/leak.geojson")
        self.assertEqual(mod.private_output(mod.ROOT / "data/private/result.geojson").name, "result.geojson")

    def test_bad_source_date_and_unknown_route_rejected(self):
        with self.assertRaises(ValueError):
            mod.analyze([], mod.AREA_CRS, self.routes, "hoy")
        self.routes["features"][0]["properties"]["route_id"] = "inventada"
        with self.assertRaisesRegex(ValueError, "Ruta inválida"):
            self.run_analysis([])


if __name__ == "__main__":
    unittest.main()
