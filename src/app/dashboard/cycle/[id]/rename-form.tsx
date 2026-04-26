"use client";

import { useState } from "react";
import { renameCycle, deleteCycle } from "../../actions";
import { useRouter } from "next/navigation";

export function RenameCycleForm({ id, initialName }: { id: string, initialName: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await renameCycle(id, name);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this cycle? This will remove all pricing branches, but starting points (boxes) will remain available for new cycles.")) {
      setIsDeleting(true);
      await deleteCycle(id);
      router.push("/dashboard");
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2 items-center mb-6">
        <input 
          className="input-field" 
          value={name} 
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{ fontSize: '1.5rem', fontWeight: 600, padding: '0.25rem 0.5rem' }}
        />
        <button type="submit" className="btn btn-primary">Save</button>
        <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
      </form>
    );
  }

  return (
    <div className="flex justify-between items-center mb-6">
      <div className="flex gap-4 items-center">
        <h1 className="mb-0">{initialName}</h1>
        <button 
          onClick={() => setIsEditing(true)} 
          className="text-secondary hover:text-primary text-sm"
          style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
        >
          Rename
        </button>
      </div>
      
      <button 
        onClick={handleDelete}
        disabled={isDeleting}
        className="btn btn-secondary"
        style={{ 
          color: '#ff4d4f', 
          borderColor: '#ff4d4f22', 
          background: 'rgba(255, 77, 79, 0.05)',
          padding: '0.5rem 1rem',
          fontSize: '0.75rem'
        }}
      >
        {isDeleting ? "Deleting..." : "Delete Entire Cycle"}
      </button>
    </div>
  );
}
