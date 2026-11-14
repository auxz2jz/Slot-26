import {
  MAX_PEOPLE, PALETTE, validRoom, newRoom, cleanName, cleanTitle, cleanColor,
  roomLink, leaderId, guestId, validGuestId, validMemberId, normalizeChannels,
  validPin, deriveProtectedRoomId
} from './room-utils.mjs';

const $ = id => document.getElementById(id);
const ui = {
  list:$('channelList'), name:$('displayName'), colors:$('colors'),
  newName:$('newChannel'), create:$('createChannel'), requirePin:$('requirePin'),
  newPin:$('newPin'), newPinBox:$('newPinBox'),
  txTone:$('txTone'), rxTone:$('rxTone'), alertTone:$('alertTone'),
  message:$('channelMessage'), error:$('errorMessage'), count:$('joinCount'),
  restore:$('restoreChannels'), monitorAll:$('monitorAll'), muteAll:$('muteAll'), enableSpeakers:$('enableSpeakers'),
  quick:$('quickTalk'), quickText:$('quickText'), focusTitle:$('focusTitle'),
  focusStatus:$('focusStatus'), focusSpeaker:$('focusSpeaker'), focusHint:$('focusHint'),
  audio:$('remoteAudio')
};
const PROFILE_KEY='relay-one.profile.v4';
const CHANNEL_KEY='relay-one.channels.v4';
const MONITOR_KEY='relay-one.monitor.v5';
const ACTIVE_KEY='relay-one.joined.v5';
const MAX_ACTIVE=5, PING_EVERY=5000, STALE_AFTER=40000, PENDING_AFTER=10000;
const storeGet=(key,defaultValue)=>{try{return JSON.parse(localStorage.getItem(key))??defaultValue;}catch{return defaultValue;}};
const storeSet=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const rawProfile=storeGet(PROFILE_KEY,{});
const profile={
  name:cleanName(rawProfile?.name),
  color:cleanColor(rawProfile?.color),
  txTone:rawProfile?.txTone===true,
  rxTone:rawProfile?.rxTone!==false,
  alertTone:rawProfile?.alertTone!==false
};
let channels=normalizeChannels(storeGet(CHANNEL_KEY,[]));
const monitorPrefs=storeGet(MONITOR_KEY,{});
const desiredJoined=new Set(storeGet(ACTIVE_KEY,[]).filter(id=>validRoom(id)));
const pinCache=new Map(); // Volatile only: never persisted to localStorage or links.
const sessions=new Map(); // public channel ID -> independent ChannelSession
const rows=new Map();
let focusedId=null, selectedTx=null, microphone=null, micPromise=null, alertContext=null;
let joinInProgress=0;
const makeCtx=()=>{if(!alertContext){const C=window.AudioContext||window.webkitAudioContext;if(C)alertContext=new C();}return alertContext;};
function unlockSound(){try{const ctx=makeCtx();if(ctx?.state==='suspended')void ctx.resume().catch(()=>{});}catch{}}
function playTone(kind){
  try{
    unlockSound();
    const ctx=alertContext;
    if(!ctx || ctx.state!=='running')return;
    const start=ctx.currentTime+0.02;
    const bursts=kind==='call'?[{at:0,len:0.24,hz:960},{at:.32,len:.24,hz:960}]:[{at:0,len:.18,hz:880}];
    for(const b of bursts){
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=kind==='call'?'sine':'square';
      osc.frequency.setValueAtTime(b.hz,start+b.at);
      if(kind==='squawk')osc.frequency.exponentialRampToValueAtTime(530,start+b.at+b.len);
      gain.gain.setValueAtTime(.001,start+b.at);
      gain.gain.linearRampToValueAtTime(.11,start+b.at+.018);
      gain.gain.setValueAtTime(.11,start+b.at+b.len-.04);
      gain.gain.exponentialRampToValueAtTime(.001,start+b.at+b.len);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(start+b.at);osc.stop(start+b.at+b.len+.01);
    }
  }catch(err){console.warn('Sound playback unavailable',err);}
}
function saveChannels(){storeSet(CHANNEL_KEY,channels);}
function persistDesired(){storeSet(ACTIVE_KEY,[...desiredJoined]);}
function persistMonitors(){storeSet(MONITOR_KEY,monitorPrefs);}
function reportError(message){ui.error.textContent=message;ui.error.classList.remove('hidden');}
function clearError(){ui.error.textContent='';ui.error.classList.add('hidden');}
function setMessage(text){ui.message.textContent=text;}
function storedRoom(id){return channels.find(c=>c.id===id);}
function invite(c){return roomLink(location.href,c.id,c.title,c.secure===true);}
async function copyInvite(c){
  try{await navigator.clipboard.writeText(invite(c));setMessage('Link copied for '+c.title+'. You can reuse it any time. Share the PIN separately.');}
  catch{window.prompt('Copy this link for '+c.title+':',invite(c));}
}
function getProfile(){profile.name=cleanName(ui.name.value);ui.name.value=profile.name;storeSet(PROFILE_KEY,profile);}
function rememberRoom(id,title,secure=false){
  const existing=storedRoom(id);
  if(existing){if(secure && !existing.secure){existing.secure=true;saveChannels();}return existing;}
  const item={id,title:cleanTitle(title),secure:secure===true};
  channels.unshift(item);channels=channels.slice(0,30);saveChannels();return item;
}
function monitorValue(id){return monitorPrefs[id]!==false;}
function setMonitor(id,enabled){
  monitorPrefs[id]=!!enabled;persistMonitors();
  sessions.get(id)?.setMonitor(enabled);
  updateRow(id);updateQuick();
}
function storeProfile(){storeSet(PROFILE_KEY,profile);}
function drawColors(){
  ui.colors.replaceChildren();
  for(const color of PALETTE){
    const b=document.createElement('button');b.type='button';b.className='color-choice'+(profile.color===color?' selected':'');
    b.style.setProperty('--swatch',color);b.setAttribute('aria-label','Profile color '+color);
    b.setAttribute('aria-pressed',String(profile.color===color));
    b.addEventListener('click',()=>{profile.color=color;storeProfile();drawColors();for(const s of sessions.values())s.sendHello();});
    ui.colors.appendChild(b);
  }
}
ui.name.value=profile.name;
ui.name.addEventListener('change',()=>{getProfile();for(const s of sessions.values())s.sendHello();});
ui.txTone.checked=profile.txTone;ui.rxTone.checked=profile.rxTone;ui.alertTone.checked=profile.alertTone;
ui.txTone.addEventListener('change',()=>{profile.txTone=ui.txTone.checked;storeProfile();});
ui.rxTone.addEventListener('change',()=>{profile.rxTone=ui.rxTone.checked;storeProfile();});
ui.alertTone.addEventListener('change',()=>{profile.alertTone=ui.alertTone.checked;storeProfile();});
ui.requirePin.addEventListener('change',()=>ui.newPinBox.classList.toggle('hidden',!ui.requirePin.checked));
ui.create.addEventListener('click',()=>{
  const name=cleanTitle(ui.newName.value||'New channel'),secure=ui.requirePin.checked,pin=ui.newPin.value.trim();
  if(secure && !validPin(pin)){setMessage('Enter a numeric PIN with 4–12 digits.');return;}
  const c=rememberRoom(newRoom(),name,secure);
  if(secure)pinCache.set(c.id,pin);
  ui.newName.value='';ui.newPin.value='';ui.requirePin.checked=false;ui.newPinBox.classList.add('hidden');
  drawRows();setMessage('Created '+name+'. Copy its reusable Link once, then Join when you want it active.');
});
ui.newName.addEventListener('keydown',e=>{if(e.key==='Enter')ui.create.click();});
const query=new URLSearchParams(location.search);
if(query.has('room')){
  const id=query.get('room');
  if(validRoom(id)){const room=rememberRoom(id,query.get('channel')||'Shared channel',query.get('secure')==='1');setMessage('Saved invitation for '+room.title+'. Tap Join here; its link can be reused.');}
  else reportError('Invalid channel invitation.');
}
// Clean shared URLs so accidentally copying the address bar does not expose a stale invite.
if(query.has('room'))history.replaceState(null,'',location.pathname);

