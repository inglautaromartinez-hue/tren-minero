"""Mock public WFS; tests perform no network requests and use no real owners."""
import copy
import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import parse_qs, urlsplit

SPEC = importlib.util.spec_from_file_location("fetch_wfs_parcels", Path(__file__).resolve().parents[1] / "scripts/fetch_wfs_parcels.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)
BBOX = (-68, -36, -67, -35)


def feature(fid, nc):
    return {"type": "Feature", "id": fid, "properties": {"NC": nc, "OWNER": "Titular de prueba", "EXTRA": "no exportar"},
            "geometry": {"type": "Polygon", "coordinates": [[[-67.6, -35.6], [-67.5, -35.6], [-67.5, -35.5], [-67.6, -35.5], [-67.6, -35.6]]]}}


class FakeService:
    def __init__(self):
        self.features = [feature("parcelas.1", "0001"), feature("parcelas.2", "0002")]
        self.calls = []
        self.numeric_schema = False
        self.ignore_paging = False
        self.truncate = False
        self.unknown_total = False
        self.changed_total = False
        self.hits_calls = 0
        self.zero_xml_hits = False
        self.service_error = False

    def __call__(self, url):
        q = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
        self.calls.append(q)
        if self.service_error:
            return b'<ServiceExceptionReport><ServiceException>layer unavailable</ServiceException></ServiceExceptionReport>'
        if q["request"] == "GetCapabilities":
            return b'<WFS_Capabilities><FeatureTypeList><FeatureType><Name>public:parcelas</Name></FeatureType></FeatureTypeList></WFS_Capabilities>'
        if q["request"] == "DescribeFeatureType":
            kind = "int" if self.numeric_schema else "string"
            return f'<schema><element name="NC" type="xsd:{kind}"/><element name="OWNER" type="xsd:string"/><element name="fid_1" type="xsd:long"/><element name="the_geom" type="gml:MultiPolygonPropertyType"/></schema>'.encode()
        if q.get("resultType") == "hits":
            self.hits_calls += 1
            n = "0" if self.zero_xml_hits else str(len(self.features))
            return f'<FeatureCollection numberOfFeatures="{n}"/>'.encode()
        start = 0 if self.ignore_paging else int(q["startIndex"])
        page = self.features[start:start + int(q["maxFeatures"])]
        if self.truncate and start:
            page = []
        # maxFeatures=1 is used by both probes and page-size=1 tests. Stable
        # totals remain identical; changed_total deliberately violates this.
        self.hits_calls += 1
        total = "unknown" if self.unknown_total else len(self.features) + (1 if self.changed_total and self.hits_calls > 2 else 0)
        return json.dumps({"type": "FeatureCollection", "features": page, "totalFeatures": total, "numberReturned": len(page)}).encode()


class PublicWfsTests(unittest.TestCase):
    def setUp(self):
        self.service = FakeService()
        self.client = mod.PublicWfs(transport=self.service)

    def fetch(self, **kwargs):
        return mod.fetch(self.client, ["public:parcelas"], [BBOX], "NC", page_size=1, **kwargs)

    def test_complete_public_paging_and_only_explicit_fields(self):
        result = self.fetch()
        self.assertEqual(len(result["features"]), 2)
        self.assertEqual(result["features"][0]["properties"]["nc"], "0001")
        self.assertNotIn("owner", result["features"][0]["properties"])
        self.assertNotIn("EXTRA", result["features"][0]["properties"])
        self.assertEqual(result["metadata"]["coverage_status"], "unknown")
        self.assertIsNone(result["metadata"]["source_date"])
        self.assertTrue(result["metadata"]["complete_download"])
        requests = [q for q in self.service.calls if "startIndex" in q]
        self.assertEqual([q["startIndex"] for q in requests], ["0", "0", "1", "0"])
        self.assertTrue(all(q["propertyName"] == "the_geom,NC" and q["sortBy"] == "fid_1" for q in requests))
        self.assertTrue(all(q["version"] == "1.0.0" for q in self.service.calls))
        self.assertEqual(requests[0]["bbox"], "-68.0,-36.0,-67.0,-35.0,EPSG:4326")

    def test_false_zero_xml_hits_does_not_suppress_json_parcel(self):
        self.service.features = [feature("parcelas.1", "0001")]
        self.service.zero_xml_hits = True
        # Real regression: XML hits=0, same GeoJSON bbox contains one parcel.
        xml = self.client.get(request="GetFeature", resultType="hits", typeName="public:parcelas")
        self.assertIn(b'numberOfFeatures="0"', xml)
        result = self.fetch()
        self.assertEqual(len(result["features"]), 1)
        self.assertEqual(result["metadata"]["queries"][0]["expected"], 1)

    def test_owner_only_when_explicit_and_public(self):
        result = self.fetch(owner_field="OWNER", source_date="2026-10-19")
        self.assertEqual(result["features"][0]["properties"]["owner"], "Titular de prueba")
        self.assertFalse(result["metadata"]["owner_inferred"])
        with self.assertRaisesRegex(mod.WfsError, "no está publicado"):
            self.fetch(owner_field="UNPUBLISHED")

    def test_unknown_layer_and_numeric_nc_schema_fail(self):
        with self.assertRaisesRegex(mod.WfsError, "no publicada"):
            mod.fetch(self.client, ["private:unknown"], [BBOX], "NC")
        self.service.numeric_schema = True
        with self.assertRaisesRegex(mod.WfsError, "como texto"):
            self.fetch()

    def test_repeated_page_is_failure(self):
        self.service.ignore_paging = True
        with self.assertRaisesRegex(mod.WfsError, "repetido"):
            self.fetch()

    def test_truncated_page_is_failure_not_zero(self):
        self.service.truncate = True
        with self.assertRaisesRegex(mod.WfsError, "truncada"):
            self.fetch()

    def test_missing_feature_id_or_nc_and_numeric_nc_fail(self):
        for bad in [None, "", 2]:
            with self.subTest(nc=bad):
                self.service.features[0]["properties"]["NC"] = bad
                with self.assertRaisesRegex(mod.WfsError, "NC ausente"):
                    self.fetch()
        self.service.features[0]["properties"]["NC"] = "0001"
        self.service.features[0].pop("id")
        with self.assertRaisesRegex(mod.WfsError, "sin identificador"):
            self.fetch()

    def test_exception_unknown_count_and_changed_source_fail(self):
        self.service.service_error = True
        with self.assertRaisesRegex(mod.WfsError, "excepción de servicio"):
            self.fetch()
        self.service.service_error = False
        self.service.unknown_total = True
        with self.assertRaisesRegex(mod.WfsError, "total.*verificable"):
            self.fetch()
        self.service.unknown_total = False
        self.service.changed_total = True
        self.service.hits_calls = 0
        with self.assertRaisesRegex(mod.WfsError, "cambió entre la sonda"):
            self.fetch()

    def test_xy_axis_or_ignored_bbox_guard(self):
        geometry = self.service.features[0]["geometry"]
        geometry["coordinates"] = [[[y, x] for x, y in ring] for ring in geometry["coordinates"]]
        with self.assertRaisesRegex(mod.WfsError, "fuera de bbox"):
            self.fetch()
        with self.assertRaisesRegex(mod.WfsError, "sólo EPSG:4326"):
            self.fetch(source_crs="EPSG:22172")

    def test_overlapping_bboxes_deduplicate_full_features(self):
        result = mod.fetch(self.client, ["public:parcelas"], [BBOX, BBOX], "NC", page_size=1)
        self.assertEqual(len(result["features"]), 2)
        self.assertEqual(len(result["metadata"]["queries"]), 2)

    def test_empty_verified_query_is_valid_but_coverage_unknown(self):
        self.service.features = []
        result = self.fetch()
        self.assertEqual(result["features"], [])
        self.assertTrue(result["metadata"]["complete_download"])
        self.assertEqual(result["metadata"]["coverage_status"], "unknown")
        self.assertEqual(sum("startIndex" in q for q in self.service.calls), 2)

    def test_excessive_query_and_invalid_bbox_fail(self):
        with self.assertRaisesRegex(mod.WfsError, "demasiado amplia"):
            self.fetch(max_features=1)
        with self.assertRaisesRegex(mod.WfsError, "BBox"):
            mod.fetch(self.client, ["public:parcelas"], [(1, 2, 0, 3)], "NC")


if __name__ == "__main__":
    unittest.main()
