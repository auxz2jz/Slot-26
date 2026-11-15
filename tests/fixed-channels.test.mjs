import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import * as utils from '../room-utils.mjs';
import * as presets from '../channel-presets.mjs';
import {WebRTCUsageMeter,formatDataBytes} from '../usage-meter.mjs';

// Deterministic, in-memory PeerJS and browser stand-ins. Tests use no network or microphone.
class Events {
  constructor(){this.listeners={};}
  on(event,fn){(this.listeners[event]??=[]).push(fn);return this;}
  emit(event,...args){for(const fn of this.listeners[event]||[])fn(...args);}
}
class FakeElement {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.value='';this.textContent='';this.children=[];
    this.style={setProperty(){}};this.dataset={};this.disabled=false;this.checked=false;
    this.muted=false;this.attributes={};this.classes=new Set();
    this.classList={
      add:(...names)=>names.forEach(n=>this.classes.add(n)),
      remove:(...names)=>names.forEach(n=>this.classes.delete(n)),
      toggle:(name,force)=>{if(force===undefined)force=!this.classes.has(name);
        if(force)this.classes.add(name);else this.classes.delete(name);return force;}
    };
    this.listeners={};
  }
  addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
  append(...children){this.children.push(...children);}
  appendChild(child){this.children.push(child);}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  remove(){}
  pause(){}
  play(){return Promise.resolve();}
  setPointerCapture(){}
}
class FakeStream {
  constructor(tracks){this.tracks=tracks;}
  getAudioTracks(){return this.tracks;}
  getTracks(){return this.tracks;}
}
let trackNum=0;
function track(){
  const t={id:++trackNum,enabled:true,readyState:'live',stop(){this.readyState='ended';}};
  t.clone=function(){const c=track();c.enabled=t.enabled;return c;};
  return t;
}
const server=new Map();
let queue=[],jobs=new Map(),jobId=0,intervals=new Map();
function soon(fn,ms=0){const id=++jobId;jobs.set(id,fn);if(ms<=3000)queue.push(id);return id;}
function cancel(id){jobs.delete(id);}
function repeat(fn){const id=++jobId;intervals.set(id,fn);return id;}
function stopRepeat(id){intervals.delete(id);}
function flush(){
  let limit=4000;
  while(queue.length && limit--){
    const id=queue.shift(),fn=jobs.get(id);
    if(fn){jobs.delete(id);fn();}
  }
  assert.ok(limit>0,'unexpected recurring scheduling loop');
}
class DataConnection extends Events {
  constructor(peer){super();this.peer=peer;this.open=false;}
  send(message){if(this.open)soon(()=>this.other?.emit('data',message));}
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other?.open){this.other.open=false;this.other.emit('close');}}
}
class MediaConnection extends Events {
  constructor(peer,stream){super();this.peer=peer;this.localStream=stream;this.open=false;this.peerConnection={iceConnectionState:'connected'};}
  answer(stream){
    this.open=true;this.other.open=true;
    soon(()=>{this.emit('stream',this.other.localStream);this.other.emit('stream',stream);});
  }
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other?.open){this.other.open=false;this.other.emit('close');}}
}
class Peer extends Events {
  constructor(id){
    super();this.id=id;this.open=false;this.destroyed=false;this.disconnected=false;this.links=[];
    soon(()=>{if(server.has(id))this.emit('error',{type:'unavailable-id'});
      else{server.set(id,this);this.open=true;this.emit('open',id);}});
  }
  connect(dest){
    const out=new DataConnection(dest);this.links.push(out);
    soon(()=>{
      const p=server.get(dest);if(!p){this.emit('error',{type:'peer-unavailable'});return;}
      const inc=new DataConnection(this.id);p.links.push(inc);out.other=inc;inc.other=out;
      p.emit('connection',inc);
      soon(()=>{out.open=true;inc.open=true;out.emit('open');inc.emit('open');});
    });
    return out;
  }
  call(dest,stream){
    const out=new MediaConnection(dest,stream);this.links.push(out);
    soon(()=>{
      const p=server.get(dest);if(!p){this.emit('error',{type:'peer-unavailable'});return;}
      const inc=new MediaConnection(this.id,null);p.links.push(inc);out.other=inc;inc.other=out;p.emit('call',inc);
    });return out;
  }
  destroy(){
    if(this.destroyed)return;
    this.destroyed=true;this.open=false;
    if(server.get(this.id)===this)server.delete(this.id);
    for(const link of this.links)link.close();
    this.emit('close');
  }
  reconnect(){this.open=true;this.disconnected=false;this.emit('open',this.id);}
}
const source=readFileSync(new URL('../multi-radio.js',import.meta.url),'utf8')
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*/,'')
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*/,'')
  .replace(/^import\s*\{[\s\S]*?\}\s*from\s*'[^']+';\s*/,'');
