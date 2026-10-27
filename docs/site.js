(() => {
  const play = document.querySelector('#play');
  const status = document.querySelector('#game-status');
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch) document.querySelector('#control-hint').textContent = 'Drag to steer · Tap ↑ to jump · Tap × to stop';
  play.addEventListener('click', () => {
    if (!window.PageKatamari) {
      status.textContent = 'The game could not load. Reload this page to try again.';
      return;
    }
    window.PageKatamari.toggle();
  });
  addEventListener('pagekatamari:change', event => {
    const active = event.detail.active;
    const launch = document.querySelector('.launch');
    if (active) launch.style.height = `${launch.getBoundingClientRect().height}px`;
    else launch.style.removeProperty('height');
    document.body.classList.toggle('game-active', active);
    play.replaceChildren(document.createTextNode(active ? 'Stop and restore page' : 'Play on this page '));
    if (!active) { const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden','true'); play.append(arrow); }
    status.textContent = active ? 'Game started. Press Escape or Stop to restore the page.' : 'Game stopped. Page restored.';
    if (!active) play.focus({preventScroll:true});
  });
  const copy = document.querySelector('#copy-url');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      copy.textContent = 'Copied';
    } catch {
      copy.textContent = 'Select address';
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(copy.previousElementSibling);
      selection.removeAllRanges();selection.addRange(range);
    }
    setTimeout(() => {copy.textContent='Copy';}, 2200);
  });
})();
