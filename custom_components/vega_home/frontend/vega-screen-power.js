/* A one-shot inactivity timer, only while this browser shows its Lock surface. */
export function installLockScreenPower(panel,visible,{now=()=>Date.now(),schedule=setTimeout,cancel=clearTimeout}={}) {
 let timer=null,disposed=false,lastActivity=now(),context='',blocked=true,attempted=false,lastScreen='';
 const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 function sync(reset=false){
   clear();if(disposed)return;
   const options=panel._v41?.screenPowerSettings?.()||{},id=panel._sharedConfig?.settings?.screen_entity||'';
   const minutes=Number(options.minutes),screen=panel.screenState?.();
   const key=JSON.stringify([panel._hass?.user?.id,panel._panelInfo?.config?.entry_id,id,minutes,!!options.keepWhileMusic]);
   const waiting=!visible()||!panel.isConnected||globalThis.document?.visibilityState==='hidden'||!id||
     ![5,10,30,60,120,180].includes(minutes)||screen!=='on'||(options.keepWhileMusic&&!!panel.mediaActive());
   if(reset||key!==context||waiting!==blocked||(screen==='on'&&lastScreen!=='on')){
     lastActivity=now();attempted=false;
   }
   context=key;blocked=waiting;lastScreen=screen;
   if(waiting||attempted)return;
   const remaining=Math.max(0,minutes*60000-(now()-lastActivity));
   timer=schedule(()=>{
     timer=null;
     // Re-evaluate HA, the surface and playback at the deadline before acting.
     sync();
     if(blocked||attempted||context!==key||now()-lastActivity<minutes*60000)return;
     clear();attempted=true;
     void panel.sendScreenService('turn_off');
   },remaining);
 }
 return {sync,activity(){sync(true);},destroy(){disposed=true;clear();}};
}
