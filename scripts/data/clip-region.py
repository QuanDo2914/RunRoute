"""Remove out-of-region vertices without bridging across excluded geometry."""
import json,pathlib
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--region',default='regions/urbana-champaign.json');args=parser.parse_args()
config=json.loads(pathlib.Path(args.region).read_text())
p=pathlib.Path('public'+config['graphUrl']);d=json.loads(p.read_text());s,w,n,e=d['bounds'];d['nodes']=[a for a in d['nodes'] if s<=a['lat']<=n and w<=a['lon']<=e];ids={a['id'] for a in d['nodes']};d['ways']=[a for a in d['ways'] if any(a['nodes'][i] in ids and a['nodes'][i+1] in ids for i in range(len(a['nodes'])-1))];p.write_text(json.dumps(d,separators=(',',':')));print(len(ids),'in-region nodes')
