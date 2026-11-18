import {
  MAX_PEOPLE, PALETTE, validRoom, newRoom, cleanName, cleanTitle, cleanColor,
  roomLink, leaderId, guestId, validGuestId, validMemberId, normalizeChannels,
  validPin, deriveProtectedRoomId
} from './room-utils.mjs';
import {CHANNEL_PRESETS,MAX_SELECTED_CHANNELS,checkChannelPin} from './channel-presets.mjs';
import {WebRTCUsageMeter,formatDataBytes} from './usage-meter.mjs';

const $ = id => document.getElementById(id);
const ui = {
  list:$('channelList'), name:$('displayName'), colors:$('colors'),
  txTone:$('txTone'), rxTone:$('rxTone'), alertTone:$('alertTone'),
  message:$('channelMessage'), error:$('errorMessage'), count:$('joinCount'),
  restore:$('restoreChannels'), monitorAll:$('monitorAll'), muteAll:$('muteAll'), enableSpeakers:$('enableSpeakers'),
  quick:$('quickTalk'), quickText:$('quickText'), focusTitle:$('focusTitle'),
  focusStatus:$('focusStatus'), focusSpeaker:$('focusSpeaker'), focusHint:$('focusHint'),
  audio:$('remoteAudio'), diagnostics:$('diagnosticLog'), copyDiagnostics:$('copyDiagnostics'), clearDiagnostics:$('clearDiagnostics'),
  dataSessionTotal:$('dataSessionTotal'),dataSessionBreakdown:$('dataSessionBreakdown'),
  dataSavedTotal:$('dataSavedTotal'),dataSavedBreakdown:$('dataSavedBreakdown'),
  dataCurrentRate:$('dataCurrentRate'),resetDataSaved:$('resetDataSaved'),
  compactLayout:$('compactLayout'),detailedLayout:$('detailedLayout'),
  basicMode:$('basicMode'),advancedMode:$('advancedMode'),
  radioModeHelp:$('radioModeHelp'),channelModeBadge:$('channelModeBadge'),
  radioHousing:$('radioHousing'),radioScreen:$('radioScreen'),
  screenChannelNumber:$('screenChannelNumber'),screenChannelTitle:$('screenChannelTitle'),
  screenSignal:$('screenSignal'),screenMode:$('screenMode'),screenScan:$('screenScan'),
  screenLock:$('screenLock'),screenPeople:$('screenPeople'),scanIndicator:$('scanIndicator'),
  radioPttTarget:$('radioPttTarget'),radioScreenMessage:$('radioScreenMessage'),
  prevChannel:$('prevChannel'),nextChannel:$('nextChannel'),
  radioJoin:$('radioJoin'),radioMonitor:$('radioMonitor'),radioCall:$('radioCall'),
  radioScan:$('radioScan'),leftHanded:$('leftHanded'),rightHanded:$('rightHanded'),
  pttOnlyMicrophone:$('pttOnlyMicrophone'),micModeStatus:$('micModeStatus'),
  pttReadyCue:$('pttReadyCue'),micDelayStatus:$('micDelayStatus'),
  hardwareLearn:$('hardwareLearn'),hardwareBind:$('hardwareBind'),hardwareClear:$('hardwareClear'),
  hardwareEnabled:$('hardwareEnabled'),hardwareStatus:$('hardwareStatus'),hardwareLog:$('hardwareLog'),
  hardwareMode:$('hardwareMode'),hardwareTimeout:$('hardwareTimeout'),hardwareCue:$('hardwareCue'),hardwareStop:$('hardwareStop'),
  hardwareAudioCheck:$('hardwareAudioCheck'),hardwareAudioStatus:$('hardwareAudioStatus'),hardwareCopy:$('hardwareCopy'),
  transcriptEnabled:$('transcriptEnabled'),transcriptKeep:$('transcriptKeep'),
  transcriptStatus:$('transcriptStatus'),transcriptLog:$('transcriptLog'),
  transcriptCount:$('transcriptCount'),transcriptCopy:$('transcriptCopy'),
  transcriptClear:$('transcriptClear'),transcriptAutoPopup:$('transcriptAutoPopup'),
  transcriptOpen:$('transcriptOpen'),transcriptPopup:$('transcriptPopup'),
  transcriptPopupLog:$('transcriptPopupLog'),transcriptClose:$('transcriptClose'),
  transcriptEngine:$('transcriptEngine'),asrLoad:$('asrLoad'),asrState:$('asrState'),
  speechDiagBadge:$('speechDiagBadge'),speechDiagSummary:$('speechDiagSummary'),
  speechDiagnosticLog:$('speechDiagnosticLog'),speechTest:$('speechTest'),
  speechTestPreview:$('speechTestPreview'),speechCopyDiagnostics:$('speechCopyDiagnostics')
};
const PROFILE_KEY='relay-one.profile.v4';
const MONITOR_KEY='relay-one.monitor.v5';
const ACTIVE_KEY='relay-one.joined.v5';
const LAYOUT_KEY='relay-one.layout.v6.2';
const RADIO_MODE_KEY='relay-one.radio-mode.v6.3';
const RADIO_SCAN_KEY='relay-one.scan.v6.4', RADIO_HAND_KEY='relay-one.ptt-side.v6.4';
const PTT_MIC_MODE_KEY='relay-one.ptt-only-microphone.v6.8';
const PTT_READY_CUE_KEY='relay-one.ptt-ready-cue.v6.9';
const EXTERNAL_PTT_KEY='relay-one.external-ptt.v6.10';
const TRANSCRIPT_ENABLED_KEY='relay-one.transcribe.v6.5';
const TRANSCRIPT_ENGINE_KEY='relay-one.transcript-engine.v6.7';
const TRANSCRIPT_KEEP_KEY='relay-one.transcript-keep.v6.5';
const TRANSCRIPT_STORE_KEY='relay-one.transcripts.v6.5';
const TRANSCRIPT_AUTOPOP_KEY='relay-one.transcript-popup.v6.5';
const TRANSCRIPT_MAX=120, TRANSCRIPT_TEXT_MAX=400;
const MAX_ACTIVE=MAX_SELECTED_CHANNELS, PING_EVERY=5000, STALE_AFTER=40000, PENDING_AFTER=10000;
const storeGet=(key,defaultValue)=>{try{return JSON.parse(localStorage.getItem(key))??defaultValue;}catch{return defaultValue;}};
const storeSet=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
const rawProfile=storeGet(PROFILE_KEY,{});
const profile={
  name:cleanName(rawProfile?.name),
  color:cleanColor(rawProfile?.color),
  txTone:rawProfile?.txTone===true,
  rxTone:rawProfile?.rxTone!==false,
  alertTone:rawProfile?.alertTone!==false
};
const channels=CHANNEL_PRESETS; // All visitors see the same ten read-only channels.
const channelIds=new Set(channels.map(c=>c.id));
const monitorPrefs=storeGet(MONITOR_KEY,{});
const desiredJoined=new Set((Array.isArray(storeGet(ACTIVE_KEY,[]))?storeGet(ACTIVE_KEY,[]):[]).filter(id=>channelIds.has(id)));
const pinCache=new Map(); // Volatile only: never persisted to localStorage or links.
const sessions=new Map(); // public channel ID -> independent ChannelSession
const rows=new Map();
let radioMode=storeGet(RADIO_MODE_KEY,'basic')==='advanced'?'advanced':'basic';
const modeAllows=c=>Boolean(c) && (radioMode==='advanced'||c.number<=2);
const maxActiveChannels=()=>radioMode==='basic'?2:MAX_ACTIVE;
function renderMode(){
  if(ui.basicMode)ui.basicMode.setAttribute('aria-pressed',String(radioMode==='basic'));
  if(ui.advancedMode)ui.advancedMode.setAttribute('aria-pressed',String(radioMode==='advanced'));
  if(ui.channelModeBadge)ui.channelModeBadge.textContent=radioMode==='basic'?'2 channels':'10 channels';
  if(ui.radioModeHelp)ui.radioModeHelp.textContent=radioMode==='basic'
    ?'Basic: Channels 01 and 02 only. Switch to Advanced for all ten channels. Mode controls this device only; it is not a login or access restriction.'
    :'Advanced: all ten shared channels. Channels 01–05 are open; 06–10 use demonstration PINs. Join up to five channels. Mode is not access control.';
}
function switchMode(nextMode){
  if(nextMode!=='basic' && nextMode!=='advanced' || nextMode===radioMode)return;
  radioMode=nextMode;storeSet(RADIO_MODE_KEY,radioMode);
  let disconnected=0;
  if(radioMode==='basic'){
    for(const s of [...sessions.values()]){
      if(!modeAllows(s.room)){leaveChannel(s.publicId);disconnected++;}
    }
    // Do not leave selected-but-disconnected channels invisibly queued for restoration.
    let selectionChanged=false;
    for(const id of [...desiredJoined]){
      if(!modeAllows(storedRoom(id))){desiredJoined.delete(id);selectionChanged=true;}
    }
    if(selectionChanged)persistDesired();
    if(focusedId && !modeAllows(storedRoom(focusedId)))focusedId=sessions.keys().next().value||null;
  }
  renderMode();
  if(!modeAllows(storedRoom(viewId)))viewId=channels[0].id;
  scanPreviewId=null;scanActivityId=null;
  scanTick();
  updateAll();
  setMessage(nextMode==='basic'
    ?'Basic mode: Channels 01–02. '+(disconnected
      ?'Disconnected '+disconnected+' other channel(s); switch to Advanced to rejoin.'
      :'Only two channels are shown.')
    :'Advanced mode: all ten channels are available; join up to five.');
  logRadio('RADIO MODE','',nextMode+'; disconnected '+disconnected);
}
ui.basicMode?.addEventListener('click',()=>switchMode('basic'));
ui.advancedMode?.addEventListener('click',()=>switchMode('advanced'));
renderMode();
const usageMeter=new WebRTCUsageMeter(localStorage);
const compactPreference=storeGet(LAYOUT_KEY,'compact');
let compactLayout=compactPreference!=='detailed';
function setLayout(isCompact){
  compactLayout=Boolean(isCompact);
  document.body.classList.toggle('radio-compact',compactLayout);
  if(ui.compactLayout)ui.compactLayout.setAttribute('aria-pressed',String(compactLayout));
  if(ui.detailedLayout)ui.detailedLayout.setAttribute('aria-pressed',String(!compactLayout));
  storeSet(LAYOUT_KEY,compactLayout?'compact':'detailed');
}
ui.compactLayout?.addEventListener('click',()=>setLayout(true));
ui.detailedLayout?.addEventListener('click',()=>setLayout(false));
setLayout(compactLayout);
function renderDataUsage(){
  const {session,saved,kbps}=usageMeter.snapshot();
  const fmt=(v)=>formatDataBytes(v);
  if(ui.dataSessionTotal)ui.dataSessionTotal.textContent=fmt(session.rx+session.tx);
  if(ui.dataSessionBreakdown)ui.dataSessionBreakdown.textContent='↑ '+fmt(session.tx)+' · ↓ '+fmt(session.rx);
  if(ui.dataSavedTotal)ui.dataSavedTotal.textContent=fmt(saved.rx+saved.tx);
  if(ui.dataSavedBreakdown)ui.dataSavedBreakdown.textContent='↑ '+fmt(saved.tx)+' · ↓ '+fmt(saved.rx);
  if(ui.dataCurrentRate)ui.dataCurrentRate.textContent=(kbps.tx+kbps.rx).toFixed(1)+' kbps';
}
async function sampleDataUsage(){
  const pcs=[];
  for(const session of sessions.values()){
    for(const member of session.members.values()){
      const voice=member.call?.peerConnection;
      const data=member.data?.peerConnection;
      if(voice)pcs.push(voice);
      if(data)pcs.push(data);
    }
  }
  try{await usageMeter.sample(pcs);}catch(err){logRadio('USAGE SAMPLE ERROR','',err?.name||'getStats failed');}
  renderDataUsage();
}
ui.resetDataSaved?.addEventListener('click',()=>{
  if(!window.confirm('Reset the saved WebRTC data estimate on this device? This cannot be undone.'))return;
  usageMeter.resetSaved();renderDataUsage();
});
renderDataUsage();
setInterval(()=>{void sampleDataUsage();},4000);
let focusedId=null, selectedTx=null, microphone=null, micPromise=null, alertContext=null;
let pttOnlyMicrophone=storeGet(PTT_MIC_MODE_KEY,false)===true;
let pttReadyCue=storeGet(PTT_READY_CUE_KEY,true)!==false;
const pttTiming={presses:0,readyCount:0,lastMicMs:null,lastReadyMs:null,slowMic:0,
  cancelledBeforeReady:0};
let standbyAudioContext=null;
const savedExternal=storeGet(EXTERNAL_PTT_KEY,{});
let externalBinding=typeof savedExternal?.binding==='string' && /^(code|key):[A-Za-z0-9_-]{1,70}$/.test(savedExternal.binding)?savedExternal.binding:null;
let externalEnabled=Boolean(externalBinding&&savedExternal?.enabled===true);
let externalMode=savedExternal?.mode==='toggle'?'toggle':'hold';
let externalTimeout=[15,30,45].includes(savedExternal?.timeout)?savedExternal.timeout:45;
let externalCue=savedExternal?.cue!==false;
let externalSession=null,externalWatchdog=null,externalLearning=false,externalLearnTimer=null;
let externalCandidate=null,externalDown=null,externalMessage='',externalPressedAt=0;
let externalNeedsRelease=false;
const externalEvents=[];
const externalCounts={testDown:0,testUp:0,unknown:0,press:0,release:0,timeout:0};
let externalDeviceSummary='Not checked';
// The center LCD may sweep through joined channels; PTT always has a fixed, visible target.
let viewId=channels[0].id;
let scanPreviewId=null, scanActivityId=null, scanLastOnAirAt=0, scanStepAt=0;
let scanEnabled=storeGet(RADIO_SCAN_KEY,false)===true;
let pttSide=storeGet(RADIO_HAND_KEY,'right')==='left'?'left':'right';
const SCAN_STEP_MS=1400,SCAN_HOLD_MS=2400;
let joinInProgress=0;
const diagnosticEvents=[];
const DIAGNOSTIC_LIMIT=150;
/* Optional text alongside PTT voice. Recognition is independent of PeerJS media.
 * Each speaker recognizes their own mic, then broadcasts FINAL strings through the
 * already-established room data connections. No voice streams are renegotiated.
 * Web Speech may be unavailable or backed by an online browser service.
 */
let transcriptEnabled=storeGet(TRANSCRIPT_ENABLED_KEY,false)===true;
let transcriptMode=storeGet(TRANSCRIPT_ENGINE_KEY,'local')==='browser'?'browser':'local';
let transcriptKeep=storeGet(TRANSCRIPT_KEEP_KEY,false)===true;
let transcriptEntries=transcriptKeep
  ?storeGet(TRANSCRIPT_STORE_KEY,[]):[];
if(!Array.isArray(transcriptEntries))transcriptEntries=[];
transcriptEntries=transcriptEntries.filter(item=>item && typeof item.text==='string' &&
  item.text.length<=TRANSCRIPT_TEXT_MAX && typeof item.channel==='string' &&
  typeof item.name==='string' && ['tx','rx'].includes(item.direction)).slice(-TRANSCRIPT_MAX);
let speechCapture=null;
let autoTranscriptPopup=storeGet(TRANSCRIPT_AUTOPOP_KEY,true)!==false;
let transcriptPopupOpen=false;
let transcriptPopupPending=false;
const SpeechEngine=window.SpeechRecognition||window.webkitSpeechRecognition||null;
/* Voice-to-text diagnostics: only lifecycle and counts, NEVER recognized speech.
 * Keep the network-independent walkie-talkie media stream untouched. */
