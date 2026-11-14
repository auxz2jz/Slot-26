import test from 'node:test';
import assert from 'node:assert/strict';
import {USAGE_KEY,WebRTCUsageMeter,formatDataBytes,summarizeStats} from '../usage-meter.mjs';

function storage(){
  const values=new Map();
  return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
}
function reports(sent,received,dataSent=0,dataReceived=0){
  return new Map([
    ['s',{id:'outbound-audio',type:'outbound-rtp',kind:'audio',bytesSent:sent}],
    ['r',{id:'inbound-audio',type:'inbound-rtp',kind:'audio',bytesReceived:received}],
    ['d',{id:'data-channel-1',type:'data-channel',bytesSent:dataSent,bytesReceived:dataReceived}],
    ['v',{id:'outbound-video',type:'outbound-rtp',kind:'video',bytesSent:999999}]
  ]);
}

test('formats small and large byte values',()=>{
  assert.equal(formatDataBytes(0),'0 B');
  assert.equal(formatDataBytes(1024),'1.00 KiB');
  assert.equal(formatDataBytes(1024*1024),'1.00 MiB');
});

test('only RTP audio and RTCDataChannel payload counters are counted',()=>{
  const stats=summarizeStats(reports(120,220,30,40));
  assert.equal(stats.size,4);
  assert.equal([...stats.values()].filter(x=>x.direction==='tx').reduce((n,x)=>n+x.value,0),150);
  assert.equal([...stats.values()].filter(x=>x.direction==='rx').reduce((n,x)=>n+x.value,0),260);
});

test('session totals grow by deltas, do not double count, and persist between visits',async()=>{
  const mem=storage();
  let now=0;
  const meter=new WebRTCUsageMeter(mem,()=>now);
  let values=reports(1000,2000,30,40);
  const peer={getStats:async()=>values};
  now=4000;await meter.sample([peer,peer]); // duplicate connection sampled only once
  let snapshot=meter.snapshot();
  assert.equal(snapshot.session.tx,1030);
  assert.equal(snapshot.session.rx,2040);
  now=8000;await meter.sample([peer]); // same values, no increment
  assert.equal(meter.snapshot().session.tx,1030);
  values=reports(1500,2900,50,80);
  now=12000;await meter.sample([peer]);
  snapshot=meter.snapshot();
  assert.equal(snapshot.session.tx,1550);
  assert.equal(snapshot.session.rx,2980);
  assert.equal(snapshot.saved.tx,1550);
  assert.equal(snapshot.saved.rx,2980);
  assert.ok(snapshot.kbps.rx>0);
  assert.equal(JSON.parse(mem.getItem(USAGE_KEY)).tx,1550);

  const anotherVisit=new WebRTCUsageMeter(mem,()=>now);
  assert.equal(anotherVisit.snapshot().session.tx,0);
  assert.equal(anotherVisit.snapshot().saved.tx,1550);
  anotherVisit.resetSaved();
  assert.equal(anotherVisit.snapshot().saved.tx,0);
  assert.equal(anotherVisit.snapshot().session.tx,0);
  assert.equal(new WebRTCUsageMeter(mem).snapshot().saved.tx,0);
});

test('counter reset inside an existing RTC report starts a new epoch',()=>{
  const meter=new WebRTCUsageMeter(storage());
  const pc={};
  meter.record(pc,reports(1000,700));
  meter.record(pc,reports(500,200));
  assert.equal(meter.snapshot().session.tx,1500);
  assert.equal(meter.snapshot().session.rx,900);
});

test('failed or unavailable getStats reports do not interrupt sampling',async()=>{
  const meter=new WebRTCUsageMeter(storage());
  await meter.sample([{}, {getStats:async()=>{throw Error('network failure');}},
    {getStats:async()=>new Map([['in',{id:'in',type:'inbound-rtp',bytesReceived:100}]])}]);
  assert.equal(meter.snapshot().session.rx,100);
});
