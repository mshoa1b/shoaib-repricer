import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StageConfigForm } from "../stage-form";

function determineGrade(sku: string): string {
  const upperSku = sku.toUpperCase();
  const firstPart = upperSku.split("-")[0] || "";
  if (upperSku.endsWith("-P") || upperSku.includes("PR-") || firstPart.includes("PPR")) return "Premium";
  if (upperSku.endsWith("-A")) return "A Grade";
  if (upperSku.endsWith("-G")) return "G Grade";
  if (upperSku.endsWith("-B")) return "B Grade";
  return "Unknown";
}

function getBaseSku(sku: string): string {
  const upper = sku.toUpperCase();
  if (upper.endsWith("-A") || upper.endsWith("-G") || upper.endsWith("-B") || upper.endsWith("-P")) {
    return sku.substring(0, sku.length - 2);
  }
  return sku;
}

function calculatePricesForExportRecord(exportRecord: any) {
  const config = JSON.parse(exportRecord.markupConfig || "{}");
  const mode = exportRecord.configurationMode;

  const exportBoxIds = exportRecord.invoiceBoxes.map((ib: any) => ib.boxId);
  const allExportItems = exportRecord.cycle.boxes
    .filter((b: any) => exportBoxIds.includes(b.id))
    .flatMap((b: any) => b.items);

  // Overwrite grades
  allExportItems.forEach((i: any) => {
    i.grade = determineGrade(i.sku);
  });

  const getHistoricalPrice = (item: any, targetStage: string): number => {
    const stage = targetStage.replace("-", "");
    if (stage === "CP1" || stage === "CP2") return item.cp1Price;

    const boxId = item.boxId || exportRecord.cycle.boxes.find((b: any) => b.items.some((i: any) => i.id === item.id))?.id;
    if (!boxId) return item.cp1Price;

    if (stage === "CP3") {
      const expRec = exportRecord.cycle.exports.find((e: any) => 
        e.fromCompany === "CP-2" && 
        e.toCompany === "CP-3" && 
        e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!expRec) return item.cp1Price;
      return calculatePriceForExport(item, "CP-2", expRec);
    }

    if (stage === "CP4") {
      const expRec = exportRecord.cycle.exports.find((e: any) => 
        e.fromCompany === "CP-3" && 
        e.toCompany === "CP-4" && 
        e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!expRec) return getHistoricalPrice(item, "CP3");
      return calculatePriceForExport(item, "CP-3", expRec);
    }

    if (stage === "CP5") {
      const expRec = exportRecord.cycle.exports.find((e: any) => 
        e.fromCompany === "CP-4" && 
        e.toCompany === "CP-5" && 
        e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!expRec) return getHistoricalPrice(item, "CP4");
      return calculatePriceForExport(item, "CP-4", expRec);
    }

    return item.cp1Price;
  };

  const calculatePriceForExport = (item: any, baseStage: string, exportRec: any): number => {
    const cfg = JSON.parse(exportRec.markupConfig || "{}");
    const m = exportRec.configurationMode;

    let key = "";
    if (m === "mixed") key = item.productName;
    else if (m === "separate") key = item.sku;
    else if (m === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

    if (cfg.rowOverrides && cfg.rowOverrides[key] !== undefined) {
      return cfg.rowOverrides[key];
    }

    const expBoxIds = exportRec.invoiceBoxes.map((ib: any) => ib.boxId);
    const expItems = exportRecord.cycle.boxes
      .filter((b: any) => expBoxIds.includes(b.id))
      .flatMap((b: any) => b.items);

    const groupItems = expItems.filter((i: any) => {
      let iKey = "";
      if (m === "mixed") iKey = i.productName;
      else if (m === "separate") iKey = i.sku;
      else if (m === "premium-mixed") iKey = i.grade === "Premium" ? i.sku : `${i.productName}_NON_PREMIUM`;
      return iKey === key;
    });

    if (groupItems.length === 0) return getHistoricalPrice(item, baseStage);

    let totalQty = 0;
    let totalPriceSum = 0;
    const gradesInGroup = new Set<string>();

    groupItems.forEach((gi: any) => {
      let giBasePrice = getHistoricalPrice(gi, baseStage);
      if (cfg.enableEctonGrading) {
        const grade = gi.grade || determineGrade(gi.sku);
        if (grade === "A Grade" || grade === "G Grade" || grade === "B Grade") {
          const baseSku = getBaseSku(gi.sku);
          const peers = expItems.filter((p: any) => {
            const pGrade = p.grade || determineGrade(p.sku);
            return getBaseSku(p.sku) === baseSku && (pGrade === "A Grade" || pGrade === "G Grade" || pGrade === "B Grade");
          });
          let totalVal = 0;
          let totalQtyVal = 0;
          peers.forEach((p: any) => {
            totalVal += getHistoricalPrice(p, baseStage) * p.quantity;
            totalQtyVal += p.quantity;
          });
          if (totalQtyVal > 0) {
            const avg = totalVal / totalQtyVal;
            if (grade === "A Grade") giBasePrice = avg * 1.08;
            else if (grade === "G Grade") giBasePrice = avg * 1.00;
            else if (grade === "B Grade") giBasePrice = avg * 0.90;
          }
        }
      }
      totalPriceSum += (giBasePrice * gi.quantity);
      totalQty += gi.quantity;
      gradesInGroup.add(gi.grade);
    });

    const avgBasePrice = totalPriceSum / totalQty;

    let baseWithOffset = avgBasePrice;
    if (exportRec.toCompany === "CP-5") {
      const applyOffset = cfg.enableEctonGrading ? 0 : (item.cp1Offset || 0);
      baseWithOffset += applyOffset;
    }

    let price = (baseWithOffset * (1 + (cfg.percentageMarkup || 0) / 100)) + (cfg.flatMarkup || 0);

    if (cfg.enableGradeMarkups && cfg.gradeMarkups) {
      const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
      let highestIndex = -1;
      gradesList.forEach((g, idx) => {
        if (gradesInGroup.has(g)) highestIndex = idx;
      });
      if (highestIndex !== -1) {
        for (let i = 0; i <= highestIndex; i++) {
          price += (cfg.gradeMarkups[gradesList[i]] || 0);
        }
      }
    }
    return Math.round(price);
  };

  const skuPrices: Record<string, number> = {};
  allExportItems.forEach((item: any) => {
    const price = calculatePriceForExport(item, "CP-4", exportRecord);
    skuPrices[item.sku] = price;
  });

  return skuPrices;
}

export default async function BranchPage({ params }: { params: Promise<{ id: string, stageId: string, branchId: string }> }) {
  const { id, stageId, branchId } = await params;
  const cycle = await prisma.cycle.findUnique({
    where: { id },
    include: {
      boxes: {
        include: { items: true }
      },
      exports: {
        include: { invoiceBoxes: true }
      }
    }
  });

  if (!cycle) return notFound();

  // Dynamically overwrite grade for all items using the latest classification rules
  cycle.boxes.forEach(box => {
    box.items.forEach(item => {
      item.grade = determineGrade(item.sku);
    });
  });

  const stageParts = stageId.split('-');
  if (stageParts.length < 2) return notFound();
  
  const from = stageId.split('-')[0].toUpperCase().replace('CP', 'CP-');
  const to = stageId.split('-')[1].toUpperCase().replace('CP', 'CP-');

  const existingExport = branchId === 'new' ? null : cycle.exports.find(e => e.id === branchId);

  // Compute cross-cycle prevBranchData for CP-4 -> CP-5
  let prevBranchDataOverride: Record<string, { price: number; branchId: string; branchName: string }> = {};

  if (from === "CP-4" && to === "CP-5") {
    const allCp4Cp5Exports = await prisma.invoiceExport.findMany({
      where: {
        fromCompany: "CP-4",
        toCompany: "CP-5",
        id: branchId !== 'new' ? { not: branchId } : undefined
      },
      orderBy: {
        createdAt: "desc"
      },
      include: {
        cycle: {
          include: {
            boxes: {
              include: { items: true }
            },
            exports: {
              include: { invoiceBoxes: true }
            }
          }
        },
        invoiceBoxes: true
      }
    });

    // Overwrite grades for loaded cycles
    allCp4Cp5Exports.forEach((exp: any) => {
      exp.cycle.boxes.forEach((b: any) => {
        b.items.forEach((item: any) => {
          item.grade = determineGrade(item.sku);
        });
      });
    });

    // Populate the latest price lookup map per SKU
    allCp4Cp5Exports.forEach((exp: any) => {
      try {
        const skuPrices = calculatePricesForExportRecord(exp);
        for (const [sku, price] of Object.entries(skuPrices)) {
          if (prevBranchDataOverride[sku] === undefined) {
            prevBranchDataOverride[sku] = {
              price,
              branchId: exp.id,
              branchName: exp.branchName || "Unnamed Branch"
            };
          }
        }
      } catch (err) {
        console.error("Error calculating price for export branch", exp.id, err);
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="mt-4">
        <Link 
          href={`/dashboard/cycle/${cycle.id}`} 
          className="btn btn-secondary"
          style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: '6px', marginBottom: '2rem', display: 'inline-flex', gap: '0.5rem' }}
        >
          &larr; Back to Pipeline
        </Link>
      </div>

      <div className="card glass-card">
        <StageConfigForm
          cycleId={cycle.id}
          boxes={cycle.boxes}
          stageId={stageId}
          branchId={branchId}
          initialData={existingExport}
          allExports={cycle.exports}
          fromCompany={from}
          toCompany={to}
          prevBranchDataOverride={prevBranchDataOverride}
        />
      </div>
    </div>
  );
}
