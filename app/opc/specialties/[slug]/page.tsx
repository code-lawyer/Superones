import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OpcServiceDetail } from "@/components/opc-service-detail";
import { getOpcService, specialtyServices } from "@/lib/opc-catalog";

export function generateStaticParams() { return specialtyServices.map((service) => ({ slug: service.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const service = getOpcService("specialty", slug);
  return { title: service?.name ?? "专项服务" };
}

export default async function SpecialtyDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const service = getOpcService("specialty", slug);
  if (!service) notFound();
  return <OpcServiceDetail service={service} />;
}
