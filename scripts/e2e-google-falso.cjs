// Teste de ponta a ponta do login + criação da planilha, com um Google SIMULADO.
// Uso (só para quem desenvolve): preencher src/config.ts com valores falsos, 'npx vite build',
// 'npx vite preview --port 4174', depois: NODE_PATH=$(npm root -g) node scripts/e2e-google-falso.cjs <pasta-prints>.
// Lembre de desfazer a mudança em src/config.ts.
const { chromium, devices } = require('playwright');
const dir = process.argv[2];

// ---------- Sheets falso ----------
const tabs = {}; // titulo -> rows
const ids = {}; let nextSheet = 1;
function colIdx(letters){ let n=0; for (const c of letters) n = n*26 + (c.charCodeAt(0)-64); return n-1; }
function parseRange(r){
  const m = r.match(/^'((?:[^']|'')+)'(?:!([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?)?$/);
  return { tab: m[1].replace(/''/g,"'"), col: m[2], row: m[3] ? +m[3] : null };
}
function handleSheets(method, url, body){
  const u = new URL(url);
  const path = decodeURIComponent(u.pathname);
  if (method==='GET' && u.searchParams.get('fields')) return { sheets: Object.keys(tabs).map(t=>({properties:{sheetId:ids[t], title:t}})) };
  if (path.endsWith(':batchUpdate') && !path.includes('/values')) {
    const replies=[];
    for (const r of body.requests) {
      if (r.addSheet) { const t=r.addSheet.properties.title; tabs[t]=[]; ids[t]=nextSheet++; }
      if (r.deleteSheet) { const t=Object.keys(ids).find(k=>ids[k]===r.deleteSheet.sheetId); delete tabs[t]; delete ids[t]; }
    }
    return { replies };
  }
  if (path.endsWith('/values:batchUpdate')) {
    for (const d of body.data) { const p=parseRange(d.range); tabs[p.tab][p.row-1]=d.values[0]; }
    return {};
  }
  if (path.endsWith('/values:batchGet')) {
    return { valueRanges: u.searchParams.getAll('ranges').map(r => ({ values: tabs[parseRange(r).tab].map(x=>x||[]) })) };
  }
  if (path.endsWith(':append')) {
    const r = path.split('/values/')[1].replace(':append','');
    const p = parseRange(r); tabs[p.tab].push(...body.values); return {};
  }
  if (path.includes('/values/')) {
    const p = parseRange(path.split('/values/')[1]); const i = colIdx(p.col);
    return { values: [tabs[p.tab].map(row => (row||[])[i] ?? '')] };
  }
  throw new Error('rota não simulada: '+method+' '+url);
}

const GIS = `window.google = window.google || {}; google.accounts = { oauth2: {
  initTokenClient(cfg){ return { requestAccessToken(){ setTimeout(()=>cfg.callback({access_token:'tok', expires_in:3600}), 10); } }; },
  revoke(t, cb){ cb && cb(); } } };`;
