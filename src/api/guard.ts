import { invoke } from "@tauri-apps/api/core";
import type { GuardStatus, QuitChallenge } from "@/types/guard";

export function requestQuit(): Promise<QuitChallenge> {
  return invoke("request_quit");
}

export function confirmQuit(phrase: string): Promise<boolean> {
  return invoke("confirm_quit", { phrase });
}

export function suspendGuard(
  durationMinutes: number,
  reason?: string | null,
): Promise<boolean> {
  return invoke("suspend_guard", {
    duration_minutes: durationMinutes,
    reason: reason ?? null,
  });
}

export function getGuardStatus(): Promise<GuardStatus> {
  return invoke("get_guard_status");
}
