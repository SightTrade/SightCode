import { TokenDetailPage } from "@/components/TokenDetailPage";

export const metadata = { title: "Token" };

export default async function TokenPage({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  return <TokenDetailPage chain={chain} address={address} />;
}