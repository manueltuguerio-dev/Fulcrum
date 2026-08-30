/* Catálogos, decimales por unidad, margen del cliente, entrega,
   rechazo con comentario, estatus masivo, contactos y envío con plantillas. */
const {chromium}=require(process.env.PWROOT+'/playwright');
const url='file://'+__dirname+'/erp.html';
const ok=[],bad=[];const chk=(c,m)=>{(c?ok:bad).push(m);};
const db=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('fulcrum_erp_v6')));
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
  const p=await b.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(String(e)));
  p.on('popup',pp=>pp.close().catch(()=>{}));
  await p.goto(url);
  await p.waitForSelector('#nav .navbtn');
  // fuerza una escritura en localStorage para poder leer el estado
  await p.click('[data-action="reset"]');
  await p.waitForSelector('[data-yes]');
  await p.click('[data-yes]');await p.waitForTimeout(500);
  chk((await db(p))!=null,'los datos de ejemplo se guardan con catálogos');

  /* ================= 1. CATÁLOGOS ================= */
  chk(await p.$('[data-view="catalogos"]')!=null,'el módulo Catálogos está en el menú');
  await p.click('[data-view="catalogos"]');await p.waitForTimeout(250);
  const pestanas=await p.$$eval('[data-action="cat-tab"]',n=>n.map(e=>e.textContent.trim()));
  chk(pestanas.length===7,'siete catálogos: '+pestanas.join(' | '));
  const uni=(await db(p)).catalogos.unidades;
  chk(uni.length===14&&uni.find(u=>u.clave==='KG').decimales===3,'unidades sembradas con decimales: KG='+uni.find(u=>u.clave==='KG').decimales);
  // agregar una unidad
  await p.click('[data-action="cat-add"][data-cat="unidades"]');
  await p.waitForSelector('#cf-clave');
  await p.fill('#cf-clave','GAL');await p.fill('#cf-nombre','Galón');await p.fill('#cf-decimales','2');
  await p.click('#modal form button.primary');await p.waitForTimeout(400);
  chk((await db(p)).catalogos.unidades.some(u=>u.clave==='GAL'),'alta en el catálogo de unidades');
  // editar
  const gal=(await db(p)).catalogos.unidades.find(u=>u.clave==='GAL');
  await p.evaluate(id=>document.querySelector(`[data-action="cat-edit"][data-cat="unidades"][data-id="${id}"]`).click(),gal.id);
  await p.waitForSelector('#cf-decimales');
  await p.fill('#cf-decimales','1');
  await p.click('#modal form button.primary');await p.waitForTimeout(400);
  chk((await db(p)).catalogos.unidades.find(u=>u.clave==='GAL').decimales===1,'edición en el catálogo');
  // plantillas
  await p.click('[data-action="cat-tab"][data-cat="plantillas"]');await p.waitForTimeout(250);
  const tpl=(await db(p)).catalogos.plantillas[0];
  chk(tpl&&/\{\{entrega\}\}/.test(tpl.cuerpo),'la plantilla por defecto incluye el tiempo de entrega');

  /* ================= 2. CONTACTOS POR EMPRESA ================= */
  await p.click('[data-view="clientes"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="cliente"]');
  await p.waitForSelector('#f-nom');
  await p.fill('#f-nom','ACEROS DEMO SA');
  await p.fill('#f-mg','40');await p.fill('#f-ivac','16');
  chk(await p.$('#cons .conadd')!=null,'el alta de clientes tiene editor de contactos');
  await p.click('#cons .conadd');await p.waitForTimeout(80);
  await p.fill('#cons .crow:nth-child(1) [data-k="nombre"]','Ana Ruiz');
  await p.fill('#cons .crow:nth-child(1) [data-k="puesto"]','Compras');
  await p.fill('#cons .crow:nth-child(1) [data-k="email"]','ana@acerosdemo.mx');
  await p.click('#cons .conadd');await p.waitForTimeout(80);
  await p.fill('#cons .crow:nth-child(2) [data-k="nombre"]','Luis Paz');
  await p.fill('#cons .crow:nth-child(2) [data-k="email"]','luis@acerosdemo.mx');
  await p.click('#modal form button.primary');await p.waitForTimeout(400);
  const cli=(await db(p)).clientes.find(c=>c.nombre==='ACEROS DEMO SA');
  chk(cli&&cli.contactos.length===2,'cliente guardado con 2 contactos');

  /* ============ 3. COTIZACIÓN: margen del cliente, unidad con decimales, entrega ============ */
  await p.click('[data-view="cotizaciones"]');await p.waitForTimeout(250);
  await p.click('[data-action="add"][data-type="cotizacion"]');
  await p.waitForSelector('#lineas .lrow');
  chk(await p.$('#f-ent')!=null,'la cotización tiene campo Tiempo de entrega');
  await p.fill('#f-folio','COT-9100');
  await p.selectOption('#f-cliid',{label:'ACEROS DEMO SA'});
  await p.waitForTimeout(300);
  chk(await p.$eval('#lineas .lrow:nth-child(1) [data-k="margen"]',e=>e.value)==='40','el margen del cliente se aplica a la línea');
  await p.fill('#f-ent','12 días hábiles');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="desc"]','Placa de acero');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="unidad"]','KG');
  await p.dispatchEvent('#lineas .lrow:nth-child(1) [data-k="unidad"]','change');
  await p.waitForTimeout(150);
  chk(await p.$eval('#lineas .lrow:nth-child(1) [data-k="cantidad"]',e=>e.step)==='0.001','KG admite 3 decimales (step)');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','12.5');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="costo"]','30');
  await p.waitForTimeout(150);
  chk(await p.$eval('#lineas .lrow:nth-child(1) [data-k="cantidad"]',e=>e.checkValidity()),'el navegador acepta 12.5 KG');
  // nueva línea hereda el margen del cliente
  await p.click('#lineas .lineadd');await p.waitForTimeout(120);
  chk(await p.$eval('#lineas .lrow:nth-child(2) [data-k="margen"]',e=>e.value)==='40','la línea nueva hereda el margen del cliente');
  await p.fill('#lineas .lrow:nth-child(2) [data-k="desc"]','Maniobras');
  await p.fill('#lineas .lrow:nth-child(2) [data-k="cantidad"]','1');
  await p.fill('#lineas .lrow:nth-child(2) [data-k="costo"]','500');
  // cambiar a una unidad entera redondea
  await p.fill('#lineas .lrow:nth-child(1) [data-k="unidad"]','PZ');
  await p.dispatchEvent('#lineas .lrow:nth-child(1) [data-k="unidad"]','change');
  await p.waitForTimeout(200);
  chk(await p.$eval('#lineas .lrow:nth-child(1) [data-k="cantidad"]',e=>e.value)==='13','al pasar a PZ la cantidad se redondea a entero');
  chk(await p.$eval('#lineas .lrow:nth-child(1) [data-k="cantidad"]',e=>e.step)==='1','PZ solo admite enteros');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="unidad"]','KG');
  await p.dispatchEvent('#lineas .lrow:nth-child(1) [data-k="unidad"]','change');
  await p.fill('#lineas .lrow:nth-child(1) [data-k="cantidad"]','12.5');
  await p.waitForTimeout(150);
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  const cot=(await db(p)).cotizaciones.find(c=>c.folio==='COT-9100');
  chk(cot&&cot.entrega==='12 días hábiles','el tiempo de entrega se guarda');
  chk(cot&&cot.lineas[0].cantidad===12.5&&cot.lineas[0].margen===40,'línea con 12.5 KG y margen 40: '+JSON.stringify(cot.lineas[0]));
  // el PDF lleva el tiempo de entrega
  await p.evaluate(id=>document.querySelector(`[data-action="print"][data-type="cot"][data-id="${id}"]`).click(),cot.id);
  await p.waitForTimeout(700);
  const prev=await p.evaluate(()=>{const o=[...document.querySelectorAll('.overlay.on')].pop();return o?o.textContent:'';});
  chk(/Tiempo de entrega: 12 días hábiles/.test(prev),'el PDF muestra el tiempo de entrega');
  await p.evaluate(()=>{document.querySelectorAll('.overlay').forEach(o=>{if(o.id!=='overlay')o.remove();else o.classList.remove('on');});});
  await p.waitForTimeout(200);

  /* ================= 4. RECHAZO CON COMENTARIO ================= */
  await p.evaluate(id=>document.querySelector(`[data-action="cot-rechazar"][data-id="${id}"]`).click(),cot.id);
  await p.waitForSelector('#f-motivo');
  const mots=await p.$$eval('#mot-list option',n=>n.map(o=>o.value));
  chk(mots.length>=5,'los motivos vienen del catálogo: '+mots.slice(0,3).join(', ')+'…');
  await p.fill('#f-motivo','Precio fuera de mercado');
  await p.fill('#f-coment','El cliente consiguió 8% menos con otro proveedor.');
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  const rec=(await db(p)).cotizaciones.find(c=>c.folio==='COT-9100');
  chk(rec.estatus==='rechazada'&&rec.motivoRechazo==='Precio fuera de mercado'&&/8%/.test(rec.comentarioRechazo),
    'cotización rechazada con motivo y comentario: '+JSON.stringify({e:rec.estatus,m:rec.motivoRechazo}));
  const fila=await p.evaluate(id=>{const b=document.querySelector(`[data-action="edit"][data-type="cotizacion"][data-id="${id}"]`);return b?b.closest('tr').textContent.replace(/\s+/g,' '):'';},cot.id);
  chk(/rechazada/i.test(fila)&&/Precio fuera de mercado/.test(fila),'la lista muestra el motivo: '+fila.slice(0,120));
  // reactivar
  await p.evaluate(id=>document.querySelector(`[data-action="cot-reactivar"][data-id="${id}"]`).click(),cot.id);
  await p.waitForTimeout(400);
  const react=(await db(p)).cotizaciones.find(c=>c.folio==='COT-9100');
  chk(react.estatus==='borrador'&&!react.motivoRechazo,'reactivar la devuelve a borrador y limpia el motivo');

  /* ================= 5. ESTATUS MASIVO ================= */
  await p.click('[data-action="cot-sel-all"]');await p.waitForTimeout(300);
  const nsel=(await p.$$('[data-action="cot-sel"]:checked')).length;
  chk(nsel>1,'seleccionar todas: '+nsel);
  await p.selectOption('#cot-masivo-estatus','aceptada');
  await p.click('[data-action="cot-masivo"]');await p.waitForTimeout(500);
  const todas=(await db(p)).cotizaciones;
  chk(todas.every(c=>c.estatus==='aceptada'),'todas pasaron a aceptada: '+todas.map(c=>c.estatus).join(','));
  // rechazo masivo
  await p.click('[data-action="cot-sel-all"]');await p.waitForTimeout(300);
  await p.click('[data-action="cot-rechazar-sel"]');
  await p.waitForSelector('#f-motivo');
  await p.fill('#f-motivo','Proyecto cancelado');
  await p.click('#modal form button.primary');await p.waitForTimeout(500);
  chk((await db(p)).cotizaciones.every(c=>c.estatus==='rechazada'&&c.motivoRechazo==='Proyecto cancelado'),'rechazo masivo con el mismo motivo');
  // devolverlas a borrador para la prueba de envío
  await p.click('[data-action="cot-sel-all"]');await p.waitForTimeout(300);
  await p.selectOption('#cot-masivo-estatus','borrador');
  await p.click('[data-action="cot-masivo"]');await p.waitForTimeout(500);

  /* ================= 6. ENVÍO CON PLANTILLAS ================= */
  await p.evaluate(id=>document.querySelector(`[data-action="cot-enviar"][data-id="${id}"]`).click(),cot.id);
  await p.waitForSelector('#envform');
  const cons=await p.$$eval('.mailrow .conchk',n=>n.map(e=>e.textContent.trim()));
  chk(cons.length===2&&/Ana Ruiz/.test(cons[0]),'los contactos del cliente salen para elegir: '+cons.join(' | '));
  chk(await p.$eval('.mailrow .mc',e=>e.checked),'el primer contacto viene marcado');
  chk((await p.$$eval('#e-tpl option',n=>n.map(o=>o.textContent))).length>=2,'selector de plantillas');
  const prevTxt=await p.$eval('#e-prev',e=>e.textContent);
  chk(/COT-9100/.test(prevTxt)&&/Ana Ruiz/.test(prevTxt)&&!/\{\{/.test(prevTxt),'la vista previa resuelve las variables: '+prevTxt.replace(/\s+/g,' ').slice(0,150));
  chk(/12 días hábiles/.test(prevTxt),'el mensaje incluye el tiempo de entrega');
  // editar la plantilla antes de enviar
  await p.fill('#e-sub','Propuesta {{folio}} para {{cliente}}');
  await p.waitForTimeout(200);
  chk(/Propuesta COT-9100 para ACEROS DEMO SA/.test(await p.$eval('#e-prev',e=>e.textContent)),'se puede editar el asunto antes de enviar');
  await p.fill('#e-ent','20 días hábiles');
  await p.waitForTimeout(200);
  chk(/20 días hábiles/.test(await p.$eval('#e-prev',e=>e.textContent)),'el tiempo de entrega se puede ajustar en el envío');
  await p.click('#envform button.primary');
  await p.waitForTimeout(900);
  const env=(await db(p)).cotizaciones.find(c=>c.folio==='COT-9100');
  chk(env.estatus==='enviada'&&!!env.enviadaEl,'al enviar pasa a estatus enviada: '+env.estatus);
  chk(env.entrega==='20 días hábiles','el tiempo de entrega ajustado se guarda');

  /* ================= 7. ENVÍO MASIVO ================= */
  await p.click('[data-view="cotizaciones"]');await p.waitForTimeout(250);
  await p.click('[data-action="cot-sel-all"]');await p.waitForTimeout(300);
  await p.click('[data-action="cot-enviar-sel"]');
  await p.waitForSelector('#envform');
  const filas=await p.$$('.mailrow');
  chk(filas.length>1,'el envío masivo lista cada cotización por separado ('+filas.length+')');
  chk(/se envía un correo por cotización/.test(await p.$eval('#envform',e=>e.textContent)),'aclara que el envío es individual');
  // dar correo a las que no tienen contactos
  await p.evaluate(()=>{document.querySelectorAll('.mailrow').forEach(r=>{
    if(!r.querySelector('.mc'))r.querySelector('.mextra').value='pruebas@fulcrum.mx';});});
  await p.click('#envform button.primary');
  await p.waitForTimeout(1200);
  const fin=(await db(p)).cotizaciones;
  chk(fin.every(c=>c.estatus==='enviada'&&c.enviadaEl),'todas quedaron enviadas: '+fin.map(c=>c.folio+':'+c.estatus).join(' '));

  chk(errs.length===0,'sin errores JS'+(errs.length?': '+errs.join(' | '):''));
  console.log('OK ('+ok.length+')');ok.forEach(m=>console.log('  ok '+m));
  if(bad.length){console.log('FALLAS ('+bad.length+')');bad.forEach(m=>console.log('  XX '+m));}
  await b.close();process.exit(bad.length?1:0);
})();
