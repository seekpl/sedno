import { notFound } from 'next/navigation';
import { ReferenceDemo } from '@/components/dev/demos';
import { DEMO_LIST } from '@/components/dev/registry';

export default async function ComponentDemo({ params }: { params: Promise<{ nazwa: string }> }) {
  const { nazwa } = await params;
  const demo = DEMO_LIST.find((d) => d.slug === nazwa);
  if (!demo) notFound();
  return (
    <main>
      <h1 className="sd-visually-hidden">{demo.title}</h1>
      <ReferenceDemo slug={demo.slug} />
    </main>
  );
}
