import { useEffect, useState } from "react";
import { useProcessStore } from "@/stores/processStore";
import * as processApi from "@/api/processes";
import type {
  ProcessAction,
  ProcessInfo,
  ProcessRule,
} from "@/types/process";
import { Button } from "../common/Button";
import { Select } from "../common/Select";
import { Badge } from "../common/Badge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Tab = "running" | "rules" | "categories" | "status";

const processActionOptions = [
  { value: "always_block", label: "Always Block" },
  { value: "block_during_work", label: "Block During Work" },
  { value: "allow_during_break", label: "Allow During Break" },
  { value: "warn", label: "Warn" },
  { value: "always_allow", label: "Always Allow" },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// System / background processes to hide by default.
// Matches case-insensitively against the process name.
const SYSTEM_PROCESS_PATTERNS = [
  // macOS system
  /^com\./,
  /^kernel/i,
  /^launchd/i,
  /^syslog/i,
  /^mds/i,
  /^mdworker/i,
  /^spotlight/i,
  /^coreaudio/i,
  /^coreservices/i,
  /^windowserver/i,
  /^systemui/i,
  /^loginwindow/i,
  /^opendirectory/i,
  /^notif/i,
  /^cfpref/i,
  /^distnote/i,
  /^usernotif/i,
  /^corebrightness/i,
  /^airplay/i,
  /^bluetoothd/i,
  /^bluetoothaudio/i,
  /^audio/i,
  /^trustd/i,
  /^securityd/i,
  /^apsd/i,
  /^dasd/i,
  /^endpointsecurityd/i,
  /^fseventsd/i,
  /^symptomsd/i,
  /^rapportd/i,
  /^timed/i,
  /^configd/i,
  /^powerd/i,
  /^thermalmonitord/i,
  /^logd/i,
  /^diagnosticd/i,
  /^remoted/i,
  /^diskarbitrationd/i,
  /^contextstored/i,
  /^usernoted/i,
  /^watchdogd/i,
  /^sandboxd/i,
  /^containermanager/i,
  /^corespeech/i,
  /^hidd/i,
  /^filecoordination/i,
  /^iconservices/i,
  /^askpermission/i,
  /^sharingd/i,
  /^siriknowledge/i,
  /^translationd/i,
  /^biome/i,
  /^knowledge/i,
  /^duet/i,
  /^intelligenceplatform/i,
  /^cloudd/i,
  /^nsurlsession/i,
  /^networkserviceproxy/i,
  /^symptom/i,
  /^lsd$/i,
  /^pbs$/i,
  /^gpuinfo/i,
  /agent$/i,
  /helper$/i,
  /^cron/i,
  /^sshd/i,
  /^ntpd/i,
  /^resolved/i,
  /^taskgated/i,
  /^runningboard/i,
  /^nearbyd/i,
  /^wifip2pd/i,
  /^wirelessprox/i,
  /^identityservices/i,
  /^mediaremote/i,
  /^mediaanalysisd/i,
  /^photolibraryd/i,
  /^callservices/i,
  // Linux system
  /^systemd/i,
  /^kworker/i,
  /^kthread/i,
  /^ksoftirq/i,
  /^rcu_/i,
  /^irq\//i,
  /^migration/i,
  /^dbus/i,
  /^polkitd/i,
  /^udevd/i,
  /^snapd/i,
  /^networkmanager/i,
  /^wpa_supplicant/i,
  /^avahi/i,
  /^cupsd/i,
  /^gdm/i,
  // Generic daemon patterns
  /d$/i,  // Catch remaining *d daemon processes — aggressive, behind toggle
];

// Well-known user apps that should always pass through even if they match a pattern
const USER_APP_ALLOWLIST = new Set([
  "discord",
  "telegram",
  "whatsapp",
  "signal",
  "slack",
  "spotify",
  "steam",
  "firefox",
  "safari",
  "google chrome",
  "microsoft edge",
  "arc",
  "brave browser",
  "vlc",
  "iina",
  "iterm2",
  "terminal",
  "warp",
  "alacritty",
  "kitty",
  "visual studio code",
  "code",
  "cursor",
  "xcode",
  "figma",
  "notion",
  "obsidian",
  "zoom",
  "teams",
  "finder",
  "preview",
  "mail",
  "messages",
  "calendar",
  "notes",
  "pages",
  "numbers",
  "keynote",
  "photos",
  "music",
  "podcasts",
  "tv",
  "news",
  "maps",
  "facetime",
  "books",
  "reminders",
  "weather",
  "stocks",
  "home",
]);

function isLikelyUserApp(p: ProcessInfo): boolean {
  const name = p.name.toLowerCase();

  // Always show allowlisted apps
  if (USER_APP_ALLOWLIST.has(name)) return true;

  // Apps with a .app path are user apps
  if (p.exePath?.includes(".app/")) return true;

  // Anything in /Applications is a user app
  if (p.exePath?.startsWith("/Applications/")) return true;
  if (p.exePath?.startsWith("/System/Applications/")) return true;

  // Filter out system processes
  for (const pattern of SYSTEM_PROCESS_PATTERNS) {
    if (pattern.test(name)) return false;
  }

  // If it has no exe path, it's probably a kernel thread
  if (!p.exePath) return false;

  // System paths
  if (p.exePath.startsWith("/usr/") || p.exePath.startsWith("/sbin/")) return false;
  if (p.exePath.startsWith("/System/Library/")) return false;
  if (p.exePath.startsWith("/Library/Apple/")) return false;

  return true;
}

// ---------------------------------------------------------------------------
// Tab: Running Processes
// ---------------------------------------------------------------------------

function RunningProcessesTab({
  processes,
  processRules,
  onAddRule,
  onRefresh,
}: {
  processes: ProcessInfo[];
  processRules: ProcessRule[];
  onAddRule: (name: string, action: ProcessAction) => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [showSystem, setShowSystem] = useState(false);

  const ruleNames = new Set(
    processRules.map((r) => r.processName.toLowerCase()),
  );

  const filtered = processes
    .filter((p) => showSystem || isLikelyUserApp(p))
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  // Deduplicate by name (multiple PIDs for same process)
  const uniqueByName = new Map<string, ProcessInfo[]>();
  for (const p of filtered) {
    const key = p.name.toLowerCase();
    const existing = uniqueByName.get(key);
    if (existing) {
      existing.push(p);
    } else {
      uniqueByName.set(key, [p]);
    }
  }

  const sorted = Array.from(uniqueByName.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const totalUnique = (() => {
    const names = new Set<string>();
    for (const p of processes) names.add(p.name.toLowerCase());
    return names.size;
  })();

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search processes..."
          className="flex-1 rounded-md bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          onClick={() => setShowSystem(!showSystem)}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            showSystem
              ? "bg-[var(--accent)]/20 text-[var(--accent)]"
              : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
          }`}
        >
          {showSystem ? "Hide System" : "Show All"}
        </button>
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <p className="text-xs text-[var(--text-secondary)]">
        Showing {uniqueByName.size} of {totalUnique} unique processes
        {!showSystem && " (system processes hidden)"}
      </p>
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {sorted.map(([key, procs]) => {
          const hasRule = ruleNames.has(key);
          return (
            <div
              key={key}
              className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-4 py-2"
            >
              <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                {procs[0].name}
              </span>
              {procs.length > 1 && (
                <span className="text-xs text-[var(--text-secondary)]">
                  x{procs.length}
                </span>
              )}
              <span className="text-xs text-[var(--text-secondary)] w-16 text-right">
                {formatBytes(
                  procs.reduce((sum, p) => sum + p.memoryBytes, 0),
                )}
              </span>
              {hasRule ? (
                <span className="text-xs text-[var(--text-secondary)] w-20 text-right">
                  Has rule
                </span>
              ) : (
                <Select
                  options={[
                    { value: "", label: "Add rule..." },
                    ...processActionOptions,
                  ]}
                  value=""
                  onChange={(v) => {
                    if (v) onAddRule(procs[0].name, v as ProcessAction);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
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
  onRefetch,
}: {
  processRules: ProcessRule[];
  onRuleChange: (
    rule: ProcessRule,
    updates: { action?: ProcessAction; warnSeconds?: number | null },
  ) => void;
  onDeleteRule: (processName: string) => void;
  onRefetch: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newAction, setNewAction] = useState<ProcessAction>("block_during_work");

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const now = Date.now();
    await processApi.setProcessRule({
      processName: newName.trim(),
      category: null,
      action: newAction,
      warnSeconds: null,
      createdAt: now,
      updatedAt: now,
    });
    setNewName("");
    onRefetch();
  };

  return (
    <div className="space-y-3">
      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Process name..."
          className="flex-1 rounded-md bg-[var(--bg-tertiary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--accent)]"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Select
          options={processActionOptions}
          value={newAction}
          onChange={(v) => setNewAction(v as ProcessAction)}
        />
        <Button variant="primary" size="sm" onClick={handleAdd}>
          Add
        </Button>
      </div>

      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {processRules.map((rule) => (
          <div
            key={rule.processName}
            className="flex items-center gap-3 bg-[var(--bg-secondary)] rounded-lg px-4 py-3"
          >
            <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
              {rule.processName}
            </span>
            {rule.category && (
              <span className="text-xs text-[var(--text-secondary)]">
                {rule.category}
              </span>
            )}
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
            No process rules configured. Add one above or use the Running tab to
            create rules from detected processes.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Categories
// ---------------------------------------------------------------------------

function CategoriesTab() {
  const categories = useProcessStore((s) => s.processCategories);

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">
        Built-in process categories. Processes matching these names are
        automatically enforced even without explicit rules.
      </p>
      <div className="space-y-3">
        {categories.map((cat) => (
          <div
            key={cat.name}
            className="bg-[var(--bg-secondary)] rounded-lg p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {cat.name}
              </span>
              <Badge
                variant={
                  cat.defaultAction === "always_block"
                    ? "work"
                    : cat.defaultAction === "block_during_work"
                      ? "work"
                      : cat.defaultAction === "allow_during_break"
                        ? "break"
                        : cat.defaultAction === "warn"
                          ? "custom"
                          : "break"
                }
              >
                {cat.defaultAction.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1">
              {cat.processNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex rounded-full bg-[var(--bg-tertiary)] px-2.5 py-0.5 text-xs text-[var(--text-secondary)]"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Enforcement Status
// ---------------------------------------------------------------------------

function StatusTab() {
  const enforcementStatus = useProcessStore((s) => s.enforcementStatus);
  const fetchEnforcementStatus = useProcessStore(
    (s) => s.fetchEnforcementStatus,
  );

  if (!enforcementStatus) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-[var(--text-secondary)]">
          Loading enforcement status...
        </p>
        <Button
          variant="secondary"
          className="mt-2"
          onClick={fetchEnforcementStatus}
        >
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={fetchEnforcementStatus}
        >
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[var(--bg-secondary)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">Last Scan</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
            {enforcementStatus.lastScanAt
              ? new Date(enforcementStatus.lastScanAt).toLocaleTimeString()
              : "Never"}
          </p>
        </div>
        <div className="rounded-lg bg-[var(--bg-secondary)] p-4">
          <p className="text-xs text-[var(--text-secondary)]">
            Active Block Type
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
            {enforcementStatus.activeBlockType ?? "None"}
          </p>
        </div>
      </div>

      {enforcementStatus.warnings.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Active Warnings
          </span>
          {enforcementStatus.warnings.map((w) => (
            <div
              key={w.processName}
              className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2"
            >
              <span className="flex-1 text-sm text-[var(--text-primary)]">
                {w.processName}
              </span>
              <span className="text-sm font-mono text-amber-400">
                {w.secondsUntilKill}s
              </span>
            </div>
          ))}
        </div>
      )}

      {enforcementStatus.lastKilledProcesses.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--danger)]">
            Recently Killed
          </span>
          {enforcementStatus.lastKilledProcesses.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2"
            >
              <span className="text-sm text-[var(--text-primary)]">
                {name}
              </span>
            </div>
          ))}
        </div>
      )}

      {enforcementStatus.warnings.length === 0 &&
        enforcementStatus.lastKilledProcesses.length === 0 && (
          <p className="text-center text-sm text-[var(--text-secondary)] py-4">
            No active warnings or recent kills.
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
    runningProcesses,
    processRules,
    fetchRunningProcesses,
    fetchProcessRules,
    fetchProcessCategories,
    fetchEnforcementStatus,
  } = useProcessStore();

  const [activeTab, setActiveTab] = useState<Tab>("running");

  useEffect(() => {
    fetchRunningProcesses();
    fetchProcessRules();
    fetchProcessCategories();
    fetchEnforcementStatus();
  }, [
    fetchRunningProcesses,
    fetchProcessRules,
    fetchProcessCategories,
    fetchEnforcementStatus,
  ]);

  const handleAddRule = async (name: string, action: ProcessAction) => {
    const now = Date.now();
    await processApi.setProcessRule({
      processName: name,
      category: null,
      action,
      warnSeconds: null,
      createdAt: now,
      updatedAt: now,
    });
    await fetchProcessRules();
  };

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
    { key: "running", label: "Running" },
    { key: "rules", label: "Rules" },
    { key: "categories", label: "Categories" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="p-6 space-y-6">
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
      {activeTab === "running" && (
        <RunningProcessesTab
          processes={runningProcesses}
          processRules={processRules}
          onAddRule={handleAddRule}
          onRefresh={fetchRunningProcesses}
        />
      )}
      {activeTab === "rules" && (
        <RulesTab
          processRules={processRules}
          onRuleChange={handleRuleChange}
          onDeleteRule={handleDeleteRule}
          onRefetch={fetchProcessRules}
        />
      )}
      {activeTab === "categories" && <CategoriesTab />}
      {activeTab === "status" && <StatusTab />}
    </div>
  );
}
