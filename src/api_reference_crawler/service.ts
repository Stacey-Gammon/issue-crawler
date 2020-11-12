export interface ReferenceDoc {
  source: {
    file: { path: string };
    plugin: string;
    team: string;
    name: string;
    lifecycle?: string;
    isStatic?: boolean;
  }
  reference: {
    plugin: string;
    file: { path: string };
    team: string;
  }
}

export interface PublicAPIDoc {
  plugin: string;
  file: { path: string };
  name: string;
  team: string;
  refCount: number;
  type: string;
  isStatic: boolean;
}
