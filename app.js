import {MAX_PEOPLE,PALETTE,validRoom,newRoom,cleanName,cleanTitle,cleanColor,roomLink,leaderId,guestId,validGuestId,validMemberId,normalizeChannels} from './room-utils.mjs';

const $ = id => document.getElementById(id);
const ui = {
  home:$('homePanel'), radio:$('radioPanel'), profileName:$('displayName'), colors:$('colors'),
  list:$('channelList'), newChannel:$('newChannel'), create:$('createChannel'), homeMessage:$('homeMessage'),
  title:$('channelTitle'), badge:$('statusBadge'), status:$('connectionText'), speaker:$('speakerBlock'),
  speakerName:$('speakerName'), talk:$('talkButton'), talkText:$('talkText'), talkHint:$('talkHint'),
  people:$('participants'), count:$('participantCount'), audio:$('audioContainer'),
  speakerButton:$('enableAudio'), reconnect:$('reconnect'), leave:$('leave'), switchChannel:$('switchChannel'),
  invite:$('inviteLink'), copy:$('copyInvite'), share:$('shareInvite'), inviteMessage:$('inviteMessage'),
  error:$('errorMessage')
};
const PROFILE_KEY = 'relay-one.profile.v4', CHANNEL_KEY = 'relay-one.channels.v4';
const HEARTBEAT = 5000, STALE = 40000, PENDING = 9000, NO_LEADER = 23000;
const DEFAULT_PROFILE = {name:'User',color:PALETTE[0]};

