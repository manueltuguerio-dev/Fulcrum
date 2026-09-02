# -*- coding: utf-8 -*-
"""Moneda (MXN/USD) en cotizaciones, ordenes de venta y facturas."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS   = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]
CSS  = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "Index.html")]

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

# --------------------------------------------------------------- 1) formato
OLD_MONEY = '''  const fmtMoney=new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:2});
  const money=n=>fmtMoney.format(n||0);'''
NEW_MONEY = '''  const fmtMoney=new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",minimumFractionDigits:2});
  // Cada documento puede llevar su moneda: money(importe, documento) la respeta.
  const fmtCache={MXN:fmtMoney};
  function fmtDe(cur){const k=(cur||"MXN").toUpperCase();
    if(!fmtCache[k]){try{fmtCache[k]=new Intl.NumberFormat("es-MX",{style:"currency",currency:k,minimumFractionDigits:2});}
      catch(e){fmtCache[k]=fmtMoney;}}
    return fmtCache[k];}
  const monedaDe=o=>{if(!o)return "MXN";if(typeof o==="string")return o.toUpperCase()||"MXN";
    return String(o.moneda||"MXN").toUpperCase();};
  const money=(n,doc)=>fmtDe(monedaDe(doc)).format(n||0);'''

# ------------------------------------------------------- 2) catalogo de monedas
OLD_CATS = '''    {k:"metodosPago",label:"Métodos de pago",sing:"método de pago",cols:["nombre"],'''
NEW_CATS = '''    {k:"monedas",label:"Monedas",sing:"moneda",cols:["clave","nombre","tc"],
      campos:[{k:"clave",label:"Código",ph:"USD",req:true},{k:"nombre",label:"Nombre",ph:"Dólar estadounidense"},
        {k:"tc",label:"Tipo de cambio a MXN",tipo:"num",v:1,ayuda:"Se propone al elegir esta moneda en un documento."}]},
    {k:"metodosPago",label:"Métodos de pago",sing:"método de pago",cols:["nombre"],'''

OLD_DEF = '''    if(!c.metodosPago.length)c.metodosPago=["Transferencia","Cheque","Efectivo","Tarjeta"].map(n=>({id:uid(),nombre:n}));'''
NEW_DEF = '''    if(!c.metodosPago.length)c.metodosPago=["Transferencia","Cheque","Efectivo","Tarjeta"].map(n=>({id:uid(),nombre:n}));
    if(!c.monedas.length)c.monedas=[{id:uid(),clave:"MXN",nombre:"Peso mexicano",tc:1},
      {id:uid(),clave:"USD",nombre:"Dólar estadounidense",tc:17}];'''

OLD_HELP = '''  const metodosPago=()=>{const m=cat("metodosPago").map(x=>x.nombre).filter(Boolean);
    return m.length?m:["Transferencia","Cheque","Efectivo","Tarjeta"];};'''
NEW_HELP = '''  const metodosPago=()=>{const m=cat("metodosPago").map(x=>x.nombre).filter(Boolean);
    return m.length?m:["Transferencia","Cheque","Efectivo","Tarjeta"];};
  /* ---------- monedas y tipo de cambio ---------- */
  const monedasCat=()=>{const m=cat("monedas").filter(x=>x.clave);
    return m.length?m:[{clave:"MXN",nombre:"Peso mexicano",tc:1},{clave:"USD",nombre:"Dólar estadounidense",tc:17}];};
  const tcCatalogo=cl=>{const m=monedasCat().find(x=>String(x.clave).toUpperCase()===String(cl||"").toUpperCase());
    return m&&+m.tc>0?+m.tc:1;};
  // Tipo de cambio del documento: 1 si está en pesos.
  const tcDe=o=>{const cl=monedaDe(o);if(cl==="MXN")return 1;
    const v=o&&typeof o==="object"?+o.tc:0;return v>0?v:tcCatalogo(cl);};
  // Equivalente en pesos, para los acumulados que mezclan documentos.
  const mxn=(n,o)=>r2((+n||0)*tcDe(o));
  const monedaPill=o=>monedaDe(o)==="MXN"?"":` <span class="pill p-mut" title="Tipo de cambio ${tcDe(o)}">${monedaDe(o)}</span>`;
  const campoMoneda=(rec,pre)=>{const cl=monedaDe(pre||rec||{}),tc=(pre&&pre.tc)||(rec&&rec.tc)||tcCatalogo(cl);
    return `<div class="grid2">
      <div class="field"><label for="f-mon">Moneda</label><select id="f-mon">${monedasCat().map(m=>
        `<option value="${escAttr(m.clave)}" ${String(m.clave).toUpperCase()===cl?"selected":""}>${escAttr(m.clave)}${m.nombre?" · "+escAttr(m.nombre):""}</option>`).join("")}</select></div>
      <div class="field" id="wrap-tc" style="${cl==="MXN"?"display:none":""}"><label for="f-tc">Tipo de cambio a MXN</label>
        <input type="number" id="f-tc" min="0" step="any" value="${cl==="MXN"?1:tc}"></div></div>`;};
  const leeMoneda=()=>{const s=$("#f-mon");if(!s)return {moneda:"MXN",tc:1};
    const cl=String(s.value||"MXN").toUpperCase();
    return {moneda:cl,tc:cl==="MXN"?1:(+($("#f-tc")||{value:0}).value||tcCatalogo(cl))};};'''

# --------------------------------------------------------- 3) formularios
OLD_COT = '''        <div class="field"><label for="f-ent">Tiempo de entrega</label>'''
NEW_COT = '''        ${campoMoneda(rec,null)}
        <div class="field"><label for="f-ent">Tiempo de entrega</label>'''

OLD_COTSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),fecha:$("#f-fecha").value,vigencia:+$("#f-vig").value,
          entrega:$("#f-ent")?$("#f-ent").value.trim():"",ivaPct:+$("#f-iva").value||0,'''
NEW_COTSAVE = '''        const mon=leeMoneda();
        const data={folio,cliente:$("#f-cli").value.trim(),fecha:$("#f-fecha").value,vigencia:+$("#f-vig").value,
          entrega:$("#f-ent")?$("#f-ent").value.trim():"",moneda:mon.moneda,tc:mon.tc,ivaPct:+$("#f-iva").value||0,'''

OLD_FAC = '''        <div class="field" style="max-width:160px"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${rec&&rec.ivaPct!=null?rec.ivaPct:ivaDefPct()}"></div>
        <div class="field"><label>Conceptos</label><div id="lineas"></div></div>
        <div class="field"><label>Retenciones e impuestos'''
NEW_FAC = '''        <div class="field" style="max-width:160px"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${rec&&rec.ivaPct!=null?rec.ivaPct:ivaDefPct()}"></div>
        ${campoMoneda(rec,null)}
        <div class="field"><label>Conceptos</label><div id="lineas"></div></div>
        <div class="field"><label>Retenciones e impuestos'''

OLD_FACSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),clienteId:cid,fecha:$("#f-fecha").value,vencimiento:$("#f-venc").value,
          flujo:$("#f-flujo").value,ivaPct:+$("#f-iva").value||0,retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''
NEW_FACSAVE = '''        const monF=leeMoneda();
        const data={folio,cliente:$("#f-cli").value.trim(),clienteId:cid,fecha:$("#f-fecha").value,vencimiento:$("#f-venc").value,
          flujo:$("#f-flujo").value,moneda:monF.moneda,tc:monF.tc,ivaPct:+$("#f-iva").value||0,
          retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''

OLD_OV = '''        <div class="field"><label for="f-cot">Cotización de origen</label>'''
NEW_OV = '''        ${campoMoneda(rec,pre)}
        <div class="field"><label for="f-cot">Cotización de origen</label>'''

OLD_OVSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),ocCliente:$("#f-occ").value.trim(),fecha:$("#f-fecha").value,
          cotizacionId:$("#f-cot").value||null,ivaPct:+$("#f-iva").value||0,
          retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''
NEW_OVSAVE = '''        const monV=leeMoneda();
        const data={folio,cliente:$("#f-cli").value.trim(),ocCliente:$("#f-occ").value.trim(),fecha:$("#f-fecha").value,
          cotizacionId:$("#f-cot").value||null,moneda:monV.moneda,tc:monV.tc,ivaPct:+$("#f-iva").value||0,
          retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''

# herencia cotizacion -> orden de venta
OLD_HER = '''        return c?{cliente:c.cliente,ocCliente:"",fecha:t,cotizacionId:c.id,ivaPct:c.ivaPct,'''
NEW_HER = '''        return c?{cliente:c.cliente,ocCliente:"",fecha:t,cotizacionId:c.id,ivaPct:c.ivaPct,moneda:c.moneda,tc:c.tc,'''

# herencia orden de venta -> factura
OLD_OVFAC = '''      const f={id:uid(),folio:nextFolio("FAC",state.facturas),cliente:v.cliente,fecha:todayStr(),vencimiento:addDays(todayStr(),30),flujo:"creada",lineas,ventaId:v.id};'''
NEW_OVFAC = '''      const f={id:uid(),folio:nextFolio("FAC",state.facturas),cliente:v.cliente,fecha:todayStr(),vencimiento:addDays(todayStr(),30),
        flujo:"creada",moneda:v.moneda,tc:v.tc,ivaPct:v.ivaPct,retenciones:(v.retenciones||[]).map(r=>({concepto:r.concepto,tasa:r.tasa})),lineas,ventaId:v.id};'''

# cotizacion creada desde XML
OLD_XMLCOT = '''          vigencia:+$("#f-vig").value||15,entrega:"",estatus:"borrador",facturada:false,ivaPct:(cli.ivaPct!=null?cli.ivaPct:ivaDefPct()),'''
NEW_XMLCOT = '''          vigencia:+$("#f-vig").value||15,entrega:"",estatus:"borrador",facturada:false,moneda:"MXN",tc:1,
          ivaPct:(cli.ivaPct!=null?cli.ivaPct:ivaDefPct()),'''

# ------------------------------------------------------------- 4) cableado
OLD_WIRE = '''    // Lector del PDF de la orden de compra del cliente (solo en la orden de venta).'''
NEW_WIRE = '''    // Moneda del documento: muestra el tipo de cambio y actualiza el cálculo.
    const monSel=$("#f-mon");
    if(monSel){
      const wrap=$("#wrap-tc"),tcInp=$("#f-tc");
      const pinta=()=>{const cl=String(monSel.value||"MXN").toUpperCase();
        if(wrap)wrap.style.display=cl==="MXN"?"none":"";
        if(tcInp&&cl!=="MXN"&&!(+tcInp.value>0))tcInp.value=tcCatalogo(cl);
        if(tcInp&&cl==="MXN")tcInp.value=1;};
      monSel.addEventListener("change",()=>{pinta();if(typeof recalcDoc==="function")recalcDoc();});
      if(tcInp)tcInp.addEventListener("input",()=>{if(typeof recalcDoc==="function")recalcDoc();});
      pinta();
    }
    // Lector del PDF de la orden de compra del cliente (solo en la orden de venta).'''

OLD_DOCALC = '''      const doCalc=()=>{const lines=lineEd?lineEd.read():[],s=r2(sumLineas(lineType,lines)),pct=+(tasaForm()*100).toFixed(4),iva=r2(s*tasaForm());'''
NEW_DOCALC = '''      const doCalc=()=>{const lines=lineEd?lineEd.read():[],s=r2(sumLineas(lineType,lines)),pct=+(tasaForm()*100).toFixed(4),iva=r2(s*tasaForm());
        const mDoc=$("#f-mon")?{moneda:$("#f-mon").value}:null;
        const money=(n)=>fmtDe(monedaDe(mDoc)).format(n||0);'''

OLD_RECALCDOC = '''      lineEd=makeLineEditor(lineType,$("#lineas"),rec?rec.lineas:formLines,doCalc,catalog);'''
NEW_RECALCDOC = '''      lineEd=makeLineEditor(lineType,$("#lineas"),rec?rec.lineas:formLines,doCalc,catalog);
      recalcDoc=doCalc;'''

OLD_DECL2 = '''    let title,body,onsubmit,lineType=null,formLines=null,retEd=null,formRets=null,conEd=null,ocLeida=null;const t=todayStr();'''
NEW_DECL2 = '''    let title,body,onsubmit,lineType=null,formLines=null,retEd=null,formRets=null,conEd=null,ocLeida=null,recalcDoc=null;const t=todayStr();'''

# -------------------------------------------------- 5) listas con su moneda
OLD_LCOT = '''      <td class="r num strong" title="${(c.retenciones||[]).length?"Neto de retenciones":""}">${money(cotTotal(c))}'''
NEW_LCOT = '''      <td class="r num strong" title="${(c.retenciones||[]).length?"Neto de retenciones":""}">${money(cotTotal(c),c)}${monedaPill(c)}'''

OLD_LOV = '''<td>${fmtDate(o.fecha)}</td><td class="r num strong">${money(ovTotal(o))}</td>'''
NEW_LOV = '''<td>${fmtDate(o.fecha)}</td><td class="r num strong">${money(ovTotal(o),o)}${monedaPill(o)}</td>'''

OLD_LFAC = '''      <td class="r num">${money(facTotal(f))}</td><td class="r num strong" style="color:${saldo>CENTAVO&&todayStr()>f.vencimiento?"var(--bad)":"inherit"}">${money(saldo)}</td>'''
NEW_LFAC = '''      <td class="r num">${money(facTotal(f),f)}${monedaPill(f)}</td><td class="r num strong" style="color:${saldo>CENTAVO&&todayStr()>f.vencimiento?"var(--bad)":"inherit"}">${money(saldo,f)}</td>'''

OLD_SELTOT = '''    const selTot=state.cotizaciones.filter(c=>sel.indexOf(c.id)>=0).reduce((a,c)=>a+cotTotal(c),0);'''
NEW_SELTOT = '''    const selTot=state.cotizaciones.filter(c=>sel.indexOf(c.id)>=0).reduce((a,c)=>a+mxn(cotTotal(c),c),0);'''

# --------------------------------------------------- 6) acumulados en pesos
OLD_TOT = '''    const facturado=state.facturas.reduce((a,f)=>a+facTotal(f),0);
    const cobrado=state.pagos.reduce((a,p)=>a+p.monto,0);
    const porCobrar=state.facturas.reduce((a,f)=>a+facSaldo(f),0);
    const vencido=state.facturas.filter(f=>facSaldo(f)>CENTAVO&&todayStr()>f.vencimiento).reduce((a,f)=>a+facSaldo(f),0);
    const porPagar=state.ordenes.filter(o=>o.estatus!=="pagada").reduce((a,o)=>a+ocTotal(o),0);
    const cotAb=state.cotizaciones.filter(c=>c.estatus==="borrador"||c.estatus==="enviada");
    const cotMonto=cotAb.reduce((a,c)=>a+cotSubtotal(c)*(1+ivaR(c)),0);'''
NEW_TOT = '''    // Los acumulados se llevan a pesos con el tipo de cambio de cada documento.
    const facturado=state.facturas.reduce((a,f)=>a+mxn(facTotal(f),f),0);
    const cobrado=state.pagos.reduce((a,p)=>a+mxn(p.monto,p),0);
    const porCobrar=state.facturas.reduce((a,f)=>a+mxn(facSaldo(f),f),0);
    const vencido=state.facturas.filter(f=>facSaldo(f)>CENTAVO&&todayStr()>f.vencimiento).reduce((a,f)=>a+mxn(facSaldo(f),f),0);
    const porPagar=state.ordenes.filter(o=>o.estatus!=="pagada").reduce((a,o)=>a+mxn(ocTotal(o),o),0);
    const cotAb=state.cotizaciones.filter(c=>c.estatus==="borrador"||c.estatus==="enviada");
    const cotMonto=cotAb.reduce((a,c)=>a+mxn(cotSubtotal(c)*(1+ivaR(c)),c),0);'''

OLD_PROJ = '''    state.facturas.forEach(f=>{const s=facSaldo(f);if(s>CENTAVO)add(monthKey(f.vencimiento),"cobrar",s);});
    state.ordenes.forEach(o=>{if(o.estatus!=="pagada")add(monthKey(o.fechaPago||o.fecha),"pagar",ocTotal(o));});'''
NEW_PROJ = '''    state.facturas.forEach(f=>{const s=facSaldo(f);if(s>CENTAVO)add(monthKey(f.vencimiento),"cobrar",mxn(s,f));});
    state.ordenes.forEach(o=>{if(o.estatus!=="pagada")add(monthKey(o.fechaPago||o.fecha),"pagar",mxn(ocTotal(o),o));});'''

OLD_PROY = '''    const ventaFac=facturas.reduce((a,f)=>a+facSubtotal(f),0);
    const ventaOV=ventas.reduce((a,v)=>a+ovSubtotal(v),0);
    const venta=ventaFac>0?ventaFac:(ventaOV>0?ventaOV:cots.reduce((a,c)=>a+cotSubtotal(c),0));'''
NEW_PROY = '''    const ventaFac=facturas.reduce((a,f)=>a+mxn(facSubtotal(f),f),0);
    const ventaOV=ventas.reduce((a,v)=>a+mxn(ovSubtotal(v),v),0);
    const venta=ventaFac>0?ventaFac:(ventaOV>0?ventaOV:cots.reduce((a,c)=>a+mxn(cotSubtotal(c),c),0));'''

OLD_DASH = '''    const venta=state.facturas.reduce((a,f)=>a+facSubtotal(f),0);
    const costo=state.facturas.reduce((a,f)=>a+facCosto(f),0);'''
NEW_DASH = '''    const venta=state.facturas.reduce((a,f)=>a+mxn(facSubtotal(f),f),0);
    const costo=state.facturas.reduce((a,f)=>a+mxn(facCosto(f),f),0);'''

# ------------------------------------------------------------ 7) documentos
OLD_SPECC = '''      metaRight:["Emitido el: "+fmtDate(c.fecha),"Folio: "+c.folio],'''
NEW_SPECC = '''      metaRight:["Emitido el: "+fmtDate(c.fecha),"Folio: "+c.folio,"Moneda: "+monedaDe(c)+(monedaDe(c)!=="MXN"?" · T.C. "+tcDe(c):"")],'''

OLD_SPECF = '''      metaRight:["Emisión: "+fmtDate(f.fecha),"Vence: "+fmtDate(f.vencimiento),"Folio: "+f.folio],'''
NEW_SPECF = '''      metaRight:["Emisión: "+fmtDate(f.fecha),"Vence: "+fmtDate(f.vencimiento),"Folio: "+f.folio,"Moneda: "+monedaDe(f)+(monedaDe(f)!=="MXN"?" · T.C. "+tcDe(f):"")],'''

OLD_SPECV2 = '''      metaLeft:["OC del cliente: "+(v.ocCliente||"—"),"Cotización: "+(c?c.folio:"—")],metaRight:["Fecha: "+fmtDate(v.fecha),"Folio: "+v.folio],'''
NEW_SPECV2 = '''      metaLeft:["OC del cliente: "+(v.ocCliente||"—"),"Cotización: "+(c?c.folio:"—")],
      metaRight:["Fecha: "+fmtDate(v.fecha),"Folio: "+v.folio,"Moneda: "+monedaDe(v)+(monedaDe(v)!=="MXN"?" · T.C. "+tcDe(v):"")],'''

for p in JS:
    t = io.open(p, encoding="utf-8").read()
    t = sub(t, OLD_MONEY, NEW_MONEY, "money")
    t = sub(t, OLD_CATS, NEW_CATS, "catalogo monedas")
    t = sub(t, OLD_DEF, NEW_DEF, "monedas por defecto")
    t = sub(t, OLD_HELP, NEW_HELP, "helpers de moneda")
    t = sub(t, OLD_COT, NEW_COT, "campo en cotizacion")
    t = sub(t, OLD_COTSAVE, NEW_COTSAVE, "guardar cotizacion")
    t = sub(t, OLD_FAC, NEW_FAC, "campo en factura")
    t = sub(t, OLD_FACSAVE, NEW_FACSAVE, "guardar factura")
    t = sub(t, OLD_OV, NEW_OV, "campo en OV")
    t = sub(t, OLD_OVSAVE, NEW_OVSAVE, "guardar OV")
    t = sub(t, OLD_HER, NEW_HER, "herencia cot->OV")
    t = sub(t, OLD_OVFAC, NEW_OVFAC, "herencia OV->factura")
    t = sub(t, OLD_XMLCOT, NEW_XMLCOT, "cotizacion desde XML")
    t = sub(t, OLD_WIRE, NEW_WIRE, "cableado moneda")
    t = sub(t, OLD_DOCALC, NEW_DOCALC, "calculo con moneda")
    t = sub(t, OLD_RECALCDOC, NEW_RECALCDOC, "recalcDoc")
    t = sub(t, OLD_DECL2, NEW_DECL2, "declaracion recalcDoc")
    t = sub(t, OLD_LCOT, NEW_LCOT, "lista cotizaciones")
    t = sub(t, OLD_LOV, NEW_LOV, "lista OV")
    t = sub(t, OLD_LFAC, NEW_LFAC, "lista facturas")
    t = sub(t, OLD_SELTOT, NEW_SELTOT, "total seleccionadas")
    t = sub(t, OLD_TOT, NEW_TOT, "totales")
    t = sub(t, OLD_PROJ, NEW_PROJ, "proyecciones")
    t = sub(t, OLD_PROY, NEW_PROY, "proyectos")
    t = sub(t, OLD_DASH, NEW_DASH, "tablero")
    t = sub(t, OLD_SPECC, NEW_SPECC, "pdf cotizacion")
    t = sub(t, OLD_SPECF, NEW_SPECF, "pdf factura")
    t = sub(t, OLD_SPECV2, NEW_SPECV2, "pdf OV")
    io.open(p, "w", encoding="utf-8").write(t)
    print("JS:", os.path.basename(p))
