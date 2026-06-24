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
  
  const fromCompany = stageParts[0].toUpperCase() + '-' + stageParts[1].split('-')[0]; // Adjusting for CP-X
  // Wait, stageId is "cp2-cp3".
  const from = stageId.split('-')[0].toUpperCase().replace('CP', 'CP-');
  const to = stageId.split('-')[1].toUpperCase().replace('CP', 'CP-');

  const existingExport = branchId === 'new' ? null : cycle.exports.find(e => e.id === branchId);

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
        />
      </div>
    </div>
  );
}
