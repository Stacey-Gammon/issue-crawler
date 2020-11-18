

import  elasticsearch from 'elasticsearch';
import  { elasticsearchEnv } from '../../config';

import { getPluginInfoForRepo } from "../../plugin_utils";
import { createIndex, getIndexName } from "../../es_utils";
import { checkoutDates, repo } from "../config";
import { checkoutRepo, checkoutRoundedDate, getCommitDate, getCommitHash } from "../../git_utils";
import { Project, SourceFile } from 'ts-morph';
import { getStaticApi } from '../../api_utils';
import { apiIndexMapping } from '../api_doc';
import { indexApis } from '../index_apis';

const client = new elasticsearch.Client(elasticsearchEnv);

const apiIndexName = getIndexName('api', repo);

export async function crawlStaticApi() {
  const { repoPath, currentGit } = await checkoutRepo(repo, process.env.LOCAL_REPO_DIR);

  await createIndex(client, apiIndexName, apiIndexMapping);
  await createIndex(client, `${apiIndexName}-latest`, apiIndexMapping);

  try {
    for (const date of checkoutDates) {
      await checkoutRoundedDate(repoPath, currentGit, date);
      const commitDate = await getCommitDate(currentGit);
      const commitHash = await getCommitHash(currentGit);

      await indexApi(
        client,
        repoPath,
        `${repoPath}/x-pack/tsconfig.json`,
        commitHash,
        commitDate,
        date === undefined);
    }
  } catch (e) {
    console.log(`Indexing ${repo} failed: `, e);
  }
}

export async function indexApi(
  client: elasticsearch.Client,
  repoPath: string,
  tsConfigFilePath: string,
  commitHash: string,
  commitDate: string,
  indexAsLatest: boolean) {
  const project = new Project({ tsConfigFilePath });
  const plugins = getPluginInfoForRepo(repoPath);

  const sourceFiles = project.getSourceFiles();

  const fileFilters: Array<string> = process.argv.length === 3 ?
    [process.argv.pop()!] : ['public/index.ts', 'server/index.ts'];

  const staticFiles: Array<SourceFile> = sourceFiles.filter((v, i) => {
    return fileFilters.find(filter => v.getFilePath().indexOf(filter) >= 0);
  });

  const apis = getStaticApi(staticFiles, plugins);
  console.log(`Collecting references from ${staticFiles.length} files...`);

  indexApis(client, commitHash, commitDate, apis, indexAsLatest);
}
