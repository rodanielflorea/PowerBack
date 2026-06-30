// Floating typing-control bar: Pause/Resume + Stop by mouse, without stealing
// focus from the IDE (the window is focusable:false in main).
const dot = document.getElementById('tcDot');
const label = document.getElementById('tcLabel');
const pauseBtn = document.getElementById('tcPause');
const stopBtn = document.getElementById('tcStop');

function setState(paused) {
  if (paused) {
    dot.classList.add('paused');
    label.textContent = 'Paused';
    pauseBtn.textContent = '▶ Resume';
  } else {
    dot.classList.remove('paused');
    label.textContent = 'Typing…';
    pauseBtn.textContent = '⏸ Pause';
  }
}

if (pauseBtn) pauseBtn.addEventListener('click', () => window.typingCtl && window.typingCtl.pauseToggle());
if (stopBtn) stopBtn.addEventListener('click', () => window.typingCtl && window.typingCtl.stop());

if (window.typingCtl && window.typingCtl.onState) {
  window.typingCtl.onState((s) => setState(!!(s && s.paused)));
}
