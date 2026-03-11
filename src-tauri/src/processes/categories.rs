use super::models::{ProcessAction, ProcessCategory};

pub fn built_in_categories() -> Vec<ProcessCategory> {
    vec![
        ProcessCategory {
            name: "Games".to_string(),
            process_names: vec![
                "steam".to_string(),
                "epicgameslauncher".to_string(),
                "riot client".to_string(),
                "battle.net".to_string(),
            ],
            default_action: ProcessAction::AlwaysBlock,
        },
        ProcessCategory {
            name: "Social Media".to_string(),
            process_names: vec![
                "discord".to_string(),
                "telegram".to_string(),
                "whatsapp".to_string(),
                "signal".to_string(),
            ],
            default_action: ProcessAction::BlockDuringWork,
        },
        ProcessCategory {
            name: "Entertainment".to_string(),
            process_names: vec![
                "spotify".to_string(),
                "vlc".to_string(),
                "iina".to_string(),
                "netflix".to_string(),
            ],
            default_action: ProcessAction::AllowDuringBreak,
        },
        ProcessCategory {
            name: "Browsers".to_string(),
            process_names: vec![
                "google chrome".to_string(),
                "firefox".to_string(),
                "safari".to_string(),
                "microsoft edge".to_string(),
                "arc".to_string(),
                "brave browser".to_string(),
            ],
            default_action: ProcessAction::Warn,
        },
    ]
}
