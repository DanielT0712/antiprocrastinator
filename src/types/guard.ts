export type SupervisorMode = "enforced" | "suspended" | "disabled";

export interface QuitChallenge {
  warning: string;
  requiredPhrase: string;
}

export interface GuardStatus {
  active: boolean;
  challengePhrase: string;
  supervisorMode: SupervisorMode;
  suspendedUntilEpochSecs: number | null;
  helperRunning: boolean;
}

export interface QuitRequiredEvent {
  source: string;
  minimizedToTray: boolean;
  warning: string;
  requiredPhrase: string;
}
