import { USER_MANAGEMENT_TOOLS } from "./data";

/** Campaigns opens only right after one of these HR platforms finishes connecting. */
export function shouldOpenCampaignsAfterConnect(providerId: string): boolean {
  return USER_MANAGEMENT_TOOLS.some((tile) => tile.id === providerId);
}
