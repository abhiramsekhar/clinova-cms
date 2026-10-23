import React from 'react';
import Icon from '../../components/Icon';
import { EmptyState } from '../../components/States';

export function ModulePage({
  title,
  subtitle,
  icon = 'icon-clipboard-list',
  actionLabel,
  onAction,
  children,
}) {
  return (
    <div>
      <div className="page-header">
        <div className="page-header__info">
          <h1 className="text-page-title">{title}</h1>
          {subtitle && <p className="text-caption">{subtitle}</p>}
        </div>
        {actionLabel && (
          <div className="page-header__actions">
            <button type="button" className="btn btn--primary" onClick={onAction}>
              <Icon name={icon} size={16} />
              <span>{actionLabel}</span>
            </button>
          </div>
        )}
      </div>

      {children ? (
        children
      ) : (
        <EmptyState
          title={`No ${title} Available`}
          description={`The ${title} module is ready for operations. Connected to backend API.`}
          icon={icon}
        />
      )}
    </div>
  );
}

export default ModulePage;
