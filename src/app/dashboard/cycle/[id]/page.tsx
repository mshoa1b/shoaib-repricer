import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { RenameCycleForm } from "./rename-form";
import { MasterPriceGrid } from "./price-grid";

const STAGES = [
  { id: "cp2-cp3", from: "CP-2", to: "CP-3", desc: "Premium, A/G/B separate" },
  { id: "cp3-cp4", from: "CP-3", to: "CP-4", desc: "Premium, A/G/B separate" },
  { id: "cp4-cp5", from: "CP-4", to: "CP-5", desc: "Premium, A/G/B separate" },
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
    if (targetStage === "CP1") return item.cp1Price;
    if (targetStage === "CP2") return item.cp1Price;

    if (targetStage === "CP3") {
      const exportRecord = allExports.find(e => e.fromCompany === "CP2" && e.toCompany === "CP3");
      if (!exportRecord) return item.cp1Price;
      return calculatePriceForExport(item, "CP2", exportRecord);
    }

    if (targetStage === "CP4") {
      const exportRecord = allExports.find(e => e.fromCompany === "CP3" && e.toCompany === "CP4");
      if (!exportRecord) return getHistoricalPrice(item, "CP3");
      return calculatePriceForExport(item, "CP3", exportRecord);
    }

    if (targetStage === "CP5") {
      const exportRecord = allExports.find(e => e.fromCompany === "CP4" && e.toCompany === "CP5");
      if (!exportRecord) return getHistoricalPrice(item, "CP4");
      return calculatePriceForExport(item, "CP4", exportRecord);
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

  const calculateStageTotal = (stage: string) => {
    let total = 0;
    cycle.boxes.forEach(box => {
      box.items.forEach(item => {
        total += item.quantity * getHistoricalPrice(item, stage);
      });
    });
    return total;
  };

  const cp1Total = calculateStageTotal("CP1");
  const cp2Total = calculateStageTotal("CP2");
  const cp3Total = calculateStageTotal("CP3");
  const cp4Total = calculateStageTotal("CP4");
  const cp5Total = calculateStageTotal("CP5");

  // Calculate pricing summary by Grade
  const gradeSummary: Record<string, { count: number, totalQty: number, avgPrice: number }> = {};
  cycle.boxes.forEach(box => {
    box.items.forEach(item => {
      if (!gradeSummary[item.grade]) {
        gradeSummary[item.grade] = { count: 0, totalQty: 0, avgPrice: 0 };
      }
      gradeSummary[item.grade].count++;
      gradeSummary[item.grade].totalQty += item.quantity;
      gradeSummary[item.grade].avgPrice = ((gradeSummary[item.grade].avgPrice * (gradeSummary[item.grade].totalQty - item.quantity)) + (item.cp1Price * item.quantity)) / gradeSummary[item.grade].totalQty;
    });
  });

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
    <div className="flex flex-col gap-8">
      <div className="mt-4">
        <Link 
          href="/dashboard" 
          className="btn btn-secondary"
          style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: '6px', marginBottom: '2rem', display: 'inline-flex', gap: '0.5rem' }}
        >
          &larr; Back to Dashboard
        </Link>
        <RenameCycleForm id={cycle.id} initialName={cycle.name} />
        <div className="flex gap-4">
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



      <div className="card">
        <h2 className="mb-4">Export Pipeline</h2>
        <div className="flex flex-col gap-4">
          {STAGES.map((stage) => {
            const exp = cycle.exports.find(e => e.fromCompany === stage.from.replace('-','') && e.toCompany === stage.to.replace('-',''));
            const modeLabel = exp?.configurationMode === "mixed" ? "Mixed Grades (Grouped)" :
                             exp?.configurationMode === "separate" ? "All Separate (Individual SKUs)" :
                             exp?.configurationMode === "premium-mixed" ? "Premium Separate / Others Mixed" :
                             "Not configured yet";

            return (
              <div key={stage.id} className="card" style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem' }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>
                      {stage.from} &rarr; {stage.to}
                    </div>
                    <div className="text-secondary text-sm">{modeLabel}</div>
                  </div>
                  <div>
                    <Link href={`/dashboard/cycle/${cycle.id}/stage/${stage.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}>
                      {exp ? "Edit Strategy" : "Configure"}
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <MasterPriceGrid data={masterData} />
    </div>
  );
}
