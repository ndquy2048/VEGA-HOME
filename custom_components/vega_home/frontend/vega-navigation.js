/* VEGA HOME device/browser startup preference.
 * This is intentionally browser-local. It cannot change HA's native per-user
 * default dashboard or affect other browser profiles on the same hardware. */
export const VEGA_PANEL='vega-home';
export const deviceDefaultKey=()=> 'vega-home-vega-startup:device:v2';
export function defaultPanelField(data){
  // Home Assistant frontend objects may use different field naming per object.
  // Never assume userData and systemData share one schema key.
  if(Object.prototype.hasOwnProperty.call(data||{},'default_panel'))return 'default_panel';
  if(Object.prototype.hasOwnProperty.call(data||{},'defaultPanel'))return 'defaultPanel';
  return 'default_panel';
}
export function readDeviceDefault(){
  try{const value=JSON.parse(localStorage.getItem(deviceDefaultKey()));
    return value?.version===2&&typeof value.enabled==='boolean'?value:null;
  }catch(_){return null;}
}
export function systemDashboardPath(hass){
  const panels=hass?.panels||{};
  const allowed=key=>key!==VEGA_PANEL&&key!=='vega-panel'&&/^[a-z0-9_-]+$/i.test(key||'')&&panels[key]&&
    (!panels[key].require_admin||hass?.user?.is_admin);
  const preferred=hass?.systemData?.[defaultPanelField(hass?.systemData)];
  const key=[preferred,'home','lovelace',...Object.keys(panels).filter(k=>panels[k].component_name==='lovelace')].find(allowed);
  return key?`/${key}`:null;
}
export function skipDeviceStartup(_hass,path){
  localStorage.setItem(`${deviceDefaultKey()}:exit`,JSON.stringify({path,until:Date.now()+30000}));
}
export function consumeStartupSkip(_hass,path){
  try{const item=JSON.parse(localStorage.getItem(`${deviceDefaultKey()}:exit`));
    localStorage.removeItem(`${deviceDefaultKey()}:exit`);
    return item?.until>Date.now()&&(item.path===path||path.startsWith(`${item.path}/`));
  }catch(_){return false;}
}
export function installVegaNavigation(panel,changed=()=>{}){
  let disposed=false,busy=false,notice='';
  const hass=()=>panel._hass;
  const deviceReady=()=>window.__vegaHomeDeviceStartup===1;
  const state=()=>({checked:Boolean(readDeviceDefault()?.enabled),busy,deviceReady:deviceReady(),notice,
    nativeAccountDefault:hass()?.userData?.[defaultPanelField(hass()?.userData)]===VEGA_PANEL});
  function refresh(){notice='';if(!disposed)changed();return Promise.resolve();}
  async function toggle(){
    if(disposed||busy)return;
    busy=true;notice='';changed();
    try{
      if(!deviceReady())throw Error('VEGA startup module missing');
      const enabled=!state().checked;
      localStorage.setItem(deviceDefaultKey(),JSON.stringify({version:2,enabled}));
      if(readDeviceDefault()?.enabled!==enabled)throw Error('localStorage verification failed');
      notice='startup.saved';
    }catch(_){notice='startup.error';}
    finally{busy=false;if(!disposed)changed();}
  }
  async function exit(){
    if(disposed||busy)return;
    busy=true;notice='';changed();
    try{
      let targetHass=hass();
      if(!targetHass?.systemData){
        const result=await targetHass.callWS({type:'frontend/get_system_data',key:'core'});
        if(disposed)return;
        targetHass={...hass(),systemData:result?.value||{}};
      }
      const path=systemDashboardPath(targetHass);
      if(!path)throw Error('No accessible HA dashboard');
      panel.rememberRoom?.();
      // One-time bypass ensures an explicit exit never loops back to Vega.
      let destination=path;
      if(deviceReady()){
        try{skipDeviceStartup(hass(),path);}catch(_){destination=`${path}?vega_home_exit=1`;}
      }
      window.location.assign(destination);
    }catch(_){if(!disposed)notice='startup.error';}
    finally{busy=false;if(!disposed)changed();}
  }
  return {state,refresh,toggle,exit,onHass(){if(!disposed)changed();},destroy(){disposed=true;}};
}
