import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {newRoom,roomLink,normalizeChannels,validPin,deriveProtectedRoomId} from '../room-utils.mjs';

test('channel PIN format',()=>{
  assert.equal(validPin('12345678'),true);
  assert.equal(validPin('123456789012'),true);
  assert.equal(validPin('1234'),true);
  assert.equal(validPin('123'),false);
  assert.equal(validPin('1234567890123'),false);
  assert.equal(validPin('1234abcd'),false);
});

test('protected channel IDs depend on both PIN and invitation room',async()=>{
  const room=newRoom(webcrypto);
  const a=await deriveProtectedRoomId(room,'12345678',webcrypto);
  const b=await deriveProtectedRoomId(room,'12345678',webcrypto);
  const wrong=await deriveProtectedRoomId(room,'87654321',webcrypto);
  const other=await deriveProtectedRoomId(newRoom(webcrypto),'12345678',webcrypto);
  assert.match(a,/^[0-9a-f]{32}$/);
  assert.equal(a,b);
  assert.notEqual(a,wrong);
  assert.notEqual(a,other);
  assert.notEqual(a,room);
  await assert.rejects(()=>deriveProtectedRoomId(room,'123',webcrypto),/4–12/);
});

test('reusable invitations do not contain PINs or protected signaling IDs',async()=>{
  const room=newRoom(webcrypto);
  const secret=await deriveProtectedRoomId(room,'12345678',webcrypto);
  const link=roomLink('https://example.org/Slot-26/?host=1',room,'Dispatch',true);
  assert.match(link,/secure=1/);
  assert.match(link,/room=/);
  assert.equal(link.includes('12345678'),false);
  assert.equal(link.includes(secret),false);
  assert.equal(link.includes('host=1'),false);
});

test('saved protected channel retains secure flag without saving PIN',()=>{
  const room=newRoom(webcrypto);
  const saved=normalizeChannels([{id:room,title:'Patrol',secure:true,pin:'12345678'}]);
  assert.equal(saved.length,1);
  assert.equal(saved[0].secure,true);
  assert.equal('pin' in saved[0],false);
});
