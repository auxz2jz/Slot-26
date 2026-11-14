/**
 * Best-effort WebRTC data meter for Relay One.
 * Counts RTP and RTCDataChannel payload bytes reported by getStats().
 * It cannot include signaling, ICE/STUN/TURN framing, UDP/IP overhead, or other app data.
 * A browser may omit some reports. Never describe totals as exact carrier billing usage.
 */
export const USAGE_KEY='relay-one.estimated-webrtc.v1';
const validBytes=n=>typeof n==='number' && Number.isFinite(n) && n>=0 ? n : null;
const roundPair=pair=>({rx:Math.max(0,Math.floor(pair?.rx||0)),tx:Math.max(0,Math.floor(pair?.tx||0))});
export function formatDataBytes(n){
  if(!Number.isFinite(n)||n<=0)return '0 B';
  const units=['B','KiB','MiB','GiB','TiB'];
  let v=n,i=0;
  while(v>=1024 && i<units.length-1){v/=1024;i++;}
  return (i===0?String(Math.round(v)):v>=100?v.toFixed(0):v>=10?v.toFixed(1):v.toFixed(2))+' '+units[i];
}
export function summarizeStats(report){
  const values=report?.values?.();
  if(!values)return new Map();
  const stats=new Map();
  for(const item of values){
    if(!item || typeof item.id!=='string')continue;
    const type=item.type;
    if(type==='inbound-rtp' || type==='outbound-rtp'){
      // Relay One sends audio only. Guard anyway if a browser reports video tracks.
      if(item.kind && item.kind!=='audio')continue;
      if(item.mediaType && item.mediaType!=='audio')continue;
      const v=validBytes(type==='inbound-rtp'?item.bytesReceived:item.bytesSent);
      if(v!==null)stats.set(item.id+'|'+type,{direction:type==='inbound-rtp'?'rx':'tx',value:v});
    }else if(type==='data-channel'){
      const rx=validBytes(item.bytesReceived),tx=validBytes(item.bytesSent);
      if(rx!==null)stats.set(item.id+'|data-rx',{direction:'rx',value:rx});
      if(tx!==null)stats.set(item.id+'|data-tx',{direction:'tx',value:tx});
    }
  }
  return stats;
}
export class WebRTCUsageMeter{
  constructor(storage=null,now=()=>Date.now()){
    this.storage=storage;this.now=now;this.session={rx:0,tx:0};
    this.saved={rx:0,tx:0};this.lastRate={rx:0,tx:0};
    this.tracked=new WeakMap();this.sampling=false;this.lastSample=this.now();
    try{
      const data=JSON.parse(storage?.getItem(USAGE_KEY)||'null');
      if(data && Number.isFinite(data.rx) && Number.isFinite(data.tx) && data.rx>=0 && data.tx>=0)this.saved=roundPair(data);
    }catch{}
  }
  persist(){try{this.storage?.setItem(USAGE_KEY,JSON.stringify(roundPair(this.saved)));}catch{}}
  record(pc,report){
    if(!pc)return {rx:0,tx:0};
    const stats=summarizeStats(report);
    const previous=this.tracked.get(pc)||new Map();
    const change={rx:0,tx:0};
    for(const [key,current] of stats){
      const prior=previous.get(key);
      // A new WebRTC report starts from zero. A counter reset starts a new epoch.
      const delta=prior===undefined || current.value<prior?current.value:current.value-prior;
      change[current.direction]+=delta;
      previous.set(key,current.value);
    }
    this.tracked.set(pc,previous);
    this.session.rx+=change.rx;this.session.tx+=change.tx;
    this.saved.rx+=change.rx;this.saved.tx+=change.tx;
    return change;
  }
  async sample(peerConnections){
    if(this.sampling)return null;
    this.sampling=true;
    const changed={rx:0,tx:0};
    try{
      const peers=[...new Set(peerConnections||[])].filter(pc=>pc && typeof pc.getStats==='function');
      // Avoid blocking the UI if one remote peer is slow to resolve a report.
      const samples=await Promise.allSettled(peers.map(pc=>pc.getStats()));
      for(let i=0;i<peers.length;i++){
        if(samples[i].status!=='fulfilled')continue;
        const delta=this.record(peers[i],samples[i].value);
        changed.rx+=delta.rx;changed.tx+=delta.tx;
      }
      const time=this.now();
      const seconds=Math.max(.1,(time-this.lastSample)/1000);
      this.lastRate={rx:changed.rx*8/seconds/1000,tx:changed.tx*8/seconds/1000};
      this.lastSample=time;
      if(changed.rx||changed.tx)this.persist();
      return changed;
    }finally{this.sampling=false;}
  }
  resetSaved(){this.saved={rx:0,tx:0};this.persist();}
  snapshot(){
    return {session:roundPair(this.session),saved:roundPair(this.saved),
      kbps:{rx:this.lastRate.rx,tx:this.lastRate.tx}};
  }
}