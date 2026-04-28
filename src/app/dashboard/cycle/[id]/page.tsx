import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RenameCycleForm } from "./rename-form";
import { MasterPriceGrid } from "./price-grid";
import { BranchItem } from "./branch-item";

const STAGES = [
  { id: "cp2-cp3", from: "CP-2", to: "CP-3" },
  { id: "cp3-cp4", from: "CP-3", to: "CP-4" },
  { id: "cp4-cp5", from: "CP-4", to: "CP-5" },
];

export default async function CycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      boxes: {
        include: {
          items: true
        }
      },
      exports: {
        include: {
          invoiceBoxes: true
        }
      }
    }
  });

  if (!cycle) return notFound();

  let totalItems = 0;
  let totalValue = 0;
  cycle.boxes.forEach(box => {
    box.items.forEach(item => {
      totalItems += item.quantity;
      totalValue += item.quantity * item.cp1Price;
    });
  });

  const allExports = cycle.exports;
  const allBoxes = cycle.boxes;

  const getHistoricalPrice = (item: any, targetStage: string): number => {
    // Normalize stage name: "CP-3" -> "CP3" so both formats are handled
    const stage = targetStage.replace("-", "");

    if (stage === "CP1") return item.cp1Price;
    if (stage === "CP2") return item.cp1Price;

    // Find boxId by searching allBoxes (avoids relying on item.boxId being populated)
    const boxId = item.boxId || allBoxes.find(b => b.items.some((i: any) => i.id === item.id))?.id;
    if (!boxId) return item.cp1Price;

    if (stage === "CP3") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-2" && 
        e.toCompany === "CP-3" && 
        e.invoiceBoxes.some(ib => ib.boxId === boxId)
      );
      if (!exportRecord) return item.cp1Price;
      return calculatePriceForExport(item, "CP-2", exportRecord);
    }

    if (stage === "CP4") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-3" && 
        e.toCompany === "CP-4" && 
        e.invoiceBoxes.some(ib => ib.boxId === boxId)
      );
      if (!exportRecord) return getHistoricalPrice(item, "CP3");
      return calculatePriceForExport(item, "CP-3", exportRecord);
    }

    if (stage === "CP5") {
      const exportRecord = allExports.find(e => 
        e.fromCompany === "CP-4" && 
        e.toCompany === "CP-5" && 
        e.invoiceBoxes.some(ib => ib.boxId === boxId)
      );
      if (!exportRecord) return getHistoricalPrice(item, "CP4");
      return calculatePriceForExport(item, "CP-4", exportRecord);
    }

    return item.cp1Price;
  };

  const calculatePriceForExport = (item: any, baseStage: string, exportRecord: any): number => {
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
    const groupItems = allBoxes
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
    let price = (avgBasePrice * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);
    
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

  const calculateStageTotal = (toStage: string) => {
    // CP-1 and CP-2 are always cp1Price across all boxes
    if (toStage === "CP1" || toStage === "CP2") {
      let total = 0;
      cycle.boxes.forEach(box => box.items.forEach(item => {
        total += item.quantity * item.cp1Price;
      }));
      return total;
    }

    const stagePairs: Record<string, { from: string; to: string }> = {
      "CP3": { from: "CP-2", to: "CP-3" },
      "CP4": { from: "CP-3", to: "CP-4" },
      "CP5": { from: "CP-4", to: "CP-5" },
    };
    const pair = stagePairs[toStage];
    if (!pair) return 0;

    // The base stage for the "avg last stage" lookup
    const baseStageKey = pair.from.replace("CP-", "CP");

    const stageExports = allExports.filter(e => e.fromCompany === pair.from && e.toCompany === pair.to);
    let grandTotal = 0;

    // For each branch at this stage, mirror the stage form's aggregatedItems logic exactly
    stageExports.forEach(branch => {
      const config = JSON.parse(branch.markupConfig || "{}");
      const mode = branch.configurationMode || "mixed";
      const branchBoxIds = branch.invoiceBoxes.map((ib: any) => ib.boxId);
      const branchBoxes = allBoxes.filter(b => branchBoxIds.includes(b.id));

      // Group items by key (same as aggregatedItems in stage form)
      const groups: Record<string, { qty: number; avgPrice: number; totalOffsetSum: number; grades: Set<string> }> = {};

      branchBoxes.forEach(box => {
        box.items.forEach(item => {
          let key = "";
          if (mode === "mixed") key = item.productName;
          else if (mode === "separate") key = item.sku;
          else if (mode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

          if (!groups[key]) groups[key] = { qty: 0, avgPrice: 0, totalOffsetSum: 0, grades: new Set() };
          
          const basePrice = getHistoricalPrice(item, baseStageKey);
          const newQty = groups[key].qty + item.quantity;
          groups[key].avgPrice = (groups[key].avgPrice * groups[key].qty + basePrice * item.quantity) / newQty;
          groups[key].totalOffsetSum += ((item as any).cp1Offset || 0) * item.quantity;
          groups[key].qty = newQty;
          groups[key].grades.add(item.grade);
        });
      });

      // Apply markup to each group (same as calculateRowPrice in stage form)
      Object.entries(groups).forEach(([key, group]) => {
        let finalPrice: number;

        if (config.rowOverrides && config.rowOverrides[key] !== undefined) {
          finalPrice = config.rowOverrides[key];
          grandTotal += finalPrice * group.qty;
        } else {
          // If we are in CP-5, we need to apply offsets per item because the sum of offsets 
          // in a partial branch might not be zero.
          if (pair.to === "CP-5") {
            const avgOffset = group.totalOffsetSum / group.qty;
            let price = ((group.avgPrice + avgOffset) * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);

            if (config.enableGradeMarkups && config.gradeMarkups) {
              const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
              let highestGradeInGroup = -1;
              gradesList.forEach((g, idx) => { if (group.grades.has(g)) highestGradeInGroup = idx; });
              
              if (highestGradeInGroup !== -1) {
                for (let i = 0; i <= highestGradeInGroup; i++) {
                  price += (config.gradeMarkups[gradesList[i]] || 0);
                }
              }
            }
            grandTotal += Math.round(price) * group.qty;
          } else {
            let price = (group.avgPrice * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);

            if (config.enableGradeMarkups && config.gradeMarkups) {
              const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
              let highestIndex = -1;
              gradesList.forEach((g, idx) => { if (group.grades.has(g)) highestIndex = idx; });
              if (highestIndex !== -1) {
                for (let i = 0; i <= highestIndex; i++) {
                  price += (config.gradeMarkups[gradesList[i]] || 0);
                }
              }
            }
            finalPrice = Math.round(price);
            grandTotal += finalPrice * group.qty;
          }
        }
      });
    });

    return grandTotal;
  };

  const cp1Total = calculateStageTotal("CP1");
  const cp2Total = calculateStageTotal("CP2");
  const cp3Total = calculateStageTotal("CP3");
  const cp4Total = calculateStageTotal("CP4");
  const cp5Total = calculateStageTotal("CP5");

  // Compute per-branch stats: total qty and total current stage value
  const computeBranchStats = (branch: any): { totalQty: number; totalValue: number } => {
    const config = JSON.parse(branch.markupConfig || "{}");
    const mode = branch.configurationMode || "mixed";
    const branchBoxIds = branch.invoiceBoxes.map((ib: any) => ib.boxId);
    const branchBoxes = allBoxes.filter(b => branchBoxIds.includes(b.id));
    const baseStage = branch.fromCompany.replace("CP-", "CP"); // "CP-2" -> "CP2"

    const groups: Record<string, { qty: number; avgPrice: number; totalOffsetSum: number; grades: Set<string> }> = {};
    branchBoxes.forEach(box => {
      box.items.forEach((item: any) => {
        let key = "";
        if (mode === "mixed") key = item.productName;
        else if (mode === "separate") key = item.sku;
        else if (mode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;
        if (!groups[key]) groups[key] = { qty: 0, avgPrice: 0, totalOffsetSum: 0, grades: new Set() };
        const basePrice = getHistoricalPrice(item, baseStage);
        const newQty = groups[key].qty + item.quantity;
        groups[key].avgPrice = (groups[key].avgPrice * groups[key].qty + basePrice * item.quantity) / newQty;
        groups[key].totalOffsetSum += ((item as any).cp1Offset || 0) * item.quantity;
        groups[key].qty = newQty;
        groups[key].grades.add(item.grade);
      });
    });

    let totalQty = 0;
    let totalValue = 0;
    Object.entries(groups).forEach(([key, group]) => {
      if (config.rowOverrides && config.rowOverrides[key] !== undefined) {
        totalValue += config.rowOverrides[key] * group.qty;
        totalQty += group.qty;
      } else {
        if (branch.toCompany === "CP-5") {
          const avgOffset = group.totalOffsetSum / group.qty;
          let price = ((group.avgPrice + avgOffset) * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);
          if (config.enableGradeMarkups && config.gradeMarkups) {
            const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
            let highestGradeInGroup = -1;
            gradesList.forEach((g, idx) => { if (group.grades.has(g)) highestGradeInGroup = idx; });
            if (highestGradeInGroup !== -1) for (let i = 0; i <= highestGradeInGroup; i++) price += (config.gradeMarkups[gradesList[i]] || 0);
          }
          totalValue += Math.round(price) * group.qty;
          totalQty += group.qty;
        } else {
          let price = (group.avgPrice * (1 + (config.percentageMarkup || 0) / 100)) + (config.flatMarkup || 0);
          if (config.enableGradeMarkups && config.gradeMarkups) {
            const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
            let highestIndex = -1;
            gradesList.forEach((g, idx) => { if (group.grades.has(g)) highestIndex = idx; });
            if (highestIndex !== -1) for (let i = 0; i <= highestIndex; i++) price += (config.gradeMarkups[gradesList[i]] || 0);
          }
          const finalPrice = Math.round(price);
          totalValue += finalPrice * group.qty;
          totalQty += group.qty;
        }
      }
    });
    return { totalQty, totalValue };
  };

  const masterData = cycle.boxes.flatMap(box => 
    box.items.map(item => ({
      box: box.wioNumber,
      sku: item.sku,
      productName: item.productName,
      qty: item.quantity,
      cp1: item.cp1Price,
      cp3: getHistoricalPrice(item, "CP3"),
      cp4: getHistoricalPrice(item, "CP4"),
      cp5: getHistoricalPrice(item, "CP5"),
    }))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginTop: '1rem' }}>
      <div style={{ padding: '0 0.5rem' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Link 
            href="/dashboard" 
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: '6px', display: 'inline-flex', gap: '0.5rem' }}
          >
            &larr; Back to Dashboard
          </Link>
        </div>
        
        <RenameCycleForm id={cycle.id} initialName={cycle.name} />

        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
          <div className="card text-center" style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">Boxes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{cycle.boxes.length}</div>
            <div className="text-xs" style={{ visibility: 'hidden', marginTop: '2px' }}>Placeholder</div>
          </div>
          <div className="card text-center" style={{ flex: 1, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">Units</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{totalItems}</div>
            <div className="text-xs" style={{ visibility: 'hidden', marginTop: '2px' }}>Placeholder</div>
          </div>
          <div className="card text-center" style={{ flex: 1.5, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">CP-1 Sale Total</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>€{cp1Total.toLocaleString()}</div>
            <div className="text-xs" style={{ visibility: 'hidden', marginTop: '2px' }}>Placeholder</div>
          </div>
          <div className="card text-center" style={{ flex: 1.5, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">CP-2 Sale Total</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>€{cp3Total.toLocaleString()}</div>
            <div className="text-xs" style={{ color: 'var(--accent-success)', marginTop: '2px' }}>
              +€{(cp3Total - cp2Total).toLocaleString()} Profit
            </div>
          </div>
          <div className="card text-center" style={{ flex: 1.5, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">CP-3 Sale Total</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>€{cp4Total.toLocaleString()}</div>
            <div className="text-xs" style={{ color: 'var(--accent-success)', marginTop: '2px' }}>
              +€{(cp4Total - cp3Total).toLocaleString()} Profit
            </div>
          </div>
          <div className="card text-center" style={{ flex: 1.5, padding: '1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">CP-4 Sale Total</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>€{cp5Total.toLocaleString()}</div>
            <div className="text-xs" style={{ color: 'var(--accent-success)', marginTop: '2px' }}>
              +€{(cp5Total - cp4Total).toLocaleString()} Profit
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: '1.5rem', margin: '0 0.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>Export Pipeline</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          {STAGES.map((stage) => {
            const stageExports = cycle.exports.filter(e => e.fromCompany === stage.from && e.toCompany === stage.to);

            // Accumulate stats across all branches in this stage
            const stageStats = stageExports.reduce(
              (acc, exp) => {
                const s = computeBranchStats(exp);
                return { totalQty: acc.totalQty + s.totalQty, totalValue: acc.totalValue + s.totalValue };
              },
              { totalQty: 0, totalValue: 0 }
            );

            return (
              <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: 'var(--text-secondary)', fontWeight: 800, margin: 0 }}>
                      {stage.from} &rarr; {stage.to}
                    </h3>
                    {stageExports.length > 0 && (
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.07)', padding: '0.2rem 0.75rem', borderRadius: '20px', color: 'var(--text-secondary)' }}>
                          {stageStats.totalQty.toLocaleString()} units
                        </span>
                        <span style={{ fontSize: '0.75rem', background: 'rgba(99,179,237,0.12)', padding: '0.2rem 0.75rem', borderRadius: '20px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                          €{stageStats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                  <Link 
                    href={`/dashboard/cycle/${cycle.id}/stage/${stage.id}/new`} 
                    className="btn btn-secondary"
                    style={{ padding: '0.4rem 1rem', fontSize: '0.75rem', borderRadius: '8px' }}
                  >
                    + Add Branch
                  </Link>
                </div>
                
                {stageExports.length === 0 ? (
                  <div style={{ 
                    background: 'rgba(255,255,255,0.01)', 
                    border: '1px dashed var(--border-subtle)', 
                    borderRadius: '16px',
                    padding: '3rem', 
                    textAlign: 'center' 
                  }}>
                    <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>No pricing branches configured for this stage.</p>
                    <Link 
                      href={`/dashboard/cycle/${cycle.id}/stage/${stage.id}/new`} 
                      className="btn btn-primary" 
                      style={{ fontSize: '0.875rem', padding: '0.6rem 1.5rem' }}
                    >
                      Configure First Branch
                    </Link>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {stageExports.map(exp => {
                        const stats = computeBranchStats(exp);
                        return (
                          <BranchItem 
                            key={exp.id} 
                            exp={exp} 
                            cycleId={cycle.id} 
                            stageId={stage.id}
                            totalQty={stats.totalQty}
                            totalValue={stats.totalValue}
                          />
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <MasterPriceGrid data={masterData} />
    </div>
  );
}