const utilityNames=[
  'MAX_PEOPLE','PALETTE','validRoom','newRoom','cleanName','cleanTitle','cleanColor',
  'roomLink','leaderId','guestId','validGuestId','validMemberId','normalizeChannels',
  'validPin','deriveProtectedRoomId','CHANNEL_PRESETS','MAX_SELECTED_CHANNELS','checkChannelPin','WebRTCUsageMeter','formatDataBytes'
];
const environmentNames=[
  'document','window','navigator','localStorage','location','history','MediaStream',
  'URLSearchParams','setTimeout','clearTimeout','setInterval','clearInterval'
];
const appFactory=new Function(...utilityNames,...environmentNames,source+
  '\nreturn {joinChannel,leaveChannel,startPTT,releaseTalk,setMonitor,switchMode,modeAllows,maxActiveChannels,getMode:()=>radioMode,scanTick,setScan,browseChannel,setPttSide,getScreenId:displayChannelId,getFocusId:()=>focusedId,getScanEnabled:()=>scanEnabled,setTranscriptEnabled,getTranscripts:()=>transcriptEntries,sessions,ui,channels,rows};');
const utilsForTest={
  ...utils,...presets,WebRTCUsageMeter,formatDataBytes,
  checkChannelPin:(channel,pin)=>presets.checkChannelPin(channel,pin,webcrypto),
  newRoom:()=>utils.newRoom(webcrypto),
  guestId:id=>utils.guestId(id,utils.newRoom(webcrypto)),
  deriveProtectedRoomId:(id,pin)=>utils.deriveProtectedRoomId(id,pin,webcrypto)
};
function browser(name,rooms,speechSupported=true){
  const els=new Map();
  const document={hidden:false,body:{classList:{toggle(){}}},getElementById(id){if(!els.has(id))els.set(id,new FakeElement());return els.get(id);},
    createElement(tag){return new FakeElement(tag);},addEventListener(){}};
  const data=new Map([
    ['relay-one.profile.v4',JSON.stringify({name,color:utils.PALETTE[0]})],
    ['relay-one.channels.v4',JSON.stringify(rooms)]
  ]);
  const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const navigator={mediaDevices:{getUserMedia:async()=>new FakeStream([track()])},
    clipboard:{writeText:async()=>{}}};
  const recognitionInstances=[];
  class FakeRecognition{
    constructor(){this.started=false;this.stopped=false;recognitionInstances.push(this);}
    start(){this.started=true;}
    stop(){this.stopped=true;}
    fire(text,final=true,index=0){
      const result=[{transcript:text}];result.isFinal=final;
      this.onresult?.({resultIndex:index,results:[result]});
    }
  }
  const window={isSecureContext:true,Peer,addEventListener(){},
    SpeechRecognition:speechSupported?FakeRecognition:undefined,
    prompt(){return '1234';},confirm(){return true;}};
  const location={href:'https://example.invalid/Slot-26/',pathname:'/Slot-26/',search:''};
  const app=appFactory(...utilityNames.map(k=>utilsForTest[k]),document,window,navigator,
    localStorage,location,{replaceState(){}},FakeStream,URLSearchParams,
    soon,cancel,repeat,stopRepeat);
  return {...app,localStorage,recognitionInstances};

}
test('V6: overlapping preset channels isolate PTT and monitoring',async()=>{
  const a=presets.CHANNEL_PRESETS[0];
  const b=presets.CHANNEL_PRESETS[1];
  const clients=['Alice','Bob','Chris'].map(name=>browser(name,[a,b]));
  for(const c of clients){await c.joinChannel(a);flush();}
  for(const c of clients.slice(0,2)){await c.joinChannel(b);flush();}
  for(let i=0;i<3;i++){for(const tick of intervals.values())tick();flush();}
  assert.deepEqual(clients.map(c=>c.sessions.size),[2,2,1]);
  for(const c of clients){
    const s=c.sessions.get(a.id);
    assert.equal([...s.members.values()].filter(m=>m.data?.open).length,2);
    assert.equal([...s.members.values()].filter(m=>m.stream).length,2);
  }
  for(const c of clients.slice(0,2)){
    const s=c.sessions.get(b.id);
    assert.equal([...s.members.values()].filter(m=>m.data?.open).length,1);
    assert.equal([...s.members.values()].filter(m=>m.stream).length,1);
  }
  const aliceA=clients[0].sessions.get(a.id);
  const aliceB=clients[0].sessions.get(b.id);
  clients[0].startPTT(aliceA);flush();
  assert.equal(aliceA.track.enabled,true);
  assert.equal(aliceB.track.enabled,false,'other channel microphone must stay muted');
  for(const c of clients)assert.equal(c.sessions.get(a.id).floor,aliceA.myId);
  for(const c of clients.slice(0,2))assert.equal(c.sessions.get(b.id).floor,null);
  const otherAudio=[...aliceB.members.values()].filter(m=>m.audio);
  assert.ok(otherAudio.length>0);
  assert.ok(otherAudio.every(m=>m.audio.muted),'other monitored channel is ducked during PTT');
  clients[0].releaseTalk(aliceA);flush();
  assert.equal(aliceA.track.enabled,false);
  assert.equal(aliceB.track.enabled,false);
  assert.ok(otherAudio.every(m=>!m.audio.muted),'monitor restores after releasing PTT');
  clients[0].setMonitor(b.id,false);
  assert.ok(otherAudio.every(m=>m.audio.muted),'monitor toggle mutes its own channel');
  for(const c of clients)c.leaveChannel(a.id);
  for(const c of clients.slice(0,2))c.leaveChannel(b.id);
});