async function ensureMicrophone(){
  if(microphone && microphone.getAudioTracks()[0]?.readyState==='live')return microphone;
  if(micPromise)return micPromise;
  micPromise=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false})
    .then(stream=>{
      const source=stream.getAudioTracks()[0];
      if(!source || typeof source.clone!=='function'){stream.getTracks().forEach(x=>x.stop());throw Error('This browser cannot create separate microphone tracks. No channels were connected.');}
      source.enabled=false;
      source.onended=()=>{reportError('Microphone permission or device was lost. Leave and rejoin channels to restore it.');leaveAll();};
      microphone=stream;
      return stream;
    }).finally(()=>{micPromise=null;});
  return micPromise;
}
function releaseMicrophoneIfUnused(){
  if(sessions.size || micPromise)return;
  try{microphone?.getTracks().forEach(t=>t.stop());}catch{}
  microphone=null;
}
function leaveAll(){for(const s of [...sessions.values()])leaveChannel(s.publicId);}
async function joinChannel(c){
  if(!c || sessions.has(c.id))return;
  if(sessions.size+joinInProgress>=MAX_ACTIVE){setMessage('Limit: '+MAX_ACTIVE+' simultaneous joined channels on this browser.');return;}
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof window.Peer!=='function'){
    reportError('This radio requires HTTPS, microphone permission, and PeerJS connectivity.');return;
  }
  let pin=null,roomId=c.id;
  if(c.secure){
    pin=pinCache.get(c.id);
    if(!pin){
      pin=window.prompt('Enter the 4–12 digit PIN for '+c.title+'.');
      if(pin===null)return;
      pin=pin.trim();
      if(!validPin(pin)){setMessage('Incorrect PIN format: 4–12 digits are required.');return;}
    }
  }
  unlockSound();getProfile();clearError();joinInProgress++;setMessage('Joining '+c.title+'…');
  try{
    if(c.secure){roomId=await deriveProtectedRoomId(c.id,pin);pinCache.set(c.id,pin);}
    if(sessions.has(c.id))return;
    const mic=await ensureMicrophone();
    if(sessions.size>=MAX_ACTIVE)return;
    const source=mic.getAudioTracks()[0];
    const track=source.clone();track.enabled=false;
    // Every channel gets its own track and stream. Other channel tracks remain disabled.
    const stream=new MediaStream([track]);
    const session=new ChannelSession(c,roomId,track,stream,monitorValue(c.id));
    sessions.set(c.id,session);
    desiredJoined.add(c.id);persistDesired();
    if(!focusedId)focusedId=c.id;
    session.start();
    setMessage('Joined '+c.title+'. Keep this page open while using the radio.');
    updateAll();
  }catch(err){reportError(err?.message||'Cannot start the channel.');setMessage('Unable to join '+c.title);}
  finally{joinInProgress--;releaseMicrophoneIfUnused();}
}
function leaveChannel(id){
  const s=sessions.get(id);
  if(!s)return;
  if(selectedTx===s)releaseTalk(s);
  s.stop();sessions.delete(id);desiredJoined.delete(id);persistDesired();
  if(focusedId===id)focusedId=sessions.keys().next().value||null;
  releaseMicrophoneIfUnused();updateAll();
}
async function restoreJoined(){
  const ids=[...desiredJoined].filter(id=>storedRoom(id)).slice(0,MAX_ACTIVE);
  if(!ids.length){setMessage('No previous joined channels are saved. Join the groups you want first.');return;}
  for(const id of ids){const c=storedRoom(id);if(c)await joinChannel(c);}
}
ui.restore.addEventListener('click',restoreJoined);
ui.monitorAll.addEventListener('click',()=>{for(const c of channels)setMonitor(c.id,true);setMessage('Monitoring enabled on every saved channel you have joined.');});
ui.muteAll.addEventListener('click',()=>{for(const c of channels)setMonitor(c.id,false);setMessage('All channels locally muted. You can still transmit to a joined channel.');});
ui.enableSpeakers.addEventListener('click',async()=>{
  unlockSound();
  let count=0;
  for(const s of sessions.values()){
    s.applyAudioOutput();
    if(!s.monitor || selectedTx && selectedTx!==s)continue;
    for(const m of s.members.values())if(m.audio){try{await m.audio.play();count++;}catch{}}
  }
  setMessage(count?'Speakers enabled for '+count+' connected audio feed(s).':'No incoming audio streams yet. Try again when another member joins.');
});

