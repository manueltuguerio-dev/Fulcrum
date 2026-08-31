# -*- coding: utf-8 -*-
"""Lector de OC: SUB. TOTAL, NUMERO/NUMBER y ordenes sin etiqueta.
Ademas: retenciones e impuestos en las ordenes de venta."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

# ------------------------------------------------------------- 1) lector de OC
OLD_LEE = '''  // Saca de la OC del cliente el folio, el subtotal y el total.
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
    const iva=importe("\\\\bi\\\\.?\\\\s?v\\\\.?\\\\s?a\\\\.?\\\\b");'''

NEW_LEE = '''  // Saca de la OC del cliente el folio, el subtotal y el total.
  function leeOC(txt){
    const t=String(txt||"").replace(/\\u00a0/g," ").replace(/\\s+/g," ");
    const num=s=>{const n=parseFloat(String(s).replace(/,/g,""));return isFinite(n)?n:null;};
    const MONTO="[^0-9$]{0,20}\\\\$?\\\\s*([0-9][0-9,]*\\\\.[0-9]{2})";
    // De cada etiqueta se toma el importe mayor. Con "evitarSub" se descartan los
    // renglones tipo "SUB. TOTAL" al buscar el gran total.
    const importe=(etiqueta,evitarSub)=>{
      const re=new RegExp(etiqueta+MONTO,"gi");
      let m,mejor=null;
      while((m=re.exec(t))!==null){
        if(evitarSub){const antes=t.slice(Math.max(0,m.index-6),m.index).toLowerCase();
          if(/sub[\\s.\\-_]*$/.test(antes))continue;}
        const v=num(m[1]);if(v!=null&&(mejor==null||v>mejor))mejor=v;}
      return mejor;
    };
    // "SUBTOTAL", "SUB TOTAL", "SUB. TOTAL", "SUB-TOTAL" o "IMPORTE NETO".
    let subtotal=importe("\\\\bsub[\\\\s.\\\\-_]*total\\\\b");
    if(subtotal==null)subtotal=importe("\\\\bimporte\\\\s+neto\\\\b");
    if(subtotal==null)subtotal=importe("\\\\bsuma\\\\b");
    const total=importe("\\\\b(?:gran\\\\s+)?total(?:\\\\s+a\\\\s+pagar|\\\\s+general|\\\\s+neto)?\\\\b",true);
    const iva=importe("\\\\bi\\\\.?\\\\s?v\\\\.?\\\\s?a\\\\.?\\\\b");'''

OLD_PATS = '''    let oc=null;
    const basura=/^(de|del|la|el|los|las|para|con|no|num|numero|nro|folio|fecha|cliente|proveedor|total|subtotal|iva|orden|compra|purchase|order)$/i;
    const pats=[
      // 1) con indicador explícito de número
      /(?:orden\\s+de\\s+compra|purchase\\s+order|\\bo\\.?\\s?c\\.?|\\bp\\.?\\s?o\\.?)\\s*(?:n[uú]mero|n[uú]m\\.?|no\\.?|nro\\.?|#|:)\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{1,24})/i,
      // 2) un folio con pinta de OC en cualquier parte del documento
      /\\b((?:oc|po)[-\\/_ ]?[A-Za-z0-9][A-Za-z0-9\\-\\/_]{1,20})\\b/i,
      // 3) etiqueta de orden de compra seguida del folio
      /(?:orden\\s+de\\s+compra|purchase\\s+order)\\s*:?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/i,
      // 4) último recurso: folio del documento
      /\\bfolio\\s*(?:n[uú]m\\.?|no\\.?|#|:)?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/i];
    for(const re of pats){const m=t.match(re);
      if(m&&m[1]&&!basura.test(m[1])){oc=m[1].replace(/[.,;:]+$/,"").replace(/^[-\\/_ ]+/,"");break;}}'''

NEW_PATS = '''    let oc=null;
    const basura=/^(de|del|la|el|los|las|para|con|no|num|numero|number|nro|folio|fecha|date|cliente|consignar|consign|proveedor|supplier|total|subtotal|iva|orden|compra|purchase|order|moneda|currency)$/i;
    const limpia=s=>String(s||"").replace(/[.,;:]+$/,"").replace(/^[-\\/_ ]+/,"");
    const pats=[
      // 1) etiqueta de orden de compra con indicador explícito de número
      /(?:orden\\s+de\\s+compra|purchase\\s+order|\\bo\\.?\\s?c\\.?|\\bp\\.?\\s?o\\.?)\\s*(?:n[uú]mero|n[uú]m\\.?|no\\.?|nro\\.?|number|#|:)\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{1,24})/i,
      // 2) el recuadro "NUMERO/NUMBER" de las órdenes con código de barras
      /\\b(?:n[uú]mero|number)\\s*\\/\\s*(?:number|n[uú]mero)\\b[^A-Za-z0-9]{0,12}([A-Za-z0-9][A-Za-z0-9\\-\\/_]{3,24})/i,
      /\\b(?:n[uú]mero|number)\\b\\s*:?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{3,24})/i,
      // 3) un folio con pinta de OC en cualquier parte del documento
      /\\b((?:oc|po)[-\\/_ ]?[A-Za-z0-9][A-Za-z0-9\\-\\/_]{1,20})\\b/i,
      // 4) etiqueta de orden de compra seguida del folio
      /(?:orden\\s+de\\s+compra|purchase\\s+order)\\s*:?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/i,
      // 5) folio del documento
      /\\bfolio\\s*(?:n[uú]m\\.?|no\\.?|#|:)?\\s*([A-Za-z0-9][A-Za-z0-9\\-\\/_]{2,24})/i];
    for(const re of pats){const m=t.match(re);
      if(m&&m[1]&&!basura.test(m[1])){oc=limpia(m[1]);break;}}
    // 6) Órdenes que traen el número suelto, sin ninguna etiqueta: se toma el número
    // largo (9 a 14 dígitos) que no sea fecha ni importe.
    if(!oc){const cand=(t.match(/\\b\\d{9,14}\\b/g)||[]).filter(n=>{
        const i=t.indexOf(n);const antes=t.slice(Math.max(0,i-14),i).toLowerCase();
        return !/(rfc|tel|cp|c\\.p\\.)[^0-9]{0,4}$/.test(antes);});
      if(cand.length)oc=cand[0];}'''

# --------------------------------------------- 2) retenciones en orden de venta
OLD_OVTOT = '''  const ovSubtotal=o=>r2(sumLineas("venta",o.lineas));
  const ovCosto=o=>(o.lineas||[]).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0);
  const ovTotal=o=>r2(ovSubtotal(o)*(1+ivaR(o)));'''
NEW_OVTOT = '''  const ovSubtotal=o=>r2(sumLineas("venta",o.lineas));
  const ovCosto=o=>(o.lineas||[]).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0);
  // Las órdenes de venta también admiten retenciones: se restan del total.
  const ovRetencion=o=>{const s=ovSubtotal(o);return r2((o.retenciones||[]).reduce((a,r)=>a+s*(+r.tasa||0)/100,0));};
  const ovIva=o=>r2(ovSubtotal(o)*ivaR(o));
  const ovTotal=o=>r2(ovSubtotal(o)+ovIva(o)-ovRetencion(o));'''

OLD_OVFORM = '''        <div class="field"><label>Conceptos</label><div id="lineas"></div></div><div class="calc" id="calc"></div>`;
      onsubmit=()=>{const lineas=lineEd.read().filter(l=>l.desc&&l.cantidad>0);
        if(!lineas.length){toast("Agrega al menos una línea.");return false;}
        const folio=$("#f-folio").value.trim();
        if(!folio){toast("Escribe el folio.");return false;}
        if(folioRepetido(state.ventas,folio,editing)){toast("Ya existe la orden de venta "+folio);return false;}'''
NEW_OVFORM = '''        <div class="field"><label>Conceptos</label><div id="lineas"></div></div>
        <div class="field"><label>Retenciones e impuestos <span style="color:var(--text-faint);font-weight:400">· % sobre subtotal · se cargan del cliente</span></label><div id="rets"></div></div>
        <div class="calc" id="calc"></div>`;
      onsubmit=()=>{const lineas=lineEd.read().filter(l=>l.desc&&l.cantidad>0);
        if(!lineas.length){toast("Agrega al menos una línea.");return false;}
        const folio=$("#f-folio").value.trim();
        if(!folio){toast("Escribe el folio.");return false;}
        if(folioRepetido(state.ventas,folio,editing)){toast("Ya existe la orden de venta "+folio);return false;}'''

OLD_OVSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),ocCliente:$("#f-occ").value.trim(),fecha:$("#f-fecha").value,
          cotizacionId:$("#f-cot").value||null,ivaPct:+$("#f-iva").value||0,lineas};'''
NEW_OVSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),ocCliente:$("#f-occ").value.trim(),fecha:$("#f-fecha").value,
          cotizacionId:$("#f-cot").value||null,ivaPct:+$("#f-iva").value||0,
          retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''

# al convertir una cotizacion, hereda sus retenciones e IVA
OLD_FROMCOT = '''      const src=editing?rec:(opts.fromCot?(function(){const c=state.cotizaciones.find(x=>x.id===opts.fromCot);return c?{cliente:c.cliente,ocCliente:"",fecha:t,cotizacionId:c.id,lineas:(c.lineas||[]).map(l=>({desc:l.desc,cantidad:l.cantidad,costo:l.costo,precio:lineaPrecio(l)}))}:null;})():null);
      const pre=src||{};formLines=pre.lineas||null;'''
NEW_FROMCOT = '''      const src=editing?rec:(opts.fromCot?(function(){const c=state.cotizaciones.find(x=>x.id===opts.fromCot);
        return c?{cliente:c.cliente,ocCliente:"",fecha:t,cotizacionId:c.id,ivaPct:c.ivaPct,
          retenciones:(c.retenciones||[]).map(r=>({concepto:r.concepto,tasa:r.tasa})),
          lineas:(c.lineas||[]).map(l=>({desc:l.desc,unidad:l.unidad,analitica:l.analitica,cantidad:l.cantidad,costo:l.costo,precio:lineaPrecio(l)}))}:null;})():null);
      const pre=src||{};formLines=pre.lineas||null;formRets=pre.retenciones||null;'''

OLD_OVIVA = '''        <div class="field" style="max-width:160px"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${(rec&&rec.ivaPct!=null)?rec.ivaPct:ivaDefPct()}"></div>'''
NEW_OVIVA = '''        <div class="field" style="max-width:160px"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${(pre.ivaPct!=null)?pre.ivaPct:ivaDefPct()}"></div>'''

OLD_USARETS = '''      const usaRets=isCot||lineType==="factura";
      if(usaRets){retEd=makeRetEditor($("#rets"),rec?rec.retenciones:null,doCalc);doCalc();'''
NEW_USARETS = '''      const usaRets=isCot||lineType==="factura"||lineType==="venta";
      if(usaRets){retEd=makeRetEditor($("#rets"),(rec&&rec.retenciones)||formRets||null,doCalc);doCalc();'''

# PDF de la orden de venta con sus retenciones
OLD_SPECV = '''  function specVenta(v){const sub=ovSubtotal(v),iva=sub*ivaR(v),c=state.cotizaciones.find(x=>x.id===v.cotizacionId);
    return ({kind:"Orden de venta",folio:v.folio,partyLabel:"CLIENTE",party:v.cliente,
      metaLeft:["OC del cliente: "+(v.ocCliente||"—"),"Cotización: "+(c?c.folio:"—")],metaRight:["Fecha: "+fmtDate(v.fecha),"Folio: "+v.folio],
      columns:["CANT.","UNI.","DESCRIPCIÓN","PRECIO UNIT","PRECIO TOTAL"],rows:(v.lineas||[]).map(l=>line5(l,"precio")),
      totals:[{label:"SUBTOTAL",value:money(sub)},{label:ivaLbl(v).toUpperCase(),value:money(iva)},{label:"TOTAL",value:money(sub+iva),bold:true,rule:true}],
      contact:[EMISOR.email,EMISOR.contacto,"¡Gracias por su preferencia!"],filename:v.folio+".pdf"});}'''
NEW_SPECV = '''  function specVenta(v){const sub=ovSubtotal(v),iva=ovIva(v),c=state.cotizaciones.find(x=>x.id===v.cotizacionId);
    const totals=[{label:"SUBTOTAL",value:money(sub)},{label:ivaLbl(v).toUpperCase(),value:money(iva)}];
    (v.retenciones||[]).filter(r=>r.tasa).forEach(r=>totals.push({label:(r.concepto||"Retención").toUpperCase()+" "+(+r.tasa)+"%",value:money(r2(sub*(+r.tasa)/100))}));
    totals.push({label:"TOTAL",value:money(ovTotal(v)),bold:true,rule:true});
    return ({kind:"Orden de venta",folio:v.folio,partyLabel:"CLIENTE",party:v.cliente,
      metaLeft:["OC del cliente: "+(v.ocCliente||"—"),"Cotización: "+(c?c.folio:"—")],metaRight:["Fecha: "+fmtDate(v.fecha),"Folio: "+v.folio],
      columns:["CANT.","UNI.","DESCRIPCIÓN","PRECIO UNIT","PRECIO TOTAL"],rows:(v.lineas||[]).map(l=>line5(l,"precio")),totals,
      contact:[EMISOR.email,EMISOR.contacto,"¡Gracias por su preferencia!"],filename:v.folio+".pdf"});}'''

for p in JS:
    t = io.open(p, encoding="utf-8").read()
    t = sub(t, OLD_LEE, NEW_LEE, "importes de la OC")
    t = sub(t, OLD_PATS, NEW_PATS, "numero de la OC")
    t = sub(t, OLD_OVTOT, NEW_OVTOT, "total de la OV")
    t = sub(t, OLD_OVFORM, NEW_OVFORM, "form OV")
    t = sub(t, OLD_OVSAVE, NEW_OVSAVE, "guardar OV")
    t = sub(t, OLD_FROMCOT, NEW_FROMCOT, "desde cotizacion")
    t = sub(t, OLD_OVIVA, NEW_OVIVA, "iva de la OV")
    t = sub(t, OLD_USARETS, NEW_USARETS, "editor de retenciones")
    t = sub(t, OLD_SPECV, NEW_SPECV, "pdf de la OV")
    io.open(p, "w", encoding="utf-8").write(t)
    print("parcheado:", os.path.basename(p))
