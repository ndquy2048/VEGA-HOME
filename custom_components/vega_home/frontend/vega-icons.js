import {MDI_CATALOG,MDI_PATHS,MDI_READY as DATA_READY} from './vega-mdi-data.js?v=v201c1';

/* One bundled registry for every room, tile, popup and icon chooser. */
export const MDI_KEYS = new Set(MDI_CATALOG.map(([name])=>`mdi:${name}`));
export const LEGACY_ICONS = {
 'lightbulb.fill':'lightbulb','lightbulb':'lightbulb-outline','lightbulb.led':'led-strip-variant','lightbulb.max':'lightbulb-on',
 'lamp.ceiling':'ceiling-light','lamp.desk':'desk-lamp','lamp.table':'lamp',
 'fan.fill':'fan','fan':'fan','fan.ceiling':'ceiling-fan','air.conditioner.horizontal':'air-conditioner','air.purifier':'air-purifier',
 'homepod.mini.fill':'speaker','homepod.mini.2.fill':'speaker-multiple','tv':'television','macbook.and.ipad':'monitor',
 'poweroutlet.strip':'power-socket-jp','blinds.horizontal.closed':'blinds-horizontal-closed','blinds.vertical.closed':'blinds-vertical-closed',
 'sensor':'motion-sensor','sensor.contact':'door-closed','lock.home':'lock','lock.desktopcomputer':'monitor-lock',
 'printer.filled.and.paper':'printer','printer.filled.and.paper.inverse':'printer','house':'home'
};
export const LEGACY_ROOMS = {sofa:'sofa',bed:'bed-king',utensils:'silverware-fork-knife',laptop:'laptop',door:'door-closed',bath:'bathtub'};
export function normalizeIcon(value,room=false) {
 if(typeof value!=='string')return '';
 if(MDI_KEYS.has(value))return value;
 const key=(room?LEGACY_ROOMS:LEGACY_ICONS)[value];
 return key&&MDI_KEYS.has(`mdi:${key}`)?`mdi:${key}`:'';
}
export const DEVICE_TYPES = [
 ['light','light'],['switch','switch'],['homepod','speaker'],['media','media'],['fan','fan'],['climate','climate'],
 ['blinds','cover'],['computer','computer'],['sensor','sensor'],['lock','lock'],['camera','camera'],['scene','scene'],['automation','automation'],['other','other']
];
export const ICON_GROUPS = ['all','light','switch','speaker','media','fan','climate','cover','sensor','lock','computer','camera','scene','automation','room','other'];
export const KIND_CHOICES = {light:['light'],switch:DEVICE_TYPES.map(([type])=>type),media_player:['homepod','media','computer','other'],fan:['fan'],climate:['climate'],cover:['blinds'],sensor:['sensor','computer','other'],binary_sensor:['sensor','other'],lock:['lock'],camera:['camera'],scene:['scene'],automation:['automation']};
export const DEFAULT_ICONS = {light:'lightbulb',switch:'power-socket-jp',homepod:'speaker',media:'television',fan:'fan',climate:'air-conditioner',blinds:'blinds-horizontal-closed',sensor:'motion-sensor',lock:'lock',computer:'desktop-classic',other:'devices',camera:'cctv',scene:'palette',automation:'robot'};
export function entityKind(device,entity) {
 const domain=(device?.entity_id||'').split('.')[0];
 if(KIND_CHOICES[domain]?.includes(device?.kind))return device.kind;
 if(domain==='switch'&&device?.popup==='light')return 'light';
 if(domain==='media_player')return ['tv','receiver'].includes(entity?.attributes?.device_class)?'media':'homepod';
 return {cover:'blinds',binary_sensor:'sensor'}[domain]||domain||'switch';
}
export function iconGroup([name,group,,tags]) {
 const context=name+' '+tags.join(' ');
 if(/light|lamp|chandelier|sconce|led-strip|candle|spotlight/i.test(name))return 'light';
 if(/fan|propeller/i.test(name))return 'fan';
 if(/speaker|headphone|earbuds|microphone/i.test(name))return 'speaker';
 if(/television|cast|play|pause|music|radio|disc|monitor|projector|video/i.test(name))return 'media';
 if(/air-conditioner|air-filter|air-purifier|thermostat|hvac|heat-pump|radiator/i.test(name))return 'climate';
 if(/blinds|curtain|shutter|window/i.test(name))return 'cover';
 if(/camera|cctv|webcam/i.test(name))return 'camera';
 if(/printer/i.test(name))return 'other';
 if(/desktop|laptop|computer|server|keyboard|mouse|tablet|chip|memory|motherboard/i.test(name))return 'computer';
 if(/lock|shield|key|alarm|security/i.test(name))return 'lock';
 if(/sensor|thermometer|humidity|motion|gauge|meter|smoke|leak|access-point/i.test(context))return 'sensor';
 if(/socket|plug|switch|power|electric/i.test(name))return 'switch';
 if(/palette|creation|star|weather|sun|moon/i.test(name))return 'scene';
 if(/robot|timer|clock|cog|automation/i.test(name))return 'automation';
 return group==='area'||group==='room'?'room':'other';
}
export const DEVICE_ICONS = MDI_CATALOG.map(row=>({key:`mdi:${row[0]}`,name:row[0],group:iconGroup(row),aliases:row[2],tags:row[3]}));
export const DEVICE_ICON_KEYS = MDI_KEYS;
/* Keep the exported Set/array identities stable for all importers and dialogs. */
export const MDI_READY = DATA_READY.then(complete=>{
 if(complete){
  MDI_KEYS.clear();for(const [name] of MDI_CATALOG)MDI_KEYS.add(`mdi:${name}`);
  DEVICE_ICONS.splice(0,DEVICE_ICONS.length,...MDI_CATALOG.map(row=>({key:`mdi:${row[0]}`,name:row[0],group:iconGroup(row),aliases:row[2],tags:row[3]})));
 }
 return complete;
});
const MDI_MASK_CACHE = new Map();
export function mdiIconMarkup(key,{rotor=false}={}) {
 const normalized=normalizeIcon(key);
 if(!normalized)return '';
 const name=normalized.slice(4);
 // Use the bundled SVG path as a local CSS mask. A name is accepted only
 // through the MDI allowlist; no user-supplied URL or markup is inserted.
 const path=MDI_PATHS[name];
 if(typeof path!=='string'||!path)return '';
 let uri=MDI_MASK_CACHE.get(name);
 if(!uri){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
  uri='data:image/svg+xml,'+encodeURIComponent(svg).replace(/'/g,'%27');
  MDI_MASK_CACHE.set(name,uri);
 }
 const glyph=`<span class="vega-device-glyph" data-mdi="${name}" style="--vega-device-svg:url('${uri}')" aria-hidden="true"></span>`;
 return rotor&&name==='fan'?`<span class="vega-fan-rotor" aria-hidden="true">${glyph}</span>`:glyph;
}

/* Named swatches sampled from the user-provided "The Flair Exchange" reference.
   Keeping colors and labels as data (not embedded graphic assets) makes the
   source directly editable and preserves the user's existing color settings. */
export const COLOR_PALETTE = [
 ['#fbdddf','#24333d','Blush',true],
 ['#f9e4df','#24333d','Sand',true],
 ['#ca9293','#24333d','Rose',true],
 ['#e793aa','#24333d','Dark Pink',true],
 ['#f37988','#24333d','Coral',false],
 ['#fa4f9e','#24333d','Hot Pink',false],
 ['#e34f65','#24333d','Azalea',false],
 ['#cb4367','#ffffff','Cerise',false],
 ['#e880b3','#24333d','Raspberry',false],
 ['#7a3d5c','#ffffff','Wine',false],
 ['#aa3059','#ffffff','Cranberry',false],
 ['#f42039','#24333d','Red',false],
 ['#ae342f','#ffffff','Scarlet',false],
 ['#fe612a','#24333d','Orange',false],
 ['#fd841c','#24333d','Tangerine',false],
 ['#ffbb7e','#24333d','Peach',true],
 ['#e5a87c','#24333d','Salmon',true],
 ['#bd954d','#24333d','Antique Gold',true],
 ['#febd01','#24333d','Golden',false],
 ['#fed732','#24333d','Yellow',false],
 ['#fde962','#24333d','Light Yellow',false],
 ['#dff145','#24333d','Limón',false],
 ['#bed901','#24333d','Lime',false],
 ['#c1ccbb','#24333d','Soft Pine',true],
 ['#abb67e','#24333d','Sage',true],
 ['#669934','#24333d','Oasis',false],
 ['#029551','#24333d','Kelly',false],
 ['#37553d','#ffffff','Forest',false],
 ['#888f63','#24333d','Olive',true],
 ['#b5fde5','#24333d','Mint',true],
 ['#019c98','#24333d','Teal',false],
 ['#3ea69b','#24333d','Caribbean Teal',true],
 ['#85ccbe','#24333d','Aqua',true],
 ['#7fa1a2','#24333d','Dusty Blue',true],
 ['#c8ebed','#24333d','Powder',true],
 ['#65d4e7','#24333d','Oxford',true],
 ['#00aed3','#24333d','Turquoise',false],
 ['#0191da','#24333d','Azure',false],
 ['#005fba','#ffffff','Royal',false],
 ['#2795ac','#24333d','Colonial Blue',false],
 ['#333367','#ffffff','Navy',false],
 ['#481526','#ffffff','Dubonnet',false],
 ['#5e396f','#ffffff','Purple',false],
 ['#af92cc','#24333d','Lavender',true],
 ['#77406a','#ffffff','Plum',false],
 ['#edeae1','#24333d','White',false],
 ['#dbcfb7','#24333d','Oatmeal',true],
 ['#f5d193','#24333d','Vanilla',true],
 ['#dcc09b','#24333d','Off White',true],
 ['#ceb0a5','#24333d','Latte',true],
 ['#cdae80','#24333d','Kraft',true],
 ['#623c25','#ffffff','Brown',false],
 ['#e3e4e6','#24333d','Mist',true],
 ['#b8b4b1','#24333d','Gray',true],
 ['#746f75','#ffffff','Charcoal',false],
 ['#171719','#ffffff','Black',false],
 ['#a48745','#24333d','Metallic Gold',true],
 ['#9e6c6b','#24333d','Metallic Rose Gold',true],
 ['#9b9a9f','#24333d','Metallic Silver',true],
 ['#b17145','#24333d','Metallic Bronze',true],
];
// Previously saved device colors must remain valid and render unchanged.
export const LEGACY_COLOR_PALETTE = [
 ['#e5b83f','#ffffff'],
 ['#c9d8e4','#3d627a'],
 ['#b9dcd6','#2e6e62'],
 ['#d4c9e4','#67527e'],
 ['#d9d3c4','#6f604d'],
 ['#d8d5c7','#665f45'],
 ['#c8dccc','#416a4a'],
 ['#c9d7da','#466f75'],
 ['#ddd0dd','#725875'],
 ['#d5cad0','#775466'],
 ['#cfddc5','#527047'],
 ['#d9cfb9','#76623f'],
 ['#c9d0e5','#4c638b'],
 ['#d3d8d8','#54656a'],
 ['#e2cebc','#855f42'],
 ['#bad6e0','#3e7384'],
];
export const DEFAULT_KIND_COLORS = Object.freeze({
 light:'#e5b83f',switch:'#c9d8e4',homepod:'#d4c9e4',media:'#d4c9e4',
 fan:'#b9dcd6',climate:'#bad6e0',blinds:'#d8d5c7',computer:'#c9d0e5',
 sensor:'#d3d8d8',lock:'#c8dccc',camera:'#c9d7da',
 scene:'#ddd0dd',automation:'#d5cad0',other:'#d3d8d8'
});
export const PALETTE_KINDS = DEVICE_TYPES.map(([kind])=>kind);
export function kindPalette(kind,colors={}) {
 const selected=typeof colors?.[kind]==='string'?colors[kind]:'';
 const color=[...COLOR_PALETTE,...LEGACY_COLOR_PALETTE].find(([bg])=>bg===selected)?.[0]||DEFAULT_KIND_COLORS[kind]||'#d3d8d8';
 // The selected group color is shared by OFF glyph and ON circle.
 // ON glyph stays pure white regardless of palette swatch brightness.
 return {background:color,foreground:'#ffffff'};
}
export function paletteStyle(kind,colors={}) {
 const {background}=kindPalette(kind,colors);
 // Speaker is intentionally without a circular badge in either state.
 // OFF is white; ON is the chosen group color. All other kinds use
 // dark-circle/colored-OFF and colored-circle/white-ON semantics.
 if(kind==='homepod')return `--vega-symbol-bg:transparent;--vega-glyph-off:#ffffff;--vega-circle-on:transparent;--vega-glyph-on:${background}`;
 return `--vega-glyph-off:${background};--vega-circle-on:${background};--vega-glyph-on:#ffffff`;
}
