
import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv } from '../config';

import { getPluginInfoForRepo, indexPluginInfo, PluginInfo } from "../plugin_utils";
import { PublicAPIDoc, ReferenceDoc } from "./service";
import { collectApiInfo } from './build_api_docs';
import { createIndex, getIndexName, indexDocs } from "../es_utils";
import { checkoutDates, repo } from "./config";
import { checkoutRepo, getCommitDate, getCommitHash } from "../git_utils";

const client = new elasticsearch.Client(elasticsearchEnv);

const refsIndexName = getIndexName('references', repo);
const apiIndexName = getIndexName('api', repo);

function getDocId(commitHash: string, doc: ReferenceDoc) {
  return `
    ${commitHash}${doc.source.plugin}${doc.source.file.path.replace('/', '')}${doc.source.name}.${doc.reference.file.path.replace('/', '')}
  `
}

function getApiDocId(commitHash: string, doc: PublicAPIDoc) {
  return `${commitHash}${doc.plugin}${doc.name}`
}

const refDocIndexProperties: Object = {
  'reference.file': { type: 'keyword' },
  'reference.team': { type: 'keyword' },
  'reference.plugin': { type: 'keyword' },
  'source.id': { type: 'keyword' },
  'source.file': { type: 'keyword' },
  'source.plugin': { type: 'keyword' },
  'source.team': { type: 'keyword' },
  'source.name': { type: 'keyword' },
  'source.lifeCycle': { type: 'keyword' },
  'source.isStatic': { type: 'boolean' }
};

export async function crawlServices() {
  const { repoPath, currentGit } = await checkoutRepo(repo, '/Users/gammon/Elastic/kibana');

  await createIndex(client, refsIndexName, refDocIndexProperties);
  await createIndex(client, `${refsIndexName}-latest`, refDocIndexProperties);

  try {
    for (const date of checkoutDates) {
      const checkout = date ? `master@{${date}}` : 'master';
      await currentGit.checkout(checkout);
      console.log(`Indexing current state of master with ${checkout}`);
      const commitDate = await getCommitDate(currentGit);
      const commitHash = await getCommitHash(currentGit);
      
      const { apiDocs, refDocs } = collectApiInfo(repoPath);
      
      await indexDocs<ReferenceDoc>(client, refDocs, commitHash, commitDate, refsIndexName, (doc: ReferenceDoc) => getDocId(commitHash, doc));
      await indexDocs<PublicAPIDoc>(client, apiDocs, commitHash, commitDate, apiIndexName, (doc: PublicAPIDoc) => getApiDocId(commitHash, doc));

      if (date === undefined) {
        console.log('Indexing latest');
        await indexDocs<ReferenceDoc>(client, refDocs, commitHash, commitDate, refsIndexName + '-latest', (doc: ReferenceDoc) => getDocId('', doc));
        await indexDocs<PublicAPIDoc>(client, apiDocs, commitHash, commitDate, apiIndexName + '-latest', (doc: PublicAPIDoc) => getApiDocId('', doc));
      }

      const plugins: Array<PluginInfo> = getPluginInfoForRepo(repoPath, apiDocs);
      await indexPluginInfo(client, plugins, commitHash, commitDate);

    }
  } catch (e) {
    console.log(`Indexing ${repo} failed: `, e);
  }
}
