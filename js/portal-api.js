(function(){
  const config=window.ENERGY_MONITOR_CONFIG||{};
  const sessionKey="energy_monitor_portal_session";
  const timeoutMs=30000;

  function getSessionToken(){
    try{return sessionStorage.getItem(sessionKey)||"";}catch(error){return "";}
  }
  function setSessionToken(value){
    try{
      if(value)sessionStorage.setItem(sessionKey,String(value));
      else sessionStorage.removeItem(sessionKey);
    }catch(error){
      throw new Error("Browser tidak dapat menyimpan sesi. Pastikan penyimpanan sesi diizinkan.");
    }
  }
  function makeRequestId(){
    const bytes=new Uint8Array(24);
    if(!window.crypto||!window.crypto.getRandomValues)throw new Error("Browser tidak mendukung generator token aman.");
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes).map(value=>value.toString(16).padStart(2,"0")).join("");
  }

  function ping(){
    const endpoint=String(config.APPS_SCRIPT_URL||"").trim();
    if(!endpoint||!/^https:\/\/script\.google\.com\/macros\/s\//.test(endpoint)){
      return Promise.reject(new Error("URL Google Apps Script belum dikonfigurasi di js/config.js."));
    }
    const requestId=makeRequestId();
    return new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      let settled=false;
      const cleanup=()=>{
        window.clearTimeout(timer);
        script.remove();
        if(window.EnergyMonitorPortalPingCallback===callback){
          delete window.EnergyMonitorPortalPingCallback;
        }
      };
      const finish=(fn,value)=>{
        if(settled)return;
        settled=true;cleanup();fn(value);
      };
      const callback=message=>{
        if(!message||message.channel!=="ENERGY_MONITOR_PING"||message.requestId!==requestId)return;
        if(!message.result||message.result.ok!==true){
          finish(reject,new Error(message.result&&message.result.message||"Health check Apps Script gagal."));
          return;
        }
        finish(resolve,message.result);
      };
      window.EnergyMonitorPortalPingCallback=callback;
      script.onerror=()=>{
        finish(reject,new Error("Gagal memuat endpoint Apps Script. Periksa URL deployment dan izin akses Anyone."));
      };
      const timer=window.setTimeout(()=>{
        finish(reject,new Error("Health check JSONP tidak dibalas. Deploy Code.gs versi github-pages-apps-script-v3 terlebih dahulu."));
      },20000);
      script.src=endpoint+"?em_ping=1&requestId="+encodeURIComponent(requestId)+"&_="+Date.now();
      document.head.appendChild(script);
    });
  }

  function request(action,data){
    if(action==="ping")return ping();

    const endpoint=String(config.APPS_SCRIPT_URL||"").trim();
    if(!endpoint||!/^https:\/\/script\.google\.com\/macros\/s\//.test(endpoint)){
      return Promise.reject(new Error("URL Google Apps Script belum dikonfigurasi di js/config.js."));
    }

    const requestId=makeRequestId();
    const frameName="em_portal_frame_"+requestId;
    const frame=document.createElement("iframe");
    frame.name=frameName;
    frame.title="Energy Monitor API";
    frame.setAttribute("aria-hidden","true");
    frame.tabIndex=-1;
    frame.style.cssText="position:absolute;width:1px;height:1px;left:-9999px;border:0";

    const form=document.createElement("form");
    form.method="POST";
    form.action=endpoint;
    form.target=frameName;
    form.acceptCharset="UTF-8";
    form.style.display="none";

    const payload=Object.assign({},data||{},{action:action,requestId:requestId});
    const fields={em_payload:JSON.stringify(payload),em_origin:window.location.origin};
    Object.keys(fields).forEach(name=>{
      const input=document.createElement("input");
      input.type="hidden";input.name=name;input.value=fields[name];form.appendChild(input);
    });

    return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{
        window.removeEventListener("message",onMessage);
        window.clearTimeout(timer);
        form.remove();frame.remove();
      };
      const finish=(fn,value)=>{
        if(settled)return;
        settled=true;cleanup();fn(value);
      };
      const onMessage=event=>{
        const message=event.data;
        if(!message||message.channel!=="ENERGY_MONITOR_PORTAL"||message.requestId!==requestId)return;

        // Google HtmlService may report an opaque sandbox origin ("null").
        // The unpredictable 192-bit request ID still binds this response to
        // the exact outstanding request. Reject unexpected ordinary origins.
        const origin=String(event.origin||"");
        const knownGoogle=origin==="null" ||
          origin==="https://script.google.com" ||
          origin==="https://script.googleusercontent.com" ||
          origin.endsWith(".script.googleusercontent.com") ||
          origin.endsWith(".googleusercontent.com");
        if(!knownGoogle){
          finish(reject,new Error("Respons Apps Script berasal dari origin yang tidak dikenal: "+origin));
          return;
        }

        const result=message.result;
        if(!result||result.ok!==true){
          finish(reject,new Error(result&&result.message?result.message:"Permintaan ke Google Apps Script gagal."));
          return;
        }
        finish(resolve,result.data);
      };
      const timer=window.setTimeout(()=>{
        finish(reject,new Error(
          "Apps Script tidak mengirim balasan POST. Pastikan deployment memakai Code.gs terbaru " +
          "dan cek apakah browser memblokir Web App saat dibuka di iframe."
        ));
      },45000);
      window.addEventListener("message",onMessage);
      document.body.appendChild(frame);
      document.body.appendChild(form);
      try{form.submit();}
      catch(error){finish(reject,new Error("Form tidak dapat dikirim ke Apps Script: "+error.message));}
    });
  }

  window.EnergyMonitorPortal={
    request:request,
    getSessionToken:getSessionToken,
    setSessionToken:setSessionToken,
    clearSession:function(){setSessionToken("");},
    sessionKey:sessionKey
  };
})();