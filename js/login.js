(function(){
  const form=document.getElementById("loginForm");
  const message=document.getElementById("loginMessage");
  const notice=document.getElementById("backendNotice");
  const button=document.getElementById("loginButton");
  const apiBase=String((window.ENERGY_MONITOR_CONFIG||{}).API_BASE_URL||"").replace(/\\/$/,"");
  function showMessage(text,type){
    message.textContent=text;
    message.className="auth-message-box "+type+" show";
  }
  if(!apiBase){
    notice.textContent="Backend login belum dikonfigurasi. Dashboard tetap terkunci sampai alamat API autentikasi diatur.";
    notice.classList.add("show");
    button.disabled=true;
  }else{
    notice.classList.remove("show");
    fetch(apiBase+"/auth/me",{credentials:"include",headers:{"Accept":"application/json"}})
      .then(response=>{if(response.ok)window.location.replace("index.html");})
      .catch(()=>{});
  }
  document.getElementById("togglePassword").addEventListener("click",function(){
    const input=document.getElementById("password");
    const visible=input.type==="password";
    input.type=visible?"text":"password";
    this.textContent=visible?"Sembunyikan":"Lihat";
  });
  form.addEventListener("submit",async function(event){
    event.preventDefault();
    if(!apiBase){
      showMessage("Login belum dapat digunakan karena backend autentikasi belum tersedia. Minta administrator menyiapkan server API terlebih dahulu.","error");
      return;
    }
    button.disabled=true;button.textContent="Memeriksa akun...";
    message.classList.remove("show");
    try{
      const response=await fetch(apiBase+"/auth/login",{
        method:"POST",
        credentials:"include",
        headers:{"Content-Type":"application/json","Accept":"application/json"},
        body:JSON.stringify({
          email:document.getElementById("email").value.trim(),
          password:document.getElementById("password").value
        })
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.message||"Email atau password tidak valid.");
      const verify=await fetch(apiBase+"/auth/me",{credentials:"include",headers:{"Accept":"application/json"}});
      if(!verify.ok)throw new Error("Login diterima tetapi sesi belum dapat diverifikasi.");
      window.location.replace("index.html");
    }catch(error){
      showMessage(error.message||"Tidak dapat menghubungi server. Coba lagi.","error");
      button.disabled=false;button.textContent="Masuk ke Dashboard";
    }
  });
})();