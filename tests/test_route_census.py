"""Census-specific completeness checks; mocks never contact the service."""
import sys
from pathlib import Path
import unittest
from shapely.geometry import box, mapping
from pyproj import Transformer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from prepare_route_parcels import fetch_single_query, chunks, padded_bbox, overlap, WfsError

BBOX=[-67.55214342495586,-35.00434780326497,-67.43821513362681,-35.000626779791396]
JOB={'layer':'public:test','bbox':BBOX,'native_crs':'EPSG:22172'}


def feature(index,nc='0001',geometry=None):
    return {'type':'Feature','id':f'test.{index}','properties':{'NOMENCLATU':nc},'geometry':geometry or mapping(box(-67.5,-35.003,-67.499,-35.002))}


class Client:
    def __init__(self,items):self.items=items;self.calls=[];self.postprobes=0
    def describe(self,layer):return {'the_geom':'gml:MultiPolygonPropertyType','NOMENCLATU':'xsd:string','fid_1':'xsd:long'}
    def get(self,**params):
        import json
        self.calls.append(params);start=params['startIndex'];items=self.items[start:start+500]
        return json.dumps({'type':'FeatureCollection','totalFeatures':len(self.items),'features':items,'crs':{'properties':{'name':'EPSG:4326'}}}).encode()
    def hits(self,*args):self.postprobes+=1;return len(self.items)


class CensusQueryTests(unittest.TestCase):
    def test_empty_total_is_verified_in_one_response(self):
        client=Client([]);result=fetch_single_query(client,JOB)
        self.assertEqual(result['features'],[])
        self.assertEqual(len(client.calls),1)
        self.assertEqual(client.postprobes,0)
        self.assertEqual(result['metadata']['strategy'],'single_response_total_verified')

    def test_empty_response_with_null_crs_uses_geojson_default(self):
        class NullCrs(Client):
            def get(self,**params):
                import json
                self.calls.append(params)
                return json.dumps({'type':'FeatureCollection','totalFeatures':0,'features':[],'crs':None}).encode()
        result=fetch_single_query(NullCrs([]),JOB)
        self.assertEqual(result['features'],[])
        self.assertTrue(result['metadata']['complete_download'])

    def test_one_page_keeps_nc_and_only_public_fields(self):
        client=Client([feature(1)]);result=fetch_single_query(client,JOB)
        self.assertEqual(result['features'][0]['properties']['nc'],'0001')
        self.assertEqual(client.calls[0]['propertyName'],'the_geom,NOMENCLATU')
        self.assertEqual(len(client.calls),1)
        self.assertNotIn('owner',result['features'][0]['properties'])

    def test_native_crs_envelope_false_positive_is_preserved(self):
        native=Transformer.from_crs(4326,22172,always_xy=True).transform_bounds(*BBOX,densify_pts=21)
        allowed=Transformer.from_crs(22172,4326,always_xy=True).transform_bounds(*native,densify_pts=21)
        y=(allowed[1]+BBOX[1])/2;x=(BBOX[0]+BBOX[2])/2
        geometry=mapping(box(x-0.000001,y-0.000001,x+0.000001,y+0.000001))
        result=fetch_single_query(Client([feature(1,geometry=geometry)]),JOB)
        self.assertEqual(len(result['features']),1)
        self.assertEqual(result['metadata']['outside_requested_bbox_candidates'],1)

    def test_more_than_500_checks_pages_and_postprobe(self):
        client=Client([feature(i,nc=f'{i:05d}') for i in range(501)])
        result=fetch_single_query(client,JOB)
        self.assertEqual(len(result['features']),501)
        self.assertEqual([p['startIndex'] for p in client.calls],[0,500])
        self.assertEqual(client.postprobes,1)

    def test_missing_or_numeric_nc_does_not_become_zero(self):
        for value in [None,123,'']:
            with self.subTest(value=value):
                with self.assertRaisesRegex(WfsError,'NC ausente'):
                    fetch_single_query(Client([feature(1,nc=value)]),JOB)

    def test_chunking_retains_original_endpoints_and_padding(self):
        coords=[[-68,-35],[-67.8,-35],[-67.7,-35]]
        parts=list(chunks(coords));self.assertGreater(len(parts),1)
        self.assertEqual(parts[0][0],coords[0]);self.assertEqual(parts[-1][-1],coords[-1])
        for a,b in zip(parts,parts[1:]):self.assertEqual(a[-1],b[0])
        for part in parts:
            bounds=padded_bbox(part)
            for x,y in part:self.assertTrue(bounds[0]<x<bounds[2] and bounds[1]<y<bounds[3])


if __name__=='__main__':unittest.main()
