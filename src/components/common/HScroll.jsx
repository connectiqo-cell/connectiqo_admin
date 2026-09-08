/**
 * Horizontal scroll row for tabs / chips — no wrap, soft side scrollbar.
 * Wheel / click-drag slide is handled globally in AdminLayout.
 */
export function HScroll({ children, className = "", as: Tag = "div", ...rest }) {
  return (
    <Tag className={`admin-h-scroll ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  );
}
