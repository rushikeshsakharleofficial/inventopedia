/** Subscription tier identifiers */
export type SubscriptionTier = 'free' | 'starter' | 'business' | 'enterprise';

/** Subscription tier limits */
export interface TierLimits {
  maxProjects: number | null; // null = unlimited (enterprise custom)
}

/** Default limits per tier */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: { maxProjects: 2 },
  starter: { maxProjects: 5 },
  business: { maxProjects: 10 },
  enterprise: { maxProjects: null },
};
