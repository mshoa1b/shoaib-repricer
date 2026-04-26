"use server";

import { prisma } from "@/lib/prisma";

export async function login(password: string) {
  const { cookies } = await import("next/headers");
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  if (password === adminPassword) {
    const cookieStore = await cookies();
    cookieStore.set("auth", "true", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });
    return { success: true };
  }
  return { success: false, error: "Invalid password" };
}

export async function logout() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  cookieStore.delete("auth");
}
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
  
  const data: any[] = xlsx.utils.sheet_to_json(sheet);
  
  const ingestionName = `Batch - ${file.name} - ${new Date().toISOString().split("T")[0]}`;
  const ingestion = await (prisma as any).ingestion.create({
    data: {
      name: ingestionName,
    }
  });

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
      cp1Price: Number(row["Ecosystem Sale"] || row["Price"] || row["Telecore Sale"] || 0),
    });
  }

  for (const [wioNumber, boxData] of Array.from(boxesMap.entries())) {
    const box = await prisma.box.create({
      data: {
        wioNumber,
        wioName: boxData.wioName,
        ingestionId: ingestion.id,
      } as any
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
  return ingestion.id;
}

export async function createCycle(name: string, boxIds: string[]) {
  const cycle = await prisma.cycle.create({
    data: {
      name,
      boxes: {
        connect: boxIds.map(id => ({ id }))
      }
    }
  });
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
  id?: string,
  cycleId: string,
  fromCompany: string,
  toCompany: string,
  configurationMode: string,
  markupConfig: string,
  boxIds: string[],
  branchName?: string
}) {
  const recordId = data.id;

  if (recordId) {
    await prisma.invoiceExport.update({
      where: { id: recordId },
      data: {
        branchName: data.branchName || null,
        configurationMode: data.configurationMode,
        markupConfig: data.markupConfig,
        invoiceBoxes: {
          deleteMany: {},
          create: data.boxIds.map(id => ({ boxId: id }))
        }
      } as any
    });
    revalidatePath(`/dashboard/cycle/${data.cycleId}`);
    return recordId;
  } else {
    const created = await prisma.invoiceExport.create({
      data: {
        cycleId: data.cycleId,
        fromCompany: data.fromCompany,
        toCompany: data.toCompany,
        branchName: data.branchName || null,
        configurationMode: data.configurationMode,
        markupConfig: data.markupConfig,
        invoiceBoxes: {
          create: data.boxIds.map(id => ({ boxId: id }))
        }
      } as any
    });
    revalidatePath(`/dashboard/cycle/${data.cycleId}`);
    return created.id;
  }
}
export async function deleteCycle(id: string) {
  await prisma.cycle.delete({
    where: { id }
  });
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteBranch(id: string, cycleId: string) {
  await prisma.invoiceExport.delete({
    where: { id }
  });
  revalidatePath(`/dashboard/cycle/${cycleId}`);
  return { success: true };
}
