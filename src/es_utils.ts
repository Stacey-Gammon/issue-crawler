
import { Client } from '@elastic/elasticsearch';

export async function alreadyIndexed(client: Client, repo: string, indexName: string, commitHash: string) {
  const entries = await client.search({
    index: indexName,
    size: 0,
    body: {
      query: {
        bool: {
          filter: [{ match: { commitHash } }, { match: { repo } }]
        }
      }
    }
  });

  // @ts-ignore
  return entries.hits.total > 0;
}

/**
 * Handles removing slashes from the repo name to return a consistent index name.
 * 
 * @param prefix 
 * @param repo 
 */
export function getIndexName(prefix: string, repo: string) {
  const owner = repo.split("/")[0];
  const repoName = repo.split("/")[1];
  return `${prefix}-${owner}-${repoName}`;
}

export async function indexDocs<Doc>(
    client: Client,
    docs: Array<Doc>,
    commitHash: string,
    commitDate: string,
    indexName: string,
    getId?: (d: Doc) => string,
    checkoutDate?: string) {
  if (docs.length === 0) return;
  const batchSize = 500;
  let group = 0;
  while (group * batchSize < docs.length) {
    let body: any[] = [];
    const batchSizeMax = (group + 1) * batchSize;
    const index = group * batchSize;
    for (let i = index; i < docs.length && i < batchSizeMax; i++) {
      if (docs[i]) {
        body.push({ index: { 
          _index: indexName,
          _type: "_doc",
          ...(getId ?  { _id: getId(docs[i]) } : {}), 
        } });
        body.push({ ...docs[i], commitHash, commitDate, checkoutDate });
      } else {
        console.error('undefined doc!');
      }
    }
    try {
      console.log(`${group + 1}) Indexing ${(body.length/2) * (group + 1)}/${docs.length} docs into ${indexName}...`);
      const response = await client.bulk({
        body
      });
      // if (response.errors) {
      //   console.log(`Encountered errors:`);
      //   console.log(response.errors);
      //   process.exit(1);
      // } else {
      //   console.log(`${group + 1}) Successfully indexed ${(body.length/2) * (group + 1)}/${docs.length} docs into ${indexName}.`);
      // }
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
    group++;
  }
}

export async function createIndex(client: Client, repo: string, properties: Object) {
  try {
   await client.indices.create({ method: 'PUT',
      index: repo,
      body: {
        mappings: {
          properties
        },
      },
    });
  } catch (e) {
    if (e.statusCode != '400') {
      console.error(e);
      process.exit(1);
    }
  }
}