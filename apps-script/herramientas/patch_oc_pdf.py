# -*- coding: utf-8 -*-
"""Lector del PDF de la orden de compra del cliente dentro de la orden de venta:
valida subtotal y total y toma el numero de OC automaticamente."""
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

PDFJS = ('<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>\n'
         '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"></script>\n')

# ---------------------------------------------------------------- lector
OLD_LECTOR = '''  /* ---------- XML CFDI ---------- */'''
NEW_LECTOR = '''  /* ---------- lectura del PDF de la orden de compra del cliente ---------- */
  const PDFJS_WORKER="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  const lectorPDFListo=()=>!!(window.pdfjsLib&&window.pdfjsLib.getDocument);
  function textoDePDF(file){
    return new Promise((resolve,reject)=>{
      if(!lectorPDFListo()){reject(new Error("lector no disponible"));return;}
      const lib=window.pdfjsLib;
      try{if(lib.GlobalWorkerOptions&&!lib.GlobalWorkerOptions.workerSrc)lib.GlobalWorkerOptions.workerSrc=PDFJS_WORKER;}catch(e){}
      const fr=new FileReader();
      fr.onerror=()=>reject(new Error("no se pudo leer el archivo"));
      fr.onload=()=>{
        lib.getDocument({data:new Uint8Array(fr.result)}).promise.then(doc=>{
          const partes=[];
          const pagina=i=>{
            if(i>doc.numPages){resolve(partes.join("\\n"));return;}
            doc.getPage(i).then(pg=>pg.getTextContent()).then(c=>{
              partes.push(c.items.map(it=>it.str).join(" "));pagina(i+1);}).catch(reject);
          };
          pagina(1);
        }).catch(reject);
      };
      fr.readAsArrayBuffer(file);
    });
  }
  // Saca de la OC del cliente el folio, el subtotal y el total.
  function leeOC(txt){
    const t=String(txt||"").replace(/\\u00a0/g," ").replace(/\\s+/g," ");
    const num=s=>{const n=parseFloat(String(s).replace(/,/g,"").replace(/[^0-9.\\-]/g,""));return isFinite(n)?n:null;};
    // De cada etiqueta se toma el importe mayor: el gran total de la OC.
    const importe=etiqueta=>{
      const re=new RegExp(etiqueta+"[^0-9$]{0,18}\\\\$?\\\\s*([0-9][0-9,]*\\\\.[0-9]{2})","gi");
      let m,mejor=null;
      while((m=re.exec(t))!==null){const v=num(m[1]);if(v!=null&&(mejor==null||v>mejor))mejor=v;}
      return mejor;
    };
    const subtotal=importe("\\\\bsub\\\\s*-?\\\\s*total\\\\b")!=null?importe("\\\\bsub\\\\s*-?\\\\s*total\\\\b")
      :importe("\\\\bimporte\\\\s+neto\\\\b");
    const total=importe("\\\\b(?:gran\\\\s+)?total(?:\\\\s+a\\\\s+pagar|\\\\s+general)?\\\\b");
    const iva=importe("\\\\bi\\\\.?\\\\s?v\\\\.?\\\\s?a\\\\.?\\\\b");
    let oc=null;
    const pats=[
      /(?:orden\\s+de\\s+compra|purchase\\s+order)\\s*(?:n[uú]mero|n[uú]m\\.?|no\\.?|nro\\.?|#|:)?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/,
      /\\bO\\.?\\s?C\\.?\\s*(?:n[uú]mero|n[uú]m\\.?|no\\.?|#|:)\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/,
      /\\bP\\.?\\s?O\\.?\\s*(?:no\\.?|#|:)?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/,
      /\\bfolio\\s*(?:n[uú]m\\.?|no\\.?|#|:)?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/i];
    for(const re of pats){const m=t.match(re);
      if(m&&m[1]&&!/^(de|del|la|el|los|para|con|no|num|numero)$/i.test(m[1])){oc=m[1].replace(/[.,;:]+$/,"");break;}}
    return {oc,subtotal,total,iva};
  }

  /* ---------- XML CFDI ---------- */'''

# ------------------------------------------------- apartado en la orden de venta
OLD_FORM = '''        <div class="field"><label for="f-cot">Cotización de origen</label><select id="f-cot">${optList(state.cotizaciones,x=>x.folio+" · "+x.cliente,pre.cotizacionId||null)}</select></div>
        <div class="field"><label>Conceptos</label><div id="lineas"></div></div><div class="calc" id="calc"></div>`;'''
