// Máquina de estados de un boleto.

import { TicketStatus } from '../generated/prisma/enums.js';

/**
 * held → confirmed al pagar (o cancelled si vence el apartado).
 * confirmed → checked_in al abordar, no_show si el recorrido sale sin él,
 * cancelled al cancelarlo o changed al cambiarlo por otro boleto.
 */
export const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  held: [TicketStatus.confirmed, TicketStatus.cancelled],
  confirmed: [
    TicketStatus.checked_in,
    TicketStatus.no_show,
    TicketStatus.cancelled,
    TicketStatus.changed,
  ],
  checked_in: [],
  no_show: [],
  cancelled: [],
  changed: [],
};

/** Estados que ocupan el asiento (los mismos de la exclusion constraint de la migración). */
export const ACTIVE_STATUSES: TicketStatus[] = [
  TicketStatus.held,
  TicketStatus.confirmed,
  TicketStatus.checked_in,
];

export const isActive = (s: TicketStatus) => ACTIVE_STATUSES.includes(s);

export const canTransition = (from: TicketStatus, to: TicketStatus) =>
  TRANSITIONS[from].includes(to);
