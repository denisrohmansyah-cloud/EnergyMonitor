const customer = {
  id:"CUS-0001",
  name:"Pelanggan Demo",
  email:"pelanggan@example.com",
  location:"Instalasi Utama",
  device:{
    id:"EM-001",name:"Energy Meter - Rumah",type:"ESP32 + Sensor Energi",
    location:"Instalasi Utama",status:"online",voltage:220.8,current:2.34,
    power:510.7,energyToday:3.284,energyTotal:184.296,
    frequency:50.02,pf:0.99,ip:"Belum dikonfigurasi",lastSeen:new Date()
  }
};
const tariffPerKwh = 1444.70;
const intervalSeconds = 60;
const history = [];
const $ = id => document.getElementById(id);
const fmt = (n,d=2) => Number(n||0).toLocaleString("id-ID",{minimumFractionDigits:d,maximumFractionDigits:d});
const rupiah = n => "Rp"+Math.round(n).toLocaleString("id-ID");
const d = customer.device;

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function makeHistory(){
  for(let i=0;i<24;i++){
    const shift=(Math.random()-.5);
    const voltage=220.8+shift*2.1;
    const current=Math.max(.1,2.34+shift*.18);
    const pf=Math.min(.999,Math.max(.9,.99+shift*.012));
    const power=voltage*current*pf;
    history.push({
      time:new Date(Date.now()-(23-i)*intervalSeconds*1000),
      voltage,current,power,
      energy:Math.max(0,d.energyToday-(23-i)*.002),
      frequency:50+shift*.08,pf
    });
  }
}
function updateHeader(){
  $("headerCustomer").textContent=customer.name;
  $("headerCustomerId").textContent=customer.id;
  $("sidebarDeviceId").textContent=d.id;
  $("deviceNameBanner").textContent=d.name;
  $("deviceMetaBanner").textContent=d.id+" · "+d.location;
  $("rtDeviceName").textContent=d.name;
  $("rtDeviceId").textContent=d.id;
  $("historyDeviceName").textContent=d.name;
  $("historyDeviceId").textContent=d.id;
  $("profileName").textContent=customer.name;
  $("profileEmail").textContent=customer.email;
  $("profileCustomerId").textContent=customer.id;
  $("profileCustomerName").textContent=customer.name;
  $("profileCustomerEmail").textContent=customer.email;
  $("profileLocation").textContent=customer.location;
  $("profileDeviceName").textContent=d.name;
  $("profileDeviceMeta").textContent=d.id+" · "+d.type;
  ["deviceStatusBanner","deviceStatusDetail","rtStatus","profileDeviceStatus"].forEach(id=>{
    $(id).textContent=d.status.toUpperCase();
    $(id).className="status-pill "+d.status;
  });
  $("lastUpdatedBanner").textContent="Pembaruan terakhir: "+d.lastSeen.toLocaleTimeString("id-ID");
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
  $("analyticsEnergy").textContent=fmt(d.energyToday*7,3)+" kWh";
  $("analyticsPower").textContent=fmt(d.power,1)+" W";
  $("analyticsCost").textContent=rupiah(d.energyToday*7*tariffPerKwh);
}
function updateDetails(){
  const info=[
    ["ID perangkat",d.id],["Jenis perangkat",d.type],["Lokasi pemasangan",d.location],
    ["Status koneksi",d.status.toUpperCase()],["Interval pembaruan",intervalSeconds+" detik"],
    ["Pembaruan terakhir",d.lastSeen.toLocaleString("id-ID")]
  ];
  $("deviceDetails").innerHTML=info.map(x=>'<div class="detail-item"><span>'+x[0]+'</span><b>'+escapeHtml(x[1])+'</b></div>').join("");
  $("realtimeDetails").innerHTML=info.map(x=>'<div class="detail"><span>'+x[0]+'</span><b>'+escapeHtml(x[1])+'</b></div>').join("");
}
function drawChart(id,values){
  const svg=$(id);if(!svg)return;
  const w=700,h=id==="analyticsChart"?260:230,L=43,R=12,T=15,B=22,pw=w-L-R,ph=h-T-B;
  const max=Math.max(...values,1)*1.2;
  const points=values.map((v,i)=>[L+i*pw/(values.length-1),T+ph-v/max*ph]);
  const path=points.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const area=path+" L "+points[points.length-1][0]+" "+(T+ph)+" L "+points[0][0]+" "+(T+ph)+" Z";
  let grid="";
  for(let i=0;i<4;i++){
    const y=T+i*ph/3;
    grid+='<line x1="'+L+'" y1="'+y+'" x2="'+(w-R)+'" y2="'+y+'" stroke="#29394d" stroke-dasharray="4 5"/><text x="2" y="'+(y+4)+'" fill="#71839a" font-size="10">'+fmt(max*(1-i/3),1)+'</text>';
  }
  const dots=points.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3" fill="#22d3ee" stroke="#111c2e" stroke-width="2"/>').join("");
  svg.innerHTML='<defs><linearGradient id="chartArea" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#22d3ee" stop-opacity=".23"/><stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#chartArea)"/><path d="'+path+'" fill="none" stroke="#22d3ee" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+dots;
}
function renderHistory(){
  $("historyRows").innerHTML=history.slice().reverse().map(r=>'<tr><td>'+r.time.toLocaleString("id-ID")+'</td><td>'+fmt(r.voltage,1)+'</td><td>'+fmt(r.current,3)+'</td><td>'+fmt(r.power,1)+'</td><td>'+fmt(r.energy,3)+'</td><td>'+fmt(r.frequency,2)+'</td><td>'+fmt(r.pf,2)+'</td></tr>').join("");
  $("historyCount").textContent=history.length+" catatan ditampilkan";
}
function renderAll(){
  updateHeader();updateMetrics();updateDetails();renderHistory();
  drawChart("energyChart",[.08,.11,.14,.17,.12,.19,.23,.28,.31,.25,.36,.39,.35,.48,.45,.51,.58,.55,.68,.62,.72,.76,.71,.82]);
  drawChart("analyticsChart",[1.9,2.2,2.05,2.6,2.35,2.9,3.1]);
}
function simulateUpdate(){
  if(d.status!=="online")return;
  d.voltage=219+Math.random()*3;
  d.current=Math.max(.05,d.current+(Math.random()-.5)*.12);
  d.pf=Math.min(.999,Math.max(.85,d.pf+(Math.random()-.5)*.012));
  d.power=d.voltage*d.current*d.pf;
  d.energyToday+=d.power/1000*(intervalSeconds/3600);
  d.energyTotal+=d.power/1000*(intervalSeconds/3600);
  d.frequency=49.9+Math.random()*.2;
  d.lastSeen=new Date();
  history.push({time:new Date(),voltage:d.voltage,current:d.current,power:d.power,energy:d.energyTotal,frequency:d.frequency,pf:d.pf});
  renderAll();
}
function showPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+page));
  document.querySelectorAll(".nav-link").forEach(a=>a.classList.toggle("active",a.dataset.page===page));
  const names={dashboard:"Dashboard",realtime:"Real-time",analytics:"Analitik Energi",history:"Riwayat Pengukuran",account:"Profil Pelanggan"};
  $("pageTitle").textContent=names[page]||"Dashboard";
  $("sidebar").classList.remove("open");
  if(page==="history")renderHistory();
}
function notify(message){
  const t=$("toast");t.textContent=message;t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),2500);
}
function exportCSV(){
  const header=["Waktu","Tegangan_V","Arus_A","Daya_W","Energi_kWh","Frekuensi_Hz","Power_Factor"];
  const rows=history.map(r=>[r.time.toISOString(),r.voltage,r.current,r.power,r.energy,r.frequency,r.pf]);
  const csv=[header,...rows].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="riwayat-"+d.id+".csv";a.click();URL.revokeObjectURL(url);
}
document.querySelectorAll(".nav-link").forEach(a=>a.addEventListener("click",()=>showPage(a.dataset.page)));
window.addEventListener("hashchange",()=>showPage(location.hash.slice(1)||"dashboard"));
$("menuBtn").addEventListener("click",()=>$("sidebar").classList.toggle("open"));
$("refreshBtn").addEventListener("click",()=>{simulateUpdate();notify("Data simulasi diperbarui");});
$("exportBtn").addEventListener("click",exportCSV);
$("todayLabel").textContent=new Date().toLocaleDateString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
$("footerYear").textContent=new Date().getFullYear();
makeHistory();renderAll();
setInterval(simulateUpdate,intervalSeconds*1000);
