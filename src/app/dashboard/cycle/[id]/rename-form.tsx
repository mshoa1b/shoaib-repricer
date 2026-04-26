"use client";

import { useState } from "react";
import { renameCycle } from "../../actions";

export function RenameCycleForm({ id, initialName }: { id: string, initialName: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await renameCycle(id, name);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2 items-center">
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
    <div className="flex gap-4 items-center mb-2">
      <h1 className="mb-0">{initialName}</h1>
      <button 
        onClick={() => setIsEditing(true)} 
        className="text-secondary hover:text-primary text-sm"
        style={{ background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
      >
        Rename
      </button>
    </div>
  );
}
