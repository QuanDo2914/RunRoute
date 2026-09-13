"""Import a bounded OSM pedestrian graph. Run manually, never per user request."""
import json, urllib.request, urllib.parse, pathlib, subprocess
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--region',default='regions/urbana-champaign.json');args=parser.parse_args()
config=json.loads(pathlib.Path(args.region).read_text());bbox=','.join(map(str,config['bounds']))
query='[out:json][timeout:120];way[highway]["area"!="yes"]('+bbox+');(._;>;);out body;'
req=urllib.request.Request('https://overpass-api.de/api/interpreter',data=urllib.parse.urlencode({'data':query}).encode(),headers={'User-Agent':'RunRoute-portfolio/0.1'})
raw=json.loads(subprocess.check_output(['curl','--fail','--max-time','150','https://overpass-api.de/api/interpreter','--data-urlencode','data='+query]))
pathlib.Path('work/osm.json').write_text(json.dumps(raw))
allowed={'footway','path','pedestrian','living_street','residential','unclassified','service','tertiary','secondary','track','steps'}
nodes={e['id']:e for e in raw['elements'] if e['type']=='node'}
ways=[]; used=set()
for w in raw['elements']:
 if w['type']!='way':continue
 t=w.get('tags',{}); h=t.get('highway')
 if t.get('indoor')=='yes' or h not in allowed or t.get('foot') in ('no','private') or (t.get('access') in ('no','private','customers') and t.get('foot') not in ('yes','designated','permissive')):continue
 if h in ('secondary','tertiary') and t.get('sidewalk') not in ('yes','both','left','right'):continue
 if t.get('service') in ('driveway','parking_aisle'):continue
 ids=[i for i in w['nodes'] if i in nodes]
 if len(ids)<2:continue
 ways.append({'id':w['id'],'nodes':ids,'kind':h,'name':t.get('name',''),'footOneWay':t.get('oneway:foot')})
 used.update(ids)
out={'region':config['id'],'bounds':config['bounds'],'source':'OpenStreetMap contributors, ODbL 1.0','timestamp':raw.get('osm3s',{}).get('timestamp_osm_base'),'nodes':[{ 'id':i,'lat':nodes[i]['lat'],'lon':nodes[i]['lon'],'signal':nodes[i].get('tags',{}).get('highway')=='traffic_signals' or nodes[i].get('tags',{}).get('crossing')=='traffic_signals' or nodes[i].get('tags',{}).get('crossing:signals')=='yes','elevation':None} for i in sorted(used)],'ways':ways}
pathlib.Path('public'+config['graphUrl']).write_text(json.dumps(out,separators=(',',':')))
print(len(out['nodes']), 'nodes', len(ways),'ways')
