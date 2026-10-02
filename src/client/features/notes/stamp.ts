// A worker who just filed an OFFICE_NOTE: up off the chair, over to Troy's board, pin, and back.
// The same hop-and-walk as a worker sent home or called to a meeting (see features/workers/leaving.ts).
// One trip at a time, so two notes close together don't walk through each other.
import * as THREE from 'three';
import type { DeskDef } from '../../../shared/layout';
import type { Pt } from '../../../shared/nav';
import { mesh, toon } from '../../world/toon';
import { NOTES_BOARD, NOTES_STAND } from './stand';

/** Walking pace on the way to the board and back, in m/s. */
const PACE = 2.8;
/** Seconds hopping down off the chair, or up onto it. */
const HOP = 0.55;
/** Seconds at the cork, paper going on. */
const PIN = 0.7;
/** A worker's feet are this far above its origin. */
const FEET = 0.07;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** The bit of a worker this walks. A real worker, or a stand-in in tests. */
export interface StampBody {
  root: THREE.Object3D;
  walking: boolean;
  stopDancing(): void;
}

/** The seat they got up from. */
export interface StampDesk {
  def: DeskDef;
  seatAnchor: THREE.Object3D;
  chair: THREE.Object3D;
}

/** The floor's paths, the same ones a departure uses. */
export interface StampNav {
  wayFrom(seat: DeskDef, to: Pt): Pt[];
  wayTo(from: Pt, seat: DeskDef): Pt[];
}

interface Job {
  workerId: string;
  noteId: string;
}

type Phase = 'down' | 'walk' | 'pin' | 'back' | 'up';

interface Trip {
  workerId: string;
  noteId: string;
  model: StampBody;
  desk: StampDesk;
  phase: Phase;
  way: Pt[];
  next: number;
  hop: number;
  from: THREE.Vector3;
  heading: number;
  stepIn: number;
  pinT: number;
  shown: boolean;
  paper: THREE.Object3D | null;
  scale: number;
}

/**
 * Stamp trips. `enqueue` is false when this worker can't walk it (not in their seat, no path): the
 * note shows on the cork at once. Otherwise they queue, and the cork holds the note until the pin.
 */
export class NoteStamps {
  private pending: Job[] = [];
  private active: Trip | null = null;

  constructor(
    private scene: THREE.Object3D,
    /** The top of whatever is underfoot at (x, z) for feet at `y`. */
    private ground: (x: number, z: number, y: number) => number,
    private footstep: (x: number, y: number, z: number) => void,
    /** Paper and the pin landing. */
    private pinSound: (at: { x: number; y: number; z: number }) => void,
    private lookup: (workerId: string) => { model: StampBody; desk: StampDesk } | undefined,
    private nav: () => StampNav | null,
    /** The note may show on the cork now. */
    private onShow: (noteId: string) => void,
  ) {}

  /**
   * Queues a trip for `workerId`. False when they aren't sat at their desk: no trip, and the caller
   * should show the note immediately.
   */
  enqueue(workerId: string, noteId: string): boolean {
    if (!this.seated(workerId)) return false;
    this.pending.push({ workerId, noteId });
    this.pump();
    return true;
  }

  /** Where the one on a trip is, for the doors to open. */
  positions(): THREE.Vector3[] {
    const trip = this.active;
    if (!trip || trip.model.root.parent !== this.scene) return [];
    return [trip.model.root.position];
  }

  /**
   * Sent home, or otherwise leaving the seat for good: sit back if we still have them, and show the
   * note. Whoever takes the model next finds them in the chair.
   */
  release(workerId: string) {
    this.pending = this.pending.filter((job) => {
      if (job.workerId !== workerId) return true;
      this.onShow(job.noteId);
      return false;
    });
    const trip = this.active;
    if (!trip || trip.workerId !== workerId) return;
    this.active = null;
    this.giveBack(trip);
    this.pump();
  }

  /** Off this floor: everyone sits back down, and any note still in hand goes up on the cork. */
  clear() {
    const trip = this.active;
    this.active = null;
    const pending = this.pending;
    this.pending = [];
    if (trip) this.giveBack(trip);
    for (const job of pending) this.onShow(job.noteId);
  }