function load(key,fallback) { try { const v=JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function save(key,v) { try { localStorage.setItem(key,JSON.stringify(v)); return true; } catch { return false; } }
let profileRaw = load(PROFILE_KEY,DEFAULT_PROFILE);
let profile = {name:cleanName(profileRaw?.name),color:cleanColor(profileRaw?.color)};
let savedChannels = normalizeChannels(load(CHANNEL_KEY,[]));

let channel=null, microphone=null, peer=null, myId='', coordinator=false, epoch=0, starting=false;
let floorId=null, floorUpdated=0, wantTalk=false, transmitting=false, runningSince=0;
let note='', lastLeaderSeen=0, coordinatorPendingAt=0, heartbeatTimer=null, retryTimer=null, signalingTimer=null;
const members = new Map(); // id -> name, color, data, call, audio, stream, lastSeen, pendingAt
let rosterIds=new Set();

function showError(message) { ui.error.textContent=message; ui.error.classList.remove('hidden'); }
function clearError() { ui.error.textContent=''; ui.error.classList.add('hidden'); }
function setNote(message) { note=message; renderRadio(); }
function saveChannels() { save(CHANNEL_KEY,savedChannels); }
function addChannel(id,title) {
  const existing=savedChannels.find(x=>x.id===id);
  if(existing) return existing;
  const result={id,title:cleanTitle(title)};
  savedChannels.unshift(result); savedChannels=savedChannels.slice(0,30); saveChannels();
  return result;
}
function inviteFor(c) { return roomLink(location.href,c.id,c.title); }
function copyText(value) {
  return navigator.clipboard?.writeText(value).catch(() => { window.prompt('Copy this invitation link:',value); }) ??
    Promise.resolve(window.prompt('Copy this invitation link:',value));
}
function describeChannel(c) {
  return 'Private room • reusable link';
}
function renderColors() {
  ui.colors.replaceChildren();
  for(const color of PALETTE){
    const b=document.createElement('button'); b.type='button'; b.className='color-choice'+(profile.color===color?' selected':'');
    b.style.setProperty('--swatch',color); b.setAttribute('aria-label','Profile color '+color);
    b.setAttribute('aria-pressed',String(profile.color===color));
    b.addEventListener('click',()=>{profile.color=color;save(PROFILE_KEY,profile);renderColors();sendHello();});
    ui.colors.appendChild(b);
  }
}
function renderHome() {
  ui.list.replaceChildren();
  if(!savedChannels.length) {
    const empty=document.createElement('div'); empty.className='channel-empty';
    empty.textContent='No saved channels yet. Create one below, then share its link once.';ui.list.appendChild(empty);
  }
  for(const c of savedChannels){
    const row=document.createElement('div');row.className='channel';
    const copy=document.createElement('div');copy.className='channel-copy';
    const title=document.createElement('strong');title.textContent=c.title;
    const hint=document.createElement('span');hint.textContent=describeChannel(c);
    copy.append(title,hint);
    const join=document.createElement('button');join.className='join';join.textContent='Join';
    join.setAttribute('aria-label','Join '+c.title); join.addEventListener('click',()=>startChannel(c));
    const link=document.createElement('button');link.textContent='Link';link.setAttribute('aria-label','Copy link for '+c.title);
    link.addEventListener('click',async()=>{await copyText(inviteFor(c));ui.homeMessage.textContent='Link ready for '+c.title+'. Send it once; everyone can reuse it.';});
    const remove=document.createElement('button');remove.className='remove';remove.textContent='×';
    remove.setAttribute('aria-label','Forget '+c.title+' on this device');
    remove.addEventListener('click',()=>{if(!confirm('Forget '+c.title+' on this device? The link still works for other people.'))return;
      savedChannels=savedChannels.filter(x=>x.id!==c.id);saveChannels();renderHome();});
    row.append(copy,join,link,remove);ui.list.appendChild(row);
  }
}
function readProfile() { profile.name=cleanName(ui.profileName.value);save(PROFILE_KEY,profile); }
ui.profileName.value=profile.name;
ui.profileName.addEventListener('change',()=>{readProfile();ui.profileName.value=profile.name;sendHello();});
ui.create.addEventListener('click',()=>{
  readProfile(); const title=cleanTitle(ui.newChannel.value || 'New channel');
  const c=addChannel(newRoom(),title);ui.newChannel.value='';
  renderHome();ui.homeMessage.textContent='Created '+c.title+'. Share the Link button once, then tap Join when ready.';
});
ui.newChannel.addEventListener('keydown',e=>{if(e.key==='Enter')ui.create.click();});
renderColors();renderHome();
const incoming = new URLSearchParams(location.search);
if(incoming.has('room')){
  const id=incoming.get('room');
  if(validRoom(id)){
    const title=cleanTitle(incoming.get('channel') || 'Shared channel');
    const c=addChannel(id,title);
    ui.homeMessage.textContent='Invitation saved: '+c.title+'. Tap Join to enter. You can reuse it later.';
    renderHome();
  } else showError('This channel invitation is invalid. Request a new link.');
}

function leaderKey() {return leaderId(channel.id);}
function makePeer(id) {
  return new window.Peer(id,{
    debug:0,
    config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}
  });
}
function isCurrent(t,p) {return t===epoch && peer===p && Boolean(channel && microphone);}
function isLeaderOnline() {return coordinator || Boolean(members.get(leaderKey())?.data?.open);}
function hasActivePeers() {return [...members.values()].some(m=>m.data?.open);}
function send(id,message) {
  const dc=members.get(id)?.data;
  if(!dc?.open) return false;
  try {dc.send(message);return true;} catch {return false;}
}
function broadcast(message) {for(const id of members.keys()) send(id,message);}
function infoFor(id) {
  if(id===myId) return {id,name:profile.name,color:profile.color};
  const m=members.get(id);
  return {id,name:m?.name||'Connecting…',color:cleanColor(m?.color)};
}
function validMemberInfo(item) {
  return item && typeof item.id==='string' && validMemberId(channel.id,item.id);
}
function member(id) {
  if(!members.has(id)) members.set(id,{id,name:'Connecting…',color:PALETTE[0],data:null,call:null,audio:null,stream:null,lastSeen:0,pendingAt:0});
  return members.get(id);
}
function dropMedia(m) {
  if(!m) return;
  const call=m.call; m.call=null;m.stream=null;
  try {call?.close();}catch {}
  if(m.audio){try {m.audio.pause();m.audio.srcObject=null;m.audio.remove();}catch{}m.audio=null;}
}
function removeMember(id,suppressRoster=false) {
  const m=members.get(id);if(!m)return;
  members.delete(id);
  const dc=m.data; m.data=null;
  try{dc?.close();}catch{}
  dropMedia(m);
  if(coordinator){
    if(floorId===id) changeFloor(null);
    if(!suppressRoster) broadcastRoster();
  }
  renderRadio();
}
function clearNetwork() {
  wantTalk=false;stopTransmit();
  if(heartbeatTimer)clearInterval(heartbeatTimer);heartbeatTimer=null;
  if(retryTimer)clearTimeout(retryTimer);retryTimer=null;
  if(signalingTimer)clearTimeout(signalingTimer);signalingTimer=null;
  for(const id of [...members.keys()])removeMember(id,true);
  members.clear(); rosterIds.clear();
  const old=peer;peer=null;try{old?.destroy();}catch{}
  myId='';coordinator=false; floorId=null;floorUpdated=0;lastLeaderSeen=0;coordinatorPendingAt=0;
}
function leaveChannel(clearErrors=true) {
  ++epoch;clearNetwork();
  const old=microphone; microphone=null;channel=null;starting=false;
  try{old?.getTracks().forEach(t=>t.stop());}catch{}
  ui.radio.classList.add('hidden');ui.home.classList.remove('hidden');
  if(clearErrors) clearError();
  history.replaceState(null,'',location.pathname);
  renderHome();
}
function stopTransmit() {
  transmitting=false;
  microphone?.getAudioTracks().forEach(t=>{t.enabled=false;});
}
function changeFloor(id) {
  floorId=id;floorUpdated=Date.now();
  if(floorId!==myId || !wantTalk)stopTransmit();
  if(floorId===myId && !wantTalk && !coordinator)send(leaderKey(),{type:'release'});
  if(floorId===myId && wantTalk){
    microphone?.getAudioTracks().forEach(t=>{t.enabled=true;});
    transmitting=true;
  }
  if(coordinator)broadcast({type:'floor',id:floorId});
  renderRadio();
}
function requestFloor() {
  if(!microphone || !isLeaderOnline() || (floorId && floorId!==myId))return;
  wantTalk=true;
  if(coordinator){
    if(!floorId) changeFloor(myId);
    else if(floorId===myId)changeFloor(myId);
  } else send(leaderKey(),{type:'request'});
  renderRadio();
}
function releaseFloor() {
  if(!wantTalk && !transmitting)return;
  wantTalk=false;stopTransmit();
  if(coordinator){if(floorId===myId)changeFloor(null);}
  else if(isLeaderOnline())send(leaderKey(),{type:'release'});
  renderRadio();
}
function broadcastRoster(){
  if(!coordinator || !myId)return;
  const list=[infoFor(myId),...[...members.values()].filter(m=>m.data?.open).map(m=>infoFor(m.id))].slice(0,MAX_PEOPLE);
  broadcast({type:'roster',people:list,floor:floorId});
  renderRadio();
}
function sendHello() {
  if(!microphone)return;
  broadcast({type:'hello',name:profile.name,color:profile.color});
  if(coordinator)broadcastRoster();
  renderRadio();
}
function updateRoster(payload) {
  if(!Array.isArray(payload.people))return;
  const roster=payload.people.filter(validMemberInfo).slice(0,MAX_PEOPLE);
  const ids=new Set(roster.map(x=>x.id));ids.add(myId);
  if(!ids.has(leaderKey()))return;
  rosterIds=ids;
  for(const item of roster)if(item.id!==myId){
    const m=member(item.id);m.name=cleanName(item.name);m.color=cleanColor(item.color);
  }
  for(const id of [...members.keys()]){
    if(!ids.has(id) && id!==leaderKey())removeMember(id,true);
  }
  if(typeof payload.floor==='string' && ids.has(payload.floor) || payload.floor===null) changeFloor(payload.floor);
  ensureMesh(epoch);renderRadio();
}
function handleMessage(id,payload,current) {
  if(current!==epoch || !payload || typeof payload!=='object')return;
  const m=members.get(id);if(!m)return;
  m.lastSeen=Date.now();
  if(id===leaderKey()) lastLeaderSeen=Date.now();
  switch(payload.type){
    case 'hello':
      m.name=cleanName(payload.name);m.color=cleanColor(payload.color);
      if(coordinator)broadcastRoster();
      break;
    case 'ping': send(id,{type:'pong'});break;
    case 'pong':break;
    case 'roster':
      if(!coordinator && id===leaderKey())updateRoster(payload);
      break;
    case 'floor':
      if(!coordinator && id===leaderKey()){
        const speaker=payload.id;
        if(speaker===null || speaker===myId || rosterIds.has(speaker))changeFloor(speaker);
      }break;
    case 'request':
      if(coordinator && !floorId){ changeFloor(id); }
      break;
    case 'release':
      if(coordinator && floorId===id)changeFloor(null);
      break;
    case 'keep-floor':
      if(coordinator && floorId===id)floorUpdated=Date.now();
      break;
    case 'full':
      if(!coordinator && id===leaderKey()){
        showError('This channel is full (maximum '+MAX_PEOPLE+' people). Leave and try again later.');
        leaveChannel(false);
      }break;
  }
  renderRadio();
}
function attachData(dc,current) {
  if(current!==epoch || !dc || !validMemberId(channel.id,dc.peer) || dc.peer===myId){try{dc?.close();}catch{}return;}
  const m=member(dc.peer);
  if(m.data && m.data!==dc) {
    if(m.data.open || Date.now()-m.pendingAt<PENDING){try{dc.close();}catch{}return;}
    try{m.data.close();}catch{}
  }
  m.data=dc;m.pendingAt=Date.now();
  dc.on('open',()=>{
    if(current!==epoch || m.data!==dc)return;
    m.lastSeen=Date.now();
    send(dc.peer,{type:'hello',name:profile.name,color:profile.color});
    if(coordinator)broadcastRoster();
    if(dc.peer===leaderKey()) {lastLeaderSeen=Date.now();setNote('Connected to channel coordinator. Linking group audio…');}
    if(myId<dc.peer)startMedia(dc.peer,current);
    if(!coordinator)ensureMesh(current);
    renderRadio();
  });
  dc.on('data',payload=>{
    if(current!==epoch || m.data!==dc)return;
    handleMessage(dc.peer,payload,current);
  });
  function disconnected(){
    if(current!==epoch || m.data!==dc)return;
    const wasLeader=dc.peer===leaderKey()&&!coordinator;
    removeMember(dc.peer);
    if(wasLeader){
      setNote('Coordinator left or disconnected. Electing a new channel coordinator…');
      scheduleRejoin(current,1300);
    }
  }
  dc.on('close',disconnected);dc.on('error',disconnected);
}
function attachMedia(call,current) {
  if(current!==epoch || !call || !members.has(call.peer)){try{call?.close();}catch{}return false;}
  const m=members.get(call.peer);
  if(m.call && m.call!==call){try{call.close();}catch{}return false;}
  m.call=call; m.mediaPendingAt=Date.now();
  call.on('stream',stream=>{
    if(current!==epoch || m.call!==call)return;
    m.stream=stream;
    if(!m.audio){
      const audio=document.createElement('audio');audio.autoplay=true;audio.playsInline=true;
      audio.setAttribute('playsinline','');audio.dataset.peer=call.peer;
      ui.audio.appendChild(audio);m.audio=audio;
    }
    m.audio.srcObject=stream;
    m.audio.play().catch(()=>{ui.speakerButton.textContent='Tap to hear audio';});
    renderRadio();
  });
  function closed(){
    if(current!==epoch || m.call!==call)return;
    dropMedia(m);
    if(myId<call.peer && m.data?.open) setTimeout(()=>{if(current===epoch)startMedia(call.peer,current);},2600);
    renderRadio();
  }
  call.on('close',closed);call.on('error',closed);
  return true;
}
function startMedia(id,current) {
  const m=members.get(id);
  if(current!==epoch || !m?.data?.open || m.call || myId>=id || !peer?.open || !microphone)return;
  try {attachMedia(peer.call(id,microphone),current);}catch(err){console.warn('Media call failed:',err);}
}
function ensureMesh(current){
  if(current!==epoch || coordinator || !peer?.open)return;
  for(const id of rosterIds){
    if(id===myId || id===leaderKey() || !validGuestId(channel.id,id))continue;
    const m=member(id);
    if(myId<id && !m.data){
      try{attachData(peer.connect(id,{reliable:true,serialization:'json'}),current);}
      catch(err){console.warn('Group data connection error:',err);}
    }
    if(myId<id && m.data?.open && !m.call)startMedia(id,current);
  }
}
function tryFindLeader(current){
  if(current!==epoch || coordinator || !peer?.open || !channel)return;
  const m=members.get(leaderKey());
  if(m?.data?.open)return;
  if(m?.data && Date.now()-m.pendingAt<PENDING)return;
  if(m)removeMember(leaderKey(),true);
  try{attachData(peer.connect(leaderKey(),{reliable:true,serialization:'json'}),current);}
  catch(err){console.warn('Coordinator search error:',err);}
}
function beginPeer(current){
  if(current!==epoch || !channel || !microphone)return;
  coordinator=false;myId=leaderKey();
  const p=makePeer(myId);peer=p;
  p.on('open',()=>{
    if(!isCurrent(current,p))return;
    coordinator=true;lastLeaderSeen=Date.now();
    rosterIds=new Set([myId]);setNote('Channel ready. Share the permanent link to invite others.');
    renderRadio();
  });
  installCommonPeerHandlers(p,current,true);
}
function becomeGuest(current){
  if(current!==epoch)return;
  const old=peer;peer=null;try{old?.destroy();}catch{}
  coordinator=false;members.clear();rosterIds.clear();floorId=null;
  myId=guestId(channel.id);
  const p=makePeer(myId);peer=p;
  p.on('open',()=>{
    if(!isCurrent(current,p))return;
    coordinatorPendingAt=Date.now();
    setNote('Finding people on this channel…');
    tryFindLeader(current);
  });
  installCommonPeerHandlers(p,current,false);
}
function installCommonPeerHandlers(p,current,asLeader){
  p.on('connection',dc=>{
    if(!isCurrent(current,p)){dc.close();return;}
    if(coordinator){
      if(!validGuestId(channel.id,dc.peer)){dc.close();return;}
      const stillActive=[...members.values()].filter(m=>m.data && (m.data.open || Date.now()-m.pendingAt<PENDING)).length;
      if(!members.has(dc.peer) && stillActive>=MAX_PEOPLE-1){
        dc.on('open',()=>{try{dc.send({type:'full'});}catch{}setTimeout(()=>dc.close(),250);});
        setTimeout(()=>{try{dc.close();}catch{}},4500);
        return;
      }
      attachData(dc,current);
    } else {
      if(!rosterIds.has(dc.peer) || dc.peer===leaderKey()){dc.close();return;}
      attachData(dc,current);
    }
  });
  p.on('call',call=>{
    if(!isCurrent(current,p)){call.close();return;}
    if(!members.get(call.peer)?.data?.open || !microphone){call.close();return;}
    if(attachMedia(call,current)){
      try{call.answer(microphone);}catch{call.close();}
    }
  });
  p.on('disconnected',()=>{
    if(!isCurrent(current,p))return;
    note='Signaling interrupted; keeping existing audio while reconnecting…';
    renderRadio();
    try{p.reconnect();}catch{}
    if(signalingTimer)clearTimeout(signalingTimer);
    signalingTimer=setTimeout(()=>{
      if(isCurrent(current,p) && p.disconnected && !hasActivePeers()){
        scheduleRejoin(current,1500);
      }
    },18000);
  });
  p.on('error',err=>{
    if(!isCurrent(current,p))return;
    if(asLeader && err?.type==='unavailable-id' && !coordinator){
      becomeGuest(current);return;
    }
    if(err?.type==='peer-unavailable'){
      if(!coordinator) {
        const m=members.get(leaderKey());
        if(m && !m.data?.open)removeMember(leaderKey(),true);
      }
      return;
    }
    if(err?.type==='unavailable-id'){
      scheduleRejoin(current,2300);return;
    }
    console.warn('Peer error:',err?.type || err);
    if(!hasActivePeers())scheduleRejoin(current,4000);
    else setNote('Signaling problem; active voice connections are being preserved.');
  });
  p.on('close',()=>{if(isCurrent(current,p))scheduleRejoin(current,1800);});
}
function scheduleRejoin(current,delay) {
  if(current!==epoch || !channel || !microphone || retryTimer)return;
  retryTimer=setTimeout(()=>{retryTimer=null;if(current===epoch)rejoinNetwork();},delay);
}
function rejoinNetwork(){
  if(!channel || !microphone)return;
  ++epoch;clearNetwork();runningSince=Date.now();const current=epoch;
  note='Rejoining saved channel…';
  heartbeatTimer=setInterval(()=>tick(current),HEARTBEAT);
  beginPeer(current);renderRadio();
}
function tick(current){
  if(current!==epoch || !channel || !microphone)return;
  const now=Date.now();
  for(const [id,m] of [...members]){
    if(m.data?.open){
      if(now-m.lastSeen>STALE){removeMember(id);continue;}
      send(id,{type:'ping'});
    }else if(m.data && now-m.pendingAt>PENDING){
      removeMember(id,true);
    }
    if((m.call?.peerConnection?.iceConnectionState==='failed') || (m.call && !m.stream && now-(m.mediaPendingAt||now)>16000)){
      dropMedia(m);
    }
    if(m.data?.open && myId<id && !m.call)startMedia(id,current);
  }
  if(coordinator){
    if(floorId && floorId===myId && wantTalk)floorUpdated=now;
    if(floorId && now-floorUpdated>23000)changeFloor(null);
    if(!peer?.open && peer?.disconnected){try{peer.reconnect();}catch{}}
  }else{
    if(floorId===myId && wantTalk)send(leaderKey(),{type:'keep-floor'});
    const leader=members.get(leaderKey());
    if(!leader?.data?.open) {
      tryFindLeader(current);
      if(now-runningSince>NO_LEADER && now-(lastLeaderSeen||coordinatorPendingAt||runningSince)>NO_LEADER){
        scheduleRejoin(current,1000);
      }
    } else {
      ensureMesh(current);
    }
  }
  if(!document.hidden)renderRadio();
}
async function startChannel(c) {
  if(starting || !c || !validRoom(c.id))return;
  starting=true;readProfile();clearError();
  leaveChannel(false);
  starting=true;channel=c;runningSince=Date.now();note='Requesting microphone permission…';
  const current=++epoch;ui.home.classList.add('hidden');ui.radio.classList.remove('hidden');
  ui.title.textContent=c.title;ui.invite.value=inviteFor(c);renderRadio();
  try {
    if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
      throw Error('Microphone access requires HTTPS and a supported browser.');
    if(typeof window.Peer!=='function')throw Error('PeerJS could not load. Check your internet connection.');
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(current!==epoch){stream.getTracks().forEach(t=>t.stop());return;}
    microphone=stream;microphone.getAudioTracks().forEach(t=>{
      t.enabled=false;
      t.onended=()=>{releaseFloor();showError('Microphone disconnected. Rejoin to restore your mic.');};
    });
    note='Connecting to channel…';
    heartbeatTimer=setInterval(()=>tick(current),HEARTBEAT);
    beginPeer(current);renderRadio();
  } catch(err){
    const message=err?.message || 'Could not start the radio.';
    leaveChannel(false);showError(message);
  } finally{starting=false;}
}
function renderRadio() {
  if(!channel)return;
  // A signaling outage must not mute an already established WebRTC voice path.
  const ready=Boolean(microphone && isLeaderOnline());
  const people=[{id:myId,name:profile.name,color:profile.color,isMe:true},...([...members.values()].filter(m=>m.data?.open).map(m=>({id:m.id,name:m.name,color:m.color,isMe:false})))];
  ui.people.replaceChildren();
  for(const p of people){
    const el=document.createElement('div');el.className='participant'+(floorId===p.id?' speaking':'');
    el.style.setProperty('--member',p.color);el.style.setProperty('--speaker',p.color);
    const dot=document.createElement('div');dot.className='dot';
    const label=document.createElement('span');label.textContent=p.name+(p.isMe?' (you)':'');
    el.append(dot,label);
    if(floorId===p.id){const tag=document.createElement('b');tag.textContent='TALKING';el.append(tag);}
    ui.people.appendChild(el);
  }
  ui.count.textContent=people.length+' / '+MAX_PEOPLE;
  const speaker=floorId===myId?{name:profile.name,color:profile.color}:members.get(floorId);
  ui.speaker.classList.toggle('active',Boolean(floorId && speaker));
  ui.speaker.style.setProperty('--speaker',cleanColor(speaker?.color));
  ui.speakerName.textContent=speaker?.name || 'Channel idle';
  ui.speakerName.style.color=speaker?.color || '#edf7fc';
  ui.talk.disabled=!ready || Boolean(floorId && floorId!==myId);
  ui.talkText.textContent=transmitting?'TRANSMITTING':floorId && floorId!==myId?'LISTENING':wantTalk?'REQUESTING…':'HOLD TO TALK';
  ui.talkHint.textContent=transmitting?'Release to stop talking':floorId && floorId!==myId?'Wait for '+(speaker?.name||'the speaker')+' to finish':'Hold to talk. Release to listen.';
  if(!microphone) {ui.badge.textContent='Starting';ui.badge.className='status-badge';ui.status.textContent=note;}
  else if(!ready){ui.badge.textContent='Connecting';ui.badge.className='status-badge';ui.status.textContent=note || 'Finding this channel…';}
  else if(floorId){ui.badge.textContent='On air';ui.badge.className='status-badge busy';ui.status.textContent=(speaker?.name||'Someone')+' is transmitting';}
  else{ui.badge.textContent='Connected';ui.badge.className='status-badge connected';
    const receiving=people.slice(1).filter(p=>!members.get(p.id)?.stream).length;
    ui.status.textContent=people.length===1?'Ready • waiting for others to join':
      people.length+' people connected'+(receiving?' • linking '+receiving+' audio connection(s)':' • audio ready');}
}

ui.talk.addEventListener('pointerdown',event=>{
  if(event.button!==0 && event.pointerType==='mouse')return;
  event.preventDefault();try{ui.talk.setPointerCapture(event.pointerId);}catch{}
  requestFloor();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])ui.talk.addEventListener(name,releaseFloor);
window.addEventListener('pointerup',releaseFloor);
window.addEventListener('blur',releaseFloor);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){releaseFloor();return;}
  if(microphone && peer?.disconnected){try{peer.reconnect();}catch{}}
});
window.addEventListener('online',()=>{if(microphone && !isLeaderOnline())rejoinNetwork();});
window.addEventListener('pagehide',()=>{microphone?.getAudioTracks().forEach(t=>t.enabled=false);try{peer?.destroy();}catch{}});
ui.speakerButton.addEventListener('click',async()=>{
  let ok=0;
  for(const m of members.values())if(m.audio){try{await m.audio.play();ok++;}catch{}}
  ui.speakerButton.textContent=ok?'Speaker enabled':'Enable speaker';
  if(!ok && members.size)showError('Audio playback may be blocked. Increase volume or enable media playback in the browser.');
});
ui.reconnect.addEventListener('click',()=>{clearError();if(microphone)rejoinNetwork();});
ui.leave.addEventListener('click',()=>leaveChannel());
ui.switchChannel.addEventListener('click',()=>leaveChannel());
ui.copy.addEventListener('click',async()=>{if(!channel)return;await copyText(inviteFor(channel));
  ui.inviteMessage.textContent='Link copied. Other users can save and reuse it.';});
ui.share.addEventListener('click',async()=>{
  if(!channel)return;const link=inviteFor(channel);
  if(!navigator.share){await copyText(link);return;}
  try{await navigator.share({title:'Relay One: '+channel.title,text:'Join my walkie-talkie channel:',url:link});}
  catch(err){if(err?.name!=='AbortError')await copyText(link);}
});
