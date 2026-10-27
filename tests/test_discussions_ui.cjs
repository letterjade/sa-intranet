// Run: node tests/test_discussions_ui.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
function h(tag, attrs, ...kids) {
  return { tag, attrs: attrs || {}, value: attrs?.value || '', disabled: !!attrs?.disabled, dataset: {}, textContent: attrs?.text || '',
    kids: kids.flat(9).filter(k => k != null && k !== false),
    append(...k) { this.kids.push(...k.flat(9)); }, replaceChildren(...k) { this.kids = k.flat(9); } };
}
const walk = node => typeof node === 'object' ? [node, ...(node.kids || []).flatMap(walk)] : [];
const find = (root, predicate) => walk(root).find(predicate);
const forms = root => walk(root).filter(n => n.tag === 'form');
const submit = form => form.attrs.onsubmit({ preventDefault() {} });
const change = (input, value) => { input.value = value; (input.attrs.oninput || input.attrs.onchange)?.({target:input}); };
const storage = new Map(); let editable = true;
const context = { h, crypto: webcrypto, Uint8Array, Date, Map, Set, JSON, localStorage: {getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  state: {data:{ feedback:[], capabilities:['plugin-discussions-v2'], tools:[{id:'t',plugin:'p',name:'Measure'}] }},
  canEdit:()=>editable, field:(label,input)=>h('label',{text:label},input), toast:()=>{}, when:()=> 'Just now', window:{dispatchEvent:()=>{}}, Event:class {},
  send:async op => { context.ops.push(op); if(op.op==='feedback-post')context.state.data.feedback.push({...op,createdAt:1}); }, ops:[] };
vm.createContext(context);
const source=fs.readFileSync(path.join(__dirname,'../assets/js/pages/feedback.js'),'utf8').replace(/^import .*;$/gm,'').replaceAll('export const ','const ').replaceAll('export function ','function ');
vm.runInContext(source+'\nthis.board=discussionPanel;',context);
const plugin={id:'p',name:'Drafting Tools'}, tools=context.state.data.tools;
(async()=>{
 let root=context.board(plugin,tools), form=forms(root).find(f=>f.attrs.class.includes('discussion-new-form'));
 assert.equal(find(form,n=>n.tag==='input').value,'');
 const layout=find(root,n=>n.attrs.class==='discussion-layout');assert.equal(layout.kids[0].attrs.class,'stack discussion-main');assert.equal(layout.kids[1].tag,'aside');
 change(find(form,n=>n.tag==='input'),'Test staff');change(find(form,n=>n.tag==='textarea'),'Test question');change(find(form,n=>n.tag==='select'),'t');
 await submit(form); assert.equal(context.ops[0].tool,'t');assert.equal(context.ops[0].plugin,'p');assert.match(context.ops[0].edit_token,/^[a-f0-9]{64}$/);
 root=context.board(plugin,tools);assert.equal(find(forms(root).find(f=>f.attrs.class.includes('discussion-new-form')),n=>n.tag==='input').value,'');
 assert(find(root,n=>n.tag==='button'&&n.kids.includes('Edit')));assert(![...storage.values()].join('').includes('Test staff'));
 const replyForm=forms(root).find(f=>!f.attrs.class.includes('discussion-new-form'));change(find(replyForm,n=>n.tag==='input'),'Reply author');change(find(replyForm,n=>n.tag==='textarea'),'A reply');await submit(replyForm);
 assert.equal(context.ops[1].parent,context.ops[0].id);
 // A different browser does not get author actions.
 storage.clear();root=context.board(plugin,tools);assert(!find(root,n=>n.tag==='button'&&n.kids.includes('Edit')));
 context.state.data.capabilities=[];root=context.board(plugin,tools);assert(find(root,n=>n.attrs.class==='bad-box').attrs.text.includes('reopen Start-SA-Intranet.bat'));assert(find(forms(root).find(f=>f.attrs.class.includes('discussion-new-form')),n=>n.attrs.type==='submit').disabled);
 editable=false;root=context.board(plugin,tools);assert(find(root,n=>n.attrs.class==='bad-box').attrs.text.includes('running SA Intranet server'));
 // Check the plugin navigation is wired to a single discussion board.
 const pluginSource=fs.readFileSync(path.join(__dirname,'../assets/js/pages/plugin.js'),'utf8');
 assert(pluginSource.includes('["discussion", "Discussion  " + discussionCount(p.id)]'));
 assert(!pluginSource.includes("What's changed"));assert(!pluginSource.includes('feedbackWindow'));
 console.log('UI checks passed: tool selection, replies, blank names, ownership controls, old-server notice, and plugin tab.');
})().catch(e=>{console.error(e);process.exitCode=1});
