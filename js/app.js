const appState={
 tariff:1444.70,interval:60,timer:null,history:[],
 devices:[
  {id:"EM-001",name:"Panel Utama",location:"Ruang distribusi",status:"online",voltage:220.8,current:2.34,power:510.7,energy:3.284,frequency:50.02,pf:.99},
  {id:"EM-002",name:"Beban Produksi",location:"Area kerja",status:"online",voltage:219.6,current:1.82,power:386.4,energy:2.176,frequency:49.98,pf:.97},
  {id:"EM-003",name:"Penerangan",location:"Gedung A",status:"offline",voltage:0,current:0,power:0,energy:.842,frequency:0,pf:0}
 ]
};
const el=id=>document.getElementById(id);
const fmt=(n,d=2)=>Number(n||0).toLocaleString("id-ID",{minimumFractionDigits:d,maximumFractionDigits:d});
const money=n=>"Rp"+Math.round(n).toLocaleString("id-ID");
const active=()=>appState.devices.filter(d=>d.status==="online");
const total=k=>active().reduce((s,d)=>s+(Number(d[k])||0),0);
const average=k=>active().length?total(k)/active().length:0;
function makeHistory(){
 for(let i=0;i<8;i++)appState.devices.filter(d=>d.status==="online").forEach(d=>appState.history.push({...d,time:new Date(Date.now()-(7-i)*60000)}));
}
function updateOverview(){
 const energy=total("energy"),power=total("power");
 el("onlineCount").textContent=active().length+" / "+appState.devices.length;
 el("totalEnergy").textContent=fmt(energy,3)+" kWh";
 el("totalPower").textContent=fmt(power,1)+" W";
 el("totalCost").textContent=money(energy*appState.tariff);
 el("voltage").textContent=fmt(average("voltage"),1);
 el("current").textContent=fmt(total("current"),3);
 el("power").textContent=fmt(power,1);
 el("energy").textContent=fmt(energy,3);
 el("frequency").textContent=fmt(average("frequency"),2);
 el("pf").textContent=fmt(average("pf"),2);
}
function deviceOptions(){
 const opts=appState.devices.map(d=>'<option value="'+d.id+'">'+escapeHtml(d.name)+'</option>').join("");
 ["realtimeDevice","analyticsDevice"].forEach(id=>el(id).innerHTML=opts);
 el("historyDevice").innerHTML='<option value="all">Semua perangkat</option>'+opts;
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderDevices(){
 el("deviceMiniList").innerHTML=appState.devices.map(d=>'<div class="device-mini"><div class="device-left"><span class="device-symbol">▣</span><span><b>'+escapeHtml(d.name)+'</b><small>'+d.id+' · '+escapeHtml(d.location)+'</small></span></div><span class="status '+d.status+'">'+d.status.toUpperCase()+'</span></div>').join("");
 el("deviceCards").innerHTML=appState.devices.map(d=>'<article class="device-card"><div class="device-card-head"><div><h3>'+escapeHtml(d.name)+'</h3><p>'+d.id+' · '+escapeHtml(d.location)+'</p></div><span class="status '+d.status+'">'+d.status.toUpperCase()+'</span></div><div class="device-card-metrics"><div><span>Tegangan</span><b>'+fmt(d.voltage,1)+' V</b></div><div><span>Arus</span><b>'+fmt(d.current,3)+' A</b></div><div><span>Daya</span><b>'+fmt(d.power,1)+' W</b></div><div><span>Energi</span><b>'+fmt(d.energy,3)+' kWh</b></div></div><div class="device-card-foot"><span>'+d.id+'</span><span>'+(d.status==="online"?"Terpantau":"Tidak terhubung")+'</span></div></article>').join("");
}
function renderLatest(){
 el("latestRows").innerHTML=appState.devices.map(d=>'<tr><td class="device-name">'+escapeHtml(d.name)+'</td><td>'+fmt(d.voltage,1)+' V</td><td>'+fmt(d.current,3)+' A</td><td>'+fmt(d.power,1)+' W</td><td>'+fmt(d.energy,3)+' kWh</td><td><span class="status '+d.status+'">'+d.status.toUpperCase()+'</span></td></tr>').join("");
}
function drawChart(id,values){
 const svg=el(id);if(!svg)return;
 const w=700,h=id==="analyticsChart"?260:230,L=43,R=12,T=16,B=24,pw=w-L-R,ph=h-T-B,max=Math.max(1,...values)*1.18;
 const pts=values.map((v,i)=>[L+i*pw/(values.length-1),T+ph-v/max*ph]);
 const path=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
 const area=path+" L "+pts[pts.length-1][0]+" "+(T+ph)+" L "+pts[0][0]+" "+(T+ph)+" Z";
 let grid="";
 for(let i=0;i<4;i++){const y=T+i*ph/3;grid+='<line x1="'+L+'" y1="'+y+'" x2="'+(w-R)+'" y2="'+y+'" stroke="#29394d" stroke-dasharray="4 5"/><text x="2" y="'+(y+4)+'" fill="#71839a" font-size="10">'+fmt(max*(1-i/3),1)+'</text>';}
 const circles=pts.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3" fill="#22d3ee" stroke="#111c2e" stroke-width="2"/>').join("");
 svg.innerHTML='<defs><linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#22d3ee" stop-opacity=".23"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#chartArea)"/><path d="'+path+'" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+circles;
}
function renderHistory(){
 const selected=el("historyDevice").value||"all";
 const rows=appState.history.filter(r=>selected==="all"||r.id===selected).slice().reverse().slice(0,100);
 el("historyRows").innerHTML=rows.map(r=>'<tr><td>'+r.time.toLocaleString("id-ID")+'</td><td class="device-name">'+escapeHtml(r.name)+'</td><td>'+fmt(r.voltage,1)+'</td><td>'+fmt(r.current,3)+'</td><td>'+fmt(r.power,1)+'</td><td>'+fmt(r.energy,3)+'</td><td>'+fmt(r.pf,2)+'</td></tr>').join("");
 el("historyCount").textContent=rows.length+" catatan ditampilkan";
}
function renderRealtime(){
 const d=appState.devices.find(x=>x.id===el("realtimeDevice").value)||appState.devices[0];
 const ids=["rtVoltage","rtCurrent","rtPower","rtEnergy","rtFrequency","rtPf"],keys=["voltage","current","power","energy","frequency","pf"],digits=[1,3,1,3,2,2];
 ids.forEach((id,i)=>el(id).textContent=fmt(d[keys[i]],digits[i]));
 el("rtStatus").textContent=d.status.toUpperCase();el("rtStatus").className="status "+d.status;
 const details=[["ID perangkat",d.id],["Lokasi",d.location],["Status",d.status.toUpperCase()],["Interval pembaruan",appState.interval+" detik"],["Waktu pembaruan",d.status==="online"?new Date().toLocaleString("id-ID"):"Tidak tersedia"],["Sumber data","Simulasi lokal"]];
 el("realtimeDetails").innerHTML=details.map(x=>'<div class="detail"><span>'+x[0]+'</span><b>'+escapeHtml(x[1])+'</b></div>').join("");
}
function renderAnalytics(){
 const d=appState.devices.find(x=>x.id===el("analyticsDevice").value)||appState.devices[0];
 el("analyticsEnergy").textContent=fmt(d.energy,3)+" kWh";
 el("analyticsPower").textContent=fmt(d.power,1)+" W";
 el("analyticsCost").textContent=money(d.energy*appState.tariff);
 drawChart("analyticsChart",Array.from({length:7},()=>d.energy*(.35+Math.random()*.9)));
}
function renderAll(){
 updateOverview();renderDevices();renderLatest();renderHistory();renderRealtime();renderAnalytics();
 drawChart("energyChart",[.12,.18,.16,.31,.28,.42,.37,.55,.49,.62,.51,.72,.68,.8,.64,.76,.9,.71,.83,.68,.74,.61,.52,.45]);
}
function simulatedTick(){
 appState.devices.forEach(d=>{
  if(d.status!=="online")return;
  d.voltage=219+Math.random()*3;
  d.current=Math.max(.05,d.current+(Math.random()-.5)*.12);
  d.pf=Math.min(.999,Math.max(.85,d.pf+(Math.random()-.5)*.015));
  d.power=d.voltage*d.current*d.pf;
  d.energy+=d.power/1000*(appState.interval/3600);
  d.frequency=49.9+Math.random()*.2;
  appState.history.push({...d,time:new Date()});
 });
 renderAll();
}
function restartTimer(){if(appState.timer)clearInterval(appState.timer);appState.timer=setInterval(simulatedTick,appState.interval*1000);}
function notify(message){const t=el("toast");t.textContent=message;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2500);}
function navigate(page){
 document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
 document.querySelectorAll(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));
 const names={dashboard:"Dashboard",realtime:"Real-time",analytics:"Analytics",history:"Riwayat Data",devices:"Perangkat",settings:"Pengaturan"};
 el("pageTitle").textContent=names[page]||"Dashboard";el("sidebar").classList.remove("open");
 if(page==="realtime")renderRealtime();if(page==="analytics")renderAnalytics();if(page==="history")renderHistory();
}
function exportCSV(){
 const header=["Waktu","ID","Perangkat","Tegangan_V","Arus_A","Daya_W","Energi_kWh","Frekuensi_Hz","Power_Factor"];
 const rows=appState.history.map(r=>[r.time.toISOString(),r.id,r.name,r.voltage,r.current,r.power,r.energy,r.frequency,r.pf]);
 const csv=[header,...rows].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");
 const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="energy-monitor-history.csv";a.click();URL.revokeObjectURL(url);
}
document.querySelectorAll(".nav-link").forEach(a=>a.addEventListener("click",()=>navigate(a.dataset.page)));
window.addEventListener("hashchange",()=>navigate(location.hash.slice(1)||"dashboard"));
el("menuBtn").addEventListener("click",()=>el("sidebar").classList.toggle("open"));
el("refreshBtn").addEventListener("click",()=>{simulatedTick();notify("Data simulasi diperbarui");});
el("realtimeDevice").addEventListener("change",renderRealtime);
el("analyticsDevice").addEventListener("change",renderAnalytics);
el("historyDevice").addEventListener("change",renderHistory);
el("exportBtn").addEventListener("click",exportCSV);
el("chartRange").addEventListener("change",e=>drawChart("energyChart",e.target.value==="week"?[.5,.8,.65,1.1,.9,1.3,.95]:[.12,.18,.16,.31,.28,.42,.37,.55,.49,.62,.51,.72,.68,.8,.64,.76,.9,.71,.83,.68,.74,.61,.52,.45]));
el("saveSettings").addEventListener("click",()=>{
 appState.tariff=Math.max(0,Number(el("tariffInput").value)||0);
 appState.interval=Math.max(1,Number(el("intervalInput").value)||60);
 el("settingsMessage").textContent="Pengaturan tersimpan.";
 restartTimer();renderAll();notify("Pengaturan berhasil disimpan");
});
el("addDeviceBtn").addEventListener("click",()=>{
 const name=prompt("Nama perangkat baru:");if(!name||!name.trim())return;
 const location=prompt("Lokasi perangkat:","Lokasi baru")||"Belum ditentukan";
 const id="EM-"+String(appState.devices.length+1).padStart(3,"0");
 appState.devices.push({id,name:name.trim(),location:location.trim(),status:"offline",voltage:0,current:0,power:0,energy:0,frequency:0,pf:0});
 deviceOptions();renderAll();notify("Perangkat simulasi ditambahkan");
});
el("todayLabel").textContent=new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
el("footerYear").textContent=new Date().getFullYear();
makeHistory();deviceOptions();renderAll();restartTimer();
