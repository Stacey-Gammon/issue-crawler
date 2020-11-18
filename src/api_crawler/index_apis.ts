
import elasticsearch from 'elasticsearch';
import { Api } from '../api_utils';
import { getIndexName, indexDocs } from '../es_utils';
import { ApiDoc, getApiDoc } from './api_doc';
import { repo } from './config';
import { getApiDocId } from './get_api_id';

export async function indexApis(
  client: elasticsearch.Client,
  commitHash: string,
  commitDate: string,
  apis: { [key: string]: Api },
  indexAsLatest: boolean) {
  const docs: Array<ApiDoc> = [];
  for await (const api of Object.values(apis)) {
    docs.push(await getApiDoc(client, api, commitHash));
  }

  const apiIndexName = getIndexName('api', repo);
  await indexDocs<ApiDoc>(
    client,
    docs,
    commitHash,
    commitDate,
    apiIndexName,
    (doc: ApiDoc) => getApiDocId(commitHash, doc));
    
  if (indexAsLatest) {
    await indexDocs<ApiDoc>(
      client,
      docs,
      commitHash,
      commitDate,
      apiIndexName + '-latest',
      (doc: ApiDoc) => getApiDocId('', doc));
  }
}