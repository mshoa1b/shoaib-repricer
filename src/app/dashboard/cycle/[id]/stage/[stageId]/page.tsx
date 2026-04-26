import { redirect } from "next/navigation";

export default async function LegacyStagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/cycle/${id}`);
}
