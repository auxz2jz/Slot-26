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
  '\nreturn {joinChannel,leaveChannel,startPTT,releaseTalk,setMonitor,switchMode,modeAllows,maxActiveChannels,getMode:()=>radioMode,sessions,ui,channels,rows};');
const utilsForTest={
  ...utils,...presets,WebRTCUsageMeter,formatDataBytes,
  checkChannelPin:(channel,pin)=>presets.checkChannelPin(channel,pin,webcrypto),
  newRoom:()=>utils.newRoom(webcrypto),
  guestId:id=>utils.guestId(id,utils.newRoom(webcrypto)),
  deriveProtectedRoomId:(id,pin)=>utils.deriveProtectedRoomId(id,pin,webcrypto)
};
function browser(name,rooms){
  const els=new Map();
  const document={hidden:false,body:{classList:{toggle(){}}},getElementById(id){if(!els.has(id))els.set(id,new FakeElement());return els.get(id);},
    createElement(tag){return new FakeElement(tag);},addEventListener(){}};
  const data=new Map([
    ['relay-one.profile.v4',JSON.stringify({name,color:utils.PALETTE[0]})],
    ['relay-one.channels.v4',JSON.stringify(rooms)]
  ]);
  const localStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
  const navigator={mediaDevices:{getUserMedia:async()=>new FakeStream([track()])},
    clipboard:{writeText:async()=>{}}};
  const window={isSecureContext:true,Peer,addEventListener(){},
    prompt(){return '1234';},confirm(){return true;}};
  const location={href:'https://example.invalid/Slot-26/',pathname:'/Slot-26/',search:''};
  const app=appFactory(...utilityNames.map(k=>utilsForTest[k]),document,window,navigator,
    localStorage,location,{replaceState(){}},FakeStream,URLSearchParams,
    soon,cancel,repeat,stopRepeat);
  return {...app,localStorage};

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
