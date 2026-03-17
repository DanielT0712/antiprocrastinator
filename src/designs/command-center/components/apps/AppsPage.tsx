import { useEffect, useState } from "react";
import { useProcessStore } from "@/stores/processStore";
import * as processApi from "@/api/processes";
import type {
  ClassificationAction,
  KnownApp,
  KnownBrowserTarget,
  ProcessRule,
  ProcessAction,
} from "@/types/process";
import { Button } from "../common/Button";
import { Select } from "../common/Select";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Tab = "apps" | "websites" | "rules" | "profiles";

const classificationOptions = [
  { value: "unclassified", label: "Unclassified" },
  { value: "always_ban", label: "Always Ban" },
  { value: "ban_during_work", label: "Ban During Work" },
  { value: "never_ban", label: "Never Ban" },
];

const processActionOptions = [
  { value: "always_block", label: "Always Block" },
  { value: "block_during_work", label: "Block During Work" },
  { value: "allow_during_break", label: "Allow During Break" },
  { value: "warn", label: "Warn" },
  { value: "always_allow", label: "Always Allow" },
];

function formatDate(ts: number | null): string {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Pending Classifications
// ---------------------------------------------------------------------------

function PendingClassifications({
  apps,
  browserTargets,
  onClassifyApp,
  onClassifyTarget,
}: {
  apps: KnownApp[];
  browserTargets: KnownBrowserTarget[];
  onClassifyApp: (appKey: string, action: ClassificationAction) => void;
  onClassifyTarget: (targetKey: string, action: ClassificationAction) => void;
}) {
  const total = apps.length + browserTargets.length;
  if (total === 0) return null;

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <svg
          className="w-5 h-5 text-amber-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-semibold text-amber-400 uppercase">
          Pending Classification
        </span>
        <span className="text-xs text-amber-400/70 bg-amber-400/10 rounded-full px-2 py-0.5">
          {total}
        </span>
      </div>

      <div className="space-y-2">
        {apps.map((app) => (
          <PendingRow
            key={app.appKey}
            name={app.displayName}
            onAlwaysBan={() => onClassifyApp(app.appKey, "always_ban")}
            onBanDuringWork={() =>
              onClassifyApp(app.appKey, "ban_during_work")
            }
            onNeverBan={() => onClassifyApp(app.appKey, "never_ban")}
          />
        ))}
        {browserTargets.map((bt) => (
          <PendingRow
            key={bt.targetKey}
            name={bt.displayName}
            onAlwaysBan={() => onClassifyTarget(bt.targetKey, "always_ban")}
            onBanDuringWork={() =>
              onClassifyTarget(bt.targetKey, "ban_during_work")
            }
            onNeverBan={() => onClassifyTarget(bt.targetKey, "never_ban")}
          />
        ))}
      </div>
    </div>
  );
}

