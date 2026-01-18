import React from 'react';

type Props = {
  title?: string;
  children: React.ReactNode;

  /** أزرار أو عناصر جنب العنوان */
  actions?: React.ReactNode;

  /** Footer اختياري */
  footer?: React.ReactNode;

  /** كلاس إضافي */
  className?: string;

  /** إلغاء الـ padding (مفيد للجداول) */
  noPadding?: boolean;
};

export default function Card({
  title,
  children,
  actions,
  footer,
  className = '',
  noPadding = false,
}: Props) {
  return (
    <div
      className={`card ${noPadding ? 'card-no-padding' : ''} ${className}`}
    >
      {(title || actions) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}

      <div className="card-body">
        {children}
      </div>

      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}