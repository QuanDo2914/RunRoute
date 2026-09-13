"""Cache a terrain grid and bilinearly interpolate node elevation (coarse estimate)."""
import json,subprocess,time,math,pathlib
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--region',default='regions/urbana-champaign.json');args=parser.parse_args()
config=json.loads(pathlib.Path(args.region).read_text())
p=pathlib.Path('public'+config['graphUrl']);d=json.loads(p.read_text());s,w,n,e=d['bounds'];step=.003;rows=math.ceil((n-s)/step)+1;cols=math.ceil((e-w)/step)+1
points=[(s+i*step,w+j*step) for i in range(rows) for j in range(cols)];values=[]
cache=pathlib.Path('work') / (config['id']+'-elevation-grid-'+str(step)+'-'+str(d['bounds'])+'.json')
if cache.exists():values=json.loads(cache.read_text())
else:
 for i in range(0,len(points),100):
  loc='|'.join(f'{a:.6f},{b:.6f}' for a,b in points[i:i+100])
  result=json.loads(subprocess.check_output(['curl','-fsS','--max-time','40','--get','https://api.opentopodata.org/v1/srtm90m','--data-urlencode','locations='+loc]))
  if result.get('status')!='OK':raise RuntimeError(result)
  values.extend(r['elevation'] for r in result['results']);print(len(values),'/',len(points),flush=True);time.sleep(1.05)
 cache.write_text(json.dumps(values))
for node in d['nodes']:
 y=(node['lat']-s)/step;x=(node['lon']-w)/step
 if not (0<=y<rows-1 and 0<=x<cols-1):continue
 i=int(y);j=int(x);a=y-i;b=x-j;vs=[values[i*cols+j],values[(i+1)*cols+j],values[i*cols+j+1],values[(i+1)*cols+j+1]]
 if any(v is None for v in vs):continue
 node['elevation']=round(vs[0]*(1-a)*(1-b)+vs[1]*a*(1-b)+vs[2]*(1-a)*b+vs[3]*a*b,2)
d['elevationSource']={'dataset':'SRTM90m via OpenTopoData','gridDegrees':step,'method':'bilinear interpolation; coarse terrain estimates, not surveyed route elevation'}
p.write_text(json.dumps(d,separators=(',',':')))
