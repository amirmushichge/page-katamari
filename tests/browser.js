(() => {
  const output=document.querySelector('#output');
  const errors=[];addEventListener('error',e=>errors.push(e.message));
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  document.querySelector('#run').addEventListener('click',async()=>{
    const result={};const qa=window.__pageKatamariQa;
    try{
      qa.stop();
      const fixture=document.querySelector('#fixture');const button=document.querySelector('#original-button');
      const originalText=fixture.textContent;const originalStyle=[button.style.opacity,button.style.transform,button.style.pointerEvents].join('|');
      const textNode=document.querySelector('#copy').firstChild;
      qa.start();result.starts=qa.getState().active&&document.querySelectorAll('#page-katamari-canvas').length===1;
      qa.setBall(600,600);const x=qa.getState().ballX;dispatchEvent(new KeyboardEvent('keydown',{key:'d',bubbles:true}));await sleep(250);dispatchEvent(new KeyboardEvent('keyup',{key:'d',bubbles:true}));result.keyboardMovement=qa.getState().ballX>x+2;
      qa.jump();await sleep(150);result.jumps=qa.getState().jumpHeight>0;await sleep(850);
      const word=document.querySelector('#copy .page-katamari-character');const r=word.getBoundingClientRect();qa.setBall(r.x+r.width/2,r.y+r.height/2,36);await sleep(200);result.collectsText=qa.getState().score>0;
      result.collectsMedia=!!qa.triggerLargestMedia();await sleep(150);result.hidesCollectedImage=getComputedStyle(document.querySelector('#fixture img')).opacity==='0';
      document.querySelector('.pk-stop').click();button.click();
      result.restoresText=fixture.textContent===originalText;result.preservesTextNode=document.querySelector('#copy').firstChild===textNode;result.preservesObject=button===document.querySelector('#original-button')&&[button.style.opacity,button.style.transform,button.style.pointerEvents].join('|')===originalStyle&&window.fixtureClicks===1;result.preservesInput=document.querySelector('input').value==='Keep my value';
      result.repeat=true;for(let i=0;i<3;i++){qa.start();await sleep(60);qa.stop();result.repeat&&=fixture.textContent===originalText&&!fixture.querySelector('.page-katamari-text-node')&&!document.querySelector('#page-katamari-canvas');}
      qa.start();const p=document.createElement('p');p.textContent='Appended live content';document.querySelector('#dynamic').append(p);await sleep(1100);result.scansAppendedContent=!!p.querySelector('.page-katamari-text-node');qa.stop();
      qa.start();document.querySelector('#live .page-katamari-text-node').textContent='Updated visible text';qa.stop();result.preservesWrapperUpdate=document.querySelector('#live').textContent==='Updated visible text';
      const retainedNode=document.querySelector('#retained').firstChild;qa.start();retainedNode.nodeValue='Updated through retained node';qa.stop();result.preservesRetainedNodeUpdate=document.querySelector('#retained').firstChild===retainedNode&&document.querySelector('#retained').textContent==='Updated through retained node';
      qa.start();dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));result.escapeStops=!qa.getState().active&&!document.querySelector('#page-katamari-canvas');
      result.controlsIgnored=!document.querySelector('#tools .page-katamari-text-node');result.errors=errors;result.pass=Object.values(result).every(v=>v===true||Array.isArray(v)&&v.length===0);
    }catch(e){qa?.stop();result.failure=String(e);result.pass=false;result.errors=errors;}
    output.textContent=JSON.stringify(result,null,2);document.title=(result.pass?'PASS':'FAIL')+' — Page Katamari browser regressions';
  });
})();
