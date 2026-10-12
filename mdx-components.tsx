import type { MDXComponents } from 'mdx/types';

/** Komponenty MDX dla poradników. Typografia z tokenów (klasy stylów tekstu z brand/tokens.json). */
const components: MDXComponents = {
  h1: (props) => <h1 className="heading-1" {...props} />,
  h2: (props) => <h2 className="heading-2" {...props} />,
  h3: (props) => <h3 className="heading-3" {...props} />,
  p: (props) => <p className="body-l" {...props} />,
  a: (props) => <a className="sd-link" {...props} />,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
