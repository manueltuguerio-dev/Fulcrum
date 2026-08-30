# -*- coding: utf-8 -*-
"""Rechazo con comentario y acciones masivas sobre cotizaciones."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

# ------------------------------------------------------ vista de cotizaciones
OLD_V = '''    return `${headBar("Cotizaciones","Propuestas a clientes · margen por línea · convierte las aceptadas en factura","cotizacion","Nueva cotización","rep-cot","cot-masiva")}
    ${filterBar("cotFilter",ui.cotFilter,opts)}
    ${barraBusqueda("cot","Buscar por folio, cliente o concepto…",base.length,list.length)}
    <div class="panel"><div class="tablewrap"><table>
    <thead><tr>${th("cot","folio","Folio")}${th("cot","cliente","Cliente")}${th("cot","fecha","Fecha")}<th>Origen (costo)</th>${th("cot","lineas","Líneas","r")}${th("cot","margen","Margen","r")}${th("cot","total","Total","r")}${th("cot","estatus","Estatus")}<th></th></tr></thead>
    <tbody>${list.length?list.map(c=>`<tr>
      <td class="mono">${c.folio}</td><td>${c.cliente}</td><td>${fmtDate(c.fecha)}</td>'''
NEW_V = '''    const sel=(ui.cotSel||[]).filter(id=>state.cotizaciones.some(c=>c.id===id));
    const selTot=state.cotizaciones.filter(c=>sel.indexOf(c.id)>=0).reduce((a,c)=>a+cotTotal(c),0);
    const ESTATUS=["borrador","enviada","aceptada","rechazada"];
    const barraSel=`<div class="selbar">
      <span>${sel.length?sel.length+" cotización(es) seleccionada(s) · "+money(selTot):"Marca cotizaciones para enviarlas o cambiarles el estatus en bloque"}</span>
      <div class="headacts">
        ${sel.length?`<button class="ghost" data-action="cot-sel-none">Quitar selección</button>`:""}
        <select id="cot-masivo-estatus" ${sel.length?"":"disabled"}>${ESTATUS.map(e=>`<option value="${e}">${e.charAt(0).toUpperCase()+e.slice(1)}</option>`).join("")}</select>
        <button class="ghost" data-action="cot-masivo" ${sel.length?"":"disabled"}>Cambiar estatus</button>
        <button class="ghost warnact" data-action="cot-rechazar-sel" ${sel.length?"":"disabled"}>Rechazar</button>
        <button class="primary" data-action="cot-enviar-sel" ${sel.length?"":"disabled"}>${mailIcon}Enviar por correo</button>
      </div></div>`;
    return `${headBar("Cotizaciones","Propuestas a clientes · margen por línea · convierte las aceptadas en factura","cotizacion","Nueva cotización","rep-cot","cot-masiva")}
    ${filterBar("cotFilter",ui.cotFilter,opts)}
    ${barraBusqueda("cot","Buscar por folio, cliente o concepto…",base.length,list.length)}
    ${barraSel}
    <div class="panel"><div class="tablewrap"><table>
    <thead><tr><th style="width:34px"><input type="checkbox" data-action="cot-sel-all" ${sel.length&&sel.length===list.length?"checked":""}></th>
      ${th("cot","folio","Folio")}${th("cot","cliente","Cliente")}${th("cot","fecha","Fecha")}<th>Origen (costo)</th>${th("cot","lineas","Líneas","r")}${th("cot","margen","Margen","r")}${th("cot","total","Total","r")}${th("cot","estatus","Estatus")}<th></th></tr></thead>
    <tbody>${list.length?list.map(c=>`<tr>
      <td><input type="checkbox" data-action="cot-sel" data-id="${c.id}" ${sel.indexOf(c.id)>=0?"checked":""}></td>
      <td class="mono">${c.folio}</td><td>${c.cliente}</td><td>${fmtDate(c.fecha)}</td>'''

OLD_EST = '''<td><span class="pill ${cotCls[c.estatus]}">${c.estatus}</span></td>
      <td><div class="rowact">
        <button class="act" data-action="print" data-type="cot" data-id="${c.id}">PDF</button>
        <button class="act" data-action="edit" data-type="cotizacion" data-id="${c.id}">Editar</button>
        <button class="act" data-action="cot-dup" data-id="${c.id}">Duplicar</button>
        ${c.ventaId?`<span class="pill p-info">→ orden de venta</span>`:(c.estatus==="aceptada"?`<button class="act good" data-action="cot-venta" data-id="${c.id}">A orden de venta</button>`:`<button class="act" data-action="cot-status" data-id="${c.id}">Avanzar</button>`)}
        <button class="act warnact" data-action="del" data-type="cotizaciones" data-id="${c.id}">Eliminar</button>
      </div></td></tr>`).join(""):emptyRow(9,"Sin cotizaciones con ese estatus")}</tbody></table></div></div>`;'''
NEW_EST = '''<td><span class="pill ${cotCls[c.estatus]}" ${c.motivoRechazo?`title="${escAttr(c.motivoRechazo+(c.comentarioRechazo?" · "+c.comentarioRechazo:""))}"`:""}>${c.estatus}</span>
        ${c.estatus==="rechazada"&&c.motivoRechazo?`<div style="color:var(--text-faint);font-size:10.5px;margin-top:2px">${escAttr(c.motivoRechazo)}</div>`:""}
        ${c.enviadaEl?`<div style="color:var(--text-faint);font-size:10.5px;margin-top:2px">enviada ${fmtDate(c.enviadaEl)}</div>`:""}</td>
      <td><div class="rowact">
        <button class="act" data-action="print" data-type="cot" data-id="${c.id}">PDF</button>
        <button class="act" data-action="cot-enviar" data-id="${c.id}">Enviar</button>
        <button class="act" data-action="edit" data-type="cotizacion" data-id="${c.id}">Editar</button>
        <button class="act" data-action="cot-dup" data-id="${c.id}">Duplicar</button>
        ${c.ventaId?`<span class="pill p-info">→ orden de venta</span>`:(c.estatus==="aceptada"?`<button class="act good" data-action="cot-venta" data-id="${c.id}">A orden de venta</button>`:`<button class="act" data-action="cot-status" data-id="${c.id}">Avanzar</button>`)}
        ${c.estatus==="rechazada"
          ?`<button class="act" data-action="cot-reactivar" data-id="${c.id}">Reactivar</button>`
          :`<button class="act warnact" data-action="cot-rechazar" data-id="${c.id}">Rechazar</button>`}
        <button class="act warnact" data-action="del" data-type="cotizaciones" data-id="${c.id}">Eliminar</button>
      </div></td></tr>`).join(""):emptyRow(10,"Sin cotizaciones con ese estatus")}</tbody></table></div></div>`;'''

# ------------------------------------------------------- formulario de rechazo
OLD_FORM = '''    else if(type==="catalogo"){'''
NEW_FORM = '''    else if(type==="rechazo"){
      const ids=(opts.ids||[]).filter(Boolean);
      const cots=state.cotizaciones.filter(c=>ids.indexOf(c.id)>=0);
      if(!cots.length){toast("Selecciona al menos una cotización");return;}
      const uno=cots.length===1?cots[0]:null;
      title=cots.length===1?"Rechazar cotización "+uno.folio:"Rechazar "+cots.length+" cotizaciones";
      body=`<p class="hintline">${cots.map(c=>c.folio+" · "+c.cliente).join("<br>")}</p>
        <div class="field"><label for="f-motivo">Motivo del rechazo</label>
          <input id="f-motivo" list="mot-list" required value="${escAttr(uno&&uno.motivoRechazo?uno.motivoRechazo:"")}" placeholder="Ej. Precio fuera de mercado">
          <datalist id="mot-list">${cat("motivosRechazo").map(m=>`<option value="${escAttr(m.nombre)}"></option>`).join("")}</datalist></div>
        <div class="field"><label for="f-coment">Comentario</label>
          <textarea id="f-coment" rows="4" placeholder="Detalle de lo que comentó el cliente…">${escAttr(uno&&uno.comentarioRechazo?uno.comentarioRechazo:"")}</textarea></div>
        <p class="hintline">Los motivos se administran en <b>Catálogos → Motivos de rechazo</b>. Podrás reactivar la cotización cuando quieras.</p>`;
      onsubmit=()=>{const motivo=$("#f-motivo").value.trim();
        if(!motivo){toast("Escribe el motivo del rechazo.");return false;}
        const coment=$("#f-coment").value.trim();
        cots.forEach(c=>{c.estatus="rechazada";c.motivoRechazo=motivo;c.comentarioRechazo=coment;c.fechaRechazo=todayStr();});
        ui.cotSel=[];toast(cots.length===1?"Cotización rechazada":cots.length+" cotizaciones rechazadas");};
    }
    else if(type==="catalogo"){'''

# ------------------------------------------------------------------ acciones
OLD_ACC = '''    else if(a==="cat-tab"){ui.catTab=b.dataset.cat;render();}'''
NEW_ACC = '''    else if(a==="cot-sel"){const s=ui.cotSel||(ui.cotSel=[]);const i=s.indexOf(id);
      if(i>=0)s.splice(i,1);else s.push(id);render();}
    else if(a==="cot-sel-all"){const vis=[...document.querySelectorAll('[data-action="cot-sel"]')].map(el=>el.dataset.id);
      ui.cotSel=(ui.cotSel&&ui.cotSel.length===vis.length)?[]:vis;render();}
    else if(a==="cot-sel-none"){ui.cotSel=[];render();}
    else if(a==="cot-masivo"){const s=ui.cotSel||[];if(!s.length)return;
      const est=(document.getElementById("cot-masivo-estatus")||{}).value||"borrador";
      if(est==="rechazada"){openForm("rechazo",{ids:s.slice()});return;}
      state.cotizaciones.forEach(c=>{if(s.indexOf(c.id)>=0){c.estatus=est;
        if(est!=="rechazada"){delete c.motivoRechazo;delete c.comentarioRechazo;delete c.fechaRechazo;}}});
      ui.cotSel=[];persist();render();toast(s.length+" cotización(es) a estatus «"+est+"»");}
    else if(a==="cot-rechazar"){openForm("rechazo",{ids:[id]});}
    else if(a==="cot-rechazar-sel"){openForm("rechazo",{ids:(ui.cotSel||[]).slice()});}
    else if(a==="cot-reactivar"){const c=state.cotizaciones.find(x=>x.id===id);if(!c)return;
      c.estatus="borrador";delete c.motivoRechazo;delete c.comentarioRechazo;delete c.fechaRechazo;
      persist();render();toast("Cotización "+c.folio+" reactivada");}
    else if(a==="cat-tab"){ui.catTab=b.dataset.cat;render();}'''

# icono de correo
OLD_ICON = '''  function emptyRow(cols,msg){'''
NEW_ICON = '''  const mailIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14" style="vertical-align:-2px;margin-right:5px"><rect x="2.5" y="5" width="19" height="14" rx="2" stroke-width="1.7"/><path d="M3 6.5l9 6 9-6" stroke-width="1.7"/></svg>';
  function emptyRow(cols,msg){'''

CSS_OLD = '''  .selbar .primary[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}'''
CSS_NEW = '''  .selbar .primary[disabled],.selbar .ghost[disabled]{opacity:.45;cursor:not-allowed;box-shadow:none}
  .selbar select{padding:7px 10px;font-size:12.5px;border-radius:8px;border:1px solid var(--border);
    background:var(--surface);color:var(--text);font-family:inherit}
  .selbar select[disabled]{opacity:.45}
  .act.warnact,.ghost.warnact{color:var(--bad)}'''

def parche(t):
    t = sub(t, OLD_ICON, NEW_ICON, "icono correo")
    t = sub(t, OLD_V, NEW_V, "vista cotizaciones")
    t = sub(t, OLD_EST, NEW_EST, "acciones de fila")
    t = sub(t, OLD_FORM, NEW_FORM, "form rechazo")
    t = sub(t, OLD_ACC, NEW_ACC, "acciones")
    return t

for p in JS:
    t = io.open(p, encoding="utf-8").read()
    io.open(p, "w", encoding="utf-8").write(parche(t))
    print("JS:", os.path.basename(p))
for p in [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "Index.html")]:
    t = io.open(p, encoding="utf-8").read()
    io.open(p, "w", encoding="utf-8").write(sub(t, CSS_OLD, CSS_NEW, "css " + os.path.basename(p)))
    print("CSS:", os.path.basename(p))
