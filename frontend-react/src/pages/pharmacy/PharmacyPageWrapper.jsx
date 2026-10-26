import React from 'react';
import PharmacySidebarToggle from './PharmacySidebarToggle';

export function PharmacyPageWrapper({ children }) {
  return (
    <>
      <PharmacySidebarToggle />
      {children}
    </>
  );
}

export default PharmacyPageWrapper;