const speechEvents=[];
const speechStats={attempts:0,starts:0,audioStarts:0,speechStarts:0,
  interim:0,finals:0,errors:0,testAttempts:0,testFinals:0,
  lastError:'none',lastState:'idle',lastPTT:'none'};
const SPEECH_LOG_LIMIT=100;
let speechTestCapture=null;
function speechEvent(kind,detail=''){
  const line=[new Date().toISOString(),kind,detail].filter(Boolean).join(' | ');
  speechEvents.push(line);
  if(speechEvents.length>SPEECH_LOG_LIMIT)speechEvents.shift();
  speechStats.lastState=kind;
  logRadio('SPEECH '+kind,'',detail);
  renderSpeechDiagnostics();
}
function renderSpeechDiagnostics(){
  const supported=Boolean(SpeechEngine);
  if(ui.speechDiagBadge)ui.speechDiagBadge.textContent=supported?'API available':'API unavailable';
  if(ui.speechDiagSummary)ui.speechDiagSummary.textContent=
    'Recognition: '+(supported?'available':'NOT supported')+
    ' · My captions: '+(transcriptEnabled?'on':'off')+
    ' · Attempts: '+speechStats.attempts+
    ' · Started: '+speechStats.starts+
    ' · Audio start: '+speechStats.audioStarts+
    ' · Speech detected: '+speechStats.speechStarts+
    ' · Final results: '+speechStats.finals+
    ' · Errors: '+speechStats.errors+
    ' · Last: '+speechStats.lastState+
    (speechStats.lastError==='none'?'':' ('+speechStats.lastError+')');
  if(ui.speechDiagnosticLog)ui.speechDiagnosticLog.textContent=
    speechEvents.length?speechEvents.join('\n'):'No speech recognition attempts yet.';
  if(ui.speechTest){
    ui.speechTest.disabled=!supported;
    ui.speechTest.textContent=speechTestCapture?'Stop speech test':'Test speech recognition';
  }
}
function speechDiagnosticReport(){
  const tracks=[...sessions.values()].map(s=>
    s.room.title+': '+(s.track?.readyState||'no track')+', enabled='+Boolean(s.track?.enabled)+
    ', transmitting='+Boolean(s.transmitting)+', floor='+Boolean(s.floor===s.myId));
  return [
    'Relay One V6.11 speech diagnostics',
    'PTT-only mic presses: '+pttTiming.presses,
    'PTT-only completed transmit activations: '+pttTiming.readyCount,
    'PTT-only last mic acquired after: '+(pttTiming.lastMicMs===null?'not measured':pttTiming.lastMicMs+' ms'),
    'PTT-only last transmitting after: '+(pttTiming.lastReadyMs===null?'not measured':pttTiming.lastReadyMs+' ms'),
    'PTT-only presses released before ready: '+pttTiming.cancelledBeforeReady,
    'PTT-only slow mic activations (1 sec+): '+pttTiming.slowMic,
    'Transcription engine: '+transcriptMode,
    'On-device model state: '+asrState,
    'On-device recording active: '+Boolean(asrActive),
    'On-device audio captures: '+asrStats.recorded,
    'On-device inference queued: '+asrStats.queued,
    'On-device inference completed: '+asrStats.completed,
    'On-device errors: '+asrStats.errors,
    'On-device last error: '+asrStats.lastError,
    'Recorded: '+new Date().toISOString(),
    'Browser: '+(navigator.userAgent||'not exposed'),
    'Secure context: '+String(window.isSecureContext===true),
    'SpeechRecognition: '+(window.SpeechRecognition?'present':'absent'),
    'webkitSpeechRecognition: '+(window.webkitSpeechRecognition?'present':'absent'),
    'Speech enabled by user: '+transcriptEnabled,
    'Active recognition: '+Boolean(speechCapture),
    'Active local test: '+Boolean(speechTestCapture),
    'Microphone mode: '+(pttOnlyMicrophone?'PTT only':'always ready'),
    'Physical microphone open: '+Boolean(pttOnlyMicrophone?
      [...sessions.values()].some(s=>s.pttInputStream):
      microphone?.getAudioTracks?.()[0]?.readyState==='live'),
    'Joined audio sessions: '+sessions.size,
    'PTT held: '+Boolean(selectedTx),
    'PTT floor acquired: '+Boolean(selectedTx && selectedTx.floor===selectedTx.myId),
    'Last PTT: '+speechStats.lastPTT,
    'Recognition attempts: '+speechStats.attempts,
    'Recognition started callbacks: '+speechStats.starts,
    'Audio started callbacks: '+speechStats.audioStarts,
    'Speech detected callbacks: '+speechStats.speechStarts,
    'Interim result updates: '+speechStats.interim,
    'Final result chunks: '+speechStats.finals,
    'Recognition errors: '+speechStats.errors,
    'Last recognition error: '+speechStats.lastError,
    'Last recognition state: '+speechStats.lastState,
    'Local test attempts: '+speechStats.testAttempts,
    'Local test final chunks: '+speechStats.testFinals,
    'Transcript entries: '+transcriptEntries.length,
    'Channel tracks:',...tracks,
    '',
    'Speech events (text and voice intentionally excluded):',
    ...speechEvents
  ].join('\n');
}
function stopSpeechTest(){
  const c=speechTestCapture;
  if(!c)return;
  speechTestCapture=null;
  try{c.speech.stop();}catch(e){speechEvent('TEST STOP ERROR',e?.name||'unknown');}
  speechEvent('TEST STOP REQUEST');
  renderSpeechDiagnostics();
}
function runSpeechTest(){
  if(speechTestCapture){stopSpeechTest();return;}
  if(!SpeechEngine){speechEvent('TEST UNSUPPORTED');return;}
  if(selectedTx){speechEvent('TEST BLOCKED','Release PTT first');return;}
  if(speechCapture)endSpeechCapture();
  try{
    const speech=new SpeechEngine();
    speech.lang='en-US';speech.continuous=true;speech.interimResults=true;speech.maxAlternatives=1;
    const c={speech,error:false,final:0};
    speechTestCapture=c;
    speechStats.testAttempts++;
    if(ui.speechTestPreview)ui.speechTestPreview.textContent='Listening for a test phrase on this device…';
    speech.onstart=()=>{speechEvent('TEST ENGINE STARTED');};
    speech.onaudiostart=()=>speechEvent('TEST MICROPHONE AUDIO START');
    speech.onspeechstart=()=>speechEvent('TEST SPEECH DETECTED');
    speech.onresult=e=>{
      for(let i=e.resultIndex||0;i<(e.results?.length||0);i++){
        const result=e.results[i];
        const words=String(result?.[0]?.transcript||'').slice(0,160);
        if(result?.isFinal){
          if(!c.seen)c.seen=new Set();
          if(c.seen.has(i))continue;
          c.seen.add(i);c.final++;speechStats.testFinals++;
          speechEvent('TEST FINAL RESULT','characters '+words.length);
          if(ui.speechTestPreview)ui.speechTestPreview.textContent='Test recognized: '+words;
        }else if(words){
          if(ui.speechTestPreview)ui.speechTestPreview.textContent='Hearing (interim): '+words;
        }
      }
    };
    speech.onerror=e=>{
      c.error=true;speechStats.lastError=String(e?.error||'unknown').slice(0,60);
      speechEvent('TEST ERROR',speechStats.lastError);
      if(ui.speechTestPreview)ui.speechTestPreview.textContent='Test failed: '+speechStats.lastError;
    };
    speech.onend=()=>{
      if(speechTestCapture===c)speechTestCapture=null;
      speechEvent('TEST END','final chunks '+c.final+(c.error?', error reported':''));
      if(!c.error&&c.final===0&&ui.speechTestPreview)
        ui.speechTestPreview.textContent='No final words recognized. Copy speech diagnostics to inspect.';
      renderSpeechDiagnostics();
    };
    speechEvent('TEST START REQUESTED','No radio audio transmitted');
    speech.start();
    renderSpeechDiagnostics();
  }catch(e){
    speechTestCapture=null;
    speechStats.lastError=String(e?.name||'start threw');
    speechEvent('TEST START FAILED',speechStats.lastError);
    if(ui.speechTestPreview)ui.speechTestPreview.textContent='Could not start test: '+speechStats.lastError;
  }
}
ui.speechTest?.addEventListener('click',runSpeechTest);
ui.speechCopyDiagnostics?.addEventListener('click',async()=>{
  const report=speechDiagnosticReport();
  try{
    if(!navigator.clipboard?.writeText)throw Error('No clipboard API');
    await navigator.clipboard.writeText(report);
    transcriptStatus('Speech diagnostics copied. Paste them here to troubleshoot.');
  }catch{window.prompt('Copy speech-to-text diagnostics:',report);}
});
renderSpeechDiagnostics();

function transcriptStatus(text){if(ui.transcriptStatus)ui.transcriptStatus.textContent=text;}
function transcriptStamp(time){return new Date(time).toLocaleTimeString([],{
  hour:'2-digit',minute:'2-digit',second:'2-digit'
});}
function renderTranscript(){
  if(!ui.transcriptLog)return;
  const nearBottom=ui.transcriptLog.scrollHeight-ui.transcriptLog.scrollTop-ui.transcriptLog.clientHeight<80;
  ui.transcriptLog.replaceChildren();
  if(!transcriptEntries.length){
    const empty=document.createElement('p');
    empty.className='transcript-empty';
    empty.textContent='No transcribed radio messages yet.';
    ui.transcriptLog.appendChild(empty);
  }
  for(const item of transcriptEntries){
    const entry=document.createElement('div');entry.className='transcript-entry '+item.direction;
    const meta=document.createElement('div');meta.className='transcript-meta';
    const name=document.createElement('strong');
    name.textContent=item.direction==='tx'?'You · '+item.name:item.name;
    const details=document.createElement('span');
    details.textContent=item.channel+' · '+transcriptStamp(item.at)+' · '+(item.direction==='tx'?'SENT':'RECEIVED');
    meta.append(name,details);
    const words=document.createElement('p');words.textContent=item.text;
    entry.append(meta,words);ui.transcriptLog.appendChild(entry);
  }
  if(nearBottom)ui.transcriptLog.scrollTop=ui.transcriptLog.scrollHeight;
  if(ui.transcriptCount)ui.transcriptCount.textContent=transcriptEntries.length+
    (transcriptEntries.length===1?' message':' messages');
  renderTranscriptPopup();
}
function renderTranscriptPopup(){
  if(!ui.transcriptPopupLog)return;
  ui.transcriptPopupLog.replaceChildren();
  if(!transcriptEntries.length){
    const blank=document.createElement('p');
    blank.className='transcript-empty';blank.textContent='No transcribed messages yet.';
    ui.transcriptPopupLog.appendChild(blank);
  }
  for(const item of transcriptEntries.slice(-40)){
    const row=document.createElement('div');
    row.className='transcript-popup-line '+item.direction;
    const meta=document.createElement('strong');
    meta.textContent=(item.direction==='tx'?'You · ':'')+item.name+
      ' · '+item.channel+' · '+transcriptStamp(item.at);
    const text=document.createElement('p');text.textContent=item.text;
    row.append(meta,text);
    ui.transcriptPopupLog.appendChild(row);
  }
  ui.transcriptPopupLog.scrollTop=ui.transcriptPopupLog.scrollHeight;
}
function openTranscriptPopup(){
  transcriptPopupOpen=true;
  ui.transcriptPopup?.classList.remove('hidden');
  renderTranscriptPopup();
}
function closeTranscriptPopup(){
  transcriptPopupOpen=false;
  ui.transcriptPopup?.classList.add('hidden');
}
function persistTranscripts(){
  if(transcriptKeep)storeSet(TRANSCRIPT_STORE_KEY,transcriptEntries);
  else try{localStorage.removeItem(TRANSCRIPT_STORE_KEY);}catch{}
}
function appendTranscript(direction,session,name,words){
  if(typeof words!=='string')return false;
  const text=words.replace(/\s+/g,' ').trim().slice(0,TRANSCRIPT_TEXT_MAX);
  if(!text || !session)return false;
  transcriptEntries.push({direction,channel:session.room.title,name:cleanName(name),
    text,at:Date.now()});
  if(transcriptEntries.length>TRANSCRIPT_MAX)transcriptEntries=transcriptEntries.slice(-TRANSCRIPT_MAX);
  persistTranscripts();renderTranscript();
  if(autoTranscriptPopup){
    if(selectedTx)transcriptPopupPending=true;
    else openTranscriptPopup();
  }
  return true;
}
function transmitCaption(session,text){
  if(!session || session.stopped || sessions.get(session.publicId)!==session)return;
  const clipped=text.slice(0,TRANSCRIPT_TEXT_MAX);
  if(appendTranscript('tx',session,profile.name,clipped))
    session.broadcast({type:'caption',text:clipped});
}
function flushSpeechPending(capture){
  if(!capture.voiceStarted)return;
  while(capture.pending.length)transmitCaption(capture.session,capture.pending.shift());
}

/* V6.7: optional lightweight capture from the already-open PTT microphone
 * followed by local model inference in a worker. Never opens getUserMedia again
 * and never blocks the live WebRTC media path. No audio is persisted/uploaded.
 */
