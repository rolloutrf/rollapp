export const AUTOMATIC_REWARD_CONFIRMATION = "automatic-settlement-v1";

// The existing confirmation event retains the participant's election without
// changing the terms of older confirmations.
export const hasAutomaticRewardConfirmation = `EXISTS (
  SELECT 1 FROM reward_need_events confirmation
  WHERE confirmation.offer_id=o.id AND confirmation.action='confirm'
    AND confirmation.note='${AUTOMATIC_REWARD_CONFIRMATION}'
)`;
