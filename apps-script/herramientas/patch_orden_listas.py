# -*- coding: utf-8 -*-
"""Filtros de orden en las listas desplegadas de los formularios
(facturas a pagar y documentos del proyecto) y clientes en orden alfabetico."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS_TARGETS  = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]
CSS_TARGETS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "Index.html")]

def sub(txt, old, new, etiqueta, veces=1):
    n = txt.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias (esperaba %d)" % (etiqueta, n, veces))
    return txt.replace(old, new)

# ------------------------------------------------------------------ helpers JS
OLD_HELP = '''  const optList=(arr,labelFn,sel)=>'''
NEW_HELP = '''  /* ---------- orden de las listas desplegadas de los formularios ---------- */
  // Compara numeros como numeros y textos con orden natural (F-9 antes que F-10).
  const cmpOrd=(a,b)=>{const A=String(a==null?"":a),B=String(b==null?"":b);
    if(A!==""&&B!==""&&isFinite(+A)&&isFinite(+B))return (+A)-(+B);
    return A.localeCompare(B,"es",{numeric:true,sensitivity:"base"});};
  const clientesOrd=()=>[...state.clientes].sort((a,b)=>cmpOrd(a.nombre,b.nombre));
  const ORD_DOC=[{k:"folio",label:"Número / folio"},{k:"fecha",label:"Fecha"},{k:"importe",label:"Importe"},{k:"nombre",label:"Nombre"}];
  function barraOrden(opciones,def){
    const dir=(def&&def.dir)||"asc";
    return `<div class="ordbar"><span>Ordenar por</span>
      <select class="ordsel">${opciones.map(o=>`<option value="${o.k}" ${o.k===(def&&def.k)?"selected":""}>${o.label}</option>`).join("")}</select>
      <button type="button" class="orddir" data-dir="${dir}">${dir==="desc"?"↓ Mayor a menor":"↑ Menor a mayor"}</button></div>`;
  }
  function activarOrden(caja){
    if(!caja)return;
    const bar=caja.querySelector(".ordbar");if(!bar)return;
    const sel=bar.querySelector(".ordsel"),btn=bar.querySelector(".orddir");
    const lista=caja.querySelector("[data-ordlist]");if(!lista)return;
    const aplicar=()=>{const k=sel.value,dir=btn.dataset.dir==="desc"?-1:1;
      const filas=[...lista.querySelectorAll("[data-ordrow]")];
      filas.sort((a,b)=>dir*cmpOrd(a.getAttribute("data-o-"+k),b.getAttribute("data-o-"+k)));
      filas.forEach(f=>lista.appendChild(f));};
    sel.addEventListener("change",aplicar);
    btn.addEventListener("click",()=>{const d=btn.dataset.dir==="desc"?"asc":"desc";
      btn.dataset.dir=d;btn.textContent=d==="desc"?"↓ Mayor a menor":"↑ Menor a mayor";aplicar();});
    aplicar();
  }
  const optList=(arr,labelFn,sel)=>'''

# ------------------------------------------------------- facturas a pagar
OLD_PAYFILT = '''      const cand=state.facturas.filter(f=>facSaldo(f)>CENTAVO||editIds.indexOf(f.id)>=0)
        .sort((a,b)=>facSaldo(b)-facSaldo(a));   // de mayor a menor saldo'''
NEW_PAYFILT = '''      const cand=state.facturas.filter(f=>facSaldo(f)>CENTAVO||editIds.indexOf(f.id)>=0);'''

OLD_PAYROW = '''      const rowFor=f=>{const ap=editAps.find(x=>x.facturaId===f.id),checked=!!ap||f.id===preId,amt=ap?ap.monto:facSaldo(f);
        return `<label class="payrow"><input type="checkbox" class="pf" value="${f.id}" ${checked?"checked":""}>'''
NEW_PAYROW = '''      const rowFor=f=>{const ap=editAps.find(x=>x.facturaId===f.id),checked=!!ap||f.id===preId,amt=ap?ap.monto:facSaldo(f);
        return `<label class="payrow" data-ordrow data-o-folio="${escAttr(f.folio||"")}" data-o-nombre="${escAttr(f.cliente||"")}" data-o-fecha="${f.vencimiento||f.fecha||""}" data-o-importe="${facSaldo(f)}"><input type="checkbox" class="pf" value="${f.id}" ${checked?"checked":""}>'''

OLD_PAYLIST = '''        <div class="field"><label>Facturas a pagar <span style="color:var(--text-faint);font-weight:400">· marca una o varias (pago consolidado)</span></label>
          <div class="checklist paylist" id="paylist">${cand.map(rowFor).join("")}</div></div>'''
NEW_PAYLIST = '''        <div class="field"><label>Facturas a pagar <span style="color:var(--text-faint);font-weight:400">· marca una o varias (pago consolidado)</span></label>
          ${barraOrden([{k:"folio",label:"Número de factura"},{k:"importe",label:"Saldo"},{k:"nombre",label:"Cliente"},{k:"fecha",label:"Vencimiento"}],{k:"folio",dir:"desc"})}
          <div class="checklist paylist" id="paylist" data-ordlist>${cand.map(rowFor).join("")}</div></div>'''

# ------------------------------------------------- documentos del proyecto
OLD_CHK = '''      const chk=(cls,arr,lf,sel)=>arr.length?arr.map(x=>`<label><input type="checkbox" class="${cls}" value="${x.id}" ${sel.indexOf(x.id)>=0?"checked":""}> <span class="mono">${x.folio}</span> · ${lf(x)}</label>`).join(""):'<div class="none">— sin registros —</div>';'''
NEW_CHK = '''      const chk=(cls,arr,lf,sel,imp)=>{const filas=arr.length?arr.map(x=>
        `<label data-ordrow data-o-folio="${escAttr(x.folio||"")}" data-o-fecha="${x.fecha||""}" data-o-importe="${imp?imp(x):0}" data-o-nombre="${escAttr(lf(x))}">
          <input type="checkbox" class="${cls}" value="${x.id}" ${sel.indexOf(x.id)>=0?"checked":""}> <span class="mono">${x.folio}</span> · ${lf(x)}</label>`).join(""):'<div class="none">— sin registros —</div>';
        return `${arr.length?barraOrden(ORD_DOC,{k:"folio",dir:"desc"}):""}<div class="checklist" data-ordlist>${filas}</div>`;};'''

OLD_LISTAS = '''        <div class="field"><label>Cotizaciones</label><div class="checklist">${chk("c-cot",state.cotizaciones,x=>x.cliente,sc)}</div></div>
        <div class="field"><label>Órdenes de venta (cliente)</label><div class="checklist">${chk("c-ov",state.ventas,x=>x.cliente,sv)}</div></div>
        <div class="field"><label>Órdenes de compra (proveedor)</label><div class="checklist">${chk("c-oc",state.ordenes,x=>x.proveedor,so)}</div></div>
        <div class="field"><label>Facturas al cliente</label><div class="checklist">${chk("c-fac",state.facturas,x=>x.cliente,sf)}</div></div>`;'''
NEW_LISTAS = '''        <div class="field"><label>Cotizaciones</label>${chk("c-cot",state.cotizaciones,x=>x.cliente,sc,cotTotal)}</div>
        <div class="field"><label>Órdenes de venta (cliente)</label>${chk("c-ov",state.ventas,x=>x.cliente,sv,ovTotal)}</div>
        <div class="field"><label>Órdenes de compra (proveedor)</label>${chk("c-oc",state.ordenes,x=>x.proveedor,so,ocTotal)}</div>
        <div class="field"><label>Facturas al cliente</label>${chk("c-fac",state.facturas,x=>x.cliente,sf,facTotal)}</div>`;'''

# ------------------------------------------------------------- activacion
OLD_ACT = '''    md.querySelector("#theform").addEventListener("submit",e=>{e.preventDefault();if(onsubmit()===false)return;persist();closeModal();render();});'''
NEW_ACT = '''    md.querySelectorAll(".ordbar").forEach(b=>activarOrden(b.parentElement));
    md.querySelector("#theform").addEventListener("submit",e=>{e.preventDefault();if(onsubmit()===false)return;persist();closeModal();render();});'''

# --------------------------------------------- clientes en orden alfabetico
OLD_CLI_MAP = '''state.clientes.map(cl=>'''
NEW_CLI_MAP = '''clientesOrd().map(cl=>'''
OLD_CLI_MAP2 = '''${state.clientes.length?state.clientes.map(c=>`<option value="${c.id}">${escAttr(c.nombre)}${c.margen!=null?" · margen "+c.margen+"%":""}</option>`).join(""):'''
NEW_CLI_MAP2 = '''${state.clientes.length?clientesOrd().map(c=>`<option value="${c.id}">${escAttr(c.nombre)}${c.margen!=null?" · margen "+c.margen+"%":""}</option>`).join(""):'''

CSS_OLD = '''  .checklist{max-height:150px;'''
CSS_NEW = '''  .ordbar{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11.5px;color:var(--text-faint);
    text-transform:uppercase;letter-spacing:.04em}
  .ordbar select{flex:0 1 190px;padding:5px 8px;font-size:12px;border-radius:7px;border:1px solid var(--border);
    background:var(--bg);color:var(--text);font-family:inherit;text-transform:none;letter-spacing:0}
  .ordbar .orddir{padding:5px 10px;font-size:12px;border-radius:7px;border:1px solid var(--border);
    background:var(--bg);color:var(--text-dim);cursor:pointer;font-family:inherit;text-transform:none;letter-spacing:0}
  .ordbar .orddir:hover{border-color:var(--accent);color:var(--text)}
  .checklist{max-height:150px;'''

def parche_js(txt):
    txt = sub(txt, OLD_HELP, NEW_HELP, "helpers de orden")
    txt = sub(txt, OLD_PAYFILT, NEW_PAYFILT, "candidatas de pago")
    txt = sub(txt, OLD_PAYROW, NEW_PAYROW, "fila de pago")
    txt = sub(txt, OLD_PAYLIST, NEW_PAYLIST, "lista de pago")
    txt = sub(txt, OLD_CHK, NEW_CHK, "chk del proyecto")
    txt = sub(txt, OLD_LISTAS, NEW_LISTAS, "listas del proyecto")
    txt = sub(txt, OLD_ACT, NEW_ACT, "activacion")
    txt = sub(txt, OLD_CLI_MAP, NEW_CLI_MAP, "clientes ordenados", 5)
    txt = sub(txt, OLD_CLI_MAP2, NEW_CLI_MAP2, "clientes en cotizarProv")
    return txt

for path in JS_TARGETS:
    with io.open(path, encoding="utf-8") as fh:
        txt = fh.read()
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(parche_js(txt))
    print("JS parcheado:", os.path.basename(path))

for path in CSS_TARGETS:
    with io.open(path, encoding="utf-8") as fh:
        txt = fh.read()
    txt = sub(txt, CSS_OLD, CSS_NEW, "css " + os.path.basename(path))
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(txt)
    print("CSS parcheado:", os.path.basename(path))
