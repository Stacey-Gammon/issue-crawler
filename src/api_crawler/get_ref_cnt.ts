import elasticsearch from 'elasticsearch';

export async function getRefCnt(client: elasticsearch.Client, apiId: string, commitHash: string) {
  const response = await client.search({ 
    body: {
      "query": {
        "constant_score": {
          "filter": {
            "terms": {
              "source.id": apiId,
              "commitHash": commitHash
            }
          }
        }
      },
      "size": 0,
      "track_total_hits": true
    }
  });
  return response.hits.total;
}