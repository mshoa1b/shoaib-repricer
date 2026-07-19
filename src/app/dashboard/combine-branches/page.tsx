"use client";

import { useState, useMemo, Fragment } from "react";
import { fetchBranchesForCombination, updateCombinedBranchOverrides } from "./actions";
import * as xlsx from "xlsx";

function determineGrade(sku: string): string {
  const upperSku = sku.toUpperCase();
  const firstPart = upperSku.split("-")[0] || "";
  if (upperSku.endsWith("-P") || upperSku.includes("PR-") || firstPart.includes("PPR")) return "Premium";
  if (upperSku.endsWith("-A")) return "A Grade";
  if (upperSku.endsWith("-G")) return "G Grade";
  if (upperSku.endsWith("-B")) return "B Grade";
  return "Unknown";
}

export default function CombineBranchesPage() {
  const [branchIdsInput, setBranchIdsInput] = useState("");
  const [loadedBranchIds, setLoadedBranchIds] = useState<string[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [allItems, setAllItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [configMode, setConfigMode] = useState("separate");
  const [enableDeviceGrouping, setEnableDeviceGrouping] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [rowOverrides, setRowOverrides] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [sortField, setSortField] = useState<string | null>("productName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleLoadBranches = async (e: React.FormEvent) => {
    e.preventDefault();
    const ids = branchIdsInput
      .split(/[\s,]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (ids.length === 0) {
      setError("Please enter at least one valid Branch ID.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await fetchBranchesForCombination(ids);
      setBranches(data.branches);
      setAllItems(data.allItems);
      setLoadedBranchIds(ids);

      // Populate initial overrides from branch calculations
      const overrides: Record<string, number> = {};
      // In combined mode, we'll track active overrides
      setRowOverrides(overrides);
    } catch (err) {
      console.error(err);
      setError((err as Error).message || "Failed to load branch data.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOverride = async (key: string, val: number) => {
    const newOverrides = { ...rowOverrides, [key]: val };
    setRowOverrides(newOverrides);
    setIsSaving(true);

    try {
      const matchingItems = allItems.filter(item => {
        if (configMode === "mixed") return item.productName === key;
        return item.sku === key;
      });

      const updates = matchingItems.map(item => ({
        sku: item.sku,
        productName: item.productName,
        grade: item.grade,
        price: val
      }));

      await updateCombinedBranchOverrides(loadedBranchIds, updates);
      
      // Update allItems locally to reflect the override
      setAllItems(prev => prev.map(item => {
        const matches = configMode === "mixed" ? item.productName === key : item.sku === key;
        if (matches) {
          return { ...item, finalPrice: val };
        }
        return item;
      }));
    } catch (err) {
      console.error("Failed to save overrides:", err);
      alert("Error saving overrides: " + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const aggregatedItems = useMemo(() => {
    const groups: Record<string, { productName: string, sku: string, qty: number, totalPrice: number, originalTotalPrice: number, grades: Set<string> }> = {};

    allItems.forEach(item => {
      let key = "";
      if (configMode === "mixed") key = item.productName;
      else key = item.sku;

      if (!groups[key]) {
        groups[key] = { productName: item.productName, sku: item.sku, qty: 0, totalPrice: 0, originalTotalPrice: 0, grades: new Set() };
      }

      const group = groups[key];
      const finalPrice = rowOverrides[key] !== undefined ? rowOverrides[key] : item.finalPrice;
      const newQty = group.qty + item.qty;
      if (newQty > 0) {
        group.totalPrice = (group.totalPrice * group.qty + finalPrice * item.qty) / newQty;
        group.originalTotalPrice = (group.originalTotalPrice * group.qty + item.avgPrice * item.qty) / newQty;
      }
      group.qty = newQty;
      group.grades.add(item.grade);
    });

    return Object.entries(groups).map(([key, data]) => ({
      key,
      ...data,
      avgPrice: data.totalPrice,
      originalAvgPrice: data.originalTotalPrice
    }));
  }, [allItems, configMode, rowOverrides]);

  const displayItems = useMemo(() => {
    let result = [...aggregatedItems].filter(item => 
      item.productName.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase())
    );

    if (sortField) {
      result.sort((a: any, b: any) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        if (sortField === "profitPerUnit") {
          valA = a.avgPrice - a.originalAvgPrice;
          valB = b.avgPrice - b.originalAvgPrice;
        }

        if (typeof valA === "string" && typeof valB === "string") {
          if (sortField === "productName" && valA === valB) {
            const customGradeOrder = ["Premium", "A Grade", "G Grade", "B Grade", "Unknown"];
            const getGradeIndex = (item: any) => {
              const grade = item.grades.size === 1 ? (Array.from(item.grades)[0] as string) : determineGrade(item.sku);
              const idx = customGradeOrder.indexOf(grade);
              return idx === -1 ? 99 : idx;
            };
            const gradeIdxA = getGradeIndex(a);
            const gradeIdxB = getGradeIndex(b);
            return sortOrder === "asc" ? gradeIdxA - gradeIdxB : gradeIdxB - gradeIdxA;
          }
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
  }, [aggregatedItems, search, sortField, sortOrder]);

  const groupedDisplayItems = useMemo(() => {
    if (!enableDeviceGrouping) return [];
    
    const groupsMap = new Map<string, typeof displayItems>();
    displayItems.forEach(item => {
      const key = item.productName;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, []);
      }
      groupsMap.get(key)!.push(item);
    });

    return Array.from(groupsMap.entries()).map(([productName, items]) => {
      const groupQty = items.reduce((sum, i) => sum + i.qty, 0);
      
      const totalOriginalValue = items.reduce((sum, i) => sum + (i.originalAvgPrice * i.qty), 0);
      const avgOriginalPrice = groupQty > 0 ? totalOriginalValue / groupQty : 0;

      const totalFinalValue = items.reduce((sum, i) => sum + (i.avgPrice * i.qty), 0);
      const avgFinalPrice = groupQty > 0 ? totalFinalValue / groupQty : 0;

      return {
        productName,
        totalQty: groupQty,
        avgOriginalPrice,
        avgFinalPrice,
        items
      };
    });
  }, [displayItems, enableDeviceGrouping]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
    return <span style={{ marginLeft: '4px' }}>{sortOrder === "asc" ? "↑" : "↓"}</span>;
  };

  const totalQty = aggregatedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalLastStageValue = aggregatedItems.reduce((sum, item) => sum + (item.originalAvgPrice * item.qty), 0);
  const totalValue = aggregatedItems.reduce((sum, item) => sum + (item.avgPrice * item.qty), 0);
  const totalProfit = totalValue - totalLastStageValue;

  const downloadNUBTemplate = () => {
    const data = aggregatedItems
      .map(item => {
        const finalUnitPrice = parseFloat(item.avgPrice.toFixed(2));
        const totalPrice = parseFloat((item.qty * finalUnitPrice).toFixed(2));
        
        let itemName = item.productName;
        if (configMode === "separate") {
          itemName = `${item.productName} - ${item.sku}`;
        }

        return {
          "Item Name": itemName,
          "Description": "Used - Mixed Grades",
          "Qty": item.qty,
          "Unit Price": finalUnitPrice,
          "Tax Scheme": "0.00",
          "Total Price": totalPrice
        };
      })
      .sort((a, b) => a["Item Name"].localeCompare(b["Item Name"]));

    const ws = xlsx.utils.json_to_sheet(data);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Template");
    const names = branches.map(b => b.name).join("_");
    const safeNames = names.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    xlsx.writeFile(wb, `Combined_NUB_Template_${safeNames || "export"}.xlsx`);
  };

  const downloadCSVExport = () => {
    const headers = ["WIO Name", "SKU", "Product Name", "Qty", "Purchase"];
    const rows = allItems.map(item => {
      let key = "";
      if (configMode === "mixed") key = item.productName;
      else key = item.sku;
      
      const finalPrice = rowOverrides[key] !== undefined ? rowOverrides[key] : item.finalPrice;
      
      return [
        item.wioName || "Unknown",
        item.sku,
        item.productName,
        item.qty.toString(),
        finalPrice.toFixed(2)
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    
    const names = branches.map(b => b.name).join("_");
    const safeNames = names.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    link.setAttribute("download", `Combined_Export_${safeNames || "export"}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', marginTop: '2rem', paddingBottom: '5rem' }}>
      
      {/* Title */}
      <div>
        <h1 style={{ marginBottom: '0.5rem', fontSize: '1.875rem' }}>Combine & Review Branches</h1>
        <p className="text-secondary">Retrieve multiple branch datasets by ID to preview their combined totals and globally sync overrides.</p>
      </div>

      {/* Configuration Retrieval Card */}
      <div className="card glass-card">
        <form onSubmit={handleLoadBranches} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label className="info-label" style={{ fontWeight: 600 }}>Branch IDs (Comma or space separated)</label>
          <textarea
            className="input-field w-full"
            rows={2}
            placeholder="e.g. cmrkt7vx40001jv049jbubjsh, cmrkt7vx40002jv049jbubjsh"
            value={branchIdsInput}
            onChange={(e) => setBranchIdsInput(e.target.value)}
            style={{ fontFamily: 'monospace', minHeight: '80px', background: 'rgba(0,0,0,0.3)', color: 'white', padding: '0.75rem' }}
          />
          {error && (
            <div style={{ color: 'var(--accent-danger)', fontSize: '0.875rem', fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ alignSelf: 'flex-start', padding: '0.75rem 2rem' }}
            disabled={loading}
          >
            {loading ? "Loading and Combining..." : "Retrieve & Combine"}
          </button>
        </form>
      </div>

      {branches.length > 0 && (
        <>
          {/* Branches list & Stats card */}
          <div className="flex justify-between items-center bg-white/5 p-6 rounded-xl border border-white/10" style={{ flexWrap: 'wrap', gap: '2rem' }}>
            <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: '300px' }}>
              <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Loaded Source Branches</h2>
              <div className="flex flex-col gap-1 text-sm text-secondary">
                {branches.map(b => (
                  <div key={b.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span style={{ color: 'white', fontWeight: 600 }}>{b.name}</span>
                    <span className="font-mono" style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '3px' }}>
                      {b.id}
                    </span>
                    <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                      ({b.from} &rarr; {b.to} | {b.totalQty} units)
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 text-xs text-secondary mt-3">
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSaving ? 'var(--accent-primary)' : 'var(--accent-success)' }} />
                {isSaving ? "Saving overrides..." : "All changes synced"}
              </div>
            </div>

            <div style={{ flex: 2, display: 'flex', justifyContent: 'space-around', gap: '2rem', minWidth: '300px' }}>
              <div className="flex flex-col items-center">
                <span className="info-label">Combined Scale</span>
                <span className="info-value" style={{ fontSize: '1.25rem' }}>{totalQty} Units</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="info-label">Combined Profit</span>
                <span className="info-value" style={{ color: 'var(--accent-success)', fontSize: '1.25rem' }}>
                  +€{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="info-label">Combined Value</span>
                <span className="info-value" style={{ fontSize: '1.25rem' }}>
                  €{totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>

          {/* Table settings card */}
          <div className="card glass-card p-6">
            <h3 className="text-sm uppercase tracking-wider text-secondary mb-4">Combined View Configuration</h3>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '220px' }}>
                <label className="info-label">Selling Method (Display Mode)</label>
                <select
                  className="input-field w-full"
                  value={configMode}
                  onChange={(e) => setConfigMode(e.target.value)}
                >
                  <option value="separate">All Separate (Individual SKUs)</option>
                  <option value="mixed">Mixed Grades (Grouped by Name)</option>
                </select>
              </div>

              <div style={{ flex: '1', minWidth: '220px', display: 'flex', alignItems: 'flex-end' }}>
                <div 
                  className="flex items-center gap-3" 
                  onClick={() => setEnableDeviceGrouping(!enableDeviceGrouping)}
                  style={{ cursor: 'pointer', userSelect: 'none', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', width: '100%' }}
                >
                  <div style={{
                    width: '32px',
                    height: '16px',
                    background: enableDeviceGrouping ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    position: 'relative',
                    transition: 'all 0.3s ease'
                  }}>
                    <div style={{
                      width: '12px',
                      height: '12px',
                      background: 'white',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '2px',
                      left: enableDeviceGrouping ? '18px' : '2px',
                      transition: 'all 0.3s ease'
                    }} />
                  </div>
                  <label style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Enable Device Grouping
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Pricing table */}
          <div className="card glass-card p-0 overflow-hidden">
            <div className="p-6 border-bottom" style={{ borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <h3 className="text-sm uppercase tracking-wider text-secondary m-0">Combined Pricing Preview & Overrides</h3>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  onClick={downloadNUBTemplate}
                >
                  Download NUB Template
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0.5rem 1.25rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                  onClick={downloadCSVExport}
                >
                  Export CSV
                </button>
                <div style={{ width: '300px' }}>
                  <input 
                    type="text" 
                    className="input-field"
                    placeholder="Search items..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.2)', padding: '0.5rem 1rem', fontSize: '0.8rem', width: '100%', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
                  />
                </div>
              </div>
            </div>

            <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
              <table style={{ fontSize: '0.875rem' }}>
                <thead>
                  <tr>
                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("productName")}>Item Definition <SortIcon field="productName" /></th>
                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("sku")}>SKU <SortIcon field="sku" /></th>
                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("qty")}>Qty <SortIcon field="qty" /></th>
                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("avgPrice")}>Avg Last Stage <SortIcon field="avgPrice" /></th>
                    <th className="text-center" style={{ cursor: 'pointer' }} onClick={() => toggleSort("profitPerUnit")}>Profit <SortIcon field="profitPerUnit" /></th>
                    <th className="text-center" style={{ width: '200px', cursor: 'pointer' }} onClick={() => toggleSort("avgPrice")}>Current Stage (€) <SortIcon field="currentPrice" /></th>
                  </tr>
                </thead>
                <tbody>
                  {enableDeviceGrouping ? (
                    groupedDisplayItems.map(group => {
                      const isExpanded = !!expandedGroups[group.productName];
                      const groupProfit = group.items.reduce((sum, i) => sum + (i.avgPrice - i.originalAvgPrice) * i.qty, 0);

                      return (
                        <Fragment key={group.productName}>
                          {/* Parent Group Row */}
                          <tr
                            style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.05)', fontWeight: 600 }}
                            onClick={() => setExpandedGroups(prev => ({ ...prev, [group.productName]: !prev[group.productName] }))}
                          >
                            <td style={{ padding: '0.75rem 1rem' }}>
                              <span style={{ marginRight: '8px', color: 'var(--accent-primary)', display: 'inline-block', width: '12px' }}>
                                {isExpanded ? "▼" : "▶"}
                              </span>
                              <span style={{ color: 'white' }}>{group.productName}</span>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '8px', fontWeight: 400 }}>
                                ({group.items.length} {group.items.length === 1 ? 'variant' : 'variants'})
                              </span>
                            </td>
                            <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                              Grouped
                            </td>
                            <td className="text-center" style={{ fontWeight: 700 }}>{group.totalQty}</td>
                            <td className="font-mono text-center text-secondary">
                              €{group.avgOriginalPrice.toFixed(2)}
                            </td>
                            <td className="text-center" style={{ fontWeight: 700, color: groupProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                              €{groupProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="text-center" style={{ fontWeight: 700 }}>
                              €{group.avgFinalPrice.toFixed(2)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-secondary)' }}>(Avg)</span>
                            </td>
                          </tr>

                          {/* Grouped Child Rows */}
                          {isExpanded && [...group.items].sort((a, b) => {
                            const customGradeOrder = ["Premium", "A Grade", "G Grade", "B Grade"];
                            const gradeA = a.grades?.size === 1 ? Array.from(a.grades)[0] as string : determineGrade(a.sku);
                            const gradeB = b.grades?.size === 1 ? Array.from(b.grades)[0] as string : determineGrade(b.sku);
                            let idxA = customGradeOrder.indexOf(gradeA);
                            let idxB = customGradeOrder.indexOf(gradeB);
                            if (idxA === -1) idxA = 99;
                            if (idxB === -1) idxB = 99;
                            return idxA - idxB;
                          }).map(item => {
                            const finalPrice = item.avgPrice;
                            const rowProfit = (finalPrice - item.originalAvgPrice) * item.qty;
                            const isUpdated = rowOverrides[item.key] !== undefined;

                            let exceedsPremium = false;
                            let premiumGapTooSmall = false;
                            let premiumPrice = 0;
                            let priceDifference = 0;
                            const itemGrade = item.grades?.size === 1 ? Array.from(item.grades)[0] as string : determineGrade(item.sku);
                            if (itemGrade && ["A Grade", "G Grade", "B Grade"].includes(itemGrade)) {
                              const premiumGroups = aggregatedItems.filter(g => {
                                return g.grades.has("Premium") && g.productName === item.productName;
                              });
                              let minPremiumPrice = Infinity;
                              let hasPremium = false;
                              premiumGroups.forEach(g => {
                                if (g.avgPrice < minPremiumPrice) {
                                  minPremiumPrice = g.avgPrice;
                                  hasPremium = true;
                                }
                              });
                              if (hasPremium) {
                                premiumPrice = minPremiumPrice;
                                priceDifference = premiumPrice - finalPrice;
                                if (finalPrice > premiumPrice) {
                                  exceedsPremium = true;
                                } else if (priceDifference < 5) {
                                  premiumGapTooSmall = true;
                                }
                              }
                            }

                            return (
                              <tr key={item.key} style={{ background: isUpdated ? 'rgba(59, 130, 246, 0.08)' : 'rgba(0,0,0,0.15)' }}>
                                <td style={{ padding: '0.75rem 1rem 0.75rem 2.5rem' }}>
                                  <div style={{ fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                    <div style={{ fontSize: '0.85rem' }}>
                                      {item.grades?.size === 1 ? Array.from(item.grades)[0] as string : "Variant"}
                                    </div>
                                    <div className="text-xs text-secondary">
                                      {item.productName}
                                    </div>
                                  </div>
                                </td>
                                <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                                  {configMode === "mixed" ? "MIXED" : item.sku}
                                </td>
                                <td className="text-center" style={{ fontWeight: 500 }}>{item.qty}</td>
                                <td className="font-mono text-center text-secondary">
                                  €{item.originalAvgPrice.toFixed(2)}
                                </td>
                                <td className="text-center font-mono" style={{ fontWeight: 600, color: rowProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                                  €{rowProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.7 }}>
                                    (€{(finalPrice - item.originalAvgPrice).toFixed(2)}/u)
                                  </div>
                                </td>
                                <td style={{ padding: '0.5rem' }} className="text-center">
                                  <div className="flex flex-col items-center justify-center">
                                    <ManualPriceInput
                                      initialValue={finalPrice}
                                      onSave={(val) => handleSaveOverride(item.key, val)}
                                    />
                                    {isUpdated && (
                                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.65rem', fontWeight: 600, marginTop: '4px' }}>
                                        ● Modified
                                      </span>
                                    )}
                                    {exceedsPremium && (
                                      <div style={{ color: '#ff5555', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                                        ⚠️ Exceeds Premium (€{premiumPrice.toFixed(2)})
                                      </div>
                                    )}
                                    {premiumGapTooSmall && (
                                      <div style={{ color: '#ff8c00', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                                        ⚠️ Premium Gap &lt; €5 (€{priceDifference.toFixed(2)})
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      );
                    })
                  ) : (
                    displayItems.map(item => {
                      const finalPrice = item.avgPrice;
                      const rowProfit = (finalPrice - item.originalAvgPrice) * item.qty;
                      const isUpdated = rowOverrides[item.key] !== undefined;

                      let exceedsPremium = false;
                      let premiumGapTooSmall = false;
                      let premiumPrice = 0;
                      let priceDifference = 0;
                      const itemGrade = item.grades?.size === 1 ? Array.from(item.grades)[0] : determineGrade(item.sku);
                      if (itemGrade && ["A Grade", "G Grade", "B Grade"].includes(itemGrade)) {
                        const premiumGroups = aggregatedItems.filter(g => {
                          return g.grades.has("Premium") && g.productName === item.productName;
                        });
                        let minPremiumPrice = Infinity;
                        let hasPremium = false;
                        premiumGroups.forEach(g => {
                          if (g.avgPrice < minPremiumPrice) {
                            minPremiumPrice = g.avgPrice;
                            hasPremium = true;
                          }
                        });
                        if (hasPremium) {
                          premiumPrice = minPremiumPrice;
                          priceDifference = premiumPrice - finalPrice;
                          if (finalPrice > premiumPrice) {
                            exceedsPremium = true;
                          } else if (priceDifference < 5) {
                            premiumGapTooSmall = true;
                          }
                        }
                      }

                      return (
                        <tr key={item.key} style={{ background: isUpdated ? 'rgba(59, 130, 246, 0.08)' : undefined }}>
                          <td className="text-center" style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ fontWeight: 600 }}>{item.productName}</div>
                            <div className="text-xs text-secondary">
                              {Array.from(item.grades)
                                .sort((a, b) => {
                                  const order = ["Premium", "A Grade", "G Grade", "B Grade"];
                                  return order.indexOf(a) - order.indexOf(b);
                                })
                                .join(", ")}
                            </div>
                          </td>
                          <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                            {configMode === "mixed" ? "MIXED" : item.sku}
                          </td>
                          <td className="text-center" style={{ fontWeight: 600 }}>{item.qty}</td>
                          <td className="font-mono text-center text-secondary">
                            €{item.originalAvgPrice.toFixed(2)}
                          </td>
                          <td className="text-center font-mono" style={{ fontWeight: 600, color: rowProfit >= 0 ? 'var(--accent-success)' : 'var(--accent-danger)' }}>
                            €{rowProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <div style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.7 }}>
                              (€{(finalPrice - item.originalAvgPrice).toFixed(2)}/u)
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem' }} className="text-center">
                            <div className="flex flex-col items-center justify-center">
                              <ManualPriceInput
                                initialValue={finalPrice}
                                onSave={(val) => handleSaveOverride(item.key, val)}
                              />
                              {isUpdated && (
                                <span style={{ color: 'var(--accent-primary)', fontSize: '0.65rem', fontWeight: 600, marginTop: '4px' }}>
                                  ● Modified
                                </span>
                              )}
                              {exceedsPremium && (
                                <div style={{ color: '#ff5555', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                                  ⚠️ Exceeds Premium (€{premiumPrice.toFixed(2)})
                                </div>
                              )}
                              {premiumGapTooSmall && (
                                <div style={{ color: '#ff8c00', fontSize: '0.7rem', fontWeight: 600, marginTop: '4px', maxWidth: '160px', textAlign: 'center' }}>
                                  ⚠️ Premium Gap &lt; €5 (€{priceDifference.toFixed(2)})
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {aggregatedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-20 text-secondary">
                        Enter source Branch IDs above and retrieve data to review combined pricing.
                      </td>
                    </tr>
                  ) : displayItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-20 text-secondary">
                        No items match your search "{search}".
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                {aggregatedItems.length > 0 && (
                  <tfoot style={{ background: 'rgba(255,255,255,0.05)', fontWeight: 700, borderTop: '2px solid var(--border-subtle)' }}>
                    <tr>
                      <td colSpan={2} className="text-right" style={{ padding: '1rem', textTransform: 'uppercase', fontSize: '0.75rem', opacity: 0.7 }}>Totals</td>
                      <td className="text-center" style={{ padding: '1rem' }}>{totalQty}</td>
                      <td className="text-center" style={{ padding: '1rem' }}>€{totalLastStageValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                      <td className="text-center" style={{ padding: '1rem', color: 'var(--accent-success)' }}>
                        €{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="text-center" style={{ padding: '1rem', fontSize: '1.1rem' }}>€{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ManualPriceInput({ initialValue, onSave }: { initialValue: number, onSave: (val: number) => void }) {
  const [localVal, setLocalVal] = useState((initialValue || 0).toFixed(2));

  useMemo(() => {
    setLocalVal((initialValue || 0).toFixed(2));
  }, [initialValue]);

  return (
    <div className="flex justify-center w-full">
      <input
        type="number"
        step="0.01"
        className="table-input font-mono text-center text-lg"
        style={{ width: '150px' }}
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={() => {
          const val = parseFloat(localVal);
          if (!isNaN(val)) {
            const formatted = val.toFixed(2);
            setLocalVal(formatted);
            onSave(parseFloat(formatted));
          }
        }}
      />
    </div>
  );
}
