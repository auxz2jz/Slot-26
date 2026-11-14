import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {CHANNEL_PRESETS,MAX_SELECTED_CHANNELS,checkChannelPin} from '../channel-presets.mjs';

test('ten shared channels: five public and five PIN-protected',()=>{
  assert.equal(CHANNEL_PRESETS.length,10);
  assert.equal(MAX_SELECTED_CHANNELS,5);
  assert.deepEqual(CHANNEL_PRESETS.map(c=>c.number),[1,2,3,4,5,6,7,8,9,10]);
  assert.equal(new Set(CHANNEL_PRESETS.map(c=>c.id)).size,10);
  assert.ok(CHANNEL_PRESETS.slice(0,5).every(c=>!c.secure));
  assert.ok(CHANNEL_PRESETS.slice(5).every(c=>c.secure && /^[0-9a-f]{32}$/.test(c.verifier)));
  assert.ok(CHANNEL_PRESETS.every(c=>!Object.hasOwn(c,'pin')));
});

test('incorrect PIN cannot pass preset access check; public channels do not need a PIN',async()=>{
  const open=CHANNEL_PRESETS[0];
  const privateRoom=CHANNEL_PRESETS[5];
  assert.equal(await checkChannelPin(open,null,webcrypto),true);
  assert.equal(await checkChannelPin(privateRoom,'',webcrypto),false);
  assert.equal(await checkChannelPin(privateRoom,'123',webcrypto),false);
  assert.equal(await checkChannelPin(privateRoom,'0000',webcrypto),false);
});

test('PIN verifier accepts correct PIN and rejects wrong PIN for synthetic protected channel',async()=>{
  const id='a'.repeat(32),pin='1234';
  const enc=new TextEncoder();
  const key=await webcrypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await webcrypto.subtle.deriveBits({
    name:'PBKDF2',salt:enc.encode('relay-one-pin-check-v1:'+id),
    iterations:130000,hash:'SHA-256'
  },key,128);
  const verifier=[...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const fake={id,secure:true,verifier};
  assert.equal(await checkChannelPin(fake,pin,webcrypto),true);
  assert.equal(await checkChannelPin(fake,'4321',webcrypto),false);
});
