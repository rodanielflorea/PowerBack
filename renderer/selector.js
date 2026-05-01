const box = document.getElementById('box');
let startX = 0, startY = 0;
let dragging = false;

window.addEventListener('mousedown', (e) => {
  startX = e.clientX;
  startY = e.clientY;
  dragging = true;
  box.style.left = startX + 'px';
  box.style.top = startY + 'px';
  box.style.width = '0px';
  box.style.height = '0px';
  box.style.display = 'block';
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const x = Math.min(startX, e.clientX);
  const y = Math.min(startY, e.clientY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);
  box.style.left = x + 'px';
  box.style.top = y + 'px';
  box.style.width = w + 'px';
  box.style.height = h + 'px';
});

window.addEventListener('mouseup', (e) => {
  if (!dragging) return;
  dragging = false;
  const x1 = Math.min(startX, e.clientX);
  const y1 = Math.min(startY, e.clientY);
  const x2 = Math.max(startX, e.clientX);
  const y2 = Math.max(startY, e.clientY);
  if ((x2 - x1) > 8 && (y2 - y1) > 8) {
    window.selector.done({ x1, y1, x2, y2 });
  } else {
    window.selector.cancel();
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.selector.cancel();
});