let asrWorker=null,asrState='not-loaded',asrActive=null,asrNextId=0;
const asrJobs=new Map();
const asrStats={recorded:0,queued:0,completed:0,errors:0,lastError:'none'};
function setAsrStatus(message){
  if(ui.asrState)ui.asrState.textContent=message;
}
function renderAsrControls(){
  if(ui.transcriptEngine)ui.transcriptEngine.value=transcriptMode;
  if(ui.asrLoad){
    ui.asrLoad.disabled=transcriptMode!=='local'||asrState==='loading'||asrState==='ready';
    ui.asrLoad.textContent=asrState==='ready'?'On-device model ready':
      asrState==='loading'?'Loading model…':'Download / load on-device speech model';
  }
  if(ui.asrState && transcriptMode!=='local')
    setAsrStatus('Legacy browser speech recognition may conflict with WebRTC microphone on Android.');
  else if(ui.asrState && asrState==='not-loaded')
    setAsrStatus('On-device Whisper is not loaded. Tap Download / load once while online.');
}
function setTranscriptMode(mode){
  if(mode!=='local' && mode!=='browser')return;
  if(transcriptMode!==mode){
    endSpeechCapture();
    transcriptMode=mode;
    storeSet(TRANSCRIPT_ENGINE_KEY,mode);
    speechEvent('SPEECH MODE',mode);
  }
  renderAsrControls();
  if(transcriptEnabled)transcriptStatus(mode==='local'?
    (asrState==='ready'?'Whisper ready: talk normally and text will appear after release.':
      'Tap Download / load on-device speech model to enable PTT captions.'):
    'Using legacy browser recognizer. On Android it may conflict with radio audio.');
}
function initAsrWorker(){
  if(asrWorker)return asrWorker;
  if(typeof Worker==='undefined')throw new Error('Web Workers unavailable on this browser');
  const worker=new Worker('./local-asr-worker.mjs',{type:'module'});
  asrWorker=worker;
  worker.onmessage=event=>{
    const msg=event.data||{};
    if(msg.type==='engine-state'){
      asrState=msg.state||'error';
      setAsrStatus(msg.message||('Model: '+asrState));
      speechEvent('LOCAL MODEL '+asrState.toUpperCase(),String(msg.message||'').slice(0,130));
      if(asrState==='ready' && transcriptMode==='local')
        transcriptStatus('On-device Whisper ready. Hold PTT to speak; text appears after release.');
      renderAsrControls();
    }else if(msg.type==='engine-progress'){
      if(transcriptMode==='local')setAsrStatus('Downloading model assets: '+Math.round(msg.percent||0)+'% (per file)');
    }else if(msg.type==='job-state'){
      if(msg.state==='processing') {
        speechEvent('LOCAL DECODING','job '+msg.id);
        if(transcriptMode==='local')transcriptStatus('Transcribing recorded PTT audio on this device…');
      }
    }else if(msg.type==='job-result'){
      const session=asrJobs.get(msg.id);asrJobs.delete(msg.id);
      asrStats.completed++;
      const result=String(msg.text||'').trim().slice(0,400);
      speechEvent('LOCAL TRANSCRIPT COMPLETE','job '+msg.id+'; characters '+result.length);
      if(result && transcriptEnabled && transcriptMode==='local' && session && sessions.get(session.publicId)===session)
        transmitCaption(session,result);
      if(transcriptMode==='local')transcriptStatus(result?'Transcript completed and sent to joined channel.':
        'No recognizable words in recorded audio.');
    }else if(msg.type==='job-error'){
      asrJobs.delete(msg.id);asrStats.errors++;
      asrStats.lastError=String(msg.error||'unknown').slice(0,130);
      speechEvent('LOCAL TRANSCRIPT ERROR','job '+msg.id+'; '+asrStats.lastError);
      if(transcriptMode==='local')transcriptStatus('Local transcription failed: '+asrStats.lastError);
    }
  };
  worker.onerror=event=>{
    asrState='error';asrStats.errors++;
    asrStats.lastError=String(event?.message||'Worker could not load').slice(0,130);
    speechEvent('LOCAL WORKER ERROR',asrStats.lastError);
    setAsrStatus('Model worker error: '+asrStats.lastError);
    try{asrWorker?.terminate();}catch{}
    asrWorker=null;renderAsrControls();
  };
  return worker;
}
function loadLocalAsr(){
  try{
    if(asrState==='ready'||asrState==='loading')return;
    asrState='loading';renderAsrControls();
    setAsrStatus('Preparing on-device English speech model. This may take time and data.');
    speechEvent('LOCAL MODEL REQUESTED','No microphone request');
    initAsrWorker().postMessage({type:'load'});
  }catch(err){
    asrState='error';asrStats.lastError=String(err?.message||'unavailable').slice(0,130);
    setAsrStatus('Cannot load model: '+asrStats.lastError);
    speechEvent('LOCAL MODEL ERROR',asrStats.lastError);
    renderAsrControls();
  }
}
function localMediaMime(){
  const Media=window.MediaRecorder;
  if(typeof Media!=='function')return null;
  for(const t of ['audio/webm;codecs=opus','audio/webm','audio/mp4']){
    if(typeof Media.isTypeSupported!=='function'||Media.isTypeSupported(t))return t;
  }
  return '';
}
function startLocalCapture(session){
  if(!transcriptEnabled||transcriptMode!=='local'||!session)return;
  if(asrState!=='ready'){
    speechEvent('LOCAL CAPTURE SKIPPED','Model not ready');
    transcriptStatus('Voice sent. Download / load the on-device model to enable captions.');
    return;
  }
  if(asrActive)return;
  let clone=null;
  try{
    const mime=localMediaMime();
    if(mime===null)throw new Error('MediaRecorder is not supported');
    if(!session.track || session.track.readyState!=='live')throw new Error('Radio track is not live');
    clone=session.track.clone();clone.enabled=true;
    const stream=new MediaStream([clone]);
    const recorder=new window.MediaRecorder(stream,mime?{mimeType:mime}:{});
    const capture={session,recorder,clone,chunks:[],started:Date.now(),stopped:false};
    asrActive=capture;
    recorder.ondataavailable=e=>{if(e.data?.size)capture.chunks.push(e.data);};
    recorder.onerror=e=>{
      speechEvent('LOCAL RECORDER ERROR',String(e?.error?.name||'unknown'));
      asrStats.errors++;
    };
    recorder.onstop=()=>{
      if(asrActive===capture)asrActive=null;
      try{clone.stop();}catch{}
      const type=recorder.mimeType||mime||'audio/webm';
      const bytes=capture.chunks.reduce((n,chunk)=>n+chunk.size,0);
      speechEvent('LOCAL AUDIO CAPTURED','bytes '+bytes+'; duration '+(Date.now()-capture.started)+'ms');
      if(bytes>1000 && transcriptEnabled && transcriptMode==='local')
        void decodeLocalPttAudio(capture.session,new Blob(capture.chunks,{type}));
      else if(bytes<=1000 && transcriptMode==='local')
        transcriptStatus('No recorded speech audio found. Check local transcription diagnostics.');
    };
    recorder.start();
    asrStats.recorded++;
    speechEvent('LOCAL RECORDING STARTED','using existing radio track');
  }catch(err){
    try{clone?.stop();}catch{}
    asrActive=null;asrStats.errors++;
    asrStats.lastError=String(err?.message||'capture failed').slice(0,130);
    speechEvent('LOCAL CAPTURE ERROR',asrStats.lastError);
    transcriptStatus('Could not capture shared radio audio: '+asrStats.lastError);
  }
}
function stopLocalCapture(session=null){
  const c=asrActive;
  if(!c || session && c.session!==session)return;
  asrActive=null;
  if(c.stopped)return;
  c.stopped=true;
  try{
    if(c.recorder.state!=='inactive')c.recorder.stop();
    else c.clone.stop();
  }catch(err){
    try{c.clone.stop();}catch{}
    speechEvent('LOCAL RECORDER STOP ERROR',String(err?.name||'unknown'));
  }
}
function downsample16k(buffer,maxDuration=72){
  const rate=buffer.sampleRate,len=Math.min(buffer.length,Math.round(rate*maxDuration));
  const outputLength=Math.floor(len*16000/rate);
  if(!Number.isFinite(rate)||rate<=0||outputLength<=0)throw new Error('Decoded audio was empty');
  const result=new Float32Array(outputLength);
  const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},
    (_,i)=>buffer.getChannelData(i));
  for(let i=0;i<outputLength;i++){
    const pos=i*rate/16000,j=Math.floor(pos),frac=pos-j;
    let sum=0;
    for(const ch of channels)sum+=ch[j]*(1-frac)+(ch[Math.min(j+1,len-1)]||0)*frac;
    result[i]=sum/channels.length;
  }
  return result;
}
async function decodeLocalPttAudio(session,blob){
  let ctx=null;
  try{
    const AudioCtor=window.AudioContext||window.webkitAudioContext;
    if(!AudioCtor)throw new Error('Audio decoding is unavailable');
    ctx=new AudioCtor();
    const decoded=await ctx.decodeAudioData(await blob.arrayBuffer());
    const pcm=downsample16k(decoded);
    let power=0;
    for(let i=0;i<pcm.length;i+=64)power+=pcm[i]*pcm[i];
    const rms=Math.sqrt(power/Math.ceil(pcm.length/64));
    speechEvent('LOCAL AUDIO DECODED','duration '+(pcm.length/16000).toFixed(1)+'s; RMS '+rms.toFixed(4));
    if(rms<0.002){
      transcriptStatus('Recorded radio audio was quiet or silent; no text generated.');
      speechEvent('LOCAL AUDIO TOO QUIET','level below threshold');
      return;
    }
    // Whisper processes up to 25s at once. Cap at three queued chunks to avoid
    // excessive CPU load and retain bounded audio memory on mobile devices.
    const step=24*16000;
    for(let offset=0;offset<pcm.length;offset+=step){
      const chunk=pcm.slice(offset,Math.min(offset+step,pcm.length));
      const id=++asrNextId;
      asrJobs.set(id,session);asrStats.queued++;
      initAsrWorker().postMessage({type:'transcribe',id,audio:chunk.buffer},[chunk.buffer]);
    }
    if(decoded.duration>72)speechEvent('LOCAL AUDIO TRUNCATED','only first 72s processed');
    transcriptStatus('PTT audio recorded. Local transcription queued; voice channel stays active.');
  }catch(err){
    asrStats.errors++;asrStats.lastError=String(err?.message||'audio decode failed').slice(0,130);
    speechEvent('LOCAL AUDIO PROCESS ERROR',asrStats.lastError);
    transcriptStatus('Local audio decoding failed: '+asrStats.lastError);
  }finally{
    try{await ctx?.close();}catch{}
  }
}
ui.transcriptEngine?.addEventListener('change',()=>setTranscriptMode(ui.transcriptEngine.value));
ui.asrLoad?.addEventListener('click',loadLocalAsr);
renderAsrControls();

function beginSpeechCapture(session){
  if(transcriptMode==='local'){
    speechStats.lastPTT='pressed on '+(session?.room?.title||'unknown channel');
    return;
  }
  speechStats.lastPTT='pressed on '+(session?.room?.title||'unknown channel');
  if(!transcriptEnabled){speechEvent('PTT CAPTIONS DISABLED');return;}
  if(!SpeechEngine){
    speechStats.lastError='SpeechRecognition not supported';
    speechEvent('PTT RECOGNITION UNSUPPORTED');
    transcriptStatus('This browser does not provide SpeechRecognition. Radio voice still works.');
    return;
  }
  if(!session){speechEvent('PTT NO CHANNEL');return;}
  if(speechCapture)endSpeechCapture();
  try{
    const speech=new SpeechEngine();
    speech.lang='en-US';
    speech.continuous=true;
    speech.interimResults=true;
    speech.maxAlternatives=1;
    const capture={speech,session,pending:[],seen:new Set(),
      voiceStarted:session.transmitting===true,ended:false,hadError:false,
      finalCount:0,interimCount:0};
    speechCapture=capture;
    speechStats.attempts++;
    speechEvent('PTT RECOGNITION REQUESTED',
      'channel '+session.room.number+'; floor='+Boolean(session.floor===session.myId)+
      '; voice-track enabled='+Boolean(session.track?.enabled));
    speech.onstart=()=>{
      speechStats.starts++;
      speechEvent('ENGINE STARTED','PTT');
      transcriptStatus('Speech recognizer started. Speak while holding Talk.');
    };
    speech.onaudiostart=()=>{
      speechStats.audioStarts++;
      speechEvent('MICROPHONE AUDIO START','PTT');
    };
    speech.onsoundstart=()=>speechEvent('SOUND DETECTED','PTT');
    speech.onspeechstart=()=>{
      speechStats.speechStarts++;
      speechEvent('SPEECH DETECTED','PTT');
    };
    speech.onspeechend=()=>speechEvent('SPEECH ENDED','PTT');
    speech.onaudioend=()=>speechEvent('MICROPHONE AUDIO ENDED','PTT');
    speech.onnomatch=()=>{
      speechEvent('NO RECOGNITION MATCH','PTT');
      transcriptStatus('Speech was heard but not recognized. See diagnostics.');
    };
    speech.onresult=event=>{
      if(!transcriptEnabled)return;
      for(let i=event.resultIndex||0;i<(event.results?.length||0);i++){
        const result=event.results[i];
        if(!result)continue;
        if(!result.isFinal){
          capture.interimCount++;speechStats.interim++;
          if(capture.interimCount===1)speechEvent('INTERIM RESULT','PTT');
          continue;
        }
        if(capture.seen.has(i))continue;
        capture.seen.add(i);
        const text=String(result[0]?.transcript||'').trim();
        if(!text)continue;
        capture.finalCount++;speechStats.finals++;
        speechEvent('FINAL RESULT','characters '+text.length+
          '; voice ready='+capture.voiceStarted);
        capture.pending.push(text);
      }
      flushSpeechPending(capture);
      if(capture.finalCount>0)
        transcriptStatus('Speech recognized. Final text added to radio conversation.');
    };
    speech.onerror=event=>{
      capture.hadError=true;speechStats.errors++;
      speechStats.lastError=String(event?.error||'unknown').slice(0,60);
      speechEvent('RECOGNITION ERROR',speechStats.lastError);
      transcriptStatus('Speech recognition error: '+speechStats.lastError+
        '. Voice radio remains available. Expand Speech-to-text diagnostics.');
    };
    speech.onend=()=>{
      capture.ended=true;
      if(speechCapture===capture)speechCapture=null;
      speechEvent('RECOGNITION ENDED',
        'final='+capture.finalCount+'; interim='+capture.interimCount+
        '; PTT transmit granted='+capture.voiceStarted+
        (capture.hadError?'; error='+speechStats.lastError:''));
      if(!speechCapture&&transcriptEnabled){
        if(capture.hadError)transcriptStatus('Speech recognition failed ('+
          speechStats.lastError+'). Expand diagnostics for details.');
        else if(capture.finalCount===0)
          transcriptStatus('No text recognized. Expand Speech-to-text diagnostics to see whether the microphone started.');
        else transcriptStatus('Text captured. Ready for the next transmission.');
      }
    };
    transcriptStatus('Requesting browser speech recognition…');
    // Called within PTT user gesture. Never delay or await the voice sender.
    speech.start();
  }catch(error){
    if(speechCapture?.session===session)speechCapture=null;
    speechStats.errors++;
    speechStats.lastError=String(error?.name||'start threw').slice(0,60);
    speechEvent('RECOGNITION START FAILED',speechStats.lastError);
    transcriptStatus('Speech recognition could not start ('+speechStats.lastError+
      '). Voice radio remains unaffected.');
  }
}
function speechDidTransmit(session){
  if(transcriptMode==='local'){
    speechStats.lastPTT='voice transmitting on '+session.room.title;
    startLocalCapture(session);
    return;
  }
  speechStats.lastPTT='voice transmitting on '+session.room.title;
  if(speechCapture?.session===session){
    speechCapture.voiceStarted=true;
    speechEvent('PTT VOICE TRACK ENABLED','captions may be delivered');
    flushSpeechPending(speechCapture);
  }else if(transcriptEnabled) speechEvent('PTT VOICE TRACK ENABLED',
    SpeechEngine?'no speech capture active':'SpeechRecognition unsupported');
}
function endSpeechCapture(session=null){
  if(transcriptMode==='local')stopLocalCapture(session);
  const c=speechCapture;
  if(!c || session && c.session!==session)return;
  speechCapture=null;
  speechEvent('RECOGNITION STOP REQUESTED',
    'floor='+c.voiceStarted+'; final='+c.finalCount+'; interim='+c.interimCount);
  try{c.speech.stop();}catch(error){
    speechEvent('RECOGNITION STOP FAILED',String(error?.name||'unknown'));
  }
  if(transcriptEnabled && !c.hadError)transcriptStatus('Finishing speech recognition…');
}
function setTranscriptEnabled(enabled){
  transcriptEnabled=Boolean(enabled);storeSet(TRANSCRIPT_ENABLED_KEY,transcriptEnabled);
  if(ui.transcriptEnabled)ui.transcriptEnabled.checked=transcriptEnabled;
  if(!transcriptEnabled){endSpeechCapture();transcriptStatus('Your speech recognition is off. Incoming captions can still appear.');}
  else if(transcriptMode==='local')transcriptStatus(asrState==='ready'?
    'On-device Whisper ready. Text appears after PTT is released.':
    'On-device model not loaded. Tap Download / load on-device speech model first.');
  else if(!SpeechEngine)transcriptStatus('Legacy browser recognition is unavailable in this browser.');
  else transcriptStatus('Legacy browser recognition is ready; it may conflict with radio audio on Android.');
  speechEvent(transcriptEnabled?'CAPTIONS ENABLED':'CAPTIONS DISABLED',
    transcriptMode==='local'?'on-device engine '+asrState:
    SpeechEngine?'legacy Speech API present':'legacy Speech API unavailable');
}
if(ui.transcriptEnabled)ui.transcriptEnabled.addEventListener('change',()=>{
  setTranscriptEnabled(ui.transcriptEnabled.checked);
});
if(ui.transcriptAutoPopup)ui.transcriptAutoPopup.addEventListener('change',()=>{
  autoTranscriptPopup=ui.transcriptAutoPopup.checked;
  storeSet(TRANSCRIPT_AUTOPOP_KEY,autoTranscriptPopup);
  if(!autoTranscriptPopup)transcriptPopupPending=false;
});
ui.transcriptOpen?.addEventListener('click',openTranscriptPopup);
ui.transcriptClose?.addEventListener('click',closeTranscriptPopup);
if(ui.transcriptKeep)ui.transcriptKeep.addEventListener('change',()=>{
  transcriptKeep=ui.transcriptKeep.checked;
  storeSet(TRANSCRIPT_KEEP_KEY,transcriptKeep);
  persistTranscripts();
});
if(ui.transcriptCopy)ui.transcriptCopy.addEventListener('click',async()=>{
  const lines=transcriptEntries.map(item=>'['+transcriptStamp(item.at)+'] '+
    item.channel+' | '+(item.direction==='tx'?'You ('+item.name+')':item.name)+
    ' | '+item.text);
  const text=lines.join('\n');
  try{
    if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    transcriptStatus('Conversation copied. '+lines.length+' message(s).');
  }catch{window.prompt('Copy radio conversation:',text);}
});
if(ui.transcriptClear)ui.transcriptClear.addEventListener('click',()=>{
  if(!window.confirm('Clear all transcript text from this browser?'))return;
  transcriptEntries=[];persistTranscripts();renderTranscript();
  transcriptStatus('Transcript cleared. Voice channels are unchanged.');
});
if(ui.transcriptKeep)ui.transcriptKeep.checked=transcriptKeep;
if(ui.transcriptAutoPopup)ui.transcriptAutoPopup.checked=autoTranscriptPopup;
setTranscriptEnabled(transcriptEnabled);
renderTranscript();

