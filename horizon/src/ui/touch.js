// Touch controls for phones and tablets: drag on the left half to steer (analog, from where
// the thumb landed), pedals on the right, plus handbrake, camera, rewind and menu buttons.
export class TouchControls {
  constructor(root, input, actions) {
    this.input = input;
    const el = this.el = document.createElement('div');
    el.className = 'touch';
    el.innerHTML = `
      <div class="tc-steer" id="tcSteer"><div class="tc-knob" id="tcKnob"></div></div>
      <button class="tc-btn tc-hb" data-k="hb">HB</button>
      <button class="tc-btn tc-brake" data-k="brake">BRAKE</button>
      <button class="tc-btn tc-gas" data-k="gas">GAS</button>
      <div class="tc-top">
        <button class="tc-small" data-a="rewind">⟲</button>
        <button class="tc-small" data-a="camera">📷</button>
        <button class="tc-small" data-a="menu">☰</button>
      </div>`;
    root.appendChild(el);
    const T = input.touch;
    const steer = el.querySelector('#tcSteer'), knob = el.querySelector('#tcKnob');
    let sid = null, sx = 0;
    steer.addEventListener('pointerdown', (e) => { sid = e.pointerId; sx = e.clientX; steer.setPointerCapture(sid); knob.style.left = `${e.clientX}px`; knob.style.top = `${e.clientY}px`; knob.classList.add('on'); T.active = true; T.analog = true; e.preventDefault(); });
    steer.addEventListener('pointermove', (e) => { if (e.pointerId !== sid) return; const d = (e.clientX - sx) / Math.min(140, innerWidth * 0.14); T.steer = -Math.max(-1, Math.min(1, d)); knob.style.transform = `translate(${Math.max(-1, Math.min(1, d)) * 40 - 50}%, -50%)`; });
    const endSteer = (e) => { if (e.pointerId !== sid) return; sid = null; T.steer = 0; knob.classList.remove('on'); knob.style.transform = ''; };
    steer.addEventListener('pointerup', endSteer); steer.addEventListener('pointercancel', endSteer);
    for (const b of el.querySelectorAll('[data-k]')) {
      const k = b.dataset.k, key = k === 'gas' ? 'throttle' : k === 'brake' ? 'brake' : 'handbrake';
      const on = (e) => { T[key] = 1; T.active = true; b.classList.add('on'); e.preventDefault(); b.setPointerCapture?.(e.pointerId); };
      const off = () => { T[key] = 0; b.classList.remove('on'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    }
    for (const b of el.querySelectorAll('[data-a]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); actions[b.dataset.a]?.(); });
    this.show(matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
  }

  show(v) { this.el.classList.toggle('hidden', !v); }
}
