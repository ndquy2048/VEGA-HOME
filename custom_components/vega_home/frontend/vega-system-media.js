/* Compact settings rows; entity lists are mounted only in a picker.
 * The shared configuration remains a draft until the existing Save commits it. */
export function installVegaSystemMedia(panel, mount){
  const text=k=>panel.t(k),esc=v=>panel.escape(String(v??''));
  let draft=null,revision='',owner='',busy=false,dirty=false,editing=false,disposed=false,warning='',epoch=0,controller=null;
  let picker='',query='';
  const states=()=>panel._hass?.states||{};
  const name=id=>states()[id]?.attributes?.friendly_name||id;
  const list=type=>Object.keys(states()).filter(id=>type==='screen'?/^(switch|input_boolean)\./.test(id):id.startsWith('media_player.'))
    .sort((a,b)=>name(a).localeCompare(name(b))||a.localeCompare(b));
  const labels={music:'vega.musicPlayer',monitor:'vega.monitoredPlayers',screen:'vega.screenEntity'};
  const entries=type=>type==='monitor'?(draft?.settings?.media_players||[]):
    [draft?.settings?.[type==='music'?'music_assistant_player':'screen_entity']].filter(Boolean);
  function selected(type){
    const items=entries(type);
    if(!items.length)return `<span class="vega-field-hint">${esc(text('vega.none'))}</span>`;
    if(type==='monitor')return `<span>${esc(items.length+' · '+items.slice(0,2).map(name).join(', '))}${items.length>2?' …':''}</span>`;
    return `<span>${esc(name(items[0]))}</span>`;
  }
  function pickerMarkup(){
    if(!picker)return '';
    const type=picker;
    const current=entries(type);
    const q=String(query||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const found=list(type).filter(id=>!(type==='monitor'&&current.includes(id))&&
      (id+' '+name(id)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).slice(0,50);
    const chosen=current.map((id,i)=>`<div class="vega-system-selected-item"><span><strong>${esc(name(id))}</strong><code>${esc(id)}</code></span><div>
      ${type==='monitor'?`<button type="button" data-system-move="${i}" data-direction="-1" ${i===0?'disabled':''} aria-label="${esc(text('vega.moveUp'))}">↑</button><button type="button" data-system-move="${i}" data-direction="1" ${i===current.length-1?'disabled':''} aria-label="${esc(text('vega.moveDown'))}">↓</button>`:''}
      <button type="button" data-system-remove="${esc(type)}" data-index="${i}" aria-label="${esc(text('vega.remove'))}">×</button></div></div>`).join('');
    return `<div class="vega-system-picker-layer" data-system-picker-overlay>
      <section class="vega-system-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="vega-system-picker-title">
        <header class="vega-modal-header"><div><small>VEGA HOME • ${esc(panel.releaseVersion)}</small><strong id="vega-system-picker-title">${esc(text(labels[type]))}</strong></div><button type="button" data-system-picker-close aria-label="${esc(text('popup.close'))}">×</button></header>
        <div class="vega-system-picker-body">
          ${type==='monitor'?`<p class="vega-field-hint">${esc(text('vega.playerPriorityHint'))}</p>`:''}
          <div class="vega-system-selected">${chosen}</div>
          <label class="vega-system-search"><span>${esc(text('vega.searchEntities'))}</span><input type="search" data-system-search="${type}" value="${esc(query)}" autocomplete="off" placeholder="${esc(text('vega.searchPlaceholder'))}" aria-label="${esc(text(labels[type]))}"></label>
          <div class="vega-system-results" role="listbox" aria-label="${esc(text(labels[type]))}" data-system-results="${type}">
            ${found.map(id=>`<button type="button" role="option" data-system-pick="${esc(id)}" data-kind="${type}"><strong>${esc(name(id))}</strong><code>${esc(id)}</code><span>＋</span></button>`).join('')||`<p class="vega-field-hint">${esc(text('vega.noResults'))}</p>`}
          </div>
        </div>
        <footer class="vega-modal-footer"><button type="button" data-system-picker-close>${esc(text('tile.done'))}</button></footer>
      </section></div>`;
  }
  function paint(){
    if(!draft||disposed)return;
    if(!panel._hass?.user?.is_admin){mount.innerHTML=`<p class="vega-field-hint">${esc(text('vega.adminOnly'))}</p>`;return;}
    mount.innerHTML=`<div class="vega-system-media"><h3>${esc(text('vega.integrations'))}</h3><p class="vega-field-hint">${esc(text('vega.optionalIntegrations'))}</p>
      ${['music','monitor','screen'].map(type=>`<button type="button" class="vega-system-row" data-system-picker-open="${type}" aria-haspopup="dialog" aria-label="${esc(text(labels[type]))}"><span class="vega-system-row-name">${esc(text(labels[type]))}</span><span class="vega-system-row-value">${selected(type)}</span><span class="vega-system-row-chevron" aria-hidden="true">›</span></button>`).join('')}
      <p class="vega-system-save-status" data-system-status role="status" aria-live="polite">${esc(warning?text(warning):'')}</p>
      <button type="button" class="vega-system-save" data-system-save ${!dirty||busy?'disabled':''}>${esc(text('vega.save'))}</button></div>${pickerMarkup()}`;
    if(busy)mount.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);
  }
  function focusOpen(){mount.querySelector('[data-system-picker-close]')?.focus({preventScroll:true});}
  function showPicker(type){if(!['music','monitor','screen'].includes(type)||busy)return;picker=type;query='';paint();focusOpen();}
  function closePicker(){if(!picker)return false;const was=picker;picker='';query='';paint();mount.querySelector(`[data-system-picker-open="${was}"]`)?.focus({preventScroll:true});return true;}
  function refreshPicker(){paint();mount.querySelector('[data-system-picker-close]')?.focus({preventScroll:true});}
  function open(){
    if(disposed||!panel._sharedConfig)return;
    ++epoch;controller?.abort();controller=new AbortController();
    draft=structuredClone(panel._sharedConfig);draft.settings||={};
    draft.settings.media_players=panel.monitoredPlayerIDs();
    draft.settings.music_assistant_player||='';draft.settings.screen_entity||='';
    revision=panel._configRevision;owner=panel._hass?.user?.id||'';busy=false;dirty=false;warning='';editing=true;picker='';query='';paint();
  }
  function close(){++epoch;controller?.abort();controller=null;editing=false;draft=null;busy=false;dirty=false;warning='';picker='';query='';mount.innerHTML='';}
  async function save(){
    if(!editing||busy||!dirty||!panel._hass?.user?.is_admin)return;
    if(revision!==panel._configRevision){warning='vega.conflict';paint();return;}
    const seq=epoch;busy=true;warning='vega.saving';paint();
    try{
      const result=await panel.saveSharedConfiguration(draft,revision,{signal:controller.signal});
      if(disposed||!editing||seq!==epoch||panel._hass?.user?.id!==owner)return;
      panel.applyConfiguration(result.devices,result.revision);revision=result.revision;
      draft=structuredClone(result.devices);dirty=false;warning='vega.saved';
    }catch(error){if(!disposed&&editing&&seq===epoch)warning=error?.code==='conflict'?'vega.conflict':error?.code==='timeout'?'vega.saveTimeout':'vega.error';}
    finally{if(!disposed&&editing&&seq===epoch){busy=false;paint();}}
  }
  const clicked=event=>{
    if(!editing||busy||!draft)return;
    if(event.target.matches?.('[data-system-picker-overlay]')){closePicker();return;}
    const button=event.target.closest?.('button');if(!button||!mount.contains(button))return;
    if(button.hasAttribute('data-system-picker-open')){showPicker(button.dataset.systemPickerOpen);return;}
    if(button.hasAttribute('data-system-picker-close')){closePicker();return;}
    if(button.hasAttribute('data-system-pick')){
      const type=button.dataset.kind,id=button.dataset.systemPick;
      if(type!==picker||!list(type).includes(id))return;
      if(type==='music')draft.settings.music_assistant_player=id;
      else if(type==='screen')draft.settings.screen_entity=id;
      else if(!draft.settings.media_players.includes(id)&&draft.settings.media_players.length<100)draft.settings.media_players.push(id);
      dirty=true;warning='';if(type==='monitor')refreshPicker();else closePicker();return;
    }
    if(button.hasAttribute('data-system-remove')){
      const type=button.dataset.systemRemove;if(type!==picker)return;
      if(type==='music')draft.settings.music_assistant_player='';
      else if(type==='screen')draft.settings.screen_entity='';
      else draft.settings.media_players.splice(+button.dataset.index,1);
      dirty=true;warning='';refreshPicker();return;
    }
    if(button.hasAttribute('data-system-move')){
      const items=draft.settings.media_players,i=+button.dataset.systemMove,j=i+(+button.dataset.direction);
      if(picker!=='monitor'||j<0||j>=items.length)return;
      [items[i],items[j]]=[items[j],items[i]];dirty=true;warning='';refreshPicker();return;
    }
    if(button.hasAttribute('data-system-save'))void save();
  };
  const typed=event=>{
    if(!editing||!picker||!event.target.hasAttribute?.('data-system-search'))return;
    query=event.target.value;
    // Only replace the search results; do not lose focus or launch a software keyboard again.
    const resultBox=mount.querySelector(`[data-system-results="${picker}"]`);
    if(resultBox){
      const q=query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
      const current=entries(picker);
      const found=list(picker).filter(id=>!(picker==='monitor'&&current.includes(id))&&
        (id+' '+name(id)).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q)).slice(0,50);
      resultBox.innerHTML=found.map(id=>`<button type="button" role="option" data-system-pick="${esc(id)}" data-kind="${picker}"><strong>${esc(name(id))}</strong><code>${esc(id)}</code><span>＋</span></button>`).join('')||`<p class="vega-field-hint">${esc(text('vega.noResults'))}</p>`;
    }
  };
  mount.addEventListener('click',clicked);mount.addEventListener('input',typed);
  return {open,close,closePicker,pickerOpen:()=>Boolean(picker),onHass(){if(!editing)return;
    if(panel._hass?.user?.id!==owner||!panel._hass?.user?.is_admin){close();return;}
    if(!dirty&&revision!==panel._configRevision)open();
    else if(dirty&&revision!==panel._configRevision){warning='vega.conflict';const status=mount.querySelector('[data-system-status]');if(status)status.textContent=text(warning);}
  },onLanguageChange(){if(editing)paint();},destroy(){disposed=true;close();mount.removeEventListener('click',clicked);mount.removeEventListener('input',typed);}};
}