  update(dt: number) {
    const trip = this.active;
    if (!trip) return;
    if (!this.owns(trip)) {
      this.active = null;
      this.dropPaper(trip);
      if (!trip.shown) this.onShow(trip.noteId);
      trip.model.walking = false;
      this.pump();
      return;
    }
    if (this.step(trip, dt)) return;
    this.active = null;
    this.pump();
  }

  private seated(workerId: string): boolean {
    const found = this.lookup(workerId);
    return !!found && !!this.nav() && found.model.root.parent === found.desk.seatAnchor;
  }

  private owns(trip: Trip): boolean {
    return this.lookup(trip.workerId)?.model === trip.model && trip.model.root.parent === this.scene;
  }

  private pump() {
    if (this.active) return;
    const job = this.pending.shift();
    if (!job) return;
    const trip = this.start(job);
    if (!trip) {
      this.onShow(job.noteId);
      this.pump();
      return;
    }
    this.active = trip;
  }

  private start(job: Job): Trip | null {
    const found = this.lookup(job.workerId);
    const nav = this.nav();
    if (!found || !nav || found.model.root.parent !== found.desk.seatAnchor) return null;
    const { model, desk } = found;
    model.stopDancing();
    const from = model.root.getWorldPosition(new THREE.Vector3());
    const scale = model.root.getWorldScale(new THREE.Vector3()).x || 1;
    const way = nav.wayFrom(desk.def, NOTES_STAND);
    if (!way.length) return null;
    this.scene.add(model.root);
    model.root.position.copy(from);
    model.root.scale.setScalar(scale);
    model.root.rotation.set(0, desk.def.rotY + Math.PI, 0);
    model.walking = false;
    return {
      workerId: job.workerId,
      noteId: job.noteId,
      model,
      desk,
      phase: 'down',
      way,
      next: 0,
      hop: 0,
      from,
      heading: model.root.rotation.y,
      stepIn: 0,
      pinT: 0,
      shown: false,
      paper: null,
      scale,
    };
  }

