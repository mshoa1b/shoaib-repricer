"use server";

import { prisma } from "@/lib/prisma";
import * as xlsx from "xlsx";
import { revalidatePath } from "next/cache";

function determineGrade(sku: string): string {
  const upperSku = sku.toUpperCase();
  if (upperSku.endsWith("-P") || upperSku.includes("PR-")) return "Premium";
  if (upperSku.endsWith("-A")) return "A Grade";
  if (upperSku.endsWith("-G")) return "G Grade";
  if (upperSku.endsWith("-B")) return "B Grade";
  return "Unknown";
}

export async function uploadIngestionFile(formData: FormData) {
  const file = formData.get("file") as File;
  if (!file) throw new Error("No file uploaded");

  const buffer = await file.arrayBuffer();
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convert sheet to JSON
  const data: any[] = xlsx.utils.sheet_to_json(sheet);
  
  // Create a new cycle
  const cycleName = `Shipment - ${new Date().toISOString().split("T")[0]}`;
  const cycle = await prisma.cycle.create({
    data: {
      name: cycleName,
    }
  });

  // Group by WIO Number (Box)
  const boxesMap = new Map<string, { wioName: string, items: any[] }>();

  for (const row of data) {
    const wioNumber = String(row["WIO Number"] || row["WIONumber"] || "").trim();
    if (!wioNumber) continue;

    if (!boxesMap.has(wioNumber)) {
      boxesMap.set(wioNumber, {
        wioName: String(row["WIO Name"] || row["WIOName"] || ""),
        items: []
      });
    }

    boxesMap.get(wioNumber)?.items.push({
      productName: String(row["Product Name"] || row["ProductName"] || ""),
      sku: String(row["SKU"] || ""),
      quantity: Number(row["Quantity"] || row["Qty"] || 0),
      cp1Price: Number(row["Telecore Sale"] || row["Price"] || 0),
    });
  }

  // Save to DB
  for (const [wioNumber, boxData] of Array.from(boxesMap.entries())) {
    const box = await prisma.box.create({
      data: {
        wioNumber,
        wioName: boxData.wioName,
        cycleId: cycle.id,
      }
    });

    for (const item of boxData.items) {
      await prisma.item.create({
        data: {
          boxId: box.id,
          productName: item.productName,
          sku: item.sku,
          grade: determineGrade(item.sku),
          quantity: item.quantity,
          cp1Price: item.cp1Price,
        }
      });
    }
  }

  revalidatePath("/dashboard");
  return cycle.id;
}

export async function renameCycle(id: string, newName: string) {
  await prisma.cycle.update({
    where: { id },
    data: { name: newName }
  });
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/cycle/${id}`);
}

export async function saveStageConfiguration(data: {
  cycleId: string,
  fromCompany: string,
  toCompany: string,
  configurationMode: string,
  markupConfig: string,
  boxIds: string[]
}) {
  const existing = await prisma.invoiceExport.findFirst({
    where: {
      cycleId: data.cycleId,
      fromCompany: data.fromCompany,
      toCompany: data.toCompany,
    }
  });

  if (existing) {
    await prisma.invoiceExport.update({
      where: { id: existing.id },
      data: {
        configurationMode: data.configurationMode,
        markupConfig: data.markupConfig,
        invoiceBoxes: {
          deleteMany: {},
          create: data.boxIds.map(id => ({ boxId: id }))
        }
      }
    });
    return existing.id;
  } else {
    const created = await prisma.invoiceExport.create({
      data: {
        cycleId: data.cycleId,
        fromCompany: data.fromCompany,
        toCompany: data.toCompany,
        configurationMode: data.configurationMode,
        markupConfig: data.markupConfig,
        invoiceBoxes: {
          create: data.boxIds.map(id => ({ boxId: id }))
        }
      }
    });
    return created.id;
  }
}
