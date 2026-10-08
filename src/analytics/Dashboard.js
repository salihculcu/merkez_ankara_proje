import { initI18n, t, getLocale, getLanguage, number, translateDOM } from '../I18n.js';
import { LANGUAGE_CODES, LANGUAGE_NAMES } from '../translations.js?v=1';
import { DemoAnalyticsProvider, DEMO_STORES, DEMO_KIOSKS, reportCSV } from './DemoAnalytics.js';

initI18n();
const provider=new DemoAnalyticsProvider();
let report=null,view='overview',sort='searches',descending=true,request=0;
const $=id=>document.getElementById(id);
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=value=>number(value,{style:'percent',maximumFractionDigits:1});
const date=value=>new Date(value+'T12:00:00Z').toLocaleDateString(getLocale(),{day:'numeric',month:'short',year:'numeric'});
const viewTitles={overview:'Genel bakış',stores:'Mağaza analizi',engagement:'Etkileşim analizi',reports:'Raporlar'};
for(const store of DEMO_STORES){const option=new Option(store.name,store.id);option.dataset.noI18n='';$('store-filter').append(option);}
for(const kiosk of DEMO_KIOSKS)$('kiosk-filter').add(new Option(t(kiosk.name),kiosk.id));
for(const id of ['period-filter','store-filter','kiosk-filter'])$(id).addEventListener('change',load);
$('reset-filters').addEventListener('click',()=>{$('period-filter').value='30';$('store-filter').value='all';$('kiosk-filter').value='all';load();});
for(const id of ['export-report','export-report-secondary'])$(id).addEventListener('click',download);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;applyView();}));
document.querySelectorAll('[data-sort]').forEach(button=>button.addEventListener('click',()=>{descending=sort===button.dataset.sort?!descending:true;sort=button.dataset.sort;renderTable();}));
document.addEventListener('click',event=>{const button=event.target.closest('[data-store-detail]');if(button){$('store-filter').value=button.dataset.storeDetail;view='stores';applyView();load();}});
window.addEventListener('languagechange',()=>{if(report)render();applyView();});

