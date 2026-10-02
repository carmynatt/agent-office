// Troy and the notes board, on the north wall past the merge gong.
import * as THREE from 'three';
import { FLOOR } from '../../../shared/layout';
import type { OfficeNote } from '../../../shared/protocol';
import { TROY_COLOR } from '../../../shared/providers';
import { Worker } from '../../world/character';
import type { Fixture } from '../../world/office/fixture';
import { PALETTE } from '../../world/office/materials';
import { wallBoard } from '../../world/office/props';
import { textPlane } from '../../world/toon';
import type { Collider, Interactable } from '../../world/types';
import { NOTES_BOARD } from './stand';

const BOARD = NOTES_BOARD;

declare module '../../world/types' {
  interface OfficeHandles {
    /** The face of Troy's notes board. */
    notesFace: THREE.Mesh;
  }
}

/** Draws the latest notes onto the cork. */
export function paintNotes(ctx: CanvasRenderingContext2D, notes: OfficeNote[]) {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#d8a86a';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(120, 72, 32, 0.18)';
  ctx.lineWidth = 2;
  for (let y = 16; y < height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + 4);
    ctx.stroke();
  }
  const shown = notes.slice(-4);
  if (!shown.length) {
    ctx.fillStyle = '#2b2d42';
    ctx.font = '700 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Notes for Troy', width / 2, height / 2 - 10);
    ctx.font = '600 28px sans-serif';
    ctx.fillText('OFFICE_NOTE', width / 2, height / 2 + 36);
    return;
  }
  shown.forEach((note, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 36 + col * (width / 2 - 10);
    const y = 28 + row * (height / 2 - 8);
    const w = width / 2 - 56;
    const h = height / 2 - 48;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((-4 + i * 3) * (Math.PI / 180));
    ctx.fillStyle = note.provider === 'Cursor' ? '#d9d4ff' : '#ffd7c4';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 4;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = '#2b2d42';
    ctx.font = '800 26px sans-serif';
    ctx.textAlign = 'left';
    const title = (note.title || note.summary).slice(0, 42);
    ctx.fillText(title, -w / 2 + 16, -h / 2 + 40);
    ctx.font = '600 20px sans-serif';
    ctx.fillText(note.provider, -w / 2 + 16, -h / 2 + 72);
    ctx.restore();
  });
}

export const notesBoard: Fixture<'notesFace'> = (site) => {
  const root = new THREE.Group();
  const { group, face } = wallBoard(BOARD.width, BOARD.height, PALETTE.wood);
  group.position.set(BOARD.x, BOARD.y, BOARD.z);
  root.add(group);
  const label = textPlane('Troy · notes', { bg: '#fffaf3', size: 64 });
  label.scale.multiplyScalar(0.85);
  label.position.set(BOARD.x, BOARD.y + BOARD.height / 2 + 0.38, BOARD.z + 0.06);
  root.add(label);

  const troy = new Worker('Troy', TROY_COLOR);
  const standX = BOARD.x - BOARD.width / 2 - 0.45;
  const standZ = FLOOR.minZ + 1.05;
  troy.root.position.set(standX, 0, standZ);
  root.add(troy.root);

  const collider: Collider = { minX: standX - 0.34, maxX: standX + 0.34, minZ: standZ - 0.34, maxZ: standZ + 0.34, top: 1.7, fence: true };
  const interactable: Interactable = { kind: 'notes', x: BOARD.x, z: FLOOR.minZ + 1.7, radius: 2.2 };
  group.userData.interact = interactable;
  site.wall('north', BOARD.x, BOARD.y, BOARD.width + 0.4, BOARD.height + 0.9);

  return {
    group: root,
    colliders: [collider],
    interactables: [interactable],
    handle: { notesFace: face },
    update(t) {
      troy.root.position.y = Math.sin(t * 1.6) * 0.03;
    },
  };
};
