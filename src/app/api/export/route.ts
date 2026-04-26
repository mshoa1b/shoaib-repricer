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

      // Find all items in this group in THAT stage to calculate the shared average base price
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
      
      // STACKED Grade Markups for historical stages
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

    // 1. First Pass: Calculate groups and their grades for the CURRENT stage
    const currentBoxIds = boxIds;
    const groupData: Record<string, { qty: number, totalPriceSum: number, grades: Set<string> }> = {};
    
    allBoxes.filter(b => currentBoxIds.includes(b.id)).forEach(box => {
      box.items.forEach(item => {
        let key = "";
        if (configMode === "mixed") key = item.productName;
        else if (configMode === "separate") key = item.sku;
        else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

        if (!groupData[key]) {
          groupData[key] = { qty: 0, totalPriceSum: 0, grades: new Set<string>() };
        }
        
        const basePriceForThisStage = getHistoricalPrice(item, fromCompany);
        
        groupData[key].qty += item.quantity;
        groupData[key].totalPriceSum += (basePriceForThisStage * item.quantity);
        groupData[key].grades.add(item.grade);
      });
    });

    // 2. Second Pass: Calculate the single "Stage Price" for each group
    const stagePrices: Record<string, number> = {};
    Object.entries(groupData).forEach(([key, data]) => {
      const avgBasePrice = data.totalPriceSum / data.qty;
      
      let finalPrice = 0;
      if (rowOverrides && rowOverrides[key] !== undefined) {
        finalPrice = rowOverrides[key];
      } else {
        let priced = (avgBasePrice * (1 + (percentageMarkup || 0) / 100)) + (flatMarkup || 0);
        
        // STACKED Grade Markups for current stage
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
        finalPrice = Math.round(priced);
      }
      stagePrices[key] = finalPrice;
    });

    // 3. Third Pass: Build raw CSV records
    const csvRecords: any[] = [];
    allBoxes.filter(b => currentBoxIds.includes(b.id)).forEach(box => {
      box.items.forEach(item => {
        let key = "";
        if (configMode === "mixed") key = item.productName;
        else if (configMode === "separate") key = item.sku;
        else if (configMode === "premium-mixed") key = item.grade === "Premium" ? item.sku : `${item.productName}_NON_PREMIUM`;

        const finalPrice = stagePrices[key];

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
