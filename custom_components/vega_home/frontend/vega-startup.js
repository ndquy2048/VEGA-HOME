/* Optional global entry. Register with frontend.extra_module_url, not Lovelace resources.
 * One bounded startup check; no ongoing polling, route interception or server writes. */
import {VEGA_PANEL,defaultPanelField,readDeviceDefault,systemDashboardPath,consumeStartupSkip} from './vega-navigation.js?v=v100c7';
if(window.__vegaHomeDeviceStartup!==1){
  window.__vegaHomeDeviceStartup=1;
  let timer=0,tries=0,stopped=false;
  // Navigation Timing retains the originally requested URL after HA's SPA redirect.
  const original=(()=>{try{return new URL(performance.getEntriesByType('navigation')[0]?.name||window.location.href).pathname;}catch(_){return window.location.pathname;}})();
  const stop=()=>{stopped=true;clearTimeout(timer);window.removeEventListener('pagehide',stop);};
  function check(){
    if(stopped)return;
    const hass=document.querySelector('home-assistant')?.hass;
    if(!hass?.user?.id||!hass.panels?.[VEGA_PANEL]||!hass.systemData){
      if(++tries<120)timer=setTimeout(check,250);else stop();
      return;
    }
    stop();
    const url=new URL(window.location.href);
    if(url.searchParams.get('vega_home_exit')==='1'){
      url.searchParams.delete('vega_home_exit');
      window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
      return;
    }
    if(hass.panels[VEGA_PANEL].require_admin&&!hass.user.is_admin)return;
    if(consumeStartupSkip(hass,window.location.pathname))return;
    const preference=readDeviceDefault(hass);if(!preference)return;
    const system=systemDashboardPath(hass),account=hass.userData?.[defaultPanelField(hass.userData)];
    const landing=['/','/home','/home/','/home/overview','/lovelace','/lovelace/','/lovelace/0',system,`${system}/`,
      ...(account&&account!==VEGA_PANEL?[`/${account}`,`/${account}/`]:[])];
    if(!landing.includes(original))return; // Preserve explicit deep links and manual panel URLs.
    const destination=preference.enabled?`/${VEGA_PANEL}`:system;
    if(destination&&window.location.pathname.split('/')[1]!==destination.slice(1))window.location.replace(destination);
  }
  window.addEventListener('pagehide',stop,{once:true});
  check();
}
