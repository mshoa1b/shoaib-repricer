import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { StageConfigForm } from "./stage-form";

export default async function StagePage({ params }: { params: Promise<{ id: string, stageId: string }> }) {
  const { id, stageId } = await params;
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

  // Basic info parsing
  const stageParts = stageId.split('-');
  if (stageParts.length < 2) return notFound();
  
  const fromCompany = stageParts[0].toUpperCase();
  const toCompany = stageParts[1].toUpperCase();

  const existingExport = cycle.exports.find(e => 
    e.fromCompany === fromCompany && e.toCompany === toCompany
  );

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
          initialData={existingExport}
          allExports={cycle.exports}
        />
      </div>
    </div>
  );
}
