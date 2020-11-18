
import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv } from '../issue_crawler/config';

import { getPluginInfoForRepo, indexPluginInfo, PluginInfo } from "../plugin_utils";
import { PublicAPIDoc, ReferenceDoc } from "./types";
import { collectApiInfoForConfig } from './collect_api_info';
import { createIndex, getIndexName, indexDocs } from "../es_utils";
import { checkoutDates, repo } from "./config";
import { checkoutRepo, getCommitDate, getCommitHash } from "../git_utils";

const client = new elasticsearch.Client(elasticsearchEnv);

const refsIndexName = getIndexName('references', repo);
const apiIndexName = getIndexName('api', repo);

function getApiDocId(commitHash: string, doc: PublicAPIDoc) {
  return `${commitHash}${doc.plugin}${doc.name}`
}

const refDocIndexProperties: Object = {
  'reference.file.path': { type: 'keyword' },
  'reference.team': { type: 'keyword' },
  'reference.plugin': { type: 'keyword' },
  'reference.xpack': { type: 'boolean' },
  'source.id': { type: 'keyword' },
  'source.file.path': { type: 'keyword' },
  'source.plugin': { type: 'keyword' },
  'source.team': { type: 'keyword' },
  'source.name': { type: 'keyword' },
  'source.lifeCycle': { type: 'keyword' },
  'source.isStatic': { type: 'boolean' },
  'source.xpack': { type: 'boolean' }
};

export async function crawlServices() {
  const { repoPath, currentGit } = await checkoutRepo(repo, process.env.LOCAL_REPO_DIR);

  await createIndex(client, refsIndexName, refDocIndexProperties);
  await createIndex(client, `${refsIndexName}-latest`, refDocIndexProperties);

  try {
    for (const date of checkoutDates) {
      const checkout = date ? `master@{${date}}` : 'master';
      await currentGit.checkout(checkout);
      console.log(`Indexing current state of master with ${checkout}`);
      const commitDate = await getCommitDate(currentGit);
      const commitHash = await getCommitHash(currentGit);

      const apiDocs = await collectApiInfoForConfig(
        client,
        repoPath,
        `${repoPath}/x-pack/tsconfig.json`,
        commitHash,
        commitDate,
        date === undefined);
      
      await indexDocs<PublicAPIDoc>(client, Object.values(apiDocs), commitHash, commitDate, apiIndexName, (doc: PublicAPIDoc) => getApiDocId(commitHash, doc));

      if (date === undefined) {
        console.log('Indexing latest api docs');
        await indexDocs<PublicAPIDoc>(client, Object.values(apiDocs), commitHash, commitDate, apiIndexName + '-latest', (doc: PublicAPIDoc) => getApiDocId('', doc));
      }

      const plugins: Array<PluginInfo> = getPluginInfoForRepo(repoPath, Object.values(apiDocs));
      await indexPluginInfo(client, plugins, commitHash, commitDate);

    }
  } catch (e) {
    console.log(`Indexing ${repo} failed: `, e);
  }
}
