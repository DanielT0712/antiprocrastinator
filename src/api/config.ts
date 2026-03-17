import { invoke } from "@tauri-apps/api/core";
import type { UserPreferences } from "@/types/config";

export function getPreferences(): Promise<UserPreferences> {
  return invoke("get_preferences");
}

export function updatePreferences(
  preferences: UserPreferences,
): Promise<UserPreferences> {
  return invoke("update_preferences", { preferences });
}