function startPTT(s){
  if(!s || !s.ready() || selectedTx && selectedTx!==s || s.floor && s.floor!==s.myId)return;
  unlockSound();selectedTx=s;s.wantTalk=true;
  for(const other of sessions.values())other.applyAudioOutput();
  if(s.isHost){if(!s.floor)s.setFloor(s.myId,profile.txTone);}
  else s.send(s.hostId(),{type:'request',tone:profile.txTone});
  updateAll();
}
function releaseTalk(s){
  if(!s)return;
  s.wantTalk=false;s.disableTransmit();
  if(selectedTx===s)selectedTx=null;
  for(const other of sessions.values())other.applyAudioOutput();
  if(s.isHost){if(s.floor===s.myId)s.setFloor(null);}
  else if(s.ready())s.send(s.hostId(),{type:'release'});
  updateAll();
}
function bindHold(button,resolve){
  button.addEventListener('pointerdown',e=>{
    if(e.button!==0 && e.pointerType==='mouse')return;
    e.preventDefault();const s=resolve();
    if(!s)return;
    try{button.setPointerCapture(e.pointerId);}catch{}
    startPTT(s);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])
    button.addEventListener(type,()=>{const s=selectedTx;if(s)releaseTalk(s);});
  button.addEventListener('contextmenu',e=>e.preventDefault());
}
bindHold(ui.quick,()=>sessions.get(focusedId));
window.addEventListener('pointerup',()=>{if(selectedTx)releaseTalk(selectedTx);});
window.addEventListener('blur',()=>{if(selectedTx)releaseTalk(selectedTx);});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && selectedTx)releaseTalk(selectedTx);
  if(!document.hidden)for(const s of sessions.values())s.reconnectSignaling();
});
window.addEventListener('online',()=>{for(const s of sessions.values())s.reconnectSignaling();});
window.addEventListener('pagehide',()=>{if(selectedTx)releaseTalk(selectedTx);for(const s of sessions.values())s.stop();});

