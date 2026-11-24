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
      contains:name=>this.classes.has(name),
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
  'URLSearchParams','Worker','setTimeout','clearTimeout','setInterval','clearInterval'
];
const appFactory=new Function(...utilityNames,...environmentNames,source+
  '\nreturn {joinChannel,leaveChannel,startPTT,releaseTalk,setMonitor,switchMode,modeAllows,maxActiveChannels,getMode:()=>radioMode,scanTick,setScan,browseChannel,setPttSide,getScreenId:displayChannelId,getFocusId:()=>focusedId,getScanEnabled:()=>scanEnabled,setTranscriptEnabled,setTranscriptMode,loadLocalAsr,hardwareDiagnosticReport,diagnosticReport,checkInternetReachability,networkStatsLine,sampleDataUsage,watchNetworkPeer,setPTTOnlyMicrophone,getPTTOnlyMicrophone:()=>pttOnlyMicrophone,getAsrState:()=>asrState,getAsrStats:()=>asrStats,getTranscripts:()=>transcriptEntries,getTranscriptPopupOpen:()=>transcriptPopupOpen,speechDiagnosticReport,getSpeechStats:()=>speechStats,sessions,ui,channels,rows};');
const utilsForTest={
  ...utils,...presets,WebRTCUsageMeter,formatDataBytes,
  checkChannelPin:(channel,pin)=>presets.checkChannelPin(channel,pin,webcrypto),
  newRoom:()=>utils.newRoom(webcrypto),
  guestId:id=>utils.guestId(id,utils.newRoom(webcrypto)),
  deriveProtectedRoomId:(id,pin)=>utils.deriveProtectedRoomId(id,pin,webcrypto)
};
function browser(name,rooms,speechSupported=true,options={}){
  const els=new Map();
  const document={hidden:false,body:{classList:{toggle(){}}},getElementById(id){if(!els.has(id))els.set(id,new FakeElement());return els.get(id);},
    createElement(tag){return new FakeElement(tag);},addEventListener(){}};
  const data=new Map([
    ['relay-one.profile.v4',JSON.stringify({name,color:utils.PALETTE[0]})],
    ['relay-one.channels.v4',JSON.stringify(rooms)]
  ]);
  const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  const mediaRequests=[];
  let resolveNextMic=null;
  let simulatedMicFailure=false;
  const navigator={mediaDevices:{getUserMedia:()=>{
    if(options.firstMicNotReadable && !simulatedMicFailure){
      simulatedMicFailure=true;
      return Promise.reject(Object.assign(new Error('Could not start audio source'),{name:'NotReadableError'}));
    }
    return options.deferMic?new Promise(resolve=>{
      resolveNextMic=()=>{const t=track();mediaRequests.push(t);resolve(new FakeStream([t]));};
    }):Promise.resolve((()=>{const t=track();mediaRequests.push(t);return new FakeStream([t]);})())},
    clipboard:{writeText:async()=>{}}};
  const recognitionInstances=[];
  class FakeRecognition{
    constructor(){this.started=false;this.stopped=false;recognitionInstances.push(this);}
    start(){this.started=true;}
    stop(){this.stopped=true;}
    fire(text,final=true,index=0){
      const result=[{transcript:text}];result.isFinal=final;
      const results=Array.from({length:index+1},()=>null);results[index]=result;
      this.onresult?.({resultIndex:index,results});
    }
  }
  const workerInstances=[];
  const toneStarts=[];
  class FakeWorker{
    constructor(path,config){this.path=path;this.config=config;this.sent=[];workerInstances.push(this);}
    postMessage(msg){
      this.sent.push(msg);
      if(msg.type==='load')soon(()=>this.onmessage?.({data:{type:'engine-state',state:'ready',message:'Mock Whisper ready'}}));
      if(msg.type==='transcribe')soon(()=>this.onmessage?.({data:{type:'job-result',id:msg.id,text:'Clear on channel one'}}));
    }
    terminate(){this.terminated=true;}
  }
  class FakeRecorder{
    static isTypeSupported(){return true;}
    constructor(stream){this.stream=stream;this.state='inactive';this.mimeType='audio/webm';}
    start(){this.state='recording';}
    stop(){
      this.state='inactive';
      soon(()=>{
        this.ondataavailable?.({data:new Blob([new Uint8Array(3200)],{type:this.mimeType})});
        this.onstop?.();
      });
    }
  }
  class FakeAudioContext{
    constructor(){this.state=options.delayedAudioResume?'suspended':'running';this.currentTime=0;this.destination={};}
    createOscillator(){return {
      type:'sine',
      frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
      connect(){},start(){toneStarts.push(true);},stop(){}
    };}
    createMediaStreamDestination(){return {stream:new FakeStream([track()])};}
    createConstantSource(){
      return {start(){},stop(){this.stopped=true;},connect(){},disconnect(){}};
    }
    createGain(){
      return {gain:{value:1,setValueAtTime(){},linearRampToValueAtTime(){},
        exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};
    }
    createMediaStreamSource(stream){
      return {stream,connect(dest){this.destination=dest;},disconnect(){this.destination=null;}};
    }
    resume(){if(options.delayedAudioResume)return Promise.resolve().then(()=>{this.state='running';});this.state='running';return Promise.resolve();}
    decodeAudioData(){
      const audio=new Float32Array(16000).fill(0.18);
      return Promise.resolve({sampleRate:16000,length:16000,numberOfChannels:1,
        duration:1,getChannelData:()=>audio});
    }
    close(){this.state='closed';return Promise.resolve();}
  }
  const windowListeners={};
  const window={isSecureContext:true,Peer,fetch:options.fetch,addEventListener(type,fn){(windowListeners[type]??=[]).push(fn);},
    SpeechRecognition:speechSupported?FakeRecognition:undefined,
    MediaRecorder:options.local?FakeRecorder:undefined,
    AudioContext:options.local||options.pttMic?FakeAudioContext:undefined,
    prompt(){return '1234';},confirm(){return true;}};
  const location={href:'https://example.invalid/Slot-26/',pathname:'/Slot-26/',search:''};
  const app=appFactory(...utilityNames.map(k=>utilsForTest[k]),document,window,navigator,
    localStorage,location,{replaceState(){}},FakeStream,URLSearchParams,FakeWorker,
    soon,cancel,repeat,stopRepeat);
  return {...app,localStorage,recognitionInstances,workerInstances,
    mediaRequests,resolveNextMic:()=>resolveNextMic?.(),toneStarts,
    fireWindow:(type,props={})=>{
      const event={target:{tagName:'BODY'},key:'F8',code:'F8',preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...props};
      for(const fn of windowListeners[type]||[])fn(event);return event;
    }};

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
  sender.setTranscriptMode('browser');sender.setTranscriptEnabled(true);
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
  assert.equal(sender.getTranscriptPopupOpen(),false,'do not cover PTT while the speaker is transmitting');
  assert.equal(receiver.getTranscriptPopupOpen(),true,'incoming text opens the scrollable popup');
  assert.ok(receiver.ui.transcriptPopupLog.children.length>=1);
  assert.deepEqual(sender.getTranscripts().map(x=>[x.direction,x.name,x.channel,x.text]),
    [['tx','Patrol 1','Channel 01','North entrance clear.']]);
  assert.deepEqual(receiver.getTranscripts().map(x=>[x.direction,x.name,x.channel,x.text]),
    [['rx','Patrol 1','Channel 01','North entrance clear.']]);
  assert.ok(receiver.ui.transcriptLog.children.length>0,'scrollable conversation receives bubbles');
  assert.equal(r.track.enabled,false,'listening phone never transmits');
  assert.equal(sender.getTranscripts()[0].text,'North entrance clear.');
  sender.releaseTalk(s);flush();
  assert.equal(s.track.enabled,false);
  assert.equal(sender.getTranscriptPopupOpen(),true,'local finalized text pops up after Talk released');
  sender.ui.transcriptClose.listeners.click[0]();
  assert.equal(sender.getTranscriptPopupOpen(),false);
  sender.ui.transcriptOpen.listeners.click[0]();
  assert.equal(sender.getTranscriptPopupOpen(),true);
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
  a.setTranscriptMode('browser');a.setTranscriptEnabled(true);
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
  a.setTranscriptMode('browser');a.setTranscriptEnabled(true);
  assert.match(a.ui.transcriptStatus.textContent,/unavailable/);
  const s=a.sessions.get(c.id);
  a.startPTT(s);flush();
  assert.equal(s.track.enabled,true,'voice must work normally even when speech APIs are unavailable');
  assert.equal(a.recognitionInstances.length,0);
  a.releaseTalk(s);flush();
  assert.equal(s.track.enabled,false);
  a.leaveChannel(c.id);
});

test('V6.5: auto-popup preference can be disabled while transcript continues collecting',async()=>{
  const c=presets.CHANNEL_PRESETS[0];
  const tx=browser('Speaker',[]),rx=browser('Listener',[]);
  await tx.joinChannel(c);flush();
  await rx.joinChannel(c);flush();
  for(let i=0;i<2;i++){for(const tick of intervals.values())tick();flush();}
  tx.setTranscriptMode('browser');tx.setTranscriptEnabled(true);
  rx.ui.transcriptAutoPopup.checked=false;
  rx.ui.transcriptAutoPopup.listeners.change[0]();
  tx.startPTT(tx.sessions.get(c.id));flush();
  tx.recognitionInstances[0].fire('Dispatch copies');flush();
  assert.equal(rx.getTranscripts().length,1);
  assert.equal(rx.getTranscriptPopupOpen(),false,'recipient opted out of pop-up');
  assert.equal(JSON.parse(rx.localStorage.getItem('relay-one.transcript-popup.v6.5')),false);
  assert.equal(tx.sessions.get(c.id).track.enabled,true,'voice remains live with text enabled');
  tx.releaseTalk(tx.sessions.get(c.id));flush();
  for(const device of [tx,rx])for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});

test('V6.6: speech diagnostics show browser capabilities and individual recognition milestones',async()=>{
  const a=browser('Testing speech',[]);
  const ch=presets.CHANNEL_PRESETS[0];
  await a.joinChannel(ch);flush();
  a.setTranscriptMode('browser');a.setTranscriptEnabled(true);
  const session=a.sessions.get(ch.id);
  a.startPTT(session);flush();
  assert.equal(session.track.enabled,true);
  const recognizer=a.recognitionInstances[0];
  recognizer.onstart?.();
  recognizer.onaudiostart?.();
  recognizer.onspeechstart?.();
  recognizer.fire('Visible only in conversation');
  flush();
  a.releaseTalk(session);flush();
  recognizer.onend?.();
  const report=a.speechDiagnosticReport();
  assert.match(report,/SpeechRecognition: present/);
  assert.match(report,/Recognition attempts: 1/);
  assert.match(report,/Recognition started callbacks: 1/);
  assert.match(report,/Audio started callbacks: 1/);
  assert.match(report,/Speech detected callbacks: 1/);
  assert.match(report,/Final result chunks: 1/);
  assert.match(report,/RECOGNITION STOP REQUESTED/);
  assert.ok(!report.includes('Visible only in conversation'),
    'speech diagnostics must not contain transcript text');
  assert.match(a.ui.speechDiagSummary.textContent,/Final results: 1/);
  assert.equal(a.getTranscripts().length,1);
  a.leaveChannel(ch.id);
});
test('V6.6: microphone-free radio test verifies recognizer without sending or saving speech',async()=>{
  const a=browser('Testing only',[]);
  assert.equal(a.sessions.size,0);
  a.ui.speechTest.listeners.click[0]();
  const recognizer=a.recognitionInstances[0];
  assert.equal(recognizer.started,true);
  recognizer.onstart?.();
  recognizer.onaudiostart?.();
  recognizer.onspeechstart?.();
  recognizer.fire('One two three');
  assert.match(a.ui.speechTestPreview.textContent,/One two three/);
  assert.equal(a.getTranscripts().length,0,'test text is not part of radio transcript');
  assert.match(a.speechDiagnosticReport(),/Local test final chunks: 1/);
  assert.ok(!a.speechDiagnosticReport().includes('One two three'),'no spoken words in diagnostic export');
  a.ui.speechTest.listeners.click[0]();
  recognizer.onend?.();
  assert.equal(recognizer.stopped,true);
  assert.match(a.ui.speechTest.textContent,/Test speech recognition/);
});
test('V6.6: speech errors persist after recognition ends and do not silence voice',async()=>{
  const a=browser('Permission test',[]);
  const ch=presets.CHANNEL_PRESETS[0];
  await a.joinChannel(ch);flush();
  a.setTranscriptMode('browser');a.setTranscriptEnabled(true);
  const session=a.sessions.get(ch.id);
  a.startPTT(session);flush();
  const recognition=a.recognitionInstances[0];
  recognition.onerror?.({error:'not-allowed'});
  recognition.onend?.();
  assert.match(a.ui.transcriptStatus.textContent,/not-allowed/);
  assert.match(a.speechDiagnosticReport(),/Last recognition error: not-allowed/);
  assert.equal(session.track.enabled,true,'the radio microphone is still on while PTT is held');
  a.releaseTalk(session);flush();
  assert.equal(session.track.enabled,false);
  a.leaveChannel(ch.id);
});

test('V6.7: shared microphone local Whisper recording preserves live PTT and distributes later transcript',async()=>{
  const channel=presets.CHANNEL_PRESETS[0];
  const sender=browser('Patrol 1',[],true,{local:true});
  const receiver=browser('Dispatch',[]);
  await sender.joinChannel(channel);flush();
  await receiver.joinChannel(channel);flush();
  for(let i=0;i<3;i++){for(const tick of intervals.values())tick();flush();}
  assert.equal(sender.ui.transcriptEngine.value,'local');
  sender.setTranscriptEnabled(true);
  sender.loadLocalAsr();flush();
  assert.equal(sender.getAsrState(),'ready');
  assert.equal(sender.workerInstances.length,1);
  const session=sender.sessions.get(channel.id);
  sender.startPTT(session);flush();
  assert.equal(session.track.enabled,true,'live radio voice must transmit immediately');
  assert.equal(sender.getAsrStats().recorded,1,'PTT floor triggers recording from existing microphone');
  assert.equal(sender.recognitionInstances.length,0,'on-device engine must never open a second speech microphone');
  sender.releaseTalk(session);flush();
  assert.equal(session.track.enabled,false,'PTT release must immediately mute voice');
  for(let i=0;i<6;i++){await new Promise(resolve=>setTimeout(resolve,2));flush();}
  assert.equal(sender.getAsrStats().completed,1,'worker completes queued local transcript');
  assert.equal(sender.getTranscripts().length,1);
  assert.equal(receiver.getTranscripts().length,1,'remote listener receives caption via existing data channel');
  assert.equal(sender.getTranscripts()[0].direction,'tx');
  assert.equal(receiver.getTranscripts()[0].direction,'rx');
  assert.equal(receiver.getTranscripts()[0].name,'Patrol 1');
  assert.equal(sender.getAsrStats().errors,0);
  assert.match(sender.speechDiagnosticReport(),/On-device inference completed: 1/);
  for(const device of [sender,receiver])for(const id of [...device.sessions.keys()])device.leaveChannel(id);
});

test('V6.7: without explicit model load, PTT still works and never downloads a model',async()=>{
  const channel=presets.CHANNEL_PRESETS[0];
  const radio=browser('Patrol 1',[],true,{local:true});
  await radio.joinChannel(channel);flush();
  radio.setTranscriptEnabled(true);
  const s=radio.sessions.get(channel.id);
  radio.startPTT(s);flush();
  assert.equal(s.track.enabled,true);
  assert.equal(radio.workerInstances.length,0,'joining or enabling captions never starts a large download');
  assert.equal(radio.getAsrStats().recorded,0,'no recording if model not ready');
  radio.releaseTalk(s);flush();
  assert.equal(s.track.enabled,false);
  radio.leaveChannel(channel.id);
});


function buttonPulse(app,{key='MediaPlayPause',code='',hold=145,t=100}={}){
  app.fireWindow('keydown',{key,code,timeStamp:t});flush();
  app.fireWindow('keyup',{key,code,timeStamp:t+hold});flush();
}
test('V6.12: V6.7 direct mic stays open while joined and never reopens on media toggle',async()=>{
  const c=presets.CHANNEL_PRESETS[0],a=browser('Media headset',[]);
  await a.joinChannel(c);flush();const s=a.sessions.get(c.id);
  const track=a.mediaRequests[0];assert.equal(a.mediaRequests.length,1);
  assert.equal(track.readyState,'live');assert.equal(s.track.enabled,false);
  a.ui.hardwareLearn.listeners.click[0]();buttonPulse(a);
  assert.equal(s.transmitting,false);assert.equal(a.ui.hardwareEnabled.disabled,false);
  assert.match(a.hardwareDiagnosticReport(),/External button mode: toggle/);
  a.ui.hardwareEnabled.checked=true;a.ui.hardwareEnabled.listeners.change[0]();
  buttonPulse(a,{t:1000});assert.equal(s.transmitting,true);assert.equal(s.track.enabled,true);
  assert.equal(a.mediaRequests.length,1);
  buttonPulse(a,{t:2000});assert.equal(s.transmitting,false);assert.equal(s.track.enabled,false);
  assert.equal(track.readyState,'live');assert.equal(a.mediaRequests.length,1);
  buttonPulse(a,{t:3000});a.ui.hardwareStop.listeners.click[0]();flush();assert.equal(s.transmitting,false);
  a.leaveChannel(c.id);assert.equal(track.readyState,'ended');
});
test('V6.12: genuine held keyboard button automatically maps to direct hold-to-talk',async()=>{
  const c=presets.CHANNEL_PRESETS[0],a=browser('Held PTT',[]);
  await a.joinChannel(c);flush();const s=a.sessions.get(c.id);
  a.ui.hardwareLearn.listeners.click[0]();buttonPulse(a,{key:'F8',code:'F8',hold:1000});
  assert.match(a.hardwareDiagnosticReport(),/External button mode: hold/);
  a.ui.hardwareEnabled.checked=true;a.ui.hardwareEnabled.listeners.change[0]();
  a.fireWindow('keydown',{key:'F8',code:'F8'});flush();assert.equal(s.transmitting,true);
  a.fireWindow('keyup',{key:'F8',code:'F8'});flush();assert.equal(s.transmitting,false);
  a.leaveChannel(c.id);
});
test('V6.12: external toggle keeps original Whisper shared microphone and captions',async()=>{
  const c=presets.CHANNEL_PRESETS[0],tx=browser('Headset caption',[],true,{local:true}),rx=browser('Dispatch',[]);
  await tx.joinChannel(c);flush();await rx.joinChannel(c);flush();
  for(let i=0;i<3;i++){for(const tick of intervals.values())tick();flush();}
  tx.setTranscriptEnabled(true);tx.loadLocalAsr();flush();
  tx.ui.hardwareLearn.listeners.click[0]();buttonPulse(tx);
  tx.ui.hardwareEnabled.checked=true;tx.ui.hardwareEnabled.listeners.change[0]();
  buttonPulse(tx,{t:1000});assert.equal(tx.sessions.get(c.id).transmitting,true);
  buttonPulse(tx,{t:2000});assert.equal(tx.sessions.get(c.id).transmitting,false);
  for(let i=0;i<6;i++){await new Promise(resolve=>setTimeout(resolve,2));flush();}
  assert.equal(tx.mediaRequests.length,1);assert.equal(tx.getAsrStats().completed,1);
  assert.equal(rx.getTranscripts().length,1);
  tx.leaveChannel(c.id);rx.leaveChannel(c.id);
});
test('V6.12: external toggle fails closed on focus loss or watchdog',async()=>{
  const c=presets.CHANNEL_PRESETS[0],a=browser('Headset safety',[]);
  await a.joinChannel(c);flush();const s=a.sessions.get(c.id);
  a.ui.hardwareLearn.listeners.click[0]();buttonPulse(a);
  a.ui.hardwareEnabled.checked=true;a.ui.hardwareEnabled.listeners.change[0]();
  buttonPulse(a,{t:1000});assert.equal(s.transmitting,true);
  a.fireWindow('blur');flush();assert.equal(s.transmitting,false);
  buttonPulse(a,{t:2000});assert.equal(s.transmitting,true);
  const watchdog=[...jobs.entries()].filter(([id])=>!queue.includes(id)).at(-1);
  assert.ok(watchdog);watchdog[1]();flush();assert.equal(s.transmitting,false);
  assert.match(a.hardwareDiagnosticReport(),/Safety timeouts: 1/);
  a.leaveChannel(c.id);
});

test('V6.8: PTT-only microphone never opens hardware on join and releases it after each press',async()=>{
  const channel=presets.CHANNEL_PRESETS[0];
  const radio=browser('PTT Only',[],true,{pttMic:true});
  await radio.setPTTOnlyMicrophone(true);flush();
  assert.equal(radio.getPTTOnlyMicrophone(),true);
  assert.equal(radio.ui.pttOnlyMicrophone.checked,true);
  await radio.joinChannel(channel);flush();
  const s=radio.sessions.get(channel.id);
  assert.equal(radio.mediaRequests.length,0,'join must not call getUserMedia');
  assert.equal(s.track.readyState,'live','silent WebRTC track stays available');
  assert.equal(s.track.enabled,false);
  radio.startPTT(s);flush();
  assert.equal(s.track.enabled,false,'audio waits until microphone permission is granted');
  await Promise.resolve();flush();
  assert.equal(radio.mediaRequests.length,1,'first Talk opens real mic exactly once');
  assert.equal(radio.mediaRequests[0].readyState,'live');
  assert.equal(s.track.enabled,true,'mic is routed to the existing channel track when ready');
  assert.equal(s.transmitting,true);
  radio.releaseTalk(s);flush();
  assert.equal(radio.mediaRequests[0].readyState,'ended','hardware microphone must be stopped on release');
  assert.equal(s.track.readyState,'live','WebRTC standby placeholder remains live after release');
  assert.equal(s.track.enabled,false);
  assert.equal(s.pttInputStream,null);
  radio.startPTT(s);flush();
  await Promise.resolve();flush();
  assert.equal(radio.mediaRequests.length,2,'second Talk must reacquire mic');
  assert.equal(s.track.enabled,true);
  radio.releaseTalk(s);flush();
  assert.equal(radio.mediaRequests[1].readyState,'ended');
  radio.leaveChannel(channel.id);
  assert.equal(s.track.readyState,'ended','session should release silent placeholder on leave');
});
test('V6.8: releasing Talk before microphone grant cancels capture and never opens transmitting audio',async()=>{
  const channel=presets.CHANNEL_PRESETS[0];
  const radio=browser('Quick tap',[],true,{pttMic:true,deferMic:true});
  await radio.setPTTOnlyMicrophone(true);
  await radio.joinChannel(channel);flush();
  const s=radio.sessions.get(channel.id);
  radio.startPTT(s);flush();
  assert.equal(s.track.enabled,false,'PTT waiting for permission');
  radio.releaseTalk(s);flush();
  assert.equal(s.track.enabled,false);
  radio.resolveNextMic();
  await Promise.resolve();flush();
  assert.equal(radio.mediaRequests[0].readyState,'ended','late mic approval immediately stops the hardware track');
  assert.equal(s.track.enabled,false);
  assert.equal(s.transmitting,false);
  radio.leaveChannel(channel.id);
});
test('V6.8: switch microphone modes reconnects joined channels and restores original fast PTT behavior',async()=>{
  const channel=presets.CHANNEL_PRESETS[0];
  const radio=browser('Toggle test',[],true,{pttMic:true});
  await radio.joinChannel(channel);flush();
  const original=radio.sessions.get(channel.id);
  assert.equal(radio.getPTTOnlyMicrophone(),false);
  assert.equal(radio.mediaRequests.length,1,'default mode opens mic when joining');
  await radio.setPTTOnlyMicrophone(true);flush();
  const standby=radio.sessions.get(channel.id);
  assert.notEqual(standby,original,'mode change reconnects once');
  assert.equal(original.track.readyState,'ended');
  assert.equal(radio.mediaRequests[0].readyState,'ended','old always-ready mic released');
  assert.equal(radio.mediaRequests.length,1,'no mic request after switching to PTT only');
  radio.startPTT(standby);flush();
  await Promise.resolve();flush();
  assert.equal(radio.mediaRequests.length,2);
  radio.releaseTalk(standby);flush();
  await radio.setPTTOnlyMicrophone(false);flush();
  assert.equal(radio.getPTTOnlyMicrophone(),false);
  assert.equal(radio.ui.pttOnlyMicrophone.checked,false);
  assert.equal(radio.mediaRequests.length,3,'always-ready mode reacquires base microphone on rejoin');
  const fast=radio.sessions.get(channel.id);
  radio.startPTT(fast);flush();
  assert.equal(fast.transmitting,true,'original fast PTT still works');
  radio.releaseTalk(fast);
  radio.leaveChannel(channel.id);
});
test('V6.8: on-demand microphone still supports delayed on-device Whisper with remote captions',async()=>{
  const c=presets.CHANNEL_PRESETS[0];
  const tx=browser('Patrol',[],true,{pttMic:true,local:true});
  const rx=browser('Dispatch',[]);
  await tx.setPTTOnlyMicrophone(true);
  await tx.joinChannel(c);flush();
  await rx.joinChannel(c);flush();
  for(let i=0;i<3;i++){for(const tick of intervals.values())tick();flush();}
  assert.equal(tx.mediaRequests.length,0);
  tx.setTranscriptEnabled(true);
  tx.loadLocalAsr();flush();
  assert.equal(tx.getAsrState(),'ready');
  const s=tx.sessions.get(c.id);
  tx.startPTT(s);flush();
  await Promise.resolve();flush();
  assert.equal(s.transmitting,true);
  assert.equal(tx.getAsrStats().recorded,1);
  tx.releaseTalk(s);flush();
  assert.equal(tx.mediaRequests[0].readyState,'ended','PTT-only releases mic before transcription');
  for(let i=0;i<6;i++){await new Promise(resolve=>setTimeout(resolve,2));flush();}
  assert.equal(tx.getAsrStats().completed,1);
  assert.equal(tx.getTranscripts().length,1);
  assert.equal(rx.getTranscripts().length,1);
  assert.equal(rx.getTranscripts()[0].direction,'rx');
  tx.leaveChannel(c.id);rx.leaveChannel(c.id);
});

test('V6.9: PTT-only shows microphone-starting until real audio becomes ready, then beeps once',async()=>{
  const room=presets.CHANNEL_PRESETS[0];
  const a=browser('Ready cue',[],true,{pttMic:true,deferMic:true});
  await a.setPTTOnlyMicrophone(true);
  await a.joinChannel(room);flush();
  const s=a.sessions.get(room.id);
  a.startPTT(s);flush();
  assert.equal(s.transmitting,false);
  assert.equal(a.ui.quickText.textContent,'MIC STARTING…','do not show transmitting before hardware mic is live');
  assert.equal(a.toneStarts.length,0,'no ready beep while mic is still opening');
  a.resolveNextMic();
  await Promise.resolve();flush();
  assert.equal(s.transmitting,true);
  assert.equal(a.ui.quickText.textContent,'TRANSMITTING');
  assert.equal(a.toneStarts.length,1,'one local ready sound after mic and floor become available');
  assert.match(a.ui.micDelayStatus.textContent,/Last PTT-only start-up: \d+ ms/);
  const report=a.speechDiagnosticReport();
  assert.match(report,/PTT-only last mic acquired after: \d+ ms/);
  assert.match(report,/PTT-only last transmitting after: \d+ ms/);
  assert.match(report,/PTT MIC ACQUIRED/);
  assert.match(report,/PTT TRANSMIT READY/);
  a.releaseTalk(s);flush();
  assert.equal(a.mediaRequests[0].readyState,'ended');
  a.leaveChannel(room.id);
});

test('V6.13: independent headset and mic-off modes show idle, starting, live and released',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('Headset status',[],true,{pttMic:true,deferMic:true});
  await a.setPTTOnlyMicrophone(true);await a.joinChannel(room);flush();
  const s=a.sessions.get(room.id);
  assert.equal(a.ui.radioConnectionState.dataset.state,'connected');
  assert.equal(a.ui.radioMicState.dataset.state,'off');assert.equal(a.ui.radioTxState.dataset.state,'off');
  a.ui.hardwareLearn.listeners.click[0]();buttonPulse(a);
  a.ui.hardwareEnabled.checked=true;a.ui.hardwareEnabled.listeners.change[0]();
  buttonPulse(a,{t:1000});
  assert.equal(a.ui.radioMicState.dataset.state,'pending');assert.equal(a.ui.radioTxState.dataset.state,'pending');
  assert.equal(a.ui.quick.classList.contains('tx-live'),false);assert.equal(s.transmitting,false);
  a.resolveNextMic();await Promise.resolve();flush();
  assert.equal(a.ui.radioMicState.dataset.state,'sending');assert.equal(a.ui.radioTxState.dataset.state,'sending');
  assert.equal(a.ui.quick.classList.contains('tx-live'),true);
  buttonPulse(a,{t:2000});assert.equal(a.mediaRequests[0].readyState,'ended');
  assert.equal(a.ui.radioMicState.dataset.state,'off');assert.equal(a.ui.radioTxState.dataset.state,'off');
  assert.equal(a.ui.radioConnectionState.dataset.state,'connected');
  a.leaveChannel(room.id);
});
test('V6.13: always-ready shows ready muted separately from active transmit',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('Direct status',[]);
  await a.joinChannel(room);flush();const s=a.sessions.get(room.id);
  assert.equal(a.ui.radioMicState.dataset.state,'ready');assert.equal(a.ui.radioTxState.dataset.state,'off');
  a.startPTT(s);flush();assert.equal(a.ui.radioTxState.dataset.state,'sending');
  a.releaseTalk(s);flush();assert.equal(a.ui.radioMicState.dataset.state,'ready');assert.equal(a.ui.radioTxState.dataset.state,'off');
  assert.equal(a.mediaRequests.length,1);a.leaveChannel(room.id);
});

