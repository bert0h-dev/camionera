import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthUser } from '../../auth/auth.types.js';
import { addDays, toDate, today } from '../../common/dates.js';
import type {
  StaffCertification,
  StaffLicense,
} from '../../generated/prisma/client.js';
import {
  ActionType,
  CertificationType,
  LicenseType,
  StaffStatus,
} from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SettingsService } from '../../settings/settings.service.js';
import {
  CreateCertificationDto,
  UpdateCertificationDto,
} from './dto/certification.dto.js';
import { CreateLicenseDto, UpdateLicenseDto } from './dto/license.dto.js';
import { documentState, isValidOn } from './document-status.js';

/** Requisitos para que un conductor pueda operar (regla del negocio). */
export const DRIVER_REQUIRED_LICENSE = LicenseType.A;
export const DRIVER_REQUIRED_CERTIFICATION = CertificationType.medical_exam;

function assertDates(issueDate: Date, expiryDate: Date | null) {
  if (expiryDate && expiryDate <= issueDate) {
    throw new BadRequestException(
      'La fecha de vencimiento debe ser posterior a la de expedición',
    );
  }
}

/** Fecha opcional del DTO: undefined = sin cambio, null = borrar. */
const optionalDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : toDate(value);

@Injectable()
export class StaffDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
  ) {}

  private async withState<T extends { expiryDate: Date | null }>(docs: T[]) {
    const alertDays = await this.settings.get('documents.expiry_alert_days');
    const now = today();
    return docs.map((d) => ({
      ...d,
      ...documentState(d.expiryDate, now, alertDays),
    }));
  }

  private async assertStaffEditable(staffId: string) {
    const staff = await this.prisma.staff.findUniqueOrThrow({
      where: { id: staffId },
    });
    if (staff.status === StaffStatus.inactive) {
      throw new BadRequestException(
        'No se pueden modificar documentos de un empleado dado de baja',
      );
    }
  }

  // ---------- Licencias ----------

  async listLicenses(staffId: string) {
    await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
    const docs = await this.prisma.staffLicense.findMany({
      where: { staffId },
      orderBy: { expiryDate: 'desc' },
    });
    return this.withState(docs);
  }

  async createLicense(staffId: string, dto: CreateLicenseDto, actor: AuthUser) {
    await this.assertStaffEditable(staffId);
    const { issueDate: issue, expiryDate: expiry, ...data } = dto;
    const issueDate = toDate(issue);
    const expiryDate = toDate(expiry);
    assertDates(issueDate, expiryDate);

    const license = await this.prisma.staffLicense.create({
      data: { ...data, staffId, issueDate, expiryDate },
    });
    await this.log(
      actor,
      'staff_licenses',
      license.id,
      ActionType.insert,
      null,
      license,
    );
    return (await this.withState([license]))[0];
  }

  async updateLicense(id: string, dto: UpdateLicenseDto, actor: AuthUser) {
    const before = await this.prisma.staffLicense.findUniqueOrThrow({
      where: { id },
    });
    await this.assertStaffEditable(before.staffId);
    const { issueDate: issue, expiryDate: expiry, ...data } = dto;
    const issueDate = issue ? toDate(issue) : before.issueDate;
    const expiryDate = expiry ? toDate(expiry) : before.expiryDate;
    assertDates(issueDate, expiryDate);

    const license = await this.prisma.staffLicense.update({
      where: { id },
      data: { ...data, issueDate, expiryDate },
    });
    await this.log(
      actor,
      'staff_licenses',
      id,
      ActionType.update,
      before,
      license,
    );
    return (await this.withState([license]))[0];
  }

  async deleteLicense(id: string, actor: AuthUser) {
    const before = await this.prisma.staffLicense.findUniqueOrThrow({
      where: { id },
    });
    await this.assertStaffEditable(before.staffId);
    await this.prisma.staffLicense.delete({ where: { id } });
    await this.log(
      actor,
      'staff_licenses',
      id,
      ActionType.delete,
      before,
      null,
    );
  }

  // ---------- Certificaciones ----------

  async listCertifications(staffId: string) {
    await this.prisma.staff.findUniqueOrThrow({ where: { id: staffId } });
    const docs = await this.prisma.staffCertification.findMany({
      where: { staffId },
      orderBy: [{ type: 'asc' }, { issueDate: 'desc' }],
    });
    return this.withState(docs);
  }

  async createCertification(
    staffId: string,
    dto: CreateCertificationDto,
    actor: AuthUser,
  ) {
    await this.assertStaffEditable(staffId);
    const { issueDate: issue, expiryDate: expiry, ...data } = dto;
    const issueDate = toDate(issue);
    const expiryDate = optionalDate(expiry) ?? null;
    assertDates(issueDate, expiryDate);

    const cert = await this.prisma.staffCertification.create({
      data: { ...data, staffId, issueDate, expiryDate },
    });
    await this.log(
      actor,
      'staff_certifications',
      cert.id,
      ActionType.insert,
      null,
      cert,
    );
    return (await this.withState([cert]))[0];
  }

  async updateCertification(
    id: string,
    dto: UpdateCertificationDto,
    actor: AuthUser,
  ) {
    const before = await this.prisma.staffCertification.findUniqueOrThrow({
      where: { id },
    });
    await this.assertStaffEditable(before.staffId);
    const { issueDate: issue, expiryDate: expiry, ...data } = dto;
    const issueDate = issue ? toDate(issue) : before.issueDate;
    const newExpiry = optionalDate(expiry);
    const expiryDate = newExpiry === undefined ? before.expiryDate : newExpiry;
    assertDates(issueDate, expiryDate);

    const cert = await this.prisma.staffCertification.update({
      where: { id },
      data: { ...data, issueDate, expiryDate },
    });
    await this.log(
      actor,
      'staff_certifications',
      id,
      ActionType.update,
      before,
      cert,
    );
    return (await this.withState([cert]))[0];
  }

  async deleteCertification(id: string, actor: AuthUser) {
    const before = await this.prisma.staffCertification.findUniqueOrThrow({
      where: { id },
    });
    await this.assertStaffEditable(before.staffId);
    await this.prisma.staffCertification.delete({ where: { id } });
    await this.log(
      actor,
      'staff_certifications',
      id,
      ActionType.delete,
      before,
      null,
    );
  }

  // ---------- Vencimientos y cumplimiento ----------

  /**
   * Documentos vencidos o por vencer de personal no dado de baja.
   * Se omiten los que ya fueron renovados (mismo empleado y tipo con vencimiento posterior).
   */
  async expirations(days?: number) {
    const alertDays =
      days ?? (await this.settings.get('documents.expiry_alert_days'));
    const now = today();
    const staffSelect = {
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        secondLastName: true,
        role: true,
      },
    };
    const where = {
      expiryDate: { lte: addDays(now, alertDays) },
      staff: { status: { not: StaffStatus.inactive } },
    };

    const [licenses, certifications] = await Promise.all([
      this.prisma.staffLicense.findMany({
        where,
        include: { staff: staffSelect },
      }),
      this.prisma.staffCertification.findMany({
        where,
        include: { staff: staffSelect },
      }),
    ]);
    const staffIds = [
      ...new Set([...licenses, ...certifications].map((d) => d.staffId)),
    ];
    const [allLicenses, allCerts] = await Promise.all([
      this.prisma.staffLicense.findMany({
        where: { staffId: { in: staffIds } },
      }),
      this.prisma.staffCertification.findMany({
        where: { staffId: { in: staffIds } },
      }),
    ]);

    const laterExpiry = (a: Date | null, b: Date) => a === null || a > b;
    const licenseRenewed = (l: StaffLicense) =>
      allLicenses.some(
        (o) =>
          o.id !== l.id &&
          o.staffId === l.staffId &&
          o.licenseType === l.licenseType &&
          laterExpiry(o.expiryDate, l.expiryDate),
      );
    const certRenewed = (c: StaffCertification) =>
      allCerts.some(
        (o) =>
          o.id !== c.id &&
          o.staffId === c.staffId &&
          o.type === c.type &&
          o.name === c.name &&
          laterExpiry(o.expiryDate, c.expiryDate!),
      );

    const items = [
      ...licenses
        .filter((l) => !licenseRenewed(l))
        .map((l) => ({
          kind: 'license' as const,
          id: l.id,
          label: `Licencia tipo ${l.licenseType}`,
          number: l.licenseNumber as string | null,
          expiryDate: l.expiryDate,
          staff: l.staff,
          ...documentState(l.expiryDate, now, alertDays),
        })),
      ...certifications
        .filter((c) => !certRenewed(c))
        .map((c) => ({
          kind: 'certification' as const,
          id: c.id,
          label: c.name,
          number: c.certificateNumber,
          expiryDate: c.expiryDate!,
          staff: c.staff,
          ...documentState(c.expiryDate, now, alertDays),
        })),
    ].sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());

    return { alertDays, items };
  }

  /**
   * ¿El conductor puede operar en `date`? Requiere licencia tipo A y examen médico vigentes.
   * Lo usará el Módulo 4 (asignación de recorridos).
   */
  async isDriverCompliant(staffId: string, date: Date = today()) {
    const [licenses, certs] = await Promise.all([
      this.prisma.staffLicense.findMany({
        where: { staffId, licenseType: DRIVER_REQUIRED_LICENSE },
      }),
      this.prisma.staffCertification.findMany({
        where: { staffId, type: DRIVER_REQUIRED_CERTIFICATION },
      }),
    ]);
    const missing: string[] = [];
    if (!licenses.some((l) => isValidOn(l, date)))
      missing.push('Licencia federal tipo A vigente');
    if (!certs.some((c) => isValidOn(c, date)))
      missing.push('Examen médico vigente');
    return { compliant: missing.length === 0, missing };
  }

  private log(
    actor: AuthUser,
    tableName: string,
    recordId: string,
    actionType: ActionType,
    oldValues: object | null,
    newValues: object | null,
  ) {
    return this.audit.log({
      userId: actor.id,
      tableName,
      recordId,
      actionType,
      oldValues,
      newValues,
    });
  }
}
