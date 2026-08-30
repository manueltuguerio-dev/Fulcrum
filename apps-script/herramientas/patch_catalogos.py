# -*- coding: utf-8 -*-
"""Catalogos configurables + contactos por cliente."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS  = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]
CSS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "Index.html")]

def sub(txt, old, new, tag, veces=1):
    n = txt.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias (esperaba %d)" % (tag, n, veces))
    return txt.replace(old, new)

# ------------------------------------------------ 1) definicion de catalogos
OLD_COLL = '''  const COLL={cotizacion:"cotizaciones",'''
NEW_COLL = '''  /* ---------- catálogos configurables ---------- */
  // Cada catálogo se administra desde el módulo «Catálogos» y alimenta los formularios.
  const CATS=[
    {k:"unidades",label:"Unidades de medida",sing:"unidad",cols:["clave","nombre","decimales"],
      campos:[{k:"clave",label:"Clave",ph:"PZ",req:true},{k:"nombre",label:"Nombre",ph:"Pieza"},
        {k:"decimales",label:"Decimales permitidos",tipo:"num",v:0,ayuda:"0 = solo enteros · 2 o 3 para kilos, metros, horas…"}]},
    {k:"analiticas",label:"Líneas analíticas",sing:"línea analítica",cols:["nombre","nota"],
      campos:[{k:"nombre",label:"Nombre",ph:"MANTENIMIENTO",req:true},{k:"nota",label:"Descripción",ph:"Centro de costo"}]},
    {k:"impuestos",label:"Impuestos y retenciones",sing:"impuesto",cols:["concepto","tasa"],
      campos:[{k:"concepto",label:"Concepto",ph:"Retención ISR",req:true},{k:"tasa",label:"Tasa %",tipo:"num",v:0}]},
    {k:"metodosPago",label:"Métodos de pago",sing:"método de pago",cols:["nombre"],
      campos:[{k:"nombre",label:"Nombre",ph:"Transferencia",req:true}]},
    {k:"motivosRechazo",label:"Motivos de rechazo",sing:"motivo",cols:["nombre"],
      campos:[{k:"nombre",label:"Motivo",ph:"Precio fuera de mercado",req:true}]},
    {k:"plantillas",label:"Plantillas de correo",sing:"plantilla",cols:["nombre","asunto"],
      campos:[{k:"nombre",label:"Nombre",ph:"Envío de cotización",req:true},
        {k:"asunto",label:"Asunto",ph:"Cotización {{folio}} · {{empresa}}"},
        {k:"cuerpo",label:"Mensaje",tipo:"area",ph:"Estimado…",
          ayuda:"Variables: {{cliente}} {{contacto}} {{folio}} {{total}} {{vigencia}} {{entrega}} {{fecha}} {{empresa}}"}]},
    {k:"conceptos",label:"Conceptos / productos",sing:"concepto",cols:["desc","unidad","costo"],
      campos:[{k:"desc",label:"Descripción",ph:"Bomba centrífuga 40 HP",req:true},
        {k:"unidad",label:"Unidad",ph:"PZ"},{k:"analitica",label:"Analítica",ph:""},
        {k:"costo",label:"Costo sugerido",tipo:"num",v:0}]},
  ];
  const UNIDADES_DEF=[["PZ","Pieza",0],["SERV","Servicio",0],["LOT","Lote",0],["KG","Kilogramo",3],["TON","Tonelada",3],
    ["MTR","Metro",2],["M2","Metro cuadrado",2],["M3","Metro cúbico",2],["LT","Litro",2],["HR","Hora",2],
    ["DIA","Día",0],["CAJA","Caja",0],["JGO","Juego",0],["ROLLO","Rollo",0]];
  const PLANTILLA_DEF={nombre:"Envío de cotización",asunto:"Cotización {{folio}} · {{empresa}}",
    cuerpo:"Estimado(a) {{contacto}}:\\n\\nPor este medio le envío la cotización {{folio}} por un total de {{total}}.\\n\\n"
      +"Tiempo de entrega: {{entrega}}\\nVigencia de la oferta: {{vigencia}}\\n\\n"
      +"Quedo atento a cualquier comentario.\\n\\nSaludos cordiales,\\n{{empresa}}"};
  function catalogosDefault(s){
    if(!s.catalogos||typeof s.catalogos!=="object")s.catalogos={};
    const c=s.catalogos;
    CATS.forEach(x=>{if(!Array.isArray(c[x.k]))c[x.k]=[];});
    if(!c.unidades.length)c.unidades=UNIDADES_DEF.map(u=>({id:uid(),clave:u[0],nombre:u[1],decimales:u[2]}));
    if(!c.impuestos.length)c.impuestos=[{id:uid(),concepto:"Retención ISR",tasa:1.25},{id:uid(),concepto:"Retención IVA",tasa:10.6667}];
    if(!c.metodosPago.length)c.metodosPago=["Transferencia","Cheque","Efectivo","Tarjeta"].map(n=>({id:uid(),nombre:n}));
    if(!c.motivosRechazo.length)c.motivosRechazo=["Precio fuera de mercado","Tiempo de entrega","Se eligió a otro proveedor",
      "Proyecto cancelado","Sin presupuesto"].map(n=>({id:uid(),nombre:n}));
    if(!c.plantillas.length)c.plantillas=[Object.assign({id:uid()},PLANTILLA_DEF)];
    // Los clientes guardan sus contactos; se respeta el campo antiguo de correos.
    (s.clientes||[]).forEach(cl=>{if(!Array.isArray(cl.contactos))cl.contactos=[];});
    return s;
  }
  const cat=k=>((state.catalogos||{})[k]||[]);
  const unidadesCat=()=>{const u=cat("unidades").map(x=>String(x.clave||"").trim()).filter(Boolean);
    return u.length?u:UNIDADES_DEF.map(x=>x[0]);};
  const unidadDec=clave=>{const u=cat("unidades").find(x=>String(x.clave||"").toUpperCase()===String(clave||"").trim().toUpperCase());
    const d=u&&u.decimales!=null?+u.decimales:0;return isFinite(d)?Math.max(0,Math.min(6,d)):0;};
  const metodosPago=()=>{const m=cat("metodosPago").map(x=>x.nombre).filter(Boolean);
    return m.length?m:["Transferencia","Cheque","Efectivo","Tarjeta"];};
  // Correos de un cliente: contactos marcados como destino + el campo libre de correos.
  function contactosDe(cli){
    if(!cli)return [];
    const l=(cli.contactos||[]).filter(c=>c&&c.email);
    (String(cli.emails||"").split(/[,;]+/).map(s=>s.trim()).filter(Boolean)).forEach(em=>{
      if(!l.some(c=>String(c.email).toLowerCase()===em.toLowerCase()))l.push({nombre:"",email:em,puesto:""});});
    return l;
  }
  const COLL={cotizacion:"cotizaciones",'''

# --------------------------------------------- 2) migracion al cargar el estado
OLD_MIG = '''    if(!s.config||typeof s.config!=="object")s.config={iva:16};
    if(s.config.iva==null)s.config.iva=16;
    return s;}'''
NEW_MIG = '''    if(!s.config||typeof s.config!=="object")s.config={iva:16};
    if(s.config.iva==null)s.config.iva=16;
    catalogosDefault(s);
    return s;}'''

# ------------------------------------------------------- 3) unidades/analiticas
OLD_UNI = '''  const UNIDADES=["PZ","SERV","LOT","KG","TON","MTR","M2","M3","LT","HR","DIA","CAJA","JGO","ROLLO"];
  // Valores de analítica ya usados, para sugerirlos en las líneas nuevas.
  function analiticasUsadas(){
    const set=new Set();
    [state.cotizaciones,state.ventas,state.facturas,state.ordenes].forEach(col=>
      (col||[]).forEach(d=>(d.lineas||[]).forEach(l=>{if(l.analitica)set.add(String(l.analitica).trim());})));
    return [...set].filter(Boolean).sort();
  }'''
NEW_UNI = '''  // Analíticas del catálogo más las ya usadas en cualquier documento.
  function analiticasUsadas(){
    const set=new Set();
    cat("analiticas").forEach(a=>{if(a.nombre)set.add(String(a.nombre).trim());});
    [state.cotizaciones,state.ventas,state.facturas,state.ordenes].forEach(col=>
      (col||[]).forEach(d=>(d.lineas||[]).forEach(l=>{if(l.analitica)set.add(String(l.analitica).trim());})));
    return [...set].filter(Boolean).sort();
  }'''

OLD_UNIUSO = '''      +`<datalist id="fx-uni">${UNIDADES.map(u=>`<option value="${u}"></option>`).join("")}</datalist>`'''
NEW_UNIUSO = '''      +`<datalist id="fx-uni">${unidadesCat().map(u=>`<option value="${u}"></option>`).join("")}</datalist>`'''

# ------------------------------------------------------------ 4) impuestos
OLD_RET = '''    (state.clientes||[]).forEach(c=>(c.retenciones||[]).forEach(add));
    [state.cotizaciones,state.facturas].forEach(col=>(col||[]).forEach(d=>(d.retenciones||[]).forEach(add)));
    [{concepto:"Retención ISR",tasa:1.25},{concepto:"Retención IVA",tasa:10.6667}].forEach(add);'''
NEW_RET = '''    cat("impuestos").forEach(add);
    (state.clientes||[]).forEach(c=>(c.retenciones||[]).forEach(add));
    [state.cotizaciones,state.facturas].forEach(col=>(col||[]).forEach(d=>(d.retenciones||[]).forEach(add)));'''

# ------------------------------------------------------- 5) metodos de pago
OLD_MET = '''<select id="f-met">${["Transferencia","Cheque","Efectivo","Tarjeta"].map(m=>`<option ${rec&&rec.metodo===m?"selected":""}>${m}</option>`).join("")}</select>'''
NEW_MET = '''<select id="f-met">${metodosPago().map(m=>`<option ${rec&&rec.metodo===m?"selected":""}>${m}</option>`).join("")}</select>'''

# ------------------------------------------------ 6) conceptos del catalogo
OLD_PROD = '''    state.cotizaciones.forEach(c=>(c.lineas||[]).forEach(l=>add(l,lineaPrecio(l),l.margen)));'''
NEW_PROD = '''    cat("conceptos").forEach(p=>add({desc:p.desc,costo:p.costo,unidad:p.unidad,analitica:p.analitica},0,null));
    state.cotizaciones.forEach(c=>(c.lineas||[]).forEach(l=>add(l,lineaPrecio(l),l.margen)));'''

# ---------------------------------------------------- 7) contactos del cliente
OLD_CLIFORM = '''        <div class="field"><label for="f-mail">Correos para enviar documentos</label><input id="f-mail" value="${escAttr(rec?rec.emails:"")}" placeholder="compras@cliente.com, pagos@cliente.com"></div>
        <div class="field"><label>Retenciones / impuestos aplicables</label><div id="rets"></div></div>
        <p class="hintline">Estas retenciones se cargarán automáticamente al elegir el cliente en una cotización.</p>`;
      onsubmit=()=>{const data={nombre:$("#f-nom").value.trim(),rfc:$("#f-rfc").value.trim(),margen:+$("#f-mg").value||0,
        ivaPct:+$("#f-ivac").value,emails:$("#f-mail").value.trim(),retenciones:retEd.read().filter(r=>r.concepto)};'''
NEW_CLIFORM = '''        <div class="field"><label for="f-mail">Correos para enviar documentos</label><input id="f-mail" value="${escAttr(rec?rec.emails:"")}" placeholder="compras@cliente.com, pagos@cliente.com"></div>
        <div class="field"><label>Contactos de la empresa <span style="color:var(--text-faint);font-weight:400">· se eligen al enviar la cotización</span></label><div id="cons"></div></div>
        <div class="field"><label>Retenciones / impuestos aplicables</label><div id="rets"></div></div>
        <p class="hintline">Estas retenciones se cargarán automáticamente al elegir el cliente en una cotización.</p>`;
      onsubmit=()=>{const data={nombre:$("#f-nom").value.trim(),rfc:$("#f-rfc").value.trim(),margen:+$("#f-mg").value||0,
        ivaPct:+$("#f-ivac").value,emails:$("#f-mail").value.trim(),contactos:conEd?conEd.read().filter(c=>c.email):[],
        retenciones:retEd.read().filter(r=>r.concepto)};'''

# editor de contactos + declaracion de la variable
OLD_DECL = '''    let title,body,onsubmit,lineType=null,formLines=null,retEd=null,formRets=null;const t=todayStr();'''
NEW_DECL = '''    let title,body,onsubmit,lineType=null,formLines=null,retEd=null,formRets=null,conEd=null;const t=todayStr();'''

OLD_RETED = '''  function makeRetEditor(host,initial,onChange){'''
NEW_RETED = '''  // Contactos de una empresa: nombre, puesto y correo.
  function makeConEditor(host,initial){
    host.innerHTML=`<div class="conhead"><span>Nombre</span><span>Puesto</span><span>Correo</span><span></span></div>
      <div class="clist"></div><button type="button" class="ghost conadd">+ Agregar contacto</button>`;
    const list=host.querySelector(".clist");
    const rowHtml=c=>`<div class="crow"><input data-k="nombre" placeholder="Nombre" value="${escAttr(c?c.nombre:"")}">
      <input data-k="puesto" placeholder="Compras" value="${escAttr(c?c.puesto:"")}">
      <input data-k="email" type="email" placeholder="correo@empresa.com" value="${escAttr(c?c.email:"")}">
      <button type="button" class="l-del" aria-label="Quitar">&times;</button></div>`;
    const read=()=>[...list.querySelectorAll(".crow")].map(r=>({nombre:r.querySelector('[data-k="nombre"]').value.trim(),
      puesto:r.querySelector('[data-k="puesto"]').value.trim(),email:r.querySelector('[data-k="email"]').value.trim()}));
    host.addEventListener("click",e=>{if(e.target.closest(".l-del"))e.target.closest(".crow").remove();
      else if(e.target.closest(".conadd"))list.insertAdjacentHTML("beforeend",rowHtml());});
    (initial&&initial.length?initial:[]).forEach(c=>list.insertAdjacentHTML("beforeend",rowHtml(c)));
    return {read};
  }
  function makeRetEditor(host,initial,onChange){'''

OLD_RETINIT = '''    if($("#rets")&&!retEd){retEd=makeRetEditor($("#rets"),formRets||(rec?rec.retenciones:null),function(){});}'''
NEW_RETINIT = '''    if($("#rets")&&!retEd){retEd=makeRetEditor($("#rets"),formRets||(rec?rec.retenciones:null),function(){});}
    if($("#cons"))conEd=makeConEditor($("#cons"),rec?rec.contactos:null);'''

# ------------------------------------------------------- 8) vista Catalogos
OLD_VIEWS = '''    {id:"cierres",label:"Cierres / respaldos",'''
NEW_VIEWS = '''    {id:"catalogos",label:"Catálogos",icon:'<path d="M4 6h16M4 12h16M4 18h16" stroke-width="1.7"/><circle cx="8" cy="6" r="1.6" stroke-width="1.7"/><circle cx="14" cy="12" r="1.6" stroke-width="1.7"/><circle cx="10" cy="18" r="1.6" stroke-width="1.7"/>'},
    {id:"cierres",label:"Cierres / respaldos",'''

OLD_VFNS = '''    facturas:vFacturas,pagos:vPagos,proveedores:vProveedores,gastos:vGastos,clientes:vClientes,proyecciones:vProyecciones,contabilidad:vContabilidad,cierres:vCierres};'''
NEW_VFNS = '''    facturas:vFacturas,pagos:vPagos,proveedores:vProveedores,gastos:vGastos,clientes:vClientes,proyecciones:vProyecciones,contabilidad:vContabilidad,cierres:vCierres,catalogos:vCatalogos};'''

OLD_VCAT = '''  const viewFns={dashboard:vDashboard,'''
NEW_VCAT = '''  function vCatalogos(){
    const act=CATS.find(c=>c.k===ui.catTab)||CATS[0];
    const filas=cat(act.k);
    const tabs=`<div class="filterbar"><span class="flabel">Catálogo:</span>`+CATS.map(c=>
      `<button class="fbtn ${c.k===act.k?"on":""}" data-action="cat-tab" data-cat="${c.k}">${c.label} (${cat(c.k).length})</button>`).join("")+`</div>`;
    const enc=act.campos.map(f=>`<th>${f.label}</th>`).join("");
    const celda=(f,r)=>{const v=r[f.k];
      if(f.tipo==="num")return `<td class="r num">${v==null||v===""?"—":v}</td>`;
      if(f.tipo==="area")return `<td style="max-width:420px;color:var(--text-dim);font-size:12px">${escAttr(String(v||"").slice(0,90))}${String(v||"").length>90?"…":""}</td>`;
      return `<td>${escAttr(v==null?"":String(v))}</td>`;};
    return `<div class="head"><div><h2>Catálogos</h2><p>Da de alta y edita los valores que usan los formularios: unidades, analíticas, impuestos, plantillas y más</p></div>
      <div class="headacts"><button class="primary" data-action="cat-add" data-cat="${act.k}">${plusIcon}Agregar ${act.sing}</button></div></div>
      ${tabs}
      <div class="panel"><div class="tablewrap"><table>
      <thead><tr>${enc}<th></th></tr></thead>
      <tbody>${filas.length?filas.map(r=>`<tr>${act.campos.map(f=>celda(f,r)).join("")}
        <td><div class="rowact"><button class="act" data-action="cat-edit" data-cat="${act.k}" data-id="${r.id}">Editar</button>
        <button class="act warnact" data-action="cat-del" data-cat="${act.k}" data-id="${r.id}">Eliminar</button></div></td></tr>`).join(""):
        emptyRow(act.campos.length+1,"Sin registros en este catálogo")}</tbody></table></div></div>
      <p class="hintline">Los valores de este apartado aparecen como sugerencia en los formularios. Borrar uno no modifica los documentos ya capturados.</p>`;
  }
  const viewFns={dashboard:vDashboard,'''

# formulario generico de catalogo
OLD_FORMCAT = '''    else if(type==="cierre"){title="Guardar cierre / respaldo";'''
NEW_FORMCAT = '''    else if(type==="catalogo"){
      const def=CATS.find(c=>c.k===opts.cat)||CATS[0];
      const reg=opts.id?(cat(def.k).find(x=>x.id===opts.id)||null):null;
      title=(reg?"Editar ":"Nuevo(a) ")+def.sing;
      body=def.campos.map(f=>{const v=reg&&reg[f.k]!=null?reg[f.k]:(f.v!=null?f.v:"");
        const inp=f.tipo==="area"
          ? `<textarea id="cf-${f.k}" rows="8" placeholder="${escAttr(f.ph||"")}">${escAttr(String(v))}</textarea>`
          : f.tipo==="num"
            ? `<input type="number" step="any" id="cf-${f.k}" value="${escAttr(String(v))}" placeholder="${escAttr(f.ph||"")}">`
            : `<input id="cf-${f.k}" value="${escAttr(String(v))}" placeholder="${escAttr(f.ph||"")}" ${f.req?"required":""}>`;
        return `<div class="field"><label for="cf-${f.k}">${f.label}</label>${inp}${f.ayuda?`<p class="hintline" style="margin:4px 0 0">${f.ayuda}</p>`:""}</div>`;}).join("");
      onsubmit=()=>{const data={};
        for(const f of def.campos){const el=$("#cf-"+f.k);let v=el.value;
          if(f.tipo==="num")v=+v||0;else v=String(v).trim();
          if(f.req&&!v){toast("Falta "+f.label);return false;}
          data[f.k]=v;}
        if(!Array.isArray(state.catalogos[def.k]))state.catalogos[def.k]=[];
        if(reg)Object.assign(reg,data);else state.catalogos[def.k].push(Object.assign({id:uid()},data));
        current="catalogos";ui.catTab=def.k;};
    }
    else if(type==="cierre"){title="Guardar cierre / respaldo";'''

# acciones
OLD_ACC = '''    else if(a==="cot-status"){'''
NEW_ACC = '''    else if(a==="cat-tab"){ui.catTab=b.dataset.cat;render();}
    else if(a==="cat-add"){openForm("catalogo",{cat:b.dataset.cat});}
    else if(a==="cat-edit"){openForm("catalogo",{cat:b.dataset.cat,id:id});}
    else if(a==="cat-del"){const ck=b.dataset.cat;askConfirm("¿Eliminar este registro del catálogo?",()=>{
      state.catalogos[ck]=(state.catalogos[ck]||[]).filter(x=>x.id!==id);persist();render();toast("Registro eliminado");});}
    else if(a==="cot-status"){'''

OLD_UI = '''  const ui={cotFilter:"all",ocFilter:"all",facFilter:"all",ovFilter:"all",proyMonth:"all",contaMonth:null,provSel:[],'''
NEW_UI = '''  const ui={cotFilter:"all",ocFilter:"all",facFilter:"all",ovFilter:"all",proyMonth:"all",contaMonth:null,provSel:[],
    catTab:"unidades",cotSel:[],'''

CSS_OLD = '''  .ordbar{display:flex;'''
CSS_NEW = '''  .conhead,.crow{display:grid;grid-template-columns:1fr 1fr 1.3fr 22px;gap:6px;align-items:center}
  .conhead{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-faint);margin-bottom:4px}
  .crow{margin-bottom:5px}
  .crow input{padding:6px 8px;font-size:12.5px}
  #modal textarea{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:9px 11px;
    font-size:13.5px;color:var(--text);font-family:inherit;line-height:1.55;resize:vertical}
  #modal textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
  .ordbar{display:flex;'''

def parche_js(t):
    t = sub(t, OLD_COLL, NEW_COLL, "catalogos")
    t = sub(t, OLD_MIG, NEW_MIG, "migracion")
    t = sub(t, OLD_UNI, NEW_UNI, "unidades/analiticas")
    t = sub(t, OLD_UNIUSO, NEW_UNIUSO, "datalist unidades")
    t = sub(t, OLD_RET, NEW_RET, "catalogo impuestos")
    t = sub(t, OLD_MET, NEW_MET, "metodos de pago")
    t = sub(t, OLD_PROD, NEW_PROD, "conceptos")
    t = sub(t, OLD_CLIFORM, NEW_CLIFORM, "form cliente")
    t = sub(t, OLD_DECL, NEW_DECL, "declaracion conEd")
    t = sub(t, OLD_RETED, NEW_RETED, "editor de contactos")
    t = sub(t, OLD_RETINIT, NEW_RETINIT, "init contactos")
    t = sub(t, OLD_VIEWS, NEW_VIEWS, "nav")
    t = sub(t, OLD_VFNS, NEW_VFNS, "viewFns")
    t = sub(t, OLD_VCAT, NEW_VCAT, "vista catalogos")
    t = sub(t, OLD_FORMCAT, NEW_FORMCAT, "form catalogo")
    t = sub(t, OLD_ACC, NEW_ACC, "acciones catalogo")
    t = sub(t, OLD_UI, NEW_UI, "ui")
    return t

for p in JS:
    t = io.open(p, encoding="utf-8").read()
    io.open(p, "w", encoding="utf-8").write(parche_js(t))
    print("JS:", os.path.basename(p))
for p in CSS:
    t = io.open(p, encoding="utf-8").read()
    io.open(p, "w", encoding="utf-8").write(sub(t, CSS_OLD, CSS_NEW, "css " + os.path.basename(p)))
    print("CSS:", os.path.basename(p))
