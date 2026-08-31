/* Simula Apps Script (Index.html + getRecursos) y prueba impuestos, líneas y pagos. */
const fs=require('fs'),{chromium}=require(process.env.PWROOT+'/playwright');
const dir=__dirname+'/appsscript';
const unwrap=s=>s.replace(/^[\s\S]*?<script[^>]*>/,'').replace(/<\/script>\s*$/,'');
const js=unwrap(fs.readFileSync(dir+'/AppJs.html','utf8'));
const logo=unwrap(fs.readFileSync(dir+'/LogoData.html','utf8')).trim();
const index=fs.readFileSync(dir+'/Index.html','utf8');
// jsPDF va embebido en el artefacto: se sirve en lugar del CDN para probar el envío real.
const lib=(fs.readFileSync(__dirname+'/erp.html','utf8').match(/<script>([\s\S]*?)<\/script>/g)||[])[0]
  .replace(/^<script>/,'').replace(/<\/script>$/,'');
let libServida=false;
const pdfjs=fs.readFileSync(__dirname+'/lib/package/legacy/build/pdf.min.js','utf8');
const pdfwk=fs.readFileSync(__dirname+'/lib/package/legacy/build/pdf.worker.min.js','utf8');
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/*',route=>{
    const u=route.request().url();
    if(/pdf\.worker\.min\.js/.test(u))return route.fulfill({status:200,body:pdfwk,contentType:'application/javascript'});
    if(/pdf\.min\.js/.test(u))return route.fulfill({status:200,body:pdfjs,contentType:'application/javascript'});
    if(u.startsWith('https://cdn.')){const body=libServida?'':lib;libServida=true;
      return route.fulfill({status:200,body,contentType:'application/javascript'});}
    if(u==='https://fulcrum.test/')return route.fulfill({status:200,contentType:'text/html',body:index});
    route.continue();
  });
  await p.addInitScript(({js,logo})=>{
    window.__DB={};
    const api={
      getRecursos:()=>JSON.stringify({js,logo}),
      getState:()=>JSON.stringify(window.__DB.state||null),
      saveState:s=>{window.__DB.state=JSON.parse(s);return 'ok';},
      saveSnaps:s=>{window.__DB.snaps=JSON.parse(s);return 'ok';},
      savePdfToDrive:()=>JSON.stringify({url:'https://drive.test/x'}),
      emailPdf:(to,sub,body,file,b64)=>{(window.__MAILS=window.__MAILS||[]).push({to,sub,body,file,n:(b64||'').length});return 'ok';},
    };
    function runner(){
      let s=null,f=null;
      const o=new Proxy({},{get(_,k){
        if(k==='withSuccessHandler')return h=>{s=h;return o;};
        if(k==='withFailureHandler')return h=>{f=h;return o;};
        if(k==='withUserObject')return ()=>o;
        return (...a)=>{setTimeout(()=>{try{const r=api[k]?api[k](...a):null;s&&s(r);}catch(e){f?f(e):console.error(e);}},5);};
      }});
      return o;
    }
    Object.defineProperty(window,'google',{value:{script:{get run(){return runner();},host:{close(){}},url:{getLocation(cb){cb({});}}}},writable:false});
  },{js,logo});
  await p.goto('https://fulcrum.test/');
  await p.waitForSelector('#nav .navbtn',{timeout:15000});
  chk(true,'la app arranca en Apps Script');
  chk(await p.$eval('#appver',e=>e.textContent)==='v19-2026-08-31','versión v19 en pantalla');
  chk(await p.$('#view [data-error]')==null,'sin recuadro de error');

  // cliente con impuestos
  await p.click('[data-view="clientes"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="cliente"]');
  await p.waitForSelector('#f-nom');
  await p.fill('#f-nom','CLIENTE GAS');await p.fill('#f-ivac','16');
  await p.click('#rets .retadd');await p.waitForTimeout(80);
  await p.fill('#rets .rrow:nth-child(1) [data-k="concepto"]','Retención ISR');
  await p.dispatchEvent('#rets .rrow:nth-child(1) [data-k="concepto"]','change');
  await p.waitForTimeout(80);
  chk(await p.$eval('#rets .rrow:nth-child(1) [data-k="tasa"]',e=>e.value)==='1.25','catálogo de impuestos en GAS');
  await p.click('#modal form button.primary');await p.waitForTimeout(400);

  // factura con impuestos del cliente y líneas con unidad/analítica
  await p.click('[data-view="facturas"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="factura"]');
  await p.waitForSelector('#lineas .lrow');
  const heads=await p.$$eval('#lineas .lhead span',n=>n.map(x=>x.textContent));
  chk(heads.includes('Unidad')&&heads.includes('Analítica'),'líneas con unidad y analítica: '+heads.join('|'));
  await p.fill('#f-folio','F-9500');
  await p.selectOption('#f-cliid',{label:'CLIENTE GAS'});
  await p.waitForTimeout(250);
  chk(await p.$eval('#f-cli',e=>e.value)==='CLIENTE GAS','cliente aplicado en GAS');
  chk(await p.$eval('#rets .rrow:nth-child(1) [data-k="concepto"]',e=>e.value)==='Retención ISR','retención heredada en GAS');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Maquila');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="unidad"]','SERV');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="analitica"]','PLANTA 1');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','3');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','1234.5678');
  await p.waitForTimeout(200);
  chk(/\$4,249\.99/.test(await p.$eval('#calc',e=>e.textContent)),'total neto en GAS');
  await p.click('#modal form button.primary');await p.waitForTimeout(2200);
  const fac=await p.evaluate(()=>{const s=window.__DB.state;return s&&s.facturas.find(f=>f.folio==='F-9500');});
  chk(fac&&fac.retenciones.length===1&&fac.lineas[0].unidad==='SERV','guardado en el servidor: '+JSON.stringify(fac&&{r:fac.retenciones,l:fac.lineas[0]}));

  // pago sin problema de validación
  await p.click('[data-view="pagos"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="pago"]');
  await p.waitForSelector('#paylist .payrow');
  const saldosGas=await p.$$eval('#paylist .pf-saldo',n=>n.map(e=>+e.textContent.replace(/[^\d.]/g,'')));
  chk(saldosGas.every((v,i)=>i===0||saldosGas[i-1]>=v),'facturas de mayor a menor en GAS: '+saldosGas.join(' > '));
  await p.evaluate(id=>{const cb=document.querySelector(`#paylist .pf[value="${id}"]`);cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));},fac.id);
  await p.waitForTimeout(200);
  const el=await p.$$eval('#paylist .pa',n=>n.map(e=>({v:e.value,ok:e.checkValidity(),fid:e.dataset.fid})));
  const mio=el.find(x=>x.fid===fac.id);
  chk(mio&&mio.v==='4249.99'&&mio.ok,'monto válido en GAS: '+JSON.stringify(mio));
  await p.click('#modal form button.primary');await p.waitForTimeout(2200);
  const pagada=await p.evaluate(id=>{const s=window.__DB.state;const f=s.facturas.find(x=>x.id===id);return f.flujo;},fac.id);
  chk(pagada==='pagada','la factura queda pagada en GAS: '+pagada);
  chk(await p.$eval('#syncbadge',e=>e.textContent).then(t=>/Guardado/.test(t)),'indicador de guardado');
  // ---- envío de cotizaciones con plantilla y adjunto ----
  chk(await p.$('[data-view="catalogos"]')!=null,'módulo Catálogos disponible en Apps Script');
  await p.click('[data-view="cotizaciones"]');await p.waitForTimeout(300);
  await p.click('[data-action="add"][data-type="cotizacion"]');
  await p.waitForSelector('#lineas .lrow');
  await p.fill('#f-folio','COT-GAS1');
  await p.selectOption('#f-cliid',{label:'CLIENTE GAS'});
  await p.waitForTimeout(250);
  await p.fill('#f-ent','15 días hábiles');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Suministro de prueba');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','2');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="costo"]','1000');
  await p.click('#modal form button.primary');await p.waitForTimeout(1800);
  chk(await p.$('[data-action="cot-enviar"]')!=null,'botón Enviar en las cotizaciones');
  await p.evaluate(()=>{document.querySelector('[data-action="cot-enviar"]').click();});
  await p.waitForSelector('#envform');
  chk(/Enviar ahora/.test(await p.$eval('#envform button.primary',e=>e.textContent)),'en Apps Script el botón envía de verdad');
  await p.evaluate(()=>{document.querySelectorAll('.mailrow').forEach(r=>{
    if(!r.querySelector('.mc:checked'))r.querySelector('.mextra').value='destino@gas.mx';});});
  const folioEnv=await p.$eval('.mailrow .mono',e=>e.textContent);
  await p.click('#envform button.primary');
  await p.waitForTimeout(4000);
  const mail=await p.evaluate(()=>window.__MAILS||[]);
  chk(mail.length===1&&/@/.test(mail[0].to)&&mail[0].file===folioEnv+'.pdf',
    'se envió un correo con el PDF adjunto: '+JSON.stringify(mail[0]&&{to:mail[0].to,file:mail[0].file}));
  chk(mail[0]&&!/\{\{/.test(mail[0].body)&&mail[0].body.length>40,'el cuerpo va con las variables resueltas');
  // el adjunto debe ser el mismo PDF que genera el boton PDF de esa cotizacion
  const mismo=await p.evaluate(f=>{const s=window.__DB.state;const c=s.cotizaciones.find(x=>x.folio===f);
    return null;},folioEnv);
  chk(mail[0]&&mail[0].n>3000,'el adjunto es un PDF real ('+(mail[0]&&mail[0].n)+' bytes en base64)');
  const st=await p.evaluate(f=>{const s=window.__DB.state;const c=s.cotizaciones.find(x=>x.folio===f);return c?{e:c.estatus,d:c.enviadaEl}:null;},folioEnv);
  chk(st&&st.e==='enviada'&&st.d,'la cotización quedó como enviada en el servidor: '+JSON.stringify(st));
  // ---- lector de la OC del cliente ----
  await p.click('[data-view="ventas"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="venta"]');
  await p.waitForSelector('#lineas .lrow');
  chk(await p.$('#ocpdf')!=null,'apartado de la OC del cliente en Apps Script');
  await p.fill('#f-folio','OV-GAS1');
  await p.fill('#f-cli','CLIENTE GAS');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Placa de acero');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','275');
  await p.waitForTimeout(200);
  await p.setInputFiles('#ocpdf',__dirname+'/oc_cliente_ok.pdf');
  await p.waitForSelector('#ocres .ocrow',{timeout:15000});
  await p.waitForTimeout(400);
  const ocres=await p.$$eval('#ocres .ocrow',n=>n.map(e=>e.className+':'+e.textContent.replace(/\s+/g,' ').trim()));
  chk(ocres.every(r=>/ocok/.test(r)),'la OC se valida en Apps Script: '+ocres.join(' | '));
  chk((await p.$eval('#f-occ',e=>e.value))==='OC-TB-8842','el número de OC se llena solo en Apps Script');
  await p.click('#modal form button.primary');await p.waitForTimeout(2000);
  const ovg=await p.evaluate(()=>{const s=window.__DB.state;return s.ventas.find(v=>v.folio==='OV-GAS1');});
  chk(ovg&&ovg.ocCliente==='OC-TB-8842'&&ovg.ocDoc&&ovg.ocDoc.valida,'la OV se guarda validada en el servidor');
  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
