export interface ReferenceDoc {
  source: {
    id: string;
    file: { path: string };
    plugin: string;
    name: string;
    team: string;
    lifecycle?: string;
    isStatic?: boolean;
    xpack: boolean;
  }
  reference: {
    plugin: string;
    file: { path: string };
    team: string;
    xpack: boolean;
  }
}

export interface PublicAPIDoc {
  plugin: string;
  id: string;
  file: { path: string };
  name: string;
  team: string;
  refCount: number;
  type: string;
  isStatic: boolean;
}
