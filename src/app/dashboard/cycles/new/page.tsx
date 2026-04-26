import { prisma } from "@/lib/prisma";
import { CreateCycleForm } from "@/app/dashboard/cycles/new/create-form";

export default async function NewCyclePage() {
  const unassignedBoxes = await prisma.box.findMany({
    where: { cycleId: { equals: null } as any },
    include: {
      ingestion: true,
      _count: {
        select: { items: true }
      }
    } as any,
    orderBy: { createdAt: "desc" }
  });

  // Group boxes by ingestion for better UI
  const groupedBoxes: Record<string, any[]> = {};
  unassignedBoxes.forEach((box: any) => {
    const ingName = box.ingestion.name;
    if (!groupedBoxes[ingName]) groupedBoxes[ingName] = [];
    groupedBoxes[ingName].push(box);
  });

  return (
    <div className="flex flex-col gap-8 mt-8">
      <div>
        <h1 className="mb-2">Create New Cycle</h1>
        <p className="text-secondary">Combine one or more starting points and assign specific boxes to this cycle.</p>
      </div>

      <CreateCycleForm groupedBoxes={groupedBoxes} />
    </div>
  );
}
