import React from 'react';

export function Icon({ name, className = '', size = 18, ...props }) {
  const iconId = name.startsWith('icon-') ? name : `icon-${name}`;
  return (
    <svg
      className={`icon ${className}`.trim()}
      width={size}
      height={size}
      aria-hidden="true"
      {...props}
    >
      <use href={`/assets/icons/sprite.svg#${iconId}`} />
    </svg>
  );
}

export default Icon;
