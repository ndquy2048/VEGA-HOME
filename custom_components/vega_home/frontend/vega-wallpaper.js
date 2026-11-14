/* Browser-owned wallpaper and explicitly opted-in HTTP image sources. */
export function validImageURL(value) {
  if(!value)return true;
  if(typeof value!=='string'||value.length>2048||/[\\\u0000-\u001f]/.test(value)||value.startsWith('//'))return false;
  const sample=value.replace(/\$?\{(width|height|timestamp|random)\}/g,'100');
  if(!/^https?:\/\//i.test(sample)&&!sample.startsWith('/'))return false;
  try{const url=new URL(sample,window.location.href);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password;}catch(_){return false;}
}
export function expandImageURL(template,width,height,nonce) {
  const values={width:Math.max(1,Math.min(2560,Math.round(width)||1280)),height:Math.max(1,Math.min(1600,Math.round(height)||800)),timestamp:nonce,random:nonce};
  return template.replace(/\$?\{(width|height|timestamp|random)\}/g,(_,key)=>String(values[key]));
}
export const randomImageSource=value=>/\$?\{(?:timestamp|random)\}/.test(value||'');
// The helper now contains an entire HA media DIRECTORY, not a single image URL.
export function validMediaFolder(value){
  if(typeof value!=='string'||!value||value.length>1024||/[\\%?#\x00-\x1f]/.test(value))return false;
  const folder=value.startsWith('media-source://media_source/local/')
    ?'/media/local/'+value.slice('media-source://media_source/local/'.length):value;
  if(!folder.startsWith('/media/'))return false;
  const parts=folder.slice('/media/'.length).split('/');
  return parts.length>0&&parts.every(part=>part&&part!=='.'&&part!=='..');
}

const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;
const MAX_WALLPAPER_PIXELS = 2500000;
const MAX_WALLPAPER_EDGE = 2560;

function storedImage(mode, value) {
  return new Promise((resolve,reject)=>{
    let db, tx, settled=false;
    const timer=setTimeout(()=>{
      finish(Error('Image storage timeout'));
      try{tx?.abort();}catch(_){}
    },8000);
    function finish(error,result) {
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      db?.close();
      if(error)reject(error);
      else resolve(result);
    }
    try {
      const open=indexedDB.open('vega-home-vega-images',1);
      open.onupgradeneeded=()=>open.result.createObjectStore('wallpaper');
      open.onerror=()=>finish(open.error||Error('Image storage unavailable'));
      open.onblocked=()=>finish(Error('Image storage blocked'));
      open.onsuccess=()=>{
        db=open.result;
        if(settled){db.close();return;}
        try {
          tx=db.transaction('wallpaper',mode==='get'?'readonly':'readwrite');
          const store=tx.objectStore('wallpaper');
          const request=mode==='get'?store.get('home'):mode==='delete'?store.delete('home'):store.put(value,'home');
          tx.oncomplete=()=>finish(null,request.result);
          tx.onerror=tx.onabort=()=>finish(tx.error||Error('Image storage failed'));
        }catch(error){finish(error);}
      };
    }catch(error){finish(error);}
  });
}

// A photo picker may omit the MIME type or provide a converted file with an old name.
function imageType(bytes) {
  const tag=(offset,length=4)=>String.fromCharCode(...bytes.subarray(offset,offset+length));
  if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'image/jpeg';
  if(bytes[0]===0x89&&tag(1,3)==='PNG')return 'image/png';
  if(tag(0)==='RIFF'&&tag(8)==='WEBP')return 'image/webp';
  if(tag(0,6)==='GIF87a'||tag(0,6)==='GIF89a')return 'image/gif';
  if(tag(0,2)==='BM')return 'image/bmp';
  if(tag(4)!=='ftyp')return '';
  const boxSize=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0);
  const brands=[tag(8)];
  for(let i=16;i+4<=Math.min(boxSize,bytes.length);i+=4)brands.push(tag(i));
  if(brands.some(brand=>brand==='avif'||brand==='avis'))return 'image/avif';
  if(brands.some(brand=>['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'].includes(brand)))return 'image/heic';
  return '';
}

function readPhoto(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    const timer=setTimeout(()=>reader.abort(),20000);
    reader.onload=()=>{clearTimeout(timer);resolve(reader.result);};
    reader.onerror=reader.onabort=()=>{clearTimeout(timer);reject(reader.error||Error('Image read interrupted'));};
    try{reader.readAsArrayBuffer(file);}catch(error){clearTimeout(timer);reject(error);}
  });
}

