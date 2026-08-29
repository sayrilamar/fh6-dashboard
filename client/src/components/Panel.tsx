import type { ReactNode } from 'react';

export function Panel({
  title,
  span,
  children,
  style,
}: {
  title?: string;
  span: number;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`panel col-${span}`} style={style}>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  );
}
