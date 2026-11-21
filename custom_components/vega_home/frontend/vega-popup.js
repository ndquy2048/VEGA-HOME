/* VEGA HOME: custom dialogs for lights, fans, climate and simple switches. */
import {fanCapabilities} from './vega-device-model.js?v=v102c1';

// Display labels are localized; service values remain the original HA values.
const LIGHT_COLORS = [
  ['red',0,'#f45158'], ['orange',28,'#ff9c4d'], ['yellow',56,'#f7cc3e'],
  ['green',125,'#4aca8b'], ['blue',215,'#4d98f5'], ['purple',280,'#a47bed']
];
const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const alive = e => !!e && e.state !== 'unavailable' && e.state !== 'unknown';
const colorModes = attrs => Array.isArray(attrs.supported_color_modes) ? attrs.supported_color_modes : [];
function supportsDimming(attrs) {
  const modes=colorModes(attrs);
  return modes.some(mode=>mode!=='onoff'&&mode!=='unknown')||
    (!modes.length&&(Number(attrs.supported_features||0)&1)!==0);
}
// Default climate controls belong to Home Assistant, not Vega's custom labels.
// These keys are from the HA climate entity_component and service translations.
const NATIVE_CLIMATE_CONTROLS = Object.freeze({
  hvac:{attribute:'hvac_mode',values:'hvac_modes',current:'state',label:'component.climate.services.set_hvac_mode.fields.hvac_mode.name',fallback:'HVAC mode'},
  fan:{attribute:'fan_mode',values:'fan_modes',current:'fan_mode',label:'component.climate.entity_component._.state_attributes.fan_mode.name',fallback:'Fan mode'},
  swing:{attribute:'swing_mode',values:'swing_modes',current:'swing_mode',label:'component.climate.entity_component._.state_attributes.swing_mode.name',fallback:'Swing mode'},
  'swing-horizontal':{attribute:'swing_horizontal_mode',values:'swing_horizontal_modes',current:'swing_horizontal_mode',label:'component.climate.entity_component._.state_attributes.swing_horizontal_mode.name',fallback:'Horizontal swing mode'},
  preset:{attribute:'preset_mode',values:'preset_modes',current:'preset_mode',label:'component.climate.entity_component._.state_attributes.preset_mode.name',fallback:'Preset'}
});
const haTranslation = (hass,keys,fallback) => {
  const localize=hass?.localize;
  if(typeof localize!=='function')return fallback;
  for(const key of keys){
    const translation=localize(key);
    if(typeof translation==='string'&&translation.trim()&&translation!==key)return translation;
  }
  return fallback;
};
// Integration-specific custom options can be translated when the HA frontend
// exposes platform and translation metadata. Otherwise show the *raw HA option*;
// never invent Vietnamese/English replacements or mutate the service payload.
const haClimateLabel = (panel,axis,raw,entityID) => {
  const value=String(raw),hass=panel._hass,meta=hass?.entities?.[entityID]||hass?.entityRegistry?.[entityID]||{};
  const native=NATIVE_CLIMATE_CONTROLS[axis];
  if(!native)return value;
  const specific=meta.platform&&meta.translation_key?[
    `component.${meta.platform}.entity.climate.${meta.translation_key}.state_attributes.${native.attribute}.state.${value}`
  ]:[];
  const core=axis==='hvac'?[
    `component.climate.entity_component._.state.${value}`
  ]:[`component.climate.entity_component._.state_attributes.${native.attribute}.state.${value}`];
  return haTranslation(hass,[...specific,...core],value);
};
const haClimateName = (panel,axis) => {
  const info=NATIVE_CLIMATE_CONTROLS[axis];
  return info?haTranslation(panel._hass,[info.label],info.fallback):'';
};

