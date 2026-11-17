(function(){
  const config=window.ENERGY_MONITOR_CONFIG||{};
  const apiBase=String(config.API_BASE_URL||"").replace(/\/+$/, "");
  function redirectToLogin(){
    const loginUrl=new URL("login.html",window.location.href);
    window.location.replace(loginUrl.toString());
  }
  window.energyAuthReady=(async function(){
    if(!apiBase){
      redirectToLogin();
      throw new Error("Backend API belum dikonfigurasi.");
    }
    const response=await fetch(apiBase+"/auth/me",{
      method:"GET",
      credentials:"include",
      headers:{"Accept":"application/json"}
    });
    if(!response.ok){
      redirectToLogin();
      throw new Error("Sesi tidak ditemukan atau sudah berakhir.");
    }
    const payload=await response.json();
    const user=payload.user||payload.customer||payload;
    if(!user||typeof user!=="object")throw new Error("Respons autentikasi tidak valid.");
    window.energyCsrfToken=user.csrfToken||payload.csrfToken||"";
    document.body.classList.remove("auth-pending");
    return user;
  })().catch(error=>{
    console.warn("Authentication required:",error.message);
    if(window.location.pathname.endsWith("/index.html")||window.location.pathname.endsWith("/")){
      redirectToLogin();
    }
    return new Promise(()=>{});
  });
})();