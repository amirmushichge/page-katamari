(async()=>{
  const frame=document.querySelector('#frame');const results=[];
  const requested=new URLSearchParams(location.search).get('width');
  for(const width of requested?[Number(requested)]:[320,375,768,1440]){
    frame.style.width=`${width}px`;
    await new Promise(resolve=>{frame.onload=resolve;frame.src=`../docs/?responsive=${width}`;});
    const d=frame.contentDocument;await d.fonts.ready;
    const typography=['h1','.subcopy','#play','.steps h3'].map(selector=>{const s=frame.contentWindow.getComputedStyle(d.querySelector(selector));return {selector,font:s.fontFamily,weight:s.fontWeight,ratio:Number.parseFloat(s.letterSpacing)/Number.parseFloat(s.fontSize)};});
    results.push({width,noOverflow:d.documentElement.scrollWidth<=width,localFontLoaded:d.fonts.check('16px Manrope'),trackingCorrect:typography.every(t=>Math.abs(t.ratio+.04)<.0001),playVisible:d.querySelector('#play').getBoundingClientRect().width>100,typography});
  }
  const pass=results.every(r=>r.noOverflow&&r.localFontLoaded&&r.trackingCorrect&&r.playVisible);
  document.querySelector('#output').textContent=JSON.stringify({pass,results},null,2);document.title=(pass?'PASS':'FAIL')+' — Responsive Page Katamari';
})();