export function installVegaPopup(panel) {
  if (panel._popup) return panel._popup;
  const root = panel.shadowRoot;
  const t = (key, vars) => panel.t(key, vars);
  // All browsers on iOS use WebKit. Include iPads requesting a desktop UA.
  const iosWebKit = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = '/vega_home_static/vega-popup.css?v=v102c1';
  root.append(css);

  const overlay = document.createElement('div');
  overlay.className = 'ap-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="ap-dialog" role="dialog" aria-modal="true" aria-labelledby="ap-title" tabindex="-1">
      <div class="ap-main-content">
      <div class="ap-header">
        <button type="button" class="ap-back" data-action="back-color" hidden aria-label="${escapeHTML(t('popup.back'))}">‹</button>
        <span class="ap-header-light-icon" hidden aria-hidden="true"></span>
        <div class="ap-titles"><strong id="ap-title"></strong><small class="ap-subtitle"></small></div>
        <div class="ap-header-actions"><span class="ap-head-power"></span>
          <button type="button" class="ap-close" aria-label="${escapeHTML(t('popup.close'))}">×</button>
        </div>
      </div>
      <div class="ap-body"></div>
      </div>
    </section>`;
  root.append(overlay);
  const picker=document.createElement('div');picker.className='ap-v41-picker';picker.hidden=true;
  picker.innerHTML=`<div class="ap-v41-picker-card" role="dialog" aria-modal="true"><header><strong></strong><button type="button" data-v41-picker-dismiss aria-label="${escapeHTML(t('popup.close'))}">×</button></header><div class="ap-v41-picker-options"></div></div>`;
  overlay.append(picker);
  const mainContent=overlay.querySelector('.ap-main-content');
  let pickerAxis='',pickerCloseTimer=null,pickerOrigin=null,pickerRAF=0,pickerEpoch=0;
  let pickerSignature='';
  const PICKER_MS=180;
  function pickerOriginFrom(trigger,card){
    const sr=trigger?.getBoundingClientRect?.(),r=card?.getBoundingClientRect?.();
    if(!sr||!r||!r.width||!r.height)return {x:0,y:0,sx:.58,sy:.58};
    return {x:sr.left+sr.width/2-r.left-r.width/2,y:sr.top+sr.height/2-r.top-r.height/2,
      sx:Math.max(.17,Math.min(.9,sr.width/r.width)),sy:Math.max(.17,Math.min(.9,sr.height/r.height))};
  }

  function pickerChoices(axis){
    const native=NATIVE_CLIMATE_CONTROLS[axis];
    if(native)return (entity()?.attributes?.[native.values]||[]).filter(v=>typeof v==='string');
    return (vane(axis)?.attributes?.options||[]).filter(v=>typeof v==='string');
  }
  function openPicker(axis){
    if(kind!=='climate'||!alive(entity())||!(NATIVE_CLIMATE_CONTROLS[axis]||extraControl(axis)))return;
    const options=pickerChoices(axis),label=NATIVE_CLIMATE_CONTROLS[axis]?haClimateName(panel,axis):extraControl(axis)?.name;
    if(!options.length)return;
    pickerAxis=axis;pickerSignature='';paintPicker();
    clearTimeout(pickerCloseTimer);
    cancelAnimationFrame(pickerRAF);const epoch=++pickerEpoch;
    mainContent.classList.add('is-picker-underlay');mainContent.inert=true;
    overlay.querySelector('.ap-dialog').setAttribute('aria-modal','false');
    picker.classList.remove('is-visible');picker.hidden=false;
    const card=picker.querySelector('.ap-v41-picker-card');
    card.setAttribute('aria-label',label);
    pickerOrigin=pickerOriginFrom(picker._sourceButton,card);
    card.style.setProperty('--picker-x',`${pickerOrigin.x}px`);
    card.style.setProperty('--picker-y',`${pickerOrigin.y}px`);
    card.style.setProperty('--picker-sx',String(pickerOrigin.sx));
    card.style.setProperty('--picker-sy',String(pickerOrigin.sy));
    void card.offsetWidth;
    pickerRAF=requestAnimationFrame(()=>{if(!destroyed&&!picker.hidden&&epoch===pickerEpoch){
      picker.classList.add('is-visible');
      (picker.querySelector('.selected')||picker.querySelector('[data-v41-picker-option]'))?.focus();
    }});
  }
  function paintPicker(){
    const axis=pickerAxis;if(!axis)return;
    const options=pickerChoices(axis),label=NATIVE_CLIMATE_CONTROLS[axis]?haClimateName(panel,axis):extraControl(axis)?.name;
    if(!alive(entity())||!options.length){closePicker(true);return;}
    const native=NATIVE_CLIMATE_CONTROLS[axis];
    const selected=native?(native.current==='state'?entity()?.state:entity()?.attributes?.[native.current]):vane(axis)?.state;
    const signature=JSON.stringify([axis,options,selected,panel.language,label]);if(signature===pickerSignature)return;
    pickerSignature=signature;const focused=root.activeElement?.dataset?.v41PickerOption;
    picker.querySelector('header strong').textContent=label;
    picker.querySelector('.ap-v41-picker-card').setAttribute('aria-label',label);
    picker.querySelector('.ap-v41-picker-options').innerHTML=options.map(o=>{
      const text=native?haClimateLabel(panel,axis,o,current.entity_id):o;
      return `<button type="button" data-v41-picker-option="${escapeHTML(o)}" class="${o===selected?'selected':''}"><span>${escapeHTML(text)}</span><span>${o===selected?'✓':''}</span></button>`;
    }).join('');
    if(focused!==undefined)[...picker.querySelectorAll('[data-v41-picker-option]')].find(button=>button.dataset.v41PickerOption===focused)?.focus({preventScroll:true});
  }
  function closePicker(instant=false){
    cancelAnimationFrame(pickerRAF);const epoch=++pickerEpoch;
    picker.classList.remove('is-visible');
    clearTimeout(pickerCloseTimer);
    const finish=()=>{
      if(epoch!==pickerEpoch)return;
      picker.hidden=true;pickerAxis='';pickerSignature='';
      mainContent.classList.remove('is-picker-underlay');mainContent.inert=false;
      overlay.querySelector('.ap-dialog').setAttribute('aria-modal','true');
      if(!instant&&picker._sourceButton?.isConnected)picker._sourceButton.focus();
      picker._sourceButton=null;
    };
    if(instant||picker.hidden){finish();return;}
    pickerCloseTimer=setTimeout(finish,matchMedia('(prefers-reduced-motion: reduce)').matches?0:PICKER_MS);
  }
  function pickerClick(event){
    if(picker.hidden || !picker.classList.contains('is-visible'))return;
    if(event.target===picker||event.target.closest('[data-v41-picker-dismiss]')){event.stopPropagation();closePicker();return;}
    const b=event.target.closest('[data-v41-picker-option]');if(!b)return;
    event.stopPropagation();const axis=pickerAxis,value=b.dataset.v41PickerOption;
    if(!pickerChoices(axis).includes(value)){closePicker();return;}
    closePicker();
    if(axis==='hvac'){
      // A native HA 'off' choice must honor Vega's existing confirm-off safety policy.
      if(value==='off')perform('power','off');
      else void service('climate','set_hvac_mode',{hvac_mode:value});
    }
    else if(axis==='fan')void service('climate','set_fan_mode',{fan_mode:value});
    else if(axis==='swing')void service('climate','set_swing_mode',{swing_mode:value});
    else if(axis==='swing-horizontal')void service('climate','set_swing_horizontal_mode',{swing_horizontal_mode:value});
    else if(axis==='preset')void service('climate','set_preset_mode',{preset_mode:value});
    else{const id=vaneID(axis);if(id&&alive(vane(axis)))void service('select','select_option',{option:value},id);}
  }
  picker.addEventListener('click',pickerClick);
  picker.querySelector('[data-v41-picker-dismiss]').setAttribute('aria-label',t('popup.close'));

  const body = overlay.querySelector('.ap-body');
  const title = overlay.querySelector('#ap-title');
  const subtitle = overlay.querySelector('.ap-subtitle');
  const back = overlay.querySelector('.ap-back');
  const headPower = overlay.querySelector('.ap-head-power');
  const headerLightIcon = overlay.querySelector('.ap-header-light-icon');
  const dialog = overlay.querySelector('.ap-dialog');
  const closeButton = overlay.querySelector('.ap-close');

  function focusDialog(){
    if(mainContent.inert)return;
    const target=binary?body.querySelector('.ap-binary-toggle'):closeButton;
    (target&&!target.disabled?target:dialog).focus({preventScroll:true});
  }

  let current = null;
  let kind = '';
  let binary = false;
  let busy = false;
  let dragging = false;
  let sliderDrag = null;
  let sliderPreview = null; // Local latest-value fence against old service ACK / HA push.
  let destroyed = false;
  let token = 0;
  let lastRendered = '';
  let errorText = '';
  let focusBefore = null;
  let view = 'main'; // Switch view inside one dialog; never stack modal overlays.
  let chosenHS = [0,100];
  let wheelActive = false;
  let optimistic = new Map();
  let optimisticTimer = null;
  let queuedCommand = null;
  let closeTimer = null;

  // Protect user interaction from outdated HA pushes (optimistic UI).
  // Clear an attribute when HA confirms it; otherwise expire after 2.8s.
  function viewEntity() {
    const e=entity();
    if (!e) return e;
    const attrs={...(e.attributes||{})};
    // OFF is not a reset: retain last on-state brightness, color, setpoint, fan.
    if(e.state==='off'){
      const saved=panel.lastDeviceSettings?.(current.entity_id)?.attributes||{};
      for(const [key,value] of Object.entries(saved))if(value!==undefined)attrs[key]=value;
    }
    let state=e.state;
    const now=Date.now();
    for (const [key,item] of optimistic) {
      const actual=key==='state' ? e.state : attrs[key];
      const matches=Array.isArray(actual) && Array.isArray(item.value)
        ? JSON.stringify(actual)===JSON.stringify(item.value)
        : typeof actual==='number' && typeof item.value==='number'
          ? Math.abs(actual-item.value)<=1 : actual===item.value;
      if (matches || item.until<now) {optimistic.delete(key);continue;}
      if (key==='state') state=item.value;
      else attrs[key]=item.value;
    }
    return {...e,state,attributes:attrs};
  }
  function preview(values) {
    const until=Date.now()+2800;
    for (const [key,value] of Object.entries(values)) optimistic.set(key,{value,until});
    clearTimeout(optimisticTimer);
    const serial=token;
    optimisticTimer=setTimeout(() => {
      if(serial!==token || destroyed) return;
      optimistic.clear();lastRendered='';render(true);
    },2900);
    lastRendered='';render(true);
  }
  function paintRange(kind,value){
    const input=body.querySelector(`input[data-range="${kind}"]`);
    if(!input)return;
    const display=String(value);
    if(input.value!==display)input.value=display;
    const output=body.querySelector(`[data-output="${kind}"]`);
    if(output)output.textContent=display+(kind==='kelvin'?' K':'%');
    if(kind==='brightness')input.closest('.ap-brightness-control')?.style.setProperty('--level',`${display}%`);
  }
  function applyRangeFence(){
    if(!sliderPreview)return;
    if(Date.now()>sliderPreview.until){sliderPreview=null;return;}
    const e=viewEntity();
    const actual=sliderPreview.kind==='brightness'
      ?Math.round(Number(e?.attributes?.brightness||0)/255*100)
      :Number(e?.attributes?.[sliderPreview.kind==='fan-percentage'?'percentage':'color_temp_kelvin']);
    // ACK of an earlier 52% cannot replace the user's newer 87% intent.
    if(!sliderDrag && Math.abs(actual-sliderPreview.value)<1){sliderPreview=null;return;}
    paintRange(sliderPreview.kind,sliderPreview.value);
  }

  function previewService(domain,action,data={}) {
    if (domain==='light' && action==='turn_on') {
      if (Number.isFinite(data.brightness_pct)) preview({brightness:Math.round(data.brightness_pct*255/100),state:'on'});
      else if (Number.isFinite(data.color_temp_kelvin)) preview({color_temp_kelvin:data.color_temp_kelvin,state:'on'});
      else if (data.hs_color) preview({hs_color:data.hs_color,state:'on'});
      else if(binary)preview({state:'on'});
    } else if(action==='restore') {
      const last=panel.lastDeviceSettings?.(current?.entity_id);
      preview({state:domain==='climate'?(last?.state||'cool'):'on',...(last?.attributes||{})});
    } else if(domain==='climate' && action==='set_temperature') preview({temperature:data.temperature});
    else if(domain==='fan' && action==='set_percentage') preview({percentage:data.percentage,state:'on'});
    else if(action==='turn_off' || (action==='set_hvac_mode' && data.hvac_mode==='off')) preview({state:'off'});
    else if(action==='turn_on') preview({state:'on'});
    else if(action==='set_hvac_mode') preview({state:data.hvac_mode});
    else if(action==='set_fan_mode') preview({fan_mode:data.fan_mode});
    else if(action==='set_swing_mode') preview({swing_mode:data.swing_mode});
  }


  const entity = () => current ? panel._hass?.states?.[current.entity_id] : undefined;
  const getType = d => {
    const domain = d?.entity_id?.split('.')[0];
    if (domain === 'climate') return 'climate';
    if (domain === 'fan') return 'fan';
    if (domain === 'light') return 'light';
    if (domain === 'switch') return 'switch';
    return null;
  };
  function isPowerOnly(real) {
    if(kind==='switch')return true;
    const attrs=real?.attributes||{};
    const features=Number(attrs.supported_features);
    if(kind==='light'){
      const modes=colorModes(attrs);
      if(supportsDimming(attrs)||attrs.effect_list?.length||(features&4)!==0)return false;
      if(modes.includes('onoff')||(alive(real)&&isNum(attrs.supported_features)&&!modes.length))return true;
    }else if(kind==='fan'){
      // Speed, oscillation, direction and presets are options beyond power.
      if((features&15)!==0||isNum(attrs.percentage)||attrs.preset_modes?.length)return false;
      if(alive(real)&&isNum(attrs.supported_features))return true;
    }
    // Keep the last known layout when capability data is temporarily absent.
    return binary;
  }
  function binaryView(e,available) {
    const on=e?.state==='on';
    return `<button class="ap-binary-toggle device-type-${panel.deviceKind(current)}" type="button"
      role="switch" aria-labelledby="ap-title" aria-checked="${on}" aria-busy="${busy}"
      data-action="power" data-value="${on?'off':'on'}" ${available&&!busy?'':'disabled'}>
      <span class="ap-binary-thumb" aria-hidden="true">${panel.deviceIcon(current)}</span>
    </button>`;
  }
  const extraControl = axis => /^extra-\d+$/.test(axis)?panel.climateControls(current)[Number(axis.slice(6))]:null;
  const vaneID = axis => {
    const value = extraControl(axis)?.entity_id;
    return typeof value === 'string' && /^select\.[a-z0-9_]+$/.test(value) ? value : null;
  };
  const vane = axis => {
    const id = vaneID(axis);
    return id ? panel._hass?.states?.[id] : undefined;
  };
  const stamp = e => e ? JSON.stringify([e.state,e.attributes]) : 'missing';
  const choose = (label,action,value,selected=false,disabled=false,cls='ap-chip') =>
    `<button type="button" class="${cls}${selected ? ' is-selected' : ''}" data-action="${escapeHTML(action)}" data-value="${escapeHTML(value)}" aria-pressed="${selected}" ${disabled ? 'disabled' : ''}>${escapeHTML(label)}</button>`;
  const section = (label,content) => `<div class="ap-section"><h3>${escapeHTML(label)}</h3>${content}</div>`;
  const power = (e, active, subtitleText, pictogram) => `
    <div class="ap-power-row"><span class="ap-device-icon">${panel.deviceIcon(current)}</span>
      <div class="ap-power-copy"><b>${escapeHTML(panel.deviceName(current) || '')}</b><small>${escapeHTML(subtitleText)}</small></div>
      ${choose(t(active ? 'popup.turnOff' : 'popup.turnOn'),'power',active ? 'off' : 'on',active,!alive(e),'ap-power-button')}
    </div>`;

  function fanView(e) {
    const on = e?.state === 'on';
    const attrs = e?.attributes || {};
    const caps=fanCapabilities(entity()),count=caps.count;
    const pct = isNum(attrs.percentage) ? Number(attrs.percentage) : null;
    const speedAvailable = alive(e) && caps.speed;
    const activeIndex = count&&pct !== null && pct > 0 ? clamp(Math.round(pct * count / 100),1,count) : 0;
    const group = count&&count<=8?[0,...caps.percentages].map((value,i) => {
      const selected = i === 0 ? !on : on && i === activeIndex;
      const disabled = !alive(e) || (i > 0 && !speedAvailable);
      const remembered=!on && pct !== null && pct>0 && i>0 && i===activeIndex;
      return `<button type="button" class="ap-speed${selected ? ' is-selected' : ''}${remembered?' is-remembered':''}"
        data-action="fan-speed" data-value="${value}" aria-label="${i ? t('popup.fanLevel',{level:i}) : t('popup.turnOff')}" aria-pressed="${selected}"
        ${disabled ? 'disabled' : ''}><b>${i || '⏻'}</b><small>${i ? t('popup.fanLevel',{level:i}) : t('popup.turnOff')}</small></button>`;
    }).join(''):'';
    const slider=speedAvailable&&!group?`<label class="ap-fan-percentage"><output data-output="fan-percentage">${Math.round(pct||0)}%</output><input type="range" data-range="fan-percentage" aria-label="${escapeHTML(t('popup.fanSpeed'))}" min="0" max="100" step="1" value="${Math.round(pct||0)}"></label>`:'';
    const presets=caps.presets.length?section(t('vega.fanPreset'),`<div class="ap-chips">${caps.presets.map(value=>choose(value,'fan-preset',value,attrs.preset_mode===value,!alive(e))).join('')}</div>`):'';
    return power(e,on,alive(e) ? (on ? `${t('popup.running')}${pct !== null ? ' · '+Math.round(pct)+'%' : ''}` : t('status.off')) : t('status.unavailable'),'fan') +
      section(t('popup.fanSpeed'),`${group?`<div class="ap-speeds">${group}</div>`:slider}
       ${speedAvailable ? '' : `<p class="ap-note">${escapeHTML(t('popup.speedUnsupported'))}</p>`}`)+presets;
  }

  // V4 climate: 4 real select controls, current temperature in central island.
  // Each select is populated from the corresponding HA entity's reported options.
  function climateView(e) {
    const a=e?.attributes||{};
    const temp=isNum(a.temperature)?Number(a.temperature):null;
    const low=isNum(a.min_temp)?Number(a.min_temp):Number(current?.min_temperature??16);
    const high=isNum(a.max_temp)?Number(a.max_temp):Number(current?.max_temperature??31);
    const chooseSelect=(label,attr,items,value,disabled,translator)=>{
      const values=Array.isArray(items)?items.filter(x=>typeof x==='string'):[];
      if(!values.length)return '';
      const good=!disabled&&values.length>0;
      return `<div class="ap-v4-select-card"><span class="ap-v4-select-label">${escapeHTML(label)}</span>
        <button type="button" class="ap-v41-picker-button" data-v41-select="${attr}" ${good?'':'disabled'}
          aria-label="${escapeHTML(label)}" aria-haspopup="dialog" aria-pressed="${good && values.includes(value)}">
          <span>${escapeHTML(values.includes(value)?translator(value):t('status.unavailable'))}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
        </button></div>`;
    };
    const vaneSelect=(axis,label)=>{
      const ve=vane(axis),options=ve?.attributes?.options;
      const values=Array.isArray(options)?options.filter(x=>typeof x==='string'):[];
      const good=alive(e)&&alive(ve)&&values.length>0;
      const last=panel.lastDeviceSettings?.(vaneID(axis))?.state;
      const shown=values.includes(ve?.state)?ve.state:values.includes(last)?last:null;
      return `<div class="ap-v4-select-card"><span class="ap-v4-select-label">${escapeHTML(label)}</span>
        <button type="button" class="ap-v41-picker-button" data-v41-select="${axis}" ${good?'':'disabled'}
          aria-label="${escapeHTML(label)}" aria-haspopup="dialog" aria-pressed="${good && shown!==null}">
          <span>${escapeHTML(shown!==null?shown:t('status.unavailable'))}</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
        </button></div>`;
    };
    return `<div class="ap-v4-climate">
      <div class="ap-v4-temperature">
        <span class="ap-v4-caption">${escapeHTML(t('popup.setTemp'))}</span>
        <strong class="ap-v4-degrees">${temp===null?'—':escapeHTML(Number(temp.toFixed(1)))}°</strong>
        <div class="ap-v4-temp-steps">
          ${choose('−','temp','down',false,!alive(e)||temp===null||temp<=low,'ap-temp-step')}
          ${choose('+','temp','up',false,!alive(e)||temp===null||temp>=high,'ap-temp-step')}
        </div>
        <small class="ap-v4-current-temp">${isNum(a.current_temperature)?escapeHTML(t('popup.roomTemp',{temp:a.current_temperature})):escapeHTML(t('popup.desiredTemp'))}</small>
      </div>
      <div class="ap-v4-select-stack">
        ${chooseSelect(haClimateName(panel,'hvac'),'hvac',a.hvac_modes,e?.state,!alive(e),v=>haClimateLabel(panel,'hvac',v,current.entity_id))}
        ${chooseSelect(haClimateName(panel,'fan'),'fan',a.fan_modes,a.fan_mode,!alive(e),v=>haClimateLabel(panel,'fan',v,current.entity_id))}
        ${chooseSelect(haClimateName(panel,'swing'),'swing',a.swing_modes,a.swing_mode,!alive(e),v=>haClimateLabel(panel,'swing',v,current.entity_id))}
        ${chooseSelect(haClimateName(panel,'swing-horizontal'),'swing-horizontal',a.swing_horizontal_modes,a.swing_horizontal_mode,!alive(e),v=>haClimateLabel(panel,'swing-horizontal',v,current.entity_id))}
        ${chooseSelect(haClimateName(panel,'preset'),'preset',a.preset_modes,a.preset_mode,!alive(e),v=>haClimateLabel(panel,'preset',v,current.entity_id))}
        ${panel.climateControls(current).map((control,i)=>vaneSelect('extra-'+i,control.name)).join('')}
      </div>
    </div>`;
  }

  function lightView(e) {
    const a = e?.attributes || {};
    const modes = colorModes(a);
    const dim = supportsDimming(a);
    const color = modes.some(m => ['hs','xy','rgb','rgbw','rgbww'].includes(m));
    const temp = modes.includes('color_temp') ||
      (modes.includes('rgbww') && isNum(a.min_color_temp_kelvin));
    const kmin = Number(a.min_color_temp_kelvin);
    const kmax = Number(a.max_color_temp_kelvin);
    const tempReady = temp && Number.isFinite(kmin) && Number.isFinite(kmax) && kmax > kmin && kmin > 0;
    const enabled = alive(e);
    const pct = isNum(a.brightness) ? clamp(Math.round(Number(a.brightness) * 100 / 255),1,100) : 100;
    const tempTitle = t('popup.kelvin').split('·')[0].trim();
    const currentKelvin = tempReady && isNum(a.color_temp_kelvin)
      ? clamp(Math.round(Number(a.color_temp_kelvin)),Math.ceil(kmin),Math.floor(kmax))
      : Math.round((kmin+kmax)/2);
    let selection = '';
    if (tempReady) {
      const presets = [
        ['popup.warm',Math.round(kmin),'#ffce67'],
        ['popup.neutral',Math.round((kmin+kmax)/2),'#fff3d7'],
        ['popup.coolLight',Math.round(kmax),'#addbff']
      ];
      selection += `<section class="ap-light-palette-group ap-light-temperature">
        <div class="ap-light-group-heading"><h3>${escapeHTML(tempTitle)}</h3>
          <output data-output="kelvin">${currentKelvin} K</output></div>
        <input class="ap-kelvin-slider" type="range" data-range="kelvin"
          min="${Math.ceil(kmin)}" max="${Math.floor(kmax)}" step="1"
          value="${currentKelvin}" aria-label="${escapeHTML(t('popup.kelvin'))}"
          ${enabled?'':'disabled'}>
        <div class="ap-temp-presets">${presets.map(([key,k,hex]) =>
          `<button type="button" class="ap-temp-preset" data-action="light-kelvin" data-value="${k}"
            title="${escapeHTML(t(key))}" aria-label="${escapeHTML(t(key))}"
            ${enabled?'':'disabled'}><span style="--swatch:${hex}"></span><small>${escapeHTML(t(key))}</small></button>`).join('')}</div>
      </section>`;
    }
    if (color) {
      const hue = Array.isArray(a.hs_color) && isNum(a.hs_color[0]) ? Number(a.hs_color[0]) : null;
      selection += `<section class="ap-light-palette-group ap-light-colors">
        <h3>${escapeHTML(t('popup.colors'))}</h3>
        <div class="ap-light-swatches">${LIGHT_COLORS.map(([label,h,hex]) =>
          `<button type="button" class="ap-light-swatch${hue !== null && Math.abs(hue-h)<8 ? ' is-selected' : ''}"
            style="--swatch:${hex}" data-action="light-color" data-value="${h}"
            title="${escapeHTML(t('color.'+label))}" aria-label="${escapeHTML(t('color.'+label))}"
            ${enabled?'':'disabled'}><span></span></button>`).join('')}</div>
        <button type="button" class="ap-color-more" data-action="open-color"
          aria-label="${escapeHTML(t('popup.customColor'))}" ${enabled?'':'disabled'}>
          <span class="ap-color-more-wheel" aria-hidden="true"></span>
          <span>${escapeHTML(t('popup.customColor'))}</span><b aria-hidden="true">›</b>
        </button>
      </section>`;
    }
    const slider = dim ? `<div class="ap-brightness-control" style="--level:${pct}%">
      <div class="ap-brightness-title"><span>${escapeHTML(t('popup.brightness'))}</span>
        <output data-output="brightness">${pct}%</output></div>
      <div class="ap-brightness-shell">
        <div class="ap-brightness-fill" aria-hidden="true"></div>
        <svg class="ap-brightness-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l-1.42 1.42"/></svg>
        <input id="ap-brightness" class="ap-brightness-slider" type="range" data-range="brightness"
          min="1" max="100" step="1" value="${pct}"
          aria-label="${escapeHTML(t('popup.brightness'))}" ${enabled?'':'disabled'}>
      </div>
    </div>` : '';
    if (!slider && !selection) return `<p class="ap-note">${escapeHTML(t('popup.lightSwitchNote'))}</p>`;
    if(dim && !selection){
      const active=e?.state==='on';
      return `<div class="ap-dimmer-only">${slider}
        <button type="button" class="ap-dimmer-power" data-action="power" data-value="${active?'off':'on'}"
          aria-pressed="${active}" aria-label="${escapeHTML(t(active?'popup.turnOff':'popup.turnOn'))}" ${enabled?'':'disabled'}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 2v9M5.5 5.8a9 9 0 1 0 13 0"/></svg>
        </button></div>`;
    }
    return `<div class="ap-light-layout${!dim ? ' ap-light-no-dimmer' : ''}">
      ${slider}<div class="ap-light-options">${selection}</div></div>`;
  }

  function colorView() {
    const [h,s] = chosenHS;
    const angle = h * Math.PI / 180;
    const x = 50 + Math.sin(angle) * s / 2;
    const y = 50 - Math.cos(angle) * s / 2;
    return `<div class="ap-color-editor">
      <div class="ap-wheel-wrap"><div class="ap-wheel" data-wheel="true" role="slider" tabindex="0"
        aria-label="${escapeHTML(t('popup.customColor'))}" aria-valuemin="0" aria-valuemax="359"
        aria-valuenow="${Math.round(h)}" style="--dot-x:${x}%;--dot-y:${y}%">
        <span class="ap-wheel-marker" style="background:hsl(${h} 100% 50%)"></span>
      </div></div>
      <div class="ap-color-preview-row"><span class="ap-color-preview" style="background:hsl(${h} ${s}% 50%)"></span>
        <small>${escapeHTML(t('popup.colorHint'))}</small></div>
      <div class="ap-color-editor-actions">
        ${choose(t('cancel'),'back-color','',false,false,'ap-chip')}
        ${choose(t('popup.applyColor'),'apply-color','',false,false,'ap-chip ap-apply-color')}
      </div>
    </div>`;
  }

  /*  — DOM patcher. Reuse slider and button nodes instead of
     resetting the popup tree whenever Home Assistant pushes new state. */
  function reconcileNode(existing, next) {
    if (existing.nodeType !== next.nodeType ||
        (existing.nodeType === 1 && existing.tagName !== next.tagName)) {
      existing.replaceWith(next.cloneNode(true));
      return;
    }
    if (existing.nodeType === 3) {
      if (existing.nodeValue !== next.nodeValue) existing.nodeValue = next.nodeValue;
      return;
    }
    if (existing.nodeType !== 1) return;
    // During a brightness gesture (and its pending HA acknowledgement), all
    // three pieces — thumb/input, text and fill — are owned by the local value.
    // Patching the parent style first caused the visible 52→83→52 flash.
    if (existing.matches('.ap-brightness-control') && sliderPreview?.kind==='brightness' &&
        (sliderDrag?.kind==='brightness'||Date.now()<sliderPreview.until))return;
    const oldAttrs = [...existing.attributes];
    for (const attr of oldAttrs) {
      // The rotor controller owns its inline phase and stopped angle.
      if(attr.name==='style'&&existing.matches('.vega-fan-rotor'))continue;
      if (!next.hasAttribute(attr.name)) existing.removeAttribute(attr.name);
    }
    for (const attr of next.attributes) {
      if (existing.getAttribute(attr.name) !== attr.value)
        existing.setAttribute(attr.name, attr.value);
    }
    let left = existing.firstChild;
    for (const fresh of [...next.childNodes]) {
      if (!left) { existing.appendChild(fresh.cloneNode(true)); continue; }
      const old = left;
      left = left.nextSibling;
      reconcileNode(old, fresh);
    }
    while (left) { const old = left; left = left.nextSibling; old.remove(); }
    if (existing.tagName === 'INPUT' && next.hasAttribute('value') &&
        existing.value !== next.getAttribute('value') && !dragging)
      existing.value = next.getAttribute('value');
    if (existing.tagName === 'SELECT' && existing.value !== next.value)
      existing.value = next.value;
  }

  function reconcileHTML(container, html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    let left = container.firstChild;
    for (const fresh of [...template.content.childNodes]) {
      if (!left) { container.appendChild(fresh.cloneNode(true)); continue; }
      const old = left;
      left = left.nextSibling;
      reconcileNode(old, fresh);
    }
    while (left) { const old = left; left = left.nextSibling; old.remove(); }
  }

  function render(force=false) {
    if (destroyed || !current || overlay.hidden || (dragging && !force)) return;
    const real=entity(),e=viewEntity();
    binary=isPowerOnly(real);
    const binaryReady=alive(real)&&(real.state==='on'||real.state==='off');
    const signature = [current.entity_id,kind,view,binary,binaryReady,stamp(e),kind==='climate'?panel.climateControls(current).map((_,i)=>stamp(vane('extra-'+i))).join('|'):'',busy,errorText].join('|');
    if (!force && signature === lastRendered) return;
    lastRendered = signature;
    const isColor = !binary && kind === 'light' && view === 'color';
    title.textContent = isColor ? t('popup.customColor') : (panel.deviceName(current) || current.entity_id);
    subtitle.textContent = binary ? t(!binaryReady?'status.unavailable':busy?'popup.sending':e?.state==='on'?'tile.on':'tile.off') :
      isColor ? t('popup.lightSubtitle') : !alive(e) ? t('status.unavailable') :
      kind==='climate' ? t('popup.acSubtitle') :
      kind==='fan' ? fanCapabilities(real).count?t('popup.fanSubtitle',{count:fanCapabilities(real).count}):t('popup.fanSpeed') :
      kind==='switch' ? t('popup.switchSubtitle') : t('popup.lightSubtitle');
    back.hidden = !isColor;
    const fanState=alive(real)?e?.state:'unavailable';
    panel.syncFanRotor(overlay.querySelector('.vega-fan-rotor'),fanState);
    dialog.dataset.kind = kind;
    dialog.dataset.deviceKind=panel.deviceKind(current);
    const css=panel.devicePaletteStyle(panel.deviceKind(current));
    for(const pair of css.split(';')){const [key,value]=pair.split(':');dialog.style.setProperty(key,value);}

    dialog.dataset.deviceState=alive(real)?e?.state==='off'?'off':'on':'unavailable';
    const attrs=real?.attributes||{};
    const modes=colorModes(attrs);
    const brightnessOnly=!binary&&kind==='light'&&view==='main'&&supportsDimming(attrs)&&
      !modes.some(mode=>['color_temp','hs','xy','rgb','rgbw','rgbww','xy_color'].includes(mode));
    dialog.dataset.layout=binary?'binary':brightnessOnly?'brightness-only':'controls';
    const moveFocus=(binary||brightnessOnly)&&root.activeElement===closeButton;
    closeButton.hidden=binary||brightnessOnly;
    dialog.dataset.fanOn = String(kind === 'fan' && e?.state === 'on');
    dialog.dataset.lightOn = String(kind === 'light' && e?.state === 'on');
    headerLightIcon.hidden = binary || kind !== 'light' || isColor;
    if(!headerLightIcon.hidden)reconcileHTML(headerLightIcon,panel.deviceIcon(current));
    const headerPower = kind === 'climate' || (kind==='light'&&!binary&&!isColor&&!brightnessOnly);
    reconcileHTML(headPower, headerPower
      ? choose(t(e?.state === 'off' ? 'popup.turnOn' : 'popup.turnOff'), 'power',
          e?.state === 'off' ? 'on' : 'off', e?.state !== 'off', !alive(e), 'ap-power-button') : '');
    const top = body.scrollTop;
    const content = binary ? binaryView(e,binaryReady) : isColor ? colorView() :
      kind==='climate' ? climateView(e) : kind==='fan' ? fanView(e) : lightView(e);
    reconcileHTML(body,isColor?content:`${content}${errorText?`<p class="ap-error" role="alert">${escapeHTML(errorText)}</p>`:''}`);
    panel.syncFanRotor(overlay.querySelector('.vega-fan-rotor'),fanState);
    if(moveFocus)focusDialog();
    body.scrollTop = isColor ? 0 : top;
    applyRangeFence();
  }

  function close(immediate=false) {
    panel.clearFanMotion(overlay);
    sliderDrag?.shell?.closest('.ap-brightness-control')?.classList.remove('is-dragging');
    closePicker(true);
    if (overlay.hidden) return;
    overlay.inert=false;
    overlay.classList.remove('ap-visible');
    clearTimeout(closeTimer);
    if(immediate)overlay.hidden=true;
    else closeTimer=setTimeout(() => {if(!overlay.classList.contains('ap-visible')) overlay.hidden=true;},220);
    panel._surface?.close('device');
    clearTimeout(optimisticTimer);optimistic.clear();queuedCommand=null;
    ++token;
    current = null; kind = ''; busy = false; dragging = false; sliderDrag=null;sliderPreview=null; view = 'main'; wheelActive = false;
    errorText = ''; lastRendered = '';
    panel._surface?.restoreFocus(focusBefore);
  }

  async function service(domain,action,data={},id=null) {
    if (destroyed || !current || !panel._hass?.callService) return;
    if (busy) {
      queuedCommand={domain,action,data,id,serial:token};
      previewService(domain,action,data);
      return;
    }
    const entityID = id || current.entity_id;
    const serial = token;
    const shouldClose = !isPowerOnly(entity()) && entityID===current.entity_id &&
      (action==='turn_off'||(domain==='climate'&&action==='set_hvac_mode'&&data.hvac_mode==='off'));
    let succeeded=false;
    busy = true; errorText = '';
    if(action==='turn_off'||(domain==='climate'&&action==='set_hvac_mode'&&data.hvac_mode==='off'))
      panel.rememberDeviceState?.(entityID);
    previewService(domain,action,data);
    try {
      if(action==='restore')await panel.restoreDevice(entityID);
      else await panel._hass.callService(domain,action,{entity_id:entityID,...data});
      if(action!=='restore')panel.noteDeviceCommand?.(entityID,domain,action,data);
      succeeded=true;
    } catch (err) {
      console.error('VEGA Popup:',domain,action,entityID,err);
      if (serial===token) errorText = t('popup.commandError',{action});
    } finally {
      if (!destroyed && serial===token) {
        if(succeeded && shouldClose){close();return;}
        busy = false;
        if(errorText) {optimistic.clear();clearTimeout(optimisticTimer);}
        render(true);
        const next=queuedCommand;queuedCommand=null;
        if(next && next.serial===token) void service(next.domain,next.action,next.data,next.id);
      }
    }
  }

  function perform(action,value) {
    const e = viewEntity();
    if (!alive(e)) return;
    const a = e.attributes || {};
    if (action === 'power') {
      const real=entity();
      if(binary&&(busy||!alive(real)||!['on','off'].includes(real.state)))return;
      const domain = current.entity_id.split('.')[0];
      // Keep the physical safety confirmation even when power-off originates in the popup.
      if (value === 'off' && panel.requiresOffConfirmation(current)) {
        const index=panel.deviceEntries().findIndex(({device})=>device.entity_id===current.entity_id);
        if(binary){
          if(index>=0){
            overlay.inert=true;
            panel.confirmOff(index,body.querySelector('.ap-binary-toggle'));
          }
          return;
        }
        close(true);
        if (index >= 0) panel.confirmOff(index, panel.shadowRoot.querySelector(`[data-device="${index}"]`));
        return;
      }
      if(value==='on')void service(domain,binary?'turn_on':'restore');
      else if(domain==='climate')void service('climate','set_hvac_mode',{hvac_mode:'off'});
      else void service(domain,'turn_off');
    } else if (action === 'fan-speed') {
      const pct=Number(value),caps=fanCapabilities(entity());
      if(!Number.isFinite(pct)||!caps.speed||![0,...caps.percentages].includes(pct))return;
      if(pct===0)void service('fan','turn_off');else void service('fan','set_percentage',{percentage:pct});
    } else if(action==='fan-preset'&&fanCapabilities(entity()).presets.includes(value)){
      void service('fan','set_preset_mode',{preset_mode:value});
    } else if (action === 'hvac' && a.hvac_modes?.includes(value)) {
      void service('climate','set_hvac_mode',{hvac_mode:value});
    } else if (action === 'ac-fan' && a.fan_modes?.includes(value)) {
      void service('climate','set_fan_mode',{fan_mode:value});
    } else if (action === 'swing' && a.swing_modes?.includes(value)) {
      void service('climate','set_swing_mode',{swing_mode:value});
    } else if (action === 'temp' && isNum(a.temperature)) {
      const min = isNum(a.min_temp) ? Number(a.min_temp) : Number(current.min_temperature ?? 16);
      const max = isNum(a.max_temp) ? Number(a.max_temp) : Number(current.max_temperature ?? 31);
      const step = isNum(a.target_temp_step) && Number(a.target_temp_step)>0 ? Number(a.target_temp_step) :
        isNum(current.temperature_step) ? Number(current.temperature_step) : 1;
      const next = clamp(Number((Number(a.temperature)+(value==='up'?1:-1)*step).toFixed(2)),min,max);
      if (next !== Number(a.temperature)) void service('climate','set_temperature',{temperature:next});
    } else if (action === 'light-kelvin') {
      const min = Number(a.min_color_temp_kelvin);
      const max = Number(a.max_color_temp_kelvin);
      const v = Number(value);
      if (Number.isFinite(v) && Number.isFinite(min) && Number.isFinite(max) && v>=min && v<=max)
        void service('light','turn_on',{color_temp_kelvin:v});
    } else if (action === 'light-color' && LIGHT_COLORS.some(([,h])=>h===Number(value))) {
      void service('light','turn_on',{hs_color:[Number(value),100]});
    } else if (action === 'open-color') {
      const hs = a.hs_color;
      chosenHS = Array.isArray(hs) && isNum(hs[0]) && isNum(hs[1])
        ? [clamp(Number(hs[0]),0,359),clamp(Number(hs[1]),0,100)] : [0,100];
      view = 'color';lastRendered='';render(true);
    } else if (action === 'back-color') {
      view = 'main';lastRendered='';render(true);
    } else if (action === 'apply-color' && view === 'color') {
      view = 'main';lastRendered='';
      void service('light','turn_on',{hs_color:chosenHS});
    }
  }

  function click(event) {
    event.stopPropagation();
    if (!picker.hidden)return;
    if(event.target.closest('button[data-v41-select]')){
      const b=event.target.closest('button[data-v41-select]');
      if(!b.disabled){event.stopPropagation();picker._sourceButton=b;openPicker(b.dataset.v41Select);}return;
    }
    if (event.target===overlay || event.target.closest('.ap-close') ||
      (binary&&!event.target.closest('.ap-binary-toggle'))) {close();return;}
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled || !current) return;
    perform(target.dataset.action,target.dataset.value);
  }
  function input(event) {
    const slider=event.target.closest('input[data-range]');
    if(!slider)return;
    const kind=slider.dataset.range,value=Number(slider.value);
    dragging=true;
    sliderPreview={kind,value,until:Date.now()+3500};
    paintRange(kind,value);
  }
  // Pointer coordinates, not the WebKit vertical native range hit target,
  // determine brightness. Moving upward raises brightness; downward lowers it.
  // A single service command is issued at pointer release (keyboard unchanged).
  function brightnessAt(shell,clientY){
    const rect=shell.getBoundingClientRect();
    if(!rect.height)return null;
    return clamp(Math.round((rect.bottom-clientY)/rect.height*99+1),1,100);
  }
  function brightnessPointerDown(event){
    const shell=event.target.closest('.ap-brightness-shell');
    if(!shell||event.button>0||sliderDrag)return;
    const slider=shell.querySelector('input[data-range="brightness"]');
    if(!slider||slider.disabled||!current)return;
    event.preventDefault();event.stopPropagation();
    sliderDrag={kind:'brightness',id:event.pointerId,shell,value:Number(slider.value)};
    dragging=true;
    shell.closest('.ap-brightness-control')?.classList.add('is-dragging');
    const next=brightnessAt(shell,event.clientY);
    if(next!==null){sliderDrag.value=next;sliderPreview={kind:'brightness',value:next,until:Date.now()+3500};paintRange('brightness',next);}
    try{shell.setPointerCapture(event.pointerId);}catch(_){}
  }
  function brightnessPointerMove(event){
    const drag=sliderDrag;
    if(!drag||drag.kind!=='brightness'||drag.id!==event.pointerId)return;
    event.preventDefault();
    const next=brightnessAt(drag.shell,event.clientY);
    if(next!==null&&next!==drag.value){
      drag.value=next;sliderPreview={kind:'brightness',value:next,until:Date.now()+3500};
      paintRange('brightness',next);
    }
  }
  function brightnessPointerEnd(event){
    const drag=sliderDrag;
    if(!drag||drag.kind!=='brightness'||drag.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    if(event.type==='pointerup')brightnessPointerMove(event);
    try{if(drag.shell.hasPointerCapture(event.pointerId))drag.shell.releasePointerCapture(event.pointerId);}catch(_){}
    drag.shell.closest('.ap-brightness-control')?.classList.remove('is-dragging');
    sliderDrag=null;dragging=false;
    if(event.type==='pointercancel'){
      sliderPreview=null;lastRendered='';render(true);return;
    }
    const value=drag.value;
    sliderPreview={kind:'brightness',value,until:Date.now()+3500};paintRange('brightness',value);
    void service('light','turn_on',{brightness_pct:value});
  }
  function rangeDown(event){
    const slider=event.target.closest('input[data-range]');
    if(!slider||slider.disabled||slider.dataset.range==='brightness'||sliderDrag)return;
    sliderDrag={kind:slider.dataset.range,id:event.pointerId};dragging=true;
    try{slider.setPointerCapture(event.pointerId);}catch(_){}
  }
  function rangeUp(event){
    if(!sliderDrag||sliderDrag.kind==='brightness'||sliderDrag.id!==event.pointerId)return;
    sliderDrag=null;dragging=false;
  }
  function rangeCancel(event){
    if(!sliderDrag||sliderDrag.kind==='brightness'||sliderDrag.id!==event.pointerId)return;
    sliderDrag=null;dragging=false;
    if(sliderPreview&&!busy)sliderPreview=null;
  }
  function change(event) {
    const climateSelect=event.target.closest('select[data-climate-select]');
    if(climateSelect&&kind==='climate'){
      const e=entity(),attr=e?.attributes||{};
      const action=climateSelect.dataset.climateSelect,value=climateSelect.value;
      if(action==='hvac'&&attr.hvac_modes?.includes(value))void service('climate','set_hvac_mode',{hvac_mode:value});
      if(action==='fan'&&attr.fan_modes?.includes(value))void service('climate','set_fan_mode',{fan_mode:value});
      return;
    }
    const select = event.target.closest('select[data-vane]');
    if (select && kind==='climate') {
      const axis = select.dataset.vane;
      const id = vaneID(axis);
      const ve = vane(axis);
      const opt = select.value;
      if (id && alive(ve) && Array.isArray(ve.attributes?.options) &&
          ve.attributes.options.includes(opt) && ve.state !== opt) {
        void service('select','select_option',{option:opt},id);
      }
      return;
    }
    const slider = event.target.closest('input[data-range]');
    if (!slider || !current) return;
    dragging=false;
    const v=Number(slider.value),kind=slider.dataset.range;
    sliderPreview={kind,value:v,until:Date.now()+3500};
    paintRange(kind,v);
    if(kind==='brightness')void service('light','turn_on',{brightness_pct:v});
    else if(kind==='kelvin')void service('light','turn_on',{color_temp_kelvin:v});
    else if(kind==='fan-percentage'&&fanCapabilities(entity()).speed&&v>=0&&v<=100){
      const caps=fanCapabilities(entity());
      const level=caps.count?clamp(Math.round(v/caps.step),0,caps.count):null;
      const pct=level===null?Math.round(v):level===0?0:caps.percentages[level-1];
      if(pct===0)void service('fan','turn_off');else void service('fan','set_percentage',{percentage:clamp(pct,1,100)});
    }
  }
  function updateWheel(event) {
    const el = body.querySelector('[data-wheel]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = event.clientX - (r.left+r.width/2);
    const dy = event.clientY - (r.top+r.height/2);
    const radius = Math.max(1,Math.min(r.width,r.height)/2);
    const hue = ((Math.atan2(dx,-dy)*180/Math.PI)+360)%360;
    const saturation = clamp(Math.hypot(dx,dy)/radius*100,0,100);
    chosenHS = [Math.round(hue),Math.round(saturation)];
    el.style.setProperty('--dot-x',(50 + Math.sin(hue*Math.PI/180)*saturation/2)+'%');
    el.style.setProperty('--dot-y',(50 - Math.cos(hue*Math.PI/180)*saturation/2)+'%');
    el.setAttribute('aria-valuenow',String(Math.round(hue)));
    const marker = el.querySelector('.ap-wheel-marker');
    if (marker) marker.style.background = `hsl(${hue} 100% 50%)`;
    const preview = body.querySelector('.ap-color-preview');
    if (preview) preview.style.background = `hsl(${hue} ${saturation}% 50%)`;
  }
  function wheelDown(event) {
    const el = event.target.closest('[data-wheel]');
    if (!el || event.button!==0 || !current || view!=='color') return;
    event.preventDefault();event.stopPropagation();
    wheelActive = true;dragging = true;
    el.setPointerCapture?.(event.pointerId);
    updateWheel(event);
  }
  function wheelMove(event) {
    if (wheelActive) {event.preventDefault();updateWheel(event);}
  }
  function wheelUp() {if(wheelActive){wheelActive=false;dragging=false;}}
  function wheelKey(event) {
    const el = event.target.closest('[data-wheel]');
    if (!el || view!=='color') return;
    let delta = 0;
    if (event.key==='ArrowRight' || event.key==='ArrowUp') delta = 5;
    if (event.key==='ArrowLeft' || event.key==='ArrowDown') delta = -5;
    if (!delta) return;
    event.preventDefault();
    chosenHS[0] = (chosenHS[0] + delta + 360)%360;
    const a=chosenHS[0]*Math.PI/180, sat=chosenHS[1];
    el.style.setProperty('--dot-x', (50+Math.sin(a)*sat/2)+'%');
    el.style.setProperty('--dot-y', (50-Math.cos(a)*sat/2)+'%');
    el.setAttribute('aria-valuenow', String(chosenHS[0]));
    const preview=body.querySelector('.ap-color-preview');
    if (preview)preview.style.background=`hsl(${chosenHS[0]} ${sat}% 50%)`;
  }

  function keydown(event) {
    if(event.defaultPrevented)return;
    if(!overlay.hidden&&!picker.hidden&&event.key==='Tab'){
      const buttons=Array.from(picker.querySelectorAll('button')).filter(button=>!button.disabled);
      const index=buttons.indexOf(root.activeElement);
      if(buttons.length&&(index<0||(event.shiftKey?index===0:index===buttons.length-1))){
        event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();
      }
      return;
    }
    if(!overlay.hidden&&event.key==='Escape'&&!root.getElementById('confirm').hidden){
      event.stopPropagation();
      panel.closeConfirm();
      return;
    }
    if (!overlay.hidden && event.key==='Escape') {event.stopPropagation(); if(!picker.hidden) closePicker(); else close();}
    if(!overlay.hidden&&picker.hidden&&event.key==='Tab'){
      const buttons=[...mainContent.querySelectorAll('button,input,[tabindex="0"]')].filter(button=>!button.disabled&&button.getClientRects().length);
      const index=buttons.indexOf(root.activeElement);
      if(buttons.length&&(index<0||(event.shiftKey?index===0:index===buttons.length-1))){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();}
    }
  }
  overlay.addEventListener('click',click);
  body.addEventListener('input',input);
  body.addEventListener('change',change);
  body.addEventListener('pointerdown',brightnessPointerDown);
  body.addEventListener('pointermove',brightnessPointerMove);
  body.addEventListener('pointerup',brightnessPointerEnd);
  body.addEventListener('pointercancel',brightnessPointerEnd);
  body.addEventListener('pointerdown',rangeDown);
  body.addEventListener('pointerup',rangeUp);
  body.addEventListener('pointercancel',rangeCancel);
  body.addEventListener('pointerdown',wheelDown);
  body.addEventListener('pointermove',wheelMove);
  body.addEventListener('pointerup',wheelUp);
  body.addEventListener('pointercancel',wheelUp);
  body.addEventListener('keydown',wheelKey);
  window.addEventListener('keydown',keydown);

  const api = {
    isOpen() {return !overlay.hidden;},
    open(d, anchor=null) {
      const type=getType(d);
      if (destroyed || !type) return false;
      closePicker(true);
      if(current?.entity_id!==d.entity_id)panel.clearFanMotion(overlay);
      if (overlay.hidden) focusBefore = root.activeElement;
      clearTimeout(closeTimer);clearTimeout(optimisticTimer);optimistic.clear();queuedCommand=null;
      const attributes=panel._hass?.states?.[d.entity_id]?.attributes||{};
      const staticIOSLight=iosWebKit&&type==='light'&&supportsDimming(attributes);
      panel._surface?.open('device',18,{mode:staticIOSLight?'static-ios-light':'glass'});
      current = d; kind = type; binary=false;
      token++; busy=false; dragging=false;sliderDrag=null;sliderPreview=null; view='main';wheelActive=false;lastRendered=''; errorText='';
      title.textContent=panel.deviceName(d) || d.entity_id;
      overlay.hidden=false;
      overlay.classList.remove('ap-visible');
      overlay.querySelector('.ap-dialog').classList.add('v43-prep');
      body.scrollTop=0;
      panel.rememberDeviceState?.(current.entity_id);
      render(true); // Measure final popup only AFTER content and climate selects render.
      const sr=anchor?.getBoundingClientRect?.(),frame=overlay.getBoundingClientRect();
      const naturalW=dialog.offsetWidth,naturalH=dialog.offsetHeight;
      if(sr&&naturalW&&naturalH){
        dialog.style.setProperty('--v43-origin-x',`${sr.left+sr.width/2-frame.left-frame.width/2}px`);
        dialog.style.setProperty('--v43-origin-y',`${sr.top+sr.height/2-frame.top-frame.height/2}px`);
        dialog.style.setProperty('--v43-origin-sx',String(Math.max(.08,Math.min(.9,sr.width/naturalW))));
        dialog.style.setProperty('--v43-origin-sy',String(Math.max(.08,Math.min(.9,sr.height/naturalH))));
      } else {
        dialog.style.setProperty('--v43-origin-x','0px');dialog.style.setProperty('--v43-origin-y','0px');
        dialog.style.setProperty('--v43-origin-sx','.85');dialog.style.setProperty('--v43-origin-sy','.85');
      }
      void getComputedStyle(dialog).transform; // paint the card-size starting frame before expanding
      const serial=token;
      requestAnimationFrame(()=>{if(destroyed||serial!==token||overlay.hidden)return;dialog.classList.remove('v43-prep');requestAnimationFrame(()=>{if(!destroyed&&serial===token&&current&&!overlay.hidden)overlay.classList.add('ap-visible');});});
      focusDialog();
      return true;
    },
    onHass() {render();if(!picker.hidden&&picker.classList.contains('is-visible'))paintPicker();},
    onLanguageChange() {
      closeButton.setAttribute('aria-label',t('popup.close'));
      picker.querySelector('[data-v41-picker-dismiss]').setAttribute('aria-label',t('popup.close'));
      back.setAttribute('aria-label',t('popup.back'));
      if (current) title.textContent=panel.deviceName(current) || current.entity_id;
      render(true);
      if(!picker.hidden) {pickerSignature='';paintPicker();}
    },
    close,
    onConfirmClose() {
      if(overlay.inert){overlay.inert=false;if(!overlay.hidden)focusDialog();}
    },
    confirmPowerOff(device) {
      if(!current||!binary||overlay.hidden||device.entity_id!==current.entity_id)return false;
      void service(current.entity_id.split('.')[0],'turn_off');
      return true;
    },
    destroy() {
      panel.clearFanMotion(overlay);
      closePicker(true);picker.removeEventListener('click',pickerClick);
      destroyed=true;
      panel._surface?.close('device');
      ++token;clearTimeout(optimisticTimer);clearTimeout(closeTimer);
      clearTimeout(pickerCloseTimer);
      overlay.removeEventListener('click',click);
      body.removeEventListener('input',input);
      body.removeEventListener('change',change);
      body.removeEventListener('pointerdown',brightnessPointerDown);
      body.removeEventListener('pointermove',brightnessPointerMove);
      body.removeEventListener('pointerup',brightnessPointerEnd);
      body.removeEventListener('pointercancel',brightnessPointerEnd);
      body.removeEventListener('pointerdown',rangeDown);body.removeEventListener('pointerup',rangeUp);body.removeEventListener('pointercancel',rangeCancel);body.removeEventListener('pointerdown',wheelDown);
      body.removeEventListener('pointermove',wheelMove);
      body.removeEventListener('pointerup',wheelUp);
      body.removeEventListener('pointercancel',wheelUp);
      body.removeEventListener('keydown',wheelKey);
      window.removeEventListener('keydown',keydown);
      overlay.remove();css.remove();
      if (panel._popup===api) panel._popup=null;
    }
  };
  return api;
}
