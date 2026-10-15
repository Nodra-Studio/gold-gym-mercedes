import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url), folder = mkdtempSync(join(tmpdir(), 'gold-permissions-'));
const reactUrl = pathToFileURL(require.resolve('react')).href;
const icons = ['LockKeyhole','ArrowLeft','UserRound','Users','CalendarDays','Wallet','Tags','BarChart3','ShieldCheck','Database','Settings','ScanLine','ArrowUpRight','Menu','X','LoaderCircle','Plus','RefreshCw','Download','Check','CreditCard','Pencil','Search'];
function write(name, source) { writeFileSync(join(folder,name + '.mjs'),source); }
function compile(file, name, pairs = [], transform = source => source) {
  let source = transform(readFileSync(file,'utf8'));
  for (const [from,to] of pairs) source = source.replaceAll(from,to);
  source = source.replace(/^import ["'][^"']+\.css["'];?\n/gm,'').replaceAll('from "react"',`from ${JSON.stringify(reactUrl)}`);
  write(name, `import * as React from ${JSON.stringify(reactUrl)};\n` + ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React},
  }).outputText);
}
write('icons',`import * as React from ${JSON.stringify(reactUrl)};\n` + icons.map(name => `export const ${name}=props=>React.createElement('svg',{...props,'data-icon':${JSON.stringify(name === 'LockKeyhole' ? 'lock' : name)}});`).join('\n'));
write('link',`import * as React from ${JSON.stringify(reactUrl)};export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children);}`);
write('mock',`
import * as React from ${JSON.stringify(reactUrl)};
export const state={role:'reception',path:'/reportes',pageCalls:[],dbCalls:[],ownerCalls:[],clubData:null};
export function reset(role='reception',path='/reportes'){state.role=role;state.path=path;state.pageCalls=[];state.dbCalls=[];state.ownerCalls=[];state.clubData={role,today:'2026-10-15',members:[],memberships:[],payments:[],accesses:[],plans:[],sessions:[],enrollments:[],audit:[],bookings:[]};}
reset();
export const usePathname=()=>state.path;
export async function requirePageRole(roles,path){state.pageCalls.push({roles,path});if(!roles.includes(state.role))throw Error('Rejected page role');return {role:state.role,owner:'owner-fixture',userId:'operator-fixture'};}
export function database(){state.dbCalls.push('database');if(state.role!=='owner')throw Error('Reception must not query protected data');return {prepare(sql){state.dbCalls.push(sql);return {bind(owner){state.dbCalls.push(owner);return {async all(){return {results:[{venue:'calle30',legal_name:'PRIVATE-FISCAL-RECORD'}]};}};}};}};}
export const fiscalSelectFields='venue,legal_name';
export function renderOwner(name,props){state.ownerCalls.push(name);if(state.role!=='owner')throw Error('Protected client mounted for Reception');return React.createElement('div',{'data-owner-client':name},JSON.stringify(props));}
export function useClub(){return {data:state.clubData,error:'',loading:false,busy:false,refresh:async()=>{},mutate:async()=>{throw Error('Unexpected mutation during render')},setError(){}};}
export const apiFetch=async()=>{throw Error('Unexpected fetch during server rendering')};
export const csvDocument=()=>{throw Error('Unexpected export during render')};
export const requestId=()=>'00000000-0000-4000-8000-000000000001';
export const localDay=()=>state.clubData.today;
export const addDays=(day,amount)=>new Date(Date.parse(day+'T12:00:00Z')+amount*86400000).toISOString().slice(0,10);
export const money=amount=>'$ '+amount;
export const dateLabel=day=>day;
`);
write('ui',`
import * as React from ${JSON.stringify(reactUrl)};
const container=({children})=>React.createElement('div',null,children);
export const Dialog=({open,children})=>open?React.createElement('div',null,children):null;
export const DialogContent=container,DialogTitle=container,DialogDescription=container,Tabs=container,TabsList=container,TabsContent=container;
export const TabsTrigger=({children})=>React.createElement('button',null,children);
export const Table=({children})=>React.createElement('table',null,children),TableHeader=({children})=>React.createElement('thead',null,children),TableBody=({children})=>React.createElement('tbody',null,children),TableRow=({children})=>React.createElement('tr',null,children),TableHead=({children})=>React.createElement('th',null,children),TableCell=({children})=>React.createElement('td',null,children);
export const NativeSelect=props=>React.createElement('select',props),NativeSelectOption=props=>React.createElement('option',props);
`);
write('empty-client','export default function EmptyClient(){return null;}');
write('tariffs-client',`import * as React from ${JSON.stringify(reactUrl)};export default function Tariffs({initialCreate}){return React.createElement('div',{'data-create-open':String(initialCreate)});}`);
for (const [name,component] of [['reports-client','reports'],['team-client','team'],['data-client','data'],['fiscal-settings','fiscal'],['settings-client','settings']])
  write(name,`import {renderOwner} from './mock.mjs';export default function OwnerClient(props){return renderOwner(${JSON.stringify(component)},props);}`);
