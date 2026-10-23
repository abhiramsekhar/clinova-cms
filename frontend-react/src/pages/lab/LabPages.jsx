import React from 'react';
import ModulePage from '../shared/ModulePage';

export function LabQueuePage() {
  return (
    <ModulePage
      title="Specimen & Test Queue"
      subtitle="Pending specimen collection, processing in progress, and test completion"
      icon="icon-clipboard-list"
    />
  );
}

export function LabCompletedPage() {
  return (
    <ModulePage
      title="Completed Diagnostic Tests"
      subtitle="Verified test reports ready for doctor review and patient collection"
      icon="icon-check-circle"
    />
  );
}

export function LabResultsPage() {
  return (
    <ModulePage
      title="Enter Test Results"
      subtitle="Input diagnostic parameter values, flag abnormal findings, and record notes"
      icon="icon-file-text"
    />
  );
}

export function LabBillingPage() {
  return (
    <ModulePage
      title="Laboratory Invoicing & Receipts"
      subtitle="Diagnostic test fees, collection receipts, and billing status"
      icon="icon-receipt"
    />
  );
}

export function LabCatalogPage() {
  return (
    <ModulePage
      title="Diagnostic Test Reference Catalog"
      subtitle="Available clinical investigations, sample requirements, and reference ranges"
      icon="icon-flask"
    />
  );
}
