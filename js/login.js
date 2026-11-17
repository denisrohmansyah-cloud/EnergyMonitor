(function(){
  const form=document.getElementById("loginForm");
  const message=document.getElementById("loginMessage");
  const notice=document.getElementById("backendNotice");
  const button=document.getElementById("loginButton");
  const portal=window.EnergyMonitorPortal;

  function showMessage(text,type){
    message.textContent=text;
    message.className="auth-message-box "+type+" show";
  }

  if(!window.ENERGY_MONITOR_CONFIG.APPS_SCRIPT_URL){
    notice.textContent="URL Google Apps Script belum dikonfigurasi.";
    notice.classList.add("show");
    button.disabled=true;
  }else{
    notice.classList.remove("show");
    if(portal&&portal.getSessionToken()){
      portal.request("dashboard",{sessionToken:portal.getSessionToken()})
        .then(()=>window.location.replace("index.html"))
        .catch(()=>portal.clearSession());
    }
  }

  document.getElementById("togglePassword").addEventListener("click",function(){
    const input=document.getElementById("password");
    const visible=input.type==="password";
    input.type=visible?"text":"password";
    this.textContent=visible?"Sembunyikan":"Lihat";
  });

  form.addEventListener("submit",async function(event){
    event.preventDefault();
    if(!portal){
      showMessage("Komponen komunikasi Google Apps Script belum dimuat.","error");
      return;
    }
    button.disabled=true;
    button.textContent="Memeriksa akun...";
    message.classList.remove("show");
    try{
      const result=await portal.request("login",{
        username:document.getElementById("username").value.trim().toLowerCase(),
        password:document.getElementById("password").value
      });
      if(!result||!result.sessionToken)throw new Error("Server tidak mengembalikan sesi login.");
      portal.setSessionToken(result.sessionToken);
      const dashboard=await portal.request("dashboard",{sessionToken:result.sessionToken});
      if(!dashboard||!dashboard.customer)throw new Error("Profil pelanggan tidak dapat diverifikasi.");
      window.location.replace("index.html");
    }catch(error){
      portal.clearSession();
      showMessage(error.message||"Username atau password tidak valid. Coba lagi.","error");
      button.disabled=false;
      button.textContent="Masuk ke Dashboard";
    }
  });
})();