test('V6.14: beep test waits for suspended audio context without opening a microphone',async()=>{
  const a=browser('Tone test',[],true,{pttMic:true,delayedAudioResume:true});
  a.ui.testReadyCue.listeners.click[0]();
  assert.equal(a.toneStarts.length,0);
  for(let i=0;i<6;i++)await Promise.resolve();
  assert.equal(a.toneStarts.length,1);
  assert.equal(a.mediaRequests.length,0);
  const report=a.diagnosticReport();
  assert.match(report,/Relay One V6.18 global diagnostics/);
  assert.match(report,/TONE REQUEST/);
  assert.match(report,/TONE SCHEDULED/);
  assert.match(report,/Tone requests: 1; scheduled: 1/);
  assert.match(report,/--- Speech to text ---/);
  assert.match(report,/--- External headset PTT ---/);
});
test('V6.14: always-ready mode plays one local ready cue and exports global TX state',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('Ready cue direct',[],true,{pttMic:true});
  await a.joinChannel(room);flush();
  const s=a.sessions.get(room.id);
  a.startPTT(s);flush();
  assert.equal(s.transmitting,true);
  assert.equal(a.toneStarts.length,1);
  assert.match(a.diagnosticReport(),/TRANSMIT READY/);
  assert.match(a.diagnosticReport(),/outgoing track=live, enabled=true/);
  a.releaseTalk(s);a.leaveChannel(room.id);
});

