import { useEffect, useState } from "react";
import { useTaskStore } from "@/stores/taskStore";
import type { Task, NewTask, TaskUpdate, TaskGroup } from "@/types/task";
import { Button } from "../common/Button";
import { Modal } from "../common/Modal";
import { Toggle } from "../common/Toggle";
import { Select } from "../common/Select";

// ---------------------------------------------------------------------------
// Priority helpers
// ---------------------------------------------------------------------------

const priorityConfig: Record<number, { label: string; color: string }> = {
  5: { label: "P5", color: "var(--danger)" },
  4: { label: "P4", color: "var(--warning)" },
  3: { label: "P3", color: "var(--accent)" },
  2: { label: "P2", color: "var(--success)" },
  1: { label: "P1", color: "var(--text-secondary)" },
};

function PriorityBadge({ priority }: { priority: number }) {
  const cfg = priorityConfig[priority] ?? priorityConfig[3];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TaskFormModal
// ---------------------------------------------------------------------------

interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  task: Task | null; // null = create mode
  taskGroups: TaskGroup[];
}

const emptyForm = {
  name: "",
  groupId: null as number | null,
  priority: 3,
  estimatedMinutes: 60 as number | null,
  deadline: null as string | null,
  maxChunkMinutes: 90 as number | null,
  minChunkMinutes: 25 as number | null,
  minimumRestMinutes: 5 as number | null,
  workRatio: 3 as number | null,
  restRatio: 1 as number | null,
  enforcementProfile: "",
  protectGeneratedBlocks: false,
};