let nextMediaNegotiation=0;
const MEDIA_NEGOTIATION_GAP=650, MEDIA_SETTLE_MS=250;
function logRadio(event,channel='',detail=''){
  const text=[new Date().toISOString(),channel||'DEVICE',event,detail].filter(Boolean).join(' | ');
  diagnosticEvents.push(text);
  if(diagnosticEvents.length>DIAGNOSTIC_LIMIT)diagnosticEvents.shift();
  if(ui.diagnostics)ui.diagnostics.textContent=diagnosticEvents.join('\n');
  // Avoid logging callsigns, room IDs, PINs, conversation content, or microphone recordings.
}
function diagnosticReport(){
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  const kind=connection?.effectiveType||'unavailable';
  const current=Array.from(sessions.values()).map(s=>{
    const peers=[...s.members.values()].filter(m=>m.data?.open);
    const audio=peers.filter(m=>m.stream).length;
    const ice=peers.map(m=>m.call?.peerConnection?.iceConnectionState||'none').join(',');
    return s.room.title+': signaling '+(s.ready()?'ready':'waiting')+
      ', voice '+audio+'/'+peers.length+', ICE '+ice;
  });
  const data=usageMeter.snapshot();
  return ['Relay One V6.11 connection diagnostics',
    'Microphone mode: '+(pttOnlyMicrophone?'PTT only':'always ready'),
    'Radio mode: '+radioMode,
    'Estimated WebRTC session: sent '+formatDataBytes(data.session.tx)+', received '+formatDataBytes(data.session.rx),
    'Estimated saved: sent '+formatDataBytes(data.saved.tx)+', received '+formatDataBytes(data.saved.rx),
    'Recorded: '+new Date().toISOString(),
    'Browser online: '+(navigator.onLine===false?'no':'yes/unknown'),
    'Network effective type: '+kind+' (if available; not cellular signal)',
    'Active channels: '+sessions.size,
    ...current,'','Recent events:',...diagnosticEvents,'','--- Speech to text ---',speechDiagnosticReport(),'','--- External headset PTT ---',hardwareDiagnosticReport()].join('\n');
}
if(ui.copyDiagnostics)ui.copyDiagnostics.addEventListener('click',async()=>{
  const report=diagnosticReport();
  try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');
    await navigator.clipboard.writeText(report);setMessage('Diagnostic log copied. You can paste it here for analysis.');
  }catch{window.prompt('Copy connection diagnostics:',report);}
});
if(ui.clearDiagnostics)ui.clearDiagnostics.addEventListener('click',()=>{
  diagnosticEvents.length=0;if(ui.diagnostics)ui.diagnostics.textContent='Diagnostic log cleared.';
});
window.addEventListener('offline',()=>logRadio('BROWSER OFFLINE','','Browser reports internet unavailable'));
window.addEventListener('online',()=>logRadio('BROWSER ONLINE','','Browser reports internet reachable'));
const connectionInfo=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
connectionInfo?.addEventListener?.('change',()=>{
  logRadio('NETWORK TYPE CHANGE','',connectionInfo.effectiveType||'type not exposed');
});
logRadio('RADIO START','','Connection diagnostics enabled; no PINs, IDs or audio recorded');
const makeCtx=()=>{if(!alertContext){const C=window.AudioContext||window.webkitAudioContext;if(C)alertContext=new C();}return alertContext;};
function unlockSound(){try{const ctx=makeCtx();if(ctx?.state==='suspended')void ctx.resume().catch(()=>{});}catch{}}
function playTone(kind){
  try{
    unlockSound();
    const ctx=alertContext;
    if(!ctx || ctx.state!=='running')return;
    const start=ctx.currentTime+0.02;
    const bursts=kind==='call'?[{at:0,len:0.24,hz:960},{at:.32,len:.24,hz:960}]:
      kind==='ready'?[{at:0,len:.095,hz:1180}]:
      kind==='toggle-stop'?[{at:0,len:.12,hz:560}]:[{at:0,len:.18,hz:880}];
    for(const b of bursts){
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type=['call','ready','toggle-stop'].includes(kind)?'sine':'square';
      osc.frequency.setValueAtTime(b.hz,start+b.at);
      if(kind==='squawk')osc.frequency.exponentialRampToValueAtTime(530,start+b.at+b.len);
      const volume=['ready','toggle-stop'].includes(kind)?.06:.11;
      gain.gain.setValueAtTime(.001,start+b.at);
      gain.gain.linearRampToValueAtTime(volume,start+b.at+.018);
      gain.gain.setValueAtTime(volume,start+b.at+b.len-.04);
      gain.gain.exponentialRampToValueAtTime(.001,start+b.at+b.len);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.start(start+b.at);osc.stop(start+b.at+b.len+.01);
    }
  }catch(err){console.warn('Sound playback unavailable',err);}
}
function persistDesired(){storeSet(ACTIVE_KEY,[...desiredJoined]);}
function persistMonitors(){storeSet(MONITOR_KEY,monitorPrefs);}
function reportError(message){ui.error.textContent=message;ui.error.classList.remove('hidden');logRadio('ERROR','',message);}
function clearError(){ui.error.textContent='';ui.error.classList.add('hidden');}
function setMessage(text){
  ui.message.textContent=text;
  if(ui.radioScreenMessage)ui.radioScreenMessage.textContent=text;
}
function storedRoom(id){return channels.find(c=>c.id===id);}
function getProfile(){profile.name=cleanName(ui.name.value);ui.name.value=profile.name;storeSet(PROFILE_KEY,profile);}
function monitorValue(id){return monitorPrefs[id]!==false;}
function setMonitor(id,enabled){
  monitorPrefs[id]=!!enabled;persistMonitors();
  sessions.get(id)?.setMonitor(enabled);
  scanTick();updateRow(id);updateQuick();
}
function storeProfile(){storeSet(PROFILE_KEY,profile);}
function drawColors(){
  ui.colors.replaceChildren();
  for(const color of PALETTE){
    const b=document.createElement('button');b.type='button';b.className='color-choice'+(profile.color===color?' selected':'');
    b.style.setProperty('--swatch',color);b.setAttribute('aria-label','Profile color '+color);
    b.setAttribute('aria-pressed',String(profile.color===color));
    b.addEventListener('click',()=>{profile.color=color;storeProfile();drawColors();for(const s of sessions.values())s.sendHello();});
    ui.colors.appendChild(b);
  }
}
ui.name.value=profile.name;
ui.name.addEventListener('change',()=>{getProfile();for(const s of sessions.values())s.sendHello();});
ui.txTone.checked=profile.txTone;ui.rxTone.checked=profile.rxTone;ui.alertTone.checked=profile.alertTone;
ui.txTone.addEventListener('change',()=>{profile.txTone=ui.txTone.checked;storeProfile();});
ui.rxTone.addEventListener('change',()=>{profile.rxTone=ui.rxTone.checked;storeProfile();});
ui.alertTone.addEventListener('change',()=>{profile.alertTone=ui.alertTone.checked;storeProfile();});
// Fixed radio plan: ordinary users cannot create channels, modify PINs, or view admin settings.


/* V6.8: The default retains the existing hot microphone track for lowest-latency
 * PTT. Optional privacy mode maintains a live, silent WebRTC placeholder track
 * while releasing the physical microphone completely between PTT presses.
 * Connecting mic input through a Web Audio destination avoids renegotiating
 * PeerJS calls, and Whisper still clones the active session output track.
 */
const MICROPHONE_CONSTRAINTS={
  audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},
  video:false
};
function micStateSummary(){
  if(!pttOnlyMicrophone)return microphone?.getAudioTracks?.()[0]?.readyState==='live'?
    'Always ready: microphone open, muted until authorized Talk.':
    'Always ready: microphone will open when joining a channel.';
  const active=[...sessions.values()].find(s=>s.pttMode&&s.pttInputStream);
  const waiting=[...sessions.values()].find(s=>s.pttMode&&s.pttMicPending);
  return active?'PTT only: microphone ON while Talk is held.':
    waiting?'PTT only: starting microphone… keep holding Talk.':
    'PTT only: microphone OFF while idle; joined channels still receive.';
}
function renderMicMode(){
  if(ui.pttOnlyMicrophone)ui.pttOnlyMicrophone.checked=pttOnlyMicrophone;
  if(ui.pttReadyCue){
    ui.pttReadyCue.checked=pttReadyCue;
    ui.pttReadyCue.disabled=!pttOnlyMicrophone;
  }
  if(ui.micModeStatus)ui.micModeStatus.textContent=micStateSummary();
  if(ui.micDelayStatus)ui.micDelayStatus.textContent=pttOnlyMicrophone?
    (pttTiming.lastReadyMs===null?'PTT-only: hold Talk until TRANSMITTING. Startup time is measured after your first press.':
    'Last PTT-only start-up: '+pttTiming.lastReadyMs+' ms to transmit'+
    (pttTiming.lastMicMs===null?'':'; physical mic ready in '+pttTiming.lastMicMs+' ms')+
    '. Wait for TRANSMITTING'+(pttReadyCue?' or the beep':'')+' before speaking.'):
    'Always-ready mode gives the fastest talk start; the microphone remains muted while idle.';
}
function makeStandbyAudio(){
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C)throw new Error('PTT-only mode requires Web Audio support');
  if(!standbyAudioContext || standbyAudioContext.state==='closed')standbyAudioContext=new C();
  const destination=standbyAudioContext.createMediaStreamDestination();
  const source=standbyAudioContext.createConstantSource?
    standbyAudioContext.createConstantSource():standbyAudioContext.createOscillator();
  const zero=standbyAudioContext.createGain();
  zero.gain.value=0;
  source.connect(zero);zero.connect(destination);source.start();
  const track=destination.stream?.getAudioTracks()?.[0];
  if(!track){source.stop();source.disconnect();zero.disconnect();throw Error('Cannot create a standby radio audio track');}
  track.enabled=false;
  return {track,stream:destination.stream,destination,source,zero,context:standbyAudioContext};
}
function closeStandbyAudioIfUnused(){
  if([...sessions.values()].some(s=>s.pttMode))return;
  const ctx=standbyAudioContext;standbyAudioContext=null;
  if(ctx)try{void ctx.close();}catch{}
}
function releasePTTMicrophone(session){
  if(!session?.pttMode)return;
  ++session.pttMicSerial; // Invalidate any getUserMedia resolving after release.
  const node=session.pttInputNode,stream=session.pttInputStream;
  session.pttInputNode=null;session.pttInputStream=null;session.pttMicPending=null;
  try{node?.disconnect();}catch{}
  try{stream?.getTracks().forEach(track=>track.stop());}catch{}
  if(stream)logRadio('PTT MIC OFF',session.room.title,'Physical microphone released');
  renderMicMode();
}
async function preparePTTMicrophone(session){
  if(!session?.pttMode||session.pttInputStream||session.pttMicPending)return;
  const epoch=++session.pttMicSerial;
  logRadio('PTT MIC REQUEST',session.room.title,'Opening physical microphone');
  // Must be requested directly from the PTT gesture, before awaiting signaling.
  try{
    const work=navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS);
    session.pttMicPending=work;
    renderMicMode();
    const stream=await work;
    if(session.pttMicSerial!==epoch ||session.stopped || !session.wantTalk ||selectedTx!==session){
      stream.getTracks().forEach(track=>track.stop());
      logRadio('PTT MIC CANCELLED',session.room.title,'Late microphone permission or quick release');
      return;
    }
    const micMs=Math.max(0,Date.now()-session.pttPressedAt);
    pttTiming.lastMicMs=micMs;
    if(micMs>=1000)pttTiming.slowMic++;
    speechEvent('PTT MIC ACQUIRED','after '+micMs+' ms (device microphone ready)');
    const input=session.pttContext.createMediaStreamSource(stream);
    try{input.connect(session.pttDestination);}
    catch(error){input.disconnect();stream.getTracks().forEach(track=>track.stop());throw error;}
    session.pttInputStream=stream;session.pttInputNode=input;
    logRadio('PTT MIC ON',session.room.title,'Input ready after '+micMs+' ms');
    session.transmitIfAllowed(false);
    renderMicMode();
  }catch(error){
    if(session.pttMicSerial===epoch){
      const reason=String(error?.name||error?.message||'unknown').slice(0,85);
      logRadio('PTT MIC ERROR',session.room.title,reason);
      reportError('PTT-only microphone failed to activate ('+reason+'). Try again or uncheck PTT-only mode.');
      session.note='Microphone could not activate: '+reason;
      updateRow(session.publicId);updateQuick();
    }
  }finally{
    if(session.pttMicSerial===epoch)session.pttMicPending=null;
    renderMicMode();
  }
}
async function setPTTOnlyMicrophone(enabled){
  const next=Boolean(enabled);
  if(next===pttOnlyMicrophone){renderMicMode();return;}
  if(selectedTx||joinInProgress){
    setMessage('Release Talk and wait for channel joining to finish before changing microphone mode.');
    renderMicMode();return;
  }
  const rejoin=[...sessions.keys()];
  // Existing call tracks are a different kind (hardware mic vs silent AudioContext
  // placeholder). Briefly reconnect only on a mode change, NEVER for each PTT.
  for(const id of rejoin)leaveChannel(id);
  pttOnlyMicrophone=next;storeSet(PTT_MIC_MODE_KEY,next);renderMicMode();
  logRadio('MICROPHONE MODE','','Changed to '+(next?'PTT only':'always ready'));
  for(const id of rejoin){
    const room=storedRoom(id);
    if(room)await joinChannel(room);
  }
  setMessage((next?'PTT-only microphone enabled. Released when idle.':
    'Always-ready microphone enabled. Muted when idle.')+
    (rejoin.length?' Joined channels reconnected.':''));
  renderMicMode();
}
ui.pttOnlyMicrophone?.addEventListener('change',()=>{void setPTTOnlyMicrophone(ui.pttOnlyMicrophone.checked);});
ui.pttReadyCue?.addEventListener('change',()=>{
  pttReadyCue=Boolean(ui.pttReadyCue.checked);
  storeSet(PTT_READY_CUE_KEY,pttReadyCue);
  renderMicMode();
});
renderMicMode();

