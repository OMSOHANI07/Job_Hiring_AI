/** Light-blue gradient header band used at the top of each page (theme). */
export function PageHero({ tag, title, children, right }: { tag: string; title: string; children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="hero-band border-b border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 py-10 sm:px-6">
        <div className="max-w-3xl">
          <span className="tag-pill">{tag} <span aria-hidden="true">→</span></span>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{title}</h1>
          {children && <div className="mt-2 text-[15px] text-muted">{children}</div>}
        </div>
        {right}
      </div>
    </section>
  );
}
