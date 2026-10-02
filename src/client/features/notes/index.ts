/**
 * Troy's notes board: OFFICE_NOTE requests queued for GrokBot. E opens the list. Workers never call Notion.
 * A note that just landed walks its worker over to pin it (see stamp.ts).
 */
import * as THREE from 'three';
import type { Ctx } from '../../core/context';
import { boardHint, onE } from '../../core/hint';
import type { Parts } from '../../core/parts';
import { store } from '../../state';
import { openNotes } from '../../ui/notes';
import { NoteStamps } from './stamp';
import { paintNotes } from './world';

declare module '../../world/types' {
  interface InteractKinds {
    notes: true;
  }
}

export type NotesParts = Pick<Parts, 'views' | 'worlds'>;

export function installNotes(ctx: Ctx, parts: NotesParts) {
  const { sound } = ctx;
  /** Notes held off the cork until the worker pins them. */
  const pinning = new Set<string>();
  const face = ctx.office.notesFace;
  let render = () => {};
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
    render = () => {
      const notes = (store.notes?.notes ?? []).filter((note) => !pinning.has(note.id));
      paintNotes(paint, notes);
      texture.needsUpdate = true;
    };
    store.on('notes', render);
    render();
  }

  const show = (noteId: string) => {
    if (!pinning.delete(noteId)) return;
    render();
  };
  const stamps = new NoteStamps(
    ctx.scene,
    parts.worlds.groundHere,
    (x, y, z) => sound.stepAt(x, z, y),
    (at) => {
      sound.paper();
      sound.thud(at);
    },
    (workerId) => {
      const view = parts.views.workerViews.get(workerId);
      const desk = view && ctx.world().desks.get(view.deskId);
      return view && desk ? { model: view.model, desk } : undefined;
    },
    () => (parts.worlds.inOffice() ? ctx.world().nav : null),
    show,
  );

  ctx.messages.on('note.stamp', (msg) => {
    if (!face || msg.floorId !== store.floor || !parts.worlds.inOffice()) return;
    if (!stamps.enqueue(msg.workerId, msg.noteId)) return;
    pinning.add(msg.noteId);
    render();
  });
  ctx.messages.on('worker.remove', (msg) => stamps.release(msg.workerId), 'before');
  ctx.messages.on('floor.enter', () => stamps.clear(), 'before');
  ctx.messages.on('welcome', () => stamps.clear(), 'before');
  ctx.ticks.add('others', ({ dt }) => stamps.update(dt));

  ctx.interactions.define('notes', {
    reach: 3.4,
    hint: () => {
      const n = store.notes?.notes.length ?? 0;
      return n ? { k: String(n), parts: boardHint(`📝 Troy · ${n} note${n === 1 ? '' : 's'}`).parts } : boardHint('📝 Troy · notes');
    },
    use: onE(() => openNotes()),
  });

  return {
    /** Where a worker pinning a note is, for the doors. */
    positions: () => stamps.positions(),
  };
}
