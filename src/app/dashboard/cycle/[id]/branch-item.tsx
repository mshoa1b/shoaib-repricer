"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteBranch } from "../../actions";

interface Props {
  exp: any;
  cycleId: string;
  stageId: string;
  totalQty: number;
  totalValue: number;
}

export function BranchItem({ exp, cycleId, stageId, totalQty, totalValue }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm(`Are you sure you want to delete the branch "${exp.branchName}"?`)) {
      setIsDeleting(true);
      await deleteBranch(exp.id, cycleId);
      setIsDeleting(false);
    }
  };

  const modeLabel =
    exp.configurationMode === "mixed"
      ? "Mixed Grades"
      : exp.configurationMode === "separate"
      ? "All Separate"
      : "Premium Separate";

  return (
    <div
      className="card"
      style={{
        background: "rgba(255,255,255,0.03)",
        padding: "1rem 1.5rem",
        border: "1px solid var(--border-subtle)",
        borderRadius: "12px",
      }}
    >
      <div className="flex justify-between items-center">
        {/* Left: name + mode */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <div style={{ fontWeight: 600, color: "var(--accent-primary)", fontSize: "1rem" }}>
            {exp.branchName || "Default Branch"}
          </div>
          <div className="text-secondary" style={{ fontSize: "0.75rem" }}>
            {modeLabel} • {exp.invoiceBoxes.length} Boxes
          </div>
        </div>

        {/* Centre: stats */}
        <div style={{ display: "flex", gap: "2rem", alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: "2px" }}>
              Total Units
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>
              {totalQty.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-secondary)", marginBottom: "2px" }}>
              Stage Value
            </div>
            <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--accent-primary)" }}>
              €{totalValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* Right: actions */}
        <div className="flex gap-2">
          <Link
            href={`/dashboard/cycle/${cycleId}/stage/${stageId}/${exp.id}`}
            className="btn btn-secondary"
            style={{ padding: "0.4rem 1rem", fontSize: "0.8rem", borderRadius: "8px" }}
          >
            Edit Branch
          </Link>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="btn btn-secondary"
            style={{
              padding: "0.4rem 1rem",
              fontSize: "0.8rem",
              borderRadius: "8px",
              color: "#ff4d4f",
              borderColor: "#ff4d4f33",
              background: "rgba(255, 77, 79, 0.05)",
            }}
          >
            {isDeleting ? "..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
