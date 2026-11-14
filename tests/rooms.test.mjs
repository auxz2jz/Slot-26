import assert from 'node:assert/strict';
import {MAX_PEOPLE,PALETTE,newRoom,cleanName,cleanTitle,cleanColor,validRoom,roomLink,leaderId,guestId,validGuestId,validMemberId,normalizeChannels} from '../room-utils.mjs';

assert.equal(MAX_PEOPLE,6);
assert.equal(PALETTE.length,6);
const id=newRoom();
assert.equal(id.length,32);
assert.ok(validRoom(id));
assert.ok(!validRoom('123'));
assert.notEqual(newRoom(),newRoom());
assert.equal(cleanName('  Officer 42  '),'Officer 42');
assert.equal(cleanName('\x00\x01\x02'),'User');
assert.equal(cleanTitle('  <Dispatch> '),'Dispatch');
assert.equal(cleanColor('#garbage'),PALETTE[0]);

const url=roomLink('https://example.com/Slot-26/?host=1&foo=bar#frag',id,'Patrol');
const parsed=new URL(url);
assert.equal(parsed.searchParams.get('room'),id);
assert.equal(parsed.searchParams.get('channel'),'Patrol');
assert.equal(parsed.searchParams.has('host'),false);
assert.equal(parsed.hash,'');

const host=leaderId(id);
const a=guestId(id,'a'.repeat(32));
const b=guestId(id,'b'.repeat(32));
assert.notEqual(a,b);
assert.ok(validGuestId(id,a));
assert.ok(validMemberId(id,host));
assert.ok(validMemberId(id,a));
assert.ok(!validMemberId(id,'relay-v3-other'));
assert.ok(!validGuestId(id,host));

const saved=normalizeChannels([{id,title:'Patrol'},{id,title:'Duplicate'},{id:newRoom(),title:'General'},{id:'bad'}]);
assert.equal(saved.length,2);
assert.equal(saved[0].title,'Patrol');
console.log('All Relay One room/profile tests passed.');
