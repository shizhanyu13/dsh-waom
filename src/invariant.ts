/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-waom`.
 * @module @deepseek-ai/dsh-waom/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-waom'

/** Cordis companion plugin name. */
export const name = 'waom-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this package owns no durable event/data relation; the
 * per-cycle monitor probe + subagent run are transient with no persistence or
 * authoritative stream to assert against that is not owned elsewhere.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
