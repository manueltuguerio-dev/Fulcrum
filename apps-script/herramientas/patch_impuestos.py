# -*- coding: utf-8 -*-
"""Parche: impuestos/retenciones en facturas, sugerencia de clientes y redondeo de pagos.
Se aplica igual al artefacto (erp.html) y al bundle de Apps Script (AppJs.html)."""
import io, sys, os

BASE = os.path.dirname(os.path.abspath(__file__))
TARGETS = [os.path.join(BASE, "erp.html"),
           os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(txt, old, new, cuenta=1, etiqueta=""):
    n = txt.count(old)
    if n != cuenta:
        raise SystemExit("PATCH FALLO [%s]: esperaba %d ocurrencias, hay %d\n---\n%s" % (etiqueta, cuenta, n, old[:160]))
    return txt.replace(old, new)

# ---------------------------------------------------------------- 1) redondeo
OLD_MONEY = '''  const money0=n=>fmtMoney.format(Math.round(n||0)).replace(/\\.00$/,"");'''
NEW_MONEY = '''  const money0=n=>fmtMoney.format(Math.round(n||0)).replace(/\\.00$/,"");
  // Redondeo a centavos: evita saldos con 4 decimales que impedian aplicar el pago.
  const r2=n=>Math.round(((+n||0)+Number.EPSILON)*100)/100;
  const CENTAVO=0.005;'''

OLD_TOT = '''  const cotSubtotal=c=>sumLineas("cotizacion",c.lineas);'''
NEW_TOT = '''  const cotSubtotal=c=>r2(sumLineas("cotizacion",c.lineas));'''

OLD_COTRET = '''  const cotRetencion=c=>{const s=cotSubtotal(c);return (c.retenciones||[]).reduce((a,r)=>a+s*(+r.tasa||0)/100,0);};
  const cotTotal=c=>cotSubtotal(c)*(1+ivaR(c))-cotRetencion(c);
  const facSubtotal=f=>sumLineas("factura",f.lineas);
  const facCosto=f=>(f.lineas||[]).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0);
  const facTotal=f=>facSubtotal(f)*(1+ivaR(f));
  const facPagado=f=>state.pagos.reduce((a,p)=>a+((p.aplicaciones&&p.aplicaciones.length)
    ? p.aplicaciones.filter(x=>x.facturaId===f.id).reduce((s,x)=>s+(+x.monto||0),0)
    : (p.facturaId===f.id?(+p.monto||0):0)),0);
  const facSaldo=f=>Math.max(0,facTotal(f)-facPagado(f));
  const ocSubtotal=o=>sumLineas("orden",o.lineas);
  const ocTotal=o=>ocSubtotal(o)*(1+ivaR(o));
  const ovSubtotal=o=>sumLineas("venta",o.lineas);
  const ovCosto=o=>(o.lineas||[]).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0);
  const ovTotal=o=>ovSubtotal(o)*(1+ivaR(o));'''
NEW_COTRET = '''  const cotRetencion=c=>{const s=cotSubtotal(c);return r2((c.retenciones||[]).reduce((a,r)=>a+s*(+r.tasa||0)/100,0));};
  const cotTotal=c=>r2(cotSubtotal(c)*(1+ivaR(c))-cotRetencion(c));
  const facSubtotal=f=>r2(sumLineas("factura",f.lineas));
  const facCosto=f=>(f.lineas||[]).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0);
  // Las facturas tambien llevan retenciones: se restan del total igual que en la cotizacion.
  const facRetencion=f=>{const s=facSubtotal(f);return r2((f.retenciones||[]).reduce((a,r)=>a+s*(+r.tasa||0)/100,0));};
  const facIva=f=>r2(facSubtotal(f)*ivaR(f));
  const facTotal=f=>r2(facSubtotal(f)+facIva(f)-facRetencion(f));
  const facPagado=f=>r2(state.pagos.reduce((a,p)=>a+((p.aplicaciones&&p.aplicaciones.length)
    ? p.aplicaciones.filter(x=>x.facturaId===f.id).reduce((s,x)=>s+(+x.monto||0),0)
    : (p.facturaId===f.id?(+p.monto||0):0)),0));
  const facSaldo=f=>Math.max(0,r2(facTotal(f)-facPagado(f)));
  const ocSubtotal=o=>r2(sumLineas("orden",o.lineas));
  const ocTotal=o=>r2(ocSubtotal(o)*(1+ivaR(o)));
  const ovSubtotal=o=>r2(sumLineas("venta",o.lineas));
  const ovCosto=o=>(o.lineas||[]).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0);
  const ovTotal=o=>r2(ovSubtotal(o)*(1+ivaR(o)));'''

# tolerancias de saldo: con todo redondeado a centavos, medio centavo basta
TOLERANCIAS = [
    ('if(saldo<=0.01)return{k:"pagada"', 'if(saldo<=CENTAVO)return{k:"pagada"', 1),
    ('if(saldo<total-0.01)', 'if(saldo<total-CENTAVO)', 1),
    ('state.facturas.filter(f=>facSaldo(f)>0.01&&todayStr()>f.vencimiento)',
     'state.facturas.filter(f=>facSaldo(f)>CENTAVO&&todayStr()>f.vencimiento)', 1),
    ('state.facturas.forEach(f=>{const s=facSaldo(f);if(s>0.01)',
     'state.facturas.forEach(f=>{const s=facSaldo(f);if(s>CENTAVO)', 1),
    ('const rows=state.facturas.filter(f=>facSaldo(f)>0.01)',
     'const rows=state.facturas.filter(f=>facSaldo(f)>CENTAVO)', 1),
    ('style="color:${saldo>0.01&&todayStr()>f.vencimiento', 'style="color:${saldo>CENTAVO&&todayStr()>f.vencimiento', 1),
    ('${saldo>0.01?`<button class="act good" data-action="fac-pago"',
     '${saldo>CENTAVO?`<button class="act good" data-action="fac-pago"', 1),
    ('const cand=state.facturas.filter(f=>facSaldo(f)>0.01||editIds.indexOf(f.id)>=0);',
     'const cand=state.facturas.filter(f=>facSaldo(f)>CENTAVO||editIds.indexOf(f.id)>=0);', 1),
    ('if(f&&facSaldo(f)<=0.01)f.flujo="pagada";', 'if(f&&facSaldo(f)<=CENTAVO)f.flujo="pagada";', 1),
    ('if(saldo>0.01)totals.push({label:"SALDO"', 'if(saldo>CENTAVO)totals.push({label:"SALDO"', 1),
]

# ------------------------------------------- 2) inputs de dinero sin step fijo
OLD_MF = '''  const moneyField=(id,label,val)=>`<div class="field"><label for="${id}">${label}</label><input type="number" id="${id}" min="0" step="0.01" value="${val==null?"":val}" required></div>`;'''
NEW_MF = '''  const moneyField=(id,label,val)=>`<div class="field"><label for="${id}">${label}</label><input type="number" id="${id}" min="0" step="any" value="${val==null?"":val}" required></div>`;'''

OLD_LINEINP = '''`<input data-k="${c.k}" type="number" min="0" step="${c.step||"0.01"}"'''
NEW_LINEINP = '''`<input data-k="${c.k}" type="number" min="0" step="${c.step||"any"}"'''

OLD_IVAM = '''<input type="number" id="f-ivam" min="0" step="0.01" value="${rec&&rec.iva!=null?rec.iva:""}"'''
NEW_IVAM = '''<input type="number" id="f-ivam" min="0" step="any" value="${rec&&rec.iva!=null?rec.iva:""}"'''

# --------------------------------------------------- 3) formulario de factura
OLD_FAC = '''    else if(type==="factura"){lineType="factura";title=editing?"Editar factura":"Nueva factura";
      body=`${campoFolio(rec?rec.folio:nextFolio("FAC",state.facturas))}
        <div class="field"><label for="f-cli">Cliente</label><input id="f-cli" required value="${escAttr(rec?rec.cliente:"")}" placeholder="Nombre del cliente"></div>
        <div class="grid3"><div class="field"><label for="f-fecha">Emisión</label><input type="date" id="f-fecha" value="${rec?rec.fecha:t}"></div>
        <div class="field"><label for="f-venc">Vence</label><input type="date" id="f-venc" value="${rec?rec.vencimiento:addDays(t,30)}"></div>
        <div class="field"><label for="f-flujo">Estatus</label><select id="f-flujo">${FLUJO.map(x=>`<option value="${x.v}" ${(rec?rec.flujo:"solicitada")===x.v?"selected":""}>${x.label}</option>`).join("")}</select></div></div>
        <div class="field" style="max-width:160px"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${rec&&rec.ivaPct!=null?rec.ivaPct:ivaDefPct()}"></div>
        <div class="field"><label>Conceptos</label><div id="lineas"></div></div><div class="calc" id="calc"></div>`;
      onsubmit=()=>{const lineas=lineEd.read().filter(l=>l.desc&&l.cantidad>0);
        if(!lineas.length){toast("Agrega al menos una línea.");return false;}
        const folio=$("#f-folio").value.trim();
        if(!folio){toast("Escribe el folio.");return false;}
        if(folioRepetido(state.facturas,folio,editing)){toast("Ya existe la factura "+folio);return false;}
        const data={folio,cliente:$("#f-cli").value.trim(),fecha:$("#f-fecha").value,vencimiento:$("#f-venc").value,flujo:$("#f-flujo").value,ivaPct:+$("#f-iva").value||0,lineas};
        if(editing)Object.assign(rec,data);else state.facturas.push(Object.assign({id:uid()},data));};
    }'''
NEW_FAC = '''    else if(type==="factura"){lineType="factura";title=editing?"Editar factura":"Nueva factura";
      body=`${campoFolio(rec?rec.folio:nextFolio("FAC",state.facturas))}
        <div class="grid2">
          <div class="field"><label for="f-cli">Cliente</label><input id="f-cli" list="cli-list" required value="${escAttr(rec?rec.cliente:"")}" placeholder="Nombre del cliente">
            <datalist id="cli-list">${state.clientes.map(cl=>`<option value="${escAttr(cl.nombre)}"></option>`).join("")}</datalist></div>
          <div class="field"><label for="f-cliid">Impuestos de cliente</label><select id="f-cliid"><option value="">— personalizado —</option>${state.clientes.map(cl=>`<option value="${cl.id}" ${rec&&rec.clienteId===cl.id?"selected":""}>${escAttr(cl.nombre)}</option>`).join("")}</select></div></div>
        <div class="grid3"><div class="field"><label for="f-fecha">Emisión</label><input type="date" id="f-fecha" value="${rec?rec.fecha:t}"></div>
        <div class="field"><label for="f-venc">Vence</label><input type="date" id="f-venc" value="${rec?rec.vencimiento:addDays(t,30)}"></div>
        <div class="field"><label for="f-flujo">Estatus</label><select id="f-flujo">${FLUJO.map(x=>`<option value="${x.v}" ${(rec?rec.flujo:"solicitada")===x.v?"selected":""}>${x.label}</option>`).join("")}</select></div></div>
        <div class="field" style="max-width:160px"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${rec&&rec.ivaPct!=null?rec.ivaPct:ivaDefPct()}"></div>
        <div class="field"><label>Conceptos</label><div id="lineas"></div></div>
        <div class="field"><label>Retenciones e impuestos <span style="color:var(--text-faint);font-weight:400">· % sobre subtotal · se cargan del cliente</span></label><div id="rets"></div></div>
        <div class="calc" id="calc"></div>`;
      onsubmit=()=>{const lineas=lineEd.read().filter(l=>l.desc&&l.cantidad>0);
        if(!lineas.length){toast("Agrega al menos una línea.");return false;}
        const folio=$("#f-folio").value.trim();
        if(!folio){toast("Escribe el folio.");return false;}
        if(folioRepetido(state.facturas,folio,editing)){toast("Ya existe la factura "+folio);return false;}
        const cid=$("#f-cliid").value||null;
        const data={folio,cliente:$("#f-cli").value.trim(),clienteId:cid,fecha:$("#f-fecha").value,vencimiento:$("#f-venc").value,
          flujo:$("#f-flujo").value,ivaPct:+$("#f-iva").value||0,retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};
        if(editing)Object.assign(rec,data);else state.facturas.push(Object.assign({id:uid()},data));};
    }'''

# ---------------------- 4) cliente sugerido tambien en la orden de venta
OLD_OV_CLI = '''        <div class="field"><label for="f-cli">Cliente</label><input id="f-cli" required value="${escAttr(pre.cliente||"")}" placeholder="Cliente"></div>'''
NEW_OV_CLI = '''        <div class="field"><label for="f-cli">Cliente</label><input id="f-cli" list="cli-list" required value="${escAttr(pre.cliente||"")}" placeholder="Cliente">
          <datalist id="cli-list">${state.clientes.map(cl=>`<option value="${escAttr(cl.nombre)}"></option>`).join("")}</datalist></div>'''

# ------------------------------------------------- 5) calculo y cableado
OLD_CALC = '''      const doCalc=()=>{const lines=lineEd?lineEd.read():[],s=sumLineas(lineType,lines),pct=+(tasaForm()*100).toFixed(4),iva=s*tasaForm();
        if(isCot){const cost=lines.reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0),mg=s>0?(s-cost)/s*100:0;
          const rets=retEd?retEd.read():[],retTot=rets.reduce((a,r)=>a+s*(+r.tasa||0)/100,0);
          const retRows=rets.filter(r=>r.tasa).map(r=>`<div><span>${escAttr(r.concepto||"Retención")} (${(+r.tasa)}%)</span><span class="num">−${money(s*(+r.tasa||0)/100)}</span></div>`).join("");
          const porAna={};lines.forEach(l=>{const k=(l.analitica||"").trim()||"Sin analítica";
            porAna[k]=(porAna[k]||0)+LINESPEC[lineType].imp(l);});
          const claves=Object.keys(porAna);
          const anaRows=claves.length>1?`<div class="ana-tit">Por analítica</div>`+claves.map(k=>
            `<div class="ana-row"><span>${escAttr(k)}</span><span class="num">${money(porAna[k])}</span></div>`).join(""):"";
          calc.innerHTML=`<div><span>Costo total</span><span class="num">${money(cost)}</span></div><div><span>Margen promedio</span><span class="num" style="color:var(--good)">${mg.toFixed(1)}%</span></div><div><span>Subtotal (venta)</span><span class="num">${money(s)}</span></div><div><span>IVA ${pct}%</span><span class="num">${money(iva)}</span></div>${retRows}<div class="tot"><span>Total</span><span class="num">${money(s+iva-retTot)}</span></div>${anaRows}`;
        }else if(showMargen){const cost=lines.reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0),mg=s>0?(s-cost)/s*100:0;
          calc.innerHTML=`<div><span>Costo total</span><span class="num">${money(cost)}</span></div><div><span>Margen promedio</span><span class="num" style="color:var(--good)">${mg.toFixed(1)}%</span></div><div><span>Subtotal (venta)</span><span class="num">${money(s)}</span></div><div><span>IVA ${pct}%</span><span class="num">${money(iva)}</span></div><div class="tot"><span>Total</span><span class="num">${money(s+iva)}</span></div>`;
        }else{calc.innerHTML=`<div><span>Subtotal</span><span class="num">${money(s)}</span></div><div><span>IVA ${pct}%</span><span class="num">${money(iva)}</span></div><div class="tot"><span>Total</span><span class="num">${money(s+iva)}</span></div>`;}};
      lineEd=makeLineEditor(lineType,$("#lineas"),rec?rec.lineas:formLines,doCalc,catalog);
      if(ivaInput)ivaInput.addEventListener("input",doCalc);
      if(isCot){retEd=makeRetEditor($("#rets"),rec?rec.retenciones:null,doCalc);doCalc();
        const cliSel=$("#f-cliid");if(cliSel)cliSel.addEventListener("change",()=>{const cl=state.clientes.find(x=>x.id===cliSel.value);
          if(cl){if(cl.nombre)$("#f-cli").value=cl.nombre;if(cl.ivaPct!=null&&$("#f-iva"))$("#f-iva").value=cl.ivaPct;retEd.setRows(cl.retenciones||[]);doCalc();}});}
    }'''
NEW_CALC = '''      const doCalc=()=>{const lines=lineEd?lineEd.read():[],s=r2(sumLineas(lineType,lines)),pct=+(tasaForm()*100).toFixed(4),iva=r2(s*tasaForm());
        const rets=retEd?retEd.read():[],retTot=r2(rets.reduce((a,r)=>a+s*(+r.tasa||0)/100,0));
        const retRows=rets.filter(r=>r.tasa).map(r=>`<div><span>${escAttr(r.concepto||"Retención")} (${(+r.tasa)}%)</span><span class="num">−${money(r2(s*(+r.tasa||0)/100))}</span></div>`).join("");
        const porAna={};lines.forEach(l=>{const k=(l.analitica||"").trim()||"Sin analítica";
          porAna[k]=(porAna[k]||0)+LINESPEC[lineType].imp(l);});
        const claves=Object.keys(porAna);
        const anaRows=claves.length>1?`<div class="ana-tit">Por analítica</div>`+claves.map(k=>
          `<div class="ana-row"><span>${escAttr(k)}</span><span class="num">${money(porAna[k])}</span></div>`).join(""):"";
        const total=`<div class="tot"><span>Total</span><span class="num">${money(r2(s+iva-retTot))}</span></div>`;
        if(showMargen){const cost=lines.reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0),mg=s>0?(s-cost)/s*100:0;
          calc.innerHTML=`<div><span>Costo total</span><span class="num">${money(cost)}</span></div><div><span>Margen promedio</span><span class="num" style="color:var(--good)">${mg.toFixed(1)}%</span></div><div><span>Subtotal (venta)</span><span class="num">${money(s)}</span></div><div><span>IVA ${pct}%</span><span class="num">${money(iva)}</span></div>${retRows}${total}${anaRows}`;
        }else{calc.innerHTML=`<div><span>Subtotal</span><span class="num">${money(s)}</span></div><div><span>IVA ${pct}%</span><span class="num">${money(iva)}</span></div>${retRows}${total}${anaRows}`;}};
      lineEd=makeLineEditor(lineType,$("#lineas"),rec?rec.lineas:formLines,doCalc,catalog);
      if(ivaInput)ivaInput.addEventListener("input",doCalc);
      // Cotizaciones y facturas comparten el editor de retenciones y heredan los impuestos del cliente.
      const usaRets=isCot||lineType==="factura";
      if(usaRets){retEd=makeRetEditor($("#rets"),rec?rec.retenciones:null,doCalc);doCalc();
        const cliSel=$("#f-cliid"),cliInp=$("#f-cli");
        const aplicaCliente=cl=>{if(!cl)return;
          if(cl.nombre&&cliInp)cliInp.value=cl.nombre;
          if(cl.ivaPct!=null&&ivaInput)ivaInput.value=cl.ivaPct;
          retEd.setRows(cl.retenciones||[]);doCalc();
          toast("Impuestos de "+cl.nombre+" aplicados");};
        if(cliSel)cliSel.addEventListener("change",()=>aplicaCliente(state.clientes.find(x=>x.id===cliSel.value)));
        if(cliInp)cliInp.addEventListener("change",()=>{const n=cliInp.value.trim().toLowerCase();
          const cl=state.clientes.find(x=>String(x.nombre||"").trim().toLowerCase()===n);
          if(cl){if(cliSel)cliSel.value=cl.id;aplicaCliente(cl);}});}
    }'''

# --------------------------------------------------------- 6) PDF de factura
OLD_SPECF = '''  function specFactura(f){const sub=facSubtotal(f),iva=facTotal(f)-sub,pagado=facPagado(f),saldo=facSaldo(f),fl=flujoMeta(f.flujo);
    const totals=[{label:"SUBTOTAL",value:money(sub)},{label:ivaLbl(f).toUpperCase(),value:money(iva)},{label:"TOTAL",value:money(facTotal(f)),bold:true,rule:true}];'''
NEW_SPECF = '''  function specFactura(f){const sub=facSubtotal(f),iva=facIva(f),pagado=facPagado(f),saldo=facSaldo(f),fl=flujoMeta(f.flujo);
    const totals=[{label:"SUBTOTAL",value:money(sub)},{label:ivaLbl(f).toUpperCase(),value:money(iva)}];
    (f.retenciones||[]).filter(r=>r.tasa).forEach(r=>totals.push({label:(r.concepto||"Retención").toUpperCase()+" "+(+r.tasa)+"%",value:money(r2(sub*(+r.tasa)/100))}));
    totals.push({label:"TOTAL",value:money(facTotal(f)),bold:true,rule:true});'''

# ------------------------------------------------- 7) pagos: montos redondeados
OLD_PAYROW = '''          <input type="number" class="pa" data-fid="${f.id}" min="0" step="0.01" value="${checked?amt:""}" placeholder="0.00"></label>`;};'''
NEW_PAYROW = '''          <input type="number" class="pa" data-fid="${f.id}" min="0" step="any" value="${checked?r2(amt):""}" placeholder="0.00"></label>`;};'''

OLD_PAYSUB = '''      onsubmit=()=>{const aps=[...md.querySelectorAll(".pf:checked")].map(cb=>{const fid=cb.value,el=md.querySelector('.pa[data-fid="'+fid+'"]'),f=state.facturas.find(x=>x.id===fid);return {facturaId:fid,facturaFolio:f.folio,monto:+el.value||0};}).filter(x=>x.monto>0);
        if(!aps.length){toast("Marca al menos una factura y captura su monto.");return false;}
        const total=aps.reduce((a,x)=>a+x.monto,0),cls=[...new Set(aps.map(x=>state.facturas.find(f=>f.id===x.facturaId).cliente))];'''
NEW_PAYSUB = '''      onsubmit=()=>{const aps=[...md.querySelectorAll(".pf:checked")].map(cb=>{const fid=cb.value,el=md.querySelector('.pa[data-fid="'+fid+'"]'),f=state.facturas.find(x=>x.id===fid);
          const prev=editAps.find(x=>x.facturaId===fid),tope=r2(facSaldo(f)+(prev?+prev.monto||0:0));
          let m=r2(+el.value||0);if(m>tope&&m-tope<=0.02)m=tope;   // absorbe diferencias de centavos
          return {facturaId:fid,facturaFolio:f.folio,monto:m};}).filter(x=>x.monto>0);
        if(!aps.length){toast("Marca al menos una factura y captura su monto.");return false;}
        const total=r2(aps.reduce((a,x)=>a+x.monto,0)),cls=[...new Set(aps.map(x=>state.facturas.find(f=>f.id===x.facturaId).cliente))];'''

OLD_PAYCALC = '''      const calc=()=>{let s=0;pl.querySelectorAll(".pf").forEach(cb=>{const el=pl.querySelector('.pa[data-fid="'+cb.value+'"]');el.disabled=!cb.checked;if(cb.checked)s+=+el.value||0;});totEl.textContent=money(s);};
      pl.addEventListener("change",e=>{if(e.target.classList.contains("pf")){const cb=e.target,el=pl.querySelector('.pa[data-fid="'+cb.value+'"]');if(cb.checked&&!(+el.value)){const f=state.facturas.find(x=>x.id===cb.value);el.value=facSaldo(f);}}calc();});'''
NEW_PAYCALC = '''      const calc=()=>{let s=0;pl.querySelectorAll(".pf").forEach(cb=>{const el=pl.querySelector('.pa[data-fid="'+cb.value+'"]');el.disabled=!cb.checked;if(cb.checked)s+=+el.value||0;});totEl.textContent=money(r2(s));};
      pl.addEventListener("change",e=>{if(e.target.classList.contains("pf")){const cb=e.target,el=pl.querySelector('.pa[data-fid="'+cb.value+'"]');if(cb.checked&&!(+el.value)){const f=state.facturas.find(x=>x.id===cb.value);el.value=r2(facSaldo(f));}}calc();});'''

# --------------------------------- 8) CFDI de venta: guarda tambien el cliente
OLD_XMLV = '''  function parseCFDIVenta(txt){'''

def parche(txt):
    txt = sub(txt, OLD_MONEY, NEW_MONEY, 1, "r2")
    txt = sub(txt, OLD_TOT, NEW_TOT, 1, "cotSubtotal")
    txt = sub(txt, OLD_COTRET, NEW_COTRET, 1, "totales")
    for old, new, n in TOLERANCIAS:
        txt = sub(txt, old, new, n, "tolerancia " + old[:40])
    txt = sub(txt, OLD_MF, NEW_MF, 1, "moneyField")
    txt = sub(txt, OLD_LINEINP, NEW_LINEINP, 1, "step linea")
    txt = sub(txt, OLD_IVAM, NEW_IVAM, 1, "iva monto")
    txt = sub(txt, OLD_FAC, NEW_FAC, 1, "form factura")
    txt = sub(txt, OLD_OV_CLI, NEW_OV_CLI, 1, "cliente en OV")
    txt = sub(txt, OLD_CALC, NEW_CALC, 1, "doCalc")
    txt = sub(txt, OLD_SPECF, NEW_SPECF, 1, "specFactura")
    txt = sub(txt, OLD_PAYROW, NEW_PAYROW, 1, "fila de pago")
    txt = sub(txt, OLD_PAYSUB, NEW_PAYSUB, 1, "guardar pago")
    txt = sub(txt, OLD_PAYCALC, NEW_PAYCALC, 1, "total del pago")
    return txt

for path in TARGETS:
    with io.open(path, encoding="utf-8") as fh:
        txt = fh.read()
    txt = parche(txt)
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(txt)
    print("parcheado:", os.path.basename(path))
