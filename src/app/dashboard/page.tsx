import { prisma } from "@/lib/prisma";
import { UploadForm } from "./upload-form";
import { DeleteIngestionButton } from "./delete-ingestion-button";
import Link from "next/link";

export default async function DashboardPage() {
  const ingestions = await (prisma as any).ingestion.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { boxes: true }
      }
    }
  });

  const cycles = await prisma.cycle.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { boxes: true }
      }
    }
  } as any);
  
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

        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>Source Name</th>
                  <th>Date Uploaded</th>
                  <th className="text-center">Total Boxes</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ingestionsWithUsage.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '4rem 0' }} className="text-secondary italic">
                      No ingestion batches found. Upload a file to start.
                    </td>
                  </tr>
                ) : (
                  ingestionsWithUsage.map((ing: any) => (
                    <tr key={ing.id}>
                      <td className="text-sm text-secondary font-mono">{ing.id.slice(-6)}</td>
                      <td style={{ fontWeight: 500 }}>{ing.name}</td>
                      <td>{new Date(ing.createdAt).toLocaleString()}</td>
                      <td className="text-center">{ing._count.boxes}</td>
                      <td className="text-center">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Link href={`/dashboard/ingestion/${ing.id}`} className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.75rem' }}>
                            View Boxes
                          </Link>
                          <DeleteIngestionButton id={ing.id} isUsed={ing.isUsed} />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
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

        <div className="card" style={{ padding: '1.5rem' }}>
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Cycle ID</th>
                  <th>Internal Name</th>
                  <th>Created Date</th>
                  <th className="text-center">Assigned Boxes</th>
                  <th>Status</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cycles.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '4rem 0' }} className="text-secondary italic">
                      No active cycles. Click "Create New Cycle" to begin processing boxes.
                    </td>
                  </tr>
                ) : (
                  cycles.map((cycle: any) => (
                    <tr key={cycle.id}>
                      <td className="text-sm text-secondary font-mono">{cycle.id.slice(-6)}</td>
                      <td style={{ fontWeight: 500 }}>{cycle.name}</td>
                      <td>{new Date(cycle.createdAt).toLocaleDateString()}</td>
                      <td className="text-center">{cycle._count.boxes}</td>
                      <td>
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: 'var(--accent-success)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {cycle.status}
                        </span>
                      </td>
                      <td className="text-center">
                        <Link href={`/dashboard/cycle/${cycle.id}`} className="btn btn-secondary" style={{ padding: '0.5rem 1.5rem', fontSize: '0.875rem' }}>
                          Manage Pipeline
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
