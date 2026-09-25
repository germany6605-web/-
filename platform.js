/* Адаптер платформ: ВКонтакте (VK Bridge) и Одноклассники (OK FAPI).
   Платформа определяется по параметрам запуска в адресе страницы.
   Без платформы игра работает локально: прогресс хранится в localStorage,
   реклама и покупки не имитируются. */
(function(){'use strict';
const BASE_KEY='orebound-save-v1';
const CLOUD_INTERVAL=30000;
const OK_SDK_URL='https://api.ok.ru/js/fapi5.js';
function deadline(promise,ms=8000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));}
function loadScript(src){return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);});}
function validSave(value){return value&&(value.version===1||value.version===2)?value:null;}
function detectPlatform(){
 const q=new URLSearchParams(location.search),forced=q.get('platform');
 if(forced==='vk'||forced==='ok')return forced;
 if(q.has('vk_app_id')||q.has('vk_user_id'))return 'vk';
 if(q.has('api_server')&&q.has('apiconnection'))return 'ok';
 return null;
}

/* ВКонтакте: https://dev.vk.com/bridge/getting-started */
class VkBackend{
 constructor(){this.name='vk';this.query=new URLSearchParams(location.search);this.chunkSize=1500;}
 get bridge(){return window.vkBridge;}
 async init(platform){
  if(!this.bridge)throw new Error('vk-bridge missing');
  this.bridge.subscribe(event=>{const type=event?.detail?.type;if(type==='VKWebAppViewHide')platform.onPause('sdk');else if(type==='VKWebAppViewRestore')platform.onResume('sdk');});
  await this.bridge.send('VKWebAppInit');
 }
 userId(){return this.query.get('vk_user_id')||'';}
 language(){const lang=this.query.get('vk_language');return !lang||/^(ru|uk|be|kk)/i.test(lang)?'ru':'en';}
 async get(keys){const result=await this.bridge.send('VKWebAppStorageGet',{keys});const out={};for(const entry of result?.keys||[])out[entry.key]=entry.value;return out;}
 async set(key,value){await this.bridge.send('VKWebAppStorageSet',{key,value});}
 async rewarded(){
  const check=await deadline(this.bridge.send('VKWebAppCheckNativeAds',{ad_format:'reward'}),10000).catch(()=>null);
  if(!check?.result)return false;
  const shown=await this.bridge.send('VKWebAppShowNativeAds',{ad_format:'reward'}).catch(()=>null);
  return !!shown?.result;
 }
 // Покупка подтверждается сервером (server/vk-payments.js); сюда приходит уже оплаченный заказ.
 async buy(item){
  const result=await this.bridge.send('VKWebAppShowOrderBox',{type:'item',item:item.id});
  if(result?.status==='success'||result?.success===true)return 'vk:'+(result.order_id||item.id+':'+Date.now());
  throw new Error('order '+(result?.status||'failed'));
 }
 showBoard(score){return this.bridge.send('VKWebAppShowLeaderBoardBox',{user_result:Math.max(0,Math.floor(score))});}
 invite(){return this.bridge.send('VKWebAppShowInviteBox');}
}

