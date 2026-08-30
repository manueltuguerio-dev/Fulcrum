# -*- coding: utf-8 -*-
"""El correo lleva adjunta la cotizacion tal como esta en el sistema y el envio
no modifica ningun dato del registro."""
import io, os
BASE = os.path.dirname(os.path.abspath(__file__))
ERP  = os.path.join(BASE, "erp.html")
APPJS= os.path.join(BASE, "appsscript", "AppJs.html")

def sub(t, old, new, tag, veces=1):
    n = t.count(old)
    if n != veces:
        raise SystemExit("PATCH FALLO [%s]: %d ocurrencias" % (tag, n))
    return t.replace(old, new)

# --------------------------- el modal ya no edita el tiempo de entrega
OLD_ENT = '''          ${uno?`<div class="field"><label for="e-ent">Tiempo de entrega</label>
            <input id="e-ent" value="${escAttr(uno.cot.entrega||"")}" placeholder="Ej. 10 días hábiles"></div>`
            :`<div class="field"><label>Tiempo de entrega</label><input value="el de cada cotización" disabled></div>`}'''
NEW_ENT = '''          <div class="field"><label>Tiempo de entrega</label>
            <input value="${escAttr(uno?(uno.cot.entrega||"— sin capturar —"):"el de cada cotización")}" disabled>
            <p class="hintline" style="margin:4px 0 0">Se toma de la cotización. Para cambiarlo, edítala antes de enviar.</p></div>'''

OLD_VARS = '''    const varsDe=x=>{const v=Object.assign({},x.vars);
      if(uno&&entradaEnt&&entradaEnt.value.trim())v.entrega=entradaEnt.value.trim();
      const marcados'''
NEW_VARS = '''    const varsDe=x=>{const v=Object.assign({},x.vars);
      const marcados'''

OLD_PINTA = '''    [sub_,body].forEach(el=>el.addEventListener("input",pinta));
    if(entradaEnt)entradaEnt.addEventListener("input",pinta);'''
NEW_PINTA = '''    [sub_,body].forEach(el=>el.addEventListener("input",pinta));'''

OLD_SAVE = '''      if(uno&&entradaEnt){uno.cot.entrega=entradaEnt.value.trim();}
      enviarCorreos(items,(enviados)=>{'''
NEW_SAVE = '''      // El envío no modifica la cotización: solo registra que salió.
      enviarCorreos(items,(enviados)=>{'''

OLD_DECL = '''    const entradaEnt=o.querySelector("#e-ent");'''
NEW_DECL = ''''''

# aviso del adjunto en el pie del modal
OLD_HINT = '''          <span class="pdfhint" id="e-hint"></span>'''
NEW_HINT_GAS = '''          <span class="pdfhint" id="e-hint">Se adjunta el PDF de cada cotización tal como está en el sistema.</span>'''
NEW_HINT_ERP = '''          <span class="pdfhint" id="e-hint">Se descarga el PDF de cada cotización, tal como está en el sistema, para que lo adjuntes.</span>'''

# --------------------------- artefacto: descarga el PDF para adjuntarlo
OLD_ERP_ENV = '''  function enviarCorreos(items,onDone){
    const texto=items.map(it=>"Para: "+it.to+"\\nAsunto: "+it.asunto+"\\n\\n"+it.cuerpo).join("\\n\\n———\\n\\n");
    const abrir=()=>{const it=items[0];
      const url="mailto:"+encodeURIComponent(it.to)+"?subject="+encodeURIComponent(it.asunto)+"&body="+encodeURIComponent(it.cuerpo);
      try{window.open(url,"_blank");}catch(e){}};
    const seguir=()=>{abrir();onDone(items);};
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(texto).then(seguir,seguir);
    else seguir();
  }'''
NEW_ERP_ENV = '''  function enviarCorreos(items,onDone){
    const texto=items.map(it=>"Para: "+it.to+"\\nAsunto: "+it.asunto+"\\n\\n"+it.cuerpo).join("\\n\\n———\\n\\n");
    // El PDF sale del mismo generador que el botón PDF: es el documento del sistema, sin cambios.
    const bajaPDFs=()=>{if(!pdfReady())return;
      items.forEach((it,i)=>setTimeout(()=>{try{salesPDF(specCotizacion(it.cot)).save(it.cot.folio+".pdf");}catch(e){}},i*350));};
    const abrir=()=>{const it=items[0];
      const url="mailto:"+encodeURIComponent(it.to)+"?subject="+encodeURIComponent(it.asunto)+"&body="+encodeURIComponent(it.cuerpo);
      try{window.open(url,"_blank");}catch(e){}};
    const seguir=()=>{bajaPDFs();abrir();onDone(items);};
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(texto).then(seguir,seguir);
    else seguir();
  }'''

for path, hint in [(ERP, NEW_HINT_ERP), (APPJS, NEW_HINT_GAS)]:
    t = io.open(path, encoding="utf-8").read()
    t = sub(t, OLD_ENT, NEW_ENT, "campo entrega " + os.path.basename(path))
    t = sub(t, OLD_VARS, NEW_VARS, "vars " + os.path.basename(path))
    t = sub(t, OLD_PINTA, NEW_PINTA, "pinta " + os.path.basename(path))
    t = sub(t, OLD_SAVE, NEW_SAVE, "no modifica " + os.path.basename(path))
    t = sub(t, OLD_DECL, NEW_DECL, "declaracion " + os.path.basename(path))
    t = sub(t, OLD_HINT, hint, "aviso adjunto " + os.path.basename(path))
    if path == ERP:
        t = sub(t, OLD_ERP_ENV, NEW_ERP_ENV, "descarga de PDF")
    io.open(path, "w", encoding="utf-8").write(t)
    print("parcheado:", os.path.basename(path))