async function ensureMicrophone(){
  if(microphone && microphone.getAudioTracks()[0]?.readyState==='live')return microphone;
  if(micPromise)return micPromise;
  micPromise=navigator.mediaDevices.getUserMedia(MICROPHONE_CONSTRAINTS)
    .then(stream=>{
      const source=stream.getAudioTracks()[0];
      if(!source || typeof source.clone!=='function'){stream.getTracks().forEach(x=>x.stop());throw Error('This browser cannot create separate microphone tracks. No channels were connected.');}
      source.enabled=false;
      source.onended=()=>{reportError('Microphone permission or device was lost. Leave and rejoin channels to restore it.');leaveAll();};
      microphone=stream;
      return stream;
    }).finally(()=>{micPromise=null;});
  return micPromise;
}
function releaseMicrophoneIfUnused(){
  if(sessions.size || micPromise)return;
  try{microphone?.getTracks().forEach(t=>t.stop());}catch{}
  microphone=null;
}
function leaveAll(){for(const s of [...sessions.values()])leaveChannel(s.publicId);}
async function joinChannel(c){
  if(!c || !channelIds.has(c.id) || sessions.has(c.id))return;
  if(!modeAllows(c)){setMessage('Switch to Advanced mode to join '+c.title+'.');return;}
  if(sessions.size+joinInProgress>=maxActiveChannels()){setMessage('Limit: '+maxActiveChannels()+' simultaneous joined channels in '+radioMode+' mode.');return;}
  if(!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof window.Peer!=='function'){
    reportError('This radio requires HTTPS, microphone permission, and PeerJS connectivity.');return;
  }
  let pin=null,roomId=c.id;
  if(c.secure){
    pin=pinCache.get(c.id);
    if(!pin){
      pin=window.prompt('Enter the 4-digit PIN for '+c.title+'.');
      if(pin===null)return;
      pin=pin.trim();
      if(!/^[0-9]{4}$/.test(pin)){setMessage('Enter exactly four numeric digits for this private channel.');return;}
    }
  }
  unlockSound();getProfile();clearError();joinInProgress++;setMessage('Checking access to '+c.title+'…');
  try{
    if(c.secure){
      const permitted=await checkChannelPin(c,pin);
      if(!permitted){
        pinCache.delete(c.id);
        setMessage('Incorrect PIN for '+c.title+'. Channel not joined.');
        return;
      }
      roomId=await deriveProtectedRoomId(c.id,pin);
      pinCache.set(c.id,pin);
    }
    if(sessions.has(c.id) || !modeAllows(c))return;
    const mic=pttOnlyMicrophone?null:await ensureMicrophone();
    if(!modeAllows(c) || sessions.size>=maxActiveChannels())return;
    const standby=pttOnlyMicrophone?makeStandbyAudio():null;
    const track=standby?standby.track:mic.getAudioTracks()[0].clone();
    track.enabled=false;
    // In PTT-only mode a silent audio track keeps WebRTC alive without owning a mic.
    const stream=standby?standby.stream:new MediaStream([track]);
    const session=new ChannelSession(c,roomId,track,stream,monitorValue(c.id));
    session.pttMode=!!standby;
    if(standby){
      session.pttContext=standby.context;
      session.pttDestination=standby.destination;
      session.pttSilence=standby.source;
      session.pttZero=standby.zero;
    }
    sessions.set(c.id,session);
    desiredJoined.add(c.id);persistDesired();
    if(!sessions.has(focusedId))focusedId=c.id;
    session.start();
    logRadio('CHANNEL JOIN',c.title,pttOnlyMicrophone?
      'Silent standby track; microphone not requested':'New microphone track; independent WebRTC room');
    renderMicMode();
    setMessage('Joined '+c.title+'. Keep this page open while using the radio.');
    updateAll();
  }catch(err){reportError(err?.message||'Cannot start the channel.');setMessage('Unable to join '+c.title);}
  finally{joinInProgress--;releaseMicrophoneIfUnused();closeStandbyAudioIfUnused();}
}
function leaveChannel(id){
  const s=sessions.get(id);
  if(!s)return;
  if(selectedTx===s)releaseTalk(s);
  logRadio('CHANNEL LEAVE',s.room.title);s.stop();sessions.delete(id);desiredJoined.delete(id);persistDesired();
  if(focusedId===id)focusedId=viewId===id?null:(sessions.keys().next().value||null);
  if(scanPreviewId===id)scanPreviewId=null;
  if(scanActivityId===id)scanActivityId=null;
  releaseMicrophoneIfUnused();closeStandbyAudioIfUnused();renderMicMode();scanTick();updateAll();
}
async function restoreJoined(){
  const ids=[...desiredJoined].filter(id=>modeAllows(storedRoom(id))).slice(0,maxActiveChannels());
  if(!ids.length){setMessage('No previous joined channels are saved. Join the groups you want first.');return;}
  for(const id of ids){const c=storedRoom(id);if(c)await joinChannel(c);}
}
ui.restore.addEventListener('click',restoreJoined);
ui.monitorAll.addEventListener('click',()=>{for(const session of sessions.values())setMonitor(session.publicId,true);setMessage('Monitoring enabled for your joined channels only.');});
ui.muteAll.addEventListener('click',()=>{for(const session of sessions.values())setMonitor(session.publicId,false);setMessage('Joined channels are locally muted. You can still transmit to one of them.');});
ui.enableSpeakers.addEventListener('click',async()=>{
  unlockSound();
  let count=0;
  for(const s of sessions.values()){
    s.applyAudioOutput();
    if(!s.monitor || selectedTx && selectedTx!==s)continue;
    for(const m of s.members.values())if(m.audio){try{await m.audio.play();count++;}catch{}}
  }
  setMessage(count?'Speakers enabled for '+count+' connected audio feed(s).':'No incoming audio streams yet. Try again when another member joins.');
});

function startPTT(s){
  if(!s || !s.ready() || selectedTx && selectedTx!==s || s.floor && s.floor!==s.myId)return;
  if(speechTestCapture)stopSpeechTest();
  unlockSound();selectedTx=s;s.wantTalk=true;logRadio('PTT PRESSED',s.room.title);
  if(s.pttMode){
    s.pttPressedAt=Date.now();
    pttTiming.presses++;
    speechEvent('PTT MIC PRESS','PTT-only mode; acquiring microphone on demand');
    try{void s.pttContext?.resume();}catch{}
    void preparePTTMicrophone(s);
  }
  renderMicMode();
  for(const other of sessions.values())other.applyAudioOutput();
  if(s.isHost){if(!s.floor)s.setFloor(s.myId,profile.txTone);}
  else s.send(s.hostId(),{type:'request',tone:profile.txTone});
  updateAll();
  beginSpeechCapture(s);
}
function releaseTalk(s){
  if(!s)return;
  const externalStopCue=externalSession===s&&externalMode==='toggle'&&externalCue;
  if(externalSession===s){
    clearExternalSession(s);externalCounts.release++;
    externalMessage='External transmission stopped.';
    externalEvent('EXTERNAL PTT RELEASE','Radio released');
  }
  if(s.pttMode && !s.transmitting){
    pttTiming.cancelledBeforeReady++;
    speechEvent('PTT ENDED BEFORE READY','release without active transmission');
  }
  s.wantTalk=false;endSpeechCapture(s);s.disableTransmit();
  if(externalStopCue)playTone('toggle-stop');
  speechStats.lastPTT='released '+s.room.title;
  speechEvent('PTT RELEASED','voice track disabled');
  logRadio('PTT RELEASED',s.room.title);
  if(selectedTx===s)selectedTx=null;
  renderMicMode();
  if(transcriptPopupPending && autoTranscriptPopup){
    transcriptPopupPending=false;
    openTranscriptPopup();
  }
  for(const other of sessions.values())other.applyAudioOutput();
  if(s.isHost){if(s.floor===s.myId)s.setFloor(null);}
  else if(s.ready())s.send(s.hostId(),{type:'release'});
  updateAll();
}

/* V6.10: browser-exposed hardware keyboard/HID-style down/up events only.
 * Learning never transmits. Outside explicit learning, ignore unbound keys.
 */
const EXTERNAL_TEST_LIMIT=20000,EXTERNAL_MIN_TEST_HOLD=250;
const externalEventTime=e=>Number.isFinite(e?.timeStamp)?e.timeStamp:Date.now();
const externalLabel=b=>b?b.replace(/^(code|key):/,''):'none';
function renderExternalPTT(){
  if(ui.hardwareLearn)ui.hardwareLearn.textContent=externalLearning?'Stop detection':'Detect button';
  if(ui.hardwareBind)ui.hardwareBind.disabled=externalLearning||!externalCandidate||Boolean(selectedTx);
  if(ui.hardwareClear)ui.hardwareClear.disabled=!externalBinding&&!externalCandidate;
  if(ui.hardwareEnabled){ui.hardwareEnabled.checked=externalEnabled;ui.hardwareEnabled.disabled=!externalBinding||externalLearning;}
  if(ui.hardwareMode){ui.hardwareMode.value=externalMode;ui.hardwareMode.disabled=Boolean(externalSession);}
  if(ui.hardwareTimeout){ui.hardwareTimeout.value=String(externalTimeout);ui.hardwareTimeout.disabled=Boolean(externalSession);}
  if(ui.hardwareCue)ui.hardwareCue.checked=externalCue;
  if(ui.hardwareStop)ui.hardwareStop.disabled=!externalSession;
  if(ui.hardwareStatus)ui.hardwareStatus.textContent=externalMessage||
    (externalBinding?(externalEnabled?'Enabled: ':'Bound, disabled: ')+externalLabel(externalBinding)+(externalMode==='toggle'?'. Press once to start, again to stop.':'. Hold and release your headset button.'):'No external button configured.');
  if(ui.hardwareLog)ui.hardwareLog.textContent=externalEvents.length?externalEvents.join('\n'):'No hardware button test yet.';
}
function externalEvent(kind,detail=''){
  externalEvents.push([new Date().toISOString(),kind,detail].filter(Boolean).join(' | '));
  if(externalEvents.length>40)externalEvents.shift();
  renderExternalPTT();
}
function saveExternalPTT(){storeSet(EXTERNAL_PTT_KEY,{binding:externalBinding,enabled:externalEnabled,mode:externalMode,timeout:externalTimeout,cue:externalCue});}
function changeExternalMode(mode){
  if(!['hold','toggle'].includes(mode)||mode===externalMode||externalSession){renderExternalPTT();return;}
  if(externalLearning)finishExternalDetection();
  // Require a new learning test; a short pulse must never become a hold binding.
  externalMode=mode;externalBinding=null;externalCandidate=null;externalEnabled=false;externalNeedsRelease=false;
  if(mode==='toggle')externalTimeout=30;
  saveExternalPTT();externalMessage='Mode changed. Detect your button again, save it, then enable external PTT.';
  externalEvent('MODE CHANGED',mode);
}
function editableKeyTarget(target){
  if(target?.isContentEditable)return true;
  const field=target?.closest?.('input,textarea,select,[contenteditable="true"]')||target;
  if(field?.tagName==='INPUT'&&['checkbox','radio','button','submit','range'].includes(field.type))return false;
  return Boolean(field?.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(field?.tagName));
}
function hardwareSignature(e){
  if(e.isComposing||e.altKey||e.ctrlKey||e.metaKey||['Escape','Tab','Shift','Control','Alt','Meta','CapsLock'].includes(e.key))return null;
  const code=String(e.code||'');
  if(/^[A-Za-z0-9_-]{1,70}$/.test(code)&&!['Unidentified','Process','Dead'].includes(code))return 'code:'+code;
  const key=String(e.key||'');
  if(/^(Media[A-Za-z0-9]+|AudioVolume[A-Za-z0-9]+|Volume[A-Za-z0-9]+|F(?:[1-9]|1[0-9]|2[0-4])|HeadsetHook|Launch[A-Za-z0-9]+|Enter)$/.test(key))return 'key:'+key;
  return null;
}
function consumeHardwareKey(e){e.preventDefault?.();e.stopPropagation?.();}
function finishExternalDetection(reason='Detection stopped.'){
  if(externalLearnTimer!==null){clearTimeout(externalLearnTimer);externalLearnTimer=null;}
  externalLearning=false;externalDown=null;externalMessage=reason;renderExternalPTT();
}
function startExternalDetection(){
  if(externalLearning){finishExternalDetection();return;}
  if(selectedTx){externalMessage='Release Talk before detecting an external button.';renderExternalPTT();return;}
  externalLearning=true;externalCandidate=null;externalDown=null;externalPressedAt=0;
  externalCounts.testDown=0;externalCounts.testUp=0;externalCounts.unknown=0;
  externalMessage='Listening for the physical button for 20 seconds. No radio transmission.';
  ui.hardwareLearn?.blur?.();
  externalEvent('DETECTION START',externalMode==='toggle'?'Tap and release the headset button once':'Hold the headset button for one second, then release');
  externalLearnTimer=setTimeout(()=>{
    finishExternalDetection(externalCounts.testDown?'No matching release reached Chrome. This button cannot be safely bound.':'No button press reached Chrome. Android may be intercepting it.');
    externalEvent('DETECTION TIMEOUT','No verified press/release pair');
  },EXTERNAL_TEST_LIMIT);
}
function clearExternalSession(s){
  if(s&&externalSession!==s)return;
  if(externalWatchdog!==null){clearTimeout(externalWatchdog);externalWatchdog=null;}
  externalSession=null;
}
function stopExternalPTT(reason){
  const session=externalSession;clearExternalSession();
  if(!session)return;
  externalCounts.release++;externalMessage=reason;externalEvent('EXTERNAL PTT RELEASE',reason);
  if(selectedTx===session)releaseTalk(session);
  if(externalMode==='toggle'&&externalCue)playTone('toggle-stop');
  renderExternalPTT();
}
function setExternalEnabled(enabled){
  if(!enabled)stopExternalPTT('External PTT disabled.');
  externalEnabled=Boolean(enabled&&externalBinding);externalNeedsRelease=false;
  saveExternalPTT();externalMessage='';renderExternalPTT();
}
function externalKeyDown(e){
  if(e.isComposing||e.defaultPrevented||document.hidden)return;
  const sig=hardwareSignature(e);
  // Never block the bound stop signal because focus moved to a settings field.
  const stopping=externalMode==='toggle'&&externalSession&&sig===externalBinding;
  if(editableKeyTarget(e.target)&&!stopping)return;
  if(externalLearning){
    if(e.repeat)return;
    if(!sig){if(e.key==='Unidentified'||!e.code){externalCounts.unknown++;externalEvent('UNKNOWN DOWN','No usable button identity');}return;}
    consumeHardwareKey(e);
    if(externalDown)return;
    externalDown=sig;externalPressedAt=externalEventTime(e);externalCounts.testDown++;
    externalMessage='Press detected: '+externalLabel(sig)+'. Release now.';
    externalEvent('TEST PRESS',externalLabel(sig));return;
  }
  if(!externalEnabled||!sig||sig!==externalBinding)return;
  consumeHardwareKey(e);
  if(e.repeat||externalNeedsRelease)return;
  externalNeedsRelease=true;
  if(externalSession){
    if(externalMode==='toggle')stopExternalPTT('External toggle pressed again; transmission stopped.');
    return;
  }
  if(selectedTx)return;
  const target=sessions.get(focusedId);
  if(!target||!target.ready()||target.floor&&target.floor!==target.myId){
    externalMessage='Button detected, but the selected channel is not ready for Talk.';
    externalEvent('EXTERNAL PTT BLOCKED','No idle joined target');return;
  }
  // Mark ownership before starting: host floor authorization can be synchronous.
  externalSession=target;
  startPTT(target);
  if(selectedTx!==target||!target.wantTalk){clearExternalSession(target);return;}
  externalCounts.press++;
  externalMessage=externalMode==='toggle'?
    'External toggle ON on '+target.room.title+'. Wait for TRANSMITTING; press again or tap Talk to stop.':
    'External PTT held on '+target.room.title+'. Release to stop.';
  externalEvent('EXTERNAL PTT PRESS',target.room.title+'; '+externalMode);
  externalWatchdog=setTimeout(()=>{
    externalCounts.timeout++;
    stopExternalPTT('Safety timeout: Talk stopped after '+externalTimeout+' seconds.');
  },externalTimeout*1000);
}
function externalKeyUp(e){
  const sig=hardwareSignature(e);
  if(externalLearning){
    if(editableKeyTarget(e.target))return;
    if(!sig){if(e.key==='Unidentified'||!e.code){externalCounts.unknown++;externalEvent('UNKNOWN UP','No usable button identity');}return;}
    consumeHardwareKey(e);externalCounts.testUp++;
    externalEvent('TEST RELEASE',externalLabel(sig));
    if(externalDown===sig){
      const held=Math.round(Math.max(0,externalEventTime(e)-externalPressedAt));
      if(externalMode==='hold'&&held<EXTERNAL_MIN_TEST_HOLD){
        externalDown=null;externalCandidate=null;
        externalMessage='Only a '+held+' ms tap reached Chrome. Try holding the physical button for one second. Instantaneous media actions cannot be safely bound.';
        externalEvent('TEST HOLD TOO SHORT',externalLabel(sig)+'; '+held+' ms');
        return;
      }
      externalCandidate=sig;
      finishExternalDetection('Verified '+externalLabel(sig)+(externalMode==='toggle'?': button pulse can control toggle mode.':': matching press AND release.')+' Tap Use detected button.');
      externalEvent('VERIFIED BUTTON',externalLabel(sig)+'; held '+held+' ms');
    }
    return;
  }
  if(sig&&sig===externalBinding&&externalEnabled){
    consumeHardwareKey(e);externalNeedsRelease=false;
    if(externalMode==='hold')stopExternalPTT('External button released.');
  }
}
function acceptExternalBinding(){
  if(externalLearning||!externalCandidate||selectedTx)return;
  externalBinding=externalCandidate;externalCandidate=null;externalEnabled=false;externalNeedsRelease=false;
  saveExternalPTT();externalMessage='Saved '+externalLabel(externalBinding)+'. Enable external PTT to use it.';
  externalEvent('BINDING SAVED',externalLabel(externalBinding));
}
function resetExternalBinding(){
  stopExternalPTT('External binding cleared.');finishExternalDetection('');
  externalBinding=null;externalCandidate=null;externalEnabled=false;externalNeedsRelease=false;
  saveExternalPTT();externalMessage='Binding cleared.';renderExternalPTT();
}
async function checkExternalAudio(){
  if(!navigator.mediaDevices?.enumerateDevices){
    externalDeviceSummary='enumerateDevices unavailable';
    if(ui.hardwareAudioStatus)ui.hardwareAudioStatus.textContent='This browser cannot list devices. Android selects the audio route.';
    return;
  }
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const inputs=devices.filter(d=>d.kind==='audioinput'),outputs=devices.filter(d=>d.kind==='audiooutput');
    externalDeviceSummary=inputs.length+' input(s), '+outputs.length+' output(s); labels exposed: '+devices.filter(d=>['audioinput','audiooutput'].includes(d.kind)&&d.label).length;
    const describe=(list,kind)=>list.length?list.map((d,i)=>kind+' '+(i+1)+': '+(String(d.label||'').slice(0,80)||'unlabeled')).join('; '):'No '+kind+' devices listed';
    if(ui.hardwareAudioStatus)ui.hardwareAudioStatus.textContent=describe(inputs,'Input')+'. '+describe(outputs,'Output')+'. Android/Chrome selects the active route; this list is not proof of routing.';
    externalEvent('AUDIO DEVICE CHECK',externalDeviceSummary);
  }catch(e){
    externalDeviceSummary='Audio device list failed: '+String(e?.name||'unknown').slice(0,50);
    if(ui.hardwareAudioStatus)ui.hardwareAudioStatus.textContent=externalDeviceSummary;
  }
}
function hardwareDiagnosticReport(){
  return ['Relay One V6.11 external PTT diagnostics',
    'Recorded: '+new Date().toISOString(),'Browser: '+(navigator.userAgent||'not exposed'),
    'Page visible: '+!document.hidden,'Detection active: '+externalLearning,
    'Verified candidate: '+externalLabel(externalCandidate),'Saved binding: '+externalLabel(externalBinding),
    'External button mode: '+externalMode,'External timeout: '+externalTimeout+' seconds',
    'External PTT enabled: '+externalEnabled,'External PTT held: '+Boolean(externalSession),
    'Test presses: '+externalCounts.testDown,'Test releases: '+externalCounts.testUp,
    'Unidentified events: '+externalCounts.unknown,
    'Live external presses: '+externalCounts.press,'Live external releases: '+externalCounts.release,
    'Safety timeouts: '+externalCounts.timeout,'Audio devices: '+externalDeviceSummary,
    'Microphone mode: '+(pttOnlyMicrophone?'PTT only':'always ready'),
    'Status: '+(externalMessage||'none'),'','Button events (no audio, transcript, PIN or device IDs):',...externalEvents].join('\n');
}
ui.hardwareMode?.addEventListener('change',()=>changeExternalMode(ui.hardwareMode.value));
ui.hardwareTimeout?.addEventListener('change',()=>{
  const value=Number(ui.hardwareTimeout.value);
  if(!externalSession&&[15,30,45].includes(value)){externalTimeout=value;saveExternalPTT();}
  renderExternalPTT();
});
ui.hardwareCue?.addEventListener('change',()=>{externalCue=Boolean(ui.hardwareCue.checked);saveExternalPTT();});
ui.hardwareStop?.addEventListener('click',()=>stopExternalPTT('Stopped from screen.'));
ui.hardwareLearn?.addEventListener('click',startExternalDetection);
ui.hardwareBind?.addEventListener('click',acceptExternalBinding);
ui.hardwareClear?.addEventListener('click',resetExternalBinding);
ui.hardwareEnabled?.addEventListener('change',()=>setExternalEnabled(ui.hardwareEnabled.checked));
ui.hardwareAudioCheck?.addEventListener('click',()=>{void checkExternalAudio();});
ui.hardwareCopy?.addEventListener('click',async()=>{
  const report=hardwareDiagnosticReport();
  try{await navigator.clipboard.writeText(report);externalMessage='Hardware diagnostics copied.';renderExternalPTT();}
  catch{window.prompt('Copy hardware diagnostics:',report);}
});
window.addEventListener('keydown',externalKeyDown,true);
window.addEventListener('keyup',externalKeyUp,true);
renderExternalPTT();

