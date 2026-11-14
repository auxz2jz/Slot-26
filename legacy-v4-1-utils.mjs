export const MAX_PEOPLE = 6;
export const ROOM_RE = /^[0-9a-f]{32}$/;
export const PALETTE = ['#54d6a6','#75b9ff','#ffbc77','#dd9bff','#ff8fa2','#e6ce70'];
export function validRoom(id) { return typeof id === 'string' && ROOM_RE.test(id); }
export function newRoom(source = globalThis.crypto) {
  if (!source || typeof source.getRandomValues !== 'function') throw new Error('Secure random numbers require HTTPS.');
  const b = new Uint8Array(16); source.getRandomValues(b);
  return Array.from(b, v => v.toString(16).padStart(2, '0')).join('');
}
export function cleanName(v) { return String(v ?? '').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,30) || 'User'; }
export function cleanTitle(v) { return String(v ?? '').replace(/[\x00-\x1f\x7f<>]/g,'').trim().slice(0,36) || 'Private channel'; }
export function cleanColor(v) { return PALETTE.includes(v) ? v : PALETTE[0]; }
export function roomLink(href,id,title,secure=false) {
  if (!validRoom(id)) throw Error('Invalid room ID');
  const url = new URL(href); url.search = ''; url.hash = '';
  url.searchParams.set('room',id); url.searchParams.set('channel',cleanTitle(title));
  if(secure) url.searchParams.set('secure','1');
  return url.toString();
}
export function leaderId(id) { if (!validRoom(id)) throw Error('Invalid room'); return 'relay-v4-' + id + '-h'; }
export function guestId(id,rand=newRoom()) { return 'relay-v4-' + id + '-g-' + rand.slice(0,16); }
export function validGuestId(room,id) { return validRoom(room) && new RegExp('^relay-v4-' + room + '-g-[0-9a-f]{16}$').test(id); }
export function validMemberId(room,id) { return id === leaderId(room) || validGuestId(room,id); }
export function normalizeChannels(raw) {
  if (!Array.isArray(raw)) return [];
  const used = new Set(), list = [];
  for (const x of raw) {
    if (!x || !validRoom(x.id) || used.has(x.id)) continue;
    used.add(x.id); list.push({id:x.id,title:cleanTitle(x.title),secure:x.secure===true});
    if (list.length>=30) break;
  }
  return list;
}

/** PIN-keyed signaling namespace. No PIN or derived namespace appears in a share link. 
 * Prototype access separation only — not a server-enforced authorization system.
 */
export function validPin(pin) { return typeof pin==='string' && /^[0-9]{8,12}$/.test(pin); }
export async function deriveProtectedRoomId(publicRoomId, pin, cryptoSource=globalThis.crypto) {
  if(!validRoom(publicRoomId)) throw new Error('Invalid channel ID.');
  if(!validPin(pin)) throw new Error('Use an 8–12 digit channel PIN.');
  if(!cryptoSource?.subtle || !cryptoSource.getRandomValues) throw new Error('Secure PIN support requires HTTPS and Web Crypto.');
  const enc=new TextEncoder();
  const master=await cryptoSource.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await cryptoSource.subtle.deriveBits({
    name:'PBKDF2',salt:enc.encode('relay-one-protected-v1:' + publicRoomId),
    iterations:180000,hash:'SHA-256'
  },master,128);
  return [...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
