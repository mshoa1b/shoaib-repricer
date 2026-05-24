"use client";

import { useState } from "react";
import Link from "next/link";
import { getMoreCycles } from "./actions";

export function CyclesList({ initialCycles, totalCount }: { initialCycles: any[], totalCount: number }) {
  const [cycles, setCycles] = useState(initialCycles);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    setLoading(true);
    try {
      const more = await getMoreCycles(cycles.length, 3);
      setCycles([...cycles, ...more]);
    } finally {
      setLoading(false);
    }
  };

  const hasMore = cycles.length < totalCount;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div className="table-container" style={{ border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>Cycle ID</th>
              <th>Internal Name</th>
              <th>Created Date</th>
              <th className="text-center">Assigned Boxes</th>
              <th>Status</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '4rem 0' }} className="text-secondary italic">
                  No active cycles. Click "Create New Cycle" to begin processing boxes.
                </td>
              </tr>
            ) : (
              cycles.map((cycle: any) => (
                <tr key={cycle.id}>
                  <td className="text-sm text-secondary font-mono">{cycle.id.slice(-6)}</td>
                  <td style={{ fontWeight: 500 }}>{cycle.name}</td>
                  <td>{new Date(cycle.createdAt).toLocaleDateString()}</td>
                  <td className="text-center">{cycle._count?.boxes || 0}</td>
                  <td>
                    <span style={{
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: 'var(--accent-success)',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}>
                      {cycle.status}
                    </span>
                  </td>
                  <td className="text-center">
                    <Link href={`/dashboard/cycle/${cycle.id}`} className="btn btn-secondary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}>
                      Manage Pipeline
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {cycles.length > 0 && (
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          {hasMore ? (
            <button 
              onClick={loadMore} 
              disabled={loading}
              className="btn btn-secondary"
              style={{ padding: '0.5rem 2rem' }}
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          ) : (
            <span className="text-secondary italic" style={{ fontSize: '0.875rem' }}>
              All records loaded.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
