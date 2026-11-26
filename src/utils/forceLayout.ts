import type { NoteLink, NoteNode } from '../../shared/types';

export interface Vec3Pos {
  x: number;
  y: number;
  z: number;
}

const GROUP_SECTOR_ANGLES: Record<string, number> = {
  strategy: 0,
  operations: (Math.PI * 2) / 5,
  finance: (Math.PI * 4) / 5,
  clients: (Math.PI * 6) / 5,
  team: (Math.PI * 8) / 5,
  captures: Math.PI / 5,
  general: Math.PI,
};

function seededRandom(seed: number): () => number {
  let s = (seed + 1) * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function computeGalaxyLayout(
  nodes: NoteNode[],
  links: NoteLink[],
  existingPositions?: Map<number, Vec3Pos>,
): Map<number, Vec3Pos> {
  const pos = new Map<number, Vec3Pos>();
  const vel = new Map<number, Vec3Pos>();

  // Initialize positions around group orbital sectors outside the central core (radius >= 16)
  for (const node of nodes) {
    const prev = existingPositions?.get(node.id);
    if (prev) {
      pos.set(node.id, { ...prev });
      vel.set(node.id, { x: 0, y: 0, z: 0 });
      continue;
    }

    const rng = seededRandom(node.id * 37 + 13);
    const baseAngle = GROUP_SECTOR_ANGLES[node.group] ?? rng() * Math.PI * 2;
    const angle = baseAngle + (rng() - 0.5) * 0.95;
    const radius = 22 + rng() * 24;
    const height = (rng() - 0.5) * 20;

    pos.set(node.id, {
      x: Math.cos(angle) * radius,
      y: height,
      z: Math.sin(angle) * radius,
    });
    vel.set(node.id, { x: 0, y: 0, z: 0 });
  }

  // If we are updating incrementally (e.g., newborn node), only relax nodes without existing positions
  const hasIncremental = existingPositions && existingPositions.size > 0;
  const iterations = hasIncremental ? 30 : 120;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // 1. Pairwise repulsion + gentle group cohesion
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (hasIncremental && existingPositions?.has(a.id)) continue;

      const pa = pos.get(a.id)!;
      const va = vel.get(a.id)!;

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue;
        const b = nodes[j];
        const pb = pos.get(b.id)!;

        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const dz = pa.z - pb.z;
        const distSq = dx * dx + dy * dy + dz * dz + 0.5;
        const dist = Math.sqrt(distSq);

        // Repulsion
        const repulse = (180 / distSq) * alpha;
        va.x += (dx / dist) * repulse;
        va.y += (dy / dist) * repulse;
        va.z += (dz / dist) * repulse;

        // Soft group attraction
        if (a.group === b.group) {
          va.x -= dx * 0.003 * alpha;
          va.y -= dy * 0.003 * alpha;
          va.z -= dz * 0.003 * alpha;
        }
      }

      // Keep clear of central Arc Core (radius >= 15) and within galaxy shell (<= 58)
      const r = Math.sqrt(pa.x * pa.x + pa.y * pa.y + pa.z * pa.z) + 0.001;
      if (r < 15) {
        const push = (15 - r) * 0.16;
        va.x += (pa.x / r) * push;
        va.y += (pa.y / r) * push;
        va.z += (pa.z / r) * push;
      } else if (r > 52) {
        const pull = (r - 52) * 0.06;
        va.x -= (pa.x / r) * pull;
        va.y -= (pa.y / r) * pull;
        va.z -= (pa.z / r) * pull;
      }
    }

    // 2. Link spring attraction
    for (const link of links) {
      const pa = pos.get(link.source);
      const pb = pos.get(link.target);
      const va = vel.get(link.source);
      const vb = vel.get(link.target);
      if (!pa || !pb || !va || !vb) continue;

      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dz = pb.z - pa.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.001;
      const targetLen = 14;
      const force = ((dist - targetLen) * 0.035) * alpha;

      if (!(hasIncremental && existingPositions?.has(link.source))) {
        va.x += (dx / dist) * force;
        va.y += (dy / dist) * force;
        va.z += (dz / dist) * force;
      }
      if (!(hasIncremental && existingPositions?.has(link.target))) {
        vb.x -= (dx / dist) * force;
        vb.y -= (dy / dist) * force;
        vb.z -= (dz / dist) * force;
      }
    }

    // 3. Integrate & damp
    for (const node of nodes) {
      if (hasIncremental && existingPositions?.has(node.id)) continue;
      const p = pos.get(node.id)!;
      const v = vel.get(node.id)!;
      v.x *= 0.78;
      v.y *= 0.78;
      v.z *= 0.78;
      p.x += v.x;
      p.y += v.y * 0.85;
      p.z += v.z;
    }
  }

  return pos;
}

export function computeNewbornPosition(
  existingPositions: Map<number, Vec3Pos>,
  relatedNodeId: number | null,
  seedId: number,
): Vec3Pos {
  const anchor = relatedNodeId !== null ? existingPositions.get(relatedNodeId) : undefined;
  const rng = seededRandom(seedId * 53 + Date.now() % 1000);
  const theta = rng() * Math.PI * 2;
  const phi = (rng() - 0.5) * Math.PI * 0.6;
  const offsetDist = 7.5;

  if (anchor) {
    return {
      x: anchor.x + Math.cos(theta) * Math.cos(phi) * offsetDist,
      y: anchor.y + Math.sin(phi) * offsetDist,
      z: anchor.z + Math.sin(theta) * Math.cos(phi) * offsetDist,
    };
  }

  return {
    x: Math.cos(theta) * 24,
    y: (rng() - 0.5) * 10,
    z: Math.sin(theta) * 24,
  };
}
