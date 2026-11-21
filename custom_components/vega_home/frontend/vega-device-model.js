/* HA capability data remains the authority; no fixed five-speed fan model. */
export function fanCapabilities(entity) {
 const a=entity?.attributes||{},features=Number(a.supported_features);
 const speed=Number.isFinite(features)?Boolean(features&1):Number.isFinite(a.percentage);
 const step=Number(a.percentage_step);
 const count=speed&&step>0&&step<=100?Math.max(1,Math.min(100,Math.round(100/step))):null;
 // HA's discrete speed helpers use truncated percentages. Rounding 66.66 to
 // 67 can select speed 3 on a three-speed integration that uses ceil to decode.
 const percentages=count?Array.from({length:count},(_,i)=>Math.floor((i+1)*100/count)):[];
 const presets=(Array.isArray(a.preset_modes)?a.preset_modes:[]).filter(v=>typeof v==='string');
 return {speed,step:count?100/count:1,count,percentages,presets};
}
export function climateControls(device,t=key=>key) {
 if(Array.isArray(device?.extra_controls))return device.extra_controls;
 return Object.entries(device?.vanes||{}).filter(([,id])=>/^select\.[a-z0-9_]+$/.test(id))
   .map(([axis,entity_id])=>({name:t(axis==='horizontal'?'popup.horizontal':'popup.vertical'),entity_id}));
}
export function monitoredPlayers(config) {
 if(Array.isArray(config?.settings?.media_players))return [...new Set(config.settings.media_players)];
 return [...new Set([config?.settings?.music_assistant_player,...(config?.rooms||[]).flatMap(r=>(r.devices||[]).map(d=>d.entity_id))]
   .filter(id=>typeof id==='string'&&id.startsWith('media_player.')))];
}
// The same domain map drives manual addition, area filters and draft validation.
export const ROOM_ENTITY_DOMAINS={
  devices:['light','switch','fan','climate','media_player','cover','lock','sensor','binary_sensor'],
  scenes:['scene'],
  cameras:['camera'],
  automations:['automation']
};

const roomSectionByDomain=new Map(Object.entries(ROOM_ENTITY_DOMAINS)
  .flatMap(([section,domains])=>domains.map(domain=>[domain,section])));

export function roomAreaEntities(areaID,registry,devices,states) {
  if(!areaID)return [];
  const entities=[];
  for(const [id,entry] of registry){
    const domain=id.split('.')[0];
    const section=roomSectionByDomain.get(domain);
    const assignedArea=entry.area_id??devices.get(entry.device_id)?.area_id;
    if(section&&assignedArea===areaID&&!entry.disabled_by&&states[id])
      entities.push({id,domain,section});
  }
  return entities;
}
