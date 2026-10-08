import { LANGUAGE_CODES, LANGUAGE_NAMES, TRANSLATIONS } from './translations.js?v=1';

const LOCALES = { tr:'tr-TR', en:'en-GB', de:'de-DE', ar:'ar', es:'es-ES', fr:'fr-FR', zh:'zh-CN', ja:'ja-JP' };
let language = 'tr';
try { const saved = globalThis.localStorage?.getItem('merkez_ankara_language'); if (LANGUAGE_CODES.includes(saved)) language = saved; } catch {}
export const getLanguage = () => language;
export const getLocale = () => LOCALES[language];
export function t(source, values = {}) {
  return (TRANSLATIONS[source]?.[language] ?? source).replace(/\{(\w+)\}/g, (match,key) => values[key] ?? match);
}
export function number(value, options = {}) { return new Intl.NumberFormat(getLocale(), options).format(value); }
export function setLanguage(value) {
  if (!LANGUAGE_CODES.includes(value)) return false;
  language = value;
  try { globalThis.localStorage?.setItem('merkez_ankara_language', value); } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = value;
    document.documentElement.dir = value === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-language-select]').forEach(el => { el.value = value; });
    translateDOM(document.body);
    window.dispatchEvent(new CustomEvent('languagechange', { detail: { language:value } }));
  }
  return true;
}

const textSources = new WeakMap(), attrSources = new WeakMap();
const reverse = new Map();
for (const [source, entries] of Object.entries(TRANSLATIONS)) for (const value of Object.values(entries)) if (!reverse.has(value)) reverse.set(value, source);
const skip = element => element?.closest('script,style,canvas,[data-no-i18n],.store-name,.store-avatar,#card-name');
function translateText(node) {
  if (skip(node.parentElement)) return;
  const raw = node.nodeValue, trimmed = raw.trim();
  const saved = textSources.get(node);
  const source = saved?.output === trimmed ? saved.source : (TRANSLATIONS[trimmed] ? trimmed : reverse.get(trimmed));
  if (!source) return;
  const output = t(source);
  textSources.set(node,{source,output});
  if (trimmed !== output) node.nodeValue = raw.replace(trimmed,output);
}
export function translateDOM(root) {
  if (!root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 || skip(root)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) translateText(node);
  for (const element of [root,...root.querySelectorAll('[title],[placeholder],[aria-label],[data-i18n]')]) {
    if (skip(element)) continue;
    if (element.dataset.i18n && element.textContent !== t(element.dataset.i18n)) element.textContent=t(element.dataset.i18n);
    const saved = attrSources.get(element) ?? {};
    for (const attribute of ['title','placeholder','aria-label']) {
      const value=element.getAttribute(attribute);if(!value)continue;
      const source=saved[attribute]?.output===value ? saved[attribute].source : (TRANSLATIONS[value]?value:reverse.get(value));
      if (!source)continue;
      const output=t(source);saved[attribute]={source,output};if(value!==output)element.setAttribute(attribute,output);
    }
    attrSources.set(element,saved);
  }
}
let initialized=false;
export function initI18n() {
  if(initialized)return;initialized=true;
  document.querySelectorAll('[data-language-select]').forEach(select=>{
    select.setAttribute('aria-label','Dil');
    select.innerHTML=LANGUAGE_CODES.map((code,i)=>`<option value="${code}" lang="${code}" data-no-i18n>${LANGUAGE_NAMES[i]}</option>`).join('');
    select.addEventListener('change',()=>setLanguage(select.value));
  });
  setLanguage(language);
  // Only changed UI nodes are visited; the 3D scene and animation loop are untouched.
  new MutationObserver(records=>{
    const roots=new Set();for(const record of records){
      if(record.type==='childList')record.addedNodes.forEach(node=>roots.add(node));else roots.add(record.target);
    }
    roots.forEach(translateDOM);
  }).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label']});
}
