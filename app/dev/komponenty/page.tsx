import Link from 'next/link';
import { ExtraDemos, ReferenceDemo } from '@/components/dev/demos';
import { DEMO_LIST } from '@/components/dev/registry';
import s from './page.module.css';

export default function ComponentsIndex() {
  return (
    <main className={s.main}>
      <header className={s.header}>
        <h1 className="heading-1">Komponenty</h1>
        <p className="sd-secondary">
          Każdy komponent ma podstronę z tą samą treścią co makieta w <code>brand/reference/components/</code>
          , do porównania zrzutów. Dane przykładowe.
        </p>
      </header>
      {DEMO_LIST.map(({ slug, file, title }) => (
        <section key={slug} className={s.section} aria-labelledby={`demo-${slug}`}>
          <div className={s.sectionHead}>
            <h2 id={`demo-${slug}`} className="heading-2">
              {title}
            </h2>
            <Link className="sd-link" href={`/dev/komponenty/${slug}`}>
              Podstrona do porównania z {file}
            </Link>
          </div>
          <div className={s.demo}>
            <ReferenceDemo slug={slug} />
          </div>
        </section>
      ))}
      <section className={s.section} aria-labelledby="demo-inne">
        <h2 id="demo-inne" className="heading-2">
          Pozostałe i zachowanie
        </h2>
        <div className={s.demo}>
          <ExtraDemos />
        </div>
      </section>
    </main>
  );
}