test('V6: all browsers have the identical ten shared channels, and a bad PIN prevents joining',async()=>{
  const secure=presets.CHANNEL_PRESETS[5];
  const person=browser('Visitor',[]);
  assert.equal(person.channels.length,10);
  assert.deepEqual(person.channels.map(c=>c.number),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(person.channels.filter(c=>c.secure).length,5);
  assert.equal(person.rows.size,10);
  assert.ok([...person.rows.values()].every(row=>row.select?.type==='checkbox'));
  assert.ok([...person.rows.values()].every(row=>!row.link&&!row.lock&&!row.forget));
  person.switchMode('advanced');
  await person.joinChannel(secure);flush();
  assert.equal(person.sessions.size,0,'incorrect four-digit PIN must not create any channel session');
  assert.match(person.ui.message.textContent,/Incorrect PIN/);
  // Unauthorized users cannot learn names/roster/talk activity just by viewing the channel list.
  assert.match(person.rows.get(secure.id).speaker.textContent,/Join to see (this )?channel/);
});

test('V6.3: Basic displays two channels, restricts joins, and Advanced exposes ten',async()=>{
  const [c1,c2,c3]=presets.CHANNEL_PRESETS;
  const basic=browser('Basic officer',[]);
  assert.equal(basic.getMode(),'basic');
  assert.equal(basic.maxActiveChannels(),2);
  assert.equal(basic.ui.channelModeBadge.textContent,'2 channels');
  assert.equal(basic.ui.basicMode.attributes['aria-pressed'],'true');
  assert.equal(basic.ui.advancedMode.attributes['aria-pressed'],'false');
  assert.equal(basic.rows.size,10);
  assert.equal(basic.rows.get(c1.id).box.classes.has('hidden'),false);
  assert.equal(basic.rows.get(c2.id).box.classes.has('hidden'),false);
  assert.equal(basic.rows.get(c3.id).box.classes.has('hidden'),true);
  assert.equal(basic.rows.get(c3.id).select.disabled,true);
  await basic.joinChannel(c3);flush();
  assert.equal(basic.sessions.size,0,'hidden advanced channel cannot connect in Basic mode');
  assert.match(basic.ui.message.textContent,/Switch to Advanced/);

  const advanced=browser('Advanced patrol',[]);
  advanced.switchMode('advanced');
  assert.equal(advanced.maxActiveChannels(),5);
  assert.equal(advanced.rows.get(c3.id).box.classes.has('hidden'),false);
  assert.equal(advanced.ui.channelModeBadge.textContent,'10 channels');
  assert.equal(JSON.parse(advanced.localStorage.getItem('relay-one.radio-mode.v6.3')),'advanced');

  await basic.joinChannel(c1);flush();
  await advanced.joinChannel(c1);flush();
  for(let i=0;i<2;i++){for(const tick of intervals.values())tick();flush();}
  assert.equal([...basic.sessions.get(c1.id).members.values()].filter(m=>m.data?.open).length,1,
    'Basic and Advanced users share identical underlying Channel 01');
  assert.equal([...advanced.sessions.get(c1.id).members.values()].filter(m=>m.data?.open).length,1);

  await advanced.joinChannel(c3);flush();
  assert.ok(advanced.sessions.has(c3.id));
  advanced.switchMode('basic');
  flush();
  assert.equal(advanced.sessions.has(c3.id),false,'Advanced-only channel must disconnect rather than remain invisible');
  assert.equal(advanced.sessions.has(c1.id),true,'Basic Channel 01 stays connected');
  assert.equal(advanced.rows.get(c3.id).box.classes.has('hidden'),true);
  assert.equal(advanced.localStorage.getItem('relay-one.radio-mode.v6.3'),JSON.stringify('basic'));
  assert.equal(advanced.ui.count.textContent,'1 / 2 joined');

  for(const app of [basic,advanced])for(const channel of [...app.sessions.keys()])app.leaveChannel(channel);
});

test('V6.3: Basic permits two channels, Advanced retains five simultaneous join slots',async()=>{
  const b=browser('Two-channel user',[]);
  const channels=presets.CHANNEL_PRESETS;
  await b.joinChannel(channels[0]);flush();
  await b.joinChannel(channels[1]);flush();
  assert.equal(b.sessions.size,2);
  assert.match(b.ui.count.textContent,/2 \/ 2 joined/);
  await b.joinChannel(channels[2]);flush();
  assert.equal(b.sessions.size,2,'third channel is not available in Basic');
  b.switchMode('advanced');
  await b.joinChannel(channels[2]);flush();
  assert.equal(b.sessions.size,3);
  assert.match(b.ui.count.textContent,/3 \/ 5 joined/);
  for(const id of [...b.sessions.keys()])b.leaveChannel(id);
});

test('V6.4: visual scanner cycles connected rooms without changing PTT target or WebRTC sessions',async()=>{
  const [a,b]=presets.CHANNEL_PRESETS;
  const device=browser('Scanner',[]);
  await device.joinChannel(a);flush();
  await device.joinChannel(b);flush();
  const connectedA=device.sessions.get(a.id),connectedB=device.sessions.get(b.id);
  const initialFocused=device.getFocusId();
  assert.equal(initialFocused,a.id);
  device.setScan(true);
  assert.equal(device.getScreenId(),a.id);
  assert.equal(device.ui.radioJoin.disabled,true,'scan preview must not allow accidental leave');
  assert.equal(device.ui.radioMonitor.disabled,true,'monitor edit is disabled during scan');
  device.scanTick(Date.now()+1800);
  assert.equal(device.getScreenId(),b.id,'radio display should appear to scan channels');
  assert.equal(device.getFocusId(),a.id,'visual sweep cannot silently retarget PTT');
  assert.equal(device.ui.radioPttTarget.textContent,'PTT TARGET: CH 01');
  assert.equal(device.sessions.get(a.id),connectedA);
  assert.equal(device.sessions.get(b.id),connectedB);
  assert.equal(device.sessions.size,2,'scan never disconnects monitored channels');
  assert.equal(device.ui.radioScan.attributes['aria-pressed'],'true');
  device.setPttSide('left');
  assert.ok(device.ui.radioHousing.classes.has('left-handed'));
  assert.equal(JSON.parse(device.localStorage.getItem('relay-one.ptt-side.v6.4')),'left');
  device.browseChannel(-1);
  assert.equal(device.getScanEnabled(),false,'physical channel selector exits scan intentionally');
  assert.equal(device.getFocusId(),b.id,'manual button targets selected channel');
  for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});

test('V6.4: monitored incoming PTT instantly pops up channel and allows reply, without reconnecting',async()=>{
  const [a,b]=presets.CHANNEL_PRESETS;
  const viewer=browser('Scanning patrol',[]);
  const sender=browser('Site officer',[]);
  for(const client of [viewer,sender]){
    await client.joinChannel(a);flush();
    await client.joinChannel(b);flush();
  }
  for(let i=0;i<2;i++){for(const tick of intervals.values())tick();flush();}
  const aSession=viewer.sessions.get(a.id),bSession=viewer.sessions.get(b.id);
  viewer.setScan(true);
  assert.equal(viewer.getFocusId(),a.id);
  sender.startPTT(sender.sessions.get(b.id));flush();
  viewer.scanTick();
  assert.equal(viewer.getScreenId(),b.id,'incoming monitored channel takes over display');
  assert.equal(viewer.getFocusId(),b.id,'PTT is deliberately targeted to active received channel for reply');
  assert.equal(viewer.ui.screenScan.textContent,'RECEIVING');
  assert.match(viewer.ui.focusSpeaker.textContent,/Site officer/);
  assert.equal(viewer.sessions.get(a.id),aSession);
  assert.equal(viewer.sessions.get(b.id),bSession);
  assert.equal(viewer.sessions.size,2);
  sender.releaseTalk(sender.sessions.get(b.id));flush();
  viewer.startPTT(bSession);flush();
  assert.equal(bSession.track.enabled,true,'reply should use active channel');
  assert.equal(aSession.track.enabled,false,'unrelated monitored channel must never transmit');
  assert.equal(viewer.getScreenId(),b.id,'scanner stays on target while PTT held');
  viewer.releaseTalk(bSession);flush();
  assert.equal(bSession.track.enabled,false,'release must stop transmission');
  for(const device of [viewer,sender])for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});

test('V6.4: scan ignores muted channels and only presents joined, monitored activity',async()=>{
  const [a,b]=presets.CHANNEL_PRESETS;
  const listener=browser('Listener',[]),speaker=browser('Other',[]);
  await listener.joinChannel(a);flush();
  await listener.joinChannel(b);flush();
  await speaker.joinChannel(b);flush();
  listener.setMonitor(b.id,false);
  listener.setScan(true);
  assert.equal(listener.getScreenId(),a.id);
  speaker.startPTT(speaker.sessions.get(b.id));flush();
  listener.scanTick();
  assert.equal(listener.getScreenId(),a.id,'muted channel transmission must not pop up');
  assert.equal(listener.getFocusId(),a.id);
  for(const device of [listener,speaker])for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});

test('V6.5: sender opt-in transcribes PTT without affecting voice or remote monitor, recipient gets RX callsign',async()=>{
  const channel=presets.CHANNEL_PRESETS[0];
  const sender=browser('Patrol 1',[]),receiver=browser('Dispatch',[]);
  await sender.joinChannel(channel);flush();
  await receiver.joinChannel(channel);flush();
  for(let i=0;i<3;i++){for(const tick of intervals.values())tick();flush();}
  assert.equal(sender.getTranscripts().length,0);
  assert.equal(receiver.getTranscripts().length,0);
  sender.setTranscriptEnabled(true);
  const s=sender.sessions.get(channel.id),r=receiver.sessions.get(channel.id);
  sender.startPTT(s);flush();
  assert.equal(s.track.enabled,true,'voice transmission remains immediate and independent');
  assert.equal(sender.recognitionInstances.length,1,'sender speech recognition starts on PTT');
  assert.equal(receiver.recognitionInstances.length,0,'receivers do not independently recognize incoming speech');
  const recognition=sender.recognitionInstances[0];
  assert.ok(recognition.started);
  recognition.fire('  North entrance clear.  ');
  flush();
  assert.equal(sender.getTranscripts().length,1);
  assert.equal(receiver.getTranscripts().length,1);
  assert.deepEqual(sender.getTranscripts().map(x=>[x.direction,x.name,x.channel,x.text]),
    [['tx','Patrol 1','Channel 01','North entrance clear.']]);
  assert.deepEqual(receiver.getTranscripts().map(x=>[x.direction,x.name,x.channel,x.text]),
    [['rx','Patrol 1','Channel 01','North entrance clear.']]);
  assert.ok(receiver.ui.transcriptLog.children.length>0,'scrollable conversation receives bubbles');
  assert.equal(r.track.enabled,false,'listening phone never transmits');
  assert.equal(sender.getTranscripts()[0].text,'North entrance clear.');
  sender.releaseTalk(s);flush();
  assert.equal(s.track.enabled,false);
  assert.equal(recognition.stopped,true);
  recognition.fire('Second sentence after release',true,1);
  flush();
  assert.equal(sender.getTranscripts().length,2,'late final transcript should still be appended');
  assert.equal(receiver.getTranscripts().length,2);
  for(const device of [sender,receiver])for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});
test('V6.5: transcript ignores interim duplicates and muted channels; persistence is opt-in',async()=>{
  const c=presets.CHANNEL_PRESETS[1];
  const a=browser('Patrol A',[]),b=browser('Patrol B',[]);
  await a.joinChannel(c);flush();
  await b.joinChannel(c);flush();
  for(let i=0;i<2;i++){for(const tick of intervals.values())tick();flush();}
  a.setTranscriptEnabled(true);
  a.startPTT(a.sessions.get(c.id));flush();
  const speech=a.recognitionInstances[0];
  speech.fire('incomplete...',false);flush();
  assert.equal(a.getTranscripts().length,0);
  speech.fire('Channel is clear.',true);flush();
  speech.fire('Channel is clear.',true);flush();
  assert.equal(a.getTranscripts().length,1,'one final recognition index generates one caption');
  assert.equal(b.getTranscripts().length,1);
  assert.equal(a.localStorage.getItem('relay-one.transcripts.v6.5'),null,'no persistent log by default');
  assert.equal(a.ui.transcriptKeep.checked,false);
  a.ui.transcriptKeep.checked=true;
  a.ui.transcriptKeep.listeners.change[0]();
  assert.equal(JSON.parse(a.localStorage.getItem('relay-one.transcripts.v6.5')).length,1);
  b.setMonitor(c.id,false);
  a.releaseTalk(a.sessions.get(c.id));
  a.startPTT(a.sessions.get(c.id));flush();
  a.recognitionInstances[1].fire('This is muted for B.');flush();
  assert.equal(b.getTranscripts().length,1,'muted channel ignores text as well as voice');
  a.releaseTalk(a.sessions.get(c.id));
  a.ui.transcriptKeep.checked=false;a.ui.transcriptKeep.listeners.change[0]();
  assert.equal(a.localStorage.getItem('relay-one.transcripts.v6.5'),null);
  a.ui.transcriptClear.listeners.click[0]();
  assert.equal(a.getTranscripts().length,0);
  for(const device of [a,b])for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});
test('V6.5: speech recognition missing does not disable the PTT microphone',async()=>{
  const c=presets.CHANNEL_PRESETS[0];
  const a=browser('Unsupported phone',[],false);
  await a.joinChannel(c);flush();
  a.setTranscriptEnabled(true);
  assert.match(a.ui.transcriptStatus.textContent,/unavailable/);
  const s=a.sessions.get(c.id);
  a.startPTT(s);flush();
  assert.equal(s.track.enabled,true,'voice must work normally even when speech APIs are unavailable');
  assert.equal(a.recognitionInstances.length,0);
  a.releaseTalk(s);flush();
  assert.equal(s.track.enabled,false);
  a.leaveChannel(c.id);
});
