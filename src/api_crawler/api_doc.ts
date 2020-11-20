import elasticsearch from 'elasticsearch';
import { Api } from '../api_utils';
import { getRefCnt } from './get_ref_cnt';
export interface ApiDoc {
  plugin: string;
  id: string;
  file: { path: string };
  name: string;
  team: string;
  refCount: number;
  type: string;
  isStatic: boolean;
  xpack: boolean;
  lifecycle?: string;
}

export const apiIndexMapping: Object = {
  'file.path': { type: 'keyword' },
  'name': { type: 'keyword' },
  'id': { type: 'keyword' },
  'xpack': { type: 'boolean' },
  'isStatic': { type: 'keyword' },
  'type': { type: 'keyword' },
  'refCount': { type: 'number' },
  'team': { type: 'keyword' },
  'plugin': { type: 'keyword' },
  'lifecycle': { type: 'keyword' },
  'commitHash': { type: 'keyword' },
  'commitDate': { type: 'date' }
};


export async function getApiDoc(client: elasticsearch.Client, api: Api, commitHash: string): Promise<ApiDoc> {
  return {
    ...api,
    refCount: await getRefCnt(client, api.id, commitHash),
    xpack: api.file.path.indexOf('xpack') >= 0
  };
}