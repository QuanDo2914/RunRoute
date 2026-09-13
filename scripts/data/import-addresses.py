"""Build the regional address index; searches run locally in the browser."""
import json,subprocess,pathlib
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--region',default='regions/urbana-champaign.json');args=parser.parse_args()
config=json.loads(pathlib.Path(args.region).read_text());s,w,n,e=config['bounds'];bbox=','.join(map(str,config['bounds']))
query='[out:json][timeout:120];nwr["addr:housenumber"]["addr:street"]('+bbox+');out center tags;'
raw=json.loads(subprocess.check_output(['curl','-fsS','--max-time','150','https://overpass-api.de/api/interpreter','--data-urlencode','data='+query]))
records=[];seen=set()
for obj in raw['elements']:
 t=obj['tags'];p=obj.get('center',obj);lat=p.get('lat');lon=p.get('lon')
 if lat is None or not (s<=lat<=n and w<=lon<=e):continue
 street=t['addr:housenumber']+' '+t['addr:street'];city=t.get('addr:city','');postal=t.get('addr:postcode','');label=', '.join(x for x in [street,city,postal] if x)
 key=(label,round(lat,4),round(lon,4))
 if key in seen:continue
 seen.add(key);records.append({'name':label,'lat':lat,'lon':lon})
records.sort(key=lambda r:r['name'])
out={'source':'© OpenStreetMap contributors, ODbL 1.0','timestamp':raw.get('osm3s',{}).get('timestamp_osm_base'),'addresses':records}
pathlib.Path('public'+config['addressUrl']).write_text(json.dumps(out,separators=(',',':')))
print(len(records),'local addresses')
