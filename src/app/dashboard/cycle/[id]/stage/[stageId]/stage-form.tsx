"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { saveStageConfiguration } from "../../../../actions";
import * as xlsx from "xlsx";

interface Item {
  id: string;
  productName: string;
  sku: string;
  grade: string;
  quantity: number;
  cp1Price: number;
  cp1Offset: number;
}

interface Box {
  id: string;
  wioName: string;
  wioNumber: string;
  items: Item[];
}

export function StageConfigForm({
  cycleId,
  boxes,
  stageId,
  branchId,
  initialData,
  allExports = [],
  fromCompany,
  toCompany
}: {
  cycleId: string,
  boxes: Box[],
  stageId: string,
  branchId: string,
  initialData?: any,
  allExports?: any[],
  fromCompany: string,
  toCompany: string
}) {
  const initialMarkupConfig = initialData?.markupConfig ? JSON.parse(initialData.markupConfig) : {};

  const [branchName, setBranchName] = useState(initialData?.branchName || "");
  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>(
    initialData?.invoiceBoxes?.map((b: any) => b.boxId) || []
  );
  const defaultMode = stageId === "cp4-cp5" ? "separate" : "mixed";
  const [configMode, setConfigMode] = useState(initialData?.configurationMode || defaultMode);

  const [percentageMarkup, setPercentageMarkup] = useState(initialMarkupConfig.percentageMarkup || 0);
  const [flatMarkup, setFlatMarkup] = useState(initialMarkupConfig.flatMarkup || 0);

  const [enableGradeMarkups, setEnableGradeMarkups] = useState(initialMarkupConfig.enableGradeMarkups || false);
  const [gradeMarkups, setGradeMarkups] = useState<Record<string, number>>(
    initialMarkupConfig.gradeMarkups || { "A Grade": 0, "B Grade": 0, "G Grade": 0, "Premium": 0 }
  );
  const [rowOverrides, setRowOverrides] = useState<Record<string, number>>(initialMarkupConfig.rowOverrides || {});
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(
    branchId === 'new' ? null : branchId
  );

  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(
    initialData?.updatedAt ? new Date(initialData.updatedAt) : null
  );
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!lastSaved) return;
    const updateTime = () => {
      const seconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000);
      if (seconds < 5) setTimeAgo("just now");
      else if (seconds < 60) setTimeAgo(`${seconds} seconds ago`);
      else if (seconds < 3600) setTimeAgo(`${Math.floor(seconds / 60)} minutes ago`);
      else if (seconds < 86400) setTimeAgo(`${Math.floor(seconds / 3600)} hours ago`);
      else setTimeAgo(`${Math.floor(seconds / 86400)} days ago`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [lastSaved]);

  const isFirstMount = useRef(true);

  // Auto-Save Effect
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const saveData = async () => {
      if (!branchName && !currentBranchId) return; // Don't auto-save a new branch without a name

      setIsSaving(true);
      try {
        const savedId = await saveStageConfiguration({
          id: currentBranchId || undefined,
          cycleId,
          fromCompany,
          toCompany,
          branchName,
          configurationMode: configMode,
          markupConfig: JSON.stringify({ 
            percentageMarkup, 
            flatMarkup, 
            enableGradeMarkups,
            gradeMarkups,
            rowOverrides 
          }),
          boxIds: selectedBoxIds
        });
        setLastSaved(new Date());
        
        if (!currentBranchId) {
          setCurrentBranchId(savedId);
          // Update URL to reflect the new ID
          const newPath = window.location.pathname.replace('/new', `/${savedId}`);
          window.history.replaceState({}, '', newPath);
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    };

    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [
    branchName,
    configMode, 
    percentageMarkup, 
    flatMarkup, 
    enableGradeMarkups, 
    gradeMarkups, 
    rowOverrides, 
    selectedBoxIds,
    cycleId, fromCompany, toCompany, currentBranchId
  ]);
  
  const handleBulkPriceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = new Uint8Array(event.target?.result as ArrayBuffer);
      const workbook = xlsx.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[] = xlsx.utils.sheet_to_json(sheet);

      const newOverrides = { ...rowOverrides };
      rows.forEach(row => {
        const sku = String(row["SKU"] || row["sku"] || "").trim();
        const priceValue = row["Purchase"] || row["purchase"] || row["Price"] || row["price"];
        const price = parseFloat(String(priceValue).replace(/[€,]/g, ''));
        
        if (!sku || isNaN(price)) return;

        // Find which key this SKU belongs to in the current branch
        const itemInBranch = boxes
          .filter(b => selectedBoxIds.includes(b.id))
          .flatMap(b => b.items)
          .find(i => i.sku === sku);

        if (itemInBranch) {
          let key = "";
          if (configMode === "mixed") key = itemInBranch.productName;
          else if (configMode === "separate") key = itemInBranch.sku;
          else if (configMode === "premium-mixed") key = itemInBranch.grade === "Premium" ? itemInBranch.sku : `${itemInBranch.productName}_NON_PREMIUM`;

          if (key) {
            newOverrides[key] = price;
          }
        }
      });
      setRowOverrides(newOverrides);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ''; // reset
  };

  // Box Exclusivity Logic
  const boxesTakenByOtherBranches = useMemo(() => {
    return allExports
      .filter(e => e.fromCompany === fromCompany && e.toCompany === toCompany && e.id !== branchId)
      .flatMap(e => e.invoiceBoxes.map((ib: any) => ib.boxId));
  }, [allExports, fromCompany, toCompany, branchId]);

  const availableBoxes = useMemo(() => {
    return boxes
      .filter(b => !boxesTakenByOtherBranches.includes(b.id))
      .sort((a, b) => a.wioName.localeCompare(b.wioName));
  }, [boxes, boxesTakenByOtherBranches]);

  const getHistoricalPrice = (item: Item, targetStage: string): number => {
    if (targetStage === "CP-2") return item.cp1Price;

    const boxId = item.id; // Corrected to use item.id or find boxId

    if (targetStage === "CP-3") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-2" && e.toCompany === "CP-3" && e.invoiceBoxes.some((ib: any) => ib.boxId === boxes.find(b => b.items.some(i => i.id === item.id))?.id)
      );
      if (!exportRecord) return item.cp1Price;
      return calculatePriceForExport(item, "CP-2", exportRecord);
    }

    if (targetStage === "CP-4") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-3" && e.toCompany === "CP-4" && e.invoiceBoxes.some((ib: any) => ib.boxId === boxes.find(b => b.items.some(i => i.id === item.id))?.id)
      );
      if (!exportRecord) return getHistoricalPrice(item, "CP-3");
      return calculatePriceForExport(item, "CP-3", exportRecord);
    }

    return item.cp1Price;
  };

  const calculatePriceForExport = (item: Item, baseStage: string, exportRecord: any): number => {
    const config = JSON.parse(exportRecord.markupConfig || "{}");
    const mode = exportRecord.configurationMode;
    
    let key = "";
    if (mode === "mixed") key = item.productName;
    else if (mode === "separate") key = item.sku;
    else if (mode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

    if (config.rowOverrides && config.rowOverrides[key] !== undefined) {
      return config.rowOverrides[key];
    }

    const exportBoxIds = exportRecord.invoiceBoxes.map((ib: any) => ib.boxId);
    const groupItems = boxes
      .filter(b => exportBoxIds.includes(b.id))
      .flatMap(b => b.items)
      .filter(i => {
        let iKey = "";
        if (mode === "mixed") iKey = i.productName;
        else if (mode === "separate") iKey = i.sku;
        else if (mode === "premium-mixed") iKey = i.grade === "Premium" ? i.sku : `${i.productName}_NON_PREMIUM`;
        return iKey === key;
      });

    if (groupItems.length === 0) return getHistoricalPrice(item, baseStage);

    let totalQty = 0;
    let totalPriceSum = 0;
    const gradesInGroup = new Set<string>();

    groupItems.forEach(gi => {
      const giBasePrice = getHistoricalPrice(gi, baseStage);
      totalPriceSum += (giBasePrice * gi.quantity);
      totalQty += gi.quantity;
      gradesInGroup.add(gi.grade);
    });

    const avgBasePrice = totalPriceSum / totalQty;
    
    // Apply Grade Splitting Offset for the final stage (CP-4 -> CP-5)
    let baseWithOffset = avgBasePrice;
    if (toCompany === "CP-5") {
      baseWithOffset += (item.cp1Offset || 0);
    }

    let price = (baseWithOffset * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);
    
    if (config.enableGradeMarkups && config.gradeMarkups) {
      const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
      let highestIndex = -1;
      gradesList.forEach((g, idx) => {
        if (gradesInGroup.has(g)) highestIndex = idx;
      });

      if (highestIndex !== -1) {
        for (let i = 0; i <= highestIndex; i++) {
          price += (config.gradeMarkups[gradesList[i]] || 0);
        }
      }
    }

    return Math.round(price);
  };

  const rawItems = useMemo(() => {
    return boxes
      .filter(b => selectedBoxIds.includes(b.id))
      .flatMap(b => b.items);
  }, [boxes, selectedBoxIds]);

  const aggregatedItems = useMemo(() => {
    const groups: Record<string, { productName: string, sku: string, qty: number, totalPrice: number, totalOffset: number, grades: Set<string> }> = {};

    rawItems.forEach(item => {
      let key = "";
      if (configMode === "mixed") key = item.productName;
      else if (configMode === "separate") key = item.sku;
      else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

      if (!groups[key]) {
        groups[key] = { productName: item.productName, sku: item.sku, qty: 0, totalPrice: 0, totalOffset: 0, grades: new Set() };
      }

      const group = groups[key];
      const lastStagePrice = getHistoricalPrice(item, fromCompany) || 0;
      
      const newQty = group.qty + item.quantity;
      if (newQty > 0) {
        group.totalPrice = (group.totalPrice * group.qty + lastStagePrice * item.quantity) / newQty;
        group.totalOffset = (group.totalOffset * group.qty + (item.cp1Offset || 0) * item.quantity) / newQty;
      }
      group.qty = newQty;
      group.grades.add(item.grade);
    });

    return Object.entries(groups).map(([key, data]) => ({
      key,
      ...data,
      avgPrice: data.totalPrice || 0,
      avgOffset: data.totalOffset || 0
    }));
  }, [rawItems, configMode, fromCompany, allExports, boxes]);

  const displayItems = useMemo(() => {
    let result = [...aggregatedItems].filter(item => 
      item.productName.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase())
    );

    if (sortField) {
      result.sort((a: any, b: any) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // Handle calculated prices if sorting by current stage
        if (sortField === "currentPrice") {
          valA = calculateRowPrice(a.avgPrice, a.key);
          valB = calculateRowPrice(b.avgPrice, b.key);
        }

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
  }, [aggregatedItems, search, sortField, sortOrder, percentageMarkup, flatMarkup, enableGradeMarkups, gradeMarkups, rowOverrides]);

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

  const getStackedGradeMarkup = (grades: Set<string>): number => {
    if (!enableGradeMarkups) return 0;
    let total = 0;
    const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
    let highestIndex = -1;
    gradesList.forEach((g, idx) => {
      if (grades.has(g)) highestIndex = idx;
    });
    if (highestIndex === -1) return 0;
    for (let i = 0; i <= highestIndex; i++) {
      total += (gradeMarkups[gradesList[i]] || 0);
    }
    return total;
  };

  const calculateRowPrice = (avgBasePrice: number, key: string, avgOffset: number = 0) => {
    if (rowOverrides[key] !== undefined) return rowOverrides[key];
    
    let base = avgBasePrice || 0;
    if (toCompany === "CP-5") {
      base += avgOffset;
    }

    let price = (base * (1 + (percentageMarkup || 0) / 100)) + (flatMarkup || 0);
    if (enableGradeMarkups) {
      const group = aggregatedItems.find(i => i.key === key);
      if (group) {
        price += getStackedGradeMarkup(group.grades);
      }
    }
    return Math.round(price) || 0;
  };

  const totalQty = aggregatedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalLastStageValue = aggregatedItems.reduce((sum, item) => sum + (item.avgPrice * item.qty), 0);
  const totalValue = aggregatedItems.reduce((sum, item) => sum + (calculateRowPrice(item.avgPrice, item.key, item.avgOffset) * item.qty), 0);
  const totalProfit = aggregatedItems.reduce((sum, item) => sum + ((calculateRowPrice(item.avgPrice, item.key, item.avgOffset) - item.avgPrice) * item.qty), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '0.5rem' }}>
      <div className="flex justify-between items-center bg-white/5 p-6 rounded-xl border border-white/10">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <h1 className="mb-1" style={{ fontSize: '1.5rem' }}>{fromCompany} &rarr; {toCompany} Branch</h1>
          <div className="flex items-center gap-2 text-xs text-secondary">
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSaving ? 'var(--accent-primary)' : 'var(--accent-success)' }} />
            {isSaving ? "Saving..." : lastSaved ? `All changes saved ${timeAgo}` : "Not saved yet"}
          </div>
        </div>
        
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', gap: '4rem' }}>
          <div className="flex flex-col items-center">
            <span className="info-label">Branch Scale</span>
            <span className="info-value" style={{ fontSize: '1.25rem' }}>{totalQty} Units</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="info-label">Branch Profit</span>
            <span className="info-value" style={{ color: 'var(--accent-success)', fontSize: '1.25rem' }}>
              +€{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <form action="/api/export" method="POST" className="m-0">
            <input type="hidden" name="cycleId" value={cycleId} />
            <input type="hidden" name="fromCompany" value={fromCompany} />
            <input type="hidden" name="toCompany" value={toCompany} />
            <input type="hidden" name="branchName" value={branchName} />
            <input type="hidden" name="boxIds" value={JSON.stringify(selectedBoxIds)} />
            <input type="hidden" name="configMode" value={configMode} />
            <input type="hidden" name="markupConfig" value={JSON.stringify({ 
              percentageMarkup, 
              flatMarkup, 
              enableGradeMarkups, 
              gradeMarkups, 
              rowOverrides 
            })} />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 2rem' }} disabled={selectedBoxIds.length === 0 || !branchName}>
              Export CSV
            </button>
          </form>
        </div>
      </div>

      <div className="card glass-card p-6">
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>1</span>
          Branch Definition
        </h3>
        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ flex: '1' }}>
            <label className="info-label">Branch Name</label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="e.g. Premium Grade Branch or High-Volume Mix"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              required
            />
          </div>
          <div style={{ flex: '1' }}>
            <label className="info-label">Selling Method</label>
            <select
              className="input-field w-full"
              value={configMode}
              onChange={(e) => setConfigMode(e.target.value)}
            >
              <option value="mixed">Mixed Grades (Grouped by Name)</option>
              <option value="separate">All Separate (Individual SKUs)</option>
              <option value="premium-mixed">Premium by SKU / Others Mixed</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card glass-card p-6">
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>2</span>
          Markup Strategy
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1', minWidth: '120px' }}>
            <label className="info-label">Percentage (%)</label>
            <input
              type="number"
              className="input-field w-full"
              placeholder="0"
              value={percentageMarkup || ""}
              onChange={(e) => setPercentageMarkup(Number(e.target.value))}
            />
          </div>

          <div style={{ flex: '1', minWidth: '120px' }}>
            <label className="info-label">Flat Amount (€)</label>
            <input
              type="number"
              className="input-field w-full"
              placeholder="0"
              value={flatMarkup || ""}
              onChange={(e) => setFlatMarkup(Number(e.target.value))}
            />
          </div>

          <div style={{ flex: '2', minWidth: '300px' }}>
            <div 
              className="flex items-center gap-3" 
              onClick={() => setEnableGradeMarkups(!enableGradeMarkups)}
              style={{ cursor: 'pointer', userSelect: 'none', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}
            >
              <div style={{
                width: '32px',
                height: '16px',
                background: enableGradeMarkups ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
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
                  left: enableGradeMarkups ? '18px' : '2px',
                  transition: 'all 0.3s ease'
                }} />
              </div>
              <label className="info-label" style={{ margin: 0, fontSize: '0.8rem', cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}>
                Enable Grading Markups
              </label>
            </div>
          </div>
        </div>

        {enableGradeMarkups && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '1rem', animation: 'fadeIn 0.3s ease' }}>
            {["B Grade", "G Grade", "A Grade", "Premium"].map(grade => (
              <div key={grade} style={{ flex: 1, minWidth: '150px', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <label className="info-label" style={{ color: 'var(--accent-primary)', marginBottom: '0.25rem', fontSize: '0.65rem' }}>{grade}</label>
                <div className="flex items-center gap-1">
                  <span className="text-secondary" style={{ fontSize: '0.7rem' }}>+€</span>
                  <input 
                    type="number" 
                    className="input-field w-full" 
                    style={{ background: 'transparent', border: 'none', padding: '0', fontSize: '0.9rem' }}
                    value={gradeMarkups[grade] || ""}
                    onChange={(e) => setGradeMarkups({ ...gradeMarkups, [grade]: Number(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card glass-card p-6">
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>3</span>
          Box Inventory Assignment
        </h3>
        {availableBoxes.length === 0 ? (
          <div className="text-center py-8 text-secondary italic">
            All boxes for this stage are already assigned to other branches.
          </div>
        ) : (
          <div className="box-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
            {availableBoxes.map(box => (
              <div
                key={box.id}
                className={`box-card ${selectedBoxIds.includes(box.id) ? 'selected' : ''}`}
                style={{ padding: '0.75rem' }}
                onClick={() => {
                  if (selectedBoxIds.includes(box.id)) setSelectedBoxIds(selectedBoxIds.filter(id => id !== box.id));
                  else setSelectedBoxIds([...selectedBoxIds, box.id]);
                }}
              >
                <div className="check-indicator" style={{ width: '14px', height: '14px', fontSize: '8px' }}>
                  {selectedBoxIds.includes(box.id) && "✓"}
                </div>
                <div className="wio-num" style={{ fontSize: '0.65rem' }}>{box.wioNumber}</div>
                <div className="wio-name" style={{ fontSize: '0.8rem' }}>{box.wioName}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card glass-card p-0 overflow-hidden mb-20">
        <div className="p-6 border-bottom" style={{ borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary">
            <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>4</span>
            Pricing Preview & Manual Overrides
          </h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', borderRadius: '8px', cursor: 'pointer', margin: 0 }}>
              Bulk Upload Pricing
              <input type="file" accept=".csv, .xlsx, .xls" style={{ display: 'none' }} onChange={handleBulkPriceUpload} />
            </label>
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
                <th className="text-center">Added Value</th>
                <th className="text-center" style={{ width: '200px', cursor: 'pointer' }} onClick={() => toggleSort("currentPrice")}>Current Stage (€) <SortIcon field="currentPrice" /></th>
              </tr>
            </thead>
            <tbody>
              {displayItems.map(item => {
                const finalPrice = calculateRowPrice(item.avgPrice, item.key, item.avgOffset);
                return (
                  <tr key={item.key}>
                    <td className="text-center" style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div className="text-xs text-secondary">{Array.from(item.grades).sort().join(", ")}</div>
                    </td>
                    <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                      {configMode === "mixed" ? "MIXED" : item.sku}
                    </td>
                    <td className="text-center" style={{ fontWeight: 600 }}>{item.qty}</td>
                    <td className="font-mono text-secondary text-center">€{item.avgPrice.toFixed(2)}</td>
                    <td className="text-center">
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.25rem', fontWeight: 600, fontSize: '0.85rem' }}>
                        {rowOverrides[item.key] !== undefined ? (
                          <span style={{ color: 'var(--accent-primary)' }}>
                            +€{(rowOverrides[item.key] - item.avgPrice).toFixed(2)} (Manual)
                          </span>
                        ) : (
                          <>
                            {(item.avgOffset !== 0 && toCompany === "CP-5") && (
                              <span style={{ color: item.avgOffset > 0 ? 'var(--accent-primary)' : '#ff5555', fontSize: '0.75rem' }}>
                                {item.avgOffset > 0 ? '+' : ''}€{item.avgOffset.toFixed(2)} Grade Split
                              </span>
                            )}
                            <span style={{ color: 'var(--accent-primary)' }}>
                              +€{((item.avgPrice * (percentageMarkup / 100)) + flatMarkup).toFixed(2)} Markup
                            </span>
                            {enableGradeMarkups && getStackedGradeMarkup(item.grades) > 0 && (
                              <span style={{ color: '#ff8c00' }}>+ €{getStackedGradeMarkup(item.grades).toFixed(2)} Stacked</span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem' }} className="text-center">
                      <div className="flex justify-center">
                        <ManualPriceInput
                          initialValue={finalPrice}
                          onSave={(val) => setRowOverrides({ ...rowOverrides, [item.key]: val })}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {aggregatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-secondary">
                    Select source inventory to calculate prices.
                  </td>
                </tr>
              ) : displayItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-secondary">
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
                  <td className="text-center" style={{ padding: '1rem', color: 'var(--accent-primary)' }}>
                    +€{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="text-center" style={{ padding: '1rem', fontSize: '1.1rem' }}>€{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// Helper component to fix "weird" input behavior
function ManualPriceInput({ initialValue, onSave }: { initialValue: number, onSave: (val: number) => void }) {
  const [localVal, setLocalVal] = useState((initialValue || 0).toFixed(2));

  // Sync when global changes, but only if not focused
  useEffect(() => {
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
