import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { BoxList } from "@/app/dashboard/ingestion/[id]/box-list";

export default async function IngestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ingestion = await (prisma as any).ingestion.findUnique({
    where: { id },
    include: {
      boxes: {
        include: {
          items: true
        }
      }
    }
  });

  if (!ingestion) return notFound();

  let totalItems = 0;
  let totalValue = 0;
  ingestion.boxes.forEach((box: any) => {
    box.items.forEach((item: any) => {
      totalItems += item.quantity;
      totalValue += item.quantity * item.cp1Price;
    });
  });

  return (
    <div className="container">
      <div style={{ marginBottom: '2rem' }}>
        <Link 
          href="/dashboard" 
          className="btn btn-secondary"
          style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', borderRadius: '6px', display: 'inline-flex', gap: '0.5rem' }}
        >
          &larr; Back to Dashboard
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>{ingestion.name}</h1>
          <p className="text-secondary">Manage and amend boxes for this ingestion batch.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div className="card text-center" style={{ padding: '0.75rem 1.5rem', minWidth: '120px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">Boxes</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{ingestion.boxes.length}</div>
          </div>
          <div className="card text-center" style={{ padding: '0.75rem 1.5rem', minWidth: '120px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">Units</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{totalItems.toLocaleString()}</div>
          </div>
          <div className="card text-center" style={{ padding: '0.75rem 1.5rem', minWidth: '150px' }}>
            <div className="text-secondary text-xs uppercase tracking-wider mb-1">Total Value</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>€{totalValue.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <BoxList boxes={ingestion.boxes} />
    </div>
  );
}
