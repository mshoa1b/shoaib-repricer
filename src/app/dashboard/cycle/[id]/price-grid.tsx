"use client";

import { useState, useMemo } from "react";

interface PriceRow {
  box: string;
  sku: string;
  productName: string;
  qty: number;
  cp1: number;
  cp3: number;
  cp4: number;
  cp5: number;
}

export function MasterPriceGrid({ data }: { data: PriceRow[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof PriceRow | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filteredData = useMemo(() => {
    let result = data.filter(row => 
      row.box.toLowerCase().includes(search.toLowerCase()) ||
      row.sku.toLowerCase().includes(search.toLowerCase()) ||
      row.productName.toLowerCase().includes(search.toLowerCase())
    );

    if (sortField) {
      result.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === "string" && typeof valB === "string") {
          return sortOrder === "asc" 
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }
        return sortOrder === "asc" 
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      });
    }

    return result;
  }, [data, search, sortField, sortOrder]);

  const toggleSort = (field: keyof PriceRow) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: keyof PriceRow }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px' }}>{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)', marginTop: '2rem' }}>
      <div 
        className="cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Master Price Grid</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
            {data.length} Rows
          </span>
        </div>
        <div style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s ease', fontSize: '0.8rem', opacity: 0.5 }}>
          ▼
        </div>
      </div>

      {isExpanded && (
        <div style={{ padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)', animation: 'fadeIn 0.3s ease' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <input 
              type="text" 
              className="input-field"
              placeholder="Search by Box, SKU, or Product Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', fontSize: '0.875rem', width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
            />
          </div>

          <div className="table-container" style={{ maxHeight: '600px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <th onClick={() => toggleSort("box")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Box <SortIcon field="box" /></th>
                  <th onClick={() => toggleSort("sku")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>SKU <SortIcon field="sku" /></th>
                  <th onClick={() => toggleSort("productName")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Product <SortIcon field="productName" /></th>
                  <th onClick={() => toggleSort("qty")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>Qty <SortIcon field="qty" /></th>
                  <th onClick={() => toggleSort("cp1")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CP-1 <SortIcon field="cp1" /></th>
                  <th onClick={() => toggleSort("cp3")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CP-2 <SortIcon field="cp3" /></th>
                  <th onClick={() => toggleSort("cp4")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CP-3 <SortIcon field="cp4" /></th>
                  <th onClick={() => toggleSort("cp5")} style={{ cursor: 'pointer', textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>CP-4 <SortIcon field="cp5" /></th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem' }}>{row.box}</td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>{row.sku}</td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{row.productName}</td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem' }}>{row.qty}</td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem' }}>€{row.cp1.toFixed(2)}</td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem', color: row.cp3 > row.cp1 ? 'var(--accent-primary)' : 'inherit' }}>
                      €{row.cp3.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem', color: row.cp4 > row.cp3 ? 'var(--accent-primary)' : 'inherit' }}>
                      €{row.cp4.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center', padding: '1.25rem 1rem', fontSize: '0.875rem', color: row.cp5 > row.cp4 ? 'var(--accent-primary)' : 'inherit' }}>
                      €{row.cp5.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      No matching items found.
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
