use super::models::{EnforcementProfile, ProcessAction, ProcessCategory};

pub struct BrowserTargetSeed {
    pub target_key: &'static str,
    pub display_name: &'static str,
    pub keyword: &'static str,
    pub category_name: &'static str,
    pub confidence: f64,
}

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
            name: "Communication".to_string(),
            process_names: vec![
                "gmail".to_string(),
                "outlook".to_string(),
                "slack".to_string(),
                "teams".to_string(),
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

pub fn built_in_profile_names() -> Vec<EnforcementProfile> {
    let now = 0;
    vec![
        EnforcementProfile {
            name: "rest".to_string(),
            parent_name: None,
            builtin: true,
            created_at: now,
            updated_at: now,
        },
        EnforcementProfile {
            name: "work".to_string(),
            parent_name: Some("rest".to_string()),
            builtin: true,
            created_at: now,
            updated_at: now,
        },
        EnforcementProfile {
            name: "deep_work".to_string(),
            parent_name: Some("work".to_string()),
            builtin: true,
            created_at: now,
            updated_at: now,
        },
        EnforcementProfile {
            name: "emergency".to_string(),
            parent_name: None,
            builtin: true,
            created_at: now,
            updated_at: now,
        },
    ]
}

pub const EMERGENCY_PROFILE_NAME: &str = "emergency";

pub const EMERGENCY_BLOCKED_CATEGORIES: &[&str] = &["Games", "Entertainment"];

pub fn built_in_browser_targets() -> Vec<BrowserTargetSeed> {
    vec![
        BrowserTargetSeed {
            target_key: "youtube",
            display_name: "YouTube",
            keyword: "youtube",
            category_name: "Entertainment",
            confidence: 0.98,
        },
        BrowserTargetSeed {
            target_key: "twitter",
            display_name: "Twitter/X",
            keyword: "twitter",
            category_name: "Social Media",
            confidence: 0.95,
        },
        BrowserTargetSeed {
            target_key: "x",
            display_name: "Twitter/X",
            keyword: " x ",
            category_name: "Social Media",
            confidence: 0.7,
        },
        BrowserTargetSeed {
            target_key: "reddit",
            display_name: "Reddit",
            keyword: "reddit",
            category_name: "Social Media",
            confidence: 0.95,
        },
        BrowserTargetSeed {
            target_key: "netflix",
            display_name: "Netflix",
            keyword: "netflix",
            category_name: "Entertainment",
            confidence: 0.98,
        },
        BrowserTargetSeed {
            target_key: "instagram",
            display_name: "Instagram",
            keyword: "instagram",
            category_name: "Social Media",
            confidence: 0.95,
        },
        BrowserTargetSeed {
            target_key: "facebook",
            display_name: "Facebook",
            keyword: "facebook",
            category_name: "Social Media",
            confidence: 0.95,
        },
        BrowserTargetSeed {
            target_key: "tiktok",
            display_name: "TikTok",
            keyword: "tiktok",
            category_name: "Entertainment",
            confidence: 0.95,
        },
        BrowserTargetSeed {
            target_key: "gmail",
            display_name: "Gmail",
            keyword: "gmail",
            category_name: "Communication",
            confidence: 0.92,
        },
    ]
}
