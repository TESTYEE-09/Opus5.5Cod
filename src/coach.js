// First-match coaching: a short run of prompts that each wait for the player to actually do
// the thing (move, aim, shoot, reload, sprint, capture) before moving on. Shown once.
const STEPS = [
  { key: ['<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move', 'Left thumb to move'], done: (i, s) => (s.move += (i.forward || i.back || i.left || i.right) ? 1 : 0) > 40 },
  { key: ['Hold <kbd>Shift</kbd> to sprint', 'Push the stick to the rim to sprint'], done: (i, s) => (s.sprint += i.sprint ? 1 : 0) > 40 },
  { key: ['<kbd>Right mouse</kbd> to aim down sights', 'Tap <b>AIM</b> to aim down sights'], done: (i) => i.adsPressed || i.ads },
  { key: ['<kbd>Left mouse</kbd> to fire', 'Hold <b>FIRE</b> to shoot'], done: (i, s) => (s.fire += i.fire ? 1 : 0) > 12 },
  { key: ['<kbd>R</kbd> to reload', 'Tap <b>RELOAD</b>'], done: (i) => i.reload },
  { key: ['Stand in a flag circle to capture it. <kbd>M</kbd> opens the map', 'Stand in a flag circle to capture it'], time: 7 },
];

export class Coach {
  constructor(el, touch) {
    this.el = el; this.touch = touch; this.i = -1; this.s = { move: 0, sprint: 0, fire: 0 }; this.hold = 0;
  }

  // wait for the match intro to clear before the first prompt
  start(delay = 3.8) { this.i = 0; this.hold = 0; this.t = 0; this.wait = delay; this.el.classList.remove('show'); }

  stop() { this.i = -1; this.el.classList.remove('show'); }

  show() {
    const st = STEPS[this.i];
    this.el.innerHTML = `<small>${this.i + 1} / ${STEPS.length}</small><span>${st.key[this.touch ? 1 : 0]}</span>`;
    this.el.classList.remove('done'); this.el.classList.add('show');
  }

  // returns true once the whole run has finished
  update(dt, inp) {
    if (this.i < 0) return false;
    if (this.wait > 0) { if ((this.wait -= dt) <= 0) this.show(); return false; }
    const st = STEPS[this.i];
    this.t += dt;
    if (this.hold > 0) {
      if ((this.hold -= dt) <= 0) {
        if (++this.i >= STEPS.length) { this.stop(); return true; }
        this.t = 0; this.show();
      }
      return false;
    }
    if (this.t > 0.8 && (st.time ? this.t > st.time : st.done(inp, this.s))) {
      this.el.classList.add('done'); this.hold = 0.7;
    }
    return false;
  }
}