function applyView(){
  document.querySelectorAll('[data-section]').forEach(section=>{section.hidden=!section.dataset.section.split(' ').includes(view);});
  document.querySelectorAll('[data-view]').forEach(button=>{const selected=button.dataset.view===view;button.classList.toggle('active',selected);if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
  $('page-title').textContent=t(viewTitles[view]);
  document.title=`Merkez Ankara — ${t(viewTitles[view])}`;
}
async function load(){
  const id=++request;$('dashboard-content').setAttribute('aria-busy','true');
  for(const button of [$('export-report'),$('export-report-secondary')])button.disabled=true;
  try{
    const next=await provider.getReport({days:Number($('period-filter').value),storeId:$('store-filter').value,kioskId:$('kiosk-filter').value});
    if(id!==request)return;report=next;render();
    $('analytics-status').textContent=t('İstatistikler güncellendi.');
  }catch(error){$('analytics-status').textContent=t('Veriler yüklenemedi.');console.error(error);}
  finally{if(id===request){$('dashboard-content').setAttribute('aria-busy','false');for(const button of [$('export-report'),$('export-report-secondary')])button.disabled=!report;}}
}
function change(current,previous){
  if(!previous)return `<span class="muted">${t('Yeni dönem')}</span>`;
  const delta=(current-previous)/previous;
  return `<span class="change ${delta<0?'negative':''}">${delta>=0?'↗':'↘'} ${percent(Math.abs(delta))}</span><span>${t('Önceki döneme göre')}</span>`;
}
function render(){
  const s=report.summary,p=report.previous;
  $('period-caption').textContent=`${date(report.start)} — ${date(report.end)}`;
  $('empty-state').hidden=s.searches>0;
  const kpis=[['Arama sayısı',s.searches,p.searches,false],['Oluşturulan rota',s.routes,p.routes,false],['Engelsiz rota talebi',s.accessible,p.accessible,false],['Aramadan rotaya',s.searches?s.routes/s.searches:0,p.searches?p.routes/p.searches:0,true]];
  $('kpi-grid').innerHTML=kpis.map(([label,value,old,rate])=>`<article class="kpi"><span class="kpi-label">${t(label)}</span><strong class="kpi-value">${rate?percent(value):number(value)}</strong><div class="kpi-bottom">${change(value,old)}</div></article>`).join('');
  renderDaily();ranking('search-ranking','searches');ranking('route-ranking','routes');renderTable();
  const peak=Math.max(1,...report.hourly.map(d=>d.value));
  $('hour-chart').innerHTML=report.hourly.map(d=>`<div class="hour-column ${d.value===peak?'peak':''}" title="${d.hour}:00 · ${number(d.value)} ${t('Rotalar')}"><div style="height:${d.value/peak*125}px"></div><span>${d.hour}</span></div>`).join('');
  const total=report.languages.reduce((sum,d)=>sum+d.value,0);
  $('language-chart').innerHTML=report.languages.map(d=>`<div class="language-row"><span data-no-i18n lang="${d.code}">${LANGUAGE_NAMES[LANGUAGE_CODES.indexOf(d.code)]}</span><span class="rank-track"><span style="width:${total?d.value/total*100:0}%"></span></span><small>${percent(total?d.value/total:0)}</small></div>`).join('');
  $('campaign-metrics').innerHTML=[['Kampanya gösterimi',number(s.impressions)],['Kampanya tıklaması',number(s.clicks)],['Tıklama oranı',percent(s.impressions?s.clicks/s.impressions:0)]].map(([label,value])=>`<div class="metric-line"><span>${t(label)}</span><strong>${value}</strong></div>`).join('');
  $('kiosk-breakdown').innerHTML=report.kiosks.map(k=>`<div class="metric-line"><span>${t(k.name)}</span><strong>${number(k.routes)} <small>${t('Rotalar')}</small></strong></div>`).join('');
  applyView();translateDOM(document.body);
}
function ranking(id,field){
  const rows=[...report.byStore].sort((a,b)=>b[field]-a[field]).slice(0,5),max=Math.max(1,...rows.map(row=>row[field]));
  $(id).innerHTML=rows.map((row,i)=>`<button class="rank-row" data-store-detail="${escape(row.id)}" title="${escape(row.name)} — ${t('Detayları göster')}"><span class="rank-number">${i+1}</span><span class="rank-name" data-no-i18n>${escape(row.name)}</span><span class="rank-track"><span style="width:${row[field]/max*100}%"></span></span><span class="rank-value">${number(row[field])}</span></button>`).join('');
}
function renderTable(){
  if(!report)return;
  const rows=[...report.byStore].sort((a,b)=>(descending?-1:1)*(a[sort]-b[sort]));
  $('store-table').innerHTML=rows.map(row=>`<tr><td><button data-store-detail="${escape(row.id)}" data-no-i18n>${escape(row.name)} <span aria-hidden="true">↗</span></button></td><td>${t(row.category)}</td><td>${number(row.searches)}</td><td>${number(row.routes)}</td><td>${number(row.accessible)}</td><td>${percent(row.searches?row.routes/row.searches:0)}</td><td>${number(row.clicks)}</td></tr>`).join('');
  document.querySelectorAll('[data-sort]').forEach(button=>{button.closest('th').setAttribute('aria-sort',button.dataset.sort===sort?(descending?'descending':'ascending'):'none');});
}
function renderDaily(){
  const rows=report.daily,w=640,h=190,left=43,right=12,top=10,bottom=26;
  const max=Math.max(1,...rows.map(d=>d.searches))*1.1;
  const x=i=>left+i/Math.max(1,rows.length-1)*(w-left-right),y=value=>top+(1-value/max)*(h-top-bottom);
  const line=field=>rows.map((d,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(d[field]).toFixed(1)}`).join(' ');
  const grid=Array.from({length:4},(_,i)=>{const v=max*i/3;return `<line x1="${left}" x2="${w-right}" y1="${y(v)}" y2="${y(v)}" stroke="#eeefe7" stroke-dasharray="3 5"/><text x="${left-9}" y="${y(v)+3}" text-anchor="end">${number(v,{notation:'compact',maximumFractionDigits:1})}</text>`;}).join('');
  const labels=[0,Math.floor((rows.length-1)/3),Math.floor((rows.length-1)*2/3),rows.length-1].map(i=>`<text x="${x(i)}" y="${h-3}" text-anchor="middle">${new Date(rows[i].date+'T12:00:00Z').toLocaleDateString(getLocale(),{day:'numeric',month:'short'})}</text>`).join('');
  $('daily-chart').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${t('Günlük etkileşim')}"><title>${t('Aramalar')}: ${number(report.summary.searches)}; ${t('Rotalar')}: ${number(report.summary.routes)}</title><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#b3c393" stop-opacity=".28"/><stop offset="100%" stop-color="#b3c393" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${line('searches')} L${x(rows.length-1)},${y(0)} L${x(0)},${y(0)} Z" fill="url(#chart-fill)"/><path d="${line('searches')}" fill="none" stroke="#69794f" stroke-width="2.5" stroke-linejoin="round"/><path d="${line('routes')}" fill="none" stroke="#b7a889" stroke-width="2" stroke-linejoin="round"/>${rows.map((d,i)=>`<circle cx="${x(i)}" cy="${y(d.searches)}" r="5" fill="transparent"><title>${date(d.date)} · ${t('Aramalar')}: ${number(d.searches)} · ${t('Rotalar')}: ${number(d.routes)}</title></circle>`).join('')}${labels}</svg>`;
}
function download(){
  if(!report)return;
  const blob=new Blob([reportCSV(report)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`Merkez-Ankara-DEMO-${report.filters.storeId}-${report.start}-${report.end}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  $('analytics-status').textContent=t('Rapor indirildi.');
}
applyView();await load();
