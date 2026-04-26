import { prisma } from "@/lib/prisma";
import { UploadForm } from "./upload-form";
import Link from "next/link";

export default async function DashboardPage() {
  const cycles = await prisma.cycle.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { boxes: true }
      }
    }
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-center mt-8">
        <div>
          <h1 className="mb-2">Active Shipments (Cycles)</h1>
          <p className="text-secondary">Manage your B2B inventory flow from CP-1 to CP-5.</p>
        </div>
        <div>
          <UploadForm />
        </div>
      </div>

      <div className="card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Date</th>
                <th>Boxes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cycles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center" style={{ padding: '2rem' }}>
                    No shipments found. Upload an Excel file to get started.
                  </td>
                </tr>
              ) : (
                cycles.map((cycle) => (
                  <tr key={cycle.id}>
                    <td className="text-sm text-secondary">{cycle.id.slice(-6)}</td>
                    <td style={{ fontWeight: 500 }}>{cycle.name}</td>
                    <td>{new Date(cycle.date).toLocaleDateString()}</td>
                    <td>{cycle._count.boxes}</td>
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
                    <td>
                      <Link href={`/dashboard/cycle/${cycle.id}`} className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                        Manage Pricing
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
