import type { Metadata } from "next";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type PublicTenantMeta = {
  name: string;
  description: string | null;
  logo_url: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let tenant: PublicTenantMeta | null = null;
  try {
    const res = await fetch(`${API_URL}/public/${slug}`, { next: { revalidate: 300 } });
    if (res.ok) tenant = (await res.json()) as PublicTenantMeta;
  } catch {
    // Network/build-time failures fall back to the generic title below.
  }

  if (!tenant) {
    return { title: "Reservá online — Reservalo" };
  }

  const title = `${tenant.name} — Reservá online`;
  const description = tenant.description || `Reservá tu turno en ${tenant.name} de forma online.`;
  const images = tenant.logo_url ? [{ url: tenant.logo_url }] : undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images,
    },
    twitter: {
      card: images ? "summary_large_image" : "summary",
      title,
      description,
      images: images?.map((i) => i.url),
    },
  };
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
