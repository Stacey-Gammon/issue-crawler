import { checkIsBareRepoTask } from "simple-git/src/lib/tasks/check-is-repo";


import { Client } from 'elasticsearch';

export async function alreadyIndexed(client: Client, repo: string, indexName: string, commitHash: string) {
  const entries = await client.search({
    index: indexName,
    ignoreUnavailable: true,
    size: 0,
    body: {
      query: {
        bool: {
          filter: [{ match: { commitHash } }, { match: { repo } }]
        }
      }
    }
  });

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


export async function indexDocs<Doc>(client: Client, docs: Array<Doc>, commitHash: string, commitDate: string, indexName: string, getId?: (d: Doc) => string) {
  console.log(`Indexing data from ${docs.length} docs`);
 // console.table(docs);
  let body: any[] = [];
  docs.forEach(doc => {
    if (doc) {
      body.push({ index: { 
        _index: indexName,
        _type: "_doc",
        ...(getId ?  { _id: getId(doc) } : {}), 
      } });
      body.push({ ...doc, commitHash, commitDate });
    }
  });
  try {
    await client.bulk({
      body
    });
  } catch (e) {
    console.error(e);
  }
}