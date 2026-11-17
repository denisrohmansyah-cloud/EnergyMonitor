(function(){
  const portal=window.EnergyMonitorPortal;
  function redirectToLogin(){
    if(portal)portal.clearSession();
    const target=new URL("login.html",window.location.href);
    window.location.replace(target.toString());
  }

  window.energyAuthReady=(async function(){
    if(!portal||!portal.getSessionToken()){
      redirectToLogin();
      throw new Error("Silakan login terlebih dahulu.");
    }
    try{
      const snapshot=await portal.request("dashboard",{
        sessionToken:portal.getSessionToken()
      });
      if(!snapshot||!snapshot.customer){
        throw new Error("Profil pelanggan tidak ditemukan.");
      }
      document.body.classList.remove("auth-pending");
      return snapshot;
    }catch(error){
      redirectToLogin();
      throw error;
    }
  })().catch(error=>{
    console.warn("Customer authentication required:",error.message);
    return new Promise(()=>{});
  });
})();