import {DEVICE_ICONS,DEVICE_TYPES,ICON_GROUPS,KIND_CHOICES,normalizeIcon,mdiIconMarkup,COLOR_PALETTE,PALETTE_KINDS,kindPalette,MDI_READY} from './vega-icons.js?v=v201c1';
import {ROOM_ENTITY_DOMAINS,roomAreaEntities} from './vega-device-model.js?v=v201c1';
import {vegaRequest} from './vega-request.js?v=v201c1';
/* Draft-only editor: browse HA entities, then customize the selected tiles. */
export function installVegaConfiguration(panel) {
  const root=panel.shadowRoot,esc=value=>panel.escape(value),t=(key,vars)=>panel.t(key,vars);
  const domains=ROOM_ENTITY_DOMAINS;
  const categories={devices:'tab.devices',scenes:'tab.scenes',cameras:'tab.camera',automations:'tab.automation'};
  const typeKey=kind=>DEVICE_TYPES.find(([key])=>key===kind)?.[1]||kind;
  const typeOptions=(current='all',choices=['all',...DEVICE_TYPES.map(([key])=>key)])=>choices.map(kind=>`<option value="${kind}"${current===kind?' selected':''}>${esc(t('vega.type.'+(kind==='all'?'all':typeKey(kind))))}</option>`).join('');
  const iconChoice=(key,room=false)=>mdiIconMarkup(normalizeIcon(key,room)||'mdi:home-outline');
  const entityTrigger=(key,allowed,current,kind,index='',extra='')=>`<div class="vega-entity-field">
    <span class="vega-field-caption">${esc(t(key))}</span>
    <button type="button" class="vega-entity-trigger" data-config-entity-open data-entity-kind="${kind}" data-entity-allowed="${esc(allowed.join(','))}" data-entity-index="${index}" data-entity-extra="${esc(extra)}" data-entity-title="${esc(t(key))}" data-entity-current="${esc(current||'')}" aria-haspopup="dialog">
      <span class="vega-entity-trigger-copy"><strong>${esc(current?label(current):t('vega.none'))}</strong><code>${esc(current||'')}</code></span><span class="vega-trigger-chevron" aria-hidden="true">⌄</span>
    </button></div>`;
  const shell=document.createElement('div');shell.className='vega-home-config';shell.hidden=true;root.append(shell);
  let draft=null,revision='',owner='',entryID='',selected=0,category='devices',deviceFilter='all',mode='rooms',returnMode='rooms',editIndex=-1,addedIDs=[],areas=[],registry=new Map(),devices=new Map(),registryReady=false,epoch=0,busy=false,disposed=false,focusBefore=null,activeResult=-1,resultIDs=[],chooser=null,deviceNameOpen=false,controller=null;
  let initialRooms=[],roomNameOpen=false,registryLoading=false;
  const INACTIVITY_MS=60_000;
  let inactivityTimer=null;
  function resetInactivity(){
    if(shell.hidden||disposed||busy)return;
    clearTimeout(inactivityTimer);
    inactivityTimer=setTimeout(()=>{if(!shell.hidden&&!busy)close();},INACTIVITY_MS);
  }
  const states=()=>panel._hass?.states||{};
  const label=id=>states()[id]?.attributes?.friendly_name||id;
  const physicalName=id=>{const d=devices.get(registry.get(id)?.device_id);return d?.name_by_user||d?.name||'';};
  const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLocaleLowerCase();
  const list=allowed=>Object.keys(states()).filter(id=>allowed.includes(id.split('.')[0])).sort((a,b)=>label(a).localeCompare(label(b))||a.localeCompare(b));
  const iconPreview=d=>`<span class="vega-icon-preview">${panel.deviceIcon(d)}</span>`;
  const makeItem=id=>{
    const item={name:label(id),entity_id:id,tap:'popup',hold:'popup'};
    const icon=normalizeIcon(states()[id]?.attributes?.icon||registry.get(id)?.icon||registry.get(id)?.original_icon);
    if(icon)item.icon_override=icon;
    item.kind=panel.deviceKind(item);return item;
  };
  function paletteEditor(){
    const colors=draft.settings.kind_colors||{};
    return `<div class="vega-workspace-heading"><h2>${esc(t('vega.kindColors'))}</h2><p>${esc(t('vega.kindColorsHint'))}</p></div>
      <div class="vega-palette-grid">${PALETTE_KINDS.map(kind=>{
        const color=kindPalette(kind,colors),name=t('vega.type.'+typeKey(kind));
        return `<button type="button" class="vega-palette-row" data-config-palette-open="${kind}" aria-label="${esc(name)}">
          <span class="vega-palette-dot" style="background:${kind==='homepod'?'transparent':color.background};color:${kind==='homepod'?color.background:color.foreground}">${mdiIconMarkup('mdi:'+({light:'lightbulb',switch:'power-socket-jp',homepod:'speaker',media:'television',fan:'fan',climate:'air-conditioner',blinds:'blinds-horizontal-closed',computer:'desktop-classic',sensor:'motion-sensor',lock:'lock',camera:'cctv',scene:'palette',automation:'robot',other:'devices'}[kind]))}</span>
          <strong>${esc(name)}</strong><small>${esc(t('vega.changeColor'))}</small></button>`;
      }).join('')}</div><button class="vega-outline-button" type="button" data-config-back-room>${esc(t('vega.backToRoom'))}</button>`;
  }
  function roomEditor(room){
    const count=draft.rooms.length;
    const shownName=room?.name||t('vega.roomName');
    return `<section class="vega-room-profile" aria-label="${esc(t('vega.editRoom'))}">
      ${room?`<div class="vega-room-identity">
        <button type="button" class="vega-room-icon" data-config-icon-open data-icon-room="1" aria-haspopup="dialog" aria-label="${esc(t('vega.roomIcon'))}">
          <span class="vega-room-symbol">${panel.roomIcon(room.icon)}</span>
          <span><small>${esc(t('vega.roomIcon'))}</small><strong dir="ltr" title="${esc(room.icon)}">${esc(room.icon.replace(/^mdi:/,''))}</strong></span>
        </button>
        <div class="vega-room-name">
          <button type="button" data-config-room-edit-name aria-controls="vega-room-name-editor" ${roomNameOpen?'hidden':''}>
            <span><small>${esc(t('vega.roomName'))}</small><strong data-config-room-name-label title="${esc(shownName)}">${esc(shownName)}</strong></span>
            <span aria-hidden="true">✎</span>
          </button>
          <div id="vega-room-name-editor" class="vega-room-name-editor" ${roomNameOpen?'':'hidden'}>
            <input data-config-room-name value="${esc(room.name)}" aria-label="${esc(t('vega.roomName'))}" maxlength="200" autocomplete="off">
            <button type="button" data-config-room-name-done aria-label="${esc(t('tile.done'))}">✓</button>
          </div>
        </div>
      </div>
      <div class="vega-room-actions">
        <button type="button" data-config-area-open aria-haspopup="dialog">＋ ${esc(t('vega.addFromArea'))}</button>
        <button type="button" class="vega-room-delete" data-config-delete-room>${esc(t('vega.removeRoom'))}</button>
      </div>`:`<p class="vega-room-empty">${esc(t('vega.emptyBody'))}</p>`}
    </section>
    <section class="vega-room-directory" aria-labelledby="vega-room-list-title">
      <header class="vega-room-list-header">
        <div class="vega-room-list-title">
          <strong id="vega-room-list-title">${esc(t('nav.rooms'))} <small>(${count})</small></strong>
        </div>
        <div class="vega-room-list-actions">
          ${room?[-1,1].map(direction=>{
            const key=direction<0?'vega.moveUp':'vega.moveDown';
            const disabled=selected+direction<0||selected+direction>=count;
            return `<button type="button" data-config-move-room="${selected}" data-direction="${direction}" ${disabled?'disabled':''} aria-label="${esc(t(key))}" title="${esc(t(key))}">${direction<0?'↑':'↓'}</button>`;
          }).join(''):''}
          <button type="button" class="vega-room-add" data-config-add-room aria-label="${esc(t('vega.addRoom'))}" title="${esc(t('vega.addRoom'))}" ${count>=100?'disabled':''}>＋</button>
        </div>
      </header>
      <nav class="vega-room-list" data-config-room-list aria-labelledby="vega-room-list-title">
        ${draft.rooms.map((item,index)=>{
          const name=item.name||t('vega.roomName');
          const size=Object.keys(domains).reduce((total,section)=>total+(item[section]?.length||0),0);
          return `<button type="button" class="vega-room-select" data-config-room="${index}" aria-pressed="${index===selected}">
            <span class="vega-room-symbol">${panel.roomIcon(item.icon)}</span>
            <span data-room-label="${index}">${esc(name)}</span><small>${size}</small>
          </button>`;
        }).join('')}
      </nav>
    </section>`;
  }

  function setRoomNameOpen(open){
    const field=shell.querySelector('#vega-room-name-editor');
    const button=shell.querySelector('[data-config-room-edit-name]');
    if(!field||!button)return;
    roomNameOpen=open;
    button.hidden=open;
    field.hidden=!open;
    (open?field.querySelector('input'):button)?.focus({preventScroll:true});
  }

  function focusRoom(index){
    const target=shell.querySelector(`[data-config-room="${index}"]`);
    target?.scrollIntoView?.({block:'nearest'});
    target?.focus({preventScroll:true});
  }

  function moveRoom(from,to){
    if(!draft||mode!=='rooms'||busy||chooser||from===to||!draft.rooms[from]||!draft.rooms[to])return;
    const [room]=draft.rooms.splice(from,1);
    draft.rooms.splice(to,0,room);
    selected=to;
    roomNameOpen=false;
    paint();
    const row=shell.querySelector(`[data-config-room="${to}"]`);
    row?.scrollIntoView?.({block:'nearest'});
    const arrow=shell.querySelector(`[data-config-move-room][data-direction="${to-from}"]:not([disabled])`);
    (arrow||row)?.focus({preventScroll:true});
  }

  function addDeviceEditor(room){
    return `<p class="vega-device-room-caption">${esc(panel.roomName(room))}</p>
      <section class="vega-settings-card vega-entity-picker vega-add-only-picker">
      <label data-config-type-field ${category==='devices'?'':'hidden'}>${esc(t('vega.deviceType'))}<select data-config-device-filter>${typeOptions(deviceFilter,['all',...DEVICE_TYPES.map(([key])=>key).filter(key=>!['camera','scene','automation'].includes(key))])}</select></label>
      <label class="vega-entity-search">${esc(t('vega.searchEntities'))}<input data-config-search type="search" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="vega-entity-results" autocomplete="off" placeholder="${esc(t('vega.searchPlaceholder'))}"></label>
      <div class="vega-search-meta" data-config-result-count aria-live="polite"></div><div id="vega-entity-results" class="vega-entity-results" role="listbox" aria-label="${esc(t('vega.searchEntities'))}"></div></section>
      <section class="vega-settings-card vega-add-summary"><strong>${esc(t('vega.selectedEntities'))}: <span data-config-added-count>0</span></strong><div data-config-added-list></div></section>`;
  }
  function renderAdded(){
    const count=shell.querySelector('[data-config-added-count]'),list=shell.querySelector('[data-config-added-list]');
    if(!count||!list)return;
    const room=draft.rooms[selected];const entries=addedIDs.filter(([section,id])=>(room?.[section]||[]).some(item=>item.entity_id===id));
    count.textContent=String(entries.length);
    list.innerHTML=entries.length?entries.map(([section,id])=>`<div class="vega-added-row"><span><strong>${esc(label(id))}</strong><code>${esc(id)}</code></span><button type="button" data-config-undo-add="${esc(id)}" data-config-undo-category="${section}" aria-label="${esc(t('vega.remove'))}">×</button></div>`).join(''):`<p class="vega-field-hint">${esc(t('vega.draftHint'))}</p>`;
  }
  function paint(){
    if(!draft)return;
    const listScroll=shell.querySelector('[data-config-room-list]')?.scrollTop||0;
    shell.setAttribute('data-mode',mode);
    const room=draft.rooms[selected];activeResult=-1;
    const title=mode==='rooms'?t('vega.editRoom'):mode==='add-device'?t('vega.addEntity'):mode==='device'?t('vega.editDevice'):t('vega.kindColors');
    const deviceContent=room?.[category]?.[editIndex]?`<div class="vega-home-config-items"></div>`:`<p class="vega-field-hint">${esc(t('vega.noSelectedEntities'))}</p>`;
    shell.innerHTML=`<section class="vega-home-config-window is-contextual is-${mode}-editor" role="dialog" aria-modal="true" aria-labelledby="vega-config-heading">
      <header class="vega-modal-header"><div><small>VEGA HOME • ${esc(panel.releaseVersion)}</small><strong id="vega-config-heading">${esc(title)}</strong></div><button type="button" data-config-close aria-label="${esc(t('popup.close'))}">×</button></header>
      ${mode==='add-device'?`<nav class="vega-add-categories" role="group" aria-label="${esc(t('vega.category'))}">${Object.entries(categories).map(([key,title])=>`<button type="button" data-config-category="${key}" aria-pressed="${category===key}">${esc(t(title))}</button>`).join('')}</nav>`:''}
      <main class="vega-config-workspace vega-flow-${mode}">
        ${mode==='rooms'?roomEditor(room):mode==='add-device'?addDeviceEditor(room):mode==='device'?deviceContent:paletteEditor()}
      </main>
      <footer class="vega-modal-footer"><p data-config-status data-status-id="vega.draftHint" role="status" aria-live="polite">${esc(t('vega.draftHint'))}</p><button type="button" data-config-close>${esc(t('vega.cancel'))}</button><button type="button" class="primary" data-config-save>${esc(t('vega.save'))}</button></footer></section>`;
    const roomList=shell.querySelector('[data-config-room-list]');
    if(roomList)roomList.scrollTop=listScroll;
    renderSelected();renderResults();renderAdded();
  }
  function renderResults(){
    const room=draft?.rooms[selected],container=shell.querySelector('#vega-entity-results');if(!container||!room)return;
    const query=normalized(shell.querySelector('[data-config-search]').value),terms=query.split(/\s+/).filter(Boolean);
    const assigned=new Set(draft.rooms.flatMap(owner=>Object.keys(domains).flatMap(section=>(owner[section]||[]).map(item=>item.entity_id))));
    resultIDs=list(domains[category]).filter(id=>!assigned.has(id)&&(category!=='devices'||deviceFilter==='all'||(deviceFilter==='computer'||deviceFilter==='other'?(KIND_CHOICES[id.split('.')[0]]||[]).includes(deviceFilter):panel.deviceKind(makeItem(id))===deviceFilter))&&terms.every(term=>normalized(id+' '+label(id)+' '+physicalName(id)).includes(term)));
    activeResult=-1;shell.querySelector('[data-config-search]').removeAttribute('aria-activedescendant');
    const shown=resultIDs.slice(0,100);container.innerHTML=shown.length?shown.map((id,i)=>`<button type="button" id="vega-entity-result-${i}" role="option" aria-selected="false" data-config-pick="${esc(id)}"><span class="vega-result-copy"><strong>${esc(label(id))}</strong><code>${esc(id)}</code>${physicalName(id)&&physicalName(id)!==label(id)?`<small>${esc(physicalName(id))}</small>`:''}</span><span class="vega-result-plus" aria-hidden="true">＋</span></button>`).join(''):`<p class="vega-picker-empty">${esc(t('vega.noResults'))}</p>`;
    shell.querySelector('[data-config-result-count]').textContent=t('vega.resultCount',{count:resultIDs.length});
    if(resultIDs.length>100)shell.querySelector('[data-config-result-count]').textContent+=' · '+t('vega.refineSearch');
  }
  // Single-item editor: three directly selectable identity fields. There is no
  // nested generic device list, no reordering and no automatic shared write.
  function renderSelected(){
    const room=draft?.rooms[selected],container=shell.querySelector('.vega-home-config-items');
    if(!container||!room||mode!=='device')return;
    const d=room[category]?.[editIndex];if(!d)return;
    const i=editIndex,kind=panel.deviceKind(d),name=d.name||label(d.entity_id);
    const glyph=iconChoice(d.icon_override||panel.deviceIconName(d),false);
    const iconText=d.icon_override||t('vega.iconAuto');
    const extra=d.entity_id.startsWith('climate.');
    const controls=(d.extra_controls||[]);
    container.innerHTML=`<section class="vega-device-sheet" data-config-item="${i}">
      <div class="vega-device-identity" role="group" aria-label="${esc(t('vega.editDevice'))}">
        <button type="button" class="vega-identity-cell vega-identity-icon" data-config-icon-open data-icon-room="0" data-icon-index="${i}" title="${esc(t('vega.deviceIcon'))}" aria-label="${esc(t('vega.deviceIcon'))}" aria-haspopup="dialog"><span class="vega-identity-glyph">${glyph}</span><span class="vega-identity-text"><small>${esc(t('vega.deviceIcon'))}</small><strong>${esc(iconText)}</strong></span><span class="vega-identity-pencil" aria-hidden="true">✎</span></button>
        <button type="button" class="vega-identity-cell" data-config-edit-name aria-expanded="${deviceNameOpen}" aria-controls="vega-device-name-input"><span class="vega-identity-text"><small>${esc(t('vega.deviceName'))}</small><strong data-device-summary="${i}">${esc(name)}</strong></span><span class="vega-identity-pencil" aria-hidden="true">✎</span></button>
        <button type="button" class="vega-identity-cell" data-config-entity-open data-entity-kind="replace" data-entity-allowed="${esc(domains[category].join(','))}" data-entity-index="${i}" data-entity-extra="" data-entity-title="${esc(t('vega.chooseEntity'))}" data-entity-current="${esc(d.entity_id)}" aria-haspopup="dialog"><span class="vega-identity-text"><small>${esc(t('vega.chooseEntity'))}</small><strong>${esc(label(d.entity_id))}</strong><code>${esc(d.entity_id)}</code></span><span class="vega-identity-pencil" aria-hidden="true">⌄</span></button>
      </div>
      <label id="vega-device-name-input" class="vega-device-inline-name" ${deviceNameOpen?'':'hidden'}>${esc(t('vega.deviceName'))}<input data-config-name="${i}" value="${esc(d.name)}" maxlength="200" autocomplete="off"></label>
      <div class="vega-device-kind-row"><label>${esc(t('vega.deviceType'))}<select data-config-kind="${i}">${typeOptions(kind,KIND_CHOICES[d.entity_id.split('.')[0]]||['switch'])}</select></label><span class="vega-kind-glyph">${iconPreview(d)}</span></div>
      <div class="vega-device-room-field"><label for="vega-device-room-select">${esc(t('vega.deviceRoom'))}</label><select id="vega-device-room-select" data-config-target-room aria-label="${esc(t('vega.deviceRoom'))}">${draft.rooms.map((candidate,index)=>`<option value="${index}" ${index===selected?'selected':''}>${esc(panel.roomName(candidate))}</option>`).join('')}</select></div>
      ${extra?`<details class="vega-device-advanced"><summary>${esc(t('vega.climateExtras'))}<span class="vega-details-chevron" aria-hidden="true">⌄</span></summary><div class="vega-advanced-content"><p class="vega-field-hint">${esc(t('vega.climateExtrasHint'))}</p>${controls.map((control,j)=>`<div class="vega-climate-extra"><label>${esc(t('vega.controlName'))}<input data-config-control-name="${i}" data-control-index="${j}" value="${esc(control.name)}" maxlength="200"></label>${entityTrigger('vega.controlEntity',['select'],control.entity_id||'','extra',i,String(j))}<button type="button" data-config-control-remove="${i}" data-control-index="${j}">${esc(t('vega.remove'))}</button></div>`).join('')}<button type="button" data-config-control-add="${i}" ${controls.length>=12?'disabled':''}>＋ ${esc(t('vega.addControl'))}</button></div></details>`:''}
      ${category==='cameras'?`<details class="vega-device-advanced"><summary>${esc(t('vega.optionalIntegrations'))}<span class="vega-details-chevron" aria-hidden="true">⌄</span></summary><div class="vega-advanced-content">${entityTrigger('vega.cameraPower',['switch'],d.power_entity||'','camera',i,'power_entity')}${entityTrigger('vega.cameraSignal',['sensor'],d.signal_entity||'','camera',i,'signal_entity')}</div></details>`:''}
      ${category==='devices'&&['light','switch','fan','climate','media_player'].includes(d.entity_id.split('.')[0])?`<div class="vega-device-confirm-settings">
        <label class="vega-confirm-toggle"><span>${esc(t('device.confirmToggle'))}</span>
          <input type="checkbox" data-config-confirm-toggle="${i}" ${d.confirm_off||d.tap==='confirm-off'||d.kind==='printer'?'checked':''}></label>
        ${(d.confirm_off||d.tap==='confirm-off'||d.kind==='printer')?`<button type="button" class="vega-confirm-message-trigger" data-config-confirm-edit="${i}" aria-haspopup="dialog" aria-label="${esc(t('device.confirmMessage'))}">
          <span><small>${esc(t('device.confirmMessage'))}</small><strong>${esc(d.confirm_message?.trim()||t('device.confirmDefault'))}</strong></span><span aria-hidden="true">✎</span>
        </button>`:''}</div>`:''}
      <div class="vega-device-footer-actions"><button class="vega-device-color-link" type="button" data-config-colors>${esc(t('vega.kindColors'))} ›</button><button type="button" class="vega-danger-link" data-config-remove="${i}">${esc(t('vega.remove'))}</button></div>
    </section>`;
  }
  function closeChooser(){
    if(!chooser)return;const trigger=chooser.trigger;
    shell.querySelector('.vega-picker-layer')?.remove();chooser=null;
    const window=shell.querySelector('.vega-home-config-window');
    if(window){window.inert=false;window.classList.remove('is-picker-underlay');window.setAttribute('aria-modal','true');}
    if(trigger?.isConnected)trigger.focus({preventScroll:true});
  }
  function areaChoices(){
    const keys={media_player:'media',binary_sensor:'sensor'};
    return ['all',...Object.values(domains).flat()].map(domain=>{
      const title=t('vega.type.'+(keys[domain]||domain));
      const suffix=domain==='sensor'||domain==='binary_sensor'?` (${domain})`:'';
      return `<option value="${domain}">${esc(title+suffix)}</option>`;
    }).join('');
  }

  function areaPickerFields(){
    return `<div class="vega-area-filters">
      <label><span>${esc(t('vega.fromArea'))}</span><select data-config-area></select></label>
      <label><span>${esc(t('vega.category'))}</span><select data-config-area-domain>${areaChoices()}</select></label>
    </div>`;
  }

  function areaCandidates(room,areaID){
    const existing=new Set(draft.rooms.flatMap(source=>Object.keys(domains).flatMap(section=>(source[section]||[]).map(item=>item.entity_id))));
    return roomAreaEntities(areaID,registry,devices,states())
      .filter(({id})=>!existing.has(id))
      .sort((a,b)=>label(a.id).localeCompare(label(b.id))||a.id.localeCompare(b.id));
  }

  function syncAreaPicker(layer){
    const areaSelect=layer.querySelector('[data-config-area]');
    if(!areas.some(area=>area.area_id===chooser.areaID))chooser.areaID=areas[0]?.area_id||'';
    areaSelect.innerHTML=areas.length?areas.map(area=>`<option value="${esc(area.area_id)}">${esc(area.name)}</option>`).join(''):
      `<option value="">${esc(t('vega.noSelection'))}</option>`;
    areaSelect.value=chooser.areaID;
    areaSelect.disabled=!registryReady||!areas.length;
    chooser.candidates=registryReady?areaCandidates(draft.rooms[selected],chooser.areaID):[];
    const available=new Set(chooser.candidates.map(({id})=>id));
    chooser.picked=new Set([...chooser.picked].filter(id=>available.has(id)));
    renderChooserResults();
  }

  function updateAreaPicked(layer){
    const count=chooser.picked.size;
    layer.querySelector('[data-config-area-selected]').textContent=`${t('vega.selectedEntities')}: ${count}`;
    layer.querySelector('[data-config-add-area]').disabled=!count;
  }

  function setFilteredAreaSelection(layer,checked){
    for(const id of chooser.matchingIDs){
      if(checked)chooser.picked.add(id);
      else chooser.picked.delete(id);
    }
    for(const input of layer.querySelectorAll('[data-config-area-entity]'))input.checked=checked;
    updateAreaPicked(layer);
  }

  function renderAreaResults(layer,terms){
    const {areaID,domain,candidates,picked,limit}=chooser;
    const body=layer.querySelector('.vega-picker-body');
    const search=layer.querySelector('[data-config-picker-search]');
    const enabled=registryReady&&Boolean(areaID);
    search.disabled=!enabled;
    layer.querySelector('[data-config-area-domain]').disabled=!enabled;
    const matches=enabled?candidates.filter(({id,domain:kind})=>
      (domain==='all'||kind===domain)&&terms.every(term=>normalized(label(id)+' '+id).includes(term))):[];
    chooser.matchingIDs=matches.map(({id})=>id);
    layer.querySelector('[data-config-area-select-all]').disabled=!matches.length;
    layer.querySelector('[data-config-area-clear-all]').disabled=!matches.length;
    const emptyKey=registryLoading?'loading':!registryReady?'vega.registryError':
      !areas.length?'vega.noResults':!areaID?'vega.fromArea':'vega.noResults';
    layer.querySelector('.vega-picker-meta').textContent=enabled?t('vega.resultCount',{count:matches.length}):'';
    const shown=matches.slice(0,limit);
    body.innerHTML=shown.length?shown.map(({id})=>`<label class="vega-area-option">
      <input type="checkbox" data-config-area-entity="${esc(id)}" ${picked.has(id)?'checked':''}>
      <span><strong>${esc(label(id))}</strong><code dir="ltr">${esc(id)}</code></span>
    </label>`).join('')+(matches.length>shown.length?`<button type="button" data-config-area-more>${esc(t('vega.showMore'))}</button>`:''):
      `<p class="vega-picker-empty">${esc(t(emptyKey))}</p>`;
    updateAreaPicked(layer);
  }

  function addAreaSelection(){
    if(chooser?.type!=='area'||!registryReady)return;
    const room=draft.rooms[selected];
    const groups=Object.fromEntries(Object.keys(domains).map(section=>[section,[]]));
    for(const {id,section} of areaCandidates(room,chooser.areaID)){
      if(chooser.picked.has(id))groups[section].push(makeItem(id));
    }
    const count=Object.values(groups).reduce((sum,items)=>sum+items.length,0);
    if(!count){syncAreaPicker(shell.querySelector('.vega-picker-layer'));return;}
    if(Object.keys(groups).some(section=>(room[section]?.length||0)+groups[section].length>200)){
      shell.querySelector('.vega-picker-meta').textContent=t('vega.areaTooLarge');
      return;
    }
    for(const [section,items] of Object.entries(groups)){
      if(items.length)room[section]=[...(room[section]||[]),...items];
    }
    closeChooser();
    paint();
    status('vega.areaAdded',{count});
    shell.querySelector('[data-config-area-open]')?.focus({preventScroll:true});
  }

  function openChooser(type,trigger){
    closeChooser();const room=type==='icon'&&trigger.dataset.iconRoom==='1';
    const idx=Number(type==='confirm-message'?trigger.dataset.configConfirmEdit:trigger.dataset.iconIndex);
    chooser={type,trigger,room,index:idx,colorKind:trigger.dataset.configPaletteOpen,paletteMode:'soft',limit:84,group:'all',allowed:trigger.dataset.entityAllowed?.split(',')||[],kind:trigger.dataset.entityKind,extra:trigger.dataset.entityExtra};
    if(type==='area'){
      chooser.areaID='';
      chooser.domain='all';
      chooser.picked=new Set();
      chooser.candidates=[];
      chooser.limit=120;
    }
    const title=type==='confirm-message'?t('device.confirmMessage'):type==='area'?t('vega.addFromArea'):type==='palette'?t('vega.type.'+typeKey(chooser.colorKind)):
      type==='icon'?t(room?'vega.roomIcon':'vega.deviceIcon'):trigger.dataset.entityTitle;
    const layer=document.createElement('div');layer.className='vega-picker-layer';
    layer.innerHTML=`<div class="vega-picker-backdrop" data-config-picker-close></div>
      <section class="vega-picker-dialog${type==='area'?' vega-area-dialog':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <header class="vega-picker-header"><strong>${esc(title)}</strong><button type="button" data-config-picker-close aria-label="${esc(t('popup.close'))}">×</button></header>
        ${type==='area'?areaPickerFields():''}
        <div class="vega-picker-search-row" ${type==='palette'||type==='confirm-message'?'hidden':''}>
          <input type="search" data-config-picker-search aria-label="${esc(type==='icon'?t('vega.iconSearch'):t('vega.searchEntities'))}" autocomplete="off" placeholder="${esc(type==='icon'?t('vega.iconSearchHint'):t('vega.searchPlaceholder'))}">
          ${type==='icon'?`<select data-config-icon-group aria-label="${esc(t('vega.category'))}">${ICON_GROUPS.map(group=>`<option value="${group}">${esc(t('vega.type.'+group))}</option>`).join('')}</select>`:''}
        </div>
        ${type==='area'?`<div class="vega-area-bulk">
          <button type="button" data-config-area-select-all>${esc(t('vega.selectAll'))}</button>
          <button type="button" data-config-area-clear-all>${esc(t('vega.deselectAll'))}</button>
        </div>`:''}
        <div class="vega-picker-meta" aria-live="polite"></div><div class="vega-picker-body"></div>
        ${type==='area'?`<footer class="vega-modal-footer vega-area-footer"><span data-config-area-selected aria-live="polite"></span><button type="button" class="primary" data-config-add-area disabled>${esc(t('vega.addEntity'))}</button></footer>`:''}
        ${type==='confirm-message'?`<footer class="vega-modal-footer"><button type="button" data-config-picker-close>${esc(t('vega.cancel'))}</button><button type="button" class="primary" data-config-confirm-message-save>${esc(t('vega.save'))}</button></footer>`:''}
      </section>`;
    const window=shell.querySelector('.vega-home-config-window');
    window.inert=true;window.classList.add('is-picker-underlay');window.setAttribute('aria-modal','false');
    shell.append(layer);
    if(type==='area')syncAreaPicker(layer);
    else renderChooserResults();
    const focus=type==='palette'?'[data-config-palette-choice]':'.vega-picker-header button';
    layer.querySelector(focus)?.focus({preventScroll:true});
  }
  function renderChooserResults(){
    if(!chooser)return;const layer=shell.querySelector('.vega-picker-layer');if(!layer)return;
    const body=layer.querySelector('.vega-picker-body');
    if(chooser.type==='confirm-message'){
      const item=draft.rooms[selected]?.[category]?.[chooser.index];
      body.innerHTML=`<label class="vega-confirm-message-editor"><span>${esc(t('device.confirmMessage'))}</span>
        <textarea data-config-confirm-text maxlength="300" rows="4" placeholder="${esc(t('device.confirmDefault'))}">${esc(item?.confirm_message||'')}</textarea>
        <small>${esc(t('device.confirmDefault'))}</small></label>`;
      return;
    }
    const q=normalized(layer.querySelector('[data-config-picker-search]').value.trim());
    const terms=q.split(/\s+/).filter(Boolean);
    if(chooser.type==='area'){renderAreaResults(layer,terms);return;}
    if(chooser.type==='palette'){
      const kind=chooser.colorKind,selected=kindPalette(kind,draft.settings.kind_colors||{}).background;
      const suggested=chooser.paletteMode!=='all';
      const shown=COLOR_PALETTE.filter(([, , ,soft])=>!suggested||soft);
      const note=['palette.soft','palette.all','palette.legacy'].map(key=>t(key));
      const oldSaved=!COLOR_PALETTE.some(([bg])=>bg===selected);
      body.innerHTML=`<div class="vega-palette-filter" role="group" aria-label="${esc(t('vega.kindColors'))}"><button type="button" data-config-palette-filter="soft" aria-pressed="${suggested}">${esc(note[0])}</button><button type="button" data-config-palette-filter="all" aria-pressed="${!suggested}">${esc(note[1])}</button></div>
        ${oldSaved?`<p class="vega-palette-legacy">${esc(note[2])}: <span style="background:${selected}" aria-hidden="true"></span><code>${selected}</code></p>`:''}
        <div class="vega-color-choices">${shown.map(([bg,fg,name])=>`<button type="button" data-config-palette-choice="${bg}" title="${esc(name)}" aria-label="${esc(name)}" aria-pressed="${selected===bg}"><span class="vega-color-sample" style="background:${bg};color:${fg}">${selected===bg?'✓':''}</span><span class="vega-color-name">${esc(name)}</span></button>`).join('')}</div><p class="vega-field-hint">${esc(t('vega.colorHint'))}</p>`;
      layer.querySelector('.vega-picker-meta').textContent=`${shown.length} / ${COLOR_PALETTE.length}`;
    }else if(chooser.type==='entity'){
      const current=chooser.trigger.dataset.entityCurrent||'';
      const ids=[...new Set([...list(chooser.allowed),...(current?[current]:[])])];
      const found=ids.filter(id=>terms.every(term=>normalized(id+' '+label(id)+' '+physicalName(id)).includes(term)));
      const shown=found.slice(0,120);
      body.innerHTML=(chooser.kind==='replace'?'':`<button type="button" class="vega-picker-option vega-picker-none" data-config-entity-option=""><strong>${esc(t('vega.none'))}</strong></button>`)+shown.map(id=>`<button type="button" class="vega-picker-option" data-config-entity-option="${esc(id)}" aria-pressed="${id===current}"><span><strong>${esc(label(id))}</strong><code>${esc(id)}</code></span>${id===current?'<span class="vega-option-check" aria-hidden="true">✓</span>':''}</button>`).join('');
      layer.querySelector('.vega-picker-meta').textContent=t('vega.resultCount',{count:found.length})+(found.length>120?' · '+t('vega.refineSearch'):'');
    }else{
      const room=chooser.room;
      const current=room?draft.rooms[selected]?.icon:draft.rooms[selected]?.[category]?.[chooser.index]?.icon_override||'';
      const query=q.replace(/^mdi:/,'').replace(/\.svg$/,'');
      const iconTerms=query.split(/\s+/).filter(Boolean);
      const item=draft.rooms[selected]?.[category]?.[chooser.index];
      const preferred=room?'room':typeKey(panel.deviceKind(item||{entity_id:'switch.preview'}));
      const matched=DEVICE_ICONS.filter(icon=>(chooser.group==='all'||icon.group===chooser.group)&&iconTerms.every(term=>normalized(icon.name+' '+icon.aliases.join(' ')+' '+icon.tags.join(' ')).includes(term)))
        .sort((a,b)=>Number(b.group===preferred)-Number(a.group===preferred)||a.name.localeCompare(b.name));
      const shown=matched.slice(0,chooser.limit);
      body.innerHTML=`<div class="vega-picker-icon-section"><div class="vega-picker-icon-grid">${room?'':`<button type="button" data-config-icon-auto aria-pressed="${!current}" title="${esc(t('vega.iconAuto'))}"><span class="vega-auto-glyph">A</span><small>${esc(t('vega.iconAuto'))}</small></button>`}${shown.map(icon=>`<button type="button" data-icon-choice="${icon.key}" title="${esc(icon.name+'.svg')}" aria-label="${esc(icon.name)}" aria-pressed="${icon.key===current}">${iconChoice(icon.key,room)}<small>${esc(icon.name)}</small></button>`).join('')}</div></div>${matched.length>shown.length?`<button type="button" class="vega-icon-more" data-config-icon-more>${esc(t('vega.showMore'))}</button>`:''}${!matched.length?`<p class="vega-picker-empty">${esc(t('vega.noResults'))}</p>`:''}`;
      layer.querySelector('.vega-picker-meta').textContent=t('vega.iconCount',{count:matched.length,shown:shown.length});
    }
  }
  function setEntityValue(value){
    if(!chooser||chooser.type!=='entity')return;
    const trigger=chooser.trigger,room=draft.rooms[selected],i=Number(trigger.dataset.entityIndex);
    if(chooser.kind==='replace'){
      const old=room?.[category]?.[i];if(!old||!value||!states()[value]||!domains[category].includes(value.split('.')[0]))return;
      if(draft.rooms.some((source,ri)=>Object.keys(domains).some(section=>
        (source[section]||[]).some((item,j)=>item.entity_id===value&&!(ri===selected&&section===category&&j===i))))){
        closeChooser();status('vega.duplicate');return;
      }
      const next=makeItem(value),wasAuto=old.name===label(old.entity_id);
      if(!wasAuto)next.name=old.name;
      if(old.icon_override)next.icon_override=old.icon_override;
      if((KIND_CHOICES[value.split('.')[0]]||[]).includes(old.kind))next.kind=old.kind;
      if(old.confirm_off||old.tap==='confirm-off'||old.kind==='printer')next.confirm_off=true;
      if(old.confirm_message)next.confirm_message=old.confirm_message;
      if(value.startsWith('climate.'))next.extra_controls=old.extra_controls||[];
      if(value.startsWith('camera.'))for(const key of ['power_entity','signal_entity'])if(old[key])next[key]=old[key];
      room[category][i]=next;editIndex=i;
      closeChooser();paint();return;
    }
    if(chooser.kind==='extra'){
      const item=room[category]?.[i];if(!item)return;
      const control=item.extra_controls?.[Number(chooser.extra)];if(!control)return;
      control.entity_id=value;
    }else if(chooser.kind==='camera'){
      const item=room[category]?.[i];if(!item)return;
      if(value)item[chooser.extra]=value;else delete item[chooser.extra];
    }
    trigger.dataset.entityCurrent=value;
    trigger.querySelector('strong').textContent=value?label(value):t('vega.none');
    trigger.querySelector('code').textContent=value;
    closeChooser();
  }
  function setIconValue(key){
    if(!chooser||chooser.type!=='icon')return;
    const room=draft.rooms[selected],isRoom=chooser.room,index=chooser.index;
    if(isRoom)room.icon=key;
    else if(room?.[category]?.[index]){
      if(key)room[category][index].icon_override=key;
      else delete room[category][index].icon_override;
    }
    closeChooser();
    if(isRoom){paint();shell.querySelector('[data-config-icon-open][data-icon-room="1"]')?.focus({preventScroll:true});}
    else {renderSelected();shell.querySelector(`[data-config-item="${index}"] [data-config-icon-open]`)?.focus({preventScroll:true});}
  }
  function status(key,vars){const el=shell.querySelector('[data-config-status]');if(el){el.setAttribute('data-status-id',key);el.textContent=t(key,vars);}}
  function close(){if(busy)return;clearTimeout(inactivityTimer);closeChooser();epoch++;controller?.abort();controller=null;shell.hidden=true;draft=null;initialRooms=[];panel._surface?.close('configuration');panel._surface?.restoreFocus(focusBefore);panel.refreshChangedConfiguration?.();}
  async function open(options={}){
    if(disposed||busy||!panel._hass?.user?.is_admin||!panel._sharedConfig)return;
    closeChooser();controller?.abort();controller=new AbortController();
    const requested=options.mode||(options.view==='colors'?'colors':options.itemID?'device':options.focus==='search'?'add-device':'rooms');
    mode=['rooms','add-device','device','colors'].includes(requested)?requested:'rooms';
    returnMode=mode==='colors'?'rooms':mode;
    panel._v41?.close();focusBefore=root.activeElement;owner=panel._hass.user.id;entryID=panel._panelInfo.config.entry_id;
    draft=structuredClone(panel._sharedConfig);draft.settings||={};draft.settings.kind_colors||={};
    for(const room of draft.rooms){room.icon=normalizeIcon(room.icon,true)||'mdi:home-outline';for(const item of room.devices||[])if(item.entity_id.startsWith('climate.')){item.extra_controls=panel.climateControls(item).map(control=>({...control}));delete item.vanes;}}
    revision=panel._configRevision;
    initialRooms=draft.rooms.slice();roomNameOpen=false;
    selected=Number.isInteger(options.roomIndex)&&draft.rooms[options.roomIndex]?options.roomIndex:Math.min(panel.room,Math.max(0,draft.rooms.length-1));
    category=domains[options.category]?options.category:'devices';deviceFilter='all';addedIDs=[];busy=false;editIndex=-1;deviceNameOpen=false;
    if(options.itemID){for(const section of Object.keys(domains)){const idx=draft.rooms[selected]?.[section]?.findIndex(item=>item.entity_id===options.itemID)??-1;if(idx>=0){category=section;editIndex=idx;break;}}}
    if(mode==='device'&&editIndex<0)mode='add-device';
    if(mode==='add-device'&&!draft.rooms.length)mode='rooms';
    registryReady=false;registryLoading=true;areas=[];registry=new Map();devices=new Map();
    const seq=++epoch;shell.hidden=false;panel._surface?.open('configuration',18);paint();resetInactivity();
    const focus=mode==='add-device'?'[data-config-category][aria-pressed="true"]':mode==='device'?'[data-config-edit-name]':
      '[data-config-room][aria-pressed="true"],[data-config-add-room]';
    (shell.querySelector(focus)||shell.querySelector('[data-config-close]'))?.focus({preventScroll:true});
    const results=await Promise.allSettled(['area','entity','device'].map(kind=>vegaRequest(panel._hass,{type:`config/${kind}_registry/list`},{signal:controller.signal,timeout:8000})));
    if(disposed||seq!==epoch||shell.hidden||panel._hass?.user?.id!==owner)return;
    const rows=index=>results[index].status==='fulfilled'&&Array.isArray(results[index].value)?results[index].value:[];
    areas=rows(0);registry=new Map(rows(1).map(row=>[row.entity_id,row]));devices=new Map(rows(2).map(row=>[row.id,row]));
    registryLoading=false;
    registryReady=results.every(result=>result.status==='fulfilled'&&Array.isArray(result.value));
    if(!registryReady)status('vega.registryError');
    if(chooser?.type==='area')syncAreaPicker(shell.querySelector('.vega-picker-layer'));
    renderResults();
  }
  function changed(event){
    if(!draft||busy)return;const el=event.target,room=draft.rooms[selected];
    if(el.hasAttribute('data-config-target-room')&&mode==='device'&&event.type==='change'){
      const to=Number(el.value),from=selected,item=room?.[category]?.[editIndex];
      if(!item||!Number.isInteger(to)||!draft.rooms[to]||to===from){el.value=String(from);return;}
      if(Object.keys(domains).some(section=>(draft.rooms[to][section]||[]).some(d=>d.entity_id===item.entity_id))){
        el.value=String(from);status('vega.duplicate');return;
      }
      const destination=draft.rooms[to][category]||(draft.rooms[to][category]=[]);
      if(destination.length>=200){el.value=String(from);status('vega.areaTooLarge');return;}
      room[category].splice(editIndex,1);destination.push(item);selected=to;editIndex=destination.length-1;
      deviceNameOpen=false;paint();shell.querySelector('[data-config-target-room]')?.focus({preventScroll:true});
      return;
    }
    if(chooser?.type==='area'){
      const layer=shell.querySelector('.vega-picker-layer');
      if(event.type==='change'&&el.hasAttribute('data-config-area')){
        chooser.areaID=el.value;
        chooser.limit=120;
        chooser.picked.clear();
        chooser.candidates=areaCandidates(room,chooser.areaID);
        layer.querySelector('.vega-picker-body').scrollTop=0;
        renderChooserResults();
      }else if(event.type==='change'&&el.hasAttribute('data-config-area-domain')){
        chooser.domain=el.value;
        chooser.limit=120;
        layer.querySelector('.vega-picker-body').scrollTop=0;
        renderChooserResults();
      }else if(event.type==='change'&&el.hasAttribute('data-config-area-entity')){
        const id=el.dataset.configAreaEntity;
        if(el.checked)chooser.picked.add(id);else chooser.picked.delete(id);
        updateAreaPicked(layer);
      }else if(event.type==='input'&&el.hasAttribute('data-config-picker-search')){
        chooser.limit=120;
        layer.querySelector('.vega-picker-body').scrollTop=0;
        renderChooserResults();
      }
      return;
    }
    if(el.hasAttribute('data-config-room-name')&&room){
      room.name=el.value;
      const name=el.value||t('vega.roomName');
      const label=shell.querySelector(`[data-room-label="${selected}"]`);
      const heading=shell.querySelector('[data-config-room-name-label]');
      if(label)label.textContent=name;
      if(heading){heading.textContent=name;heading.title=name;}
    }
    else if(el.hasAttribute('data-config-name')){const i=+el.dataset.configName,d=room[category][i];d.name=el.value;delete d.names;const summary=shell.querySelector(`[data-device-summary="${i}"]`);if(summary)summary.textContent=el.value||label(d.entity_id);}
    else if(el.hasAttribute('data-config-confirm-toggle')){
      const d=room?.[category]?.[Number(el.dataset.configConfirmToggle)];
      if(d){d.confirm_off=Boolean(el.checked);delete d.tap;renderSelected();}
    }
    else if(el.hasAttribute('data-config-device-filter')){deviceFilter=el.value;renderResults();}
    else if(el.hasAttribute('data-config-kind')){room[category][+el.dataset.configKind].kind=el.value;const detailsOpen=Boolean(shell.querySelector('.vega-device-advanced[open]'));renderSelected();if(detailsOpen)shell.querySelector('.vega-device-advanced')?.setAttribute('open','');}
    else if(el.hasAttribute('data-config-control-name')){room[category][+el.dataset.configControlName].extra_controls[+el.dataset.controlIndex].name=el.value;}
    else if(el.hasAttribute('data-config-icon-group')){chooser.group=el.value;chooser.limit=84;renderChooserResults();}
    else if(el.hasAttribute('data-config-picker-search')&&event.type==='input'){chooser.limit=84;renderChooserResults();}
    else if(el.hasAttribute('data-config-search')&&event.type==='input')renderResults();
  }
  async function save(){
    if(busy||!draft)return;
    const blank=draft.rooms.findIndex(room=>!room.name.trim());
    if(blank>=0){
      if(mode==='rooms'){
        selected=blank;roomNameOpen=false;paint();
        shell.querySelector('[data-config-room-edit-name]')?.focus({preventScroll:true});
      }
      status('vega.nameRequired');return;
    }
    for(const room of draft.rooms)for(const item of room.devices||[]){
      const controls=item.extra_controls||[];
      if(controls.some(control=>!control.name.trim()||!/^select\.[a-z0-9_]+$/.test(control.entity_id))){status('vega.controlRequired');return;}
      if(new Set(controls.map(control=>control.entity_id)).size!==controls.length){status('vega.duplicate');return;}
      controls.forEach(control=>control.name=control.name.trim());
    }
    const names=draft.rooms.map(r=>r.name.trim().toLocaleLowerCase());if(new Set(names).size!==names.length){status('vega.duplicate');return;}
    const ownership=new Set();
    for(const room of draft.rooms)for(const section of Object.keys(domains))for(const item of room[section]||[]){
      if(ownership.has(item.entity_id)){status('vega.duplicate');return;}
      ownership.add(item.entity_id);
    }
    for(const room of draft.rooms){room.name=room.name.trim();for(const section of Object.keys(domains))for(const d of room[section]||[])d.name=d.name.trim()||label(d.entity_id);}
    const activeRoom=initialRooms[panel.room];
    const activeRoomName=draft.rooms.includes(activeRoom)?activeRoom.name:undefined;
    busy=true;clearTimeout(inactivityTimer);const seq=epoch;status('vega.saving');const disabledBefore=new Map([...shell.querySelectorAll('button,input,select')].map(el=>[el,el.disabled]));disabledBefore.forEach((_,el)=>el.disabled=true);
    try{const result=await panel.saveSharedConfiguration(draft,revision,{signal:controller.signal});if(disposed||seq!==epoch||panel._hass?.user?.id!==owner||panel._panelInfo?.config?.entry_id!==entryID)return;panel.applyConfiguration(result.devices,result.revision,{activeRoomName});busy=false;close();}
    catch(error){if(!disposed&&seq===epoch)status(error?.code==='conflict'?'vega.conflict':error?.code==='timeout'?'vega.saveTimeout':'vega.error');}
    finally{if(!disposed&&seq===epoch){busy=false;disabledBefore.forEach((disabled,el)=>el.disabled=disabled);resetInactivity();}}
  }
  function addEntity(id){
    const room=draft?.rooms[selected];if(!room||!states()[id]||!domains[category].includes(id.split('.')[0]))return;
    room[category]||=[];if(room[category].length>=200)return;
    if(draft.rooms.some(r=>Object.keys(domains).some(section=>(r[section]||[]).some(d=>d.entity_id===id)))){
      status('vega.duplicate');return;
    }
    const resultIndex=root.activeElement?.hasAttribute('data-config-pick')?resultIDs.indexOf(id):-1;
    room[category].push(makeItem(id));addedIDs.push([category,id]);renderResults();renderAdded();
    if(resultIndex>=0){
      const options=shell.querySelectorAll('[data-config-pick]');
      (options[Math.min(resultIndex,options.length-1)]||shell.querySelector('[data-config-category][aria-pressed="true"]'))?.focus({preventScroll:true});
    }
  }
  function clicked(event){
    if(!draft||busy)return;
    if(event.target.hasAttribute?.('data-config-picker-close')){closeChooser();return;}
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-config-picker-close')){closeChooser();return;}
    if(b.hasAttribute('data-config-confirm-message-save')&&chooser?.type==='confirm-message'){
      const item=draft.rooms[selected]?.[category]?.[chooser.index];
      const text=shell.querySelector('[data-config-confirm-text]')?.value.trim()||'';
      if(item)item.confirm_message=text;
      closeChooser();renderSelected();return;
    }
    if(b.hasAttribute('data-config-icon-more')){chooser.limit+=84;renderChooserResults();return;}
    if(b.hasAttribute('data-config-entity-option')){setEntityValue(b.dataset.configEntityOption);return;}
    if(b.hasAttribute('data-icon-choice')){setIconValue(b.dataset.iconChoice);return;}
    if(b.hasAttribute('data-config-palette-filter')){if(chooser?.type==='palette'){chooser.paletteMode=b.dataset.configPaletteFilter;renderChooserResults();}return;}
    if(b.hasAttribute('data-config-palette-choice')){
      if(chooser?.type==='palette'){
        draft.settings.kind_colors||={};draft.settings.kind_colors[chooser.colorKind]=b.dataset.configPaletteChoice;
        closeChooser();paint();
      }return;
    }
    if(b.hasAttribute('data-config-icon-auto')){setIconValue('');return;}
    if(chooser?.type==='area'){
      if(b.hasAttribute('data-config-add-area'))addAreaSelection();
      else if(b.hasAttribute('data-config-area-select-all')||b.hasAttribute('data-config-area-clear-all')){
        setFilteredAreaSelection(shell.querySelector('.vega-picker-layer'),b.hasAttribute('data-config-area-select-all'));
      }else if(b.hasAttribute('data-config-area-more')){
        const firstNew=chooser.limit;
        chooser.limit+=120;
        renderChooserResults();
        shell.querySelectorAll('[data-config-area-entity]')[firstNew]?.focus({preventScroll:true});
      }
      return;
    }
    if(chooser)return;
    if(b.hasAttribute('data-config-category')&&mode==='add-device'&&domains[b.dataset.configCategory]){
      category=b.dataset.configCategory;paint();
      shell.querySelector('[data-config-category][aria-pressed="true"]')?.focus({preventScroll:true});
      return;
    }
    if(b.hasAttribute('data-config-undo-add')){const section=b.dataset.configUndoCategory,id=b.dataset.configUndoAdd;const arr=draft.rooms[selected]?.[section];if(arr){const i=arr.findIndex(item=>item.entity_id===id);if(i>=0)arr.splice(i,1);}addedIDs=addedIDs.filter(([cat,key])=>cat!==section||key!==id);renderResults();renderAdded();return;}
    if(b.hasAttribute('data-config-control-add')){const i=+b.dataset.configControlAdd,d= draft.rooms[selected][category][i];d.extra_controls||=[];if(d.extra_controls.length<12)d.extra_controls.push({name:'',entity_id:''});renderSelected();shell.querySelector('.vega-device-advanced')?.setAttribute('open','');return;}
    if(b.hasAttribute('data-config-control-remove')){const i=+b.dataset.configControlRemove;draft.rooms[selected][category][i].extra_controls.splice(+b.dataset.controlIndex,1);renderSelected();shell.querySelector('.vega-device-advanced')?.setAttribute('open','');return;}
    if(b.hasAttribute('data-config-confirm-edit')){openChooser('confirm-message',b);return;}
    if(b.hasAttribute('data-config-icon-open')){openChooser('icon',b);return;}
    if(b.hasAttribute('data-config-palette-open')){openChooser('palette',b);return;}
    if(b.hasAttribute('data-config-entity-open')){openChooser('entity',b);return;}
    if(b.hasAttribute('data-config-edit-name')){deviceNameOpen=!deviceNameOpen;const field=shell.querySelector('.vega-device-inline-name');field.hidden=!deviceNameOpen;b.setAttribute('aria-expanded',String(deviceNameOpen));if(deviceNameOpen)field.querySelector('input')?.focus({preventScroll:true});else b.focus({preventScroll:true});return;}
    if(b.hasAttribute('data-config-room-edit-name')){setRoomNameOpen(true);return;}
    if(b.hasAttribute('data-config-room-name-done')){setRoomNameOpen(false);return;}
    if(b.hasAttribute('data-config-area-open')){openChooser('area',b);return;}
    if(b.hasAttribute('data-config-move-room')){
      const from=Number(b.dataset.configMoveRoom);
      moveRoom(from,from+Number(b.dataset.direction));
      return;
    }
    if(b.hasAttribute('data-config-close')){close();return;}
    if(b.hasAttribute('data-config-save')){void save();return;}
    if(b.hasAttribute('data-config-room')){
      selected=Number(b.dataset.configRoom);
      roomNameOpen=false;
      paint();focusRoom(selected);return;
    }
    if(b.hasAttribute('data-config-colors')){returnMode=mode;mode='colors';paint();return;}
    if(b.hasAttribute('data-config-back-room')){mode=returnMode;paint();return;}
    if(b.hasAttribute('data-config-add-room')){
      if(mode!=='rooms'||draft.rooms.length>=100)return;
      const baseName=t('vega.newRoom');
      const names=new Set(draft.rooms.map(room=>room.name.trim().toLocaleLowerCase()));
      let name=baseName;
      for(let suffix=2;names.has(name.toLocaleLowerCase());suffix++)name=`${baseName} ${suffix}`;
      draft.rooms.push({name,icon:'mdi:home-outline',devices:[],scenes:[],automations:[],cameras:[]});
      selected=draft.rooms.length-1;roomNameOpen=false;paint();focusRoom(selected);return;
    }
    const room=draft.rooms[selected];if(!room)return;
    if(b.hasAttribute('data-config-delete-room')){
      draft.rooms.splice(selected,1);
      selected=Math.max(0,Math.min(selected,draft.rooms.length-1));
      roomNameOpen=false;paint();
      if(draft.rooms.length)focusRoom(selected);
      else shell.querySelector('[data-config-add-room]')?.focus();
      return;
    }
    if(b.hasAttribute('data-config-pick')){if(mode==='add-device')addEntity(b.dataset.configPick);return;}
    if(b.hasAttribute('data-config-remove')){event.preventDefault();room[category].splice(+b.dataset.configRemove,1);editIndex=-1;paint();}
  }
  function keydown(event){
    if(shell.hidden)return;
    if(chooser){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeChooser();return;}
      if(event.target.hasAttribute?.('data-config-picker-search')&&event.key==='Enter'){
        const first=shell.querySelector('.vega-picker-body [data-config-entity-option]:not([data-config-entity-option=""]),.vega-picker-body [data-icon-choice]');
        if(first){event.preventDefault();first.click();}return;
      }
      if(event.key==='Tab'){
        const layer=shell.querySelector('.vega-picker-layer');
        const elements=[...layer.querySelectorAll('button,input,select')].filter(el=>!el.disabled&&el.getClientRects().length);
        const first=elements[0],last=elements.at(-1);
        if(event.shiftKey&&root.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&root.activeElement===last){event.preventDefault();first?.focus();}
      }
      return;
    }
    if(mode==='rooms'&&!busy){
      if(event.key==='Escape'&&roomNameOpen){
        event.preventDefault();event.stopImmediatePropagation();
        setRoomNameOpen(false);
        return;
      }
      if(event.key==='Enter'&&event.target.hasAttribute?.('data-config-room-name')&&!event.isComposing){
        event.preventDefault();event.stopImmediatePropagation();setRoomNameOpen(false);return;
      }
    }
    if(event.target.hasAttribute?.('data-config-search')&&['ArrowDown','ArrowUp','Enter'].includes(event.key)){
      const items=[...shell.querySelectorAll('[data-config-pick]')];if(!items.length)return;event.preventDefault();event.stopImmediatePropagation();
      if(event.key==='Enter'){if(activeResult>=0)addEntity(items[activeResult].dataset.configPick);return;}
      activeResult=activeResult<0?(event.key==='ArrowDown'?0:items.length-1):(activeResult+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items.forEach((item,i)=>item.setAttribute('aria-selected',String(i===activeResult)));event.target.setAttribute('aria-activedescendant',items[activeResult].id);items[activeResult].scrollIntoView?.({block:'nearest'});return;
    }
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
    if(event.key==='Tab'){const items=[...shell.querySelectorAll('button,input,select,summary')].filter(el=>!el.disabled&&el.getClientRects().length);const first=items[0],last=items.at(-1);if(!items.includes(root.activeElement)||(event.shiftKey&&root.activeElement===first)||(!event.shiftKey&&root.activeElement===last)){event.preventDefault();(event.shiftKey?last:first)?.focus();}}
  }
  void MDI_READY.then(()=>{if(!disposed&&chooser?.type==='icon')renderChooserResults();});
  shell.addEventListener('click',clicked);shell.addEventListener('input',changed);shell.addEventListener('change',changed);
  for(const type of ['pointerdown','keydown','input','change','wheel','touchstart'])shell.addEventListener(type,resetInactivity,{passive:true});
  root.addEventListener('keydown',keydown,{capture:true});
  return {open,close,onLanguageChange(){if(!shell.hidden&&!busy){closeChooser();paint();}},isOpen:()=>!shell.hidden,onHass(){if(!shell.hidden&&(panel._hass?.user?.id!==owner||!panel._hass?.user?.is_admin||panel._panelInfo?.config?.entry_id!==entryID)){busy=false;close();}},destroy(){clearTimeout(inactivityTimer);disposed=true;busy=false;close();root.removeEventListener('keydown',keydown,{capture:true});shell.remove();}};
}
