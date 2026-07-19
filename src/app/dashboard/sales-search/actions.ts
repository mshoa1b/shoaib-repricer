"use server";

import { prisma } from "@/lib/prisma";

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

export async function searchSoldItems(stageCategory: string, query: string, exactMatch: boolean = false) {
  let from = "";
  let to = "";

  if (stageCategory === "CP2 to CP3") {
    from = "CP-2";
    to = "CP-3";
  } else if (stageCategory === "CP3 to CP4") {
    from = "CP-3";
    to = "CP-4";
  } else if (stageCategory === "CP4 to CP5") {
    from = "CP-4";
    to = "CP-5";
  } else {
    throw new Error("Invalid sale category");
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const branches = await prisma.invoiceExport.findMany({
    where: {
      fromCompany: from,
      toCompany: to,
      createdAt: {
        lt: startOfToday
      }
    },
    include: {
      invoiceBoxes: {
        include: {
          box: {
            include: {
              items: true
            }
          }
        }
      },
      cycle: {
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
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const results: any[] = [];

  branches.forEach(branch => {
    const items = calculatePricesForBranch(branch);
    const lowerQuery = query.toLowerCase().trim();

    items.forEach((item: any) => {
      let match = false;
      if (!lowerQuery) {
        match = true;
      } else if (exactMatch) {
        match = item.sku.toLowerCase() === lowerQuery || 
                item.productName.toLowerCase() === lowerQuery;
      } else {
        match = item.sku.toLowerCase().includes(lowerQuery) || 
                item.productName.toLowerCase().includes(lowerQuery);
      }

      if (match) {
        results.push({
          id: `${branch.id}-${item.id}`,
          dateSold: branch.createdAt,
          branchId: branch.id,
          branchName: branch.branchName || "Unnamed Branch",
          wioName: item.wioName || "Unknown",
          productName: item.productName,
          sku: item.sku,
          grade: item.grade,
          qty: item.qty,
          finalPrice: item.finalPrice,
          totalValue: item.finalPrice * item.qty
        });
      }
    });
  });

  // Sort by date DESC
  results.sort((a, b) => new Date(b.dateSold).getTime() - new Date(a.dateSold).getTime());

  return results;
}

function calculatePricesForBranch(branch: any) {
  const config = JSON.parse(branch.markupConfig || "{}");
  const mode = branch.configurationMode;

  const exportBoxIds = branch.invoiceBoxes.map((ib: any) => ib.boxId);
  const allExportItems = branch.cycle.boxes
    .filter((b: any) => exportBoxIds.includes(b.id))
    .flatMap((b: any) => b.items);

  allExportItems.forEach((i: any) => {
    i.grade = determineGrade(i.sku);
  });

  const getHistoricalPrice = (item: any, targetStage: string): number => {
    const stage = targetStage.replace("-", "");
    if (stage === "CP1" || stage === "CP2") return item.cp1Price;

    const boxId = item.boxId || branch.cycle.boxes.find((b: any) => b.items.some((i: any) => i.id === item.id))?.id;
    if (!boxId) return item.cp1Price;

    if (stage === "CP3") {
      const expRec = branch.cycle.exports.find((e: any) => 
        e.fromCompany === "CP-2" && 
        e.toCompany === "CP-3" && 
        e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!expRec) return item.cp1Price;
      return calculatePriceForExport(item, "CP-2", expRec);
    }

    if (stage === "CP4") {
      const expRec = branch.cycle.exports.find((e: any) => 
        e.fromCompany === "CP-3" && 
        e.toCompany === "CP-4" && 
        e.invoiceBoxes.some((ib: any) => ib.boxId === boxId)
      );
      if (!expRec) return getHistoricalPrice(item, "CP3");
      return calculatePriceForExport(item, "CP-3", expRec);
    }

    if (stage === "CP5") {
      const expRec = branch.cycle.exports.find((e: any) => 
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
    const expItems = branch.cycle.boxes
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
          let originalTotalVal = 0;
          let ectonDenominator = 0;
          peers.forEach((p: any) => {
            const pGrade = p.grade || determineGrade(p.sku);
            originalTotalVal += getHistoricalPrice(p, baseStage) * p.quantity;
            if (pGrade === "A Grade") ectonDenominator += 1.08 * p.quantity;
            else if (pGrade === "G Grade") ectonDenominator += 1.00 * p.quantity;
            else if (pGrade === "B Grade") ectonDenominator += 0.90 * p.quantity;
          });
          if (ectonDenominator > 0) {
            const baselinePrice = originalTotalVal / ectonDenominator;
            if (grade === "A Grade") giBasePrice = baselinePrice * 1.08;
            else if (grade === "G Grade") giBasePrice = baselinePrice * 1.00;
            else if (grade === "B Grade") giBasePrice = baselinePrice * 0.90;
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

  const itemsWithPrices = allExportItems.map((item: any) => {
    const fromCompany = branch.fromCompany;
    const finalPrice = calculatePriceForExport(item, fromCompany, branch);
    const avgLastStage = getHistoricalPrice(item, fromCompany);
    const parentBox = branch.cycle.boxes.find((b: any) => b.id === item.boxId);
    const wioName = parentBox ? parentBox.wioName : "Unknown";
    return {
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      grade: item.grade,
      qty: item.quantity,
      avgPrice: avgLastStage,
      originalAvgPrice: avgLastStage,
      avgOffset: branch.toCompany === "CP-5" ? (config.enableEctonGrading ? 0 : (item.cp1Offset || 0)) : 0,
      finalPrice,
      wioName
    };
  });

  return itemsWithPrices;
}
