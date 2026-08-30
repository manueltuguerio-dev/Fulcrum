# -*- coding: utf-8 -*-
"""Decimales segun la unidad, margen del cliente por defecto y tiempo de entrega."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

# ------------------------------------------------- 1) editor de lineas
OLD_ED = '''    const read=()=>[...list.querySelectorAll(".lrow")].map(r=>{const o={};spec.cols.forEach(c=>{const el=r.querySelector('[data-k="'+c.k+'"]');o[c.k]=c.t==="text"?el.value.trim():(+el.value||0);});return o;});
    const recalc=()=>{list.querySelectorAll(".lrow").forEach(r=>{const o={};spec.cols.forEach(c=>{const el=r.querySelector('[data-k="'+c.k+'"]');o[c.k]=c.t==="text"?el.value:(+el.value||0);});r.querySelector(".l-imp").textContent=money(spec.imp(o));});onChange(read());};
    host.addEventListener("input",recalc);'''
NEW_ED = '''    // La cantidad admite decimales solo si la unidad del catálogo los permite.
    const decDe=v=>unidadDec(v);
    const ajustaFila=(r,redondear)=>{const u=r.querySelector('[data-k="unidad"]'),c=r.querySelector('[data-k="cantidad"]');
      if(!u||!c)return;const d=decDe(u.value);
      c.step=d>0?String(1/Math.pow(10,d)):"1";
      c.title=d>0?("Admite hasta "+d+" decimales"):"Solo cantidades enteras";
      if(redondear&&c.value!==""){const n=+c.value||0;const f=Math.pow(10,d);const v=Math.round(n*f)/f;
        if(v!==n)c.value=v;}};
    const ajustaTodas=redondear=>list.querySelectorAll(".lrow").forEach(r=>ajustaFila(r,redondear));
    const leeFila=r=>{const o={};spec.cols.forEach(c=>{const el=r.querySelector('[data-k="'+c.k+'"]');o[c.k]=c.t==="text"?el.value.trim():(+el.value||0);});
      if(o.unidad!=null&&o.cantidad!=null){const f=Math.pow(10,decDe(o.unidad));o.cantidad=Math.round((+o.cantidad||0)*f)/f;}
      return o;};
    const read=()=>[...list.querySelectorAll(".lrow")].map(leeFila);
    const recalc=()=>{ajustaTodas(false);list.querySelectorAll(".lrow").forEach(r=>{const o=leeFila(r);r.querySelector(".l-imp").textContent=money(spec.imp(o));});onChange(read());};
    host.addEventListener("input",recalc);
    // Al cambiar la unidad se ajusta (y redondea) la cantidad de esa línea.
    host.addEventListener("change",e=>{const inp=e.target;
      if(inp.dataset&&inp.dataset.k==="unidad"){ajustaFila(inp.closest(".lrow"),true);recalc();}});'''

OLD_ROWM = '''    const rowHtml=l=>`<div class="lrow" style="grid-template-columns:${gt}">${spec.cols.map(c=>{const v=escAttr(l&&l[c.k]!=null?l[c.k]:(c.v!=null?c.v:""));'''
NEW_ROWM = '''    let margenDef=null;   // margen por defecto del cliente elegido
    const rowHtml=l=>`<div class="lrow" style="grid-template-columns:${gt}">${spec.cols.map(c=>{
      const porDef=(c.k==="margen"&&margenDef!=null)?margenDef:(c.v!=null?c.v:"");
      const v=escAttr(l&&l[c.k]!=null?l[c.k]:porDef);'''

OLD_RET_ED = '''    (initial&&initial.length?initial:[null]).forEach(l=>list.insertAdjacentHTML("beforeend",rowHtml(l)));
    recalc();
    return {read};
  }'''
NEW_RET_ED = '''    (initial&&initial.length?initial:[null]).forEach(l=>list.insertAdjacentHTML("beforeend",rowHtml(l)));
    ajustaTodas(false);recalc();
    // Fija el margen del cliente: lo usan las líneas nuevas y, si se pide, las existentes.
    const setMargen=(m,aTodas)=>{if(m==null||!isFinite(+m))return;margenDef=+m;
      if(aTodas)list.querySelectorAll('.lrow [data-k="margen"]').forEach(el=>{el.value=+m;});
      recalc();};
    return {read,setMargen};
  }'''

# --------------------------------------- 2) margen del cliente en cotizaciones
OLD_APL = '''        const aplicaCliente=cl=>{if(!cl)return;
          if(cl.nombre&&cliInp)cliInp.value=cl.nombre;
          if(cl.ivaPct!=null&&ivaInput)ivaInput.value=cl.ivaPct;
          retEd.setRows(cl.retenciones||[]);doCalc();
          toast("Impuestos de "+cl.nombre+" aplicados");};'''
NEW_APL = '''        const aplicaCliente=cl=>{if(!cl)return;
          if(cl.nombre&&cliInp)cliInp.value=cl.nombre;
          if(cl.ivaPct!=null&&ivaInput)ivaInput.value=cl.ivaPct;
          retEd.setRows(cl.retenciones||[]);
          // En cotizaciones se aplica también el margen fijo que tiene dado de alta el cliente.
          let msg="Impuestos de "+cl.nombre+" aplicados";
          if(isCot&&cl.margen!=null&&lineEd&&lineEd.setMargen){lineEd.setMargen(cl.margen,true);msg+=" · margen "+cl.margen+"%";}
          doCalc();toast(msg);};'''

# ------------------------------------------------ 3) tiempo de entrega
OLD_COTBODY = '''          <div class="field"><label for="f-vig">Vigencia (días)</label><input type="number" id="f-vig" value="${rec?rec.vigencia:15}" min="1"></div>
          <div class="field"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${rec&&rec.ivaPct!=null?rec.ivaPct:ivaDefPct()}"></div></div>'''
NEW_COTBODY = '''          <div class="field"><label for="f-vig">Vigencia (días)</label><input type="number" id="f-vig" value="${rec?rec.vigencia:15}" min="1"></div>
          <div class="field"><label for="f-iva">IVA (%)</label><input type="number" id="f-iva" min="0" max="100" step="0.5" value="${rec&&rec.ivaPct!=null?rec.ivaPct:ivaDefPct()}"></div></div>
        <div class="field"><label for="f-ent">Tiempo de entrega</label>
          <input id="f-ent" list="ent-list" value="${escAttr(rec&&rec.entrega?rec.entrega:"")}" placeholder="Ej. 10 días hábiles">
          <datalist id="ent-list">${["Inmediata","3 días hábiles","5 días hábiles","10 días hábiles","15 días hábiles","20 días hábiles","4 a 6 semanas","Por confirmar"].map(x=>`<option value="${x}"></option>`).join("")}</datalist></div>'''

OLD_COTSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),fecha:$("#f-fecha").value,vigencia:+$("#f-vig").value,ivaPct:+$("#f-iva").value||0,retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''
NEW_COTSAVE = '''        const data={folio,cliente:$("#f-cli").value.trim(),fecha:$("#f-fecha").value,vigencia:+$("#f-vig").value,
          entrega:$("#f-ent")?$("#f-ent").value.trim():"",ivaPct:+$("#f-iva").value||0,
          retenciones:retEd?retEd.read().filter(r=>r.concepto):[],lineas};'''

OLD_SPEC = '''      metaLeft:["Válido hasta: "+fmtDate(addDays(c.fecha,+c.vigencia||0))],metaRight:["Emitido el: "+fmtDate(c.fecha),"Folio: "+c.folio],'''
NEW_SPEC = '''      metaLeft:["Válido hasta: "+fmtDate(addDays(c.fecha,+c.vigencia||0))].concat(c.entrega?["Tiempo de entrega: "+c.entrega]:[]),
      metaRight:["Emitido el: "+fmtDate(c.fecha),"Folio: "+c.folio],'''

OLD_SPEC2 = '''      contact:[EMISOR.email,EMISOR.contacto,"Esta cotización tiene una validez de: "+(+c.vigencia||0)+" Días.","Esta cotización se emite el: "+fmtDate(c.fecha),"¡Gracias por su preferencia!"],'''
NEW_SPEC2 = '''      contact:[EMISOR.email,EMISOR.contacto].concat(c.entrega?["Tiempo de entrega: "+c.entrega]:[])
        .concat(["Esta cotización tiene una validez de: "+(+c.vigencia||0)+" Días.","Esta cotización se emite el: "+fmtDate(c.fecha),"¡Gracias por su preferencia!"]),'''

# la cotizacion creada desde XML tambien admite entrega
OLD_NUEVA = '''        const nueva={id:uid(),folio:nextFolio("COT",state.cotizaciones),cliente:cli.nombre,fecha:$("#f-fecha").value,
          vigencia:+$("#f-vig").value||15,estatus:"borrador",facturada:false,ivaPct:(cli.ivaPct!=null?cli.ivaPct:ivaDefPct()),'''
NEW_NUEVA = '''        const nueva={id:uid(),folio:nextFolio("COT",state.cotizaciones),cliente:cli.nombre,fecha:$("#f-fecha").value,
          vigencia:+$("#f-vig").value||15,entrega:"",estatus:"borrador",facturada:false,ivaPct:(cli.ivaPct!=null?cli.ivaPct:ivaDefPct()),'''

def parche(t):
    t = sub(t, OLD_ED, NEW_ED, "editor de lineas")
    t = sub(t, OLD_ROWM, NEW_ROWM, "margen por defecto en filas")
    t = sub(t, OLD_RET_ED, NEW_RET_ED, "setMargen")
    t = sub(t, OLD_APL, NEW_APL, "aplicaCliente")
    t = sub(t, OLD_COTBODY, NEW_COTBODY, "campo entrega")
    t = sub(t, OLD_COTSAVE, NEW_COTSAVE, "guardar entrega")
    t = sub(t, OLD_SPEC, NEW_SPEC, "pdf metaLeft")
    t = sub(t, OLD_SPEC2, NEW_SPEC2, "pdf contacto")
    t = sub(t, OLD_NUEVA, NEW_NUEVA, "cotizacion desde xml")
    return t

for p in JS:
    t = io.open(p, encoding="utf-8").read()
    io.open(p, "w", encoding="utf-8").write(parche(t))
    print("parcheado:", os.path.basename(p))
