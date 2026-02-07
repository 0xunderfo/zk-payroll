"use client";

import { useState, useCallback } from "react";

const MAX_RECIPIENTS = 5;

interface PayrollEntry {
  address: string;
  amount: string;
}

interface PayrollFormProps {
  onPayrollReady: (data: {
    recipients: string[];
    amounts: string[];
    total: string;
  }) => void;
}

export function PayrollForm({ onPayrollReady }: PayrollFormProps) {
  const [entries, setEntries] = useState<PayrollEntry[]>([
    { address: "", amount: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const addEntry = () => {
    if (entries.length >= MAX_RECIPIENTS) {
      setError(`Maximum ${MAX_RECIPIENTS} recipients allowed`);
      return;
    }
    setEntries([...entries, { address: "", amount: "" }]);
  };

  const removeEntry = (index: number) => {
    if (entries.length > 1) {
      setEntries(entries.filter((_, i) => i !== index));
      setError(null);
    }
  };

  const updateEntry = (index: number, field: keyof PayrollEntry, value: string) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    setEntries(newEntries);
    setError(null);
  };

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.trim().split("\n");
        const newEntries: PayrollEntry[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          if (i === 0 && (line.toLowerCase().includes("address") || line.toLowerCase().includes("amount"))) {
            continue;
          }

          const [address, amount] = line.split(",").map((s) => s.trim());
          if (address && amount) {
            newEntries.push({ address, amount });
          }
        }

        if (newEntries.length === 0) {
          setError("No valid entries found in CSV");
          return;
        }

        if (newEntries.length > MAX_RECIPIENTS) {
          setError(`CSV has ${newEntries.length} entries. Maximum is ${MAX_RECIPIENTS}.`);
          return;
        }

        setEntries(newEntries);
        setError(null);
      } catch (err) {
        setError("Failed to parse CSV file");
      }
    };
    reader.readAsText(file);
  }, []);

  const calculateTotal = () => {
    return entries.reduce((sum, entry) => {
      const amount = parseFloat(entry.amount) || 0;
      return sum + amount;
    }, 0);
  };

  const handleSubmit = () => {
    const validEntries = entries.filter(
      (e) => e.address.length === 42 && e.address.startsWith("0x") && parseFloat(e.amount) > 0
    );

    if (validEntries.length === 0) {
      setError("Please add at least one valid recipient");
      return;
    }

    if (validEntries.length !== entries.length) {
      setError("Some entries are invalid. Check addresses and amounts.");
      return;
    }

    const recipients = validEntries.map((e) => e.address);
    const amounts = validEntries.map((e) => e.amount);
    const total = calculateTotal().toFixed(6);

    onPayrollReady({ recipients, amounts, total });
  };

  return (
    <div className="space-y-4">
      {/* CSV Upload */}
      <div className="border border-dashed border-white/[0.1] rounded-xl p-6 text-center hover:border-zk-accent/30 transition-colors cursor-pointer group">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="hidden"
          id="csv-upload"
        />
        <label htmlFor="csv-upload" className="cursor-pointer">
          <div className="flex flex-col items-center gap-2">
            <svg className="w-8 h-8 text-zk-dim group-hover:text-zk-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-zk-text text-sm font-medium">Upload CSV file</p>
            <p className="text-zk-dim text-xs">Format: address,amount (max {MAX_RECIPIENTS} recipients)</p>
          </div>
        </label>
      </div>

      <div className="text-center text-zk-dim text-sm">or enter manually</div>

      {/* Manual Entry */}
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <div key={index} className="flex gap-3 items-center">
            <input
              type="text"
              placeholder="0x..."
              value={entry.address}
              onChange={(e) => updateEntry(index, "address", e.target.value)}
              className="flex-1 bg-zk-inset border border-white/[0.06] rounded-lg px-4 py-2.5 text-zk-text font-display text-sm placeholder-zk-dim focus:outline-none focus:border-zk-accent/50 transition-colors"
            />
            <input
              type="number"
              placeholder="Amount"
              value={entry.amount}
              onChange={(e) => updateEntry(index, "amount", e.target.value)}
              className="w-32 bg-zk-inset border border-white/[0.06] rounded-lg px-4 py-2.5 text-zk-text text-sm placeholder-zk-dim focus:outline-none focus:border-zk-accent/50 transition-colors tabular-nums"
            />
            <span className="text-zk-dim text-sm font-display">USDT</span>
            {entries.length > 1 && (
              <button onClick={() => removeEntry(index)} className="p-2 text-zk-dim hover:text-red-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {entries.length < MAX_RECIPIENTS && (
        <button
          onClick={addEntry}
          className="w-full py-2.5 border border-white/[0.06] rounded-lg text-zk-muted hover:border-white/[0.1] hover:text-zk-text transition-all text-sm"
        >
          + Add Recipient ({entries.length}/{MAX_RECIPIENTS})
        </button>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Summary and Submit */}
      <div className="flex items-center justify-between pt-4 border-t border-white/[0.06]">
        <div>
          <p className="text-zk-dim text-xs uppercase tracking-wider font-display">Total</p>
          <p className="text-2xl font-bold font-display tabular-nums">{calculateTotal().toFixed(2)} <span className="text-zk-muted text-lg">USDT</span></p>
        </div>
        <button
          onClick={handleSubmit}
          className="py-3 px-6 bg-zk-accent hover:bg-zk-accent-hover text-zk-bg rounded-xl font-semibold transition-all hover:-translate-y-px text-sm"
        >
          Prepare Payroll
        </button>
      </div>
    </div>
  );
}
