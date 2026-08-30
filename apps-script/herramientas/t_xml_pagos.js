/* Cotizar desde XML: una sola línea y costo cuadrado con el CFDI.
   Registro de pago: facturas de mayor a menor saldo. */
const {chromium}=require(process.env.PWROOT+'/playwright');
const url='file://'+__dirname+'/erp.html';
const xml=__dirname+'/cfdi_prueba.xml';
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fulcrum_erp_v6')));
const SUB=18171.18;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url);
  await p.waitForSelector('#nav .navbtn');

  /* ---- integrante ---- */
  await p.click('[data-view="integrantes"]');await p.waitForTimeout(200);
  if(!(await p.$('[data-action="edit"][data-type="integrante"]'))){
    await p.click('[data-action="add"][data-type="integrante"]');
    await p.waitForSelector('#f-nom');
    await p.fill('#f-nom','Juan Manuel');
    await p.click('#modal form button.primary');await p.waitForTimeout(300);
  }

  /* ---- cargar el XML del proveedor ---- */
  await p.click('[data-view="proveedores"]');await p.waitForTimeout(250);
  const ints=await p.$$eval('#prov-integrante option',n=>n.map(o=>o.value).filter(Boolean));
  await p.selectOption('#prov-integrante',ints[0]);
  await p.waitForTimeout(200);
  await p.setInputFiles('#xmlfile',xml);
  await p.waitForTimeout(700);
  const prov=(await db(p)).proveedores.find(x=>x.folio==='A1234');
  chk(prov&&Math.abs(prov.subtotal-SUB)<0.001,'XML cargado con subtotal del CFDI: '+(prov&&prov.subtotal));
  chk(prov&&prov.conceptos.length===2,'el XML trae 2 conceptos');
  const sumaConc=prov.conceptos.reduce((a,c)=>a+c.costo*c.cantidad,0);
  chk(Math.abs(sumaConc-SUB)>0.5,'los conceptos NO suman el subtotal (dif '+(SUB-sumaConc).toFixed(4)+'), es el caso a cuadrar');

  /* ---- cotizar: una sola línea por defecto ---- */
  await p.evaluate(id=>{const cb=document.querySelector(`[data-action="prov-sel"][data-id="${id}"]`);cb.click();},prov.id);
  await p.waitForTimeout(300);
  await p.click('[data-action="prov-cotizar"]');
  await p.waitForSelector('#f-desg');
  chk(await p.$eval('#f-desg',e=>e.value)==='total','por defecto: una sola línea con el costo total');
  const opts=await p.$$eval('#f-desg option',n=>n.map(o=>o.textContent));
  chk(opts.length===3,'tres modos de detalle: '+opts.join(' / '));
  chk(/cuadra con el total del XML/.test(await p.$eval('#modal',e=>e.textContent)),'el modal avisa que cuadra con el XML');
  await p.click('#modal form button.primary');
  await p.waitForTimeout(600);
  const cot1=(await db(p)).cotizaciones.slice(-1)[0];
  chk(cot1.lineas.length===1,'la cotización trae UNA sola línea: '+cot1.lineas.length);
  const costo1=cot1.lineas.reduce((a,l)=>a+l.costo*l.cantidad,0);
  chk(Math.abs(costo1-SUB)<0.005,'el costo cuadra con el XML: '+costo1+' vs '+SUB);
  await p.keyboard.press('Escape');await p.waitForTimeout(200);

  /* ---- cotizar desglosando: también debe cuadrar ---- */
  await p.click('[data-view="proveedores"]');await p.waitForTimeout(250);
  await p.evaluate(id=>{document.querySelector(`[data-action="prov-sel"][data-id="${id}"]`).click();},prov.id);
  await p.waitForTimeout(300);
  await p.click('[data-action="prov-cotizar"]');
  await p.waitForSelector('#f-desg');
  await p.selectOption('#f-desg','conceptos');
  await p.click('#modal form button.primary');
  await p.waitForTimeout(600);
  const cot2=(await db(p)).cotizaciones.slice(-1)[0];
  chk(cot2.lineas.length===2,'desglosado: una línea por concepto ('+cot2.lineas.length+')');
  const costo2=cot2.lineas.reduce((a,l)=>a+l.costo*l.cantidad,0);
  chk(Math.abs(costo2-SUB)<0.02,'el desglose se ajusta para cuadrar con el XML: '+costo2.toFixed(4)+' vs '+SUB);
  await p.keyboard.press('Escape');await p.waitForTimeout(200);

  /* ---- pagos: facturas de mayor a menor ---- */
  await p.click('[data-view="pagos"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="pago"]');
  await p.waitForSelector('#paylist .payrow');
  const fol=await p.$$eval('#paylist .payrow',n=>n.map(e=>e.getAttribute('data-o-folio')));
  const nat=(a,b)=>String(a).localeCompare(String(b),'es',{numeric:true});
  chk(fol.length>1&&fol.every((v,i)=>i===0||nat(fol[i-1],v)>=0),'facturas por número, de mayor a menor: '+fol.join(' > '));
  await p.selectOption('.ordbar .ordsel','importe');await p.waitForTimeout(150);
  const saldos=await p.$$eval('#paylist .payrow',n=>n.map(e=>+e.getAttribute('data-o-importe')));
  chk(saldos.every((v,i)=>i===0||saldos[i-1]>=v),'y se puede ordenar por saldo: '+saldos.join(' > '));
  await p.keyboard.press('Escape');

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
