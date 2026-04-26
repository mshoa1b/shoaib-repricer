"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { saveStageConfiguration } from "../../../../actions";

interface Item {
  id: string;
  productName: string;
  sku: string;
  grade: string;
  quantity: number;
  cp1Price: number;
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
  initialData,
  allExports = []
}: {
  cycleId: string,
  boxes: Box[],
  stageId: string,
  initialData?: any,
  allExports?: any[]
}) {
  const initialMarkupConfig = initialData?.markupConfig ? JSON.parse(initialData.markupConfig) : {};

  const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>(
    initialData?.invoiceBoxes?.map((b: any) => b.boxId) || []
  );
  const [configMode, setConfigMode] = useState(initialData?.configurationMode || "mixed");

  // Dual Markups
  const [percentageMarkup, setPercentageMarkup] = useState(initialMarkupConfig.percentageMarkup || 0);
  const [flatMarkup, setFlatMarkup] = useState(initialMarkupConfig.flatMarkup || 0);

  // Grade Markups
  const [enableGradeMarkups, setEnableGradeMarkups] = useState(initialMarkupConfig.enableGradeMarkups || false);
  const [gradeMarkups, setGradeMarkups] = useState<Record<string, number>>(
    initialMarkupConfig.gradeMarkups || { "A Grade": 0, "B Grade": 0, "G Grade": 0, "Premium": 0 }
  );

  const [rowOverrides, setRowOverrides] = useState<Record<string, number>>(initialMarkupConfig.rowOverrides || {});
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(
    initialData?.updatedAt ? new Date(initialData.updatedAt) : null
  );
  const [timeAgo, setTimeAgo] = useState<string>("");

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
  const [showToast, setShowToast] = useState(false);

  const stageParts = stageId.split('-');
  const fromCompany = stageParts[0].toUpperCase();
  const toCompany = stageParts[1].toUpperCase();

  const isFirstMount = useRef(true);

  // Auto-Save Effect
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const saveData = async () => {
      setIsSaving(true);
      try {
        await saveStageConfiguration({
          cycleId,
          fromCompany,
          toCompany,
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
      } catch (err) {
        console.error("Auto-save failed:", err);
      } finally {
        setIsSaving(false);
      }
    };

    // 1 second debounce
    const timer = setTimeout(saveData, 1000);
    return () => clearTimeout(timer);
  }, [
    configMode, 
    percentageMarkup, 
    flatMarkup, 
    enableGradeMarkups, 
    gradeMarkups, 
    rowOverrides, 
    selectedBoxIds,
    cycleId, fromCompany, toCompany
  ]);

  // Recursive pricing logic to follow the "Sold As" model of previous stages
  const getHistoricalPrice = (item: Item, targetStage: string): number => {
    // Stage 1: The Upload (CP1 -> CP2 transition is already done, so CP2 is our ground truth)
    if (targetStage === "CP2") return item.cp1Price;

    // To get price at CP3, we look at the CP2 -> CP3 export
    if (targetStage === "CP3") {
      const exportRecord = allExports.find(e => e.fromCompany === "CP2" && e.toCompany === "CP3");
      if (!exportRecord) return item.cp1Price;
      return calculatePriceForExport(item, "CP2", exportRecord);
    }

    // To get price at CP4, we look at the CP3 -> CP4 export
    if (targetStage === "CP4") {
      const exportRecord = allExports.find(e => e.fromCompany === "CP3" && e.toCompany === "CP4");
      if (!exportRecord) return getHistoricalPrice(item, "CP3");
      return calculatePriceForExport(item, "CP3", exportRecord);
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

    // 1. Manual Override takes priority
    if (config.rowOverrides && config.rowOverrides[key] !== undefined) {
      return config.rowOverrides[key];
    }

    // 2. Correct Aggregation: Find all items that belonged to this group in THAT stage
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
    
    // Apply % and Flat
    let price = (avgBasePrice * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);
    
    // Apply Stacked Grade Markups if enabled in THAT stage
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
    const groups: Record<string, { productName: string, sku: string, qty: number, totalPrice: number, grades: Set<string> }> = {};

    rawItems.forEach(item => {
      let key = "";
      if (configMode === "mixed") key = item.productName;
      else if (configMode === "separate") key = item.sku;
      else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

      if (!groups[key]) {
        groups[key] = { productName: item.productName, sku: item.sku, qty: 0, totalPrice: 0, grades: new Set() };
      }

      const group = groups[key];
      const lastStagePrice = getHistoricalPrice(item, fromCompany);
      
      const newQty = group.qty + item.quantity;
      group.totalPrice = (group.totalPrice * group.qty + lastStagePrice * item.quantity) / newQty;
      group.qty = newQty;
      group.grades.add(item.grade);
    });

    return Object.entries(groups).map(([key, data]) => ({
      key,
      ...data,
      avgPrice: data.totalPrice
    }));
  }, [rawItems, configMode, fromCompany, allExports]);



  const getStackedGradeMarkup = (grades: Set<string>): number => {
    if (!enableGradeMarkups) return 0;
    
    let total = 0;
    const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
    
    // Find the "highest" grade present in this group
    let highestIndex = -1;
    gradesList.forEach((g, idx) => {
      if (grades.has(g)) highestIndex = idx;
    });

    if (highestIndex === -1) return 0;

    // Sum all markups up to the highest grade present
    for (let i = 0; i <= highestIndex; i++) {
      total += (gradeMarkups[gradesList[i]] || 0);
    }
    
    return total;
  };

  const calculateRowPrice = (avgBasePrice: number, key: string) => {
    if (rowOverrides[key] !== undefined) return rowOverrides[key];
    
    // Base Calculation: % and Flat
    let price = (avgBasePrice * (1 + (percentageMarkup || 0) / 100)) + (flatMarkup || 0);
    
    // Add Stacked Grading Markups if enabled
    if (enableGradeMarkups) {
      const group = aggregatedItems.find(i => i.key === key);
      if (group) {
        price += getStackedGradeMarkup(group.grades);
      }
    }
    
    return Math.round(price);
  };

  const totalQty = aggregatedItems.reduce((sum, item) => sum + item.qty, 0);
  const totalValue = aggregatedItems.reduce((sum, item) => sum + (calculateRowPrice(item.avgPrice, item.key) * item.qty), 0);
  const totalProfit = aggregatedItems.reduce((sum, item) => sum + ((calculateRowPrice(item.avgPrice, item.key) - item.avgPrice) * item.qty), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '0.5rem' }}>
      {/* Header Info Section */}
      <div className="flex justify-between items-center bg-white/5 p-6 rounded-xl border border-white/10">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <h1 className="mb-1" style={{ fontSize: '1.5rem' }}>{fromCompany} &rarr; {toCompany} Strategy</h1>
          <div className="flex items-center gap-2 text-xs text-secondary">
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: isSaving ? 'var(--accent-primary)' : 'var(--accent-success)' }} />
            {isSaving ? "Saving..." : lastSaved ? `All changes saved ${timeAgo}` : "Not saved yet"}
          </div>
        </div>
        
        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', gap: '4rem' }}>
          <div className="flex flex-col items-center">
            <span className="info-label">Current Scale</span>
            <span className="info-value" style={{ fontSize: '1.25rem' }}>{totalQty} Units</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="info-label">Total Profit</span>
            <span className="info-value" style={{ color: 'var(--accent-success)', fontSize: '1.25rem' }}>
              +€{totalProfit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <span className="info-label">Projected Exit Value</span>
            <span className="info-value" style={{ color: 'var(--accent-primary)', fontSize: '1.25rem' }}>
              €{totalValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <form action="/api/export" method="POST" className="m-0">
            <input type="hidden" name="cycleId" value={cycleId} />
            <input type="hidden" name="fromCompany" value={fromCompany} />
            <input type="hidden" name="toCompany" value={toCompany} />
            <input type="hidden" name="boxIds" value={JSON.stringify(selectedBoxIds)} />
            <input type="hidden" name="configMode" value={configMode} />
            <input type="hidden" name="markupConfig" value={JSON.stringify({ 
              percentageMarkup, 
              flatMarkup, 
              enableGradeMarkups, 
              gradeMarkups, 
              rowOverrides 
            })} />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 2rem' }} disabled={selectedBoxIds.length === 0}>
              Export CSV
            </button>
          </form>
        </div>
      </div>

      {/* Step 1: Horizontal Strategy Row */}
      <div className="card glass-card p-6" style={{ marginBottom: '0' }}>
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>1</span>
          Global Implementation Strategy
        </h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '2', minWidth: '250px' }}>
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
        </div>



        {/* Grading Markup Flow */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <div 
              className="flex items-center gap-3" 
              onClick={() => setEnableGradeMarkups(!enableGradeMarkups)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{
                width: '40px',
                height: '20px',
                background: enableGradeMarkups ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
                borderRadius: '20px',
                position: 'relative',
                transition: 'all 0.3s ease',
                marginRight: '0.5rem'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  background: 'white',
                  borderRadius: '50%',
                  position: 'absolute',
                  top: '2px',
                  left: enableGradeMarkups ? '22px' : '2px',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }} />
              </div>
              <label className="info-label" style={{ margin: 0, fontSize: '0.85rem', cursor: 'pointer', textTransform: 'none', fontWeight: 600 }}>
                Enable Grading Markup Layer
              </label>
            </div>
            {enableGradeMarkups && (
              <div className="text-xs text-secondary italic" style={{ opacity: 0.8 }}>
                &rarr; System will add specific values for every grade present in the group.
              </div>
            )}
          </div>
          
          {enableGradeMarkups && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', animation: 'fadeIn 0.3s ease' }}>
              {["B Grade", "G Grade", "A Grade", "Premium"].map(grade => (
                <div key={grade} style={{ flex: 1, minWidth: '160px', background: 'rgba(255,255,255,0.02)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <label className="info-label" style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem', fontSize: '0.7rem' }}>{grade}</label>
                  <div className="flex items-center gap-2">
                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>+</span>
                    <input 
                      type="number" 
                      className="input-field w-full" 
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', borderRadius: 0, padding: '0.1rem 0', fontSize: '1rem' }}
                      placeholder="0"
                      value={gradeMarkups[grade] || ""}
                      onChange={(e) => setGradeMarkups({ ...gradeMarkups, [grade]: Number(e.target.value) })}
                    />
                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>€</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>


      </div>

      {/* Step 2: Compact Box Grid */}
      <div className="card glass-card p-6" style={{ marginBottom: '0' }}>
        <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
          <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>2</span>
          Source Inventory Selection
        </h3>
        <div className="box-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {boxes.map(box => (
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
      </div>

      {/* Step 3: Pricing Preview */}
      <div className="card glass-card p-0 overflow-hidden mb-10">
        <div className="p-6 border-bottom" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <h3 className="flex items-center text-sm uppercase tracking-wider text-secondary" style={{ marginBottom: '1.5rem' }}>
            <span className="step-number" style={{ width: '20px', height: '20px', fontSize: '10px' }}>3</span>
            Pricing Preview & Manual Overrides
          </h3>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: '0' }}>
          <table style={{ fontSize: '0.875rem' }}>
            <thead>
              <tr>
                <th className="text-center">Item Definition</th>
                <th className="text-center">SKU</th>
                <th className="text-center">Qty</th>
                <th className="text-center">Avg Last Stage</th>
                <th className="text-center">Added Value</th>
                <th className="text-center" style={{ width: '200px' }}>Current Stage (€)</th>
              </tr>
            </thead>
            <tbody>
              {aggregatedItems.map(item => {
                const finalPrice = calculateRowPrice(item.avgPrice, item.key);
                const markupVal = finalPrice - item.avgPrice;

                return (
                  <tr key={item.key}>
                    <td className="text-center" style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div className="text-xs text-secondary">
                        {Array.from(item.grades).sort().join(", ")}
                      </div>
                    </td>
                    <td className="text-center text-secondary font-mono" style={{ fontSize: '0.75rem' }}>
                      {configMode === "mixed" ? "MIXED" : item.sku}
                    </td>
                    <td className="text-center" style={{ fontWeight: 600 }}>{item.qty}</td>
                    <td className="font-mono text-secondary text-center">€{item.avgPrice.toFixed(2)}</td>
                    <td className="text-center">
                      {rowOverrides[item.key] !== undefined ? (
                        <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Manual</span>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', fontWeight: 600, fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--accent-primary)' }}>
                            +€{((item.avgPrice * (percentageMarkup / 100)) + flatMarkup).toFixed(2)}
                          </span>
                          {enableGradeMarkups && getStackedGradeMarkup(item.grades) > 0 && (
                            <span style={{ color: '#ff8c00' }}>
                              + €{getStackedGradeMarkup(item.grades).toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
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
              {aggregatedItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-20 text-secondary">
                    Select source inventory to calculate prices.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


    </div>
  );
}

// Helper component to fix "weird" input behavior
function ManualPriceInput({ initialValue, onSave }: { initialValue: number, onSave: (val: number) => void }) {
  const [localVal, setLocalVal] = useState(initialValue.toFixed(2));

  // Sync when global changes, but only if not focused
  useEffect(() => {
    setLocalVal(initialValue.toFixed(2));
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
