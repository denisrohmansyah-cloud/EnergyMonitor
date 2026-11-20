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

  function request(action,data){
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

    const payload=Object.assign({},data||{},{
      action:action,
      requestId:requestId
    });
    const fields={
      em_payload:JSON.stringify(payload),
      em_origin:window.location.origin
    };
    Object.keys(fields).forEach(name=>{
      const input=document.createElement("input");
      input.type="hidden";
      input.name=name;
      input.value=fields[name];
      form.appendChild(input);
    });

    return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{
        window.removeEventListener("message",onMessage);
        window.clearTimeout(timer);
        form.remove();
        frame.remove();
      };
      const finish=(callback,value)=>{
        if(settled)return;
        settled=true;
        cleanup();
        callback(value);
      };
      const onMessage=event=>{
        // HtmlService may execute the returned document in a nested sandbox
        // iframe. Do not require event.source === frame.contentWindow.
        const origin=String(event.origin||"");
        const fromGoogle=origin==="https://script.google.com" ||
          origin==="https://script.googleusercontent.com" ||
          origin.endsWith(".script.googleusercontent.com") ||
          origin.endsWith(".googleusercontent.com");
        if(!fromGoogle)return;

        const message=event.data;
        if(!message||message.channel!=="ENERGY_MONITOR_PORTAL"||message.requestId!==requestId)return;

        const result=message.result;
        if(!result||result.ok!==true){
          finish(reject,new Error(result&&result.message?result.message:"Permintaan ke Google Apps Script gagal."));
          return;
        }
        finish(resolve,result.data);
      };
      const timer=window.setTimeout(()=>{
        finish(reject,new Error(
          "Tidak menerima balasan dari Apps Script. Pastikan Code.gs terbaru sudah di-deploy sebagai Web app, " +
          "Execute as: Me, Who has access: Anyone. Buka URL /exec langsung untuk mengecek status deployment."
        ));
      },45000);

      window.addEventListener("message",onMessage);
      document.body.appendChild(frame);
      document.body.appendChild(form);
      // Submit immediately. Waiting for the initial about:blank iframe load
      // can leave the request unsent in some browsers.
      try{
        form.submit();
      }catch(error){
        finish(reject,new Error("Form tidak dapat dikirim ke Google Apps Script: "+error.message));
      }
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