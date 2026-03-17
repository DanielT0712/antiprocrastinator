import { useState } from "react";
import { useGuardStore } from "@/stores/guardStore";
import { Modal } from "./Modal";
import { Button } from "./Button";
import { Select } from "./Select";

const suspendOptions = [
  { value: "5", label: "5 minutes" },
  { value: "10", label: "10 minutes" },
  { value: "15", label: "15 minutes" },
  { value: "30", label: "30 minutes" },
  { value: "60", label: "60 minutes" },
];

export function QuitChallengeModal() {
  const quitRequired = useGuardStore((s) => s.quitRequired);
  const confirmQuit = useGuardStore((s) => s.confirmQuit);
  const suspendGuard = useGuardStore((s) => s.suspendGuard);
  const dismissQuitModal = useGuardStore((s) => s.dismissQuitModal);

  const [phrase, setPhrase] = useState("");
  const [suspendMinutes, setSuspendMinutes] = useState("15");

  if (!quitRequired) return null;

  const requiredPhrase = quitRequired.requiredPhrase;
  const isMatch = phrase === requiredPhrase;

  const getCharColor = (index: number) => {
    if (index >= phrase.length) return "";
    return phrase[index] === requiredPhrase[index]
      ? "text-[var(--success)]"
      : "text-[var(--danger)]";
  };

  const handleConfirm = async () => {
    if (!isMatch) return;
    const success = await confirmQuit(phrase);
    if (success) {
      dismissQuitModal();
    }
  };

  const handleSuspend = async () => {
    const success = await suspendGuard(parseInt(suspendMinutes, 10));
    if (success) {
      dismissQuitModal();
    }
  };

  return (
    <Modal open title="Quit Challenge" onClose={dismissQuitModal}>
      <div className="space-y-6">
        <p className="text-sm text-[var(--text-secondary)]">
          {quitRequired.warning}
        </p>

        <div className="space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">
            Type the following phrase to confirm:
          </p>
          <p className="font-mono text-sm bg-[var(--bg-tertiary)] rounded-md px-3 py-2 text-[var(--text-primary)]">
            {requiredPhrase}
          </p>
          <div className="relative">
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              placeholder="Type the phrase above..."
              className="w-full bg-[var(--bg-tertiary)] border border-[var(--bg-tertiary)] rounded-md px-3 py-2 text-sm text-transparent caret-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <div className="absolute inset-0 pointer-events-none px-3 py-2 text-sm font-mono">
              {phrase.split("").map((char, i) => (
                <span key={i} className={getCharColor(i)}>
                  {char}
                </span>
              ))}
            </div>
          </div>
          <Button
            variant="danger"
            size="md"
            disabled={!isMatch}
            onClick={handleConfirm}
            className="w-full"
          >
            Confirm Quit
          </Button>
        </div>

        <div className="border-t border-[var(--bg-tertiary)] pt-4 space-y-3">
          <p className="text-xs text-[var(--text-secondary)]">
            Or suspend the guard temporarily:
          </p>
          <div className="flex items-center gap-2">
            <Select
              options={suspendOptions}
              value={suspendMinutes}
              onChange={setSuspendMinutes}
            />
            <Button variant="secondary" size="md" onClick={handleSuspend}>
              Suspend
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
