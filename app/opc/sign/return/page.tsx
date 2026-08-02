import { notFound } from "next/navigation";
import { OpcSignReturnPage } from "@/components/opc-sign-flow";

export const metadata = { title: "签署结果核验 — OPC 服务台" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ order?: string; token?: string }> }) {
  const { order = "", token = "" } = await searchParams;
  if (!/^OPC-\d{8}-[0-9A-F]{12}$/.test(order) || !/^[A-Za-z0-9_-]{43}$/.test(token)) notFound();
  return <OpcSignReturnPage reference={order} token={token} />;
}