test('V6.15: quick speech activation uses the existing model loader, then toggles captions without reloading',async()=>{
  const a=browser('Quick speech',[],true,{local:true});
  assert.equal(a.ui.quickSpeech.dataset.state,'off');
  a.ui.quickSpeech.listeners.click[0]();
  assert.equal(a.ui.quickSpeech.dataset.state,'pending');
  assert.equal(a.ui.transcriptEnabled.checked,true);
  flush();
  assert.equal(a.ui.quickSpeech.dataset.state,'on');
  assert.equal(a.workerInstances.length,1);
  a.ui.quickSpeech.listeners.click[0]();
  assert.equal(a.ui.transcriptEnabled.checked,false);
  a.ui.quickSpeech.listeners.click[0]();
  assert.equal(a.ui.quickSpeech.dataset.state,'on');
  assert.equal(a.workerInstances.length,1);
  assert.equal(a.mediaRequests.length,0);
});
test('V6.15: quick headset detection enables verified button and stays synchronized',()=>{
  const a=browser('Quick headset',[]);
  a.ui.quickHeadset.listeners.click[0]();
  assert.equal(a.ui.quickHeadset.dataset.state,'pending');
  buttonPulse(a);
  assert.equal(a.ui.hardwareEnabled.checked,true);
  assert.equal(a.ui.quickHeadset.dataset.state,'on');
  a.ui.quickHeadset.listeners.click[0]();
  assert.equal(a.ui.hardwareEnabled.checked,false);
});
test('V6.15: quick microphone toggle uses existing mode setting',async()=>{
  const a=browser('Quick mic',[],true,{pttMic:true});
  a.ui.quickMic.listeners.click[0]();
  await Promise.resolve();
  assert.equal(a.getPTTOnlyMicrophone(),true);
  assert.equal(a.ui.pttOnlyMicrophone.checked,true);
  assert.equal(a.ui.quickMic.dataset.state,'on');
  a.ui.quickMic.listeners.click[0]();
  await Promise.resolve();
  assert.equal(a.getPTTOnlyMicrophone(),false);
  assert.equal(a.ui.quickMic.dataset.state,'off');
});

