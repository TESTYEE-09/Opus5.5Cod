// Runs world generation off the main thread and ships the arrays back.
import { generate } from './gen.js';

self.onmessage = (e) => {
  const data = generate({ ...e.data, onProgress: (p) => self.postMessage({ progress: p }) });
  const roads = data.roads.map((r) => ({ ...r }));
  const transfer = [data.H.buffer, data.H0.buffer, data.surf.buffer];
  self.postMessage({ done: true, N: data.N, cell: data.cell, H: data.H, H0: data.H0, surf: data.surf, roads }, transfer);
};
