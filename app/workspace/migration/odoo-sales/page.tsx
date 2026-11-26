import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { requireStaff } from "@/src/lib/golden-rose/staff";

import { canImportData } from "@/src/lib/imports/model";

import {
  WorkspacePageHeader,
  WorkspaceNotice,
} from "@/src/components/workspace/page-layout";

import { OdooHistoricalSalesImport } from "./import-form";

export const metadata: Metadata = {
  title: "Odoo Historical Sales Import | Golden Rose Perfume",
};

async function AuthorizedOdooImport() {
  const { role } = await requireStaff();

  if (!canImportData(role)) {
    notFound();
  }

  return (
    <div className="grid min-w-0 gap-6">
      <WorkspacePageHeader
        kicker="Data Management / Odoo"
        title="Historical Sales Import"
        description="Stage and reconcile existing Odoo sales without changing live POS receipts, inventory, or financial reports."
      />

      <WorkspaceNotice title="Import safety">
        Uploaded sales are stored separately from active business transactions.
        They are not marked as collected payments or posted revenue. Financial
        reporting can incorporate them only after product, payment, currency and
        historical-cost reconciliation is completed.
      </WorkspaceNotice>

      <OdooHistoricalSalesImport />
    </div>
  );
}

export default function OdooSalesPage() {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-sm text-gr-muted">
          Verifying historical import access…
        </p>
      }
    >
      <AuthorizedOdooImport />
    </Suspense>
  );
}