function TaskFormModal({ open, onClose, task, taskGroups }: TaskFormModalProps) {
  const { createTask, updateTask, deleteTask, createTaskGroup } =
    useTaskStore();

  const [form, setForm] = useState(emptyForm);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#6366f1");

  // Populate form when modal opens or task changes
  useEffect(() => {
    if (!open) return;
    if (task) {
      setForm({
        name: task.name,
        groupId: task.groupId,
        priority: task.priority,
        estimatedMinutes: task.estimatedMinutes,
        deadline: task.deadline
          ? new Date(task.deadline).toISOString().split("T")[0]
          : null,
        maxChunkMinutes: task.maxChunkMinutes,
        minChunkMinutes: task.minChunkMinutes,
        minimumRestMinutes: task.minimumRestMinutes,
        workRatio: task.workRatio,
        restRatio: task.restRatio,
        enforcementProfile: task.enforcementProfile ?? "",
        protectGeneratedBlocks: task.protectGeneratedBlocks,
      });
    } else {
      setForm(emptyForm);
    }
    setShowNewGroup(false);
  }, [open, task]);

  const set = <K extends keyof typeof emptyForm>(
    key: K,
    value: (typeof emptyForm)[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) return;

    const deadlineTs = form.deadline
      ? new Date(form.deadline).getTime()
      : null;

    if (task) {
      const updates: TaskUpdate = {
        name: form.name,
        groupId: form.groupId,
        priority: form.priority,
        estimatedMinutes: form.estimatedMinutes,
        deadline: deadlineTs,
        maxChunkMinutes: form.maxChunkMinutes,
        minChunkMinutes: form.minChunkMinutes,
        minimumRestMinutes: form.minimumRestMinutes,
        workRatio: form.workRatio,
        restRatio: form.restRatio,
        enforcementProfile: form.enforcementProfile || null,
        protectGeneratedBlocks: form.protectGeneratedBlocks,
      };
      await updateTask(task.id, updates);
    } else {
      const newTask: NewTask = {
        name: form.name,
        groupId: form.groupId,
        priority: form.priority,
        estimatedMinutes: form.estimatedMinutes,
        deadline: deadlineTs,
        maxChunkMinutes: form.maxChunkMinutes,
        minChunkMinutes: form.minChunkMinutes,
        minimumRestMinutes: form.minimumRestMinutes,
        workRatio: form.workRatio,
        restRatio: form.restRatio,
        enforcementProfile: form.enforcementProfile || null,
        protectGeneratedBlocks: form.protectGeneratedBlocks,
      };
      await createTask(newTask);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (task) {
      await deleteTask(task.id);
      onClose();
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    const group = await createTaskGroup(newGroupName.trim(), newGroupColor);
    set("groupId", group.id);
    setShowNewGroup(false);
    setNewGroupName("");
  };

  // Build group select options
  const groupOptions = [
    { value: "", label: "None" },
    ...taskGroups.map((g) => ({ value: String(g.id), label: g.name })),
    { value: "__new__", label: "+ New Group" },
  ];

  const inputClass =
    "w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--bg-tertiary)] rounded-md px-3 py-2 text-sm outline-none focus:border-[var(--accent)] transition-colors";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? "Edit Task" : "New Task"}
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {/* Name */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Name
          </label>
          <input
            className={inputClass}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Task name"
          />
        </div>

        {/* Group */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Group
          </label>
          <Select
            options={groupOptions}
            value={form.groupId != null ? String(form.groupId) : ""}
            onChange={(v) => {
              if (v === "__new__") {
                setShowNewGroup(true);
              } else {
                set("groupId", v ? Number(v) : null);
                setShowNewGroup(false);
              }
            }}
          />
          {showNewGroup && (
            <div className="mt-2 flex items-center gap-2">
              <input
                className={inputClass + " flex-1"}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name"
              />
              <input
                type="color"
                value={newGroupColor}
                onChange={(e) => setNewGroupColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
              />
              <Button size="sm" onClick={handleCreateGroup}>
                Add
              </Button>
            </div>
          )}
        </div>

        {/* Priority */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Priority
          </label>
          <Select
            options={[
              { value: "1", label: "P1 - Lowest" },
              { value: "2", label: "P2 - Low" },
              { value: "3", label: "P3 - Medium" },
              { value: "4", label: "P4 - High" },
              { value: "5", label: "P5 - Critical" },
            ]}
            value={String(form.priority)}
            onChange={(v) => set("priority", Number(v))}
          />
        </div>

        {/* Estimated Minutes */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Estimated Minutes
          </label>
          <input
            type="number"
            className={inputClass}
            value={form.estimatedMinutes ?? ""}
            onChange={(e) =>
              set(
                "estimatedMinutes",
                e.target.value ? Number(e.target.value) : null,
              )
            }
            placeholder="e.g. 30"
          />
        </div>

        {/* Deadline */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Deadline
          </label>
          <input
            type="date"
            className={inputClass}
            value={form.deadline ?? ""}
            onChange={(e) => set("deadline", e.target.value || null)}
          />
        </div>

        {/* Chunk settings row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Max Chunk (min)
            </label>
            <input
              type="number"
              className={inputClass}
              value={form.maxChunkMinutes ?? ""}
              onChange={(e) =>
                set(
                  "maxChunkMinutes",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Min Chunk (min)
            </label>
            <input
              type="number"
              className={inputClass}
              value={form.minChunkMinutes ?? ""}
              onChange={(e) =>
                set(
                  "minChunkMinutes",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
        </div>

        {/* Rest */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Minimum Rest (min)
          </label>
          <input
            type="number"
            className={inputClass}
            value={form.minimumRestMinutes ?? ""}
            onChange={(e) =>
              set(
                "minimumRestMinutes",
                e.target.value ? Number(e.target.value) : null,
              )
            }
          />
        </div>

        {/* Ratios row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Work Ratio
            </label>
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={form.workRatio ?? ""}
              onChange={(e) =>
                set(
                  "workRatio",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-secondary)] mb-1">
              Rest Ratio
            </label>
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={form.restRatio ?? ""}
              onChange={(e) =>
                set(
                  "restRatio",
                  e.target.value ? Number(e.target.value) : null,
                )
              }
            />
          </div>
        </div>

        {/* Enforcement Profile */}
        <div>
          <label className="block text-xs text-[var(--text-secondary)] mb-1">
            Enforcement Profile
          </label>
          <input
            className={inputClass}
            value={form.enforcementProfile}
            onChange={(e) => set("enforcementProfile", e.target.value)}
            placeholder="e.g. strict"
          />
        </div>

        {/* Protect Generated Blocks */}
        <div className="flex items-center justify-between">
          <label className="text-sm text-[var(--text-primary)]">
            Protect Generated Blocks
          </label>
          <Toggle
            checked={form.protectGeneratedBlocks}
            onChange={(v) => set("protectGeneratedBlocks", v)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-[var(--bg-tertiary)]">
        <div>
          {task && (
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Delete
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {task ? "Save" : "Create"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// TasksPage
// ---------------------------------------------------------------------------

export function TasksPage() {
  const { tasks, taskGroups, fetchTasks, fetchTaskGroups, searchTasks } =
    useTaskStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
    fetchTaskGroups();
  }, [fetchTasks, fetchTaskGroups]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() === "") {
      fetchTasks();
    } else {
      searchTasks(query);
    }
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openCreate = () => {
    setEditingTask(null);
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  // Group tasks
  const groupedTasks = new Map<number | null, Task[]>();
  for (const t of tasks) {
    const key = t.groupId;
    if (!groupedTasks.has(key)) groupedTasks.set(key, []);
    groupedTasks.get(key)!.push(t);
  }

  // Ordered sections: groups first, then ungrouped
  const sections: { key: string; label: string; color: string; tasks: Task[] }[] =
    [];
  for (const group of taskGroups) {
    const groupTasks = groupedTasks.get(group.id) ?? [];
    if (groupTasks.length > 0) {
      sections.push({
        key: String(group.id),
        label: group.name,
        color: group.color ?? "#6b7280",
        tasks: groupTasks,
      });
    }
  }
  const ungrouped = groupedTasks.get(null) ?? [];
  if (ungrouped.length > 0) {
    sections.push({
      key: "__ungrouped__",
      label: "Ungrouped",
      color: "#6b7280",
      tasks: ungrouped,
    });
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          TASKS
        </h1>
        <Button onClick={openCreate}>+ New Task</Button>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          className="w-full bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-lg px-4 py-2 pl-10 text-sm outline-none placeholder:text-[var(--text-secondary)] focus:ring-1 focus:ring-[var(--accent)]"
          placeholder="Search tasks..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Task list grouped */}
      <div className="space-y-4">
        {sections.map((section) => {
          const collapsed = collapsedGroups.has(section.key);
          return (
            <div key={section.key}>
              {/* Group header */}
              <button
                className="flex items-center gap-2 w-full text-left py-2 group"
                onClick={() => toggleGroup(section.key)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: section.color }}
                />
                <span className="text-sm font-medium text-[var(--text-primary)] flex-1">
                  {section.label}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  {section.tasks.length}
                </span>
                <svg
                  className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${
                    collapsed ? "" : "rotate-90"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Tasks */}
              {!collapsed && (
                <div className="space-y-1 mt-1">
                  {section.tasks.map((task) => (
                    <div
                      key={task.id}
                      className="bg-[var(--bg-secondary)] rounded-lg px-4 py-3 hover:bg-[var(--bg-tertiary)] cursor-pointer flex items-center gap-3 transition-colors"
                      onClick={() => openEdit(task)}
                    >
                      <span className="flex-1 text-sm text-[var(--text-primary)] truncate">
                        {task.name}
                      </span>
                      <PriorityBadge priority={task.priority} />
                      {task.estimatedMinutes != null && (
                        <span className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                          {task.estimatedMinutes}m
                        </span>
                      )}
                      {task.completionCount > 0 && (
                        <span className="text-xs text-[var(--text-secondary)]">
                          x{task.completionCount}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {sections.length === 0 && (
          <div className="text-center py-12 text-[var(--text-secondary)] text-sm">
            No tasks yet. Create one to get started.
          </div>
        )}
      </div>

      {/* Modal */}
      <TaskFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        task={editingTask}
        taskGroups={taskGroups}
      />
    </div>
  );
}