class ChannelSession{
  constructor(publicRoom,effectiveId,track,stream,monitor){
    this.room=publicRoom;this.publicId=publicRoom.id;this.id=effectiveId;
    this.track=track;this.stream=stream;this.monitor=monitor;
    this.peer=null;this.myId=null;this.isHost=false;this.members=new Map;this.roster=new Set;
    this.floor=null;this.floorAt=0;this.wantTalk=false;this.transmitting=false;
    this.generation=0;this.stopped=false;this.status='Connecting';this.note='Connecting to signaling…';
    this.lastHost=0;this.heartbeat=null;this.retry=null;this.toneTimer=null;this.signalingRetry=null;
  }
  hostId(){return leaderId(this.id);}
  validMember(id){return validMemberId(this.id,id);}
  ready(){return this.isHost || Boolean(this.members.get(this.hostId())?.data?.open);}
  member(id){
    if(!this.members.has(id))this.members.set(id,{id,name:'Connecting…',color:PALETTE[0],data:null,call:null,stream:null,audio:null,lastSeen:0,pending:0,mediaPending:0});
    return this.members.get(id);
  }
  send(id,payload){
    const dc=this.members.get(id)?.data;
    if(!dc?.open)return false;
    try{dc.send(payload);return true;}catch{return false;}
  }
  broadcast(payload){for(const id of this.members.keys())this.send(id,payload);}
  info(id){
    if(id===this.myId)return{id,name:profile.name,color:profile.color};
    const m=this.members.get(id);return{id,name:m?.name||'Connecting…',color:cleanColor(m?.color)};
  }
  sendHello(){if(!this.peer || this.stopped)return;this.broadcast({type:'hello',name:profile.name,color:profile.color});if(this.isHost)this.broadcastRoster();updateRow(this.publicId);}
  broadcastRoster(){
    if(!this.isHost || !this.myId)return;
    const joined=[this.info(this.myId),...[...this.members.values()].filter(m=>m.data?.open).map(m=>this.info(m.id))].slice(0,MAX_PEOPLE);
    this.broadcast({type:'roster',people:joined,floor:this.floor});
    updateRow(this.publicId);
  }
  applyAudioOutput(){
    // Don't acoustically rebroadcast another monitored channel while transmitting.
    const audible=this.monitor && (!selectedTx || selectedTx===this);
    for(const m of this.members.values()){
      if(m.audio){
        m.audio.muted=!audible;
        if(audible)m.audio.play().catch(()=>{});
      }
    }
  }
  setMonitor(enabled){
    this.monitor=!!enabled;
    this.applyAudioOutput();
    updateRow(this.publicId);
  }
  disableTransmit(){
    if(this.toneTimer){clearTimeout(this.toneTimer);this.toneTimer=null;}
    this.track.enabled=false;this.transmitting=false;
  }
  transmitIfAllowed(newFloor){
    if(!this.wantTalk || selectedTx!==this || this.floor!==this.myId)return;
    if(this.toneTimer)return;
    const open=()=>{
      this.toneTimer=null;
      if(this.wantTalk && selectedTx===this && this.floor===this.myId && !this.stopped){
        this.track.enabled=true;this.transmitting=true;updateRow(this.publicId);updateQuick();
      }
    };
    if(newFloor && profile.txTone)this.toneTimer=setTimeout(open,290);
    else open();
  }
  setFloor(id,tone=false){
    const change=id!==this.floor;
    this.floor=id;this.floorAt=Date.now();
    if(id!==this.myId)this.disableTransmit();
    if(change && id && id!==this.myId && tone && this.monitor && profile.rxTone)playTone('squawk');
    if(id===this.myId){
      if(!this.wantTalk || selectedTx!==this){
        this.disableTransmit();
        if(!this.isHost)this.send(this.hostId(),{type:'release'});
      }else this.transmitIfAllowed(change);
    }
    if(this.isHost)this.broadcast({type:'floor',id,tone:!!tone});
    updateRow(this.publicId);updateQuick();
  }
  dropMedia(m){
    if(!m)return;
    const call=m.call;m.call=null;m.stream=null;
    try{call?.close();}catch{}
    if(m.audio){try{m.audio.pause();m.audio.srcObject=null;m.audio.remove();}catch{}m.audio=null;}
  }
  dropMember(id,silent=false){
    const m=this.members.get(id);if(!m)return;
    this.members.delete(id);
    const dc=m.data;m.data=null;
    try{dc?.close();}catch{}
    this.dropMedia(m);
    if(this.floor===id && this.isHost)this.setFloor(null);
    if(this.isHost&&!silent)this.broadcastRoster();
    updateRow(this.publicId);
  }
  closePeer(){
    for(const id of [...this.members.keys()])this.dropMember(id,true);
    this.members.clear();this.roster.clear();
    const old=this.peer;this.peer=null;
    try{old?.destroy();}catch{}
    if(this.floor===this.myId)this.disableTransmit();
    this.floor=null;this.myId=null;this.isHost=false;
  }
  stop(){
    if(this.stopped)return;
    this.stopped=true;this.generation++;
    if(this.heartbeat)clearInterval(this.heartbeat);
    if(this.retry)clearTimeout(this.retry);
    if(this.toneTimer)clearTimeout(this.toneTimer);
    if(this.signalingRetry)clearTimeout(this.signalingRetry);
    this.disableTransmit();this.closePeer();
    try{this.track.stop();}catch{}
  }
  start(){
    this.heartbeat=setInterval(()=>this.tick(),PING_EVERY);
    this.beginHost();
    updateRow(this.publicId);
  }
  beginHost(){
    if(this.stopped)return;
    this.generation++;this.closePeer();
    const generation=this.generation;
    const id=this.hostId();this.myId=id;this.isHost=false;
    const peer=new window.Peer(id,{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
    this.peer=peer;this.note='Checking channel membership…';
    peer.on('open',()=>{
      if(!this.current(peer,generation))return;
      this.isHost=true;this.roster=new Set([this.myId]);this.status='Online';
      this.note='Channel ready. Waiting for people to join.';
      updateRow(this.publicId);updateQuick();
    });
    this.bindPeer(peer,generation,true);
  }
  beginGuest(){
    if(this.stopped)return;
    this.generation++;this.closePeer();
    const generation=this.generation;
    this.myId=guestId(this.id);this.isHost=false;
    const peer=new window.Peer(this.myId,{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
    this.peer=peer;this.note='Finding channel coordinator…';
    peer.on('open',()=>{
      if(!this.current(peer,generation))return;
      this.status='Connecting';this.tryHost();
    });
    this.bindPeer(peer,generation,false);
  }
  current(p,g){return !this.stopped && this.peer===p && this.generation===g;}
  bindPeer(p,g,asHost){
    p.on('connection',dc=>{
      if(!this.current(p,g)){dc.close();return;}
      if(this.isHost){
        if(!validGuestId(this.id,dc.peer)){dc.close();return;}
        const occupied=[...this.members.values()].filter(m=>m.data && (m.data.open || Date.now()-m.pending<PENDING_AFTER)).length;
        if(!this.members.has(dc.peer)&&occupied>=MAX_PEOPLE-1){
          dc.on('open',()=>{try{dc.send({type:'full'});}catch{}setTimeout(()=>dc.close(),300)});
          setTimeout(()=>{try{dc.close();}catch{}},5000);return;
        }
        this.attachData(dc,g);
      }else{
        if(!this.roster.has(dc.peer) || dc.peer===this.hostId()){dc.close();return;}
        this.attachData(dc,g);
      }
    });
    p.on('call',call=>{
      if(!this.current(p,g)){call.close();return;}
      if(!this.members.get(call.peer)?.data?.open){call.close();return;}
      if(this.attachMedia(call,g))try{call.answer(this.stream);}catch{call.close();}
    });
    p.on('disconnected',()=>{
      if(!this.current(p,g))return;
      this.note='Signaling interrupted; keeping active audio while reconnecting.';
      try{p.reconnect();}catch{}
      if(this.signalingRetry)clearTimeout(this.signalingRetry);
      this.signalingRetry=setTimeout(()=>{
        if(this.current(p,g)&&p.disconnected&&!this.hasPeers())this.scheduleRetry(1800);
      },20000);
      updateRow(this.publicId);
    });
    p.on('error',err=>{
      if(!this.current(p,g))return;
      if(asHost && err?.type==='unavailable-id' && !this.isHost){this.beginGuest();return;}
      if(err?.type==='peer-unavailable'){if(!this.isHost && !this.members.get(this.hostId())?.data?.open)this.note='Waiting for coordinator…';return;}
      if(err?.type==='unavailable-id'){this.scheduleRetry(2600);return;}
      this.note='Network issue ('+(err?.type||'unknown')+'). Reconnecting if necessary.';
      if(!this.hasPeers())this.scheduleRetry(4000);
      updateRow(this.publicId);
    });
    p.on('close',()=>{if(this.current(p,g))this.scheduleRetry(2100);});
  }
  hasPeers(){return [...this.members.values()].some(m=>m.data?.open);}
  scheduleRetry(delay=2400){
    if(this.stopped||this.retry)return;
    this.retry=setTimeout(()=>{this.retry=null;if(!this.stopped)this.beginHost();},delay);
    this.note='Reconnecting…';updateRow(this.publicId);
  }
  reconnectSignaling(){
    if(this.stopped)return;
    if(this.peer?.disconnected)try{this.peer.reconnect();}catch{this.scheduleRetry();}
    if(!this.peer || this.peer.destroyed)this.scheduleRetry(500);
  }
  tryHost(){
    if(this.stopped || this.isHost || !this.peer?.open)return;
    const id=this.hostId(),m=this.members.get(id);
    if(m?.data?.open)return;
    if(m?.data && Date.now()-m.pending<PENDING_AFTER)return;
    if(m)this.dropMember(id,true);
    try{this.attachData(this.peer.connect(id,{reliable:true,serialization:'json'}),this.generation);}
    catch{this.note='Waiting for coordinator.';}
  }
  attachData(dc,g){
    if(this.stopped || g!==this.generation || !this.validMember(dc.peer) || dc.peer===this.myId){try{dc.close()}catch{}return;}
    const m=this.member(dc.peer);
    if(m.data && m.data!==dc){
      if(m.data.open || Date.now()-m.pending<PENDING_AFTER){try{dc.close()}catch{}return;}
      try{m.data.close()}catch{}
    }
    m.data=dc;m.pending=Date.now();
    dc.on('open',()=>{
      if(g!==this.generation||m.data!==dc)return;
      m.lastSeen=Date.now();
      this.send(dc.peer,{type:'hello',name:profile.name,color:profile.color});
      if(this.isHost)this.broadcastRoster();
      if(dc.peer===this.hostId())this.lastHost=Date.now();
      if(this.myId<dc.peer)this.startMedia(dc.peer,g);
      if(!this.isHost)this.ensureMesh();
      updateRow(this.publicId);updateQuick();
    });
    dc.on('data',msg=>{
      if(g!==this.generation || m.data!==dc || !msg || typeof msg!=='object')return;
      m.lastSeen=Date.now();
      if(dc.peer===this.hostId())this.lastHost=Date.now();
      this.onData(dc.peer,msg);
    });
    const closed=()=>{
      if(g!==this.generation || m.data!==dc)return;
      const hostWasLost=!this.isHost && dc.peer===this.hostId();
      this.dropMember(dc.peer);
      if(hostWasLost)this.scheduleRetry(1400);
    };
    dc.on('close',closed);dc.on('error',closed);
  }
  onData(id,msg){
    const m=this.members.get(id);if(!m)return;
    switch(msg.type){
      case 'hello':
        m.name=cleanName(msg.name);m.color=cleanColor(msg.color);
        if(this.isHost)this.broadcastRoster();
        break;
      case 'ping':this.send(id,{type:'pong'});break;
      case 'pong':break;
      case 'roster':
        if(!this.isHost && id===this.hostId())this.applyRoster(msg);
        break;
      case 'floor':
        if(!this.isHost && id===this.hostId() && (msg.id===null || msg.id===this.myId || this.roster.has(msg.id)))
          this.setFloor(msg.id,msg.tone===true);
        break;
      case 'request':
        if(this.isHost && !this.floor)this.setFloor(id,msg.tone===true);
        break;
      case 'release':
        if(this.isHost && this.floor===id)this.setFloor(null);
        break;
      case 'floor-live':
        if(this.isHost && this.floor===id)this.floorAt=Date.now();
        break;
      case 'call':
        if(this.monitor){
          if(profile.alertTone)playTone('call');
          this.note='Call alert from '+m.name;
        }
        break;
      case 'full':
        if(!this.isHost && id===this.hostId())this.note='Channel full: '+MAX_PEOPLE+' people maximum.';
        break;
    }
    updateRow(this.publicId);updateQuick();
  }
  applyRoster(msg){
    if(!Array.isArray(msg.people))return;
    const people=msg.people.filter(p=>p && this.validMember(p.id)).slice(0,MAX_PEOPLE);
    const ids=new Set(people.map(p=>p.id));ids.add(this.myId);
    if(!ids.has(this.hostId()))return;
    this.roster=ids;
    for(const person of people){
      if(person.id===this.myId)continue;
      const m=this.member(person.id);m.name=cleanName(person.name);m.color=cleanColor(person.color);
    }
    for(const id of [...this.members.keys()])
      if(!ids.has(id)&&id!==this.hostId())this.dropMember(id,true);
    if(msg.floor===null || typeof msg.floor==='string'&&ids.has(msg.floor))
      this.setFloor(msg.floor);
    this.ensureMesh();
  }
  ensureMesh(){
    if(this.stopped || this.isHost || !this.peer?.open)return;
    for(const id of this.roster){
      if(id===this.myId || id===this.hostId() || !validGuestId(this.id,id))continue;
      const m=this.member(id);
      if(this.myId<id && !m.data)
        try{this.attachData(this.peer.connect(id,{reliable:true,serialization:'json'}),this.generation);}catch{}
      if(this.myId<id && m.data?.open && !m.call)this.startMedia(id,this.generation);
    }
  }
  attachMedia(call,g){
    if(this.stopped||g!==this.generation || !this.members.has(call.peer)){try{call.close()}catch{}return false;}
    const m=this.member(call.peer);
    if(m.call && m.call!==call){try{call.close()}catch{}return false;}
    m.call=call;m.mediaPending=Date.now();
    call.on('stream',stream=>{
      if(g!==this.generation || m.call!==call)return;
      m.stream=stream;
      if(!m.audio){
        const a=document.createElement('audio');a.autoplay=true;a.playsInline=true;a.setAttribute('playsinline','');
        a.muted=!(this.monitor && (!selectedTx || selectedTx===this));a.dataset.channel=this.publicId;a.dataset.peer=call.peer;
        ui.audio.appendChild(a);m.audio=a;
      }
      m.audio.muted=!(this.monitor && (!selectedTx || selectedTx===this));m.audio.srcObject=stream;
      m.audio.play().catch(()=>{this.note='Tap Enable speaker in your browser if audio is blocked.';});
      updateRow(this.publicId);
    });
    const closed=()=>{
      if(g!==this.generation||m.call!==call)return;
      this.dropMedia(m);
      if(this.myId<call.peer && m.data?.open)
        setTimeout(()=>{if(g===this.generation && !this.stopped)this.startMedia(call.peer,g);},2600);
      updateRow(this.publicId);
    };
    call.on('close',closed);call.on('error',closed);
    return true;
  }
  startMedia(id,g){
    const m=this.members.get(id);
    if(this.stopped||g!==this.generation || !m?.data?.open || m.call || this.myId>=id || !this.peer?.open)return;
    try{this.attachMedia(this.peer.call(id,this.stream),g);}catch{}
  }
  tick(){
    if(this.stopped)return;
    const now=Date.now();
    for(const [id,m] of [...this.members]){
      if(m.data?.open){
        if(now-m.lastSeen>STALE_AFTER){this.dropMember(id);continue;}
        this.send(id,{type:'ping'});
      }else if(m.data && now-m.pending>PENDING_AFTER)this.dropMember(id,true);
      if(m.call?.peerConnection?.iceConnectionState==='failed' || m.call && !m.stream && now-m.mediaPending>17000)this.dropMedia(m);
      if(m.data?.open && this.myId<id && !m.call)this.startMedia(id,this.generation);
    }
    if(this.isHost){
      if(this.floor===this.myId && this.wantTalk)this.floorAt=now;
      if(this.floor && now-this.floorAt>24000)this.setFloor(null);
    }else{
      if(this.floor===this.myId && this.wantTalk)this.send(this.hostId(),{type:'floor-live'});
      const coordinator=this.members.get(this.hostId());
      if(!coordinator?.data?.open){
        this.tryHost();
        if(now-(this.lastHost||0)>30000)this.scheduleRetry(1600);
      }else this.ensureMesh();
    }
    this.reconnectSignaling();
    updateRow(this.publicId);
  }
}
function stableText(parent,tag,text,klass){
  const el=document.createElement(tag);if(klass)el.className=klass;el.textContent=text;parent.appendChild(el);return el;
}
function drawRows(){
  ui.list.replaceChildren();rows.clear();
  for(const c of channels){
    const box=document.createElement('article');box.className='multi-channel';box.dataset.id=c.id;
    const head=stableText(box,'div','','group-head');
    const titleBlock=stableText(head,'div','','group-name-block');
    stableText(titleBlock,'div',c.title,'group-title');
    const sub=stableText(titleBlock,'div',c.secure?'PIN protected • reusable link':'Reusable invitation link','group-subtitle');
    const status=stableText(head,'span','Not joined','group-status');
    const signal=stableText(box,'div','','group-signal');
    const speaker=stableText(signal,'div','Not monitoring','on-air');
    const count=stableText(signal,'span','0 / '+MAX_PEOPLE,'group-count');
    const actions=stableText(box,'div','','group-action-row');
    const join=stableText(actions,'button','Join','secondary');join.type='button';
    const focus=stableText(actions,'button','Focus','secondary');focus.type='button';
    const ptt=stableText(actions,'button','Hold Talk','small-ptt');ptt.type='button';ptt.disabled=true;
    const call=stableText(actions,'button','Call','secondary');call.type='button';call.disabled=true;
    const extra=stableText(box,'div','','group-extra');
    const monitorLabel=stableText(extra,'label','','monitor-label');
    const monitor=document.createElement('input');monitor.type='checkbox';monitor.checked=monitorValue(c.id);
    monitorLabel.appendChild(monitor);stableText(monitorLabel,'span','Monitor sound','');
    const link=stableText(extra,'button','Copy link','');link.type='button';
    const lock=stableText(extra,'button',c.secure?'PIN on':'Set PIN','');lock.type='button';lock.disabled=!!c.secure;
    const forget=stableText(extra,'button','Forget','');forget.type='button';
    const people=stableText(box,'div','','group-people');
    const msg=stableText(box,'p','','group-msg');
    rows.set(c.id,{box,status,speaker,count,join,focus,ptt,call,monitor,link,lock,forget,people,msg});
    join.addEventListener('click',()=>sessions.has(c.id)?leaveChannel(c.id):joinChannel(c));
    focus.addEventListener('click',()=>{focusedId=c.id;updateAll();});
    bindHold(ptt,()=>sessions.get(c.id));
    monitor.addEventListener('change',()=>setMonitor(c.id,monitor.checked));
    link.addEventListener('click',()=>copyInvite(c));
    lock.addEventListener('click',()=>{
      if(c.secure)return;
      const pin=window.prompt('Choose a 4–12 digit PIN for '+c.title+'. Tell members separately from the new link.');
      if(pin===null)return;
      if(!validPin(pin.trim())){setMessage('PIN must have 4–12 numeric digits.');return;}
      if(sessions.has(c.id)){setMessage('Leave '+c.title+' before changing its PIN.');return;}
      c.secure=true;pinCache.set(c.id,pin.trim());saveChannels();drawRows();
      setMessage(c.title+' is now PIN-protected. Share the updated invite link and PIN separately. Old unprotected sessions cannot join the new namespace.');
    });
    call.addEventListener('click',()=>{
      const s=sessions.get(c.id);if(!s?.ready())return;
      s.broadcast({type:'call'});
      s.note='Call alert sent to '+c.title;
      setMessage('Call sent to '+c.title+' only.');
      updateRow(c.id);
    });
    forget.addEventListener('click',()=>{
      if(sessions.has(c.id)){setMessage('Leave '+c.title+' first to forget it.');return;}
      if(!window.confirm('Forget '+c.title+' from this device? This does not revoke its link.'))return;
      channels=channels.filter(x=>x.id!==c.id);
      delete monitorPrefs[c.id];pinCache.delete(c.id);desiredJoined.delete(c.id);
      saveChannels();persistMonitors();persistDesired();drawRows();updateAll();
    });
    ui.list.appendChild(box);
  }
  if(!channels.length)stableText(ui.list,'div','No saved channels. Create a channel below or open a reusable invitation link.','channel-empty');
  updateAll();
}
function updateRow(id){
  const r=rows.get(id),s=sessions.get(id);
  if(!r)return;
  const isActive=!!s,focus=focusedId===id;
  r.box.classList.toggle('active',isActive);
  r.box.classList.toggle('focused',focus);
  r.box.classList.toggle('group-muted',isActive&&!s.monitor);
  r.monitor.checked=monitorValue(id);
  r.join.textContent=isActive?'Leave':'Join';
  r.focus.disabled=!isActive;r.focus.textContent=focus?'Selected':'Focus';
  r.status.textContent=!isActive?'Not joined':s.ready()?'Connected':'Connecting';
  r.status.className='group-status'+(isActive&&s.ready()?' online':isActive?' warning':'');
  const canSpeak=isActive&&s.ready()&&(!selectedTx||selectedTx===s)&&(!s.floor||s.floor===s.myId);
  r.ptt.disabled=!canSpeak;
  r.ptt.classList.toggle('sending',Boolean(s?.transmitting));
  r.ptt.textContent=s?.transmitting?'TRANSMITTING':s?.wantTalk?'REQUESTING…':'Hold Talk';
  r.call.disabled=!isActive||!s.ready();
  const person=isActive && s.floor ? s.info(s.floor):null;
  r.speaker.textContent=!isActive?'Join to see this channel':person?'ON AIR: '+person.name:(s.monitor?'Channel idle':'Monitoring off');
  r.count.textContent=isActive?(1+[...s.members.values()].filter(m=>m.data?.open).length)+' / '+MAX_PEOPLE:'—';
  r.people.replaceChildren();
  if(isActive){
    for(const m of [s.info(s.myId),...[...s.members.values()].filter(m=>m.data?.open).map(m=>s.info(m.id))]){
      const tag=stableText(r.people,'span',m.name+(m.id===s.myId?' (you)':''),'group-person'+(s.floor===m.id?' on-air-person':''));
      tag.style.borderLeft='3px solid '+m.color;
    }
  }
  r.msg.textContent=isActive?s.note:(storedRoom(id)?.secure?'PIN required when joining':'Reusable invitation');
  if(focus)updateQuick();
  ui.count.textContent=sessions.size+' / '+MAX_ACTIVE+' active';
}
function updateQuick(){
  const s=sessions.get(focusedId);
  if(!s){ui.focusTitle.textContent='No channel selected';ui.focusStatus.textContent='Standby';ui.focusSpeaker.textContent='Channel idle';ui.quick.disabled=true;ui.quickText.textContent='HOLD TO TALK';ui.focusHint.textContent='Join a channel, then tap Focus beside it to use this large Talk button.';return;}
  ui.focusTitle.textContent=s.room.title;
  ui.focusStatus.textContent=s.ready()?'Connected':'Connecting';
  ui.focusStatus.className='status-badge'+(s.ready()?' connected':'');
  ui.focusSpeaker.textContent=s.floor?s.info(s.floor).name:'Channel idle';
  ui.quick.disabled=!s.ready()||(selectedTx && selectedTx!==s)||(s.floor && s.floor!==s.myId);
  ui.quickText.textContent=s.transmitting?'TRANSMITTING':s.wantTalk?'REQUESTING…':'HOLD TO TALK';
  ui.focusHint.textContent='Only '+s.room.title+' receives this microphone when you hold Talk.';
}
function updateAll(){for(const c of channels)updateRow(c.id);updateQuick();}
drawColors();drawRows();