compile('lib/features.ts','features');
compile('lib/branches.ts','branches');
const basePairs = [['next/link','./link.mjs'],['next/navigation','./mock.mjs'],['lucide-react','./icons.mjs'],['@/lib/features','./features.mjs']];
compile('components/admin-shell.tsx','admin-shell',basePairs);
compile('components/restricted-feature.tsx','restricted-feature',basePairs);
compile('components/owner-action.tsx','owner-action',basePairs);
const pagePairs = [...basePairs,['@/components/admin-shell','./admin-shell.mjs'],['@/components/restricted-feature','./restricted-feature.mjs'],['@/lib/page-access','./mock.mjs'],['@/lib/server','./mock.mjs'],['@/lib/fiscal-settings','./mock.mjs']];
for (const name of ['reports-client','team-client','data-client','fiscal-settings','settings-client','tariffs-client']) pagePairs.push([`@/components/${name}`,`./${name}.mjs`]);
const pages = [['reportes','reports'],['equipo','team'],['datos','data'],['datos-fiscales','fiscal'],['configuracion','settings']];
for (const [path] of pages) compile(`app/${path}/page.tsx`,path,pagePairs);
compile('app/tarifas/page.tsx','tarifas',pagePairs);
compile('components/club-client.tsx','club-client',[
  ...basePairs,['@/lib/branches','./branches.mjs'],['@/components/padel-requests','./empty-client.mjs'],['@/components/member-memberships','./empty-client.mjs'],['@/lib/api-fetch','./mock.mjs'],['@/lib/csv','./mock.mjs'],['@/lib/club','./mock.mjs'],
  ...['dialog','tabs','table','native-select'].map(name=>[`@/components/ui/${name}`,'./ui.mjs']),
],source => {
  const start=source.indexOf('export function useClub('), end=source.indexOf('export function WorkspaceHeader');
  return source.slice(0,start)+`export { useClub } from './mock.mjs';\nimport { useClub } from './mock.mjs';\n`+source.slice(end);
});
const mock=await import(pathToFileURL(join(folder,'mock.mjs'))), features=await import(pathToFileURL(join(folder,'features.mjs'))), shell=await import(pathToFileURL(join(folder,'admin-shell.mjs'))), restricted=await import(pathToFileURL(join(folder,'restricted-feature.mjs'))), club=await import(pathToFileURL(join(folder,'club-client.mjs')));
const {OwnerAction}=await import(pathToFileURL(join(folder,'owner-action.mjs')));
const pageModules=new Map(await Promise.all([...pages,['tarifas']].map(async([name])=>[name,await import(pathToFileURL(join(folder,name+'.mjs')))])));

