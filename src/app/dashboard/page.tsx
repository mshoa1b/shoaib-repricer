import { prisma } from "@/lib/prisma";
import { UploadForm } from "./upload-form";
import { DeleteIngestionButton } from "./delete-ingestion-button";
import Link from "next/link";
import { IngestionsList } from "./ingestions-list";
import { CyclesList } from "./cycles-list";

export default async function DashboardPage() {
  const ingestions = await (prisma as any).ingestion.findMany({
    take: 3,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { boxes: true }
      }
    }
  });

  const totalIngestions = await (prisma as any).ingestion.count();

  const cycles = await prisma.cycle.findMany({
    take: 3,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { boxes: true }
      }
    }
  } as any);

  const totalCycles = await prisma.cycle.count();
  
  // Check if each ingestion is used (has boxes in cycles)
  const ingestionsWithUsage = await Promise.all(ingestions.map(async (ing: any) => {
    const usedCount = await prisma.box.count({
      where: {
        ingestionId: ing.id,
        cycleId: { not: null }
      }
    });
    return { ...ing, isUsed: usedCount > 0 };
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginTop: '2rem' }}>
      {/* Starting Points Section */}
      <section style={{ padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.875rem' }}>1. Starting Points (Ingestions)</h1>
            <p className="text-secondary">Upload your CP-1 ingestion files here to populate the inventory pool.</p>
          </div>
          <div>
            <UploadForm />
          </div>
        </div>

        <IngestionsList initialIngestions={ingestionsWithUsage} totalCount={totalIngestions} />
      </section>

      {/* Cycles Section */}
      <section style={{ padding: '0 0.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ marginBottom: '0.5rem', fontSize: '1.875rem' }}>2. Processing Cycles</h1>
            <p className="text-secondary">Create a manual cycle to branch boxes into different pricing paths.</p>
          </div>
          <div>
            <Link href="/dashboard/cycles/new" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
              + Create New Cycle
            </Link>
          </div>
        </div>

        <CyclesList initialCycles={cycles} totalCount={totalCycles} />
      </section>
    </div>
  );
}
