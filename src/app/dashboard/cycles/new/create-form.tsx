"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCycle } from "../../actions";

interface Props {
  groupedBoxes: Record<string, any[]>;
}

export function CreateCycleForm({ groupedBoxes }: Props) {
  const [name, setName] = useState("");
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const totalAvailable = Object.values(groupedBoxes).flat().length;

  const toggleBox = (id: string) => {
    setSelectedBoxIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleIngestion = (boxes: any[]) => {
    const boxIds = boxes.map(b => b.id);
    const allSelected = boxIds.every(id => selectedBoxIds.includes(id));
    
    if (allSelected) {
      setSelectedBoxIds(prev => prev.filter(id => !boxIds.includes(id)));
    } else {
      setSelectedBoxIds(prev => Array.from(new Set([...prev, ...boxIds])));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || selectedBoxIds.length === 0) return;

    setIsSubmitting(true);
    try {
      const id = await createCycle(name, selectedBoxIds);
      router.push(`/dashboard/cycle/${id}`);
    } catch (error) {
      console.error(error);
      alert("Failed to create cycle");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <div className="input-group" style={{ marginBottom: '0' }}>
          <label className="info-label">Cycle Internal Name</label>
          <input 
            type="text" 
            className="input-field" 
            placeholder="e.g. May Distribution - Retailer X"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', marginTop: '0.5rem' }}
          />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Select Boxes ({selectedBoxIds.length} selected)</h2>
        <div className="text-secondary text-sm">
          {totalAvailable} total unassigned boxes available
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {Object.entries(groupedBoxes).map(([ingestionName, boxes]) => {
          const allSelected = boxes.every(b => selectedBoxIds.includes(b.id));
          return (
            <div key={ingestionName} className="card glass-card" style={{ padding: '0', overflow: 'hidden' }}>
              <div 
                style={{ 
                  padding: '1.25rem 1.5rem', 
                  background: 'rgba(255,255,255,0.03)', 
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'white' }}>{ingestionName}</h3>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{boxes.length} available boxes</div>
                </div>
                <button 
                  type="button"
                  className="btn btn-secondary"
                  style={{ 
                    padding: '0.4rem 1rem', 
                    fontSize: '0.75rem', 
                    borderRadius: '8px',
                    borderColor: allSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    background: allSelected ? 'rgba(0,112,243,0.1)' : 'rgba(255,255,255,0.02)'
                  }}
                  onClick={() => toggleIngestion(boxes)}
                >
                  {allSelected ? "Deselect All" : "Select All Batch"}
                </button>
              </div>
              <div style={{ padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                {boxes.map(box => {
                  const isSelected = selectedBoxIds.includes(box.id);
                  return (
                    <div
                      key={box.id}
                      onClick={() => toggleBox(box.id)}
                      style={{ 
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        padding: '1rem',
                        borderRadius: '12px',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                        background: isSelected ? 'rgba(0,112,243,0.1)' : 'rgba(255,255,255,0.02)',
                        cursor: 'pointer',
                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                        position: 'relative',
                        boxShadow: isSelected ? '0 0 20px rgba(0,112,243,0.15)' : 'none'
                      }}
                      className="hover-lift"
                    >
                      <div style={{ 
                        position: 'absolute', 
                        top: '0.75rem', 
                        right: '0.75rem',
                        width: '20px',
                        height: '20px',
                        borderRadius: '6px',
                        border: '1px solid',
                        borderColor: isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)',
                        background: isSelected ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease'
                      }}>
                        {isSelected && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isSelected ? 'white' : 'var(--foreground)' }}>
                        {box.wioNumber}
                      </div>
                      <div style={{ fontSize: '0.7rem', opacity: isSelected ? 0.9 : 0.6, maxWidth: '85%' }}>
                        {box.wioName}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {Object.keys(groupedBoxes).length === 0 && (
          <div className="card text-center py-12 text-secondary">
            No unassigned boxes found. Please upload an ingestion file first.
          </div>
        )}
      </div>

      <div className="flex justify-end gap-4 mt-4">
        <button 
          type="button" 
          className="btn btn-secondary"
          onClick={() => router.back()}
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="btn btn-primary"
          disabled={isSubmitting || !name || selectedBoxIds.length === 0}
        >
          {isSubmitting ? "Creating..." : "Create Cycle & Start Processing"}
        </button>
      </div>
    </form>
  );
}
