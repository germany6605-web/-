/* Orebound: deterministic economy and save validation. No DOM or SDK dependencies. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OreCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 2;
  var MAX_COINS = 1000000000000000;
  var MAX_COUNT = 1000000000000;
  var MAX_TIME = 8640000000000000;
  var SPIN_PERIOD = 900000;
  var PRIZES = Object.freeze([
    {id:'cash1',hours:1,weight:200}, {id:'cash3',hours:3,weight:80}, {id:'cash10',hours:10,weight:20},
    {id:'x2m5',multiplier:2,seconds:300,weight:2200}, {id:'x2m10',multiplier:2,seconds:600,weight:1200},
    {id:'x2m25',multiplier:2,seconds:1500,weight:500}, {id:'x2m60',multiplier:2,seconds:3600,weight:200},
    {id:'x3m3',multiplier:3,seconds:180,weight:1800}, {id:'x3m5',multiplier:3,seconds:300,weight:1000},
    {id:'x3m10',multiplier:3,seconds:600,weight:800},
    {id:'hits100',hits:100,weight:1200}, {id:'hits200',hits:200,weight:600}, {id:'hits500',hits:500,weight:200}
  ].map(Object.freeze));
  function incomeMultiplier(state){return state.incomeBoosts.length?state.incomeBoosts[0].multiplier:1;}
  function accrueSpins(state,now){now=clock(now);var elapsed=Math.max(0,Math.floor((now-state.fortune.lastAt)/SPIN_PERIOD));if(elapsed){state.fortune.spins=Math.min(MAX_COUNT,state.fortune.spins+elapsed);state.fortune.lastAt+=elapsed*SPIN_PERIOD;}}
  function prizeIncome(state){var odds=chances(state);return Math.max(.5,level(state,'auto')*.5)*(1+level(state,'click'))*state.market.rate*ORES.reduce(function(sum,o){return sum+o.multiplier*odds[o.id]/100;},0);}
  function spin(state,now,rng){accrueSpins(state,now);if(!state.fortune.spins)return null;var pick=number((rng||Math.random)(),0,0,.999999999)*10000,prize=PRIZES[PRIZES.length-1];for(var i=0;i<PRIZES.length;i++){pick-=PRIZES[i].weight;if(pick<0){prize=PRIZES[i];break;}}state.fortune.spins--;var amount=0;if(prize.hours){var before=state.balance;state.balance=money(before+prizeIncome(state)*3600*prize.hours);amount=money(state.balance-before);state.stats.totalEarned=money(state.stats.totalEarned+amount);}else if(prize.hits){var beforeHits=state.stats.clicks;state.stats.clicks=Math.min(MAX_COINS,beforeHits+prize.hits);amount=state.stats.clicks-beforeHits;}else{var tail=state.incomeBoosts[state.incomeBoosts.length-1];if(tail&&tail.multiplier===prize.multiplier)tail.remaining=Math.min(MAX_COUNT,tail.remaining+prize.seconds);else state.incomeBoosts.push({multiplier:prize.multiplier,remaining:prize.seconds});}return {id:prize.id,amount:amount};}
  function redeemPromo(state,code){code=String(code||'').trim().toUpperCase();if(code==='ВСЕРУДЫ'||code==='ALLMINES'){if(state.allOresUnlocked)return 'promoUsed';state.allOresUnlocked=true;return 'promoUnlocked';}if(code!=='ШАХТА3'&&code!=='SHAHTA3')return 'promoInvalid';if(state.fortune.usedPromo)return 'promoUsed';state.fortune.usedPromo=true;state.fortune.spins=Math.min(MAX_COUNT,state.fortune.spins+3);return 'promoSuccess';}
  function sellRefined(state){return money(ORES.reduce(function(sum,o){return sum+sell(state,o.id,true);},0));}
  // Session-only rewards deliberately live outside the cloud/local save.
  var TIME_REWARDS=Object.freeze([2,5,10,15,20,30,40,50,60,75,90,105,120,140,160,180].map(function(minutes,i){return Object.freeze({at:minutes*60,incomeSeconds:[1,2,3,4,5,7,9,12,15,18,22,26,30,35,40,50][i]*60});}));
  function createRewardSession(){return {elapsed:0,claimed:[]};}
  function tickRewardSession(session,dt){session.elapsed=Math.min(10800,session.elapsed+number(dt,0,0,60));}
  function timeRewardAmount(state,index){var prize=TIME_REWARDS[index];if(!prize)return 0;return money(Math.max(getStats(state).potentialIncome,prizeIncome(state)*incomeMultiplier(state))*prize.incomeSeconds);}
  function claimTimeReward(state,session,index){if(!Number.isInteger(index)||!TIME_REWARDS[index]||session.elapsed<TIME_REWARDS[index].at||session.claimed.indexOf(index)!==-1)return null;var amount=timeRewardAmount(state,index),before=state.balance;state.balance=money(state.balance+amount);amount=money(state.balance-before);state.stats.totalEarned=money(state.stats.totalEarned+amount);session.claimed.push(index);return amount;}
  var AD_WINDOW=10800000, AD_BOOST_COOLDOWN=300000;
  function adStatus(state,now){now=clock(now);var recent=state.adRewards.wheel.filter(function(t){return t>now-AD_WINDOW;});return {wheelLeft:Math.max(0,5-recent.length),wheelWait:recent.length>=5?Math.max(0,recent[0]+AD_WINDOW-now):0,oreWait:Math.max(0,state.adRewards.oreNextAt-now),boostWait:Math.max(0,state.adRewards.boostNextAt-now)};}
  function canAdChance(state,id){return Number.isFinite(chanceCost(state,id));}
  // Called only after the SDK confirms a completed rewarded video.
  function grantAdReward(state,kind,now,id){now=clock(now);var limits=adStatus(state,now);if(kind==='wheel'){if(!limits.wheelLeft)return false;state.adRewards.wheel=state.adRewards.wheel.filter(function(t){return t>now-AD_WINDOW;});state.adRewards.wheel.push(now);state.fortune.spins=Math.min(MAX_COUNT,state.fortune.spins+1);return true;}if(kind==='chance'){if(!canAdChance(state,id))return false;return transferChance(state,id);}if(kind==='ore'){var amount=adOreAmount(state);if(limits.oreWait||!amount)return false;state.adRewards.oreNextAt=now+AD_BOOST_COOLDOWN;randomOre(state,amount,null,false);return true;}if(kind==='income'){if(limits.boostWait)return false;state.adRewards.boostNextAt=now+AD_BOOST_COOLDOWN;state.adIncomeRemaining=Math.min(MAX_COUNT,state.adIncomeRemaining+300);return true;}return false;}

  var PRODUCTS=Object.freeze([
    {id:'ore_x2_1h',multiplier:2,seconds:3600,price:15},
    {id:'ore_x2_2h',multiplier:2,seconds:7200,price:30},
    {id:'ore_x2_5h',multiplier:2,seconds:18000,price:67},
    {id:'ore_x2_24h',multiplier:2,seconds:86400,price:250},
    {id:'spins_1',spins:1,price:10},{id:'spins_3',spins:3,price:25},{id:'spins_10',spins:10,price:75},
    {id:'ore_x3_1h',multiplier:3,seconds:3600,price:25},
    {id:'ore_x2_forever',permanent:true,price:500}
  ].map(Object.freeze));
  function oreMultiplier(state){return (state.permanentOreX2?2:1)*Math.max(state.oreBoosts.length?state.oreBoosts[0].multiplier:1,state.adIncomeRemaining>0?2:1);}
  function adOreAmount(state){return Math.floor(getStats(state).orePerSecond*35);}
  function advanceOreBoosts(state,dt){state.adIncomeRemaining=Math.max(0,state.adIncomeRemaining-dt);while(dt>0&&state.oreBoosts.length){var b=state.oreBoosts[0],used=Math.min(dt,b.remaining);b.remaining-=used;dt-=used;if(b.remaining<=0)state.oreBoosts.shift();}}
  function productionTime(state,dt){var total=0,left=dt;while(left>0){var part=Math.min(left,state.adIncomeRemaining>0?state.adIncomeRemaining:left,state.oreBoosts.length?state.oreBoosts[0].remaining:left);total+=part*oreMultiplier(state);advanceOreBoosts(state,part);left-=part;}return total;}
  var MARKET_PERIOD = 30000;
  var MARKET_WEIGHTS = Object.freeze([2800,2300,1800,1200,800,450,280,170,100,40,25,15,10,6,4]);
  function marketRate(rng){var pick=number((rng||Math.random)(),0,0,0.999999999)*10000;for(var i=0;i<15;i++){pick-=MARKET_WEIGHTS[i];if(pick<0)return i+1;}return 15;}
  function sellAll(state,rawOnly){var total=0;ORES.forEach(function(o){total+=sell(state,o.id,false);if(!rawOnly)total+=sell(state,o.id,true);});return money(total);}

  var ORES = Object.freeze([
    {id:'coal', color:'#747779', multiplier:1},
    {id:'copper', color:'#cf8758', multiplier:2},
    {id:'silver', color:'#c8dce8', multiplier:4},
    {id:'gold', color:'#ffd568', multiplier:8},
    {id:'emerald', color:'#68edb3', multiplier:15},
    {id:'iron',color:'#b8adb1',multiplier:20},
    {id:'tin',color:'#b0c4cf',multiplier:26},
    {id:'lead',color:'#888ba8',multiplier:33},
    {id:'nickel',color:'#b9c789',multiplier:42},
    {id:'zinc',color:'#91bcb9',multiplier:52},
    {id:'quartz',color:'#eee1ff',multiplier:65},
    {id:'amethyst',color:'#b083ed',multiplier:80},
    {id:'ruby',color:'#ed6285',multiplier:100},
    {id:'sapphire',color:'#648afa',multiplier:125},
    {id:'topaz',color:'#ffab58',multiplier:155},
    {id:'opal',color:'#a5ecd9',multiplier:190},
    {id:'platinum',color:'#e6e6f7',multiplier:235},
    {id:'titanium',color:'#9ea7df',multiplier:290},
    {id:'diamond',color:'#a0f0ff',multiplier:360},
    {id:'uranium',color:'#b1ec59',multiplier:450}
  ].map(Object.freeze));
  var CHANCE_COST = {copper:80,silver:250,gold:700,emerald:1800};
  ORES.slice(5).forEach(function(o,i){CHANCE_COST[o.id]=Math.round(3000*Math.pow(1.7,i));});
  function unlockClicks(id){var i=ORES.findIndex(function(o){return o.id===id;});return i<=0?0:i===1?100:i===2?1000:i<=9?1000+(i-2)*3500:25500+(i-9)*7500;}
  function chanceAvailable(state,id){return !!ore(id)&&(state.allOresUnlocked||state.stats.clicks>=unlockClicks(id));}
  function chances(state) {
    var result={coal:100};
    ORES.slice(1).forEach(function(o){result[o.id]=integer(state.chanceLevels[o.id],0,0,Math.min(20,result.coal));result.coal-=result[o.id];});
    return result;
  }
  // The donor must be cheaper than the target, so upgrading never lowers ore value.
  function chanceDonor(state,id){var target=ore(id);if(!target)return null;var odds=chances(state);var donor=ORES.filter(function(o){return o.multiplier<target.multiplier&&odds[o.id]>0;}).sort(function(a,b){return a.multiplier-b.multiplier;})[0];return donor?donor.id:null;}
  function transferChance(state,id){var donor=chanceDonor(state,id);if(!donor)return false;if(donor!=='coal')state.chanceLevels[donor]--;state.chanceLevels[id]++;return true;}
  function chanceCost(state,id){return !CHANCE_COST[id]||!chanceAvailable(state,id)||!chanceDonor(state,id)||state.chanceLevels[id]>=20?Infinity:Math.ceil(CHANCE_COST[id]*Math.pow(1.35,state.chanceLevels[id]));}
  function buyChance(state,id){var price=chanceCost(state,id);if(!Number.isFinite(price)||state.balance<price)return false;if(!transferChance(state,id))return false;state.balance=money(state.balance-price);return true;}
  function rollOre(state,rng){var odds=chances(state),r=number((rng||Math.random)(),0,0,0.999999999)*100;for(var i=0;i<ORES.length;i++){r-=odds[ORES[i].id];if(r<0)return ORES[i].id;}return 'coal';}
  function randomOre(state,amount,rng,countAsMined){var drops={};for(var i=0;i<amount;i++){var id=rollOre(state,rng);var added=addOre(state,id,1,countAsMined);drops[id]=(drops[id]||0)+added;state.selectedOre=id;}return drops;}
  var MAX_LEVELS = Object.freeze({ click: 100, auto: 60, smeltSpeed: 27, smeltCapacity: 100 });
  var BASE_COST = { click: 20, auto: 500, smeltSpeed: 80, smeltCapacity: 60 };
  var GROWTH = { click: 1.48, auto: 1.65, smeltSpeed: 1.5, smeltCapacity: 1.5 };

  function number(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(max, Math.max(min, value)) : fallback;
  }
  function integer(value, fallback, min, max) { return Math.floor(number(value, fallback, min, max)); }
  function money(value) { return Math.round(number(value, 0, 0, MAX_COINS) * 100) / 100; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function clock(value) { return number(value, Date.now(), 0, MAX_TIME - MARKET_PERIOD); }
  function ore(id) { return ORES.find(function (entry) { return entry.id === id; }); }
  function isUnlocked(state, id) { return !!ore(id) && state.unlocked.indexOf(id) !== -1; }
  function selected(state) { return isUnlocked(state, state.selectedOre) ? ore(state.selectedOre) : ORES[0]; }
  function level(state, key) { return integer(state.upgrades[key], 0, 0, MAX_LEVELS[key] || 0); }
  function duration(state) { return Math.max(0.5, Math.round(8 * Math.pow(0.9, level(state, 'smeltSpeed')) * 1000) / 1000); }

  function createState(now) {
    now = clock(now);
    var inventories = {};
    ORES.forEach(function (entry) { inventories[entry.id] = { raw: 0, refined: 0 }; });
    return {
      version: VERSION,
      oreShopVersion: 1,
      updatedAt: now,
      balance: 0,
      ores: inventories,
      selectedOre: 'coal',
      smeltOre: 'coal',
      allOresUnlocked: false,
      chanceLevels: Object.fromEntries(ORES.slice(1).map(function(o){return [o.id,0];})),
      unlocked: ORES.map(function(o){return o.id;}),
      upgrades: { click: 0, auto: 0, smeltSpeed: 0, smeltCapacity: 0 },
      market: { rate: 3, previous: 3, nextAt: now + MARKET_PERIOD, history: [3] },
      smelt: null,
      autoSmelt: true,
      autoProgress: 0,
      autoHitProgress: 0,
      oreBoosts: [], permanentOreX2: false,
      stats: { totalMined: 0, totalEarned: 0, clicks: 0, playSeconds: 0 },
      settings: { language: 'ru', music: true, sound: true, reducedMotion: false, inventoryExpanded: false },
      boostRemaining: 0,
      fortune: {spins:0,lastAt:now,usedPromo:false},
      incomeBoosts: [],
      adRewards: {wheel:[],boostNextAt:0,oreNextAt:0},
      adIncomeRemaining: 0,
      processedPurchases: []
    };
  }

  function sanitizeState(raw, now) {
    now = clock(now);
    raw = object(raw);
    var state = createState(now);
    state.updatedAt = number(raw.updatedAt, now, 0, now);
    state.balance = money(raw.balance);
    var inventories = object(raw.ores);
    ORES.forEach(function (entry) {
      var inventory = object(inventories[entry.id]);
      state.ores[entry.id].raw = integer(inventory.raw, 0, 0, MAX_COUNT);
      state.ores[entry.id].refined = integer(inventory.refined, 0, 0, MAX_COUNT);
    });
    state.unlocked=ORES.map(function(o){return o.id;});
    state.selectedOre=ore(raw.selectedOre)?raw.selectedOre:'coal';
    state.smeltOre=ore(raw.smeltOre)?raw.smeltOre:'coal';
    state.allOresUnlocked=raw.allOresUnlocked===true;
    var savedChances=object(raw.chanceLevels);
    var chanceBudget=100;ORES.slice(1).forEach(function(o){state.chanceLevels[o.id]=integer(savedChances[o.id],0,0,Math.min(20,chanceBudget));chanceBudget-=state.chanceLevels[o.id];});
    if(raw.version===1){
      state.selectedOre='coal';
      var refunds={silver:400,gold:1800,emerald:7000};
      (Array.isArray(raw.unlocked)?raw.unlocked:[]).forEach(function(id){state.balance=money(state.balance+(refunds[id]||0));});
    }
    var upgrades = object(raw.upgrades);
    Object.keys(MAX_LEVELS).forEach(function (key) { state.upgrades[key] = integer(upgrades[key], 0, 0, MAX_LEVELS[key]); });
    var market = object(raw.market);
    state.market.rate = integer(market.rate, 3, 1, 15);
    state.market.previous = integer(market.previous, state.market.rate, 1, 15);
    // Expired quotes are refreshed by tick(0, now), without offline production.
    state.market.nextAt = number(market.nextAt, now + MARKET_PERIOD, 0, now + MARKET_PERIOD);
    state.market.history = Array.isArray(market.history) ? market.history.filter(function (rate) {
      return Number.isInteger(rate) && rate >= 1 && rate <= 15;
    }).slice(-12) : [];
    if (!state.market.history.length) state.market.history.push(state.market.rate);
    var stats = object(raw.stats);
    state.stats.totalMined = integer(stats.totalMined, 0, 0, MAX_COINS);
    state.stats.totalEarned = money(stats.totalEarned);
    state.stats.clicks = integer(stats.clicks, 0, 0, MAX_COINS);
    state.stats.playSeconds = number(stats.playSeconds, 0, 0, MAX_COUNT);
    var settings = object(raw.settings);
    state.settings.language = settings.language === 'en' ? 'en' : 'ru';
    ['music', 'sound', 'inventoryExpanded'].forEach(function (key) {
      if (typeof settings[key] === 'boolean') state.settings[key] = settings[key];
    });
    state.autoSmelt = raw.oreShopVersion===1 ? raw.autoSmelt!==false : true;
    state.oreShopVersion=1;
    state.autoHitProgress=number(raw.autoHitProgress,0,0,.999999999);
    state.permanentOreX2=raw.permanentOreX2===true;
    state.oreBoosts=(Array.isArray(raw.oreBoosts)?raw.oreBoosts:[]).filter(b=>b&&(b.multiplier===2||b.multiplier===3)&&Number.isFinite(b.remaining)&&b.remaining>0).map(b=>({multiplier:b.multiplier,remaining:number(b.remaining,0,0,MAX_COUNT)}));
    state.autoProgress = number(raw.autoProgress, 0, 0, 0.999999999);
    state.boostRemaining = number(raw.boostRemaining, 0, 0, 60);
    state.processedPurchases = Array.isArray(raw.processedPurchases)
      ? Array.from(new Set(raw.processedPurchases.filter(function (token) { return typeof token === 'string' && token.trim().length > 0; })))
      : [];
    var ads=object(raw.adRewards);
    state.adRewards={wheel:(Array.isArray(ads.wheel)?ads.wheel:[]).filter(function(t){return typeof t==='number'&&Number.isFinite(t)&&t>=0&&t>now-AD_WINDOW;}).map(function(t){return Math.min(now,t);}).sort(function(a,b){return a-b;}).slice(-5),oreNextAt:number(ads.oreNextAt,0,0,now+AD_BOOST_COOLDOWN),boostNextAt:number(ads.boostNextAt,0,0,now+AD_BOOST_COOLDOWN)};
    state.adIncomeRemaining=number(raw.adIncomeRemaining,0,0,MAX_COUNT);
    var fortune=object(raw.fortune);
    state.fortune={spins:integer(fortune.spins,0,0,MAX_COUNT),lastAt:number(fortune.lastAt,now,0,now),usedPromo:fortune.usedPromo===true};
    state.incomeBoosts=(Array.isArray(raw.incomeBoosts)?raw.incomeBoosts:[]).filter(function(b){return b&&(b.multiplier===2||b.multiplier===3)&&Number.isFinite(b.remaining)&&b.remaining>0;}).map(function(b){return {multiplier:b.multiplier,remaining:number(b.remaining,0,0,MAX_COUNT)};});
    accrueSpins(state,now);
    var smelt = object(raw.smelt);
    if (isUnlocked(state, smelt.type)) {
      var batchSize = integer(smelt.amount, 0, 0, 1 + state.upgrades.smeltCapacity);
      if (batchSize > 0) {
        var batchDuration = number(smelt.duration, duration(state), 0.5, 8);
        state.smelt = { type: smelt.type, amount: batchSize, elapsed: number(smelt.elapsed, 0, 0, batchDuration), duration: batchDuration };
      }
    }
    return state;
  }

  function cost(state, key) {
    if (!Object.prototype.hasOwnProperty.call(MAX_LEVELS, key) || level(state, key) >= MAX_LEVELS[key]) return Infinity;
    return Math.min(MAX_COINS, Math.ceil(BASE_COST[key] * Math.pow(GROWTH[key], level(state, key))));
  }

  function getStats(state) {
    var clickYield = (1 + level(state, 'click')) * oreMultiplier(state);
    var autoRate = level(state, 'auto') * 0.5;
    var orePerSecond = autoRate * clickYield * (state.boostRemaining > 0 ? 2 : 1);
    var prices = {};
    Object.keys(MAX_LEVELS).forEach(function (key) { prices[key] = cost(state, key); });
    return {
      clickYield: clickYield,
      autoRate: autoRate,
      orePerSecond: orePerSecond,
      potentialIncome: money(incomeMultiplier(state) * orePerSecond * ORES.reduce(function(sum,o){return sum+o.multiplier*chances(state)[o.id]/100;},0) * state.market.rate),
      smeltDuration: duration(state),
      smeltCapacity: 1 + level(state, 'smeltCapacity'),
      prices: prices,
      maxLevels: MAX_LEVELS
    };
  }

  function addOre(state, id, amount, countAsMined) {
    var inventory = state.ores[id];
    var added = Math.min(MAX_COUNT - inventory.raw, Math.max(0, Math.floor(amount)));
    inventory.raw += added;
    if (countAsMined) state.stats.totalMined = Math.min(MAX_COINS, state.stats.totalMined + added);
    return added;
  }

  function mine(state,rng) {
    var drops=randomOre(state,(1+level(state,'click'))*oreMultiplier(state),rng,true);
    state.stats.clicks=Math.min(MAX_COINS,state.stats.clicks+1);
    return {amount:Object.values(drops).reduce(function(a,b){return a+b;},0),type:state.selectedOre,drops:drops};
  }

  function buyUpgrade(state, key) {
    var price = cost(state, key);
    if (!Number.isFinite(price) || state.balance < price) return false;
    state.balance = money(state.balance - price);
    state.upgrades[key] = level(state, key) + 1;
    return true;
  }

  function sell(state, id, refined, amount) {
    var entry = ore(id);
    if (!entry || !isUnlocked(state, id)) return 0;
    var field = refined === true ? 'refined' : 'raw';
    var inventory = state.ores[id];
    var count = amount === undefined || amount === 'all' ? inventory[field] : integer(amount, 0, 0, inventory[field]);
    if (!count) return 0;
    // Integer cents guarantee the exact +20% refined premium.
    var unitCents = state.market.rate * entry.multiplier * (refined === true ? 120 : 100) * incomeMultiplier(state);
    var before = state.balance;
    state.balance = money(state.balance + count * unitCents / 100);
    var revenue = money(state.balance - before);
    inventory[field] -= count;
    state.stats.totalEarned = money(state.stats.totalEarned + revenue);
    return revenue;
  }

  function startSmelt(state, id) {
    if (state.smelt || !isUnlocked(state, id)) return 0;
    var inventory = state.ores[id];
    var amount = Math.min(inventory.raw, 1 + level(state, 'smeltCapacity'), MAX_COUNT - inventory.refined);
    if (!amount) return 0;
    inventory.raw -= amount;
    state.smelt = { type: id, amount: amount, elapsed: 0, duration: duration(state) };
    return amount;
  }

  function tick(state, dtSeconds, now, rng) {
    now = clock(now);
    // A caller must pass only visible, unpaused play time. Also cap delayed frames.
    var dt = number(dtSeconds, 0, 0, 60);
    state.updatedAt = now;
    if (now >= state.market.nextAt) {
      var newRate = marketRate(rng);
      state.market.previous = state.market.rate;
      state.market.rate = newRate;
      state.market.history.push(newRate);
      state.market.history = state.market.history.slice(-12);
      state.market.nextAt += (Math.floor((now - state.market.nextAt) / MARKET_PERIOD) + 1) * MARKET_PERIOD;
    }
    accrueSpins(state,now);
    if (!dt) return;

    var boostTime=dt;
    while(boostTime>0&&state.incomeBoosts.length){var active=state.incomeBoosts[0],used=Math.min(boostTime,active.remaining);active.remaining-=used;boostTime-=used;if(active.remaining<=0)state.incomeBoosts.shift();}
    state.stats.playSeconds = Math.min(MAX_COUNT, state.stats.playSeconds + dt);
    var boostedSeconds = Math.min(dt, state.boostRemaining);
    var weightedTime=productionTime(state,boostedSeconds)*2+productionTime(state,dt-boostedSeconds);
    var production = level(state, 'auto') * 0.5 * (1 + level(state, 'click')) * weightedTime;
    state.autoHitProgress+=level(state,'auto')*.5*dt;
    var hits=Math.floor(state.autoHitProgress+1e-9);
    state.autoHitProgress=Math.max(0,state.autoHitProgress-hits);
    state.stats.clicks=Math.min(MAX_COINS,state.stats.clicks+hits);
    state.autoProgress += production;
    var wholeOre = Math.floor(state.autoProgress + 0.000000001);
    if (wholeOre > 0) {
      randomOre(state, wholeOre, rng, true);
      state.autoProgress = Math.max(0, state.autoProgress - wholeOre);
    }
    state.boostRemaining = Math.max(0, state.boostRemaining - dt);
    var remaining = dt;
    while (state.smelt && remaining > 0) {
      var batch = state.smelt;
      var needed = batch.duration - batch.elapsed;
      if (remaining + 0.000000001 < needed) {
        batch.elapsed += remaining;
        break;
      }
      remaining = Math.max(0, remaining - needed);
      state.ores[batch.type].refined = Math.min(MAX_COUNT, state.ores[batch.type].refined + batch.amount);
      state.smelt = null;
      if (state.autoSmelt) startSmelt(state, batch.type);
    }
  }

  function reward(state, kind) {
    if (kind === 'ore') { randomOre(state,50,null,false); return true; }
    if (kind === 'boost') { state.boostRemaining = 60; return true; }
    return false;
  }

  function grantProduct(state, id, token) {
    var product=PRODUCTS.find(p=>p.id===id);
    if ((!product && id !== 'supporter_pack' && id !== 'ore_crate') || typeof token !== 'string' || !token.trim() || state.processedPurchases.indexOf(token) !== -1) return false;
    if(product){if(product.permanent)state.permanentOreX2=true;else if(product.spins)state.fortune.spins=Math.min(MAX_COUNT,state.fortune.spins+product.spins);else{var tail=state.oreBoosts[state.oreBoosts.length-1];if(tail&&tail.multiplier===product.multiplier)tail.remaining=Math.min(MAX_COUNT,tail.remaining+product.seconds);else state.oreBoosts.push({multiplier:product.multiplier,remaining:product.seconds});}}
    else if (id === 'supporter_pack') state.balance = money(state.balance + 2500);
    else randomOre(state,500,null,false);
    state.processedPurchases.push(token);
    return true;
  }

  return Object.freeze({
    PRODUCTS: PRODUCTS, oreMultiplier: oreMultiplier, adOreAmount: adOreAmount,
    TIME_REWARDS: TIME_REWARDS, createRewardSession: createRewardSession, tickRewardSession: tickRewardSession, timeRewardAmount: timeRewardAmount, claimTimeReward: claimTimeReward,
    adStatus: adStatus, canAdChance: canAdChance, grantAdReward: grantAdReward,
    unlockClicks: unlockClicks, chanceAvailable: chanceAvailable, chanceDonor: chanceDonor,
    PRIZES: PRIZES, SPIN_PERIOD: SPIN_PERIOD, spin: spin, redeemPromo: redeemPromo, incomeMultiplier: incomeMultiplier, prizeIncome: prizeIncome, sellRefined: sellRefined,
    VERSION: VERSION, ORES: ORES, MAX_LEVELS: MAX_LEVELS,
    createState: createState, sanitizeState: sanitizeState, getStats: getStats,
    mine: mine, buyUpgrade: buyUpgrade, sell: sell, startSmelt: startSmelt,
    tick: tick, reward: reward, grantProduct: grantProduct, sellAll: sellAll, marketRate: marketRate, MARKET_WEIGHTS: MARKET_WEIGHTS, cost: cost, chances: chances, chanceCost: chanceCost, buyChance: buyChance, rollOre: rollOre
  });
});
