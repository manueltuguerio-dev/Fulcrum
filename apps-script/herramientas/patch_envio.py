# -*- coding: utf-8 -*-
"""Envio de cotizaciones: plantillas editables, contactos por empresa,
tiempo de entrega y envio masivo individual que pasa a estatus enviada."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
ERP  = os.path.join(BASE, "erp.html")
APPJS= os.path.join(BASE, "appsscript", "AppJs.html")
INDEX= os.path.join(BASE, "appsscript", "Index.html")

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

# ============================================================ comun
OLD_COM = '''  /* ---------- vista previa del documento ---------- */'''
NEW_COM = '''  /* ---------- envío de cotizaciones por correo ---------- */
  // Variables disponibles en las plantillas.
  function ctxCot(c){
    const cli=state.clientes.find(x=>x.id===c.clienteId)
      ||state.clientes.find(x=>x.nombre&&c.cliente&&x.nombre.toLowerCase()===String(c.cliente).toLowerCase());
    const cons=contactosDe(cli);
    return {cot:c,cli:cli||null,cons,vars:{
      cliente:c.cliente||"",contacto:(cons[0]&&cons[0].nombre)||c.cliente||"",
      folio:c.folio||"",total:money(cotTotal(c)),vigencia:(+c.vigencia||0)+" días",
      entrega:c.entrega||"por confirmar",fecha:fmtDate(c.fecha),empresa:EMISOR.nombre}};
  }
  const aplicaVars=(txt,v)=>String(txt==null?"":txt).replace(/\\{\\{\\s*(\\w+)\\s*\\}\\}/g,(m,k)=>v[k]!=null?v[k]:m);

  function abrirEnvio(ids){
    const cots=state.cotizaciones.filter(c=>(ids||[]).indexOf(c.id)>=0);
    if(!cots.length){toast("Selecciona al menos una cotización");return;}
    const ctxs=cots.map(ctxCot);
    const plantillas=cat("plantillas");
    const tpl0=plantillas[0]||PLANTILLA_DEF;
    const uno=cots.length===1?ctxs[0]:null;
    const destino=x=>`<div class="mailrow" data-cid="${x.cot.id}">
      <label class="mailinc"><input type="checkbox" class="mi" checked> <span class="mono">${x.cot.folio}</span> · ${escAttr(x.cot.cliente||"")}</label>
      <div class="mailcons">${x.cons.length?x.cons.map((c,i)=>
        `<label class="conchk"><input type="checkbox" class="mc" data-mail="${escAttr(c.email)}" ${i===0?"checked":""}> ${escAttr(c.nombre||c.email)}${c.puesto?` <span class="cpu">${escAttr(c.puesto)}</span>`:""}</label>`).join("")
        :`<span class="sinmail">Este cliente no tiene contactos dados de alta</span>`}</div>
      <input class="mextra" placeholder="Otros correos separados por coma" value="">
    </div>`;
    const o=document.createElement("div");o.className="overlay on";
    o.innerHTML=`<div class="modal wide">
      <div class="modal-head"><h3>${cots.length===1?"Enviar cotización "+cots[0].folio:"Enviar "+cots.length+" cotizaciones"}</h3>
        <button type="button" aria-label="Cerrar" data-x>&times;</button></div>
      <form id="envform">
        <div class="field"><label>Destinatarios ${cots.length>1?'<span style="color:var(--text-faint);font-weight:400">· se envía un correo por cotización</span>':""}</label>
          <div class="checklist maillist">${ctxs.map(destino).join("")}</div></div>
        <div class="grid2">
          <div class="field"><label for="e-tpl">Plantilla</label>
            <select id="e-tpl">${plantillas.map((p,i)=>`<option value="${p.id}" ${i===0?"selected":""}>${escAttr(p.nombre)}</option>`).join("")}
              <option value="">— personalizada —</option></select></div>
          ${uno?`<div class="field"><label for="e-ent">Tiempo de entrega</label>
            <input id="e-ent" value="${escAttr(uno.cot.entrega||"")}" placeholder="Ej. 10 días hábiles"></div>`
            :`<div class="field"><label>Tiempo de entrega</label><input value="el de cada cotización" disabled></div>`}
        </div>
        <div class="field"><label for="e-sub">Asunto</label><input id="e-sub" value="${escAttr(tpl0.asunto||"")}"></div>
        <div class="field"><label for="e-body">Mensaje</label><textarea id="e-body" rows="9">${escAttr(tpl0.cuerpo||"")}</textarea>
          <p class="hintline" style="margin:4px 0 0">Variables: {{cliente}} {{contacto}} {{folio}} {{total}} {{vigencia}} {{entrega}} {{fecha}} {{empresa}} · las plantillas se administran en <b>Catálogos</b>.</p></div>
        <div class="field"><label>Vista previa <span style="color:var(--text-faint);font-weight:400">· ${escAttr(cots[0].folio)}</span></label>
          <div class="mailprev" id="e-prev"></div></div>
        <div class="pdfacts" style="padding:0">
          <span class="pdfhint" id="e-hint"></span>
          <button type="button" class="ghost" data-x2>Cancelar</button>
          <button type="submit" class="primary">${ENVIO_LABEL}</button>
        </div>
      </form></div>`;
    document.body.appendChild(o);
    const cerrar=()=>o.remove();
    o.addEventListener("click",e=>{if(e.target===o)cerrar();});
    o.querySelector("[data-x]").onclick=cerrar;
    o.querySelector("[data-x2]").onclick=cerrar;
    const selTpl=o.querySelector("#e-tpl"),sub_=o.querySelector("#e-sub"),body=o.querySelector("#e-body"),prev=o.querySelector("#e-prev");
    const entradaEnt=o.querySelector("#e-ent");
    const varsDe=x=>{const v=Object.assign({},x.vars);
      if(uno&&entradaEnt&&entradaEnt.value.trim())v.entrega=entradaEnt.value.trim();
      const marcados=[...o.querySelectorAll('.mailrow[data-cid="'+x.cot.id+'"] .mc:checked')];
      if(marcados.length){const c=x.cons.find(k=>k.email===marcados[0].dataset.mail);if(c&&c.nombre)v.contacto=c.nombre;}
      return v;};
    const pinta=()=>{const v=varsDe(ctxs[0]);
      prev.innerHTML=`<div class="mp-sub">${escAttr(aplicaVars(sub_.value,v))}</div><div class="mp-body">${escAttr(aplicaVars(body.value,v)).replace(/\\n/g,"<br>")}</div>`;};
    selTpl.addEventListener("change",()=>{const p=cat("plantillas").find(x=>x.id===selTpl.value);
      if(p){sub_.value=p.asunto||"";body.value=p.cuerpo||"";pinta();}});
    [sub_,body].forEach(el=>el.addEventListener("input",pinta));
    if(entradaEnt)entradaEnt.addEventListener("input",pinta);
    o.addEventListener("change",e=>{if(e.target.classList&&(e.target.classList.contains("mc")||e.target.classList.contains("mi")))pinta();});
    pinta();
    o.querySelector("#envform").addEventListener("submit",e=>{e.preventDefault();
      const items=[];const sinCorreo=[];
      ctxs.forEach(x=>{const fila=o.querySelector('.mailrow[data-cid="'+x.cot.id+'"]');
        if(!fila.querySelector(".mi").checked)return;
        const dirs=[...fila.querySelectorAll(".mc:checked")].map(el=>el.dataset.mail);
        String(fila.querySelector(".mextra").value||"").split(/[,;]+/).map(s=>s.trim()).filter(Boolean).forEach(m=>{if(dirs.indexOf(m)<0)dirs.push(m);});
        if(!dirs.length){sinCorreo.push(x.cot.folio);return;}
        const v=varsDe(x);
        items.push({cot:x.cot,to:dirs.join(", "),asunto:aplicaVars(sub_.value,v),cuerpo:aplicaVars(body.value,v)});});
      if(!items.length){toast(sinCorreo.length?"Sin destinatarios: "+sinCorreo.join(", "):"Marca al menos una cotización");return;}
      if(uno&&entradaEnt){uno.cot.entrega=entradaEnt.value.trim();}
      enviarCorreos(items,(enviados)=>{
        enviados.forEach(it=>{if(it.cot.estatus!=="aceptada"){it.cot.estatus="enviada";}it.cot.enviadaEl=todayStr();});
        ui.cotSel=[];persist();cerrar();render();
        toast(enviados.length===1?"Cotización "+enviados[0].cot.folio+" enviada":enviados.length+" cotizaciones enviadas"
          +(sinCorreo.length?" · sin correo: "+sinCorreo.join(", "):""));});
    });
    o.querySelector("#e-sub").focus();
  }

  /* ---------- vista previa del documento ---------- */'''

OLD_ACC = '''    else if(a==="cot-sel"){'''
NEW_ACC = '''    else if(a==="cot-enviar"){abrirEnvio([id]);}
    else if(a==="cot-enviar-sel"){abrirEnvio((ui.cotSel||[]).slice());}
    else if(a==="cot-sel"){'''

CSS_OLD = '''  .conhead,.crow{'''
CSS_NEW = '''  .maillist{max-height:220px}
  .mailrow{padding:8px 9px;border-bottom:1px solid var(--border)}
  .mailrow:last-child{border-bottom:0}
  .mailinc{font-size:13px;font-weight:550;display:flex;align-items:center;gap:8px}
  .mailcons{display:flex;flex-wrap:wrap;gap:6px 14px;margin:5px 0 6px 24px}
  .conchk{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:400;color:var(--text-dim)}
  .conchk .cpu{color:var(--text-faint);font-size:11px}
  .sinmail{font-size:12px;color:var(--bad)}
  .mailrow .mextra{margin-left:24px;width:calc(100% - 24px);padding:6px 9px;font-size:12.5px;
    background:var(--bg);border:1px solid var(--border);border-radius:7px;color:var(--text);font-family:inherit}
  .mailprev{background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:12px 14px;font-size:13px;color:var(--text-dim);
    max-height:220px;overflow:auto}
  .mailprev .mp-sub{font-weight:650;color:var(--text);margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid var(--border)}
  .mailprev .mp-body{line-height:1.6;white-space:normal}
  .conhead,.crow{'''

# ============================================================ artefacto
ERP_OLD = '''  /* ---------- envío de cotizaciones por correo ---------- */'''
ERP_NEW = '''  // En el artefacto no hay servidor de correo: se prepara el mensaje y se abre el
  // cliente de correo del equipo; el PDF se descarga aparte desde el botón PDF.
  const ENVIO_LABEL="Preparar y marcar como enviadas";
  function enviarCorreos(items,onDone){
    const texto=items.map(it=>"Para: "+it.to+"\\nAsunto: "+it.asunto+"\\n\\n"+it.cuerpo).join("\\n\\n———\\n\\n");
    const abrir=()=>{const it=items[0];
      const url="mailto:"+encodeURIComponent(it.to)+"?subject="+encodeURIComponent(it.asunto)+"&body="+encodeURIComponent(it.cuerpo);
      try{window.open(url,"_blank");}catch(e){}};
    const seguir=()=>{abrir();onDone(items);};
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(texto).then(seguir,seguir);
    else seguir();
  }

  /* ---------- envío de cotizaciones por correo ---------- */'''

# ============================================================ apps script
GAS_OLD = '''  /* ---------- envío de cotizaciones por correo ---------- */'''
GAS_NEW = '''  // Envío real: un correo por cotización, con su PDF adjunto.
  const ENVIO_LABEL="Enviar ahora";
  function enviarCorreos(items,onDone){
    if(!pdfReady()){toast("Generador de PDF no disponible");return;}
    const enviados=[],fallos=[];
    toast("Enviando "+items.length+" correo(s)…");
    const paso=i=>{
      if(i>=items.length){
        if(fallos.length)toast("No se pudieron enviar: "+fallos.join(", "));
        if(enviados.length)onDone(enviados);
        return;}
      const it=items[i];
      let b64="";
      try{const d=salesPDF(specCotizacion(it.cot));const u=d.output("datauristring");b64=u.substring(u.indexOf(",")+1);}
      catch(e){fallos.push(it.cot.folio);paso(i+1);return;}
      google.script.run
        .withSuccessHandler(()=>{enviados.push(it);paso(i+1);})
        .withFailureHandler(()=>{fallos.push(it.cot.folio);paso(i+1);})
        .emailPdf(it.to,it.asunto,it.cuerpo,it.cot.folio+".pdf",b64);
    };
    paso(0);
  }

  /* ---------- envío de cotizaciones por correo ---------- */'''

for path, esp_old, esp_new in [(ERP, ERP_OLD, ERP_NEW), (APPJS, GAS_OLD, GAS_NEW)]:
    t = io.open(path, encoding="utf-8").read()
    t = sub(t, OLD_COM, NEW_COM, "modal de envio " + os.path.basename(path))
    t = sub(t, esp_old, esp_new, "transporte " + os.path.basename(path))
    t = sub(t, OLD_ACC, NEW_ACC, "acciones " + os.path.basename(path))
    io.open(path, "w", encoding="utf-8").write(t)
    print("JS:", os.path.basename(path))

for p in [ERP, INDEX]:
    t = io.open(p, encoding="utf-8").read()
    io.open(p, "w", encoding="utf-8").write(sub(t, CSS_OLD, CSS_NEW, "css " + os.path.basename(p)))
    print("CSS:", os.path.basename(p))
