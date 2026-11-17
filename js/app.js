const intervalSeconds=60;
const history=[];
let customer={id:"",name:"Pelanggan",email:"",location:"-",device:null};
let tariffPerKwh=0;
let d={id:"",name:"Belum ada alat terdaftar",type:"ESP32 + Sensor Energi",location:"-",status:"offline",voltage:0,current:0,power:0,energyToday:0,energyTotal:0,frequency:0,pf:0,lastSeen:new Date(0)};
const $=id=>document.getElementById(id);
const fmt=(n,decimals=2)=>Number(n||0).toLocaleString("id-ID",{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
const rupiah=n=>"Rp"+Math.round(Number(n||0)).toLocaleString("id-ID");

function escapeHtml(value){
  return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function validDate(value){
  const date=value?new Date(value):null;
  return date&&!Number.isNaN(date.getTime())?date:null;
}
function updateHeader(){
  $("headerCustomer").textContent=customer.name;
  $("headerCustomerId").textContent=customer.id;
  $("sidebarDeviceId").textContent=d.id||"Belum ditautkan";
  $("deviceNameBanner").textContent=d.name;
  $("deviceMetaBanner").textContent=(d.id||"Tanpa ID")+" · "+d.location;
  $("rtDeviceName").textContent=d.name;
  $("rtDeviceId").textContent=d.id||"Belum ditautkan";
  $("historyDeviceName").textContent=d.name;
  $("historyDeviceId").textContent=d.id||"Belum ditautkan";
  $("profileName").textContent=customer.name;
  $("profileEmail").textContent=customer.email||"Email tidak tersedia";
  $("profileCustomerId").textContent=customer.id;
  $("profileCustomerName").textContent=customer.name;
  $("profileCustomerEmail").textContent=customer.email||"-";
  $("profileLocation").textContent=customer.location;
  $("profileDeviceName").textContent=d.name;
  $("profileDeviceMeta").textContent=(d.id||"-")+" · "+d.type;
  const status=d.status==="online"?"online":"offline";
  ["deviceStatusBanner","deviceStatusDetail","rtStatus","profileDeviceStatus"].forEach(id=>{
    $(id).textContent=status.toUpperCase();
    $(id).className="status-pill "+status;
  });
  $("lastUpdatedBanner").textContent="Pembaruan terakhir: "+(d.lastSeen.getTime()>0?d.lastSeen.toLocaleTimeString("id-ID"):"Belum ada pengukuran");
}
function calculateDailyUsage(){
  const result=Array(7).fill(0);
  const days=[];
  for(let i=6;i>=0;i--){
    const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-i);days.push(date);
  }
  const rows=history.slice().sort((a,b)=>a.time-b.time);
  for(let i=1;i<rows.length;i++){
    const prev=rows[i-1],current=rows[i];
    const delta=Number(current.energy||0)-Number(prev.energy||0);
    if(delta<0)continue;
    const dayIndex=days.findIndex(day=>day.toDateString()===current.time.toDateString());
    if(dayIndex>=0)result[dayIndex]+=delta;
  }
  return result;
}
function calculateHourlyUsage(){
  const result=Array(24).fill(0);
  const today=new Date().toDateString();
  const rows=history.slice().sort((a,b)=>a.time-b.time);
  for(let i=1;i<rows.length;i++){
    const prev=rows[i-1],current=rows[i];
    if(current.time.toDateString()!==today)continue;
    const delta=Number(current.energy||0)-Number(prev.energy||0);
    if(delta>=0)result[current.time.getHours()]+=delta;
  }
  return result;
}
function updateMetrics(){
  $("voltage").textContent=fmt(d.voltage,1);
  $("current").textContent=fmt(d.current,3);
  $("power").textContent=fmt(d.power,1);
  $("energyToday").textContent=fmt(d.energyToday,3);
  $("frequency").textContent=fmt(d.frequency,2);
  $("pf").textContent=fmt(d.pf,2);
  $("estimatedCost").textContent=rupiah(d.energyToday*tariffPerKwh);
  $("summaryToday").textContent=fmt(d.energyToday,3)+" kWh";
  $("summaryTotal").textContent=fmt(d.energyTotal,3)+" kWh";
  $("summaryTariff").textContent=rupiah(tariffPerKwh);
  $("rtVoltage").textContent=fmt(d.voltage,1);
  $("rtCurrent").textContent=fmt(d.current,3);
  $("rtPower").textContent=fmt(d.power,1);
  $("rtEnergy").textContent=fmt(d.energyTotal,3);
  $("rtFrequency").textContent=fmt(d.frequency,2);
  $("rtPf").textContent=fmt(d.pf,2);
  const daily=calculateDailyUsage();
  const weeklyEnergy=daily.reduce((sum,value)=>sum+value,0);
  $("analyticsEnergy").textContent=fmt(weeklyEnergy,3)+" kWh";
  $("analyticsPower").textContent=fmt(d.power,1)+" W";
  $("analyticsCost").textContent=rupiah(weeklyEnergy*tariffPerKwh);
}
function updateDetails(){
  const lastSeen=d.lastSeen.getTime()>0?d.lastSeen.toLocaleString("id-ID"):"Belum ada data";
  const info=[
    ["ID perangkat",d.id||"Belum ditautkan"],
    ["Jenis perangkat",d.type],
    ["Lokasi pemasangan",d.location],
    ["Status koneksi",d.status.toUpperCase()],
    ["Interval pembaruan",intervalSeconds+" detik"],
    ["Pembaruan terakhir",lastSeen]
  ];
  $("deviceDetails").innerHTML=info.map(([label,value])=>'<div class="detail-item"><span>'+label+'</span><b>'+escapeHtml(value)+'</b></div>').join("");
  $("realtimeDetails").innerHTML=info.map(([label,value])=>'<div class="detail"><span>'+label+'</span><b>'+escapeHtml(value)+'</b></div>').join("");
}
function drawChart(id,values){
  const svg=$(id);if(!svg)return;
  if(!values.length)values=[0,0];
  const w=700,h=id==="analyticsChart"?260:230,L=43,R=12,T=15,B=22,pw=w-L-R,ph=h-T-B;
  const max=Math.max(...values,0.001)*1.2;
  const points=values.map((value,index)=>[L+index*pw/Math.max(1,values.length-1),T+ph-(value/max)*ph]);
  const path=points.map((point,index)=>(index?"L":"M")+point[0].toFixed(1)+" "+point[1].toFixed(1)).join(" ");
  const area=path+" L "+points[points.length-1][0]+" "+(T+ph)+" L "+points[0][0]+" "+(T+ph)+" Z";
  let grid="";
  for(let i=0;i<4;i++){
    const y=T+i*ph/3;
    grid+='<line x1="'+L+'" y1="'+y+'" x2="'+(w-R)+'" y2="'+y+'" stroke="#29394d" stroke-dasharray="4 5"/><text x="2" y="'+(y+4)+'" fill="#71839a" font-size="10">'+fmt(max*(1-i/3),3)+'</text>';
  }
  const dots=points.map(point=>'<circle cx="'+point[0]+'" cy="'+point[1]+'" r="3" fill="#22d3ee" stroke="#111c2e" stroke-width="2"/>').join("");
  svg.innerHTML='<defs><linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#22d3ee" stop-opacity=".23"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#chartArea)"/><path d="'+path+'" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+dots;
}
function renderHistory(){
  $("historyRows").innerHTML=history.slice().sort((a,b)=>b.time-a.time).map(row=>'<tr><td>'+row.time.toLocaleString("id-ID")+'</td><td>'+fmt(row.voltage,1)+'</td><td>'+fmt(row.current,3)+'</td><td>'+fmt(row.power,1)+'</td><td>'+fmt(row.energy,3)+'</td><td>'+fmt(row.frequency,2)+'</td><td>'+fmt(row.pf,2)+'</td></tr>').join("");
  $("historyCount").textContent=history.length+" catatan ditampilkan";
}
function renderAll(){
  updateHeader();updateMetrics();updateDetails();renderHistory();
  drawChart("energyChart",calculateHourlyUsage());
  drawChart("analyticsChart",calculateDailyUsage());
}
async function apiGet(path){
  const apiBase=String(window.ENERGY_MONITOR_CONFIG.API_BASE_URL||"").replace(/\/+$/,"");
  const response=await fetch(apiBase+path,{method:"GET",credentials:"include",headers:{"Accept":"application/json"}});
  const payload=await response.json().catch(()=>({}));
  if(response.status===401){window.location.replace("login.html");throw new Error("Sesi berakhir. Silakan login kembali.");}
  if(!response.ok||payload.ok!==true)throw new Error(payload.message||"Gagal mengambil data dari server.");
  return payload.data;
}
function applyDashboardSnapshot(snapshot){
  const account=snapshot.customer||{},device=snapshot.device||{},latest=snapshot.latestMeasurement||{};
  const lastSeen=validDate(device.last_seen)||validDate(latest.time)||new Date(0);
  const deviceId=device.device_id||"";
  const noDevice=!deviceId;
  customer={
    id:account.customer_id||"",
    name:account.full_name||"Pelanggan",
    email:account.email||"",
    location:account.location||device.location||"-",
    device:{
      id:deviceId,
      name:device.device_name||(noDevice?"Belum ada alat terdaftar":"Energy Monitor"),
      type:device.device_type||"ESP32 + Sensor Energi",
      location:device.location||account.location||"-",
      status:noDevice?"offline":(device.status||"offline"),
      voltage:Number(latest.voltage??device.voltage??0),
      current:Number(latest.current??device.current??0),
      power:Number(latest.power??device.power??0),
      energyToday:Number(snapshot.energyTodayKwh||0),
      energyTotal:Number(latest.energy??device.energy_total??0),
      frequency:Number(latest.frequency??device.frequency??0),
      pf:Number(latest.pf??device.power_factor??0),
      ip:"Tidak tersedia",
      lastSeen
    }
  };
  d=customer.device;
  tariffPerKwh=Number(account.tariff_per_kwh||0);
}
async function loadHistory(){
  const result=await apiGet("/history?limit=12000");
  const records=Array.isArray(result.records)?result.records:[];
  const normalized=records.map(row=>({
    time:validDate(row.time)||new Date(0),
    voltage:Number(row.voltage||0),
    current:Number(row.current||0),
    power:Number(row.power||0),
    energy:Number(row.energy||0),
    frequency:Number(row.frequency||0),
    pf:Number(row.pf||0)
  })).filter(row=>row.time.getTime()>0).sort((a,b)=>a.time-b.time);
  history.splice(0,history.length,...normalized);
}
function notify(message){
  const toast=$("toast");toast.textContent=message;toast.classList.add("show");
  window.setTimeout(()=>toast.classList.remove("show"),2600);
}
async function refreshCustomerData(includeHistory=false){
  try{
    const apiBase=String(window.ENERGY_MONITOR_CONFIG.API_BASE_URL||"").replace(/\/+$/, "");
    const response=await fetch(apiBase+"/dashboard",{credentials:"include",headers:{"Accept":"application/json"}});
    const payload=await response.json().catch(()=>({}));
    if(response.status===401){window.location.replace("login.html");return;}
    if(!response.ok||payload.ok!==true)throw new Error(payload.message||"Gagal memperbarui dashboard.");
    applyDashboardSnapshot(payload.data);
    if(includeHistory)await loadHistory();
    renderAll();
  }catch(error){
    console.error("Refresh dashboard failed:",error);
    notify("Data belum dapat diperbarui. Periksa koneksi server.");
  }
}
function showPage(page){
  document.querySelectorAll(".page").forEach(section=>section.classList.toggle("active",section.id==="page-"+page));
  document.querySelectorAll(".nav-link").forEach(link=>link.classList.toggle("active",link.dataset.page===page));
  const titles={dashboard:"Dashboard",realtime:"Real-time",analytics:"Analitik Energi",history:"Riwayat Pengukuran",account:"Profil Pelanggan"};
  $("pageTitle").textContent=titles[page]||"Dashboard";
  $("sidebar").classList.remove("open");
  if(page==="history"||page==="analytics"){
    loadHistory().then(renderAll).catch(error=>{console.error(error);notify("Riwayat belum dapat dimuat.");});
  }
}
function exportCSV(){
  const header=["Waktu","Tegangan_V","Arus_A","Daya_W","Energi_kWh","Frekuensi_Hz","Power_Factor"];
  const rows=history.map(row=>[row.time.toISOString(),row.voltage,row.current,row.power,row.energy,row.frequency,row.pf]);
  const csv=[header,...rows].map(row=>row.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),anchor=document.createElement("a");
  anchor.href=url;anchor.download="riwayat-"+(d.id||"perangkat")+".csv";anchor.click();URL.revokeObjectURL(url);
}
document.querySelectorAll(".nav-link").forEach(link=>link.addEventListener("click",()=>showPage(link.dataset.page)));
window.addEventListener("hashchange",()=>showPage(location.hash.slice(1)||"dashboard"));
$("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("refreshBtn").addEventListener("click",()=>refreshCustomerData(true));
$("exportBtn").addEventListener("click",exportCSV);
$("todayLabel").textContent=new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
$("footerYear").textContent=new Date().getFullYear();

async function startCustomerDashboard(){
  const user=await window.energyAuthReady;
  applyDashboardSnapshot({
    customer:user.customer||user,
    device:user.device||null,
    latestMeasurement:user.latestMeasurement||null,
    energyTodayKwh:user.energyTodayKwh||0
  });
  await loadHistory();
  renderAll();
  window.setInterval(refreshCustomerData,intervalSeconds*1000);
  window.setInterval(()=>loadHistory().then(renderAll).catch(error=>console.error("History refresh failed:",error)),300000);
  $("logoutBtn").addEventListener("click",async()=>{
    const apiBase=String(window.ENERGY_MONITOR_CONFIG.API_BASE_URL||"").replace(/\/+$/,"");
    try{
      await fetch(apiBase+"/auth/logout",{
        method:"POST",credentials:"include",
        headers:{"Accept":"application/json","X-CSRF-Token":window.energyCsrfToken||""}
      });
    }catch(error){console.warn("Logout request failed",error);}
    window.location.replace("login.html");
  });
}
startCustomerDashboard().catch(error=>{
  console.error("Unable to start customer dashboard",error);
  window.location.replace("login.html");
});
