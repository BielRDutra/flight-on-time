export const DATA_SOURCE_IDS = [
  'fixture',
  'flightradar24',
  'adsb_lol',
  'opensky',
  'aeroescuta',
] as const;

export type DataSourceId = (typeof DATA_SOURCE_IDS)[number];

export interface SourceApprovalRecord {
  approved: boolean;
  termsReference: string;
  approvedAt?: string | undefined;
}

export type SourceApprovalRegistry = Partial<Record<DataSourceId, SourceApprovalRecord>>;

export class DataSourcePolicyError extends Error {
  constructor(
    readonly sourceId: string,
    message: string,
  ) {
    super(message);
    this.name = 'DataSourcePolicyError';
  }
}

export function assertApprovedDataSource(
  sourceId: DataSourceId,
  approvalRegistry: SourceApprovalRegistry = {},
): void {
  if (sourceId === 'fixture') {
    return;
  }

  if (sourceId === 'aeroescuta') {
    throw new DataSourcePolicyError(
      sourceId,
      'AeroEscuta is an aviation audio site, not a structured or airline-authorized flight data source.',
    );
  }

  const record = approvalRegistry[sourceId];
  if (!record?.approved) {
    throw new DataSourcePolicyError(
      sourceId,
      `Live data source "${sourceId}" is disabled until product-specific rights and license terms are approved.`,
    );
  }
}
