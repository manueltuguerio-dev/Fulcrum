/* Moneda MXN/USD en los documentos y persistencia de pagos y contactos. */
const {chromium}=require(process.env.PWROOT+'/playwright');
const url='file://'+__dirname+'/erp.html';
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fulcrum_erp_v6')));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/*',r=>r.request().url().startsWith('https://')
    ?r.fulfill({status:200,body:'',contentType:'application/javascript'}):r.continue());
  await p.goto(url);
  await p.waitForSelector('#nav .navbtn');
  await p.click('[data-action="reset"]');await p.waitForSelector('[data-yes]');
  await p.click('[data-yes]');await p.waitForTimeout(500);

  /* ============ 1. CATÁLOGO DE MONEDAS ============ */
  await p.click('[data-view="catalogos"]');await p.waitForTimeout(250);
  const cats=await p.$$eval('[data-action="cat-tab"]',n=>n.map(e=>e.textContent.trim()));
  chk(cats.some(c=>/Monedas/.test(c)),'catálogo de monedas: '+cats.join(' | '));
  const mon=(await db(p)).catalogos.monedas;
  chk(mon.length===2&&mon.find(m=>m.clave==='USD').tc===17,'MXN y USD sembradas · USD a '+mon.find(m=>m.clave==='USD').tc);

  /* ============ 2. COTIZACIÓN EN USD ============ */
  await p.click('[data-view="cotizaciones"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="cotizacion"]');
  await p.waitForSelector('#lineas .lrow');
  chk(await p.$('#f-mon')!=null,'la cotización tiene campo de moneda');
  chk(await p.$eval('#f-mon',e=>e.value)==='MXN','viene en MXN por defecto');
  chk(await p.$eval('#wrap-tc',e=>e.style.display)==='none','el tipo de cambio se oculta en MXN');
  const opts=await p.$$eval('#f-mon option',n=>n.map(o=>o.value));
  chk(opts.join(',')==='MXN,USD','opciones MXN y USD');
  await p.fill('#f-folio','COT-USD1');
  await p.fill('#f-cli','EXPORT DEMO INC');
  await p.selectOption('#f-mon','USD');
  await p.waitForTimeout(250);
  chk(await p.$eval('#wrap-tc',e=>e.style.display)!=='none','al elegir USD aparece el tipo de cambio');
  chk(await p.$eval('#f-tc',e=>e.value)==='17','propone el tipo de cambio del catálogo');
  await p.fill('#f-tc','18.5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Equipo importado');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','2');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="costo"]','500');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="margen"]','20');
  await p.waitForTimeout(300);
  const calc=(await p.$eval('#calc',e=>e.textContent)).replace(/\s+/g,' ');
  chk(/USD/.test(calc)&&!/^\$/.test(calc.trim()),'el cálculo se muestra en USD: '+calc.slice(0,120));
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  const cot=(await db(p)).cotizaciones.find(c=>c.folio==='COT-USD1');
  chk(cot&&cot.moneda==='USD'&&cot.tc===18.5,'la cotización guarda moneda y tipo de cambio: '+JSON.stringify({m:cot.moneda,tc:cot.tc}));
  const fila=await p.evaluate(id=>{const b=document.querySelector(`[data-action="edit"][data-type="cotizacion"][data-id="${id}"]`);return b?b.closest('tr').textContent.replace(/\s+/g,' '):'';},cot.id);
  chk(/USD/.test(fila),'la lista marca la moneda: '+fila.slice(0,90));
  // PDF con la moneda
  await p.evaluate(id=>document.querySelector(`[data-action="print"][data-type="cot"][data-id="${id}"]`).click(),cot.id);
  await p.waitForTimeout(700);
  const pv=await p.evaluate(()=>{const o=[...document.querySelectorAll('.overlay.on')].pop();return o?o.textContent:'';});
  chk(/Moneda: USD/.test(pv)&&/T\.C\. 18\.5/.test(pv),'el PDF indica la moneda y el tipo de cambio');
  await p.evaluate(()=>{document.querySelectorAll('.overlay').forEach(o=>{if(o.id!=='overlay')o.remove();else o.classList.remove('on');});});
  await p.waitForTimeout(200);

  /* ============ 3. LA MONEDA SE HEREDA HASTA LA FACTURA ============ */
  await p.evaluate(id=>{document.querySelector(`[data-action="cot-sel"][data-id="${id}"]`).click();},cot.id);
  await p.waitForTimeout(300);
  await p.selectOption('#cot-masivo-estatus','aceptada');
  await p.click('[data-action="cot-masivo"]');await p.waitForTimeout(500);
  chk((await db(p)).cotizaciones.find(c=>c.folio==='COT-USD1').estatus==='aceptada','la cotización pasa a aceptada');
  await p.evaluate(id=>document.querySelector(`[data-action="cot-venta"][data-id="${id}"]`).click(),cot.id);
  await p.waitForSelector('#f-mon');
  chk(await p.$eval('#f-mon',e=>e.value)==='USD','la orden de venta hereda la moneda');
  chk(await p.$eval('#f-tc',e=>e.value)==='18.5','y el tipo de cambio');
  await p.fill('#f-folio','OV-USD1');
  await p.click('#modal form button.primary');await p.waitForTimeout(600);
  const ov=(await db(p)).ventas.find(v=>v.folio==='OV-USD1');
  chk(ov&&ov.moneda==='USD'&&ov.tc===18.5,'la OV guarda la moneda heredada');
  await p.click('[data-view="ventas"]');await p.waitForTimeout(300);
  await p.evaluate(id=>document.querySelector(`[data-action="ov-factura"][data-id="${id}"]`).click(),ov.id);
  await p.waitForTimeout(600);
  const fac=(await db(p)).facturas.find(f=>f.ventaId===ov.id);
  chk(fac&&fac.moneda==='USD'&&fac.tc===18.5,'la factura generada hereda la moneda: '+JSON.stringify(fac&&{m:fac.moneda,tc:fac.tc}));

  /* ============ 4. NO SE MEZCLAN MONEDAS AL PAGAR ============ */
  await p.click('[data-view="pagos"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="pago"]');
  await p.waitForSelector('#paylist .payrow');
  const monedasFilas=await p.$$eval('#paylist .payrow',n=>n.map(e=>e.dataset.moneda));
  chk(monedasFilas.includes('USD')&&monedasFilas.includes('MXN'),'la lista de pago muestra facturas en ambas monedas');
  await p.evaluate(()=>{document.querySelectorAll('#paylist .pf').forEach(cb=>{cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));});});
  await p.waitForTimeout(300);
  chk(/mezcladas/.test(await p.$eval('#paytot',e=>e.textContent)),'avisa que hay monedas mezcladas');
  await p.click('#modal form button.primary');await p.waitForTimeout(400);
  chk(await p.$('#envform, #paylist')!=null,'no deja guardar un pago con monedas mezcladas');
  // dejar solo la factura en USD
  await p.evaluate(id=>{document.querySelectorAll('#paylist .pf').forEach(cb=>{
    const q=cb.value===id;if(cb.checked!==q){cb.checked=q;cb.dispatchEvent(new Event('change',{bubbles:true}));}});},fac.id);
  await p.waitForTimeout(300);
  chk(/USD/.test(await p.$eval('#paytot',e=>e.textContent)),'el total del pago se muestra en USD: '+await p.$eval('#paytot',e=>e.textContent));
  await p.click('#modal form button.primary');await p.waitForTimeout(600);
  const pago=(await db(p)).pagos.find(x=>(x.aplicaciones||[]).some(a=>a.facturaId===fac.id));
  chk(pago&&pago.moneda==='USD'&&pago.tc===18.5,'el pago guarda su moneda: '+JSON.stringify(pago&&{m:pago.moneda,tc:pago.tc}));

  /* ============ 5. TABLERO EN PESOS ============ */
  await p.click('[data-view="dashboard"]');await p.waitForTimeout(300);
  const kpis=await p.$eval('.kpis',e=>e.textContent.replace(/\s+/g,' '));
  chk(!/USD/.test(kpis),'el tablero acumula todo en pesos: '+kpis.slice(0,90));

  /* ============ 6. PERSISTENCIA TRAS RECARGAR ============ */
  await p.click('[data-view="clientes"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="cliente"]');
  await p.waitForSelector('#f-nom');
  await p.fill('#f-nom','PERSISTE SA');
  await p.click('#cons .conadd');await p.waitForTimeout(80);
  await p.fill('#cons .crow:nth-child(1) [data-k="nombre"]','Rosa Díaz');
  await p.fill('#cons .crow:nth-child(1) [data-k="puesto"]','Pagos');
  await p.fill('#cons .crow:nth-child(1) [data-k="email"]','rosa@persiste.mx');
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  await p.reload();
  await p.waitForSelector('#nav .navbtn');
  await p.waitForTimeout(400);
  const st=await db(p);
  const cliP=st.clientes.find(c=>c.nombre==='PERSISTE SA');
  chk(cliP&&cliP.contactos.length===1&&cliP.contactos[0].email==='rosa@persiste.mx','los contactos siguen ahí tras recargar');
  const pagoP=st.pagos.find(x=>(x.aplicaciones||[]).some(a=>a.facturaId===fac.id));
  chk(pagoP&&pagoP.aplicaciones.length===1&&pagoP.moneda==='USD','las aplicaciones de pago siguen ahí tras recargar');
  chk(st.cotizaciones.find(c=>c.folio==='COT-USD1').moneda==='USD','la moneda sobrevive a la recarga');
  // y se ven en pantalla
  await p.click('[data-view="clientes"]');await p.waitForTimeout(300);
  await p.evaluate(id=>document.querySelector(`[data-action="edit"][data-type="cliente"][data-id="${id}"]`).click(),cliP.id);
  await p.waitForSelector('#cons .crow');
  chk((await p.$eval('#cons .crow:nth-child(1) [data-k="email"]',e=>e.value))==='rosa@persiste.mx','al reabrir el cliente se ven sus contactos');
  await p.keyboard.press('Escape');await p.waitForTimeout(200);
  await p.click('[data-view="pagos"]');await p.waitForTimeout(300);
  await p.evaluate(id=>document.querySelector(`[data-action="edit"][data-type="pago"][data-id="${id}"]`).click(),pagoP.id);
  await p.waitForSelector('#paylist .payrow');
  const marcadas=await p.$$eval('#paylist .pf:checked',n=>n.length);
  chk(marcadas===1,'al reabrir el pago se conserva su aplicación');

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
