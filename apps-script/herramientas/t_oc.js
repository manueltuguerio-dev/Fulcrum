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

  /* ---- formato Carnes Premium XO: NUMERO/NUMBER y SUB. TOTAL ---- */
  await p.click('[data-action="add"][data-type="venta"]');
  await p.waitForSelector('#lineas .lrow');
  await p.fill('#f-folio','OV-9003');
  await p.fill('#f-cli','CARNES PREMIUM XO');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Placa de acero');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','275');
  await p.waitForTimeout(200);
  await p.setInputFiles('#ocpdf',__dirname+'/oc_xo.pdf');
  await p.waitForSelector('#ocres .ocrow',{timeout:15000});
  await p.waitForTimeout(400);
  const xo=await p.$$eval('#ocres .ocrow',n=>n.map(e=>e.className+' :: '+e.textContent.replace(/\s+/g,' ').trim()));
  chk(/4900000200/.test(xo[0]),'lee el número del recuadro NUMERO/NUMBER: '+xo[0]);
  chk(/ocok/.test(xo[1])&&/1,375\.00/.test(xo[1]),'compara contra SUB. TOTAL: '+xo[1]);
  chk(/ocok/.test(xo[2])&&/1,595\.00/.test(xo[2]),'el total no se confunde con el SUB. TOTAL: '+xo[2]);
  chk((await p.$eval('#f-occ',e=>e.value))==='4900000200','pone el número de OC en la orden de venta');

  /* ---- retenciones en la orden de venta ---- */
  chk(await p.$('#rets .retadd')!=null,'la orden de venta tiene editor de retenciones');
  await p.click('#rets .retadd');await p.waitForTimeout(100);
  await p.fill('#rets .rrow:nth-child(1) [data-k="concepto"]','Retención ISR');
  await p.dispatchEvent('#rets .rrow:nth-child(1) [data-k="concepto"]','change');
  await p.waitForTimeout(200);
  const calcOV=(await p.$eval('#calc',e=>e.textContent)).replace(/\s+/g,' ');
  chk(/Retención ISR/.test(calcOV)&&/\$1,577\.81/.test(calcOV),'la retención se resta del total de la OV: '+calcOV.slice(0,160));
  // con la retención puesta, una OC por 1,595.00 ya no cuadra
  await p.setInputFiles('#ocpdf',__dirname+'/oc_cliente_ok.pdf');
  await p.waitForTimeout(1200);
  const xo2=await p.$$eval('#ocres .ocrow',n=>n.map(e=>e.className+' :: '+e.textContent.replace(/\s+/g,' ').trim()));
  chk(/ocbad/.test(xo2[2]),'con retención el total de esa OC ya no cuadra: '+xo2[2]);
  // la OC que sí trae la retención cuadra
  await p.setInputFiles('#ocpdf',__dirname+'/oc_con_retencion.pdf');
  await p.waitForTimeout(1200);
  const xo3=await p.$$eval('#ocres .ocrow',n=>n.map(e=>e.className+' :: '+e.textContent.replace(/\s+/g,' ').trim()));
  chk(/ocok/.test(xo3[1])&&/ocok/.test(xo3[2]),'la OC con retención cuadra: '+xo3[2]);
  chk(/4900000480/.test(xo3[0]),'y toma su número: '+xo3[0]);
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  const ov3=(await db(p)).ventas.find(v=>v.folio==='OV-9003');
  chk(ov3&&ov3.retenciones&&ov3.retenciones.length===1,'la OV guarda sus retenciones');
  chk(ov3&&ov3.ocCliente==='4900000480'&&ov3.ocDoc.valida,'la OV queda con la OC validada');
  // el PDF de la OV muestra la retención
  await p.evaluate(id=>document.querySelector(`[data-action="print"][data-type="ov"][data-id="${id}"]`).click(),ov3.id);
  await p.waitForTimeout(800);
  const pv=await p.evaluate(()=>{const o=[...document.querySelectorAll('.overlay.on')].pop();return o?o.textContent:'';});
  chk(/RETENCIÓN ISR/i.test(pv)&&/1,577\.81/.test(pv),'el PDF de la OV imprime la retención y el total neto');
  await p.evaluate(()=>{document.querySelectorAll('.overlay').forEach(o=>{if(o.id!=='overlay')o.remove();else o.classList.remove('on');});});
  await p.waitForTimeout(200);

  /* ---- orden sin ninguna etiqueta de número ---- */
  await p.click('[data-action="add"][data-type="venta"]');
  await p.waitForSelector('#lineas .lrow');
  await p.fill('#f-folio','OV-9004');
  await p.fill('#f-cli','CARNES PREMIUM XO');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Placa de acero');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="precio"]','275');
  await p.waitForTimeout(200);
  await p.setInputFiles('#ocpdf',__dirname+'/oc_sin_etiqueta.pdf');
  await p.waitForSelector('#ocres .ocrow',{timeout:15000});
  await p.waitForTimeout(400);
  const sn=await p.$$eval('#ocres .ocrow',n=>n.map(e=>e.className+' :: '+e.textContent.replace(/\s+/g,' ').trim()));
  chk(/4900000315/.test(sn[0]),'toma el número aunque venga sin etiqueta: '+sn[0]);
  chk(/ocok/.test(sn[1])&&/ocok/.test(sn[2]),'y valida los importes: '+sn[1]);
  await p.keyboard.press('Escape');await p.waitForTimeout(200);

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
