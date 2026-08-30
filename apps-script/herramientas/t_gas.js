/* Simula Apps Script (Index.html + getRecursos) y prueba impuestos, líneas y pagos. */
const fs=require('fs'),{chromium}=require(process.env.PWROOT+'/playwright');
const dir=__dirname+'/appsscript';
const unwrap=s=>s.replace(/^[\s\S]*?<script[^>]*>/,'').replace(/<\/script>\s*$/,'');
const js=unwrap(fs.readFileSync(dir+'/AppJs.html','utf8'));
const logo=unwrap(fs.readFileSync(dir+'/LogoData.html','utf8')).trim();
const index=fs.readFileSync(dir+'/Index.html','utf8');
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};

(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/*',route=>{
    const u=route.request().url();
    if(u.startsWith('https://cdn.'))return route.fulfill({status:200,body:'',contentType:'application/javascript'});
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
      emailPdf:()=>'ok',
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
  chk(await p.$eval('#appver',e=>e.textContent)==='v14-2026-08-30','versión v14 en pantalla');
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
  await p.evaluate(id=>{const cb=document.querySelector(`#paylist .pf[value="${id}"]`);cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));},fac.id);
  await p.waitForTimeout(200);
  const el=await p.$$eval('#paylist .pa',n=>n.map(e=>({v:e.value,ok:e.checkValidity(),fid:e.dataset.fid})));
  const mio=el.find(x=>x.fid===fac.id);
  chk(mio&&mio.v==='4249.99'&&mio.ok,'monto válido en GAS: '+JSON.stringify(mio));
  await p.click('#modal form button.primary');await p.waitForTimeout(2200);
  const pagada=await p.evaluate(id=>{const s=window.__DB.state;const f=s.facturas.find(x=>x.id===id);return f.flujo;},fac.id);
  chk(pagada==='pagada','la factura queda pagada en GAS: '+pagada);
  chk(await p.$eval('#syncbadge',e=>e.textContent).then(t=>/Guardado/.test(t)),'indicador de guardado');
  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
