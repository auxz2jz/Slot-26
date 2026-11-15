/* Relay One V6.7: optional on-device Whisper via Transformers.js.
 * This module worker is lazy-loaded only after the operator chooses Download model.
 * No microphone permissions, audio uploads, recording storage, or radio signaling.
 */
const MODEL='onnx-community/whisper-tiny.en';
const IMPORT_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6';
const MAX_PENDING=4, MAX_SECONDS=25, SAMPLE_RATE=16000;
let loading=null, recognizer=null, draining=false;
const queue=[];
const send=(type,extra={})=>self.postMessage({type,...extra});
const errorText=err=>String(err?.message||err||'unknown error').slice(0,220);

async function ensureModel(){
  if(recognizer)return recognizer;
  if(loading)return loading;
  loading=(async()=>{
    send('engine-state',{state:'loading',message:'Importing Whisper runtime…'});
    const {pipeline,env}=await import(IMPORT_URL);
    env.allowRemoteModels=true;
    env.useBrowserCache=true;
    send('engine-state',{state:'loading',message:'Downloading the small English speech model…'});
    let prev=-1;
    recognizer=await pipeline('automatic-speech-recognition',MODEL,{
      device:'wasm',dtype:'q8',
      progress_callback:info=>{
        if(info.status==='progress'){
          const value=Math.round(info.progress||0);
          if(value>=prev+10){prev=value;send('engine-progress',{percent:value,file:info.file||''});}
        }
      }
    });
    send('engine-state',{state:'ready',message:'On-device Whisper is ready'});
    return recognizer;
  })().catch(err=>{
    loading=null;recognizer=null;
    send('engine-state',{state:'error',message:errorText(err)});
    throw err;
  });
  return loading;
}
async function drain(){
  if(draining)return;
  draining=true;
  try{
    let pipe;
    try{pipe=await ensureModel();}
    catch{return;}
    while(queue.length){
      const job=queue.shift();
      try{
        const pcm=new Float32Array(job.audio);
        if(pcm.length<Math.floor(SAMPLE_RATE*.35))throw new Error('Audio too short to recognize');
        if(pcm.length>MAX_SECONDS*SAMPLE_RATE)throw new Error('Audio chunk exceeded 25 seconds');
        send('job-state',{id:job.id,state:'processing'});
        const out=await pipe(pcm,{
          return_timestamps:false,
          max_new_tokens:96
        });
        send('job-result',{id:job.id,text:String(out?.text||'').trim().slice(0,400)});
      }catch(err){
        send('job-error',{id:job.id,error:errorText(err)});
      }
    }
  }finally{
    draining=false;
  }
}
self.addEventListener('message',evt=>{
  const p=evt.data||{};
  if(p.type==='load'){
    void ensureModel().catch(()=>{});
  }else if(p.type==='transcribe'){
    if(!Number.isSafeInteger(p.id)||!(p.audio instanceof ArrayBuffer))return;
    if(queue.length>=MAX_PENDING){
      send('job-error',{id:p.id,error:'Transcription queue full; text skipped to protect live radio'});
      return;
    }
    queue.push({id:p.id,audio:p.audio});
    send('job-state',{id:p.id,state:'queued'});
    void drain();
  }
});
