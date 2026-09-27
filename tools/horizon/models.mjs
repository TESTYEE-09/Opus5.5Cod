// Source models for importcars.mjs. The sources live in tools/horizon/sources/ (not committed;
// public/hz/models/CREDITS.md lists where each one comes from and its licence).
const S = (f) => new URL(`./sources/${f}`, import.meta.url).pathname;

export const MODELS = [
  {
    id: 'corvette_c7', src: S('corvette_c7/scene.gltf'), length: 4.492,
    wheel: /^(Rim|Tire|Brake Disc) /, caliper: /^Brake Caliper/, tyre: /^Tire /,
    ratio: [[/Tire/, 0.1], [/Rim/, 0.3], [/Car_Paint/, 0.4], [/Reflectors|Blinker|Tail Lights|Headlight|Daylight|Mesh/, 0.3], [/Interior|Wipers|Exhaust/, 0.25]],
  },
  {
    id: 'porsche_992', src: S('porsche_992.glb'), length: 4.519,
    wheel: /^Cylinder\.00[01]_[012] /, caliper: /^Cylinder\.00[01]_3 /, tyre: /rubber/, drop: / coat$/,
    ratio: [[/paint/, 0.35], [/rubber/, 0.25]], bodyRatio: 0.4,
  },
  {
    id: 'ferrari_458', src: S('ferrari-458-italia.glb'), length: 4.527, forward: '-z',
    wheel: /^(wheel|tire|rim_\w+|centre|brake|nuts) /, tyre: /^tire /, bodyRatio: 0.45,
  },
  {
    id: 'huracan_gt3', src: S('lamborghini-huracan-gt3.glb'), length: 4.551,
    wheel: /MI_Tyre|EXT_RIM|EXT_Disc/, caliper: /EXT_CALIPER/, tyre: /MI_Tyre/, bodyRatio: 0.45,
    drop: /INT_CABLES|INT_WELDING|INT_DECALS/,
  },
  {
    id: 'urus', src: S('lamborghini_urus.glb'), length: 5.112,
    wheel: /TiresGum|^wheel003|^Whl_HD|BreakDiscs/, caliper: /Universal_Caliper/, tyre: /TiresGum/, bodyRatio: 0.5,
  },
  {
    id: 'jeep_wrangler', src: S('jeep-wrangler-rubicon.glb'), length: 4.785,
    wheel: /wheel_01_diff/, tyre: /wheel_01_diff/, bodyRatio: 0.5,
  },
  {
    id: 'mclaren_mp45', src: S('mclaren-mp4-5.glb'), length: 4.42,
    wheel: /^Object_(10|27) /, tyre: /^Object_(10|27) /, bodyRatio: 0.45, wheelRatio: 0.3,
  },
  {
    id: 'supra_gt300', src: S('toyota-supra-gt300.glb'), length: 4.6,
    wheel: /rims_chromes|19_-_Default|20_-_Default/, tyre: /19_-_Default/, bodyRatio: 0.5,
  },
  {
    id: 'laferrari', src: S('ferrari-laferrari-aperta.glb'), length: 4.702,
    wheel: /wheel_b|brake_disk|rim_logo/, tyre: /wheel_b/, bodyRatio: 0.6,
  },
];