  /** False once they're back in the chair. */
  private step(trip: Trip, dt: number): boolean {
    const { model } = trip;
    const pos = model.root.position;
    model.walking = false;
    if (trip.phase === 'down' || trip.phase === 'up') return this.hop(trip, dt);
    if (trip.phase === 'pin') return this.pin(trip, dt);
    let move = PACE * dt;
    while (move > 0 && trip.next < trip.way.length) {
      const [x, z] = trip.way[trip.next];
      const dx = x - pos.x;
      const dz = z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4) trip.heading = Math.atan2(dx, dz);
      if (d <= move) {
        pos.x = x;
        pos.z = z;
        move -= d;
        trip.next++;
      } else {
        pos.x += (dx / d) * move;
        pos.z += (dz / d) * move;
        move = 0;
      }
    }
    const g = this.ground(pos.x, pos.z, pos.y + FEET) - FEET;
    pos.y += (g - pos.y) * Math.min(1, dt * 14);
    model.root.rotation.x = 0;
    model.root.rotation.y += wrap(trip.heading - model.root.rotation.y) * Math.min(1, dt * 8);
    if (trip.next < trip.way.length) {
      model.walking = true;
      trip.stepIn -= dt;
      if (trip.stepIn <= 0) {
        trip.stepIn += Math.PI / 9;
        this.footstep(pos.x, pos.y, pos.z);
      }
      return true;
    }
    if (trip.phase === 'walk') {
      this.stick(trip);
      return true;
    }
    trip.phase = 'up';
    trip.from = pos.clone();
    trip.hop = 0;
    return true;
  }

  /** Down off the chair, or up onto it. */
  private hop(trip: Trip, dt: number): boolean {
    const { model } = trip;
    const pos = model.root.position;
    trip.hop = Math.min(1, trip.hop + dt / HOP);
    const p = trip.hop;
    if (trip.phase === 'down') {
      const [x0, z0] = trip.way[0];
      const floor = this.ground(x0, z0, trip.from.y) - FEET;
      pos.set(THREE.MathUtils.lerp(trip.from.x, x0, p), THREE.MathUtils.lerp(trip.from.y, floor, p) + Math.sin(p * Math.PI) * 0.35, THREE.MathUtils.lerp(trip.from.z, z0, p));
      const toward = trip.way[1] ?? NOTES_STAND;
      model.root.rotation.y += wrap(Math.atan2(toward[0] - x0, toward[1] - z0) - model.root.rotation.y) * Math.min(1, dt * 7);
      if (p < 1) return true;
      trip.phase = 'walk';
      trip.next = 1;
      if (trip.next >= trip.way.length) this.stick(trip);
      return true;
    }
    const seat = trip.desk.seatAnchor.getWorldPosition(new THREE.Vector3());
    pos.set(THREE.MathUtils.lerp(trip.from.x, seat.x, p), THREE.MathUtils.lerp(trip.from.y, seat.y, p) + Math.sin(p * Math.PI) * 0.35, THREE.MathUtils.lerp(trip.from.z, seat.z, p));
    model.root.rotation.y += wrap(trip.desk.def.rotY + Math.PI - model.root.rotation.y) * Math.min(1, dt * 9);
    if (p < 1) return true;
    this.sit(trip);
    return false;
  }

  /** The paper goes on the cork, then the note may show there. */
  private pin(trip: Trip, dt: number): boolean {
    const { model } = trip;
    trip.pinT += dt;
    model.root.rotation.x = Math.sin(Math.min(1, trip.pinT / PIN) * Math.PI) * 0.35;
    model.root.rotation.y += wrap(Math.PI - model.root.rotation.y) * Math.min(1, dt * 8);
    const sheet = trip.paper;
    if (sheet) sheet.scale.setScalar(Math.min(1, trip.pinT / 0.22));
    if (!trip.shown && trip.pinT >= 0.22) {
      trip.shown = true;
      this.onShow(trip.noteId);
      this.pinSound(model.root.position);
    }
    if (trip.pinT < PIN) return true;
    this.dropPaper(trip);
    model.root.rotation.x = 0;
    const nav = this.nav();
    const back = nav?.wayTo([model.root.position.x, model.root.position.z], trip.desk.def) ?? [];
    trip.way = back;
    trip.next = 0;
    trip.phase = back.length ? 'back' : 'up';
    if (trip.phase === 'up') {
      trip.from = model.root.position.clone();
      trip.hop = 0;
    }
    return true;
  }

  private stick(trip: Trip) {
    trip.phase = 'pin';
    trip.pinT = 0;
    trip.model.walking = false;
    const sheet = pinSheet();
    sheet.position.set(NOTES_BOARD.x, NOTES_BOARD.y - 0.28, NOTES_BOARD.z + 0.05);
    sheet.scale.setScalar(0.001);
    this.scene.add(sheet);
    trip.paper = sheet;
  }

  /** Back in the chair, the size the seat expects. */
  private sit(trip: Trip) {
    const { model, desk } = trip;
    model.walking = false;
    this.dropPaper(trip);
    desk.seatAnchor.add(model.root);
    model.root.position.set(0, 0, 0);
    model.root.rotation.set(0, 0, 0);
    model.root.scale.setScalar(1);
    if (!trip.shown) this.onShow(trip.noteId);
  }

  /** Sit them down if we still have the model. */
  private giveBack(trip: Trip) {
    if (this.lookup(trip.workerId)?.model === trip.model && trip.model.root.parent === this.scene) this.sit(trip);
    else {
      this.dropPaper(trip);
      if (!trip.shown) this.onShow(trip.noteId);
      trip.model.walking = false;
    }
  }

  private dropPaper(trip: Trip) {
    const sheet = trip.paper;
    trip.paper = null;
    if (!sheet) return;
    sheet.removeFromParent();
    sheet.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
    });
  }
}

/** A sheet of paper and a pin, origin on the cork. */
function pinSheet(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.34, 0.42, 0.015), toon('#fffaf3'), 0, 0, 0, false));
  g.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), toon('#9b2226'), 0, 0.16, 0.02, false));
  return g;
}
