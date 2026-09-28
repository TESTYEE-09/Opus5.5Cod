// Keyboard, gamepad and touch input folded into one driving state.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: 0, steerRate: 1 };
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: 0, active: false };
    this.pad = null;
    this.padPrev = [];
    this.last = 'keyboard';
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code); this.pressed.add(e.code); this.last = 'keyboard';
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // one-shot presses since the last frame (keyboard codes or pad buttons as 'pad:N')
  took(code) { return this.pressed.has(code); }

  update(dt) {
    const k = this.keys, s = this.state;
    let thr = k.has('KeyW') || k.has('ArrowUp') ? 1 : 0;
    let brk = k.has('KeyS') || k.has('ArrowDown') ? 1 : 0;
    let st = (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) - (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0);
    let hb = k.has('Space') ? 1 : 0;
    // gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find((g) => g && g.connected);
    let analog = false;
    if (p) {
      const b = (i) => p.buttons[i]?.value ?? 0;
      const sx = Math.abs(p.axes[0]) > 0.08 ? p.axes[0] : 0;
      if (b(7) > 0.02 || b(6) > 0.02 || sx !== 0 || b(0) > 0.5) { this.last = 'pad'; }
      if (this.last === 'pad') {
        thr = Math.max(thr, b(7)); brk = Math.max(brk, b(6));
        st = st || -Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
        hb = Math.max(hb, b(0));
        analog = true;
      }
      p.buttons.forEach((btn, i) => { if (btn.pressed && !this.padPrev[i]) this.pressed.add(`pad:${i}`); this.padPrev[i] = btn.pressed; });
    }
    const T = this.touch;
    if (T.active) { thr = Math.max(thr, T.throttle); brk = Math.max(brk, T.brake); st = st || T.steer; hb = Math.max(hb, T.handbrake); analog = T.analog; }
    s.throttle = thr; s.brake = brk; s.handbrake = hb;
    // digital steering is eased in; analog passes straight through
    if (analog) s.steer = st;
    else s.steer += clamp(st - s.steer, -dt * 4.5, dt * 4.5) * (Math.sign(st) !== Math.sign(s.steer) && st !== 0 ? 1.6 : 1);
    s.steer = clamp(s.steer, -1, 1);
    s.steerRate = analog ? 1.6 : 1;
  }

  endFrame() { this.pressed.clear(); }
}