test('V6.16: selected candidate types and loss diagnostics exclude addresses, IDs and URLs',()=>{
  const a=browser('Network stats',[]),pc={iceConnectionState:'connected',connectionState:'connected',signalingState:'stable',iceGatheringState:'complete'};
  const ctx=a.watchNetworkPeer(pc,{room:{title:'Channel 01'}},'voice');
  const mk=(n)=>new Map([
    ['private-pair',{id:'private-pair',type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'private-local',remoteCandidateId:'private-remote',currentRoundTripTime:.12,bytesReceived:n*1000,bytesSent:n*2000}],
    ['private-local',{id:'private-local',type:'local-candidate',candidateType:'srflx',protocol:'udp',address:'192.0.2.34',port:12345,url:'stun:SECRET'}],
    ['private-remote',{id:'private-remote',type:'remote-candidate',candidateType:'host',protocol:'udp',address:'198.51.100.5'}],
    ['private-rtp',{id:'private-rtp',type:'inbound-rtp',kind:'audio',packetsReceived:n*90,packetsLost:n*10,jitter:.02}],
    ['private-tx',{id:'private-tx',type:'outbound-rtp',kind:'audio',packetsSent:n*100}]
  ]);
  a.networkStatsLine(ctx,{status:'fulfilled',value:mk(1)});
  const line=a.networkStatsLine(ctx,{status:'fulfilled',value:mk(2)});
  assert.match(line,/path=srflx\/host; protocol=udp/);
  assert.match(line,/ICE RTT=120ms/);assert.match(line,/RX loss=10 \(10%\)/);
  assert.match(line,/jitter=20ms/);
  assert.doesNotMatch(line,/private-|192\.0\.2|198\.51\.100|SECRET|12345/);
  const report=a.diagnosticReport();assert.match(report,/SELECTED ICE PATH/);
  assert.doesNotMatch(report,/private-local|192\.0\.2|SECRET/);
});
test('V6.16: manual details, marker and network snapshots are in global export',async()=>{
  const c=presets.CHANNEL_PRESETS[0],a=browser('LTE test',[]);
  a.ui.diagPhone.value='Pixel 8 Pro';a.ui.diagCarrier.value='Verizon';a.ui.diagRadio.value='LTE';a.ui.diagSignal.value='-105';
  a.ui.diagBaseline.listeners.click[0]();
  await a.joinChannel(c);flush();await a.sampleDataUsage();
  a.ui.diagMarker.listeners.click[0]();
  const report=a.diagnosticReport();assert.match(report,/Model=Pixel 8 Pro; carrier=Verizon; user-reported network=LTE; user-reported signal=-105 dBm/);
  assert.match(report,/USER MARK: TEST START/);assert.match(report,/USER MARK: PROBLEM NOW/);
  assert.match(report,/Recent network \/ peer samples/);assert.match(report,/Samples [1-9]/);
  a.leaveChannel(c.id);
});