/* Одноклассники: https://apiok.ru/dev/sdk/js/ */
class OkBackend{
 constructor(){this.name='ok';this.chunkSize=1000;this.params={};this.waiting=new Map();}
 async init(){
  if(!window.FAPI)await loadScript(OK_SDK_URL);
  const FAPI=window.FAPI;this.params=FAPI.Util.getRequestParameters();
  // OK сообщает о результатах окон (оплата, реклама, приглашения) через глобальный API_callback.
  const previous=window.API_callback;
  window.API_callback=(method,result,data)=>{const handler=this.waiting.get(method);if(handler){this.waiting.delete(method);handler({result,data});}if(typeof previous==='function')try{previous(method,result,data);}catch(_){}};
  await new Promise((resolve,reject)=>FAPI.init(this.params.api_server,this.params.apiconnection,resolve,reject));
 }
 userId(){return this.params.logged_user_id||'';}
 language(){const lang=this.params.lang||this.params.locale||'ru';return /^en/i.test(lang)?'en':'ru';}
 ui(method,run){return new Promise(resolve=>{this.waiting.get(method)?.({result:'error',data:'replaced'});this.waiting.set(method,resolve);try{run();}catch(error){this.waiting.delete(method);resolve({result:'error',data:String(error)});}});}
 api(params){return new Promise((resolve,reject)=>window.FAPI.Client.call(params,(status,data,error)=>status==='ok'?resolve(data):reject(error||new Error(String(status)))));}
 async get(keys){const data=await this.api({method:'storage.get',keys:keys.join(',')});const map=data&&typeof data==='object'?(data.data&&typeof data.data==='object'?data.data:data):{};const out={};for(const key of keys)if(typeof map[key]==='string')out[key]=map[key];return out;}
 async set(key,value){await this.api({method:'storage.set',key,value});}
 async rewarded(){
  const loaded=await deadline(this.ui('loadAd',()=>window.FAPI.UI.loadAd()),15000).catch(()=>null);
  if(loaded?.result!=='ok')return false;
  const shown=await this.ui('showLoadedAd',()=>window.FAPI.UI.showLoadedAd());
  return shown.result==='ok';
 }
 // Покупка подтверждается сервером (server/ok-payments.js) через callbacks.payment.
 async buy(item){
  const {result,data}=await this.ui('showPayment',()=>window.FAPI.UI.showPayment(item.title,item.title,item.id,item.ok,null,null,'ok','true'));
  if(result!=='ok')throw new Error('payment '+result);
  let id='';try{const parsed=typeof data==='string'?JSON.parse(data):data;id=parsed?.transaction_id||parsed?.transactionId||'';}catch(_){}
  return 'ok:'+(id||item.id+':'+Date.now());
 }
 showBoard(){return Promise.reject(new Error('unavailable'));}
 invite(text){window.FAPI.UI.showInvite(text);return Promise.resolve();}
}

/* Облачное сохранение поверх key-value хранилища платформы.
   Значение одного ключа ограничено, поэтому сейчас JSON режется на части.
   Части пишутся в свободный слот (a/b), указатель ob_meta обновляется последним,
   поэтому оборванная запись не портит предыдущее сохранение. */
class CloudStore{
 constructor(backend){this.backend=backend;this.slot='';this.maxChunks=40;}
 async load(){
  const metaRaw=(await this.backend.get(['ob_meta'])).ob_meta;
  if(!metaRaw)return null;
  const meta=JSON.parse(metaRaw);
  if(!/^[ab]$/.test(meta.slot)||!Number.isInteger(meta.n)||meta.n<1||meta.n>this.maxChunks)return null;
  this.slot=meta.slot;
  const keys=Array.from({length:meta.n},(_,i)=>'ob_'+meta.slot+i),values={};
  for(let i=0;i<keys.length;i+=10)Object.assign(values,await this.backend.get(keys.slice(i,i+10)));
  const json=keys.map(k=>values[k]||'').join('');
  if(json.length!==meta.len)return null;
  return JSON.parse(json);
 }
 async save(value){
  const json=JSON.stringify(value),size=this.backend.chunkSize,slot=this.slot==='a'?'b':'a',n=Math.max(1,Math.ceil(json.length/size));
  if(n>this.maxChunks)throw new Error('save too large');
  for(let i=0;i<n;i++)await this.backend.set('ob_'+slot+i,json.slice(i*size,(i+1)*size));
  await this.backend.set('ob_meta',JSON.stringify({slot,n,len:json.length}));
  this.slot=slot;
 }
}

