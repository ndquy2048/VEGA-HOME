/* VEGA HOME: playlist-only browser with prepared A/B/C return surfaces.
 * No embedded player, queue panel, album or library tabs.
 * Playback is delegated to MA through the existing HA connection. */
export function installVegaMusicPage(panel) {
  if(panel._musicPage)return panel._musicPage;
  const root=panel.shadowRoot;
  const css=document.createElement('link');css.rel='stylesheet';css.href='/vega_home_static/vega-music-page.css?v=v100c7';root.append(css);
  const page=document.createElement('section');page.className='amp-page';page.hidden=true;
  page.innerHTML=`<div class="amp-content"><header class="amp-header">
    <button type="button" class="amp-home" data-music-action="back" data-i18n-aria="music.back" aria-label="">‹</button>
    <div class="amp-brand"><span class="amp-brand-icon" aria-hidden="true">♫</span><strong>Music Assistant</strong><small data-i18n-text="music.playlists"></small></div>
    <button type="button" class="amp-root" data-music-action="home" data-i18n-aria="music.home" aria-label="">⌂</button>
  </header>
  <div class="amp-browser"><div class="amp-crumb"><button data-music-action="back" data-i18n-aria="music.back" aria-label="">‹</button><strong class="amp-path"></strong><small class="amp-status"></small></div>
    <div class="amp-results" aria-live="polite"></div></div>
  </div><div class="amp-message" role="status" hidden></div>
  <div class="amp-pending" role="status" aria-live="polite" hidden>
    <div class="amp-pending-glass"><span class="amp-liquid-spinner" aria-hidden="true"><i></i><i></i><i></i></span>
      <strong class="amp-pending-title"></strong>
      <span class="amp-pending-detail"></span>
    </div>
  </div>
  <div class="amp-menu-scrim" hidden></div><div class="amp-play-menu" role="menu" hidden></div>`;
  root.append(page);
  const $=s=>page.querySelector(s);
  const clean=s=>String(s??'');
  const esc=s=>clean(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const t=(key,vars)=>panel.t(key,vars);
  let playerID='';
  const isPlaylist=i=>/playlist/i.test(clean(i?.media_class||i?.media_content_type));
  const isTrack=i=>/track|song|music/i.test(clean(i?.media_class||i?.media_content_type));
  const playable=i=>!!i?.media_content_id && (i.can_play||isPlaylist(i)||isTrack(i));
  const playableType=i=>{const raw=clean(i?.media_class||i?.media_content_type);return /^(track|playlist|album|artist|radio)$/i.test(raw)?raw.toLowerCase():(isPlaylist(i)?'playlist':raw||'music');};
  let stack=[],results=[],loading=false,open=false,disposed=false,request=0,origin='home';
  let originDevice=null,exitDestination='home';
  let menuItem=null,toastTimer=null,pending=null,pendingTimer=null,exitTimer=null,leaving=false;
  let pendingTitleKey='',pendingDetailKey='',messageKey='';
  function say(key){messageKey=key;const el=$('.amp-message');el.textContent=t(key);el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{if(!disposed)el.hidden=true;},4000);}
  const pendingLayer=$('.amp-pending');
  const contentPlane=$('.amp-content');
  function pendingStatus(titleKey,detailKey){
    page.classList.add('is-pending');contentPlane.inert=true;
    pendingTitleKey=titleKey;pendingDetailKey=detailKey;pendingLayer.hidden=false;
    $('.amp-pending-title').textContent=t(titleKey);
    $('.amp-pending-detail').textContent=t(detailKey);
  }
  function clearPending(){
    pendingLayer.hidden=true;pendingTitleKey='';pendingDetailKey='';
    page.classList.remove('is-pending');contentPlane.inert=false;
  }
  const returnWithoutLock=()=>origin==='lock'?'home':origin;
  function prepareNonLockDestination(){
    panel.updateHomeStates?.({underMusic:true});
    if(exitDestination==='media'){
      // No-lock playback returns to the active device's usual media popup.
      if(!panel.openActiveMediaPopup?.({instant:true})&&originDevice)
        panel._media?.open?.(originDevice,null,{instant:true});
    }
  }
  function onLockAvailabilityChange(){
    if(!open||!leaving||exitDestination!=='lock'||panel.isLockAllowed())return;
    exitDestination=returnWithoutLock();
    prepareNonLockDestination();
  }
  function finishExit(){
    if(!open)return;
    onLockAvailabilityChange();
    clearTimeout(exitTimer);exitTimer=null;
    open=false;leaving=false;page.hidden=true;
    page.classList.remove('amp-leaving');clearPending();closeMenu();
    ++request;clearTimeout(pendingTimer);pending=null;
    if(exitDestination==='lock')panel._screensaver?.uncoverMusic?.();
    else if(exitDestination==='home'){
      panel.updateHomeStates?.();
      if(!panel._surface?.hasModal()&&!(panel.tab===1&&panel.cameraConfig()))panel._screensaver?.resume?.();
    }
  }
  async function closePage({success=false,playback=false,home=false}={}){
    if(!open||leaving||disposed)return;
    leaving=true;
    clearTimeout(pendingTimer);pending=null;
    const seq=++request;
    if(success)pendingStatus('music.connected','music.returning');
    else clearPending();
    exitDestination=home?'home':panel.isLockAllowed()?(playback?'lock':origin):(playback?'media':returnWithoutLock());
    if(home){
      panel._screensaver?.suspend?.();
      if(panel.tab!==0){panel.tab=0;panel.render();}
    }
    if(exitDestination==='lock'){
      let prepared=false;
      try{
        const saver=panel._screensaver||await panel.loadScreensaver?.();
        if(disposed||seq!==request)return;
        if(exitDestination==='lock'&&panel.isLockAllowed())
          prepared=await saver?.revealUnderMusic({full:playback});
      }catch(error){console.error('VEGA Lock return:',error);}
      if(disposed||seq!==request)return;
      onLockAvailabilityChange();
      if(exitDestination==='lock'&&!prepared){
        leaving=false;clearPending();say('music.lockUnavailable');
        return;
      }
    }else prepareNonLockDestination();
    // The return layer exists NOW; only the single C surface fades out.
    void page.offsetWidth;
    page.classList.add('amp-leaving');
    clearTimeout(exitTimer);
    exitTimer=setTimeout(finishExit,matchMedia('(prefers-reduced-motion: reduce)').matches?0:380);
  }
  function thumbnail(i){const src=clean(i?.thumbnail||i?.entity_picture);
    if(/^https?:\/\//i.test(src))return src;
    return src.startsWith('/')&&!src.startsWith('//')?(panel._hass?.hassUrl?.(src)||src):'';
  }
  function setPath(){const current=stack.at(-1);$('.amp-path').textContent=current?.title||t('music.playlists');}
  function render(){const list=$('.amp-results');
    if(loading){list.innerHTML=`<div class="amp-empty">${esc(t('music.loadingPlaylists'))}</div>`;return;}
    if(!results.length){list.innerHTML=`<div class="amp-empty">${esc(t('music.noPlaylists'))}</div>`;return;}
    list.innerHTML=results.map((item,i)=>{
      const pic=thumbnail(item),expand=!!item.can_expand,canPlay=playable(item);
      return `<div class="amp-item"><button class="amp-item-main" data-music-index="${i}" title="${esc(item.title)}">
        <span class="amp-item-cover">${pic?`<img src="${esc(pic)}" loading="lazy" alt="" referrerpolicy="no-referrer">`:'♫'}</span>
        <span class="amp-item-text"><strong>${esc(item.title||'—')}</strong><small>${esc(isPlaylist(item)?t('music.playlists'):isTrack(item)?t('music.track'):item.media_class||t('music.music'))}</small></span>
        ${expand?'<span class="amp-item-chevron">›</span>':''}</button>
        ${canPlay?`<button class="amp-item-play" data-music-play="${i}" aria-label="${esc(t('music.playNow'))}">▶</button><button class="amp-item-menu" data-music-options="${i}" aria-label="${esc(t('music.playOptions'))}">⋯</button>`:''}</div>`;
    }).join('');
  }
  async function browse(target=null,back=false,autofind=false){
    if(!panel._hass?.callWS){say('music.haNotConnected');return;}
    closeMenu();if(target&&!back)stack.push(target);setPath();
    const seq=++request;loading=true;render();$('.amp-status').textContent='…';
    const item=stack.at(-1)||null;
    try{
      const args={type:'media_player/browse_media',entity_id:playerID};
      if(item){args.media_content_id=item.media_content_id;args.media_content_type=item.media_content_type;}
      const data=await panel._hass.callWS(args);
      if(disposed||!open||seq!==request)return;
      const all=Array.isArray(data?.children)?data.children:[];
      // Enter MA's playlist directory directly when exposed in browse_media root.
      if(autofind && !stack.length){
        const directory=all.find(x=>x.can_expand && !isPlaylist(x) && /playlists?|danh sách phát|プレイリスト/i.test(clean(x.title)));
        if(directory){loading=false;return void browse(directory,false,false);}
      }
      // At root show playlist entries (and expandable directories leading to them).
      results=stack.length?all:all.filter(x=>isPlaylist(x)||(x.can_expand && /playlists?|danh sách phát|プレイリスト/i.test(clean(x.title))));
      $('.amp-status').textContent=String(results.length);
    }catch(error){if(disposed||!open||seq!==request)return;console.error('VEGA browse_media:',error);results=[];$('.amp-status').textContent='!';say('music.playlistsError');}
    finally{if(seq===request){loading=false;render();}}
  }
  function closeMenu(){menuItem=null;$('.amp-play-menu').hidden=true;$('.amp-menu-scrim').hidden=true;}
  const actions=[['play','music.keepQueue'],['next','music.nextKeepQueue'],['add','music.appendQueue'],['replace','music.replaceQueue'],['replace_next','music.replaceNext'],['shuffle','music.shufflePlay']];
  function showMenu(item,button){if(!playable(item))return;menuItem=item;
    const menu=$('.amp-play-menu');renderMenuItems();
    $('.amp-menu-scrim').hidden=false;menu.hidden=false;
    const rect=button.getBoundingClientRect(),bounds=page.getBoundingClientRect(),width=252;
    menu.style.left=`${Math.max(bounds.left+8,Math.min(rect.right-width,bounds.right-width-8))}px`;
    const top=bounds.top+(parseFloat(getComputedStyle(page).paddingTop)||8);
    menu.style.top=`${Math.max(top,Math.min(rect.top,bounds.bottom-menu.getBoundingClientRect().height-8))}px`;
  }
  const queueOnly=mode=>['add','next','replace_next'].includes(mode);
  function playbackSnapshot(entity){
    const a=entity?.attributes||{};
    return {playing:entity?.state==='playing',id:clean(a.media_content_id).trim(),
      title:clean(a.media_title).trim(),position:Number(a.media_position??NaN),
      duration:Number(a.media_duration??0),updatedAt:Date.parse(a.media_position_updated_at)};
  }
  function playbackStarted(before,now){
    if(!now.playing)return false;
    if(!before.playing)return true;
    if(before.id&&now.id){
      if(before.id!==now.id)return true;
    }else if(before.title&&now.title&&before.title!==now.title)return true;
    // Position ticks alone can arrive while an older song keeps playing.
    // A new timestamp with a reset in position can confirm replay of the same track.
    if(now.position>3||!(now.updatedAt>before.updatedAt))return false;
    return now.position+1<before.position||
      (now.duration>0&&now.position+1<before.position+(now.updatedAt-before.updatedAt)/1000);
  }
  function maybeFinish(){
    if(!pending||!pending.ack||!open||disposed)return;
    if(queueOnly(pending.mode)){void closePage({success:true});return;}
    if(playbackStarted(pending.before,playbackSnapshot(panel._hass?.states?.[playerID])))
      void closePage({success:true,playback:true});
  }
  async function play(item,mode='replace'){
    if(!playable(item)||pending||!panel._hass?.callService)return;
    closeMenu();pendingStatus('music.connecting','music.sending');
    const operation={ack:false,mode,before:playbackSnapshot(panel._hass.states?.[playerID])};
    pending=operation;
    const stillCurrent=()=>!disposed&&open&&pending===operation;
    const expire=()=>{if(stillCurrent()){pending=null;clearPending();say('music.timeout');}};
    pendingTimer=setTimeout(expire,15000);
    try{
      if(mode==='shuffle'){
        await panel._hass.callService('media_player','shuffle_set',{entity_id:playerID,shuffle:true});
        if(!stillCurrent())return;
        mode='replace';
      }
      if(mode==='replace_next')await panel._hass.callService('music_assistant','play_media',{
        media_id:clean(item.media_content_id),media_type:playableType(item),enqueue:'replace_next'
      },{entity_id:playerID});
      else await panel._hass.callService('media_player','play_media',{
        entity_id:playerID,media_content_id:clean(item.media_content_id),media_content_type:clean(item.media_content_type)||playableType(item),enqueue:mode
      });
      if(!stillCurrent())return;
      operation.ack=true;operation.mode=mode;
      pendingStatus('music.ack','music.waitingHA');
      clearTimeout(pendingTimer);pendingTimer=setTimeout(expire,10000);
      maybeFinish();
    }catch(error){
      if(!stillCurrent())return;
      console.error('VEGA play_media:',error);
      clearTimeout(pendingTimer);pending=null;clearPending();say('music.playlistError');
    }
  }
  function applyLanguage(){
    page.setAttribute('lang',panel.language);
    for(const el of page.querySelectorAll('[data-i18n-aria]'))el.setAttribute('aria-label',t(el.dataset.i18nAria));
    for(const el of page.querySelectorAll('[data-i18n-text]'))el.textContent=t(el.dataset.i18nText);
    setPath();
    if(!pendingLayer.hidden&&pendingTitleKey){$('.amp-pending-title').textContent=t(pendingTitleKey);$('.amp-pending-detail').textContent=t(pendingDetailKey);}
    if(!$('.amp-message').hidden&&messageKey)$('.amp-message').textContent=t(messageKey);
    if(!$('.amp-play-menu').hidden&&menuItem)renderMenuItems();
  }
  function renderMenuItems(){const menu=$('.amp-play-menu');menu.innerHTML=`<strong>${esc(menuItem.title)}</strong>`+actions.map(([mode,key])=>`<button data-music-mode="${mode}">${esc(t(key))}</button>`).join('');}
  function onClick(event){if(leaving||pending)return;if(event.target.closest('.amp-menu-scrim')){closeMenu();return;}
    const mode=event.target.closest('[data-music-mode]');if(mode){const item=menuItem;const m=mode.dataset.musicMode;closeMenu();if(item)void play(item,m);return;}
    const options=event.target.closest('[data-music-options]');if(options){showMenu(results[+options.dataset.musicOptions],options);return;}
    const playButton=event.target.closest('[data-music-play]');if(playButton){void play(results[+playButton.dataset.musicPlay]);return;}
    const itemButton=event.target.closest('[data-music-index]');if(itemButton){const item=results[+itemButton.dataset.musicIndex];if(item?.can_expand)void browse(item);else if(playable(item))void play(item);return;}
    const action=event.target.closest('[data-music-action]')?.dataset.musicAction;
    if(action==='home'){void closePage({home:true});return;}
    if(action==='back'){
      if(stack.length){stack.pop();void browse(null,true);}
      else void closePage({home:true});
    }
  }
  function onKey(event){if(!open)return;if(event.key==='Escape'){event.stopPropagation();if(!$('.amp-play-menu').hidden)closeMenu();else closePage();}}
  page.addEventListener('click',onClick);window.addEventListener('keydown',onKey);
  const api={open(from='home',device=null){
      if(disposed||open||!panel.musicAvailable())return;
      playerID=panel.musicPlayerID();
      origin=['home','media','lock'].includes(from)?from:'home';originDevice=device;exitDestination=origin;
      open=true;leaving=false;page.hidden=false;page.classList.remove('amp-leaving');clearPending();
      clearTimeout(toastTimer);$('.amp-message').hidden=true;loading=false;
      panel._popup?.close?.();panel._media?.close?.();
      if(origin==='lock')panel._screensaver?.coverByMusic?.();
      else{
        panel._screensaver?.suspend?.();
        if(panel.tab===1)panel.stopCamera?.();
      }
      stack=[];results=[];void browse(null,false,true);
    },
    close:closePage,isOpen:()=>open,onHass:maybeFinish,onLockAvailabilityChange,
    onLanguageChange(){applyLanguage();if(open)render();},
    destroy(){disposed=true;if(exitDestination==='lock')panel._screensaver?.uncoverMusic?.();clearTimeout(toastTimer);clearTimeout(pendingTimer);clearTimeout(exitTimer);++request;
      window.removeEventListener('keydown',onKey);page.removeEventListener('click',onClick);page.remove();css.remove();
      if(panel._musicPage===api)panel._musicPage=null;
    }
  };
  applyLanguage();
  return api;
}
