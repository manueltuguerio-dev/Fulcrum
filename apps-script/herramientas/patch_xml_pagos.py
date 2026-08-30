# -*- coding: utf-8 -*-
"""Cotizar desde XML: una sola linea por defecto y costo cuadrado con el CFDI.
Registro de pago: facturas ordenadas de mayor a menor saldo."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
TARGETS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(txt, old, new, etiqueta):
    n = txt.count(old)
    if n != 1:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (etiqueta, n))
    return txt.replace(old, new)

# ------------------------------------------------- 1) detalle de la cotizacion
OLD_SEL = '''        <div class="field"><label for="f-desg">Detalle</label><select id="f-desg">
          <option value="1">Desglosar los conceptos de cada factura</option>
          <option value="0">Una l\\u00ednea por factura (resumen)</option></select></div>
        <p class="hintline">Se crear\\u00e1 la cotizaci\\u00f3n con el costo real y el margen indicado. Todo queda editable despu\\u00e9s.</p>`;'''
NEW_SEL = '''        <div class="field"><label for="f-desg">Detalle</label><select id="f-desg">
          <option value="total">Una sola l\\u00ednea con el costo total</option>
          <option value="factura">Una l\\u00ednea por factura</option>
          <option value="conceptos">Desglosar los conceptos de cada factura</option></select></div>
        <p class="hintline">El costo de la cotizaci\\u00f3n <b>cuadra con el total del XML</b> (${money(costo)} sin IVA). Todo queda editable despu\\u00e9s.</p>`;'''

# --------------------------------------------- 2) armado de lineas que cuadra
OLD_LIN = '''        const mg=+$("#f-mg").value||0,desglosar=$("#f-desg").value==="1";
        const lineas=[];
        facs.forEach(p=>{
          if(desglosar&&(p.conceptos||[]).length)
            p.conceptos.forEach(c=>lineas.push({desc:c.desc,unidad:c.unidad||"PZ",cantidad:+c.cantidad||1,costo:+c.costo||0,margen:mg}));
          else lineas.push({desc:"Suministro seg\\u00fan factura "+(p.folio||p.proveedor),unidad:"PZ",cantidad:1,costo:+p.subtotal||0,margen:mg});
        });'''
NEW_LIN = '''        const mg=+$("#f-mg").value||0,detalle=$("#f-desg").value;
        const lineas=[];
        if(detalle==="total"){
          // Una sola linea: el costo es exactamente el subtotal de los XML cargados.
          const refs=facs.map(p=>p.folio||p.proveedor).join(", ");
          lineas.push({desc:"Suministro seg\\u00fan factura "+refs,unidad:"LOT",analitica:"",cantidad:1,costo:r2(costo),margen:mg});
        }else facs.forEach(p=>{
          const subP=r2(+p.subtotal||0);
          if(detalle==="conceptos"&&(p.conceptos||[]).length){
            const desde=lineas.length;
            p.conceptos.forEach(c=>lineas.push({desc:c.desc,unidad:c.unidad||"PZ",analitica:"",cantidad:+c.cantidad||1,costo:+c.costo||0,margen:mg}));
            // El desglose puede no sumar el subtotal del CFDI (descuentos o redondeos):
            // la diferencia se ajusta en la ultima linea para que cuadre con el XML.
            const suma=r2(lineas.slice(desde).reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0));
            const dif=r2(subP-suma);
            if(Math.abs(dif)>=0.01&&lineas.length>desde){const u=lineas[lineas.length-1];
              u.costo=r2((+u.costo||0)+dif/((+u.cantidad||1)||1));}
          }else lineas.push({desc:"Suministro seg\\u00fan factura "+(p.folio||p.proveedor),unidad:"LOT",analitica:"",cantidad:1,costo:subP,margen:mg});
        });'''

OLD_AVISO = '''        setTimeout(()=>{openForm("cotizacion",{id:nueva.id});toast("Cotizaci\\u00f3n "+nueva.folio+" creada desde "+facs.length+" factura(s)");},60);'''
NEW_AVISO = '''        const costoCot=r2(lineas.reduce((a,l)=>a+(+l.costo||0)*(+l.cantidad||0),0));
        setTimeout(()=>{openForm("cotizacion",{id:nueva.id});
          toast("Cotizaci\\u00f3n "+nueva.folio+" creada desde "+facs.length+" factura(s) \\u00b7 costo "+money(costoCot)
            +(Math.abs(costoCot-r2(costo))<0.01?" (cuadra con el XML)":""));},60);'''

# ----------------------------------- 3) pagos: facturas de mayor a menor saldo
OLD_CAND = '''      const cand=state.facturas.filter(f=>facSaldo(f)>CENTAVO||editIds.indexOf(f.id)>=0);'''
NEW_CAND = '''      const cand=state.facturas.filter(f=>facSaldo(f)>CENTAVO||editIds.indexOf(f.id)>=0)
        .sort((a,b)=>facSaldo(b)-facSaldo(a));   // de mayor a menor saldo'''

for path in TARGETS:
    with io.open(path, encoding="utf-8") as fh:
        txt = fh.read()
    txt = sub(txt, OLD_SEL, NEW_SEL, "selector de detalle")
    txt = sub(txt, OLD_LIN, NEW_LIN, "armado de lineas")
    txt = sub(txt, OLD_AVISO, NEW_AVISO, "aviso")
    txt = sub(txt, OLD_CAND, NEW_CAND, "orden de facturas en pagos")
    with io.open(path, "w", encoding="utf-8") as fh:
        fh.write(txt)
    print("parcheado:", os.path.basename(path))
