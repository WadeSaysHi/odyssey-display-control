// Keep native content scrolling. This rail only presents and manipulates its position.
(() => {
  const viewport = document.getElementById('content'), rail = document.getElementById('scroll-rail'), thumb = rail.firstElementChild;
  let timer, drag = null;
  function show() { rail.classList.add('visible'); clearTimeout(timer); timer = setTimeout(() => { if (!drag) rail.classList.remove('visible'); }, 1200); }
  function update() {
    const max = viewport.scrollHeight - viewport.clientHeight, height = rail.clientHeight;
    rail.hidden = max <= 1;
    if (max <= 1) return;
    const size = Math.min(height, Math.max(32, height * viewport.clientHeight / viewport.scrollHeight));
    thumb.style.height = `${size}px`; thumb.style.top = `${(height - size) * viewport.scrollTop / max}px`;
    rail.setAttribute('aria-valuenow', Math.round(viewport.scrollTop / max * 100));
  }
  viewport.addEventListener('scroll', () => { update(); show(); }, { passive: true });
  rail.addEventListener('pointerenter', show); rail.addEventListener('focus', show);
  rail.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.preventDefault(); rail.focus();
    const rect = thumb.getBoundingClientRect();
    if (e.clientY < rect.top || e.clientY > rect.bottom) viewport.scrollTop += (e.clientY < rect.top ? -1 : 1) * viewport.clientHeight * .85;
    drag = { y: e.clientY, top: viewport.scrollTop }; rail.setPointerCapture(e.pointerId); rail.classList.add('dragging'); show();
  });
  rail.addEventListener('pointermove', e => {
    if (!drag) return;
    const travel = rail.clientHeight - thumb.clientHeight;
    if (travel > 0) viewport.scrollTop = drag.top + (e.clientY - drag.y) / travel * (viewport.scrollHeight - viewport.clientHeight);
  });
  const stop = () => { drag = null; rail.classList.remove('dragging'); show(); };
  rail.addEventListener('pointerup', stop); rail.addEventListener('pointercancel', stop); rail.addEventListener('lostpointercapture', stop);
  rail.addEventListener('keydown', e => {
    const amount = { ArrowUp: -40, ArrowDown: 40, PageUp: -viewport.clientHeight * .85, PageDown: viewport.clientHeight * .85, Home: -viewport.scrollHeight, End: viewport.scrollHeight }[e.key];
    if (amount !== undefined) { e.preventDefault(); viewport.scrollTop += amount; show(); }
  });
  new ResizeObserver(update).observe(viewport);
  new MutationObserver(update).observe(viewport, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  window.addEventListener('resize', update); update();
})();
