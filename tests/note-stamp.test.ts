import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NoteStamps, type StampBody, type StampDesk, type StampNav } from '../src/client/features/notes/stamp.js';
import { NOTES_STAND } from '../src/client/features/notes/stand.js';
import { DESKS } from '../src/shared/layout.js';
import { OFFICE_NAV } from '../src/shared/nav.js';

test('the pin spot in front of Troy is on a walk from a desk', () => {
  const desk = DESKS.find((d) => !d.station && !d.beanbag && !d.room);
  assert.ok(desk);
  const way = OFFICE_NAV.wayFrom(desk, NOTES_STAND);
  assert.ok(way.length >= 2, 'a desk reaches the board');
  const end = way[way.length - 1];
  assert.ok(Math.hypot(end[0] - NOTES_STAND[0], end[1] - NOTES_STAND[1]) < 1.2, 'the walk ends at the cork');
});

/** A worker stand-in: a group, with the walking flag the waddle reads. */
function body(): StampBody {
  return { root: new THREE.Group(), walking: false, stopDancing() {} };
}

function deskAt(x: number, z: number): StampDesk {
  const seatAnchor = new THREE.Group();
  seatAnchor.position.set(x, 0.5, z);
  seatAnchor.scale.setScalar(0.82);
  return { def: { id: `d${x}`, x, z, rotY: 0, label: 'desk' }, seatAnchor, chair: new THREE.Group() };
}

/** Short paths, so a trip finishes in a handful of steps. `to` is where they pin. */
function nav(): StampNav {
  return {
    wayFrom: (seat) => [[seat.x + 0.8, seat.z + 1], [seat.x + 3, seat.z + 1]],
    wayTo: (from, seat) => [from, [seat.x + 0.8, seat.z + 1]],
  };
}

function office() {
  const scene = new THREE.Group();
  const seats = new Map<string, { model: StampBody; desk: StampDesk }>();
  const shown: string[] = [];
  const stamps = new NoteStamps(
    scene,
    () => 0,
    () => {},
    () => {},
    (id) => seats.get(id),
    nav,
    (id) => shown.push(id),
  );
  function hire(id: string, x: number, z: number) {
    const model = body();
    const desk = deskAt(x, z);
    scene.add(desk.seatAnchor);
    desk.seatAnchor.add(model.root);
    seats.set(id, { model, desk });
    return { model, desk };
  }
  return { scene, stamps, shown, hire, seats };
}

test('a real office path reaches the board and comes back', () => {
  const deskDef = DESKS.find((d) => !d.station && !d.beanbag && !d.room);
  assert.ok(deskDef);
  const scene = new THREE.Group();
  const seatAnchor = new THREE.Group();
  seatAnchor.position.set(deskDef.x, 0.5, deskDef.z);
  scene.add(seatAnchor);
  const model = body();
  seatAnchor.add(model.root);
  const desk: StampDesk = { def: deskDef, seatAnchor, chair: new THREE.Group() };
  const shown: string[] = [];
  const stamps = new NoteStamps(
    scene,
    () => 0,
    () => {},
    () => {},
    () => ({ model, desk }),
    () => OFFICE_NAV,
    (id) => shown.push(id),
  );
  assert.equal(stamps.enqueue('w', 'n'), true);
  let back = false;
  for (let i = 0; i < 2000 && !back; i++) {
    stamps.update(0.1);
    back = model.root.parent === seatAnchor && shown.includes('n');
  }
  assert.equal(back, true);
  assert.equal(model.walking, false);
});

test('one worker pins and sits back before the next one gets up', () => {
  const { scene, stamps, shown, hire } = office();
  const a = hire('a', 0, 0);
  const b = hire('b', 4, 0);
  assert.equal(stamps.enqueue('a', 'n1'), true);
  assert.equal(stamps.enqueue('b', 'n2'), true);
  assert.equal(stamps.positions().length, 1);
  assert.equal(stamps.positions()[0], a.model.root.position);
  assert.notEqual(a.model.root.parent, a.desk.seatAnchor);
  assert.equal(b.model.root.parent, b.desk.seatAnchor, 'the second worker waits at their desk');

  let back = false;
  let pinned = false;
  for (let i = 0; i < 400 && !back; i++) {
    stamps.update(0.05);
    pinned = pinned || scene.children.some((child) => child !== a.model.root && child !== a.desk.seatAnchor && child !== b.desk.seatAnchor);
    back = a.model.root.parent === a.desk.seatAnchor && shown.includes('n1');
    if (!back) assert.equal(b.model.root.parent, b.desk.seatAnchor);
  }
  assert.equal(pinned, true, 'a sheet of paper goes up on the cork');
  assert.equal(back, true, 'the first worker pins the note and sits back down');
  assert.equal(a.model.walking, false);
  assert.equal(a.model.root.position.length(), 0);
  assert.ok(shown.indexOf('n1') === 0);

  let left = false;
  for (let i = 0; i < 20 && !left; i++) {
    stamps.update(0.05);
    left = b.model.root.parent !== b.desk.seatAnchor;
  }
  assert.equal(left, true, 'the second trip starts once the first is home');
  assert.equal(shown.includes('n2'), false, 'their note stays off the cork until the pin');
});

test('a worker who is not in their seat does not take a trip', () => {
  const { stamps, shown, hire } = office();
  const a = hire('a', 0, 0);
  a.desk.seatAnchor.remove(a.model.root);
  assert.equal(stamps.enqueue('a', 'n1'), false);
  assert.equal(shown.length, 0);
  stamps.update(1);
  assert.equal(stamps.positions().length, 0);
});

test('sending a walker home sits them back down and shows the note', () => {
  const { stamps, shown, hire } = office();
  const a = hire('a', 0, 0);
  assert.equal(stamps.enqueue('a', 'n1'), true);
  stamps.update(0.2);
  assert.notEqual(a.model.root.parent, a.desk.seatAnchor);
  stamps.release('a');
  assert.equal(a.model.root.parent, a.desk.seatAnchor);
  assert.deepEqual(shown, ['n1']);
  assert.equal(a.model.walking, false);
});
