import { getIndexName } from "../es_utils";
import { repo } from "./config";

export interface ReferenceDoc {
  source: {
    id: string;
    file: { path: string };
    plugin: string;
    name: string;
    team: string;
    lifecycle?: string;
    isStatic?: boolean;
    publicOrServer: 'public' | 'server',
    xpack: boolean;
  }
  reference: {
    plugin: string;
    file: { path: string };
    team: string;
    xpack: boolean;
  }
}

export const referenceIndexMapping: Object = {
  'reference.file.path': { type: 'keyword' },
  'reference.team': { type: 'keyword' },
  'reference.plugin': { type: 'keyword' },
  'reference.xpack': { type: 'boolean' },
  'source.id': { type: 'keyword' },
  'source.file.path': { type: 'keyword' },
  'source.plugin': { type: 'keyword' },
  'source.team': { type: 'keyword' },
  'source.name': { type: 'keyword' },
  'source.publicOrServer': { type: 'keyword' },
  'source.lifecycle': { type: 'keyword' },
  'source.isStatic': { type: 'boolean' },
  'source.xpack': { type: 'boolean' },
  'commitHash': { type: 'keyword' },
  'commitDate': { type: 'date' }
};

export const refsIndexName = getIndexName('references', repo);
