use std::sync::Mutex;

use serde::{Deserialize, Serialize};

pub const QUIT_CHALLENGE_PHRASE: &str = "I WANT TO PROCRASTINATE";

pub struct GuardState {
    active: Mutex<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuitChallenge {
    pub warning: String,
    pub required_phrase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuardStatus {
    pub active: bool,
    pub challenge_phrase: String,
}

impl GuardState {
    pub fn new() -> Self {
        Self {
            active: Mutex::new(true),
        }
    }

    pub fn is_active(&self) -> Result<bool, String> {
        self.active
            .lock()
            .map(|value| *value)
            .map_err(|error| error.to_string())
    }

    pub fn request_quit(&self) -> QuitChallenge {
        QuitChallenge {
            warning:
                "Stopping the app also stops the guardrails that were supposed to keep you focused."
                    .to_string(),
            required_phrase: QUIT_CHALLENGE_PHRASE.to_string(),
        }
    }
}
