import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { validateSetting } from './settings-validation.js';
import {
  isSettingKey,
  SETTINGS,
  settingGroup,
  type SettingDefinition,
  type SettingKey,
  type SettingValue,
} from './settings.registry.js';

const parse = (def: SettingDefinition, raw: string) =>
  def.type === 'number'
    ? Number(raw)
    : def.type === 'boolean'
      ? raw === 'true'
      : raw;

/** Grupos que cualquier usuario con sesión puede leer (datos de la empresa para boletos y recibos). */
const PUBLIC_GROUPS = ['company', 'taxes', 'commissions'];

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const def: SettingDefinition = SETTINGS[key];
    const row = await this.prisma.systemSetting.findUnique({
      where: { settingKey: key },
    });
    return (
      row ? parse(def, row.settingValue) : def.default
    ) as SettingValue<K>;
  }

  /** Todos los parámetros con su definición; opcionalmente solo los de ciertos grupos. */
  async findAll(groups?: string[]) {
    const rows = await this.prisma.systemSetting.findMany({
      include: { updatedBy: { select: { fullName: true } } },
    });
    return Object.entries(SETTINGS)
      .filter(([key]) => !groups || groups.includes(settingGroup(key)))
      .map(([key, def]: [string, SettingDefinition]) => {
        const row = rows.find((r) => r.settingKey === key);
        return {
          key,
          group: settingGroup(key),
          value: row ? parse(def, row.settingValue) : def.default,
          default: def.default,
          type: def.type,
          label: def.label ?? null,
          description: def.description,
          unit: def.unit ?? null,
          min: def.min,
          max: def.max,
          decimals: def.decimals ?? 0,
          maxLength: def.maxLength,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedBy?.fullName ?? null,
        };
      });
  }

  /** Empresa, impuestos y comisiones como objeto plano { clave: valor }. */
  async publicValues() {
    const list = await this.findAll(PUBLIC_GROUPS);
    return Object.fromEntries(list.map((s) => [s.key, s.value]));
  }

  async set(key: string, value: unknown, actorId: string) {
    const [result] = await this.setMany({ [key]: value }, actorId);
    return result;
  }

  /**
   * Guarda varios parámetros a la vez. Valida todos antes de escribir: si alguno
   * es inválido no se guarda ninguno.
   */
  async setMany(values: Record<string, unknown>, actorId: string) {
    const errors: string[] = [];
    const valid: {
      key: SettingKey;
      def: SettingDefinition;
      value: number | string | boolean;
    }[] = [];
    for (const [key, raw] of Object.entries(values)) {
      if (!isSettingKey(key))
        throw new NotFoundException(`Parámetro desconocido: ${key}`);
      const def: SettingDefinition = SETTINGS[key];
      const check = validateSetting(def, raw);
      if (check.ok) valid.push({ key, def, value: check.value });
      else errors.push(check.error);
    }
    if (errors.length) throw new BadRequestException(errors);

    const results: { key: string; value: number | string | boolean }[] = [];
    for (const { key, def, value } of valid) {
      const before = await this.get(key);
      if (before === value) {
        results.push({ key, value });
        continue;
      }
      const row = await this.prisma.systemSetting.upsert({
        where: { settingKey: key },
        update: { settingValue: String(value), updatedById: actorId },
        create: {
          settingKey: key,
          settingValue: String(value),
          settingType: def.type,
          description: def.description,
          updatedById: actorId,
        },
      });
      await this.audit.log({
        userId: actorId,
        tableName: 'system_settings',
        recordId: row.id,
        actionType: ActionType.update,
        oldValues: { [key]: before },
        newValues: { [key]: value },
      });
      results.push({ key, value });
    }
    return results;
  }
}
