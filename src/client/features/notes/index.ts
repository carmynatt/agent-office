/**
 * Troy's notes board: OFFICE_NOTE requests queued for GrokBot. E opens the list. Workers never call Notion.
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { boardHint, onE } from '../../core/hint';
import { store } from '../../state';
import { openNotes } from '../../ui/notes';
import { paintNotes } from './world';

declare module '../../world/types' {
  interface InteractKinds {
    notes: true;
  }
}

export function installNotes(ctx: Ctx) {
  const face = ctx.office.notesFace;
  if (face) {
    const canvas = document.createElement('canvas');
    canvas.width = 880;
    canvas.height = 680;
    const paint = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const mat = face.material as THREE.MeshBasicMaterial;
    mat.map = texture;
    mat.needsUpdate = true;
    const render = () => {
      paintNotes(paint, store.notes?.notes ?? []);
      texture.needsUpdate = true;
    };
    store.on('notes', render);
    render();
  }

  ctx.interactions.define('notes', {
    reach: 3.4,
    hint: () => {
      const n = store.notes?.notes.length ?? 0;
      return n ? { k: String(n), parts: boardHint(`📝 Troy · ${n} note${n === 1 ? '' : 's'}`).parts } : boardHint('📝 Troy · notes');
    },
    use: onE(() => openNotes()),
  });
}
