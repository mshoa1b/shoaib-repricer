"use client";

import { useState } from "react";
import Link from "next/link";
import { DeleteIngestionButton } from "./delete-ingestion-button";
import { getMoreIngestions } from "./actions";

export function IngestionsList({ initialIngestions, totalCount }: { initialIngestions: any[], totalCount: number }) {
  const [ingestions, setIngestions] = useState(initialIngestions);
  const [loading, setLoading] = useState(false);

  const loadMore = async () => {
    setLoading(true);
    try {
      const more = await getMoreIngestions(ingestions.length, 3);
      setIngestions([...ingestions, ...more]);
    } finally {
      setLoading(false);
    }
  };

  const hasMore = ingestions.length < totalCount;

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div className="table-container" style={{ border: 'none' }}>
        <table>
          <thead>
            <tr>
              <th>Batch ID</th>
              <th>Source Name</th>
              <th>Date Uploaded</th>
              <th className="text-center">Total Boxes</th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {ingestions.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '4rem 0' }} className="text-secondary italic">
                  No ingestion batches found. Upload a file to start.
                </td>
              </tr>
            ) : (
              ingestions.map((ing: any) => (
                <tr key={ing.id}>
                  <td className="text-sm text-secondary font-mono">{ing.id.slice(-6)}</td>
                  <td style={{ fontWeight: 500 }}>{ing.name}</td>
                  <td>{new Date(ing.createdAt).toLocaleString()}</td>
                  <td className="text-center">{ing._count?.boxes || 0}</td>
                  <td className="text-center">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                      <Link href={`/dashboard/ingestion/${ing.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                        View Boxes
                      </Link>
                      <DeleteIngestionButton id={ing.id} isUsed={ing.isUsed} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {ingestions.length > 0 && (
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
