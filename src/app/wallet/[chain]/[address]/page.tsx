import { WalletDetailPage } from "@/components/WalletDetailPage";

export const metadata = { title: "Wallet" };

export default async function Page({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  return <WalletDetailPage chain={chain} address={address} />;
}