/* Bounded HA requests. Aborting stops this consumer, never an accepted HA write. */
export function vegaRequest(hass, message, {timeout=9000, signal}={}) {
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(fn,value)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
      fn(value);
    };
    const abort=()=>finish(reject,Object.assign(new Error('Vega request cancelled'),{code:'cancelled'}));
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>finish(reject,Object.assign(new Error('Vega request timed out'),{code:'timeout'})),timeout);
    Promise.resolve().then(()=>{
      if(settled)return;
      if(typeof hass?.callWS!=='function')throw new Error('Home Assistant WebSocket unavailable');
      return hass.callWS(message);
    }).then(value=>finish(resolve,value),error=>finish(reject,error));
  });
}
