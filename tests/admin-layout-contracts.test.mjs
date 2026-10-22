import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import ts from 'typescript';

// These are cascade contracts for the static fragments used by the actual
// workspaces, not browser screenshots or a substitute for a layout engine.
// Read all the shared styles: checking the changed stylesheet alone missed the
// desktop rule that overrode the mobile header and the dark paragraph default.
const sheets = ['app/globals.css', 'app/renewal.css', 'app/admin-layout.css',
  'app/permissions.css', 'app/tariffs-self-service.css', 'app/account-security.css', 'components/cash.css'];
const roots = new Map(sheets.map(file => [file, postcss.parse(readFileSync(file, 'utf8'), { from:file })]));
const widths = [320, 360, 390, 430, 600, 760, 768, 1024, 1440, 1920];
const orders = [sheets, [...sheets.slice(2), ...sheets.slice(0, 2)]];

function specificity(selector) {
  let text = selector.replace(/:where\([^()]*\)/g, '');
  text = text.replace(/:(?:is|not|has)\(([^()]*)\)/g, (_, alternatives) =>
    alternatives.split(',').sort((a,b) => weight(specificity(b)) - weight(specificity(a)))[0]);
  const ids = (text.match(/#[\w-]+/g) || []).length;
  const classes = (text.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
  text = text.replace(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|::?[\w-]+/g, '');
  const tags = (text.match(/(?:^|[\s>+~])([a-z][\w-]*)/gi) || []).length;
  return [ids, classes, tags];
}
function weight([ids, classes, tags]) { return ids * 10000 + classes * 100 + tags; }
function applies(rule, width) {
  for (let parent=rule.parent; parent; parent=parent.parent) {
    if (parent.type !== 'atrule') continue;
    if (parent.name.endsWith('keyframes') || parent.name === 'theme') return false;
    if (parent.name !== 'media') continue;
    if (/prefers-reduced-motion|hover:|max-height|min-height/.test(parent.params)) return false;
    for (const [,kind,limit] of parent.params.matchAll(/(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/g)) {
      if (kind === 'min' ? width < Number(limit) : width > Number(limit)) return false;
    }
  }
  return true;
}
function style(selectors, width, order=sheets) {
  const winners = new Map(), matching = new Set(selectors);
  let position = 0;
  for (const file of order) roots.get(file).walkRules(rule => {
    if (!applies(rule,width)) return;
    for (const selector of rule.selectors || []) {
      if (!matching.has(selector)) continue;
      const priority = weight(specificity(selector));
      rule.each(declaration => {
        if (declaration.type !== 'decl') return;
        const candidate = { value:declaration.value, important:Boolean(declaration.important), priority, position:position++ };
        const previous = winners.get(declaration.prop);
        if (!previous || Number(candidate.important) > Number(previous.important) ||
          candidate.important === previous.important && (priority > previous.priority ||
          priority === previous.priority && candidate.position > previous.position))
          winners.set(declaration.prop,candidate);
      });
    }
  });
  return Object.fromEntries([...winners].map(([property, winner]) => [property,winner.value]));
}
function resolve(value, variables, inherited='#252b23') {
  if (value === 'inherit' || value === 'currentColor') return inherited;
  return value?.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g, (_,name,fallback) => {
    const replacement=variables[name] ?? fallback;
    assert.notEqual(replacement,undefined,'Missing theme variable '+name);
    return resolve(replacement,variables,inherited);
  });
}
function luminance(hex) {
  assert.match(hex,/^#[a-f0-9]{6}$/i);
  const channels=[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255)
    .map(value=>value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(foreground, background) {
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}

const headerFiles = ['components/data-client.tsx', 'components/reports-client.tsx',
  'components/settings-client.tsx', 'components/team-client.tsx', 'components/fiscal-settings.tsx',
  'components/tariffs-client.tsx', 'components/restricted-feature.tsx', 'components/club-client.tsx', 'components/account.tsx'];
function actualHeaders(file) {
  const source = ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const found=[];
  function visit(node) {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source)==='header') {
      const attribute=node.openingElement.attributes.properties.find(item=>item.name?.getText(source)==='className');
      if (attribute?.initializer && ts.isStringLiteral(attribute.initializer) && attribute.initializer.text.split(' ').includes('work-header'))
        found.push(node);
    }
    ts.forEachChild(node,visit);
  }
  visit(source);return found;
}

test('Real workspace headers use one shared alignment contract across mobile and desktop widths',()=>{
  for(const file of headerFiles) {
    assert.ok(actualHeaders(file).length,'Missing actual workspace header in '+file);
    for(const width of widths) for(const order of orders) {
      const header=style(['.work-header','.admin-shell .work-header'],width,order);
      const content=style(['.admin-shell .work-header > div'],width,order);
      if(width<=760) {
        assert.equal(header['flex-direction'],'column',file+' '+width);
        assert.ok(['stretch','flex-start','start'].includes(header['align-items']),file+' '+width+' must not center a narrow heading');
        assert.equal(content.width,'100%',file+' '+width+' title must share the panel left edge');
      } else {
        assert.notEqual(header['flex-direction'],'column');
        assert.equal(content.width,undefined,'Desktop title must leave space for adjacent actions');
      }
    }
  }
});

test('Unclassified paragraphs remain readable on private panels and in dialog portals',()=>{
  assert.match(readFileSync('components/data-client.tsx','utf8'),/<p>\s*Incluye planes/);
  for(const width of widths) for(const order of orders) {
    const body=style([':root','body','body:has(.admin-shell)'],width,order);
    const paragraph=style(['p'],width,order);
    const foreground=resolve(paragraph.color,body), backgrounds=['#ffffff',body['--background']];
    for(const background of backgrounds)
      assert.ok(contrast(foreground,background)>=4.5,'Private copy contrast at '+width+' is too low: '+foreground);
    // Portals inherit the body theme even though they are not inside AdminShell.
    assert.equal(resolve(paragraph.color,body),foreground);
    const publicBody=style([':root','body'],width,order);
    assert.equal(resolve(paragraph.color,publicBody),'#bac0b2','Public dark copy retains its existing palette');
  }
});

test('Semantic messages preserve contrast and nested explanation colors',()=>{
  for(const width of widths) for(const kind of ['error-box','success-box','notice']) {
    const body=style([':root','body','body:has(.admin-shell)'],width);
    const message=style(['p','.'+kind,'.admin-shell .'+kind],width);
    const color=resolve(message.color,body), background=resolve(message.background,body);
    assert.ok(contrast(color,background)>=4.5,kind+' must be readable');
    const child=style(['p','body :is(.error-box, .success-box, .notice) p'],width);
    assert.equal(resolve(child.color,body,color),color,'Nested '+kind+' copy must inherit its message color');
  }
});

test('Secondary text and header captions meet normal-text contrast on both private surfaces',()=>{
  const fragments=[
    ['p','.muted','.admin-shell .muted'],
    ['p','.admin-shell .work-header p'],
    ['p','.eyebrow','.admin-shell .eyebrow','.admin-shell .work-header p','.admin-shell .work-header .eyebrow'],
    ['.admin-shell .cash-empty'],
    ['.admin-shell .legend'],
  ];
  for(const width of widths) for(const order of orders) {
    const body=style([':root','body','body:has(.admin-shell)'],width,order);
    for(const selectors of fragments) {
      const foreground=resolve(style(selectors,width,order).color,body);
      for(const background of ['#ffffff',body['--background']])
        assert.ok(contrast(foreground,background)>=4.5,selectors.join(' / ')+' at '+width);
    }
  }
});

test('Form portals keep long actions inside their available width and allow wrapping',()=>{
  for(const width of widths) for(const order of orders) {
    const actions=style(['.form-actions','body:has(.admin-shell) .form-modal .form-actions'],width,order);
    const button=style(['.button','body:has(.admin-shell) .form-modal .form-actions .button'],width,order);
    assert.equal(actions['flex-wrap'],'wrap');
    assert.equal(button['max-width'],'100%');assert.equal(button['white-space'],'normal');
  }
});

test('Panels and table scroll containers may shrink instead of widening the page',()=>{
  for(const selector of ['.admin-shell .panel','.admin-shell .stat','.admin-shell .cash-panel','.admin-shell [data-slot="table-container"]'])
    for(const order of orders) {
      const element=style([selector],360,order);
      assert.equal(element['min-width'],'0',selector);assert.equal(element['max-width'],'100%',selector);
    }
});
