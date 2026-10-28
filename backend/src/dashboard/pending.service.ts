import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { DOCUMENT_LABELS } from '../fleet/bus-rules.js';
import { BusesService } from '../fleet/buses.service.js';
import { MaintenanceService } from '../fleet/maintenance.service.js';
import { orderFolio } from '../fleet/maintenance-rules.js';
import { UserRole } from '../generated/prisma/enums.js';
import { StaffDocumentsService } from '../staff/documents/staff-documents.service.js';

export type PendingArea = 'staff' | 'fleet' | 'maintenance';
export type PendingSeverity = 'overdue' | 'soon';

export interface PendingItem {
  id: string;
  area: PendingArea;
  severity: PendingSeverity;
  title: string;
  detail: string;
  /** Fecha límite (o de vencimiento) cuando aplica */
  date: Date | null;
  /** Días que faltan; negativo = vencido */
  daysLeft: number | null;
  /** Ruta de la app para atenderlo */
  link: string;
}

const STAFF_AREA: UserRole[] = [
  UserRole.admin,
  UserRole.hr,
  UserRole.supervisor,
  UserRole.coordinator,
];
const FLEET_AREA: UserRole[] = [
  UserRole.admin,
  UserRole.coordinator,
  UserRole.supervisor,
];

const staffName = (s: {
  firstName: string;
  lastName: string;
  secondLastName: string | null;
}) => [s.firstName, s.lastName, s.secondLastName].filter(Boolean).join(' ');

/**
 * Lista única de lo que hay que atender, de todas las áreas que el rol puede ver:
 * documentos del personal, documentos de unidades y preventivos vencidos o próximos.
 * Ordenada por urgencia: primero lo vencido, luego lo que vence antes.
 */
@Injectable()
export class PendingService {
  constructor(
    private readonly staffDocs: StaffDocumentsService,
    private readonly buses: BusesService,
    private readonly maintenance: MaintenanceService,
  ) {}

  async list(user: AuthUser): Promise<PendingItem[]> {
    const staff = STAFF_AREA.includes(user.role);
    const fleet = FLEET_AREA.includes(user.role);
    const [staffDocs, busDocs, plan] = await Promise.all([
      staff ? this.staffDocs.expirations() : null,
      fleet ? this.buses.expiringDocuments() : null,
      fleet ? this.maintenance.plan() : null,
    ]);

    const items: PendingItem[] = [
      ...(staffDocs?.items ?? []).map((d) => ({
        id: `staff-${d.kind}-${d.id}`,
        area: 'staff' as const,
        severity:
          d.status === 'expired' ? ('overdue' as const) : ('soon' as const),
        title: staffName(d.staff),
        detail: `${d.label}${d.number ? ` (${d.number})` : ''} · ${d.staff.employeeNumber}`,
        date: d.expiryDate,
        daysLeft: d.daysToExpiry,
        link: `/personal/${d.staff.id}`,
      })),
      ...(busDocs ?? []).map((d) => ({
        id: `bus-doc-${d.id}`,
        area: 'fleet' as const,
        severity:
          d.status === 'expired' ? ('overdue' as const) : ('soon' as const),
        title: `Unidad ${d.bus.economicNumber}`,
        detail: `${DOCUMENT_LABELS[d.type]} · ${d.folio}`,
        date: d.expiryDate,
        daysLeft: d.daysToExpiry,
        link: `/flota/unidades/${d.bus.id}`,
      })),
      ...(plan ?? [])
        .filter((p) => p.status === 'overdue' || p.status === 'due_soon')
        .map((p) => {
          const km =
            p.kmLeft === null
              ? null
              : p.kmLeft < 0
                ? `${(-p.kmLeft).toLocaleString('es-MX')} km pasado`
                : `faltan ${p.kmLeft.toLocaleString('es-MX')} km`;
          const order = p.openOrder
            ? `${orderFolio(p.openOrder.folio)} programada`
            : 'sin orden';
          return {
            id: `service-${p.bus.id}`,
            area: 'maintenance' as const,
            severity:
              p.status === 'overdue' ? ('overdue' as const) : ('soon' as const),
            title: `Preventivo unidad ${p.bus.economicNumber}`,
            detail: [km, order].filter(Boolean).join(' · '),
            date: p.dueDate,
            daysLeft: p.daysLeft,
            link: p.openOrder
              ? `/flota/mantenimiento/${p.openOrder.id}`
              : `/flota/unidades/${p.bus.id}`,
          };
        }),
    ];

    const rank = (i: PendingItem) => (i.severity === 'overdue' ? 0 : 1);
    return items.sort(
      (a, b) => rank(a) - rank(b) || (a.daysLeft ?? 0) - (b.daysLeft ?? 0),
    );
  }
}
