import {installVegaWallpaper} from './vega-wallpaper.js?v=v200c1';
import {installVegaNavigation} from './vega-navigation.js?v=v200c1';
import {installVegaSystemMedia} from './vega-system-media.js?v=v200c1';
/* VEGA HOME: responsive tiles and appearance/startup settings. */
export function installVegaAppearance(panel) {
  const root=panel.shadowRoot;
  const settingsKey='vega-panel-settings-vega';
  const defaults={idle:60,lockImageURL:'',lockImageSource:null,lockImageEntity:'',lockInterval:300,screenOffMinutes:0,keepScreenOnWithMusic:true,showHomeTab:true};
  const words=()=>({title:panel.t('appearance.settings'),close:panel.t('popup.close'),theme:panel.t('appearance.theme'),lock:panel.t('appearance.idle'),language:panel.t('language.title')});
  const esc=v=>panel.escape(String(v??''));
  let settings={...defaults};
  try {
    const stored=JSON.parse(localStorage.getItem(settingsKey)||'{}');
    if(stored && typeof stored==='object')settings={...settings,...stored};
  } catch(_) {}
  if(![0,20,40,60].includes(Number(settings.idle)))settings.idle=60;
  if(![0,5,10,30,60,120,180].includes(settings.screenOffMinutes))settings.screenOffMinutes=0;
  settings.keepScreenOnWithMusic=settings.keepScreenOnWithMusic!==false;

  const save=()=>{try{localStorage.setItem(settingsKey,JSON.stringify(settings));return true;}catch(_){return false;}};

  // Two half-height rows plus their gap form one regular tile.
  const GAP=7;
  const content=root.getElementById('content');
  let gridWidth=0, gridHeight=0, gridColumns=0;
  const layoutGrid=()=>{
    const rect=content.getBoundingClientRect(),width=rect.width,height=rect.height;
    if(!width||!height)return; // Keep the last geometry while Home is hidden.
    const compact=getComputedStyle(content).getPropertyValue('--vega-compact-rooms').trim()==='1';
    panel.syncRoomMenu(compact);
    const cols=compact?2:Math.max(1,Math.floor((width+GAP)/151));
    if(width===gridWidth&&height===gridHeight&&cols===gridColumns)return;
    gridWidth=width;gridHeight=height;gridColumns=cols;
    const size=(width-(cols-1)*GAP)/cols;
    const fullHeight=compact?size*.8:Math.min(size*.8,Math.max(112,(height-GAP)/2-1));
    const row=(fullHeight-GAP)/2;
    const pad=Math.max(8,Math.min(18,size*.06,(row-28)/2));
    const icon=Math.min(size*.25,row-2*pad);
    const values={
      cols, tile:size, row, pad,
      icon, glyph:icon*.64,
      title:Math.max(12,Math.min(22,size*.084)),
      status:Math.max(10.6,Math.min(18,size*.075)),
      temp:Math.max(30,Math.min(72,size*.30))
    };
    for(const [key,value] of Object.entries(values))
      content.style.setProperty(`--vega-${key}`,key==='cols'?String(value):`${value.toFixed(2)}px`);
  };
  const render=content=>{
    endTileResize();
    if(!tileSizes&&panel.rooms.length)tileSizes=readTileSizes()||{};
    layoutGrid();
    const entries=panel.deviceEntries();
    const filter=panel._deviceFilter||'all';
    const roomGroups=(panel.room===-1?panel.rooms.map((room,index)=>({room,index})):
      [{room:panel.rooms[panel.room],index:panel.room}]);
    const card=({device:d,index:i,roomIndex})=>{
      const kind=panel.deviceKind(d);
      const isSwitch=d.entity_id.startsWith('switch.');
      // A switch can look like any device type, but it stays a simple switch.
      const tileKind=isSwitch&&kind==='climate'?'switch':kind;
      const toggle=kind==='climate'&&!isSwitch
        ? `<button type="button" class="vega-icon-toggle vega-climate-toggle" data-device-toggle="${i}" aria-pressed="false"><span class="climate-current" aria-hidden="true">—°</span></button>`
        : `<button type="button" class="symbol vega-icon-toggle" data-device-toggle="${i}" aria-pressed="false">${panel.deviceIcon(d)}<span class="vega-icon-warning" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M11.1 3.3 1.4 19.1c-.5 1 .3 2.2 1.5 2.2h18.2c1.2 0 2-1.2 1.4-2.2L12.9 3.3a1 1 0 0 0-1.8 0Z" fill="currentColor"/><path d="M12 8.6v5.7m0 3.1v.2" stroke="#523D24" stroke-width="2.2" stroke-linecap="round"/></svg></span></button>`;
      const name=esc(panel.deviceName(d));
      return `<div class="card v41-card device-type-${tileKind}${isHalfSize(d)?' is-compact':''}" data-display-kind="${kind}" data-device="${i}" data-origin-room="${roomIndex}" style="${panel.devicePaletteStyle(kind)}" role="button" tabindex="0" aria-keyshortcuts="Shift+F10" aria-label="${name}">
        <button type="button" class="vega-tile-resize" data-device-resize="${i}" hidden aria-label="${esc(resizeLabel(d))}">${resizeIcon(isHalfSize(d))}</button>
        ${toggle}<span class="detail"><strong>${name}</strong><small class="device-status">${esc(panel.t('status.loading'))}</small></span></div>`;
    };
    let total=0;
    const sections=roomGroups.map(({room,index})=>{
      const candidates=entries.filter(e=>e.roomIndex===index&&
        panel.filterDevice(e.device,filter));
      if(!candidates.length)return '';
      const ranks=new Map((tileOrder[room.name]||[]).map((id,i)=>[id,i]));
      candidates.sort((a,b)=>(ranks.get(a.device.entity_id)??entries.length)-
        (ranks.get(b.device.entity_id)??entries.length)||a.index-b.index);
      total+=candidates.length;
      const label=panel.room===-1?`<h2 class="vega-home-room-heading"><span>${esc(panel.roomName(room))}</span></h2>`:'';
      return `<section class="vega-home-room-section" data-home-room="${index}">${label}<div class="cards devices v41-grid" aria-label="${esc(panel.roomName(room))}">${candidates.map(card).join('')}</div></section>`;
    }).join('');
    if(!total){
      const canAdd=filter==='all'&&panel.room>=0&&panel._hass?.user?.is_admin;
      content.innerHTML=`<div class="vega-home-empty"><p>${esc(panel.t(filter==='all'?'vega.emptyDevices':'v2.noFilteredDevices'))}</p>${canAdd?`<button type="button" data-home-add-device>${esc(panel.t('vega.addEntity'))}</button>`:''}</div>`;
      return;
    }
    content.innerHTML=`<div class="v41-device-wrap${panel.room===-1?' vega-all-home':''}">${sections}</div>`;
  };

  const sizeKey='vega-panel-tile-sizes-vega';
  let sizeStorageWritable=true;
  function readTileSizes(){
    try{
      const saved=JSON.parse(localStorage.getItem(sizeKey));
      if(!saved?.compact||typeof saved.compact!=='object'||Array.isArray(saved.compact))return {};
      if(saved.version===1){
        const migrated=Object.fromEntries(panel.rooms.flatMap(room=>room.devices||[])
          .map(device=>[device.entity_id,saved.compact[device.entity_id]===true]));
        try{localStorage.setItem(sizeKey,JSON.stringify({version:2,compact:migrated}));}
        catch(_){sizeStorageWritable=false;}
        return migrated;
      }
      if(saved.version===2)
        return Object.fromEntries(Object.entries(saved.compact).filter(([,value])=>typeof value==='boolean'));
      return {};
    }catch(_){return null;}
  }
  let tileSizes=null;
  const isHalfSize=device=>tileSizes[device.entity_id]!==false;
  const orderKey='vega-panel-tile-order-vega';
  function readTileOrder(){
    try{
      const saved=JSON.parse(localStorage.getItem(orderKey));
      if(saved?.version!==1||!saved.rooms||typeof saved.rooms!=='object'||Array.isArray(saved.rooms))return {};
      return Object.fromEntries(Object.entries(saved.rooms).filter(([,ids])=>Array.isArray(ids))
        .map(([name,ids])=>[name,[...new Set(ids.filter(id=>typeof id==='string'))]]));
    }catch(_){return null;}
  }
  let tileOrder=readTileOrder()||{};
  let drag=null,blockDragClick=false;
  const tileMotions=new Map();
  function stopTileMotion(card){
    tileMotions.get(card)?.cancel();tileMotions.delete(card);
  }
  function clearTileMotions(){
    for(const card of tileMotions.keys())stopTileMotion(card);
  }
  function layoutRect(card){
    if(!Number.isFinite(card.offsetLeft)){
      const rect=card.getBoundingClientRect();
      const x=parseFloat(card.style.getPropertyValue('--vega-drag-x'))||0;
      const y=parseFloat(card.style.getPropertyValue('--vega-drag-y'))||0;
      return {...rect,left:rect.left-x,right:rect.right-x,top:rect.top-y,bottom:rect.bottom-y};
    }
    const grid=card.parentElement.getBoundingClientRect();
    const left=grid.left+card.offsetLeft,top=grid.top+card.offsetTop;
    return {left,top,right:left+card.offsetWidth,bottom:top+card.offsetHeight,
      width:card.offsetWidth,height:card.offsetHeight};
  }
  function captureTiles(){
    return new Map(Array.from(content.querySelectorAll('.v41-card'))
      .map(card=>[card,card.getBoundingClientRect()]));
  }
  function animateTiles(before){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){clearTileMotions();return;}
    for(const [card,from] of before){
      if(!card.isConnected||card===drag?.card)continue;
      const to=layoutRect(card);
      stopTileMotion(card);
      if(!to.width||!to.height||typeof card.animate!=='function')continue;
      const x=from.left-to.left+(from.width-to.width)/2;
      const y=from.top-to.top+(from.height-to.height)/2;
      const sx=from.width/to.width,sy=from.height/to.height;
      if(Math.abs(x)+Math.abs(y)+Math.abs(sx-1)+Math.abs(sy-1)<.1)continue;
      // Individual translate/scale leave wiggle and the fan's transform independent.
      const motion=card.animate([{translate:`${x}px ${y}px`,scale:`${sx} ${sy}`},
        {translate:'0px 0px',scale:'1 1'}],
        {duration:240,easing:'cubic-bezier(.2,.75,.25,1)',fill:'both'});
      tileMotions.set(card,motion);
      motion.finished.then(()=>{
        if(tileMotions.get(card)!==motion)return;
        tileMotions.delete(card);motion.cancel();
      }).catch(()=>{});
    }
  }
  let resizeTarget=null,editMode='',removeBusy=false,removeFinishRequested=false,removalSession=0,press=null,suppressedClick=null,roomPress=null,suppressRoomClick=null;
  let homeContext=null;
  const homeContextMenu=document.createElement('div');homeContextMenu.className='vega-home-context';homeContextMenu.hidden=true;
  homeContextMenu.setAttribute('role','menu');root.append(homeContextMenu);
  function canEdit(){return !disposed&&(panel.room===-1||Boolean(panel.rooms[panel.room]))&&panel._hass?.user?.is_admin&&panel.rooms.length&&!panel._surface?.hasModal()&&!root.querySelector('.app')?.hidden;}
  function dismissHomeContext(){homeContextMenu.hidden=true;homeContext=null;}
  const roomTarget='#rooms [data-room],#room-menu [data-room-menu-option],#room-menu-toggle,.room-title';
  const roomIndex=element=>Number(element.dataset.roomMenuOption??element.dataset.room??panel.room);
  const itemCategory=()=>['devices','cameras','scenes','automations'][panel.tab]||'devices';
  const homeCards=()=>content.querySelector('.vega-remove-camera-list')?
    [...content.querySelectorAll('.vega-camera-remove-card')]:[...content.querySelectorAll('.v41-card[data-device],.action-card[data-action-card],.vega-camera-launch')];
  const cardIndex=card=>card.hasAttribute('data-device')?Number(card.dataset.device):card.hasAttribute('data-action-card')?Number(card.dataset.actionCard):
    card.hasAttribute('data-camera-index')?Number(card.dataset.cameraIndex):panel.rooms[panel.room]?.cameras?.findIndex(item=>item.entity_id===panel.cameraConfig()?.entity_id)??-1;
  // Resolve a Home card through the same flattened index as its service handler.
  // Never interpret that index as the position inside one room.
  const cardEntry=card=>{
    if(!card)return null;
    const category=itemCategory(),index=cardIndex(card);
    const entry=category==='devices'?panel.deviceEntries()[index]:panel.categoryEntries(category)[index];
    return entry?{item:entry.device||entry.item,roomIndex:entry.roomIndex,index,category}:null;
  };
  const cardItem=card=>card?.dataset.roomItemId?
    panel.categoryEntries(itemCategory()).find(entry=>entry.item?.entity_id===card.dataset.roomItemId)?.item||null:
    cardEntry(card)?.item||null;
  function openHomeContext(type,index,x,y){
    if(!canEdit()||(editMode==='remove'&&type!=='room'))return;
    dismissHomeContext();
    const isRoom=type==='room',category=type==='device'?'devices':type;
    const entry=isRoom?null:(category==='devices'?panel.deviceEntries():panel.categoryEntries(category))[index];
    const roomIndex=isRoom?index:entry?.roomIndex;
    const item=isRoom?panel.rooms[index]:entry?.device||entry?.item;
    if(!item||!panel.rooms[roomIndex])return;
    homeContext={type,index,category,roomIndex,roomName:panel.rooms[roomIndex].name,itemID:item.entity_id};
    const actions=isRoom?[
      ['rooms',panel.t('vega.editRoom')],['add-device',panel.t('vega.addEntity')]
    ]:[...(type==='device'?[['layout',panel.t('vega.layoutDevice')]]:[]),['edit',panel.t('vega.editDevice')],['remove',panel.t('vega.removeFromRoom')]];
    homeContextMenu.innerHTML=`<strong>${esc(isRoom?panel.roomName(item):panel.deviceName(item))}</strong>${actions.map(([action,label])=>`<button type="button" role="menuitem" data-home-context-action="${action}">${esc(label)}</button>`).join('')}`;
    homeContextMenu.hidden=false;
    const margin=10,bounds=homeContextMenu.getBoundingClientRect();
    homeContextMenu.style.left=`${Math.max(margin,Math.min(x,window.innerWidth-bounds.width-margin))}px`;
    homeContextMenu.style.top=`${Math.max(margin,Math.min(y,window.innerHeight-bounds.height-margin))}px`;
    homeContextMenu.querySelector('button')?.focus({preventScroll:true});
  }
  function contextual(action){
    const context=homeContext;if(!context)return;dismissHomeContext();
    suppressedClick=null;suppressRoomClick=null;
    const {type,index,category,roomIndex,roomName,itemID}=context;
    if(type==='room'){
      endTileResize();
      if(action==='rooms')panel.openConfiguration({mode:'rooms',roomIndex:index});
      if(action==='add-device')panel.openConfiguration({mode:'add-device',roomIndex:index});
    }else{
      const entry=(category==='devices'?panel.deviceEntries():panel.categoryEntries(category))[index];
      if(panel.rooms[roomIndex]?.name!==roomName||entry?.roomIndex!==roomIndex||
         (entry.device||entry.item)?.entity_id!==itemID)return;
      const card=homeCards().find(card=>cardIndex(card)===index);
      if(action==='layout'){endTileResize();selectResizeTile(card);return;}
      // From Home use the same draft editor (Remove + Save) to avoid deleting
      // an entity from another room through a flattened index.
      if(action==='remove'&&panel.room>=0){startRemove(card);return;}
      if(action==='edit'||action==='remove'){
        endTileResize();
        panel.openConfiguration({mode:'device',roomIndex,category,itemID});
      }
    }
  }
  function cancelRoomPress(){clearTimeout(roomPress?.timer);roomPress=null;}

  const done=document.createElement('button');
  done.type='button';done.className='head-action tile-edit-done';done.hidden=true;
  done.textContent=panel.t('tile.done');
  root.querySelector('.head-actions').append(done);
  function resizeLabel(device){
    return panel.t(isHalfSize(device)?'tile.expand':'tile.shrink',{name:panel.deviceName(device)});
  }
  function resizeIcon(compact){
    const path=compact?'M8 3H3v5m0-5 6 6m7 12h5v-5m0 5-6-6':'M3 3l6 6M4 9h5V4m12 17-6-6m0 5v-5h5';
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
  }
  function cancelPress(){
    if(press?.active)suppressedClick={card:press.card,until:Date.now()+700};
    clearTimeout(press?.timer);press=null;
  }
  function endTileResize({restoreFocus=false}={}){
    finishDrag(false);
    clearTileMotions();
    cancelPress();
    dismissHomeContext();
    if(!resizeTarget&&!editMode)return;
    const previous=resizeTarget;
    resizeTarget=null;editMode='';++removalSession;done.hidden=true;done.disabled=false;removeFinishRequested=false;
    for(const grid of content.querySelectorAll('.is-resizing,.is-removing')){grid.classList.remove('is-resizing');grid.classList.remove('is-removing');}
    for(const card of homeCards()){
      card.classList.remove('is-resize-target');
      const resize=card.querySelector('.vega-tile-resize');if(resize){resize.hidden=true;resize.removeAttribute('data-room-item-remove');const device=cardItem(card);if(device){resize.innerHTML=resizeIcon(isHalfSize(device));resize.setAttribute('aria-label',resizeLabel(device));}}
      card.removeAttribute('data-room-item-id');
      const toggle=card.querySelector('.vega-icon-toggle');if(toggle)toggle.inert=false;
    }
    content.querySelectorAll('[data-room-item-remove]:not(.vega-tile-resize)').forEach(button=>button.remove());
    content.querySelector('.vega-remove-camera-list')?.remove();
    content.querySelector('.vega-remove-empty')?.remove();
    const cameraShell=content.querySelector('.vega-camera-shell');if(cameraShell)cameraShell.hidden=false;
    content.querySelectorAll('[data-action-type],[data-camera-source],.vega-camera-launch').forEach(control=>control.inert=false);
    content.removeAttribute('aria-busy');
    if(restoreFocus&&previous?.isConnected)previous.focus({preventScroll:true});
    if(!panel._surface?.hasModal()&&!panel._musicPage?.isOpen())panel._screensaver?.resume?.();
    if(!disposed)panel.refreshChangedConfiguration();
  }
  function selectResizeTile(card){
    if(!card?.isConnected||panel.tab!==0||panel._surface?.hasModal()||root.querySelector('.app').hidden)return;
    if(!panel._hass?.user?.is_admin)return;
    editMode='resize';dismissHomeContext();panel.setRoomMenu(false);
    panel.swipeStart=null;
    panel._screensaver?.suspend?.();
    resizeTarget=card;done.hidden=false;
    card.closest('.v41-grid')?.classList.add('is-resizing');
    for(const item of content.querySelectorAll('.v41-card')){
      item.classList.toggle('is-resize-target',item===card);
      item.querySelector('.vega-tile-resize').hidden=item!==card;
      item.querySelector('.vega-icon-toggle').inert=true;
    }
    card.querySelector('.vega-tile-resize').focus({preventScroll:true});
  }
  function startRemove(card=homeCards()[0]){
    if(removeBusy||!canEdit()||!card?.isConnected||!cardItem(card))return;
    panel.cancelTabTransition();
    finishDrag(false);clearTileMotions();dismissHomeContext();panel.setRoomMenu(false);panel.swipeStart=null;
    panel._screensaver?.suspend?.();editMode='remove';resizeTarget=card;done.hidden=false;
    let container=content.querySelector('.v41-grid,.action-grid');
    if(itemCategory()==='cameras'){
      panel.cameraCommand({dataset:{cameraCommand:'close'}});
      panel.stopCamera();
      const shell=content.querySelector('.vega-camera-shell');
      if(shell)shell.hidden=true;
      container=document.createElement('div');
      container.className='action-grid vega-remove-camera-list';
      container.innerHTML=(panel.rooms[panel.room]?.cameras||[]).map(camera=>`
        <div class="action-card vega-camera-remove-card" data-room-item-id="${esc(camera.entity_id)}">
          <div class="action-title"><span class="action-icon">${panel.deviceIcon(camera)}</span>
            <strong>${esc(panel.deviceName(camera))}</strong></div>
        </div>`).join('');
      content.append(container);
    }
    container?.classList.remove('is-resizing');container?.classList.add('is-removing');
    content.querySelectorAll('[data-room-item-remove]:not(.vega-tile-resize)').forEach(button=>button.remove());
    content.querySelectorAll('[data-action-type],[data-camera-source]').forEach(control=>control.inert=true);
    for(const item of homeCards()){
      const device=cardItem(item);if(!device)continue;
      item.setAttribute('data-room-item-id',device.entity_id);
      item.classList.remove('is-resize-target');
      let button=item.querySelector('.vega-tile-resize');
      if(!button){button=document.createElement('button');button.type='button';button.className='vega-room-item-remove';item.append(button);}
      button.setAttribute('data-room-item-remove',device.entity_id);button.hidden=false;button.disabled=removeBusy;
      button.setAttribute('aria-label',panel.t('vega.removeItem',{name:panel.deviceName(device)}));
      button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
      const toggle=item.querySelector('.vega-icon-toggle');if(toggle)toggle.inert=true;
    }
    (card.querySelector('[data-room-item-remove]')||container?.querySelector('[data-room-item-remove]'))?.focus({preventScroll:true});
  }
  async function removeItem(id){
    if(removeBusy||editMode!=='remove'||!canEdit())return;
    const roomName=panel.rooms[panel.room]?.name,category=itemCategory(),session=removalSession;
    const card=homeCards().find(card=>card.dataset.roomItemId===id);
    const draft=structuredClone(panel._sharedConfig),room=draft.rooms.find(room=>room.name===roomName);
    const index=room?.[category]?.findIndex(item=>item.entity_id===id)??-1;if(index<0)return;
    room[category].splice(index,1);removeBusy=true;content.setAttribute('aria-busy','true');
    content.querySelectorAll('[data-room-item-remove]').forEach(button=>button.disabled=true);
    try{
      const result=await panel.saveSharedConfiguration(draft,panel._configRevision);
      if(disposed)return;
      const editing=editMode==='remove'&&session===removalSession&&panel.rooms[panel.room]?.name===roomName&&itemCategory()===category;
      // While editing, commit the acknowledged data and remove only its card.
      panel.applyConfiguration(result.devices,result.revision,{render:!editing});
      if(editing){
        panel.clearFanMotion(card);
        card?.remove();
        const cards=homeCards();
        if(category!=='cameras'){
          const indices=new Map(panel.rooms[panel.room][category].map((item,index)=>[item.entity_id,index]));
          for(const remaining of cards){
            const index=String(indices.get(remaining.dataset.roomItemId));
            if(category==='devices'){
              remaining.setAttribute('data-device',index);
              remaining.querySelector('[data-device-toggle]')?.setAttribute('data-device-toggle',index);
              remaining.querySelector('[data-device-resize]')?.setAttribute('data-device-resize',index);
            }else{
              remaining.setAttribute('data-action-card',index);
              remaining.querySelector('[data-action-index]')?.setAttribute('data-action-index',index);
            }
          }
        }
        resizeTarget=cards[0]||content;
        if(!cards.length){
          const hint=document.createElement('div');
          hint.className='empty-tab vega-remove-empty';
          hint.textContent=panel.t({devices:'vega.emptyDevices',cameras:'camera.empty',scenes:'scenes.empty',automations:'automation.empty'}[category]);
          content.replaceChildren(hint);
        }
      }
    }catch(error){
      if(!disposed){panel.showError(panel.t(error?.code==='conflict'?'vega.conflict':error?.code==='timeout'?'vega.saveTimeout':'vega.error'));
        if(error?.code==='timeout')panel._configInvalidated=true;
        if(error?.code==='conflict'){panel._configInvalidated=true;endTileResize();panel.updateHomeStates();}}
    }finally{removeBusy=false;if(!disposed){content.removeAttribute('aria-busy');content.querySelectorAll('[data-room-item-remove]').forEach(button=>button.disabled=false);if(removeFinishRequested)finishRemoval();}}
  }
  function finishRemoval(){
    if(removeBusy){removeFinishRequested=true;done.disabled=true;return;}
    endTileResize();
    panel.updateHomeStates();
    root.querySelector(`[data-tab="${panel.tab}"]`)?.focus({preventScroll:true});
  }
  function changeTileSize(card){
    const before=captureTiles();
    const device=panel.getDevice(Number(card.dataset.device));
    if(!device)return;
    if(sizeStorageWritable)tileSizes=readTileSizes()||tileSizes;
    tileSizes[device.entity_id]=!isHalfSize(device);
    if(sizeStorageWritable){
      try{localStorage.setItem(sizeKey,JSON.stringify({version:2,compact:tileSizes}));}
      catch(_){sizeStorageWritable=false;}
    }
    card.classList.toggle('is-compact',isHalfSize(device));
    const button=card.querySelector('.vega-tile-resize');
    button.setAttribute('aria-label',resizeLabel(device));
    button.innerHTML=resizeIcon(isHalfSize(device));
    animateTiles(before);
  }
  function finishDrag(commit){
    const current=drag;
    if(!current)return;
    drag=null;cancelAnimationFrame(current.raf);
    if(current.started){
      const before=captureTiles();
      blockDragClick=true;
      if(commit){
        tileOrder=readTileOrder()||tileOrder;
        const visible=[...new Set(Array.from(current.grid.children)
          .map(card=>panel.getDevice(Number(card.dataset.device))?.entity_id).filter(Boolean))];
        const actual=panel.rooms.find(room=>room.name===current.room)?.devices||[];
        const previous=tileOrder[current.room]||actual.map(device=>device.entity_id);
        tileOrder[current.room]=[...visible,...previous.filter(id=>!visible.includes(id)),
          ...actual.map(d=>d.entity_id).filter(id=>!visible.includes(id)&&!previous.includes(id))];
        try{localStorage.setItem(orderKey,JSON.stringify({version:1,rooms:tileOrder}));}catch(_){}
      }else current.grid.append(...current.before);
      current.card.classList.remove('is-dragging');
      current.card.style.removeProperty('--vega-drag-x');
      current.card.style.removeProperty('--vega-drag-y');
      if(content.hasPointerCapture?.(current.id))content.releasePointerCapture(current.id);
      animateTiles(before);
    }
  }
  function dragFrame(){
    const current=drag;
    if(!current?.started)return;
    current.raf=0;
    const viewport=current.viewport.getBoundingClientRect();
    const maximum=Math.max(0,current.grid.getBoundingClientRect().height-current.viewport.clientHeight);
    const before=current.viewport.scrollTop;
    const edge=42;
    const speed=current.y<viewport.top+edge?-Math.min(1,(viewport.top+edge-current.y)/edge):
      current.y>viewport.bottom-edge?Math.min(1,(current.y-viewport.bottom+edge)/edge):0;
    const now=Date.now(),elapsed=Math.min(32,Math.max(8,now-current.time));
    current.time=now;
    current.viewport.scrollTop=Math.max(0,Math.min(maximum,before+speed*600*elapsed/1000));
    const pointX=current.x,pointY=current.y+current.viewport.scrollTop;
    const intentX=pointX-current.intentX,intentY=pointY-current.intentY;
    const axis=Math.abs(intentX)>Math.abs(intentY)?'x':'y';
    const intentDistance=current.axis&&current.axis!==axis?32:18;
    if(Math.max(Math.abs(intentX),Math.abs(intentY))>=intentDistance){
      // Measure intent in content coordinates so edge scrolling counts as travel.
      current.axis=axis;
      current.direction=Math.sign(current.axis==='x'?intentX:intentY);
      current.intentX=pointX;current.intentY=pointY;
    }
    const travel=current.axis==='x'?pointX-current.swapX:pointY-current.swapY;
    if(current.direction*travel>=18){
      const cards=Array.from(current.grid.children);
      const from=cards.indexOf(current.card);
      const target=cards.find(card=>{
        if(card===current.card)return false;
        const rect=layoutRect(card);
        if(current.x<rect.left||current.x>rect.right||current.y<rect.top||current.y>rect.bottom)return false;
        const extent=current.axis==='x'?rect.width:rect.height;
        const inset=Math.max(16,Math.min(40,extent*.25));
        const position=current.axis==='x'?current.x:current.y;
        const threshold=current.axis==='x'?rect.left:rect.top;
        return current.direction>0?position>=threshold+inset:position<=threshold+extent-inset;
      });
      if(target){
        const to=cards.indexOf(target);
        // Layout reflow alone cannot send a tile back against the drag direction.
        const orderDirection=current.axis==='x'&&panel.getAttribute('dir')==='rtl'?-current.direction:current.direction;
        if((to-from)*orderDirection>0){
          const before=captureTiles();
          current.grid.insertBefore(current.card,to>from?target.nextSibling:target);
          animateTiles(before);
          current.swapX=pointX;current.swapY=pointY;
        }
      }
    }
    const rect=layoutRect(current.card);
    const baseX=rect.left,baseY=rect.top;
    current.dx=current.x-current.grabX-baseX;
    current.dy=current.y-current.grabY-baseY;
    current.card.style.setProperty('--vega-drag-x',`${current.dx}px`);
    current.card.style.setProperty('--vega-drag-y',`${current.dy}px`);
    if(current.viewport.scrollTop!==before)current.raf=requestAnimationFrame(dragFrame);
  }
  function moveDrag(event){
    if(event.pointerId!==drag?.id)return;
    const current=drag;
    current.x=event.clientX;current.y=event.clientY;
    if(!current.started&&Math.hypot(current.x-current.startX,current.y-current.startY)>8){
      selectResizeTile(current.card);
      current.started=true;
      const visual=current.card.getBoundingClientRect();
      stopTileMotion(current.card);
      current.card.classList.add('is-dragging');
      current.grabX=current.startX-visual.left;current.grabY=current.startY-visual.top;
      content.setPointerCapture?.(current.id);
    }
    if(!current.started)return;
    if(event.cancelable)event.preventDefault();
    if(!current.raf)current.raf=requestAnimationFrame(dragFrame);
  }
  function pointerDown(event){
    cancelRoomPress();cancelPress();
    if(event.isPrimary===false){finishDrag(false);return;}
    const roomButton=event.target.closest?.(roomTarget);
    if(roomButton&&event.button===0&&!event.target.closest?.('button:not([data-room]):not([data-room-menu-option]):not(#room-menu-toggle)')&&
       !panel._surface?.hasModal()&&panel._hass?.user?.is_admin){
      const current={id:event.pointerId,x:event.clientX,y:event.clientY,index:roomIndex(roomButton),active:false};
      current.timer=setTimeout(()=>{
        if(roomPress!==current)return;
        current.active=true;suppressRoomClick={until:Date.now()+900};openHomeContext('room',current.index,current.x,current.y);
      },570);roomPress=current;return;
    }
    finishDrag(false);blockDragClick=false;
    if(event.button>0||!canEdit())return;
    const card=event.target.closest?.('.v41-card[data-device],.action-card[data-action-card],.vega-camera-launch');
    if(!card||!content.contains(card)||editMode==='remove')return;
    if(resizeTarget){
      if(event.target.closest?.('[data-device-resize]'))return;
      const grid=card.closest('.v41-grid');
      const owner=cardEntry(card)?.roomIndex;
      if(owner===undefined||panel.tab!==0||!grid)return;
      const viewport=panel.room===-1?content.querySelector('.v41-device-wrap'):grid.parentElement;
      drag={card,grid,viewport,room:panel.rooms[owner].name,
        before:Array.from(grid.children),id:event.pointerId,started:false,raf:0,
        startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,
        dx:0,dy:0,swapX:event.clientX,swapY:event.clientY+grid.parentElement.scrollTop,
        intentX:event.clientX,intentY:event.clientY+grid.parentElement.scrollTop,
        axis:null,direction:0,time:Date.now()};
      return;
    }
    const current={card,id:event.pointerId,x:event.clientX,y:event.clientY,active:false};
    current.timer=setTimeout(()=>{
      if(press!==current)return;
      current.active=true;
      suppressedClick={card,until:Date.now()+900};panel.swipeStart=null;openHomeContext(itemCategory()==='devices'?'device':itemCategory(),cardIndex(card),current.x,current.y);
    },550);
    press=current;
  }
  function pointerMove(event){
    if(roomPress&&event.pointerId===roomPress.id&&Math.hypot(event.clientX-roomPress.x,event.clientY-roomPress.y)>10)cancelRoomPress();
    if(drag){moveDrag(event);return;}
    if(press&&event.pointerId===press.id&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>10)cancelPress();
  }
  function pointerEnd(event){
    if(event.pointerId===roomPress?.id)cancelRoomPress();
    if(event.pointerId===drag?.id){
      if(event.type==='pointerup'){
        if(drag.started){moveDrag(event);cancelAnimationFrame(drag.raf);dragFrame();}
        const viewport=drag.viewport.getBoundingClientRect();
        finishDrag(event.clientX>=viewport.left&&event.clientX<=viewport.right&&
          event.clientY>=viewport.top&&event.clientY<=viewport.bottom);
      }else finishDrag(false);
    }
    if(event.pointerId===press?.id)cancelPress();
  }
  function lostCapture(event){
    if(event.target===content&&event.pointerId===drag?.id)finishDrag(false);
  }
  function contextMenu(event){
    const room=event.target.closest?.(roomTarget);
    const card=event.target.closest?.('.v41-card[data-device],.action-card[data-action-card],.vega-camera-launch');
    if(!room&&!card)return;
    if(!canEdit())return;
    event.preventDefault();cancelPress();cancelRoomPress();
    if(card){suppressedClick={card,until:Date.now()+750};openHomeContext(itemCategory()==='devices'?'device':itemCategory(),cardIndex(card),event.clientX,event.clientY);}
    else {suppressRoomClick={until:Date.now()+750};openHomeContext('room',roomIndex(room),event.clientX,event.clientY);}
  }
  function resizeKey(event){
    if(!homeContextMenu.hidden&&['ArrowDown','ArrowUp','Home','End','Tab'].includes(event.key)){
      const buttons=[...homeContextMenu.querySelectorAll('[role="menuitem"]')],index=buttons.indexOf(root.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:
        (index+(event.key==='ArrowUp'||event.key==='Tab'&&event.shiftKey?-1:1)+buttons.length)%buttons.length;
      event.preventDefault();event.stopImmediatePropagation();buttons[next]?.focus({preventScroll:true});return;
    }
    const roomKey=event.target.closest?.(roomTarget);
    if(roomKey&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){
      event.preventDefault();event.stopImmediatePropagation();const box=roomKey.getBoundingClientRect();
      openHomeContext('room',roomIndex(roomKey),box.left,box.bottom);return;
    }
    const card=event.target.closest?.('.v41-card[data-device],.action-card[data-action-card],.vega-camera-launch');
    if(card&&(event.key==='ContextMenu'||(event.shiftKey&&event.key==='F10'))){
      event.preventDefault();event.stopImmediatePropagation();openHomeContext(itemCategory()==='devices'?'device':itemCategory(),cardIndex(card),card.getBoundingClientRect().left,card.getBoundingClientRect().bottom);
    }else if(resizeTarget&&event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation();
      if(editMode==='remove')finishRemoval();
      else{endTileResize({restoreFocus:true});panel.updateHomeStates();}
    }else if(resizeTarget&&card&&event.target===card&&(event.key==='Enter'||event.key===' ')){
      event.preventDefault();event.stopImmediatePropagation();if(editMode!=='remove')selectResizeTile(card);
    }
  }
  const clearPress=()=>{cancelPress();cancelRoomPress();finishDrag(false);dismissHomeContext();};
  root.addEventListener('pointerdown',pointerDown,{capture:true});
  root.addEventListener('pointermove',pointerMove,{capture:true,passive:false});
  root.addEventListener('pointerup',pointerEnd,{capture:true});
  root.addEventListener('pointercancel',pointerEnd,{capture:true});
  root.addEventListener('lostpointercapture',lostCapture,{capture:true});
  root.addEventListener('contextmenu',contextMenu,{capture:true});
  root.addEventListener('keydown',resizeKey,{capture:true});
  window.addEventListener('blur',clearPress);

  const shell=document.createElement('div');
  shell.className='vega-home-appearance';shell.hidden=true;
  shell.innerHTML=`<section class="vega-home-settings-window" role="dialog" aria-modal="true" aria-labelledby="vega-appearance-heading">
    <header class="vega-modal-header"><div><small>VEGA HOME • ${esc(panel.releaseVersion)}</small><strong id="vega-appearance-heading" data-vega-title></strong></div><button type="button" data-vega-settings-close>×</button></header>
    <nav class="vega-settings-tabs" role="tablist"><button type="button" role="tab" id="vega-tab-display" aria-controls="vega-pane-display" data-appearance-tab="display"></button><button type="button" role="tab" id="vega-tab-images" aria-controls="vega-pane-images" data-appearance-tab="images"></button><button type="button" role="tab" id="vega-tab-startup" aria-controls="vega-pane-startup" data-appearance-tab="startup"></button></nav>
    <div class="vega-appearance-scroll"><section id="vega-pane-display" role="tabpanel" aria-labelledby="vega-tab-display" data-appearance-panel="display">
      <div class="vega-settings-card"><h3 data-vega-text="vega.display"></h3><div class="vega-field-grid"><label><span data-vega-heading="theme"></span><select data-vega-theme><option value="auto"></option><option value="light"></option><option value="dark"></option></select></label><label><span data-vega-heading="language"></span><select data-vega-language><option value="auto"></option>${panel.languageOptions().map(({code,nativeName})=>`<option value="${code}" lang="${code}">${esc(nativeName)}</option>`).join('')}</select></label></div><label class="vega-idle-field" data-vega-lock-setting><span data-vega-heading="lock"></span><select data-vega-idle><option value="20">20 s</option><option value="40">40 s</option><option value="60">60 s</option><option value="0">${esc(panel.t('appearance.lockDisabled'))}</option></select></label></div>
      <div class="vega-settings-card" data-vega-screen-setting><h3 data-vega-text="vega.screen"></h3><label><span data-vega-text="vega.screenOffAfter"></span><select data-vega-screen-off>${[0,5,10,30,60,120,180].map(value=>`<option value="${value}"></option>`).join('')}</select></label><label class="vega-screen-music"><input type="checkbox" data-vega-keep-music><span data-vega-text="vega.keepScreenMusic"></span></label><p class="vega-field-hint" data-vega-text="vega.screenTimerHint"></p></div>
      <div class="vega-settings-card"><label class="vega-home-toggle"><span data-vega-home-heading>${esc(panel.t('v2.showHome'))}</span><input type="checkbox" data-vega-show-home ${settings.showHomeTab?'checked':''}></label></div>
    </section><section id="vega-pane-images" role="tabpanel" aria-labelledby="vega-tab-images" data-appearance-panel="images" hidden><div data-vega-wallpaper-container></div></section>
    <section id="vega-pane-startup" role="tabpanel" aria-labelledby="vega-tab-startup" data-appearance-panel="startup" hidden><div class="vega-settings-card"><h3 data-vega-startup-heading></h3><button type="button" class="vega-default-check" role="checkbox" aria-checked="false" data-vega-default><span class="vega-check-mark" aria-hidden="true"></span><span data-vega-default-label></span></button><p class="vega-startup-hint vega-field-hint"></p><p class="vega-startup-status" role="status" aria-live="polite"></p></div><div class="vega-settings-card"><button type="button" class="vega-exit-ha" data-vega-exit></button></div><div data-vega-system-media></div><button type="button" class="vega-settings-card vega-setup-shortcut" data-vega-open-colors><span data-vega-text="vega.kindColors"></span><span aria-hidden="true">›</span></button></section></div>
    <footer class="vega-modal-footer"><small data-vega-text="vega.browserSettings"></small><button type="button" data-vega-settings-close data-vega-text="tile.done"></button></footer>
  </section>`;
  root.append(shell);
  const wallpaper=installVegaWallpaper(panel,settings,save,shell.querySelector('[data-vega-wallpaper-container]'));
  const navigation=installVegaNavigation(panel,syncStartup);
  const systemMedia=installVegaSystemMedia(panel,shell.querySelector('[data-vega-system-media]'));
  let systemOpened=false;
  let section='display',disposed=false,settingsCloseTimer=null,settingsOpenRAF=0,resizeRAF=0,focusBefore=null;
  const INACTIVITY_MS=60_000;
  let inactivityTimer=null;
  function resetInactivity(){
    if(shell.hidden||disposed)return;
    clearTimeout(inactivityTimer);
    inactivityTimer=setTimeout(()=>{if(!shell.hidden)close();},INACTIVITY_MS);
  }
  function setSection(value){
    if(!['display','images','startup'].includes(value))return;
    section=value;
    if(value==='startup'&&!systemOpened){systemMedia.open();systemOpened=true;}
    for(const tab of shell.querySelectorAll('[data-appearance-tab]')){const active=tab.dataset.appearanceTab===value;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
    for(const pane of shell.querySelectorAll('[data-appearance-panel]'))pane.hidden=pane.dataset.appearancePanel!==value;
  }
  function syncStartup(){
    const state=navigation.state();
    shell.querySelector('[data-vega-startup-heading]').textContent=panel.t('appearance.system');
    const checkbox=shell.querySelector('[data-vega-default]');
    checkbox.setAttribute('aria-checked',String(state.checked));checkbox.disabled=state.busy||!state.deviceReady;
    shell.querySelector('[data-vega-default-label]').textContent=panel.t('startup.default');
    shell.querySelector('.vega-startup-hint').textContent=panel.t('appearance.browserHint');
    shell.querySelector('.vega-startup-status').textContent=state.busy?panel.t('startup.saving'):state.notice?panel.t(state.notice):state.nativeAccountDefault?
      panel.t('appearance.accountDefaultHint'):'';
    const exit=shell.querySelector('[data-vega-exit]');exit.textContent=panel.t('startup.exit');exit.disabled=state.busy;
  }
  const applyWallpaper=()=>wallpaper.apply();
  function sync(){
    syncStartup();wallpaper.sync();
    const w=words();shell.querySelector('[data-vega-title]').textContent=w.title;
    for(const b of shell.querySelectorAll('[data-vega-settings-close]'))b.setAttribute('aria-label',w.close);
    for(const key of ['theme','lock','language'])shell.querySelector(`[data-vega-heading="${key}"]`).textContent=w[key];
    for(const el of shell.querySelectorAll('[data-vega-text]'))el.textContent=panel.t(el.dataset.vegaText);
    shell.querySelector('[data-vega-home-heading]').textContent=panel.t('v2.showHome');
    for(const tab of shell.querySelectorAll('[data-appearance-tab]'))tab.textContent=tab.dataset.appearanceTab==='startup'?(panel.t('appearance.system')):panel.t('vega.'+tab.dataset.appearanceTab);
    for(const option of shell.querySelectorAll('[data-vega-theme] option'))option.textContent=panel.t('theme.'+option.value);
    shell.querySelector('[data-vega-theme]').value=panel.themePreference;
    const language=shell.querySelector('[data-vega-language]');
    language.options[0].textContent=panel.t('language.auto');
    language.value=panel.languagePreference();
    const idleSelect=shell.querySelector('[data-vega-idle]');
    idleSelect.querySelector('option[value="0"]').textContent=panel.t('appearance.lockDisabled');
    idleSelect.value=String(settings.idle);
    const screenOff=shell.querySelector('[data-vega-screen-off]');screenOff.value=String(settings.screenOffMinutes);
    for(const option of screenOff.options)option.textContent=+option.value?panel.t('vega.minutes',{count:option.value}):panel.t('vega.neverOff');
    shell.querySelector('[data-vega-keep-music]').checked=settings.keepScreenOnWithMusic;
    shell.querySelector('[data-vega-screen-setting]').hidden=!panel.isLockAllowed();
    shell.querySelector('[data-vega-lock-setting]').hidden=!panel.isLockSupported();shell.querySelector('[data-vega-show-home]').checked=settings.showHomeTab!==false;setSection(section);
  }
  function open(){
    if(disposed)return;focusBefore=root.activeElement;panel._surface?.open('settings',18);clearTimeout(settingsCloseTimer);shell.hidden=false;shell.inert=false;
    root.getElementById('theme-toggle')?.setAttribute('aria-expanded','true');
    section='display';systemOpened=false;systemMedia.close();wallpaper.sync({reset:true});sync();resetInactivity();void navigation.refresh();shell.classList.remove('is-visible');void shell.offsetWidth;
    cancelAnimationFrame(settingsOpenRAF);settingsOpenRAF=requestAnimationFrame(()=>{if(!disposed&&!shell.hidden){shell.classList.add('is-visible');shell.querySelector('[data-appearance-tab="display"]').focus();}});
  }
  function close(){
    clearTimeout(inactivityTimer);
    if(shell.hidden)return;cancelAnimationFrame(settingsOpenRAF);shell.inert=true;shell.classList.remove('is-visible');clearTimeout(settingsCloseTimer);panel._surface?.close('settings');
    root.getElementById('theme-toggle')?.setAttribute('aria-expanded','false');
    systemMedia.close();systemOpened=false;settingsCloseTimer=setTimeout(()=>{if(!shell.classList.contains('is-visible'))shell.hidden=true;},matchMedia('(prefers-reduced-motion: reduce)').matches?0:235);
    panel._surface?.restoreFocus(focusBefore);
  }
  function clicked(event){
    const homeAction=event.target.closest?.('[data-home-context-action]');
    if(homeAction&&homeContextMenu.contains(homeAction)){
      event.preventDefault();event.stopImmediatePropagation();contextual(homeAction.dataset.homeContextAction);return;
    }
    // A long press naturally sends a trailing click on pointerup. Do not let
    // that synthetic click close the just-opened contextual menu on touch.
    if(!homeContextMenu.hidden&&!homeContextMenu.contains(event.target)){
      const trailingRoom=event.target.closest?.(roomTarget);
      const trailingCard=event.target.closest?.('.v41-card[data-device],.action-card[data-action-card],.vega-camera-launch');
      if((trailingRoom&&suppressRoomClick&&Date.now()<suppressRoomClick.until)||
         (trailingCard&&suppressedClick?.card===trailingCard&&Date.now()<suppressedClick.until)){
        event.preventDefault();event.stopImmediatePropagation();return;
      }
      dismissHomeContext();
    }
    if(suppressRoomClick&&Date.now()<suppressRoomClick.until&&event.target.closest?.(roomTarget)){
      event.preventDefault();event.stopImmediatePropagation();suppressRoomClick=null;return;
    }
    if(event.target.closest?.('[data-home-add-device]')){
      event.preventDefault();event.stopImmediatePropagation();endTileResize();
      panel.openConfiguration({mode:'add-device',roomIndex:panel.room,category:'devices',focus:'search'});return;
    }
    if(blockDragClick&&content.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();blockDragClick=false;return;}
    const card=event.target.closest?.('.v41-card[data-device],.action-card[data-action-card],.vega-camera-launch'),b=event.target.closest?.('button');
    if(card&&!b?.hasAttribute('data-device-resize')&&suppressedClick?.card===card&&Date.now()<suppressedClick.until){event.preventDefault();event.stopImmediatePropagation();suppressedClick=null;return;}
    if(b===done){event.preventDefault();event.stopImmediatePropagation();if(editMode==='remove')finishRemoval();else{endTileResize({restoreFocus:true});panel.updateHomeStates();}return;}
    if(editMode==='remove'&&content.contains(event.target)){
      event.preventDefault();event.stopImmediatePropagation();
      const button=event.target.closest?.('[data-room-item-remove]');if(button)void removeItem(button.dataset.roomItemRemove);
      return;
    }
    if(resizeTarget){if(card){event.preventDefault();event.stopImmediatePropagation();if(b?.hasAttribute('data-device-resize'))changeTileSize(card);else selectResizeTile(card);return;}endTileResize();}
    if(!b)return;
    if(b.id==='theme-toggle'){event.preventDefault();event.stopImmediatePropagation();open();return;}
    if(shell.hidden||!shell.contains(b)||b.closest('.vega-home-wallpaper')||b.closest('[data-vega-system-media]'))return;
    event.stopImmediatePropagation();
    if(b.dataset.appearanceTab){setSection(b.dataset.appearanceTab);return;}
    if(b.hasAttribute('data-vega-open-colors')){close();panel.openConfiguration({mode:'colors'});return;}
    if(b.hasAttribute('data-vega-settings-close')){close();return;}
    if(b.hasAttribute('data-vega-default')){void navigation.toggle();return;}
    if(b.hasAttribute('data-vega-exit'))void navigation.exit();
  }
  function changed(event){
    if(shell.hidden||!shell.contains(event.target))return;const el=event.target;
    if(el.hasAttribute('data-vega-theme')){panel.selectTheme(el.value);sync();}
    if(el.hasAttribute('data-vega-language'))void panel.selectLanguage(el.value);
    if(el.hasAttribute('data-vega-idle')&&panel.isLockSupported()){
      const seconds=Number(el.value);
      if([0,20,40,60].includes(seconds)){
        settings.idle=seconds;save();
        panel._screensaver?.setIdleMs?.(seconds*1000);
        panel._syncLockLayout?.();
        shell.querySelector('[data-vega-screen-setting]').hidden=!panel.isLockAllowed();
      }
    }
    if(el.hasAttribute('data-vega-screen-off')){const value=Number(el.value);if([0,5,10,30,60,120,180].includes(value)){settings.screenOffMinutes=value;save();panel._screensaver?.updateScreenPower();}}
    if(el.hasAttribute('data-vega-keep-music')){settings.keepScreenOnWithMusic=el.checked;save();panel._screensaver?.updateScreenPower();}
    if(el.hasAttribute('data-vega-show-home')){settings.showHomeTab=el.checked;save();panel._deviceFilter='all';if(!el.checked&&panel.room===-1)panel.room=Math.max(0,Math.min(panel._lastRegularRoom,panel.rooms.length-1));panel.render();}

  }
  function settingsKeydown(event){
    if(!homeContextMenu.hidden&&event.key==='Escape'){
      const context=homeContext,anchor=context?.type==='room'?root.querySelector(`#rooms [data-room="${context.index}"]`):homeCards().find(card=>cardIndex(card)===context?.index);
      event.preventDefault();event.stopImmediatePropagation();dismissHomeContext();anchor?.focus({preventScroll:true});return;
    }
    if(shell.hidden||!shell.classList.contains('is-visible'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(systemMedia.closePicker())return;close();return;}
    if(event.key==='Tab'){
      const activeDialog=systemMedia.pickerOpen()?shell.querySelector('.vega-system-picker-dialog'):shell;
      const fields=[...activeDialog.querySelectorAll('button,input,select')].filter(el=>!el.hidden&&!el.disabled&&!el.closest('[hidden]')&&(!el.hasAttribute('data-appearance-tab')||el.getAttribute('aria-selected')==='true'));
      const first=fields[0],last=fields.at(-1);
      if(event.shiftKey&&root.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&root.activeElement===last){event.preventDefault();first?.focus();}
    }
    if(event.target.hasAttribute?.('data-appearance-tab')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tabs=[...shell.querySelectorAll('[data-appearance-tab]')],index=tabs.indexOf(event.target),next=tabs[(index+(event.key==='ArrowRight'?1:2))%3];setSection(next.dataset.appearanceTab);next.focus();}
  }
  const overlayClick=e=>{if(e.target===shell)close();};
  root.addEventListener('click',clicked,{capture:true});root.addEventListener('click',overlayClick,{capture:true});shell.addEventListener('change',changed);
  for(const type of ['pointerdown','keydown','input','change','wheel','touchstart'])shell.addEventListener(type,resetInactivity,{passive:true});
  root.addEventListener('keydown',settingsKeydown,{capture:true});
  const onResize=()=>{finishDrag(false);clearTileMotions();if(disposed||resizeRAF)return;resizeRAF=requestAnimationFrame(()=>{resizeRAF=0;if(!disposed)layoutGrid();});};
  const contentObserver=typeof ResizeObserver==='function'?new ResizeObserver(onResize):null;contentObserver?.observe(content);window.addEventListener('resize',onResize);applyWallpaper();sync();onResize();
  return {render,open,close,applyWallpaper,showHomeTab:()=>settings.showHomeTab!==false,endTileResize,isResizing:()=>Boolean(resizeTarget),isRemoving:()=>editMode==='remove',onHass(){navigation.onHass();systemMedia.onHass();wallpaper.onHass();if(!panel._hass?.user?.is_admin){endTileResize();dismissHomeContext();}},onLanguageChange(){systemMedia.onLanguageChange();done.textContent=panel.t('tile.done');sync();},lockSeconds:()=>settings.idle,screenPowerSettings:()=>({minutes:settings.screenOffMinutes,keepWhileMusic:settings.keepScreenOnWithMusic}),imageSource:()=>wallpaper.source(),imageSourceMode:()=>wallpaper.sourceMode(),imageInterval:()=>wallpaper.interval(),setIdle:ms=>{const seconds=Number(ms)/1000;
      settings.idle=[0,20,40,60].includes(seconds)?seconds:60;
      save();panel._screensaver?.setIdleMs?.(settings.idle*1000);
      panel._syncLockLayout?.();},
    destroy(){clearTimeout(inactivityTimer);disposed=true;wallpaper.destroy();systemMedia.destroy();navigation.destroy();endTileResize();homeContextMenu.remove();done.remove();panel._surface?.close('settings');clearTimeout(settingsCloseTimer);cancelAnimationFrame(settingsOpenRAF);cancelAnimationFrame(resizeRAF);cancelRoomPress();contentObserver?.disconnect();
      root.removeEventListener('pointerdown',pointerDown,{capture:true});root.removeEventListener('pointermove',pointerMove,{capture:true});root.removeEventListener('pointerup',pointerEnd,{capture:true});root.removeEventListener('pointercancel',pointerEnd,{capture:true});root.removeEventListener('lostpointercapture',lostCapture,{capture:true});root.removeEventListener('contextmenu',contextMenu,{capture:true});root.removeEventListener('keydown',resizeKey,{capture:true});window.removeEventListener('blur',clearPress);root.removeEventListener('click',clicked,{capture:true});root.removeEventListener('click',overlayClick,{capture:true});root.removeEventListener('keydown',settingsKeydown,{capture:true});shell.removeEventListener('change',changed);window.removeEventListener('resize',onResize);shell.remove();}
  };
}