NEW_FORM = '''        <div class="field"><label for="f-cot">Cotización de origen</label><select id="f-cot">${optList(state.cotizaciones,x=>x.folio+" · "+x.cliente,pre.cotizacionId||null)}</select></div>
        <div class="field"><label>Orden de compra del cliente (PDF) <span style="color:var(--text-faint);font-weight:400">· valida subtotal y total y toma el número de OC</span></label>
          <label class="drop drop-sm" id="ocdrop">
            <input type="file" id="ocpdf" accept="application/pdf,.pdf" hidden>
            <b>Carga aquí el PDF de la OC del cliente</b>
            <div class="hint">Se leen el folio, el subtotal y el total y se comparan con esta orden de venta</div></label>
          <div id="ocres">${rec&&rec.ocDoc?ocResumenHTML(rec.ocDoc,rec):""}</div></div>
        <div class="field"><label>Conceptos</label><div id="lineas"></div></div><div class="calc" id="calc"></div>`;'''

OLD_SAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),ocCliente:$("#f-occ").value.trim(),fecha:$("#f-fecha").value,cotizacionId:$("#f-cot").value||null,ivaPct:+$("#f-iva").value||0,lineas};'''
NEW_SAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),ocCliente:$("#f-occ").value.trim(),fecha:$("#f-fecha").value,
          cotizacionId:$("#f-cot").value||null,ivaPct:+$("#f-iva").value||0,lineas};
        if(ocLeida)data.ocDoc=ocLeida;else if(rec&&rec.ocDoc)data.ocDoc=rec.ocDoc;'''

# resumen + cableado
OLD_HELPER = '''  function openForm(type,opts){'''
NEW_HELPER = '''  // Resultado de la validación de la OC contra los importes de la orden de venta.
  function ocResumenHTML(d,ov){
    const fila=(etq,pdf,sis)=>{
      if(pdf==null)return `<div class="ocrow ocwarn"><span>${etq}</span><span>no se encontró en el PDF</span></div>`;
      const dif=r2(pdf-sis),bien=Math.abs(dif)<=0.05;
      return `<div class="ocrow ${bien?"ocok":"ocbad"}"><span>${etq}</span>
        <span>PDF ${money(pdf)} · sistema ${money(sis)}${bien?"":" · diferencia "+money(dif)}</span></div>`;};
    const sub=d.subtotalOV!=null?d.subtotalOV:(ov?ovSubtotal(ov):0);
    const tot=d.totalOV!=null?d.totalOV:(ov?ovTotal(ov):0);
    return `<div class="ocres">
      <div class="ocrow ${d.oc?"ocok":"ocwarn"}"><span>Número de OC</span><span>${d.oc?escAttr(d.oc):"no se encontró en el PDF"}</span></div>
      ${fila("Subtotal",d.subtotal,sub)}
      ${fila("Total",d.total,tot)}
      <div class="ocfile">${escAttr(d.archivo||"")}${d.leidoEl?" · leído el "+fmtDate(d.leidoEl):""}</div></div>`;
  }
  function openForm(type,opts){'''

OLD_DECL = '''    let title,body,onsubmit,lineType=null,formLines=null,retEd=null,formRets=null,conEd=null;const t=todayStr();'''
NEW_DECL = '''    let title,body,onsubmit,lineType=null,formLines=null,retEd=null,formRets=null,conEd=null,ocLeida=null;const t=todayStr();'''

OLD_WIRE = '''    md.querySelectorAll(".ordbar").forEach(b=>activarOrden(b.parentElement));'''
NEW_WIRE = '''    // Lector del PDF de la orden de compra del cliente (solo en la orden de venta).
    const ocInput=$("#ocpdf");
    if(ocInput){
      const salida=$("#ocres");
      if(!lectorPDFListo())salida.innerHTML=`<p class="hintline" style="color:var(--warn)">El lector de PDF no cargó: captura el número de OC a mano.</p>`;
      ocInput.addEventListener("change",e=>{
        const f=e.target.files&&e.target.files[0];if(!f)return;
        salida.innerHTML=`<p class="hintline">Leyendo ${escAttr(f.name)}…</p>`;
        textoDePDF(f).then(txt=>{
          const d=leeOC(txt);
          const lineasAct=lineEd?lineEd.read().filter(l=>l.desc):[];
          const ovTmp={lineas:lineasAct,ivaPct:+($("#f-iva")||{value:ivaDefPct()}).value||0};
          d.archivo=f.name;d.leidoEl=todayStr();
          d.subtotalOV=ovSubtotal(ovTmp);d.totalOV=ovTotal(ovTmp);
          d.okSubtotal=d.subtotal!=null&&Math.abs(r2(d.subtotal-d.subtotalOV))<=0.05;
          d.okTotal=d.total!=null&&Math.abs(r2(d.total-d.totalOV))<=0.05;
          d.valida=d.okSubtotal&&d.okTotal;
          ocLeida=d;
          if(d.oc&&$("#f-occ")){$("#f-occ").value=d.oc;}
          salida.innerHTML=ocResumenHTML(d,null);
          toast(d.oc?("OC "+d.oc+(d.valida?" · importes correctos":" · revisa los importes")):"No se encontró el número de OC en el PDF");
        }).catch(err=>{salida.innerHTML=`<p class="hintline" style="color:var(--bad)">No se pudo leer el PDF: ${escAttr(err&&err.message?err.message:"error")}</p>`;});
      });
    }
    md.querySelectorAll(".ordbar").forEach(b=>activarOrden(b.parentElement));'''

