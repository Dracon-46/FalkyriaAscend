import { and, isNull } from 'drizzle-orm';
import { rewardGrants } from '../schema';

/** Recompensas efetivas = não estornadas e que não são estornos. */
export const effectiveGrant = and(isNull(rewardGrants.reversedAt), isNull(rewardGrants.reversalOf));
