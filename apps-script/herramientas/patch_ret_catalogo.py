# -*- coding: utf-8 -*-
"""Catalogo de impuestos/retenciones dados de alta: sugerencia y autollenado de tasa."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
TARGETS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(txt, old, new, etiqueta):
    n = txt.count(old)
    if n != 1:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (etiqueta, n))
    return txt.replace(old, new)

OLD = '''  function makeRetEditor(host,initial,onChange){
    host.innerHTML=`<div class="rethead"><span>Concepto</span><span>Tasa %</span><span></span></div><div class="rlist"></div><button type="button" class="ghost retadd">+ Agregar retención</button>`;
    const list=host.querySelector(".rlist");
    const rowHtml=r=>`<div class="rrow"><input data-k="concepto" placeholder="Ej. Retención ISR" value="${escAttr(r?r.concepto:"")}"><input data-k="tasa" type="number" min="0" step="0.0001" placeholder="0" value="${r&&r.tasa!=null?r.tasa:""}"><button type="button" class="l-del" aria-label="Quitar">&times;</button></div>`;
    const read=()=>[...list.querySelectorAll(".rrow")].map(r=>({concepto:r.querySelector('[data-k="concepto"]').value.trim(),tasa:+r.querySelector('[data-k="tasa"]').value||0}));
    const setRows=rows=>{list.innerHTML="";(rows&&rows.length?rows:[]).forEach(r=>list.insertAdjacentHTML("beforeend",rowHtml(r)));onChange();};
    host.addEventListener("input",()=>onChange());
    host.addEventListener("click",e=>{if(e.target.closest(".l-del")){e.target.closest(".rrow").remove();onChange();}else if(e.target.closest(".retadd")){list.insertAdjacentHTML("beforeend",rowHtml());onChange();}});
    (initial&&initial.length?initial:[]).forEach(r=>list.insertAdjacentHTML("beforeend",rowHtml(r)));
    return {read,setRows};
  }'''

NEW = '''  // Impuestos y retenciones dados de alta: los de los clientes mas los ya usados en documentos.
  function retCatalogo(){
    const map=new Map();
    const add=r=>{if(!r||!r.concepto)return;const k=String(r.concepto).trim();if(!k)return;
      if(!map.has(k.toLowerCase()))map.set(k.toLowerCase(),{concepto:k,tasa:+r.tasa||0});};
    (state.clientes||[]).forEach(c=>(c.retenciones||[]).forEach(add));
    [state.cotizaciones,state.facturas].forEach(col=>(col||[]).forEach(d=>(d.retenciones||[]).forEach(add)));
    [{concepto:"Retención ISR",tasa:1.25},{concepto:"Retención IVA",tasa:10.6667}].forEach(add);
    return [...map.values()].sort((a,b)=>a.concepto.localeCompare(b.concepto));
  }
  function makeRetEditor(host,initial,onChange){
    const cat=retCatalogo();
    const dl=`<datalist id="fx-ret">${cat.map(r=>`<option value="${escAttr(r.concepto)}">${r.tasa}%</option>`).join("")}</datalist>`;
    host.innerHTML=`${dl}<div class="rethead"><span>Concepto</span><span>Tasa %</span><span></span></div><div class="rlist"></div><button type="button" class="ghost retadd">+ Agregar impuesto o retención</button>`;
    const list=host.querySelector(".rlist");
    const rowHtml=r=>`<div class="rrow"><input data-k="concepto" list="fx-ret" placeholder="Ej. Retención ISR" value="${escAttr(r?r.concepto:"")}"><input data-k="tasa" type="number" min="0" step="any" placeholder="0" value="${r&&r.tasa!=null?r.tasa:""}"><button type="button" class="l-del" aria-label="Quitar">&times;</button></div>`;
    const read=()=>[...list.querySelectorAll(".rrow")].map(r=>({concepto:r.querySelector('[data-k="concepto"]').value.trim(),tasa:+r.querySelector('[data-k="tasa"]').value||0}));
    const setRows=rows=>{list.innerHTML="";(rows&&rows.length?rows:[]).forEach(r=>list.insertAdjacentHTML("beforeend",rowHtml(r)));onChange();};
    host.addEventListener("input",()=>onChange());
    // Al elegir un impuesto del catalogo se completa su tasa.
    host.addEventListener("change",e=>{const inp=e.target;
      if(inp.dataset&&inp.dataset.k==="concepto"){const c=cat.find(x=>x.concepto.toLowerCase()===inp.value.trim().toLowerCase());
        if(c){const t=inp.closest(".rrow").querySelector('[data-k="tasa"]');if(t&&!(+t.value)){t.value=c.tasa;onChange();}}}});
    host.addEventListener("click",e=>{if(e.target.closest(".l-del")){e.target.closest(".rrow").remove();onChange();}else if(e.target.closest(".retadd")){list.insertAdjacentHTML("beforeend",rowHtml());onChange();}});
    (initial&&initial.length?initial:[]).forEach(r=>list.insertAdjacentHTML("beforeend",rowHtml(r)));
    return {read,setRows};
  }'''

for path in TARGETS:
    with io.open(path, encoding="utf-8") as fh:
        txt = fh.read()
    txt = sub(txt, OLD, NEW, "makeRetEditor")
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(txt)
    print("parcheado:", os.path.basename(path))
