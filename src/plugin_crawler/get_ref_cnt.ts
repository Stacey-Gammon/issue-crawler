import elasticsearch from 'elasticsearch';
import { refsIndexName } from '../reference_crawler/reference_doc';

export async function getRefCnt(client: elasticsearch.Client, plugin: string, commitHash: string) {
  const response = await client.search({
    index: refsIndexName,
    size: 0,
    body: {
      query: {
        bool: {
          must: [
            {
              match: { "source.plugin": plugin }
            },
            {
              match: { "commitHash": commitHash }
            }
          ]
        }
      }
    }
  });

  console.log('response is ', response);
  // @ts-ignore
  return response.hits.total.value;
}