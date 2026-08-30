const {chromium}=require(process.env.PWROOT+'/playwright');
const url='file://'+__dirname+'/erp.html';
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fulcrum_erp_v6')));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url);
  await p.waitForSelector('#nav .navbtn');

  /* ---- 1. cliente con impuestos dados de alta ---- */
  await p.click('[data-view="clientes"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="cliente"]');
  await p.waitForSelector('#f-nom');
  await p.fill('#f-nom','CARNES PRUEBA SA');
  await p.fill('#f-rfc','CPR010101AAA');
  await p.fill('#f-ivac','16');
  chk(await p.$('#rets datalist#fx-ret')!=null,'catálogo de impuestos (datalist fx-ret)');
  await p.click('#rets .retadd');await p.waitForTimeout(80);
  await p.fill('#rets .rrow:nth-child(1) [data-k="concepto"]','Retención ISR');
  await p.dispatchEvent('#rets .rrow:nth-child(1) [data-k="concepto"]','change');
  await p.waitForTimeout(80);
  chk(await p.$eval('#rets .rrow:nth-child(1) [data-k="tasa"]',e=>e.value)==='1.25','autollenado de tasa desde el catálogo');
  await p.click('#modal form button.primary');await p.waitForTimeout(300);
  const cli=(await db(p)).clientes.find(c=>c.nombre==='CARNES PRUEBA SA');
  chk(cli&&cli.retenciones.length===1&&cli.retenciones[0].tasa===1.25,'cliente guardado con retención: '+JSON.stringify(cli&&cli.retenciones));

  /* ---- 2. factura: sugerencia de cliente + impuestos heredados ---- */
  await p.click('[data-view="facturas"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="factura"]');
  await p.waitForSelector('#lineas .lrow');
  const cliOpts=await p.$$eval('#modal datalist#cli-list option',n=>n.map(x=>x.value));
  chk(cliOpts.includes('CARNES PRUEBA SA'),'sugerencia de clientes en factura: '+cliOpts.join(','));
  chk(await p.$('#rets')!=null,'la factura tiene editor de impuestos/retenciones');
  chk(await p.$('#f-cliid')!=null,'la factura tiene selector de impuestos de cliente');
  await p.fill('#f-folio','F-9001');
  await p.selectOption('#f-cliid',{label:'CARNES PRUEBA SA'});
  await p.waitForTimeout(250);
  chk(await p.$eval('#f-cli',e=>e.value)==='CARNES PRUEBA SA','el nombre del cliente se llena solo');
  chk(await p.$eval('#f-iva',e=>e.value)==='16','IVA heredado del cliente');
  chk(await p.$eval('#rets .rrow:nth-child(1) [data-k="concepto"]',e=>e.value)==='Retención ISR','retención heredada del cliente');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Servicio de maquila');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','3');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="costo"]','1000');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','1234.5678');
  await p.waitForTimeout(200);
  const calc=(await p.$eval('#calc',e=>e.textContent)).replace(/\s+/g,' ');
  chk(/Retención ISR/.test(calc),'la retención aparece en el cálculo: '+calc.slice(0,200));
  chk(/\$4,249\.99/.test(calc),'total con retención = $4,249.99 · '+calc.slice(0,200));
  await p.click('#rets .retadd');await p.waitForTimeout(80);
  await p.fill('#rets .rrow:nth-child(2) [data-k="concepto"]','Retención IVA');
  await p.dispatchEvent('#rets .rrow:nth-child(2) [data-k="concepto"]','change');
  await p.waitForTimeout(150);
  chk((await p.$$('#rets .rrow')).length===2,'agregar impuesto en la factura');
  chk(/Retención IVA/.test(await p.$eval('#calc',e=>e.textContent)),'el impuesto agregado afecta el cálculo');
  await p.click('#rets .rrow:nth-child(2) .l-del');await p.waitForTimeout(150);
  chk((await p.$$('#rets .rrow')).length===1,'eliminar impuesto en la factura');
  chk(!/Retención IVA/.test(await p.$eval('#calc',e=>e.textContent)),'al eliminarlo desaparece del cálculo');
  await p.click('#modal form button.primary');await p.waitForTimeout(400);
  const fac=(await db(p)).facturas.find(f=>f.folio==='F-9001');
  chk(fac&&fac.retenciones.length===1&&!!fac.clienteId,'factura guardada con retención y cliente ligado');

  // la tabla debe mostrar el total ya neto de retenciones
  const filaTxt=await p.evaluate(id=>{const b=document.querySelector(`[data-action="edit"][data-type="factura"][data-id="${id}"]`);return b?b.closest('tr').textContent.replace(/\s+/g,' '):'';},fac.id);
  chk(/\$4,249\.99/.test(filaTxt),'la lista muestra el total neto: '+filaTxt.slice(0,140));

  /* ---- 3. reapertura para editar ---- */
  await p.evaluate(id=>document.querySelector(`[data-action="edit"][data-type="factura"][data-id="${id}"]`).click(),fac.id);
  await p.waitForSelector('#rets .rrow');
  chk(await p.$eval('#rets .rrow:nth-child(1) [data-k="concepto"]',e=>e.value)==='Retención ISR','al editar se cargan las retenciones');
  chk(await p.$eval('#f-cliid',e=>e.value)===fac.clienteId,'al editar queda seleccionado el cliente');
  await p.keyboard.press('Escape');await p.waitForTimeout(150);

  /* ---- 4. pago: sin error de redondeo ---- */
  await p.click('[data-view="pagos"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="pago"]');
  await p.waitForSelector('#paylist .payrow');
  // marcar TODAS las facturas pendientes: ninguna debe producir un monto invalido
  await p.evaluate(()=>{document.querySelectorAll('#paylist .pf').forEach(cb=>{cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));});});
  await p.waitForTimeout(300);
  const montos=await p.$$eval('#paylist .pa',n=>n.map(e=>({v:e.value,ok:e.checkValidity(),fid:e.dataset.fid})));
  chk(montos.every(m=>/^\d+(\.\d{1,2})?$/.test(m.v)),'todos los saldos con 2 decimales: '+montos.map(m=>m.v).join(', '));
  chk(montos.every(m=>m.ok),'el navegador acepta todos los montos (sin «Ingresa un valor válido»)');
  const mio=montos.find(m=>m.fid===fac.id);
  chk(mio&&mio.v==='4249.99','saldo propuesto de F-9001: '+(mio&&mio.v));
  // dejar solo F-9001 y guardar
  await p.evaluate(id=>{document.querySelectorAll('#paylist .pf').forEach(cb=>{if(cb.value!==id){cb.checked=false;cb.dispatchEvent(new Event('change',{bubbles:true}));}});},fac.id);
  await p.waitForTimeout(200);
  chk((await p.$eval('#paytot',e=>e.textContent))==='$4,249.99','total del pago: '+await p.$eval('#paytot',e=>e.textContent));
  await p.click('#modal form button.primary');await p.waitForTimeout(600);
  chk(await p.$('#overlay.on')==null,'el pago se guarda sin bloqueos');
  const st=await db(p);
  const pago=st.pagos.find(x=>(x.aplicaciones||[]).some(a=>a.facturaId===fac.id));
  chk(pago&&pago.monto===4249.99,'pago registrado por 4249.99: '+(pago&&pago.monto));
  await p.click('[data-view="facturas"]');await p.waitForTimeout(250);
  const fila2=await p.evaluate(id=>{const b=document.querySelector(`[data-action="edit"][data-type="factura"][data-id="${id}"]`);return b?b.closest('tr').textContent.replace(/\s+/g,' '):'';},fac.id);
  chk(/pagada/i.test(fila2)&&/\$0\.00/.test(fila2),'la factura queda saldada y en «pagada»: '+fila2.slice(0,160));

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