test('V6.17: receiver and coordinator record remote talk control without callsigns or payloads',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('Secret Coordinator',[]),b=browser('Secret Transmitter',[]),c=browser('Secret Receiver',[]);
  for(const x of [a,b,c]){await x.joinChannel(room);flush();}
  for(let i=0;i<3;i++){for(const tick of intervals.values())tick();flush();}
  b.startPTT(b.sessions.get(room.id));flush();
  assert.equal(b.sessions.get(room.id).transmitting,true);
  assert.match(a.diagnosticReport(),/RX TALK REQUEST/);
  assert.match(c.diagnosticReport(),/RX FLOOR UPDATE/);
  assert.match(c.diagnosticReport(),/FLOOR TRANSITION.*idle -> Radio /);
  b.releaseTalk(b.sessions.get(room.id));flush();
  assert.match(a.diagnosticReport(),/RX TALK RELEASE/);
  assert.match(c.diagnosticReport(),/Radio \d+ -> idle/);
  assert.match(c.diagnosticReport(),/INCOMING VOICE STREAM/);
  assert.doesNotMatch(c.diagnosticReport(),/Secret Coordinator|Secret Transmitter|Secret Receiver/);
  for(const x of [b,c,a])x.leaveChannel(room.id);
});
test('V6.18: automatic reachability runs from page load and exports result without raw errors',async()=>{
  let calls=0;const a=browser('Probe',[],true,{fetch:async()=>{calls++;if(calls===2)throw Error('private error text');return {ok:true,status:200,text:async()=> 'relay-one-reachable'};}});
  flush();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(calls,1);assert.match(a.diagnosticReport(),/HTTPS same-site OK/);
  await a.checkInternetReachability();assert.match(a.diagnosticReport(),/HTTPS same-site failed/);
  assert.doesNotMatch(a.diagnosticReport(),/private error text/);assert.equal(calls,2);
  assert.match(a.diagnosticReport(),/Automatic capture: active from page load/);
});
test('V6.18: signaling disconnect bursts never reconnect synchronously and recovery is throttled',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('Recovery',[]);
  await a.joinChannel(room);flush();
  const s=a.sessions.get(room.id),p=s.peer;let attempts=0;
  p.disconnected=true;p.open=false;p.reconnect=()=>{attempts++;p.emit('disconnected');};
  for(let i=0;i<50;i++)p.emit('disconnected');
  assert.equal(attempts,0);
  s.reconnectSignaling();s.reconnectSignaling();assert.equal(attempts,1);
  assert.match(a.diagnosticReport(),/suppressed signaling events=50/);
  assert.match(a.diagnosticReport(),/SIGNALING RECONNECT ATTEMPT/);
  a.leaveChannel(room.id);
});
test('V6.18: offline prevents reconnect and automatic checkpoint is saved on page hide',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('Offline',[]);
  await a.joinChannel(room);flush();
  const s=a.sessions.get(room.id),p=s.peer;let attempts=0;
  p.disconnected=true;p.open=false;p.reconnect=()=>attempts++;
  a.fireWindow('offline');s.reconnectSignaling();assert.equal(attempts,0);
  a.fireWindow('online');s.reconnectSignaling();assert.equal(attempts,0);
  a.fireWindow('pagehide');
  const saved=JSON.parse(a.localStorage.getItem('relay-one.diag-checkpoint.v6.18'));
  assert.match(saved.report,/Relay One V6.18 global diagnostics/);
  assert.match(saved.report,/BROWSER OFFLINE/);
});

test('V6.18.1: WebView capture error tries plain audio once and exports microphone diagnostics',async()=>{
  const room=presets.CHANNEL_PRESETS[0],a=browser('WebView mic',[],true,{firstMicNotReadable:true});
  await a.joinChannel(room);flush();
  assert.ok(a.sessions.has(room.id),'fallback mic capture should allow joining');
  const report=a.diagnosticReport();
  assert.match(report,/MICROPHONE SOURCE FAILURE/);
  assert.match(report,/NotReadableError/);
  assert.match(report,/plain audio fallbacks: 1/);
  assert.match(report,/successes: 1/);
  a.leaveChannel(room.id);
});