class OrePlatform{
 constructor({onPause=()=>{},onResume=()=>{},onStatus=()=>{}}={}){this.onPause=onPause;this.onResume=onResume;this.onStatus=onStatus;this.name=null;this.backend=null;this.store=null;this.available=false;this.cloud=false;this.language='ru';this.key=BASE_KEY;this.lastSaveOk=false;this.lastCloudAt=0;this.saveChain=Promise.resolve();this.busy=false;this.gameActive=false;this.canRestore=false;}
 readLocal(){try{return validSave(JSON.parse(localStorage.getItem(this.key)));}catch(_){return null;}}
 writeLocal(state){try{localStorage.setItem(this.key,JSON.stringify(state));return true;}catch(_){this.onStatus('storageFailed');return false;}}
 async init(){
  this.language=/^ru/i.test(navigator.language)?'ru':'en';
  let localState=this.readLocal(),cloudState=null;const kind=detectPlatform();
  if(!kind)return{state:localState,localState,cloudState,language:this.language,cloud:false};
  try{
   const backend=kind==='vk'?new VkBackend():new OkBackend();
   await deadline(backend.init(this),10000);
   this.backend=backend;this.name=kind;this.available=true;this.language=backend.language();
   const id=backend.userId();if(id){this.key=BASE_KEY+':'+kind+':'+id;localState=this.readLocal();}
   try{this.store=new CloudStore(backend);cloudState=validSave(await deadline(this.store.load(),10000));this.cloud=true;}catch(_){this.cloud=false;this.onStatus('saveFailed');}
  }catch(_){this.available=false;this.cloud=false;this.backend=null;this.onStatus('sdkFailed');}
  const state=cloudState&&(!localState||cloudState.updatedAt>=localState.updatedAt)?cloudState:localState;
  return{state,localState,cloudState,language:this.language,cloud:this.cloud};
 }
 // В VK и OK игрок всегда авторизован через свою соцсеть.
 get authorized(){return this.available;}
 get nativeBoard(){return this.name==='vk';}
 ready(){}
 gameplay(active){this.gameActive=active;}
 async save(state,{flush=false,cloud=true}={}){const snapshot=JSON.parse(JSON.stringify(state));const localOk=this.writeLocal(snapshot);
  if(!cloud||!this.cloud||!this.store){if(localOk)this.onStatus(this.available?'saveFailed':'localSave');return localOk;}
  if(!flush&&Date.now()-this.lastCloudAt<CLOUD_INTERVAL)return localOk;
  this.lastCloudAt=Date.now();this.onStatus('cloudPending');
  const operation=async()=>{try{await this.store.save(snapshot);this.lastSaveOk=true;this.onStatus('cloudSave');return true;}catch(_){this.lastSaveOk=false;this.onStatus(localOk?'saveFailed':'storageFailed');return false;}};
  const result=this.saveChain.then(operation,operation);this.saveChain=result.catch(()=>{});return result;
 }
 async login(){throw new Error('unavailable');}
 rewarded(onReward){if(!this.backend||this.busy)return Promise.resolve(false);this.busy=true;this.onPause('ad');
  return this.backend.rewarded().catch(()=>false).then(ok=>{if(ok)try{onReward?.();}catch(_){}return ok;}).finally(()=>{this.busy=false;this.onResume('ad');});}
 async leaderboard(){throw new Error('unavailable');}
 async showBoard(score){if(!this.backend)throw new Error('unavailable');this.onPause('board');try{await this.backend.showBoard(score);}finally{this.onResume('board');}}
 async invite(text){if(!this.backend)throw new Error('unavailable');await this.backend.invite(text);}
 async submitScores(){return false;}
 priceText(product){return window.OreProducts.priceText(this.name,product.id);}
 async catalog(){if(!this.available)return [];return window.OreProducts.ITEMS.map(item=>({id:item.id,price:window.OreProducts.priceText(this.name,item.id)}));}
 async purchase(id,handler){if(this.busy||!this.cloud||!this.backend)throw new Error('unavailable');const item=window.OreProducts.find(id);if(!item)throw new Error('unknown product');this.busy=true;this.onPause('purchase');
  try{const token=await this.backend.buy(item);const ok=await handler({productID:id,purchaseToken:token});if(!ok)throw new Error('save failed');return true;}finally{this.busy=false;this.onResume('purchase');}}
 // Покупки сразу попадают в облачное сохранение, отдельное восстановление не требуется.
 async restorePurchases(){return true;}
}
window.OrePlatform=OrePlatform;
})();