# ------------------------------------------------------- pill en la lista de OV
OLD_ROW = '''      return `<tr><td class="mono">${o.folio}</td><td>${o.cliente}</td><td class="mono">${o.ocCliente||"—"}</td>'''
NEW_ROW = '''      const oc=o.ocDoc;
      return `<tr><td class="mono">${o.folio}</td><td>${o.cliente}</td><td class="mono">${o.ocCliente||"—"}
        ${oc?`<div><span class="pill ${oc.valida?"p-good":"p-bad"}" title="${escAttr((oc.archivo||"")+" · PDF "+money(oc.total||0))}">${oc.valida?"OC validada":"OC con diferencias"}</span></div>`:""}</td>'''

CSS_OLD = '''  .maillist{max-height:220px}'''
CSS_NEW = '''  .drop-sm{padding:14px;gap:2px}
  .drop-sm b{font-size:13px}
  .ocres{margin-top:8px;border:1px solid var(--border);border-radius:10px;overflow:hidden}
  .ocrow{display:flex;justify-content:space-between;gap:12px;padding:8px 12px;font-size:12.5px;border-bottom:1px solid var(--border)}
  .ocrow:last-of-type{border-bottom:0}
  .ocrow span:first-child{font-weight:600;color:var(--text)}
  .ocrow span:last-child{color:var(--text-dim);text-align:right}
  .ocrow.ocok{background:color-mix(in srgb,var(--good) 10%,transparent)}
  .ocrow.ocbad{background:color-mix(in srgb,var(--bad) 12%,transparent)}
  .ocrow.ocwarn{background:color-mix(in srgb,var(--warn) 12%,transparent)}
  .ocfile{padding:6px 12px;font-size:11px;color:var(--text-faint);background:var(--bg)}
  .maillist{max-height:220px}'''

for path in [ERP, APPJS]:
    t = io.open(path, encoding="utf-8").read()
    t = sub(t, OLD_LECTOR, NEW_LECTOR, "lector " + os.path.basename(path))
    t = sub(t, OLD_FORM, NEW_FORM, "form OV " + os.path.basename(path))
    t = sub(t, OLD_SAVE, NEW_SAVE, "guardar OV " + os.path.basename(path))
    t = sub(t, OLD_HELPER, NEW_HELPER, "resumen " + os.path.basename(path))
    t = sub(t, OLD_DECL, NEW_DECL, "declaracion " + os.path.basename(path))
    t = sub(t, OLD_WIRE, NEW_WIRE, "cableado " + os.path.basename(path))
    t = sub(t, OLD_ROW, NEW_ROW, "fila OV " + os.path.basename(path))
    io.open(path, "w", encoding="utf-8").write(t)
    print("JS:", os.path.basename(path))

# scripts de pdf.js y estilos
t = io.open(ERP, encoding="utf-8").read()
t = sub(t, '<div class="overlay" id="overlay"><div class="modal" id="modal"></div></div>',
        PDFJS + '<div class="overlay" id="overlay"><div class="modal" id="modal"></div></div>', "script pdfjs erp")
t = sub(t, CSS_OLD, CSS_NEW, "css erp")
io.open(ERP, "w", encoding="utf-8").write(t)
print("erp.html: pdf.js + css")

t = io.open(INDEX, encoding="utf-8").read()
t = sub(t, '<script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>\n',
        '<script src="https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"></script>\n' + PDFJS,
        "script pdfjs index")
t = sub(t, CSS_OLD, CSS_NEW, "css index")
io.open(INDEX, "w", encoding="utf-8").write(t)
print("Index.html: pdf.js + css")
