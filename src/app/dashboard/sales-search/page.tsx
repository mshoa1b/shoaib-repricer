"use client";

import { useState } from "react";
import { searchSoldItems } from "./actions";

export default function SalesSearchPage() {
  const [saleCategory, setSaleCategory] = useState("CP4 to CP5");
  const [query, setQuery] = useState("");
  const [exactMatch, setExactMatch] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await searchSoldItems(saleCategory, query, exactMatch);
      setResults(data);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Failed to query sales data.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getStageSlug = (category: string) => {
    if (category === "CP2 to CP3") return "cp2-cp3";
    if (category === "CP3 to CP4") return "cp3-cp4";
    return "cp4-cp5";
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '2rem', paddingBottom: '5rem' }}>
      
      {/* Page Title */}
      <div>
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.875rem' }}>Historical Sales Lookup</h1>
        <p className="text-secondary">Search items sold under previous CP branches, ordered by sales date descending.</p>
      </div>

      {/* Search filters card */}
      <div className="card glass-card">
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: '1', minWidth: '220px' }}>
            <label className="info-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Sale Category</label>
            <select
              className="input-field w-full"
              value={saleCategory}
              onChange={(e) => setSaleCategory(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.3)', color: 'white', padding: '0.75rem' }}
            >
              <option value="CP2 to CP3">CP-2 &rarr; CP-3 Stage</option>
              <option value="CP3 to CP4">CP-3 &rarr; CP-4 Stage</option>
              <option value="CP4 to CP5">CP-4 &rarr; CP-5 Stage</option>
            </select>
          </div>

          <div style={{ flex: '2', minWidth: '300px' }}>
            <label className="info-label" style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Search SKU or Item Name</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="e.g. iPhone 15, APB-15-256-B"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.3)', color: 'white', padding: '0.75rem' }}
            />
          </div>

          <div style={{ flex: '1', minWidth: '160px', display: 'flex', alignItems: 'flex-end', paddingBottom: '12px' }}>
            <label className="flex items-center gap-2" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={exactMatch}
                onChange={(e) => setExactMatch(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Exact Match Only</span>
            </label>
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ padding: '0.75rem 2rem', height: '46px' }}
            disabled={loading}
          >
            {loading ? "Searching..." : "Search Sales"}
          </button>
        </form>
      </div>

      {error && (
        <div style={{ color: 'var(--accent-danger)', fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Results table */}
      {searched && !loading && (
        <div className="card glass-card p-0 overflow-hidden">
          <div className="p-6 border-bottom" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 className="text-sm uppercase tracking-wider text-secondary m-0">
              Query Results ({results.length} {results.length === 1 ? 'item' : 'items'} found)
            </h3>
          </div>

          <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
            <table style={{ fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th className="text-center">Date Sold</th>
                  <th className="text-center">Branch Name</th>
                  <th className="text-center">Box</th>
                  <th className="text-center">Item Definition</th>
                  <th className="text-center">SKU</th>
                  <th className="text-center">Grade</th>
                  <th className="text-center">Qty</th>
                  <th className="text-center">Unit Price</th>
                  <th className="text-center">Total Value</th>
                </tr>
              </thead>
              <tbody>
                {results.map((row) => (
                  <tr key={row.id}>
                    <td className="text-center font-mono text-secondary" style={{ fontSize: '0.8rem' }}>
                      {new Date(row.dateSold).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="text-center">
                      <div style={{ fontWeight: 600 }}>{row.branchName}</div>
                      <div className="font-mono text-secondary" style={{ fontSize: '0.7rem' }}>
                        ID: {row.branchId}
                      </div>
                    </td>
                    <td className="text-center font-mono" style={{ fontSize: '0.85rem' }}>
                      {row.wioName}
                    </td>
                    <td style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{row.productName}</div>
                    </td>
                    <td className="text-center font-mono" style={{ fontSize: '0.8rem' }}>
                      {row.sku}
                    </td>
                    <td className="text-center">
                      <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                        {row.grade}
                      </span>
                    </td>
                    <td className="text-center" style={{ fontWeight: 500 }}>
                      {row.qty}
                    </td>
                    <td className="text-center font-mono" style={{ fontWeight: 600 }}>
                      €{row.finalPrice.toFixed(2)}
                    </td>
                    <td className="text-center font-mono" style={{ fontWeight: 700, color: 'var(--accent-success)' }}>
                      €{row.totalValue.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-20 text-secondary">
                      No matching sold items found for the selected category and search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