function bindHold(button,resolve){
  button.addEventListener('pointerdown',e=>{
    if(e.button!==0 && e.pointerType==='mouse')return;
    e.preventDefault();const s=resolve();
    if(externalSession&&externalMode==='toggle'){stopExternalPTT('Stopped with touchscreen Talk.');return;}
    if(!s || externalSession || selectedTx)return;
    try{button.setPointerCapture(e.pointerId);}catch{}
    startPTT(s);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])
    button.addEventListener(type,()=>{const s=selectedTx;if(s&&!externalSession)releaseTalk(s);});
  button.addEventListener('contextmenu',e=>e.preventDefault());
}
bindHold(ui.quick,()=>sessions.get(focusedId));
window.addEventListener('pointerup',()=>{if(selectedTx&&!externalSession)releaseTalk(selectedTx);});
window.addEventListener('blur',()=>{
  stopExternalPTT('Window lost focus; external Talk released.');
  if(selectedTx)releaseTalk(selectedTx);
  if(externalLearning)finishExternalDetection('Window lost focus; restart detection.');
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    stopExternalPTT('Page hidden; external Talk released.');
    if(selectedTx)releaseTalk(selectedTx);
    if(externalLearning)finishExternalDetection('Page hidden; restart detection.');
  }
  if(!document.hidden)for(const s of sessions.values())s.reconnectSignaling();
});
window.addEventListener('online',()=>{for(const s of sessions.values())s.reconnectSignaling();});
window.addEventListener('pagehide',()=>{
  stopExternalPTT('Page closed; external Talk released.');
  if(externalLearning)finishExternalDetection();
  endSpeechCapture();void sampleDataUsage();
  if(selectedTx)releaseTalk(selectedTx);
  for(const s of sessions.values())s.stop();
  sessions.clear();
  releaseMicrophoneIfUnused();
  closeStandbyAudioIfUnused();
});