function PendingRow({
  name,
  onAlwaysBan,
  onBanDuringWork,
  onNeverBan,
}: {
  name: string;
  onAlwaysBan: () => void;
  onBanDuringWork: () => void;
  onNeverBan: () => void;
}) {
  return (
    <div className="flex items-center gap-2 bg-[var(--bg-secondary)] rounded-md px-3 py-2">
      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
        {name}
      </span>
      <Button variant="danger" size="sm" onClick={onAlwaysBan}>
        Always Ban
      </Button>
      <button
        onClick={onBanDuringWork}
        className="px-3 py-1 text-xs font-medium rounded-md bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors"
      >
        Ban During Work
      </button>
      <Button variant="secondary" size="sm" onClick={onNeverBan}>
        <span className="text-[var(--success)]">Never Ban</span>
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Apps
// ---------------------------------------------------------------------------

function AppsTab({
  knownApps,
  onUpdate,
  onRefresh,
}: {
  knownApps: KnownApp[];
  onUpdate: (appKey: string, action: ClassificationAction) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {knownApps.map((app) => (
          <div
            key={app.appKey}
            className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-4 py-3"
          >
            <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
              {app.displayName}
            </span>
            <Select
              options={classificationOptions}
              value={app.classificationAction}
              onChange={(v) =>
                onUpdate(app.appKey, v as ClassificationAction)
              }
            />
            <span className="text-xs text-[var(--text-secondary)] w-24 text-right truncate">
              {app.effectiveCategory ?? "-"}
            </span>
            <span className="text-xs text-[var(--text-secondary)] w-20 text-right">
              {formatDate(app.lastSeenRunningAt)}
            </span>
          </div>
        ))}
        {knownApps.length === 0 && (
          <p className="text-center text-sm text-[var(--text-secondary)] py-8">
            No apps found.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Websites
// ---------------------------------------------------------------------------

function WebsitesTab({
  browserTargets,
  onUpdate,
}: {
  browserTargets: KnownBrowserTarget[];
  onUpdate: (targetKey: string, action: ClassificationAction) => void;
}) {
  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto">
      {browserTargets.map((bt) => (
        <div
          key={bt.targetKey}
          className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-4 py-3"
        >
          <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
            {bt.displayName}
          </span>
          <span className="text-xs text-[var(--text-secondary)] w-24 truncate">
            {bt.keyword}
          </span>
          <Select
            options={classificationOptions}
            value={bt.classificationAction}
            onChange={(v) =>
              onUpdate(bt.targetKey, v as ClassificationAction)
            }
          />
          <span className="text-xs text-[var(--text-secondary)] w-24 text-right truncate">
            {bt.categoryName ?? "-"}
          </span>
        </div>
      ))}
      {browserTargets.length === 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)] py-8">
          No browser targets found.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Rules
// ---------------------------------------------------------------------------

function RulesTab({
  processRules,
  onRuleChange,
  onDeleteRule,
}: {
  processRules: ProcessRule[];
  onRuleChange: (
    rule: ProcessRule,
    updates: { action?: ProcessAction; warnSeconds?: number | null },
  ) => void;
  onDeleteRule: (processName: string) => void;
}) {
  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto">
      {processRules.map((rule) => (
        <div
          key={rule.processName}
          className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-4 py-3"
        >
          <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
            {rule.processName}
          </span>
          <Select
            options={processActionOptions}
            value={rule.action}
            onChange={(v) =>
              onRuleChange(rule, { action: v as ProcessAction })
            }
          />
          {rule.action === "warn" && (
            <input
              type="number"
              className="w-20 bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--bg-tertiary)] rounded-md px-2 py-1 text-sm outline-none focus:border-[var(--accent)]"
              value={rule.warnSeconds ?? ""}
              onChange={(e) =>
                onRuleChange(rule, {
                  warnSeconds: e.target.value
                    ? Number(e.target.value)
                    : null,
                })
              }
              placeholder="sec"
            />
          )}
          <button
            onClick={() => onDeleteRule(rule.processName)}
            className="text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors p-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ))}
      {processRules.length === 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)] py-8">
          No process rules configured.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Profiles
// ---------------------------------------------------------------------------

function ProfilesTab({
  enforcementProfiles,
}: {
  enforcementProfiles: { name: string; parentName: string | null; builtin: boolean }[];
}) {
  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto">
      {enforcementProfiles.map((profile) => (
        <div
          key={profile.name}
          className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-4 py-3"
        >
          <span className="flex-1 text-sm text-[var(--text-primary)]">
            {profile.name}
          </span>
          <span className="text-xs text-[var(--text-secondary)]">
            {profile.parentName ?? "-"}
          </span>
          {profile.builtin && (
            <span className="inline-flex items-center rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
              builtin
            </span>
          )}
        </div>
      ))}
      {enforcementProfiles.length === 0 && (
        <p className="text-center text-sm text-[var(--text-secondary)] py-8">
          No enforcement profiles found.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppsPage
// ---------------------------------------------------------------------------

export function AppsPage() {
  const {
    knownApps,
    browserTargets,
    pendingClassifications,
    processRules,
    enforcementProfiles,
    fetchKnownApps,
    updateKnownApp,
    fetchBrowserTargets,
    fetchPendingClassifications,
    fetchProcessRules,
    fetchEnforcementProfiles,
  } = useProcessStore();

  const [activeTab, setActiveTab] = useState<Tab>("apps");

  useEffect(() => {
    fetchKnownApps();
    fetchBrowserTargets();
    fetchPendingClassifications();
    fetchProcessRules();
    fetchEnforcementProfiles();
  }, [
    fetchKnownApps,
    fetchBrowserTargets,
    fetchPendingClassifications,
    fetchProcessRules,
    fetchEnforcementProfiles,
  ]);

  // Classify pending app
  const classifyApp = async (
    appKey: string,
    action: ClassificationAction,
  ) => {
    await updateKnownApp(appKey, {
      classificationAction: action,
      syncRule: true,
    });
    await fetchPendingClassifications();
  };

  // Classify pending browser target
  const classifyTarget = async (
    targetKey: string,
    action: ClassificationAction,
  ) => {
    await processApi.updateKnownBrowserTarget(targetKey, {
      classificationAction: action,
    });
    await fetchBrowserTargets();
    await fetchPendingClassifications();
  };

  // Update app classification
  const handleUpdateApp = async (
    appKey: string,
    action: ClassificationAction,
  ) => {
    await updateKnownApp(appKey, {
      classificationAction: action,
      syncRule: true,
    });
  };

  // Update browser target classification
  const handleUpdateTarget = async (
    targetKey: string,
    action: ClassificationAction,
  ) => {
    await processApi.updateKnownBrowserTarget(targetKey, {
      classificationAction: action,
    });
    await fetchBrowserTargets();
  };

  // Refresh inventory
  const handleRefresh = async () => {
    await processApi.refreshKnownAppsInventory();
    await fetchKnownApps();
  };

  // Rule changes
  const handleRuleChange = async (
    rule: ProcessRule,
    updates: { action?: ProcessAction; warnSeconds?: number | null },
  ) => {
    const updated = {
      ...rule,
      action: updates.action ?? rule.action,
      warnSeconds:
        updates.warnSeconds !== undefined
          ? updates.warnSeconds
          : rule.warnSeconds,
    };
    await processApi.setProcessRule(updated);
    await fetchProcessRules();
  };

  const handleDeleteRule = async (processName: string) => {
    await processApi.deleteProcessRule(processName);
    await fetchProcessRules();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "apps", label: "Apps" },
    { key: "websites", label: "Websites" },
    { key: "rules", label: "Rules" },
    { key: "profiles", label: "Profiles" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Pending Classifications */}
      <PendingClassifications
        apps={pendingClassifications?.apps ?? []}
        browserTargets={pendingClassifications?.browserTargets ?? []}
        onClassifyApp={classifyApp}
        onClassifyTarget={classifyTarget}
      />

      {/* Tabs */}
      <div className="flex border-b border-[var(--bg-tertiary)]">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-[var(--accent)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "apps" && (
        <AppsTab
          knownApps={knownApps}
          onUpdate={handleUpdateApp}
          onRefresh={handleRefresh}
        />
      )}
      {activeTab === "websites" && (
        <WebsitesTab
          browserTargets={browserTargets}
          onUpdate={handleUpdateTarget}
        />
      )}
      {activeTab === "rules" && (
        <RulesTab
          processRules={processRules}
          onRuleChange={handleRuleChange}
          onDeleteRule={handleDeleteRule}
        />
      )}
      {activeTab === "profiles" && (
        <ProfilesTab enforcementProfiles={enforcementProfiles} />
      )}
    </div>
  );
}
