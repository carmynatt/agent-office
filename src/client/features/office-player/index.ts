/**
 * Office Space: the person at the keyboard stays a plain office avatar.
 * Halloween and Christmas still dress the building, the dog and the workers.
 * Your character and your first-person hands do not take the hat or the costume.
 */
import type { Theme } from '../../../shared/protocol';
import type { Ctx } from '../../core/context';

/** Ignores a holiday theme and dresses `avatar` in nothing. */
export function keepOfficePlayerPlain(avatar: { setCostume(theme: Theme | null): void }) {
  const dress = avatar.setCostume.bind(avatar);
  avatar.setCostume = () => dress(null);
}

export function installOfficePlayer(ctx: Ctx) {
  keepOfficePlayerPlain(ctx.me);
  keepOfficePlayerPlain(ctx.hands);
}
