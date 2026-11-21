/* One viewport backdrop and one modal/idle owner.
 * The dialog modules retain their own content, commands, focus and zoom.
 * A transition can hand ownership to another modal without removing the blur.
 */
export function installVegaSurface(panel) {
  if (panel._surface) return panel._surface;
  const root=panel.shadowRoot;
  const backdrop=document.createElement('div');
  backdrop.className='vega-modal-backdrop';
  backdrop.hidden=true;
  backdrop.setAttribute('aria-hidden','true');
  root.append(backdrop);
  const active=new Map();
  let epoch=0, raf=0, hideTimer=0, disposed=false,focusAfterClose=null;
  function syncIdle(){
    const app=root.querySelector('.app');if(app)app.inert=active.size>0||!backdrop.hidden;
    if(active.size) panel._screensaver?.suspend?.();
    else {
      panel.updateHomeStates?.();
      if(!(panel.tab===1&&panel.cameraConfig?.()) && !panel._musicPage?.isOpen?.()) panel._screensaver?.resume?.();
    }
  }
  // A single stationary viewport backdrop remains mounted while modal
  // content updates. No per-pointer backdrop style changes are permitted.
  function syncBackdrop(){
    const {blur}=[...active.values()].at(-1)||{blur:18};
    backdrop.style.setProperty('--vega-modal-blur',`${blur}px`);
  }
  function open(id, blur=18){
    if(disposed) return;
    const alreadyActive=active.size>0;focusAfterClose=null;
    panel.setRoomMenu?.(false);
    panel._v41?.endTileResize();
    active.delete(id);active.set(id, {blur});
    ++epoch;clearTimeout(hideTimer);cancelAnimationFrame(raf);
    const first=backdrop.hidden;
    backdrop.hidden=false;
    syncBackdrop();
    if(first){
      backdrop.classList.remove('is-visible');
      void backdrop.offsetWidth;
      const current=epoch;
      raf=requestAnimationFrame(()=>{if(!disposed&&current===epoch)backdrop.classList.add('is-visible');});
    }else backdrop.classList.add('is-visible');
    if(!alreadyActive)syncIdle();
  }
  function close(id){
    if(disposed||!active.has(id))return;
    active.delete(id);
    ++epoch;cancelAnimationFrame(raf);clearTimeout(hideTimer);
    if(active.size){syncBackdrop();return;}
    backdrop.classList.remove('is-visible');
    const current=epoch;
    const duration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:235;
    hideTimer=setTimeout(()=>{
      if(disposed||epoch!==current||active.size)return;
      backdrop.hidden=true;syncIdle();
      if(focusAfterClose?.isConnected)focusAfterClose.focus({preventScroll:true});focusAfterClose=null;
    },duration);
  }
  function hasModal(){return active.size>0 || !backdrop.hidden;}
  function restoreFocus(target){
    if(!target?.isConnected)return;
    if(!active.size&&!backdrop.hidden)focusAfterClose=target;
    else target.focus({preventScroll:true});
  }
  function destroy(){disposed=true;++epoch;active.clear();cancelAnimationFrame(raf);clearTimeout(hideTimer);const app=root.querySelector('.app');if(app)app.inert=false;backdrop.remove();if(panel._surface===api)panel._surface=null;}
  const api={open,close,hasModal,destroy,restoreFocus,activeNames:()=>[...active.keys()]};
  return api;
}
