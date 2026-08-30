/* Filtros de orden en las listas desplegadas de los formularios. */
const {chromium}=require(process.env.PWROOT+'/playwright');
const url='file://'+__dirname+'/erp.html';
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};
const nat=(a,b)=>String(a).localeCompare(String(b),'es',{numeric:true,sensitivity:'base'});
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(url);
  await p.waitForSelector('#nav .navbtn');

  /* ---- pagos: por número de factura, de mayor a menor ---- */
  await p.click('[data-view="pagos"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="pago"]');
  await p.waitForSelector('#paylist .payrow');
  chk(await p.$('.ordbar')!=null,'la lista de facturas trae barra de orden');
  chk(await p.$eval('.ordbar .ordsel',e=>e.value)==='folio','ordena por número de factura por defecto');
  chk(await p.$eval('.ordbar .orddir',e=>e.dataset.dir)==='desc','de mayor a menor por defecto');
  const folios=()=>p.$$eval('#paylist .payrow',n=>n.map(e=>e.getAttribute('data-o-folio')));
  const f1=await folios();
  chk(f1.length>1&&f1.every((v,i)=>i===0||nat(f1[i-1],v)>=0),'facturas por folio descendente: '+f1.join(' > '));
  // invertir
  await p.click('.ordbar .orddir');await p.waitForTimeout(150);
  const f2=await folios();
  chk(f2.every((v,i)=>i===0||nat(f2[i-1],v)<=0),'al pulsar el botón cambia a ascendente: '+f2.join(' < '));
  chk(/Menor a mayor/.test(await p.$eval('.ordbar .orddir',e=>e.textContent)),'el botón refleja el sentido');
  // ordenar por saldo
  await p.selectOption('.ordbar .ordsel','importe');await p.waitForTimeout(150);
  const s1=await p.$$eval('#paylist .payrow',n=>n.map(e=>+e.getAttribute('data-o-importe')));
  chk(s1.every((v,i)=>i===0||s1[i-1]<=v),'por saldo ascendente: '+s1.join(' < '));
  await p.click('.ordbar .orddir');await p.waitForTimeout(150);
  const s2=await p.$$eval('#paylist .payrow',n=>n.map(e=>+e.getAttribute('data-o-importe')));
  chk(s2.every((v,i)=>i===0||s2[i-1]>=v),'por saldo descendente: '+s2.join(' > '));
  // marcar una y reordenar: la marca se conserva
  const id=await p.$eval('#paylist .pf',e=>e.value);
  await p.evaluate(i=>{const cb=document.querySelector(`#paylist .pf[value="${i}"]`);cb.checked=true;cb.dispatchEvent(new Event('change',{bubbles:true}));},id);
  await p.waitForTimeout(150);
  await p.selectOption('.ordbar .ordsel','nombre');await p.waitForTimeout(150);
  const sigueMarcada=await p.evaluate(i=>{const cb=document.querySelector(`#paylist .pf[value="${i}"]`);return cb.checked&&+cb.closest('.payrow').querySelector('.pa').value>0;},id);
  chk(sigueMarcada,'al reordenar se conserva lo marcado y su importe');
  const cl=await p.$$eval('#paylist .payrow',n=>n.map(e=>e.getAttribute('data-o-nombre')));
  chk(cl.every((v,i)=>i===0||nat(cl[i-1],v)>=0)||cl.every((v,i)=>i===0||nat(cl[i-1],v)<=0),'orden por cliente: '+cl.join(' | '));
  await p.keyboard.press('Escape');await p.waitForTimeout(150);

  /* ---- proyecto: las cuatro listas ---- */
  await p.click('[data-view="proyectos"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="proyecto"]');
  await p.waitForSelector('#modal .checklist');
  const barras=await p.$$('.ordbar');
  chk(barras.length>=4,'las listas del proyecto traen barra de orden ('+barras.length+')');
  const cajas=await p.$$eval('#modal [data-ordlist]',n=>n.map(e=>e.querySelectorAll('[data-ordrow]').length));
  chk(cajas.length>=4,'cuatro listas ordenables: '+cajas.join(','));
  const fol=async i=>p.$$eval('#modal [data-ordlist]',(n,k)=>[...n[k].querySelectorAll('[data-ordrow]')].map(e=>e.getAttribute('data-o-folio')),i);
  const c0=await fol(0);
  chk(c0.length>1&&c0.every((v,i)=>i===0||nat(c0[i-1],v)>=0),'cotizaciones por folio descendente: '+c0.join(' > '));
  // ordenar la primera lista por importe
  await p.evaluate(()=>{const s=document.querySelectorAll('.ordsel')[0];s.value='importe';s.dispatchEvent(new Event('change',{bubbles:true}));});
  await p.waitForTimeout(150);
  const imp=await p.$$eval('#modal [data-ordlist]',n=>[...n[0].querySelectorAll('[data-ordrow]')].map(e=>+e.getAttribute('data-o-importe')));
  chk(imp.every((v,i)=>i===0||imp[i-1]>=v),'cotizaciones por importe descendente: '+imp.join(' > '));
  // marcar y guardar: sigue funcionando
  await p.fill('#f-nom','Proyecto orden');
  await p.evaluate(()=>{const cb=document.querySelector('.c-cot');cb.checked=true;});
  const marcado=await p.$eval('.c-cot',e=>e.value);
  await p.click('#modal form button.primary');await p.waitForTimeout(400);
  const pr=await p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('fulcrum_erp_v6'));return s.proyectos.find(x=>x.nombre==='Proyecto orden');});
  chk(pr&&pr.cotIds.length===1&&pr.cotIds[0]===marcado,'el proyecto guarda la cotización marcada tras reordenar');

  /* ---- clientes en orden alfabético ---- */
  await p.click('[data-view="cotizaciones"]');await p.waitForTimeout(200);
  await p.click('[data-action="add"][data-type="cotizacion"]');
  await p.waitForSelector('#f-cli');
  const cls=await p.$$eval('#modal datalist#cli-list option',n=>n.map(o=>o.value));
  chk(cls.every((v,i)=>i===0||nat(cls[i-1],v)<=0),'clientes sugeridos en orden alfabético: '+cls.join(' | '));
  await p.keyboard.press('Escape');

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