try {
  test('Owner actions remain visible for reception without an enabled click handler',()=>{
    let calls=0;
    const onClick=()=>calls++;
    const locked=OwnerAction({role:'reception',onClick,children:'Corregir movimiento'});
    assert.equal(locked.props.disabled,true);
    assert.equal(locked.props.onClick,undefined);
    const html=renderToStaticMarkup(locked);
    assert.match(html,/Corregir movimiento/);assert.match(html,/Solo dueños/);assert.match(html,/data-icon="lock"/);
    const allowed=OwnerAction({role:'owner',onClick,children:'Corregir movimiento'});
    assert.equal(allowed.props.disabled,false);allowed.props.onClick();assert.equal(calls,1);
    assert.doesNotMatch(renderToStaticMarkup(allowed),/Solo dueños|data-icon="lock"/);
  });
  test('Reception navigation shows restricted destinations with locks while owners retain normal links',()=>{
    mock.reset('reception');
    const html=renderToStaticMarkup(React.createElement(shell.AdminShell,{role:'reception'},'Contenido permitido'));
    for (const feature of features.adminFeatures) {
      assert.ok(html.includes(`href="${feature.href}"`),feature.label);
      if(feature.ownerOnly) assert.ok(html.includes(`aria-label="${feature.label}. Solo dueños"`),feature.label);
    }
    assert.equal((html.match(/data-icon="lock"/g)||[]).length,features.restrictedFeatures.length);
    mock.reset('owner');
    const owner=renderToStaticMarkup(React.createElement(shell.AdminShell,{role:'owner'},'Contenido permitido'));
    assert.doesNotMatch(owner,/admin-nav-restricted|data-icon="lock"|Solo dueños/);
    for(const feature of features.adminFeatures) assert.ok(owner.includes(`href="${feature.href}"`));
  });

  test('Restricted previews contain only decorative skeletons and safe navigation',()=>{
    for(const feature of features.restrictedFeatures) {
      const html=renderToStaticMarkup(React.createElement(restricted.RestrictedFeature,{path:feature.href}));
      assert.ok(html.includes(`<h1>${feature.label}</h1>`));
      assert.match(html,/restricted-preview[^>]*aria-hidden="true"/);
      assert.match(html,/data-icon="lock"/);
      assert.match(html,/Esta función requiere permiso de dueño/);
      assert.doesNotMatch(html,/<input|<select|<table|PRIVATE-FISCAL-RECORD|href="\/api\//);
      assert.match(html,/href="\/gestion"/);assert.match(html,/href="\/cuenta"/);
    }
  });

  await test('Reception pages never query protected records or mount owner clients',async()=>{
    for(const [path] of pages) {
      mock.reset('reception','/'+path);
      const tree=await pageModules.get(path).default(),html=renderToStaticMarkup(tree);
      assert.match(html,/Esta función requiere permiso de dueño/);
      assert.doesNotMatch(html,/data-owner-client|PRIVATE-FISCAL-RECORD/);
      assert.deepEqual(mock.state.dbCalls,[],path);
      assert.deepEqual(mock.state.ownerCalls,[],path);
      assert.deepEqual(mock.state.pageCalls,[{roles:['owner','reception'],path:'/'+path}],path);
    }
  });

  await test('Owner pages mount their controls and fiscal data remains scoped to the owner',async()=>{
    for(const [path,client] of pages) {
      mock.reset('owner','/'+path);
      const tree=await pageModules.get(path).default(),html=renderToStaticMarkup(tree);
      assert.ok(html.includes(`data-owner-client="${client}"`),path);
      assert.doesNotMatch(html,/Esta función requiere permiso de dueño/);
      assert.deepEqual(mock.state.ownerCalls,[client]);
      if(path==='datos-fiscales') {
        assert.ok(mock.state.dbCalls.includes('owner-fixture'));
        assert.match(html,/PRIVATE-FISCAL-RECORD/);
      } else assert.deepEqual(mock.state.dbCalls,[]);
    }
  });

  await test('Create plan deep link opens its form for both administrative roles',async()=>{
    for(const role of ['owner','reception']) {
      mock.reset(role,'/tarifas');
      let html=renderToStaticMarkup(await pageModules.get('tarifas').default({searchParams:Promise.resolve({crear:'1'})}));
      assert.match(html,/data-create-open="true"/);
      html=renderToStaticMarkup(await pageModules.get('tarifas').default({searchParams:Promise.resolve({crear:['1','otro']})}));
      assert.match(html,/data-create-open="false"/);
    }
  });

  test('Reception dashboard exposes locked features, disables exports and offers real plan creation',()=>{
    mock.reset('reception','/gestion');
    const html=renderToStaticMarkup(React.createElement(club.default));
    const links=html.match(/<a\b[^>]*>/g)||[];
    for(const path of ['/reportes','/configuracion','/equipo','/datos']) assert.ok(links.some(link=>link.includes(`href="${path}"`)&&link.includes('class="quick-action"')&&link.includes('title="Solo dueños"')),path);
    assert.ok((html.match(/href="\/tarifas\?crear=1"/g)||[]).length>=3);
    assert.match(html,/<button[^>]*disabled=""[^>]*title="Solo dueños"[^>]*>[\s\S]*?Exportar/);
    assert.match(html,/Descargar todos los datos · Solo dueños/);
    assert.doesNotMatch(html,/href="\/api\/export"|Cargar ejemplos|Prepará tu primera demostración/);
  });

  test('Owners keep functional export links and the same real plan creation path',()=>{
    mock.reset('owner','/gestion');
    const html=renderToStaticMarkup(React.createElement(club.default));
    assert.match(html,/href="\/api\/export" download=""/);
    assert.doesNotMatch(html,/Solo dueños|Cargar ejemplos/);
    assert.ok(html.includes('href="/tarifas?crear=1"'));
  });
} finally {rmSync(folder,{recursive:true,force:true});}
