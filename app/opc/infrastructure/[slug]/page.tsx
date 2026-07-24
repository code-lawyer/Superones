import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpcServiceDetail } from "@/components/opc-service-detail";
import { getOpcService, infrastructureServices } from "@/lib/opc-catalog";

export function generateStaticParams() { return infrastructureServices.map((service) => ({ slug: service.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = getOpcService("infrastructure", slug);
  return { title: service?.name ?? "基础设施" };
}

export default async function InfrastructureDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getOpcService("infrastructure", slug);
  if (!service) notFound();
  return <OpcServiceDetail service={service} />;
}
