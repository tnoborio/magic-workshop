export const TEAM_COUNT = 4;
export const TEAM_COLORS = ["#58d6ff", "#f47fd4", "#ffd76a", "#7ce7a5"];
export const GENERATION_TIMEOUT_MS = 180_000;
export const VALID_TEAM_ID = /^team([1-4])$/;

export function isTeamId(value) {
  return VALID_TEAM_ID.test(value);
}