function decodedImage(url) {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    const timer=setTimeout(()=>finish(Error('Image timeout')),15000);
    function finish(error) {
      clearTimeout(timer);
      img.onload=img.onerror=null;
      if(error)reject(error);
      else resolve(img);
    }
    // On WebKit a usable load event can precede a rejected decode() promise.
    img.onload=()=>finish(img.naturalWidth&&img.naturalHeight?null:Error('Invalid image'));
    img.onerror=()=>finish(Error('Invalid image'));
    img.src=url;
  });
}

function encodeImage(canvas,type) {
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Image encoding timeout')),12000);
    try{canvas.toBlob(blob=>{clearTimeout(timer);resolve(blob?.size?blob:null);},type,.9);}
    catch(error){clearTimeout(timer);reject(error);}
  });
}

async function normalizeImage(image, original) {
  const {naturalWidth:width,naturalHeight:height}=image;
  const ratio=Math.min(1,MAX_WALLPAPER_EDGE/Math.max(width,height),Math.sqrt(MAX_WALLPAPER_PIXELS/(width*height)));
  if(ratio===1&&original.size<=8*1024*1024&&['image/jpeg','image/png','image/webp','image/avif'].includes(original.type))return original;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.floor(width*ratio));
  canvas.height=Math.max(1,Math.floor(height*ratio));
  try{
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    // HEIC is normalized to a widely decodable image before storage.
    const preferred=original.type==='image/heic'||original.type==='image/jpeg'?'image/jpeg':'image/webp';
    const blob=await encodeImage(canvas,preferred)||await encodeImage(canvas,'image/png');
    if(!blob)throw Error('Image encoding failed');
    return blob;
  }finally{canvas.width=canvas.height=0;}
}

