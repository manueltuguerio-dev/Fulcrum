/* Lector del PDF de la orden de compra del cliente en la orden de venta. */
const fs=require('fs'),{chromium}=require(process.env.PWROOT+'/playwright');
const url='file://'+__dirname+'/erp.html';
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fulcrum_erp_v6')));
const pdfjs=fs.readFileSync(__dirname+'/lib/package/legacy/build/pdf.min.js','utf8');
const pdfwk=fs.readFileSync(__dirname+'/lib/package/legacy/build/pdf.worker.min.js','utf8');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.route('**/*',route=>{
    const u=route.request().url();
    if(/pdf\.worker\.min\.js/.test(u))return route.fulfill({status:200,body:pdfwk,contentType:'application/javascript'});
    if(/pdf\.min\.js/.test(u))return route.fulfill({status:200,body:pdfjs,contentType:'application/javascript'});
    if(u.startsWith('https://'))return route.fulfill({status:200,body:'',contentType:'application/javascript'});
    route.continue();
  });
  await p.goto(url);
  await p.waitForSelector('#nav .navbtn');
  chk(await p.evaluate(()=>!!(window.pdfjsLib&&window.pdfjsLib.getDocument)),'el lector de PDF carga');

  /* ---- orden de venta con subtotal 1,375.00 y total 1,595.00 ---- */
  await p.click('[data-view="ventas"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="venta"]');
  await p.waitForSelector('#lineas .lrow');
  chk(await p.$('#ocpdf')!=null,'la orden de venta tiene el apartado para la OC del cliente');
  await p.fill('#f-folio','OV-9001');
  await p.fill('#f-cli','ACEROS DEMO SA DE CV');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Placa de acero');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="costo"]','200');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','275');
  await p.waitForTimeout(200);
  chk(/\$1,375\.00/.test(await p.$eval('#calc',e=>e.textContent))&&/\$1,595\.00/.test(await p.$eval('#calc',e=>e.textContent)),
    'la OV suma 1,375.00 + IVA = 1,595.00');
  chk((await p.$eval('#f-occ',e=>e.value))==='','el campo OC del cliente empieza vacío');

  // cargar la OC correcta
  await p.setInputFiles('#ocpdf',__dirname+'/oc_cliente_ok.pdf');
  await p.waitForSelector('#ocres .ocrow',{timeout:15000});
  await p.waitForTimeout(400);
  const res=await p.$$eval('#ocres .ocrow',n=>n.map(e=>({t:e.textContent.replace(/\s+/g,' ').trim(),cls:e.className})));
  chk(res.length===3,'se muestran las tres validaciones: '+res.map(r=>r.t).join(' | '));
  chk(/OC-TB-8842/.test(res[0].t)&&/ocok/.test(res[0].cls),'detecta el número de OC: '+res[0].t);
  chk(/ocok/.test(res[1].cls)&&/1,375\.00/.test(res[1].t),'subtotal validado: '+res[1].t);
  chk(/ocok/.test(res[2].cls)&&/1,595\.00/.test(res[2].t),'total validado: '+res[2].t);
  chk((await p.$eval('#f-occ',e=>e.value))==='OC-TB-8842','el número de OC se pone solo en la orden de venta');
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  const ov=(await db(p)).ventas.find(v=>v.folio==='OV-9001');
  chk(ov&&ov.ocCliente==='OC-TB-8842','la OV guarda el número de OC');
  chk(ov&&ov.ocDoc&&ov.ocDoc.valida===true&&ov.ocDoc.subtotal===1375&&ov.ocDoc.total===1595,
    'guarda la lectura de la OC: '+JSON.stringify(ov&&ov.ocDoc&&{oc:ov.ocDoc.oc,s:ov.ocDoc.subtotal,t:ov.ocDoc.total,v:ov.ocDoc.valida}));
  const fila=await p.evaluate(id=>{const b=document.querySelector(`[data-action="edit"][data-type="venta"][data-id="${id}"]`);return b?b.closest('tr').textContent.replace(/\s+/g,' '):'';},ov.id);
  chk(/OC validada/.test(fila),'la lista marca la OC como validada: '+fila.slice(0,110));

  /* ---- OC con importes distintos ---- */
  await p.click('[data-action="add"][data-type="venta"]');
  await p.waitForSelector('#lineas .lrow');
  await p.fill('#f-folio','OV-9002');
  await p.fill('#f-cli','ACEROS DEMO SA DE CV');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Placa de acero');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','275');
  await p.waitForTimeout(200);
  await p.setInputFiles('#ocpdf',__dirname+'/oc_cliente_dif.pdf');
  await p.waitForSelector('#ocres .ocrow',{timeout:15000});
  await p.waitForTimeout(400);
  const res2=await p.$$eval('#ocres .ocrow',n=>n.map(e=>({t:e.textContent.replace(/\s+/g,' ').trim(),cls:e.className})));
  chk(/ocbad/.test(res2[1].cls)&&/diferencia/.test(res2[1].t),'marca la diferencia de subtotal: '+res2[1].t);
  chk(/ocbad/.test(res2[2].cls)&&/diferencia/.test(res2[2].t),'marca la diferencia de total: '+res2[2].t);
  chk((await p.$eval('#f-occ',e=>e.value))==='OC-TB-9999','toma el número de OC aunque los importes no cuadren');
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  const ov2=(await db(p)).ventas.find(v=>v.folio==='OV-9002');
  chk(ov2&&ov2.ocDoc&&ov2.ocDoc.valida===false,'la OV queda marcada como no validada');
  const fila2=await p.evaluate(id=>{const b=document.querySelector(`[data-action="edit"][data-type="venta"][data-id="${id}"]`);return b?b.closest('tr').textContent.replace(/\s+/g,' '):'';},ov2.id);
  chk(/OC con diferencias/.test(fila2),'la lista avisa de las diferencias');

  /* ---- al reabrir se conserva el resultado ---- */
  await p.evaluate(id=>document.querySelector(`[data-action="edit"][data-type="venta"][data-id="${id}"]`).click(),ov.id);
  await p.waitForSelector('#ocres .ocrow');
  chk(/OC-TB-8842/.test(await p.$eval('#ocres',e=>e.textContent)),'al reabrir la OV se ve la validación guardada');
  await p.keyboard.press('Escape');

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
