import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createObjectCsvStringifier } from "csv-writer";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const cycleId = formData.get("cycleId") as string;
    const fromCompany = formData.get("fromCompany") as string;
    const toCompany = formData.get("toCompany") as string;
    const boxIds = JSON.parse(formData.get("boxIds") as string) as string[];
    const configMode = formData.get("configMode") as string;
    const markupConfig = JSON.parse(formData.get("markupConfig") as string);

    const { percentageMarkup, flatMarkup, enableGradeMarkups, gradeMarkups, rowOverrides } = markupConfig;

    const cycle = await prisma.cycle.findUnique({
      where: { id: cycleId },
      include: { 
        boxes: { include: { items: true } },
        exports: { include: { invoiceBoxes: true } }
      }
    });

    if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

    const allExports = cycle.exports;
    const allBoxes = cycle.boxes;

    // Recursive pricing logic to follow the "Sold As" model of previous stages
    const getHistoricalPrice = (item: any, targetStage: string): number => {
      if (targetStage === "CP-1" || targetStage === "CP-2") return item.cp1Price;

      // Find which box this item belongs to
      const box = allBoxes.find(b => b.items.some(i => i.id === item.id));
      if (!box) return item.cp1Price;

      if (targetStage === "CP-3") {
        const exportRecord = allExports.find(e => 
          e.fromCompany === "CP-2" && 
          e.toCompany === "CP-3" && 
          e.invoiceBoxes.some((ib: any) => ib.boxId === box.id)
        );
        if (!exportRecord) return item.cp1Price;
        return calculatePriceForExport(item, "CP-2", exportRecord);
      }

      if (targetStage === "CP-4") {
        const exportRecord = allExports.find(e => 
          e.fromCompany === "CP-3" && 
          e.toCompany === "CP-4" && 
          e.invoiceBoxes.some((ib: any) => ib.boxId === box.id)
        );
        if (!exportRecord) return getHistoricalPrice(item, "CP-3");
        return calculatePriceForExport(item, "CP-3", exportRecord);
      }

      if (targetStage === "CP-5") {
        const exportRecord = allExports.find(e => 
          e.fromCompany === "CP-4" && 
          e.toCompany === "CP-5" && 
          e.invoiceBoxes.some((ib: any) => ib.boxId === box.id)
        );
        if (!exportRecord) return getHistoricalPrice(item, "CP-4");
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
      
      // Apply Grade Splitting Offset for the final stage (CP-4 -> CP-5)
      let baseWithOffset = avgBasePrice;
      if (exportRecord.toCompany === "CP-5") {
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

    const currentBoxIds = boxIds;
    const groupData: Record<string, { qty: number, totalPriceSum: number, totalOffsetSum: number, grades: Set<string> }> = {};
    
    allBoxes.filter(b => currentBoxIds.includes(b.id)).forEach(box => {
      box.items.forEach(item => {
        let key = "";
        if (configMode === "mixed") key = item.productName;
        else if (configMode === "separate") key = item.sku;
        else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

        if (!groupData[key]) {
          groupData[key] = { qty: 0, totalPriceSum: 0, totalOffsetSum: 0, grades: new Set<string>() };
        }
        
        const basePriceForThisStage = getHistoricalPrice(item, fromCompany);
        
        groupData[key].qty += item.quantity;
        groupData[key].totalPriceSum += (basePriceForThisStage * item.quantity);
        groupData[key].totalOffsetSum += (((item as any).cp1Offset || 0) * item.quantity);
        groupData[key].grades.add(item.grade);
      });
    });

    // Pre-calculate group prices to ensure rounding matches the UI's aggregated view
    const groupPrices: Record<string, number> = {};
    Object.entries(groupData).forEach(([key, data]) => {
      if (rowOverrides && rowOverrides[key] !== undefined) {
        groupPrices[key] = rowOverrides[key];
        return;
      }

      const avgBasePrice = data.totalPriceSum / data.qty;
      const avgOffset = data.totalOffsetSum / data.qty;
      
      let base = avgBasePrice;
      if (toCompany === "CP-5") {
        base += avgOffset;
      }

      let priced = (base * (1 + (percentageMarkup / 100))) + flatMarkup;
      if (enableGradeMarkups && gradeMarkups) {
        const gradesList = ["B Grade", "G Grade", "A Grade", "Premium"];
        let highestIndex = -1;
        gradesList.forEach((g, idx) => {
          if (data.grades.has(g)) highestIndex = idx;
        });
        if (highestIndex !== -1) {
          for (let i = 0; i <= highestIndex; i++) {
            priced += (gradeMarkups[gradesList[i]] || 0);
          }
        }
      }
      groupPrices[key] = Math.round(priced);
    });

    const csvRecords: any[] = [];
    allBoxes.filter(b => currentBoxIds.includes(b.id)).forEach(box => {
      box.items.forEach(item => {
        let key = "";
        if (configMode === "mixed") key = item.productName;
        else if (configMode === "separate") key = item.sku;
        else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

        let finalPrice = groupPrices[key] || 0;

        csvRecords.push({
          wioName: box.wioName,
          sku: item.sku,
          productName: item.productName,
          qty: item.quantity,
          purchase: finalPrice.toFixed(2)
        });
      });
    });

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: "wioName", title: "WIO Name" },
        { id: "sku", title: "SKU" },
        { id: "productName", title: "Product Name" },
        { id: "qty", title: "Qty" },
        { id: "purchase", title: "Purchase" },
      ],
    });

    const csvString = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(csvRecords);

    return new NextResponse(csvString, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="export_${fromCompany}_to_${toCompany}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
