/* VEGA HOME — Liquid Glass media popup, independent of AC/light/fan. */
export function installVegaMedia(panel) {
  if (panel._media) return panel._media;
  const root = panel.shadowRoot;
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/vega_home_static/vega-media.css?v=v102c1';
  root.append(css);
  const overlay = document.createElement('div');
  overlay.className = 'am-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<section class="am-dialog" role="dialog" aria-modal="true" aria-labelledby="am-heading">
    <header class="am-head"><div><strong id="am-heading">${panel.escape(panel.t('media.speakerName'))}</strong><small class="am-state"></small></div>
      <button class="am-close" type="button" data-media-act="close" aria-label="${panel.escape(panel.t('popup.close'))}">×</button></header>
    <div class="am-body">
      <div class="am-album"><img class="am-cover" alt="" hidden><span class="am-fallback" aria-hidden="true"></span></div>
      <div class="am-details">
        <strong class="am-title">—</strong><span class="am-artist">—</span><small class="am-album-title"></small>
        <div class="am-progress"><input type="range" min="0" max="100" step="1" value="0" data-media-seek aria-label="${panel.escape(panel.t('media.seekPosition'))}" disabled>
          <div class="am-times"><span class="am-current">0:00</span><span class="am-duration">0:00</span></div></div>
        <div class="am-transport">
          <button type="button" data-media-act="previous" aria-label="${panel.escape(panel.t('media.previousTrack'))}">⏮</button>
          <button type="button" class="am-play" data-media-act="playpause" aria-label="${panel.escape(panel.t('media.play'))}">▶</button>
          <button type="button" data-media-act="next" aria-label="${panel.escape(panel.t('media.nextTrack'))}">⏭</button>
        </div>
        <div class="am-volume"><span aria-hidden="true">◖))</span><input type="range" min="0" max="100" step="1" data-media-volume aria-label="${panel.escape(panel.t('media.volume'))}"></div>
      </div>
    </div>
    <footer><small class="am-footnote"></small><div class="am-footer-actions">
      <button type="button" class="am-browse" data-media-act="browse">♫ <span class="am-browse-label">${panel.escape(panel.t('music.browse'))}</span></button>
      </div></footer>
    <div class="am-notice" role="status" aria-live="polite" hidden>
      <span class="am-spinner" aria-hidden="true"></span><span class="am-notice-text"></span>
    </div>
  </section>`;
  root.append(overlay);
  let current = null, pending = false, disposed = false;
  let artRequest=0, requestedArt=null, lastArt='', artOwner='';
  let focusBefore = null;
  let closeTimer = null;
  let openSerial = 0;
  let progressTimer=null, playTimer=null, noticeTimer=null, playRequest=null, noticeKey='';
  const $ = sel => overlay.querySelector(sel);
  const notice=$('.am-notice');
  const state = () => current && panel._hass?.states?.[panel.mediaEntityID(current)];
  const isHomePod = () => panel.mediaLimited(state());
  const formatTime = seconds => {
    const val = Math.max(0,Math.floor(Number(seconds)||0));
    return `${Math.floor(val/60)}:${String(val%60).padStart(2,'0')}`;
  };
  const eligible = e => e && !['unknown','unavailable'].includes(e.state);
  const supported = (e,bit) => {
    const f=e?.attributes?.supported_features;
    return !Number.isFinite(Number(f)) || (Number(f)&bit)!==0;
  };
  function elapsed(e) {
    const a=e?.attributes||{};
    let sec=Number(a.media_position)||0;
    if(e?.state==='playing' && a.media_position_updated_at) {
      const then=Date.parse(a.media_position_updated_at);
      if(Number.isFinite(then)) sec+=Math.max(0,(Date.now()-then)/1000);
    }
    return Math.min(Number(a.media_duration)||Number.MAX_SAFE_INTEGER,sec);
  }
  // Artwork is committed only after decode. The currently painted art stays
  // visible while a new URL is loading (also on C Music -> Media return).
  function setArtwork(url){
    const img=$('.am-cover'),fallback=$('.am-fallback');
    const owner=panel.mediaEntityID(current);
    if(owner!==artOwner){
      artOwner=owner;requestedArt=null;++artRequest;
      // A change of output must not erase an already decoded cover.
      // Keep the painted frame until replacement artwork is decoded.
    }
    if(url===lastArt && !img.hidden)return;
    if(url===requestedArt && artRequest)return;
    requestedArt=url;
    const serial=++artRequest;
    if(!url){lastArt='';img.hidden=true;fallback.hidden=false;img.removeAttribute('src');return;}
    const probe=new Image();
    const ready=new Promise((resolve,reject)=>{
      probe.onload=resolve;probe.onerror=reject;
      probe.src=url;
      if(probe.complete && probe.naturalWidth>0)resolve();
    });
    void ready.then(()=>typeof probe.decode==='function'?probe.decode():null)
      .then(()=>{
        if(disposed||serial!==artRequest)return;
        if(img.getAttribute('src')!==url)img.src=url;
        if(img.hidden)img.hidden=false;
        if(!fallback.hidden)fallback.hidden=true;
        lastArt=url;
      },()=>{
        if(disposed||serial!==artRequest)return;
        // No flash to the note glyph while a valid old cover is still painted.
        if(img.hidden){fallback.hidden=false;}
      });
  }
  function setLabel(selector,value){
    const element=$(selector),s=String(value??'');
    if(element&&element.textContent!==s)element.textContent=s;
  }
  function updateProgress(e=state()){
    if(!current||overlay.hidden||disposed)return;
    const a=e?.attributes||{},duration=Number(a.media_duration)||0;
    const slider=$('[data-media-seek]'),position=elapsed(e);
    const max=String(Math.max(1,duration)),value=String(Math.round(position));
    if(slider.max!==max)slider.max=max;
    if(slider.value!==value&&!slider.matches(':active'))slider.value=value;
    setLabel('.am-current',formatTime(position));
    setLabel('.am-duration',formatTime(duration));
  }
  let lastMetadata='';
  function update() {
    if (!current || overlay.hidden || disposed) return;
    const e=state(), a=e?.attributes||{}, playing=e?.state==='playing';
    const fallback=$('.am-fallback'),icon=panel.deviceIconName(current);
    if(fallback.dataset.icon!==icon){fallback.dataset.icon=icon;fallback.innerHTML=panel.deviceIcon(current);}
    const fallbackColor=playing?'#388ecb':'#f6f6f6';
    if(fallback.style.color!==fallbackColor)fallback.style.color=fallbackColor;
    const name=String(a.media_title||'').trim(),artist=String(a.media_artist||'').trim(),
      album=String(a.media_album_name||'').trim(),art=panel.mediaArtwork(e);
    const duration=Number(a.media_duration)||0;
    const signature=JSON.stringify([current.entity_id,e?.state,name,artist,album,art,duration,
      a.volume_level,a.supported_features,panel.language,pending,isHomePod()]);
    if(signature===lastMetadata){updateProgress(e);return;}
    lastMetadata=signature;
    const status = !eligible(e) ? panel.t('status.unavailable') :
      playing ? panel.t('media.playing') : e.state==='paused' ? panel.t('media.paused') : panel.t('media.idle');
    setLabel('.am-state',status);
    setLabel('.am-title',name||panel.t('media.unknownTitle'));
    setLabel('.am-artist',artist||panel.t('media.speakerName'));
    setLabel('.am-album-title',album);
    setArtwork(art);
    const slider=$('[data-media-seek]');
    slider.disabled=!eligible(e)||isHomePod()||!supported(e,2)||duration<=0||pending;
    const pp=$('[data-media-act="playpause"]');
    const glyph=playing?'Ⅱ':'▶';if(pp.textContent!==glyph)pp.textContent=glyph;
    pp.setAttribute('aria-label',panel.t(playing?'media.pause':'media.play'));
    pp.disabled=!eligible(e)||pending||(!supported(e,playing?1:16384)&&!supported(e,512));
    $('[data-media-act="next"]').disabled=!eligible(e)||isHomePod()||!supported(e,32)||pending;
    $('[data-media-act="previous"]').disabled=!eligible(e)||isHomePod()||!supported(e,16)||pending;
    const vol=$('[data-media-volume]');
    if(!vol.matches(':active'))vol.value=String(Math.round(Number(a.volume_level||0)*100));
    vol.disabled=!eligible(e)||!supported(e,4)||pending;
    setLabel('.am-footnote',e?.attributes?.friendly_name||panel.t('media.speakerName'));
    $('[data-media-act="browse"]').hidden=!panel.musicAvailable();
    setLabel('.am-browse-label',panel.t('music.browse'));
    refreshAria();updateProgress(e);
  }
  function refreshAria(){
    for(const [selector,key] of [['.am-close','popup.close'],['[data-media-seek]','media.seekPosition'],['[data-media-volume]','media.volume'],['[data-media-act="previous"]','media.previousTrack'],['[data-media-act="next"]','media.nextTrack']]){
      const el=$(selector),label=panel.t(key);if(el&&el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
    }
  }
  function showNotice(key='',loading=false){
    clearTimeout(noticeTimer);noticeKey=key;
    notice.hidden=!key;notice.classList.toggle('is-pending',loading);
    setLabel('.am-notice-text',key?panel.t(key):'');
    if(key&&!loading)noticeTimer=setTimeout(()=>showNotice(),4000);
  }
  function resetAction(){
    clearTimeout(playTimer);playRequest=null;pending=false;
  }
  function finishPlay(key){
    resetAction();showNotice(key);update();
  }
  function updatePlayback(){
    if(playRequest?.ack&&state()?.state==='playing'){finishPlay();return;}
    update();
  }
  async function action(command, data={}) {
    if(!current || pending || !eligible(state()) || !panel._hass?.callService)return;
    const serial=openSerial;
    const play=command==='media_play'?{ack:false}:null;
    const stillCurrent=()=>!disposed&&current&&serial===openSerial&&(!play||playRequest===play);
    pending=true;
    if(play){
      playRequest=play;showNotice('media.playConnecting',true);
      playTimer=setTimeout(()=>{if(stillCurrent())finishPlay('media.playTimeout');},12000);
    }
    update();
    try {
      await panel._hass.callService('media_player',command,{entity_id:panel.mediaEntityID(current),...data});
      if(!stillCurrent())return;
      if(play){
        play.ack=true;
        if(state()?.state!=='playing')showNotice('media.playWaiting',true);
        updatePlayback();
      }else{resetAction();update();}
    }catch(error){
      if(!stillCurrent())return;
      console.error('Apple Media popup:',command,error);
      if(play)finishPlay('error.control');
      else{setLabel('.am-footnote',panel.t('error.control'));resetAction();update();}
    }
  }
  function close() {
    if(!current)return;
    ++openSerial;
    overlay.classList.remove('am-visible');
    panel._surface?.close('media');
    clearTimeout(closeTimer);
    closeTimer=setTimeout(()=>{if(!overlay.classList.contains('am-visible'))overlay.hidden=true;},220);
    clearInterval(progressTimer);progressTimer=null;resetAction();showNotice();
    current=null;lastMetadata='';
    panel._surface?.restoreFocus(focusBefore);
  }
  function click(e){
    if(!current)return;
    if(e.target===overlay){close();return;}
    const b=e.target.closest('button[data-media-act]');
    if(!b)return;
    const op=b.dataset.mediaAct;
    if(op==='close'){close();return;}
    if(op==='browse'){panel.openMusicPage('media',current);return;}
    if(op==='playpause') void action(state()?.state==='playing'?'media_pause':'media_play');
    if(op==='previous') void action('media_previous_track');
    if(op==='next') void action('media_next_track');
  }
  function change(e){
    if(e.target.matches('[data-media-volume]'))void action('volume_set',{volume_level:Number(e.target.value)/100});
    if(e.target.matches('[data-media-seek]'))void action('media_seek',{seek_position:Number(e.target.value)});
  }
  function keydown(e){if(current&&e.key==='Escape'){e.stopPropagation();close();}}
  // : horizontal swipe over artwork/details changes tracks for MA.
  // Touching the seek/volume sliders keeps their native drag behavior.
  let swipeStart=null;
  const body=$('.am-body');
  const mediaDown=event=>{
    if(event.target.closest('input,button') || (event.button!==0&&event.pointerType!=='touch'))return;
    swipeStart={x:event.clientX,y:event.clientY,id:event.pointerId};
  };
  const mediaUp=event=>{
    if(!swipeStart || event.pointerId!==swipeStart.id)return;
    const dx=event.clientX-swipeStart.x,dy=event.clientY-swipeStart.y;
    swipeStart=null;
    if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.4||isHomePod())return;
    const actionName=dx<0?'media_next_track':'media_previous_track';
    const bit=dx<0?32:16;
    if(supported(state(),bit)){event.preventDefault();event.stopPropagation();void action(actionName);}
  };
  body.addEventListener('pointerdown',mediaDown);
  body.addEventListener('pointerup',mediaUp);
  body.addEventListener('pointercancel',()=>{swipeStart=null;});
  overlay.addEventListener('click',click);
  overlay.addEventListener('change',change);
  window.addEventListener('keydown',keydown);
  const api={
    open(d,anchor=null,{instant=false}={}){
      if(disposed||d?.entity_id?.split('.')[0]!=='media_player')return false;
      if(overlay.hidden)focusBefore=root.activeElement;
      clearTimeout(closeTimer);
      const serial=++openSerial;
      resetAction();showNotice();
      panel._surface?.open('media',16);
      current=d;lastMetadata='';overlay.hidden=false;
      overlay.classList.remove('am-visible');
      overlay.querySelector('.am-dialog').classList.add('v43-prep');
      const rect=anchor?.getBoundingClientRect?.();
      const dialog=$('.am-dialog'),frame=overlay.getBoundingClientRect();
      const naturalW=dialog.offsetWidth,naturalH=dialog.offsetHeight;
      if(rect&&naturalW&&naturalH){
        dialog.style.setProperty('--v43-origin-x',`${rect.left+rect.width/2-frame.left-frame.width/2}px`);
        dialog.style.setProperty('--v43-origin-y',`${rect.top+rect.height/2-frame.top-frame.height/2}px`);
        dialog.style.setProperty('--v43-origin-sx',String(Math.max(.08,Math.min(.9,rect.width/naturalW))));
        dialog.style.setProperty('--v43-origin-sy',String(Math.max(.08,Math.min(.9,rect.height/naturalH))));
      }
      void getComputedStyle(dialog).transform; // commit origin-size start frame
      if(instant){
        // Render the destination popup fully while the playlist surface is
        // still opaque. No intermediate glimpse of Home through half-faded C.
        overlay.style.setProperty('transition','none','important');
        dialog.style.setProperty('transition','none','important');
        dialog.classList.remove('v43-prep');
        overlay.classList.add('am-visible');
        void overlay.offsetWidth;
        requestAnimationFrame(()=>{if(disposed||serial!==openSerial)return;
          overlay.style.removeProperty('transition');dialog.style.removeProperty('transition');});
      }else{
        overlay.style.removeProperty('transition');dialog.style.removeProperty('transition');
        requestAnimationFrame(()=>{if(disposed||serial!==openSerial)return;dialog.classList.remove('v43-prep');
          requestAnimationFrame(()=>{if(!disposed&&serial===openSerial)overlay.classList.add('am-visible');});});
      }
      $('#am-heading').textContent=panel.deviceName(d);
      $('.am-close').setAttribute('aria-label',panel.t('popup.close'));
      clearInterval(progressTimer);progressTimer=setInterval(()=>updateProgress(),1000);
      update();$('.am-close').focus();return true;
    },
    onHass:updatePlayback,
    onLanguageChange(){lastMetadata='';refreshAria();if(noticeKey)setLabel('.am-notice-text',panel.t(noticeKey));update();},
    close,
    destroy(){disposed=true;++artRequest;panel._surface?.close('media');clearTimeout(closeTimer);clearInterval(progressTimer);
      resetAction();clearTimeout(noticeTimer);window.removeEventListener('keydown',keydown);overlay.removeEventListener('click',click);overlay.removeEventListener('change',change);body.removeEventListener('pointerdown',mediaDown);body.removeEventListener('pointerup',mediaUp);overlay.remove();css.remove();if(panel._media===api)panel._media=null;}
  };
  return api;
}
