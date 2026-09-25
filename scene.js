(function(){'use strict';
class OreScene{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.hitAt=-1000;if(typeof Image!=='undefined'){this.backdrop=new Image();this.backdrop.src='assets/mine-v8.png';this.rock=new Image();this.rock.src='assets/rock-v6.png';this.oreAtlas=new Image();this.oreAtlas.src='assets/ores-v7.png';}}
 poly(points,color,outline='#352b40',width=3){const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();c.fillStyle=color;c.fill();if(outline){c.strokeStyle=outline;c.lineWidth=width;c.lineJoin='round';c.stroke();}}
 oval(x,y,rx,ry,color,outline=null,width=3){const c=this.ctx;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();if(outline){c.strokeStyle=outline;c.lineWidth=width;c.stroke();}}
 box(x,y,w,h,r,color,outline='#422c35',width=4){const c=this.ctx;c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();if(outline){c.strokeStyle=outline;c.lineWidth=width;c.stroke();}}
 line(points,color,width=3){const c=this.ctx;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
 hit(time){this.hitAt=time;}
 getPatches(odds){
  const ores=window.OreCore?window.OreCore.ORES:['coal','copper','silver','gold','emerald'].map(id=>({id}));
  const key=ores.map(o=>odds[o.id]||0).join(',');if(key===this.patchKey)return this.patches;
  const kinds=ores.map((o,index)=>({id:o.id,index,count:Math.min(5,Math.ceil(Math.max(0,odds[o.id]||0)/(o.id==='coal'?20:4))),placed:[]})).filter(o=>o.count);
  const total=kinds.reduce((n,o)=>n+o.count,0),spots=[];const radius=Math.max(8,Math.min(17,45/Math.sqrt(total||1)));
  // One shared, evenly spaced field keeps different minerals from overlapping.
  for(let i=0;i<total;i++){const angle=i*2.3999632297+.3,r=Math.sqrt((i+.5)/total);spots.push({u:Math.cos(angle)*r,v:Math.sin(angle)*r});}
  const patches=[];
  for(let round=0;round<5;round++)for(const ore of kinds){
   if(round>=ore.count)continue;
   const phase=ore.index*2.3999632297;
   const score=p=>ore.placed.length?Math.min(...ore.placed.map(q=>(p.u-q.u)**2+(p.v-q.v)**2)):-((p.u-Math.cos(phase)*.65)**2+(p.v-Math.sin(phase)*.65)**2);
   let best=0;for(let i=1;i<spots.length;i++)if(score(spots[i])>score(spots[best]))best=i;
   const spot=spots.splice(best,1)[0];ore.placed.push(spot);
   patches.push({id:ore.id,index:ore.index,x:455+spot.u*119,y:267+spot.v*65,r:radius*(round%2?.9:1)});
  }
  this.patchKey=key;this.patches=patches;return patches;
 }
 draw(time,type='coal',reduced=false,auto=0,dt=.016,odds={coal:100,copper:0,silver:0,gold:0,emerald:0}){
 const c=this.ctx;if(!c)return;c.clearRect(0,0,900,440);
 const bg=c.createLinearGradient(0,0,0,440);bg.addColorStop(0,'#3e3554');bg.addColorStop(1,'#86604e');c.fillStyle=bg;c.fillRect(0,0,900,440);
 const painted=this.backdrop&&this.backdrop.complete&&this.backdrop.naturalWidth;
 if(painted)c.drawImage(this.backdrop,0,0,900,440);
 if(!painted){
 // Big, soft cave stones with hand-drawn outlines.
 const stones=[[0,40,100,85],[130,18,88,66],[268,-12,80,52],[406,-16,105,58],[567,-12,83,58],[712,17,92,74],[867,38,96,87],[15,178,105,80],[90,280,88,95],[877,180,91,93],[822,302,88,75]];
 stones.forEach(([x,y,rx,ry],i)=>{this.oval(x,y,rx,ry,['#8d6f67','#a37b65','#70596d'][i%3],'#453548',5);this.line([[x-rx*.42,y-ry*.48],[x-rx*.1,y-ry*.61],[x+rx*.3,y-ry*.46]],'#dab18b55',4);});
 this.oval(454,245,262,237,'#493950');this.oval(450,274,222,185,'#3e3349');
 this.poly([[0,349],[123,331],[256,343],[458,325],[705,334],[900,346],[900,440],[0,440]],'#aa825b','#57404c',4);
 this.poly([[0,394],[157,367],[330,382],[548,358],[706,379],[900,369],[900,440],[0,440]],'#83664f',null);
 // Rails and oversized sleepers.
 for(let y=356;y<441;y+=22){let t=(y-340)/100;this.box(356-t*100,y,188+t*208,10,4,'#855437','#4f3740',3);}
 this.line([[390,347],[321,440]],'#393844',11);this.line([[390,347],[321,440]],'#ada9a5',5);this.line([[509,346],[600,440]],'#393844',11);this.line([[509,346],[600,440]],'#ada9a5',5);
 // Bent timber frame: honey highlights and visible grain.
 this.poly([[173,90],[205,96],[220,348],[180,351]],'#b77b43','#4f343b',6);this.poly([[700,93],[734,84],[710,347],[675,345]],'#b77b43','#4f343b',6);
 this.poly([[147,87],[749,75],[765,115],[140,126]],'#bc8247','#4f343b',6);this.line([[157,96],[735,86]],'#f6c677',6);this.line([[187,113],[198,320]],'#edb667',5);this.line([[713,117],[691,321]],'#e8ac60',5);
 this.line([[190,191],[266,120]],'#5c3c3b',18);this.line([[190,191],[266,120]],'#ae7440',10);this.line([[692,178],[632,118]],'#5c3c3b',18);this.line([[692,178],[632,118]],'#ae7440',10);
 [210,680].forEach(x=>{this.oval(x,103,6,6,'#ebca8f','#65433d',2);});
 // Friendly warm lantern.
 this.line([[280,124],[280,153]],'#e0bf76',3);const glow=c.createRadialGradient(280,178,4,280,178,125);glow.addColorStop(0,'#ffdc7755');glow.addColorStop(1,'#ffdc7700');c.fillStyle=glow;c.fillRect(150,48,260,260);
 this.box(266,155,28,41,9,'#ffcf68','#624645',4);this.box(272,162,16,27,6,'#ffec9e',null);this.box(261,151,38,9,4,'#ae8251');this.box(263,194,34,8,4,'#906843');
 }
 // Rounded ore boulder; its inclusions directly encode the current probabilities.
 c.save();const age=(time-this.hitAt)/1000;if(!reduced&&age>=0&&age<.22){const squash=Math.sin(age/.22*Math.PI)*.035;c.translate(450,320);c.scale(1+squash,1-squash);c.translate(-450,-320);}
 this.oval(450,350,151,26,'#342a3c55');
 const rockReady=this.rock&&this.rock.complete&&this.rock.naturalWidth;
 if(rockReady)c.drawImage(this.rock,295,147,320,213);
 else {
 c.beginPath();c.moveTo(309,302);c.bezierCurveTo(290,258,337,194,375,191);c.bezierCurveTo(405,150,464,166,489,181);c.bezierCurveTo(542,164,588,224,585,271);c.bezierCurveTo(621,321,566,350,520,355);c.bezierCurveTo(466,370,325,365,309,302);c.closePath();c.fillStyle='#81919c';c.fill();c.strokeStyle='#343346';c.lineWidth=7;c.stroke();
 this.poly([[320,260],[377,194],[415,185],[441,249],[378,290]],'#a8b4b5',null);this.poly([[441,249],[487,185],[553,211],[574,268],[510,309]],'#91a4a9',null);this.poly([[313,303],[377,290],[442,313],[503,351],[380,350],[329,332]],'#647a88',null);this.line([[344,231],[375,207],[408,205]],'#d3ddd0',6);
 }
 const colors={coal:['#38414f','#667283'],copper:['#df8c52','#ffcf90'],silver:['#b9dfee','#f0ffff'],gold:['#f1bd45','#fff1a0'],emerald:['#40b98e','#a3ffe0']};
 (window.OreCore?window.OreCore.ORES:[]).slice(5).forEach(o=>{colors[o.id]=[o.color,'#ffffffb0'];});
 for(const {id,index,x,y,r} of this.getPatches(odds)){
  const atlas=this.oreAtlas;
  if(atlas&&atlas.complete&&atlas.naturalWidth){const w=atlas.naturalWidth/5,h=atlas.naturalHeight/4;c.drawImage(atlas,(index%5)*w,Math.floor(index/5)*h,w,h,x-r*1.65,y-r*1.3,r*3.3,r*2.6);continue;}
  if(id==='coal'){this.oval(x,y,r,r*.78,colors[id][0],'#303242',3);this.line([[x-r*.4,y-r*.4],[x+r*.2,y-r*.5]],colors[id][1],3);}
  else{this.poly([[x-r,y-r*.2],[x-r*.4,y-r],[x+r*.6,y-r*.8],[x+r,y+r*.2],[x+r*.25,y+r],[x-r*.8,y+r*.65]],colors[id][0],'#4a3a4a',3);this.poly([[x-r*.4,y-r],[x+r*.6,y-r*.8],[x+r*.2,y],[x-r*.5,y+r*.2]],colors[id][1],null);}
 }
 c.restore();
 if(!painted){
 // Cart, scattered pebbles and a large cartoon pickaxe.
 this.oval(137,382,68,13,'#352d3c44');this.box(83,320,111,54,13,'#8785a0','#3b344b',5);this.box(76,315,124,13,6,'#b9b0b4','#3b344b',4);
 [[104,311],[126,306],[151,305],[174,311]].forEach(([x,y])=>this.oval(x,y,16,12,'#3b3e50','#2b3042',3));this.line([[94,341],[180,341]],'#b4acbc',4);[102,174].forEach(x=>{this.oval(x,377,15,15,'#4e455d','#302a41',4);this.oval(x,377,6,6,'#bfaa91');});
 c.save();c.translate(626,302);c.rotate(-.42+(age>=0&&age<.22&&!reduced?Math.sin(age*22)*.23:0));this.box(-6,-71,12,100,6,'#c3874c','#443445',4);this.line([[-2,-56],[-2,13]],'#efbe77',3);this.poly([[-44,-67],[-28,-85],[3,-89],[28,-78],[44,-53],[14,-64],[-9,-69],[-30,-63]],'#96b7c6','#39394d',5);this.line([[-26,-79],[0,-81],[23,-72]],'#def0e1',4);c.restore();
 if(auto>0){this.box(252,304,41,41,10,'#d9a851','#514044',4);this.box(259,313,27,15,5,'#746576');this.poly([[263,345],[282,345],[273+(reduced?0:Math.sin(time/60)*2),367]],'#b7c9ca','#423b50',3);}
 [[53,401,18],[233,381,13],[694,387,20],[769,359,15],[842,391,23]].forEach(([x,y,r])=>this.oval(x,y,r,r*.6,'#b29b8a','#685566',3));
 }

 }
}
window.OreScene=OreScene;
})();
