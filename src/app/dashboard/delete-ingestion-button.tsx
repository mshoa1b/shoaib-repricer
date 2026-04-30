"use client";

import { useState } from "react";
import { deleteIngestion } from "./actions";

export function DeleteIngestionButton({ id, isUsed }: { id: string, isUsed: boolean }) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (isUsed) return null;

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this ingestion? All its boxes and items will be permanently removed.")) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteIngestion(id);
      if (!result.success) {
        alert(result.error);
      }
    } catch (error) {
      console.error("Delete failed", error);
      alert("Failed to delete ingestion");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button 
      onClick={handleDelete}
      disabled={isDeleting}
      className="btn"
      style={{ 
        padding: '0.4rem', 
        fontSize: '0.75rem', 
        color: 'var(--accent-danger)', 
        background: 'none',
        border: 'none',
        marginLeft: '0.5rem'
      }}
      title="Delete Ingestion"
    >
      {isDeleting ? "..." : "🗑️"}
    </button>
  );
}