const PICKER = `window.gapi = { load(n, o){ setTimeout(o.callback, 0); } };
window.google = window.google || {};
(function(){
  function chain(){ return new Proxy({}, { get(t,k){ if (k==='build') return ()=>({ setVisible(){ const v=t.__view; setTimeout(()=>t.__cb({action:'picked', docs:[ v===2 ? {id:'planilha_existente', name:'Base'} : {id:'pasta_escolhida', name:'Finanças'} ]}),10); } });
      return (...a)=>{ if(k==='setCallback') t.__cb=a[0]; if(k==='addView') t.__view=a[0].__id; return p; }; } }); var p; }
  function PickerBuilder(){ const t={}; const p = new Proxy(t,{ get(tt,k){ if(k==='build') return ()=>({ setVisible(){ setTimeout(()=>tt.__cb({action:'picked', docs:[ tt.__view===2 ? {id:'planilha_existente', name:'Base'} : {id:'pasta_escolhida', name:'Finanças'} ]}),10); } }); return (...a)=>{ if(k==='setCallback') tt.__cb=a[0]; if(k==='addView') tt.__view=a[0].__id; return p; }; } }); return p; }
  function DocsView(id){ const o={__id:id}; const p=new Proxy(o,{get(t,k){ if(k==='__id') return t.__id; return ()=>p; }}); return p; }
  google.picker = { PickerBuilder, DocsView, ViewId:{FOLDERS:1, SPREADSHEETS:2}, Action:{PICKED:'picked', CANCEL:'cancel'} };
})();`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  let driveN = 0; const driveCriados = [];
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType:'text/javascript', body: GIS }));
  await ctx.route('https://apis.google.com/js/api.js', r => r.fulfill({ contentType:'text/javascript', body: PICKER }));
  await ctx.route('https://www.googleapis.com/drive/v3/files**', async r => {
    const body = JSON.parse(r.request().postData()); driveCriados.push(body);
    const id = body.mimeType.includes('spreadsheet') ? 'planilha_nova' : 'pasta_faturas_'+(++driveN);
    if (id === 'planilha_nova') { tabs['Página1'] = []; ids['Página1'] = 0; }
    r.fulfill({ contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify({ id }) });
  });
  await ctx.route('https://sheets.googleapis.com/**', async r => {
    if (r.request().method()==='OPTIONS') return r.fulfill({ status:204, headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'} });
    try {
      const body = r.request().postData() ? JSON.parse(r.request().postData()) : undefined;
      const res = handleSheets(r.request().method(), r.request().url(), body);
      r.fulfill({ contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body: JSON.stringify(res) });
    } catch(e) { errs.push(String(e)); r.fulfill({ status:500, body:'{}' }); }
  });

  await p.goto('http://localhost:4174/#/ajustes');
  await p.waitForSelector('text=Entrar com Google');
  await p.click('text=Entrar com Google');
  await p.waitForSelector('text=Escolher a pasta de Finanças');
  await p.screenshot({ path: dir+'/m1-assistente.png' });
  await p.click('text=Escolher a pasta de Finanças');
  await p.waitForSelector('text=Planilha pronta', { timeout: 10000 });
  await p.screenshot({ path: dir+'/m1-pronta.png', fullPage: true });
  console.log('drive:', driveCriados.map(d=>[d.name, d.parents[0]]));
  console.log('abas:', Object.keys(tabs).join(','));
  console.log('categorias:', tabs.Categorias.length-1, 'parametros:', tabs.Parametros.length-1);
  console.log('ids na planilha:', tabs.Parametros.filter(r=>String(r[0]).startsWith('ids.')).map(r=>r[0]+'='+r[2]));

  // Simula carga feita por fora (à mão / assistente): conta por nome, data dd/mm, vírgula e uma linha inválida.
  const cab = tabs.Contas[0];
  const contas = [['nome','Conta Azul'],['tipo','corrente'],['apelidos','azul']];
  const linha = cab.map(h => (contas.find(c=>c[0]===h)||[])[1] ?? '');
  tabs.Contas.push(linha);
  const cl = tabs.Lancamentos[0];
  const mk = (o) => cl.map(h => o[h] ?? '');
  const hoje = new Date(Date.now()-3*3600e3).toISOString().slice(0,10);
  const [a,m,d] = hoje.split('-');
  tabs.Lancamentos.push(mk({ valor:'45,90', data_competencia:`${d}/${m}/${a}`, conta_id:'Conta Azul', categoria:'Alimentação', descricao:'Feira' }));
  tabs.Lancamentos.push(mk({ valor:'20', data_competencia:'32/13/2026', conta_id:'Conta Azul', descricao:'Linha com erro' }));
  tabs.Parametros.push(['semanada.valor','', '500', '2000-01-02']);

  await p.click('text=Atualizar dados da planilha');
  await p.waitForSelector('text=1 linha da planilha não foi lida');
  await p.click('text=Ver quais');
  await p.screenshot({ path: dir+'/m1-problemas.png', fullPage: true });
  const ci = tabs.Lancamentos[0];
  const l = tabs.Lancamentos[1];
  console.log('regravado:', { id: l[ci.indexOf('id')], valor: l[ci.indexOf('valor')], data: l[ci.indexOf('data_competencia')], conta: l[ci.indexOf('conta_id')], status: l[ci.indexOf('status')], natureza: l[ci.indexOf('natureza')] });
  await p.click('nav >> text=Semana');
  await p.waitForSelector('text=Ainda podemos gastar');
  await p.screenshot({ path: dir+'/m1-semana.png' });
  console.log('valor:', await p.textContent('.destaque-valor'));

  // Reabrir o app: deve abrir direto em modo Google com os dados.
  await p.reload();
  await p.waitForSelector('text=Ainda podemos gastar');
  console.log('após reabrir, faixa demo?', await p.$('.faixa-demo') !== null);
  console.log('erros:', errs);
  await b.close();
})();