export function installVegaWallpaper(panel,settings,save,container) {
  const t=key=>panel.t(key),esc=v=>panel.escape(v);
  let objectURL='',disposed=false,epoch=0,busy=false,sessionOnly=false;
  if(!validImageURL(settings.lockImageURL))settings.lockImageURL='';
  // Migrate existing browser settings without changing the saved image URL.
  const preset='https://picsum.photos/${width}/${height}?random=${timestamp}';
  const inferredSource=!settings.lockImageURL?'wallpaper':settings.lockImageURL===preset?'picsum':'custom';
  if(!['wallpaper','picsum','custom','helper'].includes(settings.lockImageSource))settings.lockImageSource=inferredSource;
  if(typeof settings.lockImageEntity!=='string')settings.lockImageEntity='';
  if(!Number.isFinite(+settings.lockInterval)||+settings.lockInterval<15||+settings.lockInterval>3600)settings.lockInterval=300;
  const holder=document.createElement('div');holder.className='vega-home-wallpaper';container.prepend(holder);
  let customURL=settings.lockImageURL&&settings.lockImageURL!==preset?settings.lockImageURL:'';
  const validHelperID=value=>/^(?:input_text|sensor)\.[a-z0-9_]+$/.test(value);
  function helperURL(){
    const id=settings.lockImageEntity?.trim();
    if(!validHelperID(id))return '';
    const value=panel._hass?.states?.[id]?.state?.trim();
    if(!value||['unavailable','unknown','none'].includes(value.toLowerCase()))return '';
    return validMediaFolder(value)?value:'';
  }
  function updateHelperStatus(){
    const status=holder.querySelector('[data-vega-helper-status]');
    if(!status)return;
    const id=holder.querySelector('[data-vega-lock-entity]')?.value?.trim();
    if(!validHelperID(id)){status.textContent=t('vega.helperInvalid');return;}
    const value=panel._hass?.states?.[id]?.state?.trim()||'';
    status.textContent=value&&validMediaFolder(value)?t('vega.helperCurrent')+' '+value:t('vega.helperUnavailable');
  }
  function sourceVisibility(){
    const source=holder.querySelector('[data-vega-image-source]').value;
    holder.querySelector('[data-vega-url-field]').hidden=source!=='custom';
    holder.querySelector('[data-vega-helper-field]').hidden=source!=='helper';
    holder.querySelector('[data-vega-interval-field]').hidden=source==='wallpaper';
    holder.querySelector('[data-vega-source-help]').textContent=t(source==='wallpaper'?'vega.reuseWallpaper':source==='picsum'?'vega.picsumHint':source==='helper'?'vega.helperHint':'vega.urlHint');
    if(source==='helper')updateHelperStatus();
  }
  function sync({reset=false}={}){
    const first=!holder.firstElementChild;
    if(first)holder.innerHTML=`<section class="vega-settings-card"><h3 data-vega-image-label="vega.wallpaperTitle"></h3><p class="vega-field-hint" data-vega-image-label="vega.wallpaperHint"></p><input type="file" data-vega-image-file accept="image/*" hidden><div class="vega-home-wallpaper-actions"><button type="button" data-vega-upload data-vega-image-label="vega.wallpaperUpload"></button><button type="button" data-vega-remove-image data-vega-image-label="vega.removeImage"></button></div></section>
      <section class="vega-settings-card"><h3 data-vega-image-label="vega.lockTitle"></h3><label><span data-vega-image-label="vega.imageSource"></span><select data-vega-image-source><option value="wallpaper"></option><option value="picsum"></option><option value="custom"></option><option value="helper"></option></select></label><label data-vega-url-field><span data-vega-image-label="vega.lockURL"></span><input data-vega-lock-url spellcheck="false" placeholder="https://example.com/image.jpg"></label><label data-vega-helper-field hidden><span data-vega-image-label="vega.helperEntity"></span><input data-vega-lock-entity list="vega-image-helpers" spellcheck="false" autocomplete="off" placeholder="input_text.wallpanel"><datalist id="vega-image-helpers"></datalist><small class="vega-field-hint" data-vega-helper-status role="status" aria-live="polite"></small></label><p class="vega-field-hint" data-vega-source-help></p><label data-vega-interval-field><span data-vega-image-label="vega.lockInterval"></span><select data-vega-lock-interval></select></label><div class="vega-home-wallpaper-actions"><button type="button" data-vega-apply-images data-vega-image-label="vega.apply"></button></div><p data-vega-image-status role="status" aria-live="polite"></p></section>`;
    for(const el of holder.querySelectorAll('[data-vega-image-label]'))el.textContent=t(el.dataset.vegaImageLabel);
    const source=holder.querySelector('[data-vega-image-source]');for(const option of source.options)option.textContent=t('vega.source.'+option.value);
    const datalist=holder.querySelector('#vega-image-helpers');
    if(datalist){datalist.replaceChildren(...Object.keys(panel._hass?.states||{}).filter(id=>validHelperID(id)).sort().map(id=>{const opt=document.createElement('option');opt.value=id;opt.label=panel._hass.states[id]?.attributes?.friendly_name||id;return opt;}));}
    holder.querySelector('[data-vega-upload]').disabled=busy;
    holder.querySelector('[data-vega-remove-image]').disabled=!objectURL||busy;
    const interval=holder.querySelector('[data-vega-lock-interval]');
    if(first||reset){
      source.value=settings.lockImageSource;
      holder.querySelector('[data-vega-lock-url]').value=settings.lockImageURL||'';
      holder.querySelector('[data-vega-lock-entity]').value=settings.lockImageEntity;
      customURL=settings.lockImageURL&&settings.lockImageURL!==preset?settings.lockImageURL:customURL;
      const times=[...new Set([15,30,60,120,300,600,900,1800,3600,Number(settings.lockInterval)])].sort((a,b)=>a-b);
      interval.innerHTML=times.map(value=>`<option value="${value}">${value} s</option>`).join('');interval.value=String(settings.lockInterval);
    }
    sourceVisibility();
  }
  const notice=key=>{const el=holder.querySelector('[data-vega-image-status]');if(el)el.textContent=key?t(key):'';};
  function apply(){
    rootStyle().setProperty('--v41-wallpaper-image',objectURL?`url(${JSON.stringify(objectURL)})`:'none');
    panel._screensaver?.onImageSourceChange?.();
  }
  const rootStyle=()=>panel.shadowRoot.host.style;
  async function load(){
    const seq=++epoch;
    try{
      const blob=await storedImage('get');
      if(disposed||seq!==epoch||!(blob instanceof Blob))return;
      const url=URL.createObjectURL(blob);
      try{await decodedImage(url);}catch(error){URL.revokeObjectURL(url);throw error;}
      if(disposed||seq!==epoch){URL.revokeObjectURL(url);return;}
      if(objectURL)URL.revokeObjectURL(objectURL);objectURL=url;apply();sync();
    }catch(_){/* A fresh profile does not need persistent image storage. */}
  }
  async function upload(file){
    if(busy||!file)return;
    if(!file.size||file.size>MAX_UPLOAD_BYTES){notice('vega.imageError');return;}
    busy=true;
    const seq=++epoch;
    let url='',type='';
    sync();
    notice('vega.saving');
    try{
      const bytes=await readPhoto(file);
      type=imageType(new Uint8Array(bytes,0,Math.min(128,bytes.byteLength)));
      if(!type)throw Error('Unsupported raster image');
      if(disposed||seq!==epoch)return;
      // Own the bytes independently of the phone's temporary photo provider.
      const original=new Blob([bytes],{type});
      url=URL.createObjectURL(original);
      const image=await decodedImage(url);
      const stored=await normalizeImage(image,original);
      if(stored!==original){
        URL.revokeObjectURL(url);
        url=URL.createObjectURL(stored);
        await decodedImage(url);
      }
      if(disposed||seq!==epoch)return;
      const previous=objectURL;
      objectURL=url;
      url='';
      sessionOnly=true;
      apply();
      if(previous)URL.revokeObjectURL(previous);
      try{
        await storedImage('set',stored);
        if(disposed||seq!==epoch)return;
        sessionOnly=false;
        notice('vega.saved');
      }catch(_){if(!disposed&&seq===epoch)notice('vega.wallpaperSession');}
    }catch(_){
      if(!disposed&&seq===epoch)notice(type==='image/heic'?'vega.wallpaperHeicError':'vega.imageError');
    }finally{
      if(url)URL.revokeObjectURL(url);
      busy=false;
      if(!disposed)sync();
    }
  }
  async function remove(){
    if(busy)return;
    busy=true;
    const seq=++epoch;
    sync();
    try{
      await storedImage('delete');
      if(disposed||seq!==epoch)return;
      if(objectURL)URL.revokeObjectURL(objectURL);
      objectURL='';
      sessionOnly=false;
      apply();
      notice('vega.saved');
    }catch(_){
      if(!disposed&&seq===epoch){
        if(sessionOnly){
          URL.revokeObjectURL(objectURL);
          objectURL='';
          sessionOnly=false;
          apply();
        }
        notice('vega.imageError');
      }
    }finally{busy=false;if(!disposed)sync();}
  }
  function clicked(event){
    const b=event.target.closest('button');if(!b||busy)return;
    if(b.hasAttribute('data-vega-upload'))holder.querySelector('[data-vega-image-file]').click();
    if(b.hasAttribute('data-vega-remove-image'))void remove();
    if(b.hasAttribute('data-vega-apply-images')){
      const mode=holder.querySelector('[data-vega-image-source]').value;
      const rawURL=holder.querySelector('[data-vega-lock-url]').value.trim();
      const entity=holder.querySelector('[data-vega-lock-entity]').value.trim();
      const interval=Number(holder.querySelector('[data-vega-lock-interval]').value);
      if((mode==='custom'&&(!rawURL||!validImageURL(rawURL)))||(mode==='helper'&&!validHelperID(entity))||!Number.isFinite(interval)||interval<15||interval>3600){notice('vega.imageError');return;}
      const previous={lockImageURL:settings.lockImageURL,lockImageSource:settings.lockImageSource,lockImageEntity:settings.lockImageEntity,lockInterval:settings.lockInterval};
      settings.lockImageSource=mode;
      settings.lockImageURL=mode==='wallpaper'?'':mode==='picsum'?preset:mode==='custom'?rawURL:settings.lockImageURL;
      settings.lockImageEntity=entity;settings.lockInterval=interval;
      if(!save()){Object.assign(settings,previous);notice('vega.error');return;}
      panel._screensaver?.onImageSourceChange?.();notice('vega.saved');
    }
  }
  holder.addEventListener('click',clicked);holder.addEventListener('change',event=>{
    const el=event.target;
    if(el.hasAttribute('data-vega-image-file')){
      const file=el.files?.[0];
      el.value='';
      void upload(file);
    }
    if(el.hasAttribute('data-vega-image-source')){
      const input=holder.querySelector('[data-vega-lock-url]');
      if(input.value&&input.value!==preset)customURL=input.value;
      input.value=el.value==='wallpaper'?'':el.value==='picsum'?preset:customURL;
      sourceVisibility();
    }
  });
  holder.addEventListener('input',event=>{
    if(event.target.hasAttribute('data-vega-lock-entity'))updateHelperStatus();
  });
  sync();apply();void load();
  return {sync,apply,source:()=>settings.lockImageSource==='helper'?helperURL():(settings.lockImageSource==='wallpaper'?objectURL:settings.lockImageSource==='picsum'?preset:settings.lockImageURL||objectURL),interval:()=>Number(settings.lockInterval)*1000,
    onHass(){if(holder.querySelector('[data-vega-image-source]')?.value==='helper')updateHelperStatus();},
    sourceMode:()=>settings.lockImageSource,
    destroy(){disposed=true;++epoch;if(objectURL)URL.revokeObjectURL(objectURL);holder.remove();}
  };
}
