import test from 'node:test';
import assert from 'node:assert/strict';
import {DemoAnalyticsProvider,createDemoRecords,reportCSV} from '../src/analytics/DemoAnalytics.js';
import {LANGUAGE_CODES,TRANSLATIONS} from '../src/translations.js';
import {setLanguage,t,getLanguage} from '../src/I18n.js';

test('eight complete language dictionaries and parameterized navigation messages',()=>{
  assert.equal(LANGUAGE_CODES.length,8);
  for(const [source,values] of Object.entries(TRANSLATIONS))for(const language of LANGUAGE_CODES)assert.ok(values[language]?.trim(),`${language}: ${source}`);
  for(const language of LANGUAGE_CODES){setLanguage(language);assert.ok(t('{name} mağazasına ulaştınız',{name:'Boyner'}).includes('Boyner'));assert.ok(!t('Kat {n}',{n:1}).includes('{n}'));}
  const old=getLanguage();assert.equal(setLanguage('xx'),false);assert.equal(getLanguage(),old);setLanguage('tr');
});
test('sample records have consistent totals and do not inflate routes or campaigns',()=>{
  for(const row of createDemoRecords()){
    assert.ok(row.routes<=row.searches);assert.ok(row.accessible<=row.routes);assert.ok(row.clicks<=row.impressions);
    assert.equal(row.hourly.reduce((a,b)=>a+b,0),row.routes);
    assert.equal(row.languages.reduce((a,b)=>a+b,0),row.searches);
  }
});
test('date, store and kiosk filters affect all report components consistently',async()=>{
  const provider=new DemoAnalyticsProvider();
  for(const days of [7,30,90]){
    const all=await provider.getReport({days});
    const filtered=await provider.getReport({days,storeId:'BOYNER',kioskId:'plaza'});
    assert.equal(all.daily.length,days);assert.equal(filtered.byStore.length,1);assert.ok(filtered.summary.searches<all.summary.searches);
    for(const field of ['searches','routes','accessible','impressions','clicks']){
      assert.equal(filtered.daily.reduce((s,d)=>s+d[field],0),filtered.summary[field]);
      assert.equal(filtered.byStore[0][field],filtered.summary[field]);
      assert.equal(filtered.kiosks.reduce((s,d)=>s+d[field],0),filtered.summary[field]);
    }
    assert.ok(filtered.previous.searches>0);assert.equal(filtered.mode,'demo');
    assert.equal(filtered.languages.reduce((s,d)=>s+d.value,0),filtered.summary.searches);
  }
});
test('demo snapshots are stable, invalid filters are empty and exports identify demo data',async()=>{
  const provider=new DemoAnalyticsProvider();const args={days:7,storeId:'BOYNER'};
  assert.deepEqual(await provider.getReport(args),await provider.getReport(args));
  const empty=await provider.getReport({storeId:'INVALID'});assert.equal(empty.summary.searches,0);
  const report=await provider.getReport(args),csv=reportCSV(report);
  assert.ok(csv.includes('"DEMO"'));assert.ok(csv.includes('"BOYNER"'));assert.ok(!csv.includes('MANGO'));
  assert.equal(csv.split('\r\n').length,2);
});
