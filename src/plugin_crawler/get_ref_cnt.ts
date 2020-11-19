import elasticsearch from 'elasticsearch';
import { apiIndexMapping } from '../api_crawler/api_doc';
import { apiIndexName } from '../api_crawler/config';
import { refsIndexName } from '../reference_crawler/reference_doc';

export async function getRefCnt(client: elasticsearch.Client, plugin: string, commitHash: string) {
  const response = await client.search({
    index: apiIndexName,
    size: 0,
    body: {
      query: {
        bool: {
          must: [
            {
              match: { "source.plugin": plugin }
            },
            {
              match: { "commitHash": "48231c8400d81c8628313368e4bd90cf37864657" }
            }
          ]
        }
      },
      aggs: {
        refCount: {
           "sum": { "field": "refCnt" }
        }
      }
    }
  });

  // @ts-ignore
  if (response.hits.total.value) {
    throw new Error(`Need to crawl api first to get accurate ref count for hash ${commitHash}`)
  }

  return response.aggregations?.refCount;
}