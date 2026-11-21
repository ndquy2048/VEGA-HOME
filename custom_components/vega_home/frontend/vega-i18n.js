import {LANGUAGE_META,DEFAULT_WORDS} from './vega-language-data.js?v=v102c1';

export {LANGUAGE_META};
export const LOCALE_WORDS=Object.assign(Object.create(null),{en:DEFAULT_WORDS});
const pending=new Map();
const storageKey='smart-home-panel-language-vega';
const aliases=new Map([
  ['zh','zh-Hans'],['zh-cn','zh-Hans'],['zh-sg','zh-Hans'],
  ['zh-tw','zh-Hant'],['zh-hk','zh-Hant'],['zh-mo','zh-Hant'],['iw','he'],['no','nb']
]);
const supported=new Map(Object.keys(LANGUAGE_META).map(code=>[code.toLowerCase(),code]));
const wordKeys=Object.keys(DEFAULT_WORDS);
const placeholders=text=>[...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort().join('|');
const wordVariables=Object.fromEntries(wordKeys.map(key=>[key,placeholders(DEFAULT_WORDS[key])]));

function matchLocale(value){
  const parts=String(value||'').trim().replace(/_/g,'-').toLowerCase().split('-');
  while(parts.length){
    const tag=parts.join('-');
    const code=supported.get(tag)||aliases.get(tag);
    if(code)return code;
    parts.pop();
  }
  return null;
}

export const resolveLocale=value=>matchLocale(value)||'en';

export async function ensureLanguage(code){
  if(LOCALE_WORDS[code])return true;
  if(!Object.hasOwn(LANGUAGE_META,code))return false;
  if(pending.has(code))return pending.get(code);

  const request=Promise.resolve().then(async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(`/vega_home_static/languages/${code}.json?v=v102c1`,{
        cache:'force-cache',signal:controller.signal
      });
      if(!response.ok)throw Error('Language HTTP '+response.status);
      const data=await response.json();
      const words=data?.words;
      const valid=data?.code===code&&words&&Object.keys(words).length===wordKeys.length&&
        wordKeys.every(key=>typeof words[key]==='string'&&words[key].trim()&&placeholders(words[key])===wordVariables[key]);
      if(!valid)throw Error('Invalid Vega language pack: '+code);
      LOCALE_WORDS[code]=words;
      return true;
    }catch(error){
      console.warn('Vega language pack unavailable:',code,error);
      return false;
    }finally{
      clearTimeout(timer);
      pending.delete(code);
    }
  });
  pending.set(code,request);
  return request;
}

export function installVegaLocale(panel){
  let preference='auto',epoch=0,disposed=false,attempted='',owner='';
  try{preference=matchLocale(localStorage.getItem(storageKey))||'auto';}catch(_){}
  const user=()=>panel._hass?.user?.id||'';
  const target=()=>preference==='auto'
    ?resolveLocale(panel._hass?.locale?.language||panel._hass?.language||panel._hass?.selectedLanguage)
    :preference;
  const initial=target();
  panel.language=LOCALE_WORDS[initial]?initial:'en';

  async function sync(force=false){
    const code=target(),userID=user();
    if(disposed||(!force&&code===attempted&&userID===owner))return;
    const seq=++epoch;
    attempted=code;
    owner=userID;
    const available=Boolean(LOCALE_WORDS[code])||await ensureLanguage(code);
    if(disposed||seq!==epoch||userID!==user())return;
    const language=available?code:'en';
    const changed=panel.language!==language;
    panel.language=language;
    if((changed||force)&&panel.ready&&panel.isConnected)panel.applyLocaleChange();
  }

  return {
    onHass(){void sync();},
    preference:()=>preference,
    select(value){
      const code=value==='auto'?'auto':matchLocale(value);
      if(!code)return;
      preference=code;
      try{localStorage.setItem(storageKey,preference);}catch(_){}
      return sync(true);
    },
    destroy(){disposed=true;++epoch;}
  };
}
