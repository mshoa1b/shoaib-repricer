"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteBranch } from "../../actions";

interface Props {
  exp: any;
  cycleId: string;
  stageId: string;
}

export function BranchItem({ exp, cycleId, stageId }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.confirm(`Are you sure you want to delete the branch "${exp.branchName}"?`)) {
      setIsDeleting(true);
      await deleteBranch(exp.id, cycleId);
      setIsDeleting(false);
    }
  };

  return (
    <div className="card" style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem 1.5rem', border: '1px solid var(--border-subtle)', borderRadius: '12px' }}>
      <div className="flex justify-between items-center">
        <div>
          <div style={{ fontWeight: 600, color: 'var(--accent-primary)', fontSize: '1rem' }}>
            {exp.branchName || "Default Branch"}
          </div>
          <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            {exp.configurationMode === 'mixed' ? 'Mixed Grades' : exp.configurationMode === 'separate' ? 'All Separate' : 'Premium Separate'} • {exp.invoiceBoxes.length} Boxes
          </div>
        </div>
        <div className="flex gap-2">
          <Link 
            href={`/dashboard/cycle/${cycleId}/stage/${stageId}/${exp.id}`} 
            className="btn btn-secondary" 
            style={{ padding: '0.4rem 1rem', fontSize: '0.8rem', borderRadius: '8px' }}
          >
            Edit Branch
          </Link>
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="btn btn-secondary"
            style={{ 
              padding: '0.4rem 1rem', 
              fontSize: '0.8rem', 
              borderRadius: '8px', 
              color: '#ff4d4f', 
              borderColor: '#ff4d4f33',
              background: 'rgba(255, 77, 79, 0.05)'
            }}
          >
            {isDeleting ? "..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
