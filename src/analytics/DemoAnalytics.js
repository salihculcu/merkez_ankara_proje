export const DEMO_AS_OF = '2026-10-07';
export const DEMO_STORES = [
  {id:'BOYNER',name:'Boyner',category:'Giyim',weight:1.8},
  {id:'BIGCHEFS',name:'Big Chefs',category:'Yeme & İçme',weight:1.35},
  {id:'MANGO',name:'Mango',category:'Giyim',weight:1.18},
  {id:'ZARA',name:'Zara',category:'Giyim',weight:1.26},
  {id:'LACOSTE',name:'Lacoste',category:'Giyim',weight:.92},
  {id:'GANT',name:'Gant',category:'Giyim',weight:.76},
  {id:'INTERSPORT',name:'Intersport',category:'Giyim',weight:1.02},
  {id:'KAHVEDUNYASI',name:'Kahve Dünyası',category:'Yeme & İçme',weight:1.12},
  {id:'SELECTED',name:'Selected',category:'Giyim',weight:.69},
  {id:'SUPERSTEP',name:'SuperStep',category:'Giyim',weight:.87},
  {id:'KEI',name:'Kei',category:'Yeme & İçme',weight:.63},
  {id:'ROASTNBERRY',name:'Roast n Berry',category:'Yeme & İçme',weight:.81},
];
export const DEMO_KIOSKS=[{id:'plaza',name:'Meydan kiosku'},{id:'entrance',name:'Giriş kiosku'},{id:'dining',name:'Yeme içme kiosku'}];
const languages=['tr','en','de','ar','es','fr','zh','ja'];
const DAY=86400000;
function random(seed){const x=Math.sin(seed*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
function distribute(total,weights){
  const sum=weights.reduce((a,b)=>a+b,0),raw=weights.map(w=>total*w/sum),values=raw.map(Math.floor);
  const order=raw.map((v,i)=>({i,f:v-values[i]})).sort((a,b)=>b.f-a.f);
  for(let n=total-values.reduce((a,b)=>a+b,0),i=0;i<n;i++)values[order[i].i]++;
  return values;
}
export function createDemoRecords(){
  const end=Date.parse(DEMO_AS_OF+'T12:00:00Z'),records=[];
  for(let day=0;day<180;day++){
    const date=new Date(end-(179-day)*DAY),weekend=[0,6].includes(date.getUTCDay());
    DEMO_STORES.forEach((store,s)=>DEMO_KIOSKS.forEach((kiosk,k)=>{
      const seed=day*100+s*3+k;
      const searches=Math.round((17+random(seed)*20)*store.weight*(weekend?1.4:1)*(1+day/700)*[1,.74,.52][k]);
      const routes=Math.round(searches*(.54+random(seed+71)*.27));
      const accessible=Math.round(routes*(.07+random(seed+97)*.07));
      const impressions=Math.round(searches*(1.6+random(seed+121)));
      const clicks=Math.round(impressions*(.04+random(seed+167)*.07));
      records.push({date:date.toISOString().slice(0,10),storeId:store.id,kioskId:kiosk.id,searches,routes,accessible,impressions,clicks,
        hourly:distribute(routes,[2,4,6,10,11,9,8,10,13,14,9,4]),
        languages:distribute(searches,[68,13,4,7,2,3,2,1].map((w,i)=>w*(.9+random(seed+i+31)*.2)))});
    }));
  }
  return records;
}
const fields=['searches','routes','accessible','impressions','clicks'];
const totals=rows=>rows.reduce((out,row)=>{for(const field of fields)out[field]+=row[field];return out;},Object.fromEntries(fields.map(key=>[key,0])));
const sumArrays=(rows,key,length)=>rows.reduce((out,row)=>out.map((n,i)=>n+row[key][i]),Array(length).fill(0));

// Provider contract: replace this implementation with an authenticated API later.
// The dashboard never derives business metrics from its own DOM or live map events.
export class DemoAnalyticsProvider {
  constructor(){this.records=createDemoRecords();this.mode='demo';}
  async getReport({days=30,storeId='all',kioskId='all'}={}){
    days=[7,30,90].includes(Number(days))?Number(days):30;
    const end=Date.parse(DEMO_AS_OF+'T12:00:00Z'),start=new Date(end-(days-1)*DAY).toISOString().slice(0,10);
    const previousStart=new Date(end-(days*2-1)*DAY).toISOString().slice(0,10);
    const selected=this.records.filter(r=>(storeId==='all'||r.storeId===storeId)&&(kioskId==='all'||r.kioskId===kioskId));
    const current=selected.filter(r=>r.date>=start),previous=selected.filter(r=>r.date>=previousStart&&r.date<start);
    const byStore=DEMO_STORES.filter(s=>storeId==='all'||s.id===storeId).map(store=>({...store,...totals(current.filter(r=>r.storeId===store.id))}));
    const daily=Array.from({length:days},(_,i)=>{
      const date=new Date(end-(days-1-i)*DAY).toISOString().slice(0,10);return{date,...totals(current.filter(r=>r.date===date))};
    });
    return {mode:'demo',asOf:DEMO_AS_OF,start,end:DEMO_AS_OF,filters:{days,storeId,kioskId},summary:totals(current),previous:totals(previous),byStore,daily,
      hourly:sumArrays(current,'hourly',12).map((value,i)=>({hour:i+10,value})),
      languages:sumArrays(current,'languages',8).map((value,i)=>({code:languages[i],value})),
      kiosks:DEMO_KIOSKS.map(k=>({...k,...totals(current.filter(r=>r.kioskId===k.id))}))};
  }
}
export function reportCSV(report){
  const escape=value=>{let s=String(value??'');if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  const rows=[['data_source','period_start','period_end','kiosk','store_id','store','searches','routes','accessible_routes','search_to_route_rate','campaign_impressions','campaign_clicks']];
  for(const row of report.byStore)rows.push(['DEMO',report.start,report.end,report.filters.kioskId,row.id,row.name,row.searches,row.routes,row.accessible,row.searches?(row.routes/row.searches).toFixed(4):0,row.impressions,row.clicks]);
  return '\uFEFF'+rows.map(row=>row.map(escape).join(',')).join('\r\n');
}
