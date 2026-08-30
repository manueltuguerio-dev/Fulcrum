# -*- coding: utf-8 -*-
"""La cantidad de las lineas nunca se redondea: la unidad ya no la limita."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
JS = [os.path.join(BASE, "erp.html"), os.path.join(BASE, "appsscript", "AppJs.html")]

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

OLD = '''    // La cantidad admite decimales solo si la unidad del catálogo los permite.
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

NEW = '''    // La cantidad se captura tal cual: la unidad nunca la redondea ni la limita.
    // Los decimales del catálogo solo se muestran como sugerencia en el campo.
    const ajustaFila=r=>{const u=r.querySelector('[data-k="unidad"]'),c=r.querySelector('[data-k="cantidad"]');
      if(!u||!c)return;const d=unidadDec(u.value);
      c.step="any";
      c.title=d>0?(u.value.trim().toUpperCase()+" · se sugieren "+d+" decimales"):"";};
    const ajustaTodas=()=>list.querySelectorAll(".lrow").forEach(ajustaFila);
    const leeFila=r=>{const o={};spec.cols.forEach(c=>{const el=r.querySelector('[data-k="'+c.k+'"]');o[c.k]=c.t==="text"?el.value.trim():(+el.value||0);});return o;};
    const read=()=>[...list.querySelectorAll(".lrow")].map(leeFila);
    const recalc=()=>{ajustaTodas();list.querySelectorAll(".lrow").forEach(r=>{const o=leeFila(r);r.querySelector(".l-imp").textContent=money(spec.imp(o));});onChange(read());};
    host.addEventListener("input",recalc);
    host.addEventListener("change",e=>{const inp=e.target;
      if(inp.dataset&&inp.dataset.k==="unidad"){ajustaFila(inp.closest(".lrow"));recalc();}});'''

OLD2 = '''    ajustaTodas(false);recalc();'''
NEW2 = '''    ajustaTodas();recalc();'''

OLD3 = '''{k:"decimales",label:"Decimales permitidos",tipo:"num",v:0,ayuda:"0 = solo enteros · 2 o 3 para kilos, metros, horas…"}]},'''
NEW3 = '''{k:"decimales",label:"Decimales sugeridos",tipo:"num",v:0,ayuda:"Solo informativo: la cantidad admite los decimales que escribas, sin redondear."}]},'''

for p in JS:
    t = io.open(p, encoding="utf-8").read()
    t = sub(t, OLD, NEW, "editor sin redondeo")
    t = sub(t, OLD2, NEW2, "init")
    t = sub(t, OLD3, NEW3, "etiqueta del catalogo")
    io.open(p, "w", encoding="utf-8").write(t)
    print("parcheado:", os.path.basename(p))