class ChannelSession{
  constructor(publicRoom,effectiveId,track,stream,monitor){
    this.room=publicRoom;this.publicId=publicRoom.id;this.id=effectiveId;
    this.track=track;this.stream=stream;this.monitor=monitor;
    this.pttMode=false;this.pttContext=null;this.pttDestination=null;
    this.pttInputNode=null;this.pttInputStream=null;this.pttMicPending=null;
    this.pttMicSerial=0;this.pttSilence=null;this.pttZero=null;
    this.pttPressedAt=0;
    this.peer=null;this.myId=null;this.isHost=false;this.members=new Map;this.roster=new Set;
    this.floor=null;this.floorAt=0;this.wantTalk=false;this.transmitting=false;
    this.generation=0;this.stopped=false;this.status='Connecting';this.note='Connecting to signaling…';
    this.lastHost=0;this.heartbeat=null;this.retry=null;this.toneTimer=null;this.signalingRetry=null;
  }
  hostId(){return leaderId(this.id);}
  validMember(id){return validMemberId(this.id,id);}
  ready(){return this.isHost || Boolean(this.members.get(this.hostId())?.data?.open);}
  member(id){
    if(!this.members.has(id))this.members.set(id,{id,name:'Connecting…',color:PALETTE[0],data:null,call:null,stream:null,audio:null,lastSeen:0,pending:0,mediaPending:0,mediaTimer:null,mediaRetryAt:0,mediaFailures:0,lastIce:null});
    return this.members.get(id);
  }
  send(id,payload){
    const dc=this.members.get(id)?.data;
    if(!dc?.open)return false;
    try{dc.send(payload);return true;}catch{return false;}
  }
  broadcast(payload){for(const id of this.members.keys())this.send(id,payload);}
  info(id){
    if(id===this.myId)return{id,name:profile.name,color:profile.color};
    const m=this.members.get(id);return{id,name:m?.name||'Connecting…',color:cleanColor(m?.color)};
  }
  sendHello(){if(!this.peer || this.stopped)return;this.broadcast({type:'hello',name:profile.name,color:profile.color});if(this.isHost)this.broadcastRoster();updateRow(this.publicId);}
  broadcastRoster(){
    if(!this.isHost || !this.myId)return;
    const joined=[this.info(this.myId),...[...this.members.values()].filter(m=>m.data?.open).map(m=>this.info(m.id))].slice(0,MAX_PEOPLE);
    this.broadcast({type:'roster',people:joined,floor:this.floor});
    updateRow(this.publicId);
  }
  applyAudioOutput(){
    // Don't acoustically rebroadcast another monitored channel while transmitting.
    const audible=this.monitor && (!selectedTx || selectedTx===this);
    for(const m of this.members.values()){
      if(m.audio){
        m.audio.muted=!audible;
        if(audible)m.audio.play().catch(()=>{});
      }
    }
  }
  setMonitor(enabled){
    this.monitor=!!enabled;
    this.applyAudioOutput();
    updateRow(this.publicId);
  }
  disableTransmit(){
    if(this.toneTimer){clearTimeout(this.toneTimer);this.toneTimer=null;}
    if(this.pttMode && this.transmitting)endSpeechCapture(this);
    this.track.enabled=false;this.transmitting=false;
    if(this.pttMode)releasePTTMicrophone(this);
  }
  transmitIfAllowed(newFloor){
    if(!this.wantTalk || selectedTx!==this || this.floor!==this.myId)return;
    if(this.toneTimer)return;
    const open=()=>{
      this.toneTimer=null;
      if(this.wantTalk && selectedTx===this && this.floor===this.myId && !this.stopped){
        if(this.pttMode && !this.pttInputStream){
          this.note='Waiting for microphone to activate…';
          logRadio('PTT MIC WAIT',this.room.title,'Holding floor until input is ready');
          updateRow(this.publicId);updateQuick();return;
        }
        if(this.transmitting)return;
        this.track.enabled=true;this.transmitting=true;
        if(this.pttMode){
          const time=Math.max(0,Date.now()-this.pttPressedAt);
          pttTiming.lastReadyMs=time;pttTiming.readyCount++;
          speechEvent('PTT TRANSMIT READY','after '+time+' ms from press');
          renderMicMode();
          if(pttReadyCue && !(externalSession===this&&externalMode==='toggle'&&externalCue))playTone('ready');
        }
        if(externalSession===this&&externalMode==='toggle'&&externalCue)playTone('ready');
        speechDidTransmit(this);updateRow(this.publicId);updateQuick();
      }
    };
    if(newFloor && profile.txTone)this.toneTimer=setTimeout(open,290);
    else open();
  }
  setFloor(id,tone=false){
    const change=id!==this.floor;
    this.floor=id;this.floorAt=Date.now();
    if(id!==this.myId)this.disableTransmit();
    if(change && id && id!==this.myId && tone && this.monitor && profile.rxTone)playTone('squawk');
    if(id===this.myId){
      if(!this.wantTalk || selectedTx!==this){
        this.disableTransmit();
        if(!this.isHost)this.send(this.hostId(),{type:'release'});
      }else this.transmitIfAllowed(change);
    }
    if(this.isHost)this.broadcast({type:'floor',id,tone:!!tone});
    if(scanEnabled && id && id!==this.myId && this.monitor)scanTick();
    updateRow(this.publicId);updateQuick();
  }
  dropMedia(m){
    if(!m)return;
    if(m.mediaTimer){clearTimeout(m.mediaTimer);m.mediaTimer=null;}
    const call=m.call;m.call=null;m.stream=null;m.lastIce=null;
    if(call){
      m.mediaFailures=(m.mediaFailures||0)+1;
      // Prevent an endless call/close/retry loop from saturating a mobile device.
      m.mediaRetryAt=Date.now()+Math.min(15000,1800*2**Math.min(m.mediaFailures,3));
    }
    try{call?.close();}catch{}
    if(m.audio){try{m.audio.pause();m.audio.srcObject=null;m.audio.remove();}catch{}m.audio=null;}
  }
  dropMember(id,silent=false){
    const m=this.members.get(id);if(!m)return;
    this.members.delete(id);
    const dc=m.data;m.data=null;
    try{dc?.close();}catch{}
    this.dropMedia(m);
    if(this.floor===id && this.isHost)this.setFloor(null);
    if(this.isHost&&!silent)this.broadcastRoster();
    updateRow(this.publicId);
  }
  closePeer(){
    for(const id of [...this.members.keys()])this.dropMember(id,true);
    this.members.clear();this.roster.clear();
    const old=this.peer;this.peer=null;
    try{old?.destroy();}catch{}
    if(this.floor===this.myId)this.disableTransmit();
    this.floor=null;this.myId=null;this.isHost=false;
  }
  stop(){
    if(this.stopped)return;
    this.stopped=true;this.generation++;
    if(this.heartbeat)clearInterval(this.heartbeat);
    if(this.retry)clearTimeout(this.retry);
    if(this.toneTimer)clearTimeout(this.toneTimer);
    if(this.signalingRetry)clearTimeout(this.signalingRetry);
    this.disableTransmit();this.closePeer();
    try{this.track.stop();}catch{}
    if(this.pttMode){
      try{this.pttSilence?.stop();this.pttSilence?.disconnect();}catch{}
      try{this.pttZero?.disconnect();}catch{}
    }
  }
  start(){
    this.heartbeat=setInterval(()=>this.tick(),PING_EVERY);
    this.beginHost();
    updateRow(this.publicId);
  }
  beginHost(){
    if(this.stopped)return;
    this.generation++;this.closePeer();
    const generation=this.generation;
    const id=this.hostId();this.myId=id;this.isHost=false;
    const peer=new window.Peer(id,{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
    this.peer=peer;this.note='Checking channel membership…';logRadio('HOST ATTEMPT',this.room.title);
    peer.on('open',()=>{
      if(!this.current(peer,generation))return;
      this.isHost=true;this.roster=new Set([this.myId]);this.status='Online';logRadio('SIGNALING READY',this.room.title,'Coordinator');
      this.note='Channel ready. Waiting for people to join.';
      updateRow(this.publicId);updateQuick();
    });
    this.bindPeer(peer,generation,true);
  }
  beginGuest(){
    if(this.stopped)return;
    this.generation++;this.closePeer();
    const generation=this.generation;
    this.myId=guestId(this.id);this.isHost=false;
    const peer=new window.Peer(this.myId,{debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]}});
    this.peer=peer;this.note='Finding channel coordinator…';logRadio('GUEST CONNECT',this.room.title);
    peer.on('open',()=>{
      if(!this.current(peer,generation))return;
      this.status='Connecting';logRadio('SIGNALING READY',this.room.title,'Participant');this.tryHost();
    });
    this.bindPeer(peer,generation,false);
  }
  current(p,g){return !this.stopped && this.peer===p && this.generation===g;}
  bindPeer(p,g,asHost){
    p.on('connection',dc=>{
      if(!this.current(p,g)){dc.close();return;}
      if(this.isHost){
        if(!validGuestId(this.id,dc.peer)){dc.close();return;}
        const occupied=[...this.members.values()].filter(m=>m.data && (m.data.open || Date.now()-m.pending<PENDING_AFTER)).length;
        if(!this.members.has(dc.peer)&&occupied>=MAX_PEOPLE-1){
          dc.on('open',()=>{try{dc.send({type:'full'});}catch{}setTimeout(()=>dc.close(),300)});
          setTimeout(()=>{try{dc.close();}catch{}},5000);return;
        }
        this.attachData(dc,g);
      }else{
        if(!this.roster.has(dc.peer) || dc.peer===this.hostId()){dc.close();return;}
        this.attachData(dc,g);
      }
    });
    p.on('call',call=>{
      if(!this.current(p,g)){call.close();return;}
      if(!this.members.get(call.peer)?.data?.open){call.close();return;}
      if(this.attachMedia(call,g))try{call.answer(this.stream);}catch{call.close();}
    });
    p.on('disconnected',()=>{
      if(!this.current(p,g))return;
      this.note='Signaling interrupted; keeping active audio while reconnecting.';logRadio('SIGNALING DISCONNECTED',this.room.title,'Keeping established voice where possible');
      this.lastSignalReconnect=Date.now();
      try{p.reconnect();}catch{}
      if(this.signalingRetry)clearTimeout(this.signalingRetry);
      this.signalingRetry=setTimeout(()=>{
        if(this.current(p,g)&&p.disconnected&&!this.hasPeers())this.scheduleRetry(1800);
      },20000);
      updateRow(this.publicId);
    });
    p.on('error',err=>{
      if(!this.current(p,g))return;
      if(asHost && err?.type==='unavailable-id' && !this.isHost){this.beginGuest();return;}
      if(err?.type==='peer-unavailable'){if(!this.isHost && !this.members.get(this.hostId())?.data?.open)this.note='Waiting for coordinator…';return;}
      if(err?.type==='unavailable-id'){this.scheduleRetry(2600);return;}
      this.note='Network issue ('+(err?.type||'unknown')+'). Reconnecting if necessary.';logRadio('SIGNALING ERROR',this.room.title,err?.type||'unknown');
      if(!this.hasPeers())this.scheduleRetry(4000);
      updateRow(this.publicId);
    });
    p.on('close',()=>{if(this.current(p,g))this.scheduleRetry(2100);});
  }
  hasPeers(){return [...this.members.values()].some(m=>m.data?.open);}
  scheduleRetry(delay=2400){
    if(this.stopped||this.retry)return;
    this.retry=setTimeout(()=>{this.retry=null;if(!this.stopped)this.beginHost();},delay);
    this.note='Reconnecting…';logRadio('RECONNECT SCHEDULED',this.room.title);updateRow(this.publicId);
  }
  reconnectSignaling(){
    if(this.stopped)return;
    // Avoid reconnect storms during mobile LTE/Wi-Fi handoffs.
    if(this.peer?.disconnected && Date.now()-(this.lastSignalReconnect||0)>9000){
      this.lastSignalReconnect=Date.now();
      try{this.peer.reconnect();}catch{this.scheduleRetry();}
    }
    if(!this.peer || this.peer.destroyed)this.scheduleRetry(500);
  }
  tryHost(){
    if(this.stopped || this.isHost || !this.peer?.open)return;
    const id=this.hostId(),m=this.members.get(id);
    if(m?.data?.open)return;
    if(m?.data && Date.now()-m.pending<PENDING_AFTER)return;
    if(m)this.dropMember(id,true);
    try{this.attachData(this.peer.connect(id,{reliable:true,serialization:'json'}),this.generation);}
    catch{this.note='Waiting for coordinator.';}
  }
  attachData(dc,g){
    if(this.stopped || g!==this.generation || !this.validMember(dc.peer) || dc.peer===this.myId){try{dc.close()}catch{}return;}
    const m=this.member(dc.peer);
    if(m.data && m.data!==dc){
      if(m.data.open || Date.now()-m.pending<PENDING_AFTER){try{dc.close()}catch{}return;}
      try{m.data.close()}catch{}
    }
    m.data=dc;m.pending=Date.now();logRadio('PEER DATA CONNECTING',this.room.title);
    dc.on('open',()=>{
      if(g!==this.generation||m.data!==dc)return;
      m.lastSeen=Date.now();logRadio('PEER DATA OPEN',this.room.title);
      this.send(dc.peer,{type:'hello',name:profile.name,color:profile.color});
      if(this.isHost)this.broadcastRoster();
      if(dc.peer===this.hostId())this.lastHost=Date.now();
      if(this.myId<dc.peer)this.startMedia(dc.peer,g);
      if(!this.isHost)this.ensureMesh();
      updateRow(this.publicId);updateQuick();
    });
    dc.on('data',msg=>{
      if(g!==this.generation || m.data!==dc || !msg || typeof msg!=='object')return;
      m.lastSeen=Date.now();
      if(dc.peer===this.hostId())this.lastHost=Date.now();
      this.onData(dc.peer,msg);
    });
    const closed=()=>{
      if(g!==this.generation || m.data!==dc)return;
      const hostWasLost=!this.isHost && dc.peer===this.hostId();
      logRadio('PEER DATA CLOSED',this.room.title);
      this.dropMember(dc.peer);
      if(hostWasLost)this.scheduleRetry(1400);
    };
    dc.on('close',closed);dc.on('error',closed);
  }
  onData(id,msg){
    const m=this.members.get(id);if(!m)return;
    switch(msg.type){
      case 'hello':
        m.name=cleanName(msg.name);m.color=cleanColor(msg.color);
        if(this.isHost)this.broadcastRoster();
        break;
      case 'ping':this.send(id,{type:'pong'});break;
      case 'pong':break;
      case 'roster':
        if(!this.isHost && id===this.hostId())this.applyRoster(msg);
        break;
      case 'floor':
        if(!this.isHost && id===this.hostId() && (msg.id===null || msg.id===this.myId || this.roster.has(msg.id)))
          this.setFloor(msg.id,msg.tone===true);
        break;
      case 'request':
        if(this.isHost && !this.floor)this.setFloor(id,msg.tone===true);
        break;
      case 'release':
        if(this.isHost && this.floor===id)this.setFloor(null);
        break;
      case 'floor-live':
        if(this.isHost && this.floor===id)this.floorAt=Date.now();
        break;
      case 'caption':
        // Captions are sent directly by a room member through an existing data link.
        // Never display text from unjoined rooms or from muted channels.
        if(this.monitor && typeof msg.text==='string' && msg.text.length<=TRANSCRIPT_TEXT_MAX)
          appendTranscript('rx',this,m.name,msg.text);
        break;
      case 'call':
        if(this.monitor){
          if(profile.alertTone)playTone('call');
          this.note='Call alert from '+m.name;
        }
        break;
      case 'full':
        if(!this.isHost && id===this.hostId())this.note='Channel full: '+MAX_PEOPLE+' people maximum.';
        break;
    }
    updateRow(this.publicId);updateQuick();
  }
  applyRoster(msg){
    if(!Array.isArray(msg.people))return;
    const people=msg.people.filter(p=>p && this.validMember(p.id)).slice(0,MAX_PEOPLE);
    const ids=new Set(people.map(p=>p.id));ids.add(this.myId);
    if(!ids.has(this.hostId()))return;
    this.roster=ids;
    for(const person of people){
      if(person.id===this.myId)continue;
      const m=this.member(person.id);m.name=cleanName(person.name);m.color=cleanColor(person.color);
    }
    for(const id of [...this.members.keys()])
      if(!ids.has(id)&&id!==this.hostId())this.dropMember(id,true);
    if(msg.floor===null || typeof msg.floor==='string'&&ids.has(msg.floor))
      this.setFloor(msg.floor);
    this.ensureMesh();
  }
  ensureMesh(){
    if(this.stopped || this.isHost || !this.peer?.open)return;
    for(const id of this.roster){
      if(id===this.myId || id===this.hostId() || !validGuestId(this.id,id))continue;
      const m=this.member(id);
      if(this.myId<id && !m.data)
        try{this.attachData(this.peer.connect(id,{reliable:true,serialization:'json'}),this.generation);}catch{}
      if(this.myId<id && m.data?.open && !m.call)this.startMedia(id,this.generation);
    }
  }
  attachMedia(call,g){
    if(this.stopped||g!==this.generation || !this.members.has(call.peer)){try{call.close()}catch{}return false;}
    const m=this.member(call.peer);
    if(m.call && m.call!==call){try{call.close()}catch{}return false;}
    m.call=call;m.mediaPending=Date.now();
    logRadio('VOICE CALL OPENING',this.room.title);
    const pc=call.peerConnection;
    if(pc?.addEventListener)pc.addEventListener('iceconnectionstatechange',()=>{
      if(g!==this.generation || m.call!==call)return;
      const ice=pc.iceConnectionState;
      if(ice!==m.lastIce){m.lastIce=ice;logRadio('ICE STATE',this.room.title,ice);}
    });
    call.on('stream',stream=>{
      if(g!==this.generation || m.call!==call)return;
      m.stream=stream;m.mediaFailures=0;logRadio('VOICE STREAM READY',this.room.title);
      if(!m.audio){
        const a=document.createElement('audio');a.autoplay=true;a.playsInline=true;a.setAttribute('playsinline','');
        a.muted=!(this.monitor && (!selectedTx || selectedTx===this));a.dataset.channel=this.publicId;a.dataset.peer=call.peer;
        ui.audio.appendChild(a);m.audio=a;
      }
      m.audio.muted=!(this.monitor && (!selectedTx || selectedTx===this));m.audio.srcObject=stream;
      m.audio.play().catch(()=>{this.note='Tap Enable speaker in your browser if audio is blocked.';});
      updateRow(this.publicId);
    });
    const closed=()=>{
      if(g!==this.generation||m.call!==call)return;
      logRadio('VOICE CALL CLOSED',this.room.title);
      this.dropMedia(m);
      if(this.myId<call.peer && m.data?.open)
        setTimeout(()=>{if(g===this.generation && !this.stopped)this.startMedia(call.peer,g);},2600);
      updateRow(this.publicId);
    };
    call.on('close',closed);call.on('error',closed);
    return true;
  }
  startMedia(id,g){
    const m=this.members.get(id);
    if(this.stopped||g!==this.generation || !m?.data?.open || m.call || m.mediaTimer ||
      this.myId>=id || !this.peer?.open || Date.now()<(m.mediaRetryAt||0))return;
    // Schedule one media negotiation at a time across ALL channels on this phone.
    // Data channels must settle before accepting a WebRTC media call.
    const now=Date.now(),scheduled=Math.max(now+MEDIA_SETTLE_MS,nextMediaNegotiation);
    nextMediaNegotiation=scheduled+MEDIA_NEGOTIATION_GAP;
    m.mediaTimer=setTimeout(()=>{
      m.mediaTimer=null;
      if(this.stopped||g!==this.generation || this.members.get(id)!==m ||
        !m.data?.open || m.call || this.myId>=id || !this.peer?.open)return;
      try{
        const call=this.peer.call(id,this.stream);
        if(!call)throw Error('PeerJS did not create a media call');
        this.attachMedia(call,g);
        logRadio('VOICE NEGOTIATION',this.room.title,'Starting one connection after channel staggering');
      }catch(err){
        m.mediaRetryAt=Date.now()+6000;
        logRadio('VOICE START ERROR',this.room.title,err?.name||'peer call failed');
      }
    },Math.max(0,scheduled-now));
  }
  tick(){
    if(this.stopped)return;
    const now=Date.now();
    for(const [id,m] of [...this.members]){
      if(m.data?.open){
        if(now-m.lastSeen>STALE_AFTER){this.dropMember(id);continue;}
        this.send(id,{type:'ping'});
      }else if(m.data && now-m.pending>PENDING_AFTER)this.dropMember(id,true);
      const ice=m.call?.peerConnection?.iceConnectionState;
      if(ice && ice!==m.lastIce){m.lastIce=ice;logRadio('ICE STATE',this.room.title,ice);}
      if(ice==='failed' || m.call && !m.stream && now-m.mediaPending>17000){
        logRadio('VOICE LINK FAILED',this.room.title,ice||'stream timeout');
        this.dropMedia(m);
      }
      if(m.data?.open && this.myId<id && !m.call)this.startMedia(id,this.generation);
    }
    if(this.isHost){
      if(this.floor===this.myId && this.wantTalk)this.floorAt=now;
      if(this.floor && now-this.floorAt>24000)this.setFloor(null);
    }else{
      if(this.floor===this.myId && this.wantTalk)this.send(this.hostId(),{type:'floor-live'});
      const coordinator=this.members.get(this.hostId());
      if(!coordinator?.data?.open){
        this.tryHost();
        if(now-(this.lastHost||0)>30000)this.scheduleRetry(1600);
      }else this.ensureMesh();
    }
    this.reconnectSignaling();
    updateRow(this.publicId);
  }
}
function stableText(parent,tag,text,klass){
  const el=document.createElement(tag);if(klass)el.className=klass;el.textContent=text;parent.appendChild(el);return el;
}
function drawRows(){
  ui.list.replaceChildren();rows.clear();
  for(const c of channels){
    const box=document.createElement('article');box.className='multi-channel';box.dataset.id=c.id;
    const head=stableText(box,'div','','group-head');
    const titleBlock=stableText(head,'div','','group-name-block');
    const checkLabel=stableText(titleBlock,'label','','channel-select-label');
    const select=document.createElement('input');select.type='checkbox';
    select.setAttribute('aria-label','Join '+c.title);
    checkLabel.appendChild(select);
    stableText(checkLabel,'strong',c.title,'group-title');
    stableText(titleBlock,'div',c.secure?'PIN required • private channel':'Open radio channel','group-subtitle');
    const status=stableText(head,'span','Not joined','group-status');
    const signal=stableText(box,'div','','group-signal');
    const speaker=stableText(signal,'div','Join to see channel activity','on-air');
    const count=stableText(signal,'span','—','group-count');
    const actions=stableText(box,'div','','group-action-row');
    const focus=stableText(actions,'button','Focus','secondary');focus.type='button';
    const ptt=stableText(actions,'button','Hold Talk','small-ptt');ptt.type='button';ptt.disabled=true;
    const call=stableText(actions,'button','Call','secondary');call.type='button';call.disabled=true;
    const extra=stableText(box,'div','','group-extra');
    const monitorLabel=stableText(extra,'label','','monitor-label');
    const monitor=document.createElement('input');monitor.type='checkbox';monitor.checked=monitorValue(c.id);
    monitor.setAttribute('aria-label','Monitor '+c.title);
    monitorLabel.appendChild(monitor);stableText(monitorLabel,'span','Monitor sound','');
    const people=stableText(box,'div','','group-people');
    const msg=stableText(box,'p','','group-msg');
    rows.set(c.id,{box,status,speaker,count,select,focus,ptt,call,monitor,people,msg});
    select.addEventListener('change',async()=>{
      if(select.checked){
        await joinChannel(c);
      }else{
        if(sessions.has(c.id))leaveChannel(c.id);
        else{desiredJoined.delete(c.id);persistDesired();}
      }
      updateRow(c.id);updateQuick();
    });
    focus.addEventListener('click',()=>{if(sessions.has(c.id)){viewId=c.id;focusedId=c.id;scanPreviewId=null;scanActivityId=null;updateAll();}});
    bindHold(ptt,()=>sessions.get(c.id));
    monitor.addEventListener('change',()=>{
      if(!sessions.has(c.id)){monitor.checked=false;return;}
      setMonitor(c.id,monitor.checked);
    });
    call.addEventListener('click',()=>{
      const s=sessions.get(c.id);if(!s?.ready())return;
      s.broadcast({type:'call'});
      s.note='Call alert sent on '+c.title;
      setMessage('Call sent to members of '+c.title+' only.');
      updateRow(c.id);
    });
    ui.list.appendChild(box);
  }
  updateAll();
}
function updateRow(id){
  const r=rows.get(id),s=sessions.get(id);
  if(!r)return;
  const visible=modeAllows(storedRoom(id));
  r.box.classList.toggle('hidden',!visible);
  const isActive=!!s,focus=focusedId===id;
  r.box.classList.toggle('active',isActive);
  r.box.classList.toggle('focused',focus);
  r.box.classList.toggle('group-muted',isActive&&!s.monitor);
  r.monitor.checked=isActive && monitorValue(id);
  r.monitor.disabled=!isActive;
  r.select.checked=isActive || desiredJoined.has(id);
  r.select.disabled=!visible;
  r.focus.disabled=!isActive;r.focus.textContent=focus?'Selected':'Focus';
  const connectedPeers=isActive?[...s.members.values()].filter(m=>m.data?.open):[];
  const mediaReady=connectedPeers.filter(m=>m.stream &&
    !['failed','disconnected','closed'].includes(m.call?.peerConnection?.iceConnectionState)).length;
  const fullAudio=isActive && s.ready() && (connectedPeers.length===0 || mediaReady===connectedPeers.length);
  r.status.textContent=!isActive?(desiredJoined.has(id)?'Selected • restore':'Not joined'):
    !s.ready()?'Connecting':!fullAudio?'Linking audio':'Connected';
  r.status.className='group-status'+(fullAudio?' online':isActive?' warning':'');
  const canSpeak=isActive&&s.ready()&&(!selectedTx||selectedTx===s)&&(!s.floor||s.floor===s.myId);
  r.ptt.disabled=!canSpeak;
  r.ptt.classList.toggle('sending',Boolean(s?.transmitting));
  r.ptt.textContent=s?.transmitting?'TRANSMITTING':
      s?.wantTalk&&s.pttMode&&!s.pttInputStream?'MIC STARTING…':
      s?.wantTalk?'REQUESTING…':'Hold Talk';
  r.call.disabled=!isActive||!s.ready();
  const person=isActive && s.floor ? s.info(s.floor):null;
  r.speaker.textContent=!isActive?'Join to see this channel':person?'ON AIR: '+person.name:(s.monitor?'Channel idle':'Monitoring off');
  r.count.textContent=isActive?(1+[...s.members.values()].filter(m=>m.data?.open).length)+' / '+MAX_PEOPLE:'—';
  r.people.replaceChildren();
  if(isActive){
    for(const m of [s.info(s.myId),...[...s.members.values()].filter(m=>m.data?.open).map(m=>s.info(m.id))]){
      const tag=stableText(r.people,'span',m.name+(m.id===s.myId?' (you)':''),'group-person'+(s.floor===m.id?' on-air-person':''));
      tag.style.borderLeft='3px solid '+m.color;
    }
  }
  r.msg.textContent=isActive?(connectedPeers.length?
    'Voice links '+mediaReady+'/'+connectedPeers.length+' ready · '+s.note:s.note):(desiredJoined.has(id)?'Selected from last session. Tap Restore selected to reconnect.':storedRoom(id)?.secure?'Enter PIN when joining. Only joined members see this channel.':'Select to join. Only joined members see activity.');
  if(focus)updateQuick();
  ui.count.textContent=sessions.size+' / '+maxActiveChannels()+' joined';
}
// Handheld radio UI: the scanner animates the LCD only. It never reconnects,
// renegotiates audio, changes monitor preferences or changes existing voice streams.
const availableChannels=()=>channels.filter(modeAllows);
const joinedMonitored=()=>[...sessions.values()].filter(v=>modeAllows(v.room)&&v.monitor);
const scanDisplayId=()=>{
  if(selectedTx)return selectedTx.publicId;
  if(scanEnabled && scanActivityId && Date.now()-scanLastOnAirAt<SCAN_HOLD_MS && sessions.has(scanActivityId))return scanActivityId;
  if(scanEnabled && scanPreviewId && sessions.has(scanPreviewId) && sessions.get(scanPreviewId)?.monitor)return scanPreviewId;
  return viewId;
};
function scanTick(now=Date.now()){
  if(!scanEnabled){
    scanActivityId=null;scanPreviewId=null;
    renderRadioDisplay();return;
  }
  if(selectedTx){renderRadioDisplay();return;}
  const connected=joinedMonitored();
  const live=connected.filter(v=>v.floor && v.floor!==v.myId)
    .sort((a,b)=>b.floorAt-a.floorAt)[0];
  if(live){
    if(scanActivityId!==live.publicId){
      scanActivityId=live.publicId;viewId=live.publicId;focusedId=live.publicId;
      scanPreviewId=live.publicId;
      logRadio('SCAN ACTIVE',live.room.title,'Incoming monitored transmission displayed');
    }
    scanLastOnAirAt=now;
    renderRadioDisplay();return;
  }
  if(scanActivityId && now-scanLastOnAirAt<SCAN_HOLD_MS){
    renderRadioDisplay();return;
  }
  scanActivityId=null;
  if(!connected.length){scanPreviewId=null;renderRadioDisplay();return;}
  if(!connected.some(v=>v.publicId===scanPreviewId)){
    scanPreviewId=connected[0].publicId;scanStepAt=now;
  }else if(connected.length>1 && now-scanStepAt>=SCAN_STEP_MS){
    const index=connected.findIndex(v=>v.publicId===scanPreviewId);
    scanPreviewId=connected[(index+1)%connected.length].publicId;scanStepAt=now;
  }
  renderRadioDisplay();
}
function setScan(enabled){
  scanEnabled=Boolean(enabled);storeSet(RADIO_SCAN_KEY,scanEnabled);
  scanPreviewId=null;scanActivityId=null;scanLastOnAirAt=0;scanStepAt=0;
  scanTick();
  setMessage(scanEnabled
    ?'Scan on: continuously listening to all joined, monitored channels; the display previews them and highlights incoming transmissions.'
    :'Scan off: showing your manually selected channel.');
  logRadio('SCAN MODE','',scanEnabled?'on':'off');
}
function setPttSide(side){
  if(side!=='left'&&side!=='right')return;
  pttSide=side;storeSet(RADIO_HAND_KEY,side);
  ui.radioHousing?.classList.toggle('left-handed',side==='left');
  ui.leftHanded?.setAttribute('aria-pressed',String(side==='left'));
  ui.rightHanded?.setAttribute('aria-pressed',String(side==='right'));
}
function browseChannel(direction){
  if(selectedTx)return; // Cannot retarget the radio while PTT is held.
  if(scanEnabled)setScan(false); // Physical channel selector overrides scan preview.
  const options=availableChannels();
  const current=options.findIndex(c=>c.id===viewId);
  viewId=options[(current<0?0:current+direction+options.length)%options.length].id;
  focusedId=viewId;scanActivityId=null;scanPreviewId=null;scanStepAt=Date.now();
  updateAll();
}
function displayChannelId(){return scanDisplayId();}
function renderRadioDisplay(){
  const id=scanDisplayId();
  const c=storedRoom(id)||availableChannels()[0];
  const s=c?sessions.get(c.id):null;
  const target=sessions.get(focusedId);
  const isActive=s && s.floor && s.floor!==s.myId;
  const sweeping=scanEnabled && !selectedTx && !isActive && !(scanActivityId && Date.now()-scanLastOnAirAt<SCAN_HOLD_MS);
  const preview=scanEnabled && sweeping && id!==viewId;
  const n=c?String(c.number).padStart(2,'0'):'--';
  if(ui.screenChannelNumber)ui.screenChannelNumber.textContent='CH '+n;
  if(ui.screenChannelTitle)ui.screenChannelTitle.textContent=c?.title||'Select channel';
  if(ui.screenMode)ui.screenMode.textContent=radioMode.toUpperCase();
  if(ui.screenLock)ui.screenLock.textContent=c?.secure?'LOCK':'OPEN';
  if(ui.screenSignal)ui.screenSignal.textContent=!s?'NOT JOINED':s.ready()?'CONNECTED':'CONNECTING';
  if(ui.screenScan)ui.screenScan.textContent=selectedTx?'TRANSMIT':isActive?'RECEIVING':scanEnabled?preview?'SCAN PREVIEW':'SCANNING':'MANUAL';
  if(ui.scanIndicator)ui.scanIndicator.textContent=scanEnabled?'SCAN ON':'SCAN OFF';
  if(ui.radioScan){
    ui.radioScan.textContent=scanEnabled?'Scan on':'Scan off';
    ui.radioScan.setAttribute('aria-pressed',String(scanEnabled));
  }
  if(ui.screenPeople)ui.screenPeople.textContent=s
    ?(1+[...s.members.values()].filter(m=>m.data?.open).length)+' listening':'—';
  if(ui.focusTitle)ui.focusTitle.textContent=c?.title||'No channel selected';
  if(ui.focusStatus){
    ui.focusStatus.textContent=!s?'Not joined':s.ready()?'Connected':'Connecting';
    ui.focusStatus.className='status-badge'+(s?.ready()?' connected':'');
  }
  if(ui.focusSpeaker)ui.focusSpeaker.textContent=!s?'Join to listen':s.floor
    ?s.info(s.floor).name:(s.monitor?'Channel idle':'Monitoring off');
  if(ui.radioScreen){
    ui.radioScreen.classList.toggle('receiving',Boolean(isActive));
    ui.radioScreen.classList.toggle('scanning',Boolean(scanEnabled && !isActive));
    ui.radioScreen.classList.toggle('transmitting',Boolean(selectedTx?.transmitting));
  }
  const targetChannel=storedRoom(focusedId);
  const targetNumber=targetChannel?String(targetChannel.number).padStart(2,'0'):'--';
  if(ui.radioPttTarget)ui.radioPttTarget.textContent='PTT TARGET: CH '+targetNumber;
  if(ui.quick){
    ui.quick.disabled=!target?.ready()||Boolean(selectedTx && selectedTx!==target)||
      Boolean(target.floor && target.floor!==target.myId);
    ui.quickText.textContent=target?.transmitting?'TRANSMITTING':
      target?.wantTalk&&target.pttMode&&!target.pttInputStream?'MIC STARTING…':
      target?.wantTalk?'REQUESTING…':'HOLD TO TALK';
  }
  if(ui.radioJoin){
    ui.radioJoin.textContent=scanEnabled?'SCAN ACTIVE':s?'LEAVE':'JOIN';
    // Never let a changing scan preview act as an accidental Leave/Join target.
    ui.radioJoin.disabled=!c || Boolean(selectedTx) || scanEnabled;
    ui.radioJoin.setAttribute('aria-label',(s?'Leave ':'Join ')+(c?.title||'channel'));
  }
  if(ui.radioMonitor){
    ui.radioMonitor.disabled=!s || scanEnabled;
    ui.radioMonitor.textContent=s?.monitor?'Monitor on':'Monitor off';
    ui.radioMonitor.setAttribute('aria-pressed',String(Boolean(s?.monitor)));
  }
  if(ui.radioCall)ui.radioCall.disabled=!s?.ready() || scanEnabled;
  if(ui.focusHint)ui.focusHint.textContent=scanEnabled
    ?'Scan is a visual sweep; all joined monitored channels stay connected. PTT stays on CH '+targetNumber+'. Incoming activity switches to that channel for a reply.'
    :'Use CH − / CH + to select a channel, Join to connect and Hold Talk to transmit.';
}
function updateQuick(){renderRadioDisplay();}
ui.prevChannel?.addEventListener('click',()=>browseChannel(-1));
ui.nextChannel?.addEventListener('click',()=>browseChannel(1));
ui.radioJoin?.addEventListener('click',async()=>{
  const c=storedRoom(scanDisplayId());
  if(!c || !modeAllows(c) || selectedTx || scanEnabled)return;
  if(sessions.has(c.id)){leaveChannel(c.id);return;}
  viewId=c.id;focusedId=c.id;
  await joinChannel(c);
  updateAll();
});
ui.radioMonitor?.addEventListener('click',()=>{
  const c=storedRoom(scanDisplayId()),s=c&&sessions.get(c.id);
  if(s && !scanEnabled)setMonitor(c.id,!s.monitor);
});
ui.radioCall?.addEventListener('click',()=>{
  const c=storedRoom(scanDisplayId()),s=c&&sessions.get(c.id);
  if(!s?.ready() || scanEnabled)return;
  s.broadcast({type:'call'});
  s.note='Call alert sent on '+c.title;
  setMessage('Call sent to members of '+c.title+' only.');
  updateRow(c.id);
});
ui.radioScan?.addEventListener('click',()=>setScan(!scanEnabled));
ui.leftHanded?.addEventListener('click',()=>setPttSide('left'));
ui.rightHanded?.addEventListener('click',()=>setPttSide('right'));
let swipeStartX=null;
ui.radioScreen?.addEventListener('touchstart',event=>{
  swipeStartX=event.touches?.[0]?.clientX??null;
},{passive:true});
ui.radioScreen?.addEventListener('touchend',event=>{
  const endX=event.changedTouches?.[0]?.clientX;
  if(swipeStartX!==null && Number.isFinite(endX) && Math.abs(endX-swipeStartX)>55)
    browseChannel(endX<swipeStartX?1:-1);
  swipeStartX=null;
},{passive:true});
ui.radioScreen?.addEventListener('keydown',event=>{
  if(event.key==='ArrowRight'||event.key==='ArrowDown'){event.preventDefault();browseChannel(1);}
  if(event.key==='ArrowLeft'||event.key==='ArrowUp'){event.preventDefault();browseChannel(-1);}
});
setPttSide(pttSide);
setInterval(()=>{if(scanEnabled)scanTick();},350);
function updateAll(){for(const c of channels)updateRow(c.id);updateQuick();}
drawColors();drawRows();
