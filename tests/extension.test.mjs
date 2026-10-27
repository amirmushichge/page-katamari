import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../extension/popup.js',import.meta.url),'utf8');
const background=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function setup({url='https://example.com',installed=true,blocked=false}={}){
  let active=false;const calls=[];
  const elements=Object.fromEntries(['#toggle','#toggle-label','#message'].map(id=>[id,{textContent:'',disabled:false,listeners:{},classList:{toggle(){},remove(){},add(){}},addEventListener(type,fn){this.listeners[type]=fn;}}]));
  const chrome={tabs:{query:async()=>[{id:7,url}],sendMessage:async(id,message)=>{calls.push(['message',id,message.type]);if(!installed)throw Error('No receiver');if(message.type==='PK_TOGGLE')active=!active;return {active};}},scripting:{insertCSS:async args=>{calls.push(['css',args]);if(blocked)throw Error('Blocked');},executeScript:async args=>{calls.push(['script',args]);installed=true;}},commands:{onCommand:{addListener(fn){chrome.command=fn;}}}};
  const context={chrome,document:{querySelector:id=>elements[id]},console:{debug(){}}};
  vm.runInNewContext(source,context);
  return {elements,calls,chrome};
}
{
  const t=setup();await settle();assert.equal(t.elements['#toggle-label'].textContent,'Start collecting');
  await t.elements['#toggle'].listeners.click();assert.equal(t.elements['#toggle-label'].textContent,'Stop and restore page');
  await t.elements['#toggle'].listeners.click();assert.equal(t.elements['#toggle-label'].textContent,'Start collecting');
  assert.equal(t.calls.filter(x=>x[0]==='script').length,0);
}
{
  const t=setup({installed:false});await settle();
  assert.equal(t.calls.filter(x=>x[0]==='css').length,1);assert.equal(t.calls.filter(x=>x[0]==='script').length,1);
  await t.elements['#toggle'].listeners.click();assert.equal(t.elements['#toggle-label'].textContent,'Stop and restore page');
}
{
  const t=setup({url:'chrome://extensions'});await settle();assert.equal(t.elements['#toggle'].disabled,true);assert.equal(t.calls.length,0);
}
{
  const t=setup({installed:false,blocked:true});await settle();assert.equal(t.elements['#toggle'].disabled,true);
}
{
  const t=setup({installed:false});await settle();t.calls.length=0;
  vm.runInNewContext(background,{chrome:t.chrome,console:{debug(){}}});
  t.chrome.command('unrelated');await settle();assert.equal(t.calls.length,0);
  t.chrome.command('toggle-katamari');await settle();assert.ok(t.calls.some(x=>x[0]==='message'&&x[2]==='PK_TOGGLE'));
}
console.log('Popup/background tests passed: start-stop, on-demand injection, restricted-page errors and shortcut routing. Chrome API permissions are mocked; this is not a browser installation test.');
