// Planar reflection for rain-wet floors: the scene is drawn once more from a camera mirrored
// under the floor plane (with an oblique clip plane so nothing below the floor leaks in), into a
// reduced-size HDR target. The floor's material (world.js enhance) samples it through uReflMat,
// ripples it with the rain and fades it with the puddle mask.
import * as THREE from 'three';

const _n = new THREE.Vector3(0, 1, 0), _p = new THREE.Vector3(), _c = new THREE.Vector3(), _rot = new THREE.Matrix4();
const _look = new THREE.Vector3(), _t = new THREE.Vector3(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
const _size = new THREE.Vector2();

export class PlanarReflection {
  // base: wetness everywhere (0..1); vary: how much the puddle noise adds/removes; ripple: rain distortion
  constructor({ y = 0, base = 0.55, vary = 0.5, ripple = 1, strength = 1 } = {}) {
    this.y = y;
    this.strength = strength;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.rt.texture.generateMipmaps = false;
    this.cam = new THREE.PerspectiveCamera();
    this.uniforms = {
      tRefl: { value: this.rt.texture }, uReflMat: { value: new THREE.Matrix4() },
      uWet: { value: new THREE.Vector4(base, vary, ripple, strength) }, uTime: { value: 0 },
    };
    this.hide = [];
    this.scale = 0.5;
  }

  // quality: 0 turns the reflection off (the floor still looks wet), otherwise the render scale
  setScale(s) {
    this.scale = s;
    this.uniforms.uWet.value.w = s > 0 ? this.strength : 0;
  }

  render(renderer, scene, camera, dt) {
    this.uniforms.uTime.value += dt;
    if (this.scale <= 0) return;
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(4, Math.floor(_size.x * this.scale)), h = Math.max(4, Math.floor(_size.y * this.scale));
    if (this.rt.width !== w || this.rt.height !== h) this.rt.setSize(w, h);

    _c.setFromMatrixPosition(camera.matrixWorld);
    if (_c.y <= this.y + 0.02) return;
    _p.set(_c.x, this.y, _c.z);
    _rot.extractRotation(camera.matrixWorld);
    const cam = this.cam;
    // mirror the eye and the point it looks at through the floor
    _t.subVectors(_p, _c).reflect(_n).negate().add(_p);
    cam.position.copy(_t);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_c);
    _t.subVectors(_p, _look).reflect(_n).negate().add(_p);
    cam.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    cam.lookAt(_t);
    cam.near = camera.near; cam.far = camera.far;
    cam.updateMatrixWorld();
    cam.projectionMatrix.copy(camera.projectionMatrix);
    this.uniforms.uReflMat.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane on the floor (Lengyel)
    _plane.setFromNormalAndCoplanarPoint(_n, _p).applyMatrix4(cam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const e = cam.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x; e[6] = _clip.y; e[10] = _clip.z + 1 - 0.003; e[14] = _clip.w;

    for (const m of this.hide) m.visible = false;
    const prev = renderer.getRenderTarget(), shadows = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prev);
    renderer.shadowMap.autoUpdate = shadows;
    for (const m of this.hide) m.visible = true;
  }

  dispose() { this.rt.dispose(); }
}
