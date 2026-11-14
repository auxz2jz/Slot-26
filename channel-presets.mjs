// Relay One shared demo radio plan. Distributed with the public website.
// Channels 01–05 are open. Channels 06–10 are PIN-gated in the browser.
// WARNING: public 4-digit PIN verifiers are guessable offline; not access-control security.
export const MAX_SELECTED_CHANNELS=5;
export const CHANNEL_PRESETS=Object.freeze([
  {number:1,id:'7d41c94a9572c49d2b6962609b62e1a7',title:'Channel 01',secure:false},
  {number:2,id:'8d686ec913ef117f71308457d27737b1',title:'Channel 02',secure:false},
  {number:3,id:'256896b9f5de9861013d5e442d25cc49',title:'Channel 03',secure:false},
  {number:4,id:'1356544374fd4e84d38588a97a609204',title:'Channel 04',secure:false},
  {number:5,id:'f8f44113b4e72969fcf45405e24a0151',title:'Channel 05',secure:false},
  {number:6,id:'0236f71c736d0f7ba7e8cef0327116f1',title:'Channel 06',secure:true,verifier:'4c0c976c6e2717cd44b92427a4e9a3e2'},
  {number:7,id:'e58a86171145e2ecc5c312b523f58cac',title:'Channel 07',secure:true,verifier:'ff05d37ef09869f5e95f9d3e0b421edf'},
  {number:8,id:'ede0edcc2a2403d8337d57ab695c8dce',title:'Channel 08',secure:true,verifier:'7afdd7d66cc0344f37a33e18f10d96bb'},
  {number:9,id:'8d3897896e4bccb27dcf53e5d928167c',title:'Channel 09',secure:true,verifier:'eb6cfd4eac1f792b2155c04d1933ceb1'},
  {number:10,id:'832923a8d6facd96d017489d23921773',title:'Channel 10',secure:true,verifier:'3bd3d583edc4458df8cf298979dc3128'}
].map(p=>Object.freeze(p)));

/** Browser-side DEMO validator. This is trivially bypassable by editing the client.
 * Unlike the prior version, wrong PINs are rejected rather than entering a separate empty room.
 * Real user access control must be enforced by a server.
 */
export async function checkChannelPin(channel,pin,cryptoSource=globalThis.crypto){
  if(!channel?.secure)return true;
  if(typeof pin!=='string'|| !/^[0-9]{4,12}$/.test(pin))return false;
  if(!cryptoSource?.subtle)throw new Error('PIN verification requires HTTPS and Web Crypto');
  const enc=new TextEncoder();
  const key=await cryptoSource.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  const bits=await cryptoSource.subtle.deriveBits({
    name:'PBKDF2',
    salt:enc.encode('relay-one-pin-check-v1:'+channel.id),
    iterations:130000,
    hash:'SHA-256'
  },key,128);
  const expected=channel.verifier;
  const got=[...new Uint8Array(bits)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(typeof expected!=='string'||expected.length!==got.length)return false;
  let diff=0;
  for(let i=0;i<got.length;i++)diff|=got.charCodeAt(i)^expected.charCodeAt(i);
  return diff===0;
}
