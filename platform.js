/* Yandex Games SDK adapter. No payments or ad rewards are simulated locally. */
(function(){'use strict';
const BASE_KEY='orebound-save-v1';
function deadline(promise,ms=8000){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),ms);})]).finally(()=>clearTimeout(timer));}
class OrePlatform{
 constructor({onPause=()=>{},onResume=()=>{},onStatus=()=>{}}={}){this.onPause=onPause;this.onResume=onResume;this.onStatus=onStatus;this.sdk=null;this.player=null;this.available=false;this.cloud=false;this.language='ru';this.key=BASE_KEY;this.lastSaveOk=false;this.lastCloudAt=0;this.saveChain=Promise.resolve();this.scoreChain=Promise.resolve();this.lastScoreAt=0;this.boardCache=new Map();this.busy=false;this.accountChanging=false;this.gameActive=false;this.purchaseChain=Promise.resolve();}
 readLocal(){try{const value=JSON.parse(localStorage.getItem(this.key));return value&&(value.version===1||value.version===2)?value:null;}catch(_){return null;}}
 writeLocal(state){try{localStorage.setItem(this.key,JSON.stringify(state));return true;}catch(_){this.onStatus('storageFailed');return false;}}
 async init(){const localMode=location.protocol==='file:'||/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);this.language=/^ru/i.test(navigator.language)?'ru':'en';let localState=this.readLocal(),cloudState=null;
  if(localMode&&!window.YaGames)return{state:localState,localState,cloudState,language:this.language,cloud:false};
  try{if(!window.YaGames)await deadline(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/sdk.js';script.async=true;script.onload=resolve;script.onerror=reject;document.head.append(script);}));
   this.sdk=await deadline(window.YaGames.init());this.available=true;this.language=this.sdk.environment?.i18n?.lang==='ru'?'ru':'en';
   this.sdk.on?.('game_api_pause',()=>this.onPause('sdk'));this.sdk.on?.('game_api_resume',()=>this.onResume('sdk'));
   this.sdk.on?.('ACCOUNT_SELECTION_DIALOG_OPENED',()=>{this.accountChanging=true;this.cloud=false;this.onPause('account');});
   this.sdk.on?.('ACCOUNT_SELECTION_DIALOG_CLOSED',()=>{location.reload();});
   try{this.player=await deadline(this.sdk.getPlayer());const id=this.player.getUniqueID();this.key=BASE_KEY+':'+id;localState=this.readLocal();const data=await deadline(this.player.getData(['orebound']));cloudState=[1,2].includes(data.orebound?.version)?data.orebound:null;this.cloud=true;}catch(_){this.cloud=false;this.onStatus('saveFailed');}
  }catch(_){this.available=false;this.cloud=false;this.onStatus('sdkFailed');}
  const state=cloudState&&(!localState||cloudState.updatedAt>=localState.updatedAt)?cloudState:localState;
  return{state,localState,cloudState,language:this.language,cloud:this.cloud};
 }
 get authorized(){try{return !!this.player?.isAuthorized();}catch(_){return false;}}
 ready(){try{this.sdk?.features?.LoadingAPI?.ready();}catch(_){}}
 gameplay(active){if(this.gameActive===active)return;this.gameActive=active;try{const api=this.sdk?.features?.GameplayAPI;if(api){if(active)api.start();else api.stop();}}catch(_){}}
 async save(state,{flush=false,cloud=true}={}){if(this.accountChanging)return false;const snapshot=JSON.parse(JSON.stringify(state));const localOk=this.writeLocal(snapshot);
  if(!cloud||!this.cloud||!this.player){if(localOk)this.onStatus(this.available?'saveFailed':'localSave');return localOk;}
  if(!flush&&Date.now()-this.lastCloudAt<20000)return localOk;
  this.lastCloudAt=Date.now();this.onStatus('cloudPending');const player=this.player;
  const operation=async()=>{try{if(this.accountChanging||player!==this.player)return false;await player.setData({orebound:snapshot},true);this.lastSaveOk=true;this.onStatus('cloudSave');return true;}catch(_){this.lastSaveOk=false;this.onStatus(localOk?'saveFailed':'storageFailed');return false;}};
  const result=this.saveChain.then(operation,operation);this.saveChain=result.catch(()=>{});return result;
 }
 async login(){if(!this.sdk)throw new Error('unavailable');this.onPause('auth');this.cloud=false;try{await this.saveChain;await this.sdk.auth.openAuthDialog();this.player=await this.sdk.getPlayer();this.key=BASE_KEY+':'+this.player.getUniqueID();const data=await this.player.getData(['orebound']);this.cloud=true;this.lastCloudAt=0;return data.orebound||this.readLocal();}finally{this.onResume('auth');}}
 rewarded(onReward){if(!this.sdk?.adv||this.busy)return Promise.resolve(false);this.busy=true;this.onPause('ad');return new Promise(resolve=>{let rewarded=false,done=false;const finish=()=>{if(done)return;done=true;this.busy=false;this.onResume('ad');resolve(rewarded);};try{this.sdk.adv.showRewardedVideo({callbacks:{onOpen:()=>this.onPause('ad'),onRewarded:()=>{if(!done&&!rewarded){rewarded=true;try{onReward?.();}catch(_){}}},onClose:finish,onError:finish}});}catch(_){finish();}});}
 async leaderboard(kind){if(!['balance','income','clicks','playtime'].includes(kind)||!this.sdk?.leaderboards)throw new Error('unavailable');const cached=this.boardCache.get(kind);if(cached&&Date.now()-cached.at<30000)return cached.entries;const data=await this.sdk.leaderboards.getEntries(kind,{includeUser:this.authorized,quantityAround:2,quantityTop:10});const entries=(data.entries||[]).map(e=>({rank:e.rank,name:e.player?.publicName||'',score:e.score/(['balance','income'].includes(kind)?100:1),id:e.player?.uniqueID||''}));this.boardCache.set(kind,{entries,at:Date.now()});return entries;}
 async submitScores(balance,income,clicks,playtime){if(!this.sdk?.leaderboards||!this.authorized||Date.now()-this.lastScoreAt<60000)return false;this.lastScoreAt=Date.now();try{if(!await this.sdk.isAvailableMethod('leaderboards.setScore'))return false;const entries=[['balance',balance,100],['income',income,100]];if(Number.isFinite(clicks))entries.push(['clicks',clicks,1]);if(Number.isFinite(playtime))entries.push(['playtime',playtime,1]);const task=async()=>{for(const [name,value,scale] of entries){const score=Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,(scale===100?Math.round(value*scale):Math.floor(value))));try{await this.sdk.leaderboards.setScore(name,score);}catch(_){}await new Promise(r=>setTimeout(r,1100));}return true;};this.scoreChain=this.scoreChain.then(task,task);return this.scoreChain;}catch(_){return false;}}
 async getPayments(){if(!this.sdk)throw new Error('unavailable');if(!this.payments)this.payments=await this.sdk.getPayments({signed:false});return this.payments;}
 async catalog(){try{return await (await this.getPayments()).getCatalog();}catch(_){return [];}}
 async fulfill(purchase,handler){if(!window.OreCore.PRODUCTS.some(p=>p.id===purchase.productID)&&!['supporter_pack','ore_crate'].includes(purchase.productID))return false;if(!this.cloud)throw new Error('cloud unavailable');const ok=await handler(purchase);if(!ok)throw new Error('save failed');if(purchase.productID!=='ore_x2_forever')await (await this.getPayments()).consumePurchase(purchase.purchaseToken);return true;}
 async purchase(id,handler){if(this.busy||!this.cloud)throw new Error('unavailable');this.busy=true;this.onPause('purchase');try{const payments=await this.getPayments();const purchase=await payments.purchase({id});return await this.fulfill(purchase,handler);}finally{this.busy=false;this.onResume('purchase');}}
 async restorePurchases(handler){if(!this.cloud)return false;const run=async()=>{const purchases=await(await this.getPayments()).getPurchases();for(const p of purchases)await this.fulfill(p,handler);return true;};const result=this.purchaseChain.then(run,run);this.purchaseChain=result.catch(()=>{});return result;}
}
window.OrePlatform=OrePlatform;
})();
