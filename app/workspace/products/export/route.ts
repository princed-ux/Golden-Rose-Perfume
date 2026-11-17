import { canViewModule } from '@/src/domain/permissions';
import { catalogueCsv, catalogueExportRows, IncompleteCatalogueError } from '@/src/lib/golden-rose/catalogue-export';
import { catalogueFilters } from '@/src/lib/golden-rose/catalogue-management';
import { adminProductPages, EdgeError } from '@/src/lib/golden-rose/edge';
import { getStaffAccess } from '@/src/lib/golden-rose/staff';

const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function problem(status: number, error: string) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  const staff = await getStaffAccess();
  if ('reason' in staff) {
    if (staff.reason === 'unavailable') return problem(503, 'Staff verification is unavailable. Retry shortly.');
    if (staff.reason === 'denied') return problem(403, 'Your staff account cannot export the catalogue.');
    return problem(401, 'Sign in to export the catalogue.');
  }
  if (!canViewModule(staff.role, 'products')) return problem(403, 'Your role cannot export the catalogue.');

  const params = new URL(request.url).searchParams;
  const format = params.get('format') ?? 'csv';
  if (format !== 'csv' && format !== 'json') return problem(400, 'Choose CSV or JSON.');
  const filters = catalogueFilters(params.get('q') ?? '', params.get('publication'));

  try {
    const rows = await catalogueExportRows(adminProductPages(staff.token), filters);
    return new Response(format === 'csv' ? catalogueCsv(rows) : JSON.stringify(rows, null, 2) + '\n', {
      headers: {
        ...privateHeaders,
        'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="golden-rose-catalogue.' + format + '"',
      },
    });
  } catch (error) {
    if (error instanceof IncompleteCatalogueError) return problem(502, error.message);
    if (error instanceof EdgeError && error.status === 401) return problem(401, 'Your staff session expired. Sign in again.');
    if (error instanceof EdgeError && error.status === 403) return problem(403, 'Your role cannot export the catalogue.');
    return problem(503, 'The catalogue could not be downloaded. Retry shortly.');
  }
}
