
import git from "simple-git/promise";
import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv } from '../config';
import fs from 'fs';
import { Project } from "ts-morph";

import { getPluginForPath, getPluginInfo, getPluginInfoForPath, indexPluginInfo, PluginInfo } from "../plugin_utils";
import { PublicAPIDoc, ReferenceDoc } from "./service";
import { collectApiInfo } from './build_api_docs';
import { getIndexName, indexDocs } from "../es_utils";
import { checkoutDates, repo } from "./config";
import { checkoutRepo } from "../git_utils";

const client = new elasticsearch.Client(elasticsearchEnv);

const refsIndexName = getIndexName('references', repo);
const apiIndexName = getIndexName('api', repo);

function getDocId(commitHash: string, doc: ReferenceDoc) {
  return `
    ${commitHash}${doc.source.plugin}${doc.source.file.path.replace('/', '')}${doc.source.name}.${doc.reference.file}
  `
}

function getApiDocId(commitHash: string, doc: PublicAPIDoc) {
  return `${commitHash}${doc.plugin}${doc.name}`
}

export async function crawlServices() {
  const { commitHash, commitDate, repoPath, currentGit } = await checkoutRepo(repo, '/Users/gammon/Elastic/kibana');

  try {
    for (const date of checkoutDates) {
      const checkout = date ? `master@${date}` : 'master';
      await currentGit.checkout(checkout);
      console.log(`Indexing current state of master with ${checkout}`);

      const { apiDocs, refDocs } = collectApiInfo(repoPath);
      
      await indexDocs<ReferenceDoc>(client, refDocs, commitHash, commitDate, refsIndexName, (doc: ReferenceDoc) => getDocId(commitHash, doc));
      await indexDocs<PublicAPIDoc>(client, apiDocs, commitHash, commitDate, apiIndexName, (doc: PublicAPIDoc) => getApiDocId(commitHash, doc));

      if (date === undefined) {
        console.log('Indexing latest');
        await indexDocs<ReferenceDoc>(client, refDocs, commitHash, commitDate, refsIndexName + '-latest', (doc: ReferenceDoc) => getDocId('', doc));
        await indexDocs<PublicAPIDoc>(client, apiDocs, commitHash, commitDate, apiIndexName + '-latest', (doc: PublicAPIDoc) => getApiDocId('', doc));
      }

      const plugins: Array<PluginInfo> = getPluginInfoForPath(repoPath, apiDocs);
      await indexPluginInfo(client, plugins, commitHash, commitDate);

    }
  } catch (e) {
    console.log(`Indexing ${repo} failed: `, e);
  }
}
