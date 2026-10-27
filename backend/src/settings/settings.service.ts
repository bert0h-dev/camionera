import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { ActionType } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isSettingKey,
  SETTINGS,
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

  async findAll() {
    const rows = await this.prisma.systemSetting.findMany();
    return Object.entries(SETTINGS).map(
      ([key, def]: [string, SettingDefinition]) => {
        const row = rows.find((r) => r.settingKey === key);
        return {
          key,
          value: row ? parse(def, row.settingValue) : def.default,
          default: def.default,
          type: def.type,
          description: def.description,
          min: def.min,
          max: def.max,
          updatedAt: row?.updatedAt ?? null,
        };
      },
    );
  }

  async set(key: string, value: unknown, actorId: string) {
    if (!isSettingKey(key))
      throw new NotFoundException(`Parámetro desconocido: ${key}`);
    const def: SettingDefinition = SETTINGS[key];

    if (def.type === 'number') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new BadRequestException('El valor debe ser un número entero');
      }
      if (
        (def.min !== undefined && value < def.min) ||
        (def.max !== undefined && value > def.max)
      ) {
        throw new BadRequestException(
          `El valor debe estar entre ${def.min} y ${def.max}`,
        );
      }
    } else if (typeof value !== def.type) {
      throw new BadRequestException(`El valor debe ser de tipo ${def.type}`);
    }

    const before = await this.get(key);
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
    return { key, value };
  }
}
