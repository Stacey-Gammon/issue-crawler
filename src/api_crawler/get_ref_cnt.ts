import  elasticsearch from '@elastic/elasticsearch';
import { refsIndexName } from '../reference_crawler/reference_doc';

export async function getRefCnt(client: elasticsearch.Client, apiId: string, commitHash: string) {
  const response = await client.search({ 
    index: refsIndexName,
    body: {
      "query": {
        "bool": {
          "must": [
            { "term": { "source.id": apiId } },
            { "term": { "commitHash": commitHash } }
          ]
        }
      },
      "size": 0,
      "track_total_hits": true
    }
  });
  // @ts-ignore
  return response.hits.total.value;
}