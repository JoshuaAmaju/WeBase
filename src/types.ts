export type WeBaseRecord<T = unknown> = Record<string, T>;

export type WeBaseFunction = (...args: unknown[]) => unknown;

export interface SchemaType {
  hidden?: boolean;
  unique?: boolean;
  primary?: boolean;
  indexed?: boolean;
  required?: boolean;
  type: "uuid" | string;
  default?: unknown | (() => unknown);
}

export type StringOrSchemaType = "null" | string | SchemaType;

export interface Schema {
  [key: string]: StringOrSchemaType;
}

export interface SchemaManager {
  drop(): void;
  install(): Promise<unknown>;
  delete(model: string): void;
  deleteDB(): Promise<unknown>;
}

export type BlockedEvent = {
  event: Event;
  type: "blocked";
};

export type VersionChangeEvent = {
  type: "versionchange";
  event: IDBVersionChangeEvent;
};

export type UpgradeEvent = {
  type: "upgrade";
  schema: SchemaManager;
};

export type InitEvents = BlockedEvent | UpgradeEvent | VersionChangeEvent;
