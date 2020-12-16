import  elasticsearch from '@elastic/elasticsearch';
import  { elasticsearchEnv } from '../../es_config';

import { getPluginInfoForRepo } from "../../plugin_utils";
import { referenceIndexMapping, refsIndexName } from "../reference_doc";
import { createIndex } from "../../es_utils";
import { getCheckoutDates, repo } from "../config";
import { checkoutRepo, checkoutRoundedDate, getCommitDate } from "../../git_utils";
import { Project, SourceFile } from 'ts-morph';
import { getContractApi, getTsProject } from '../../api_utils';
import { indexRefDocs } from '../index_references';
import { getReferencesForApi } from '../get_references_for_api';

interface CrawlContractReferenceOps {
  fileFilters: string[];
  client?: elasticsearch.Client
}

export async function crawlContractReferences(ops: CrawlContractReferenceOps) {
  const { repoPath, currentGit } = await checkoutRepo(repo, process.env.LOCAL_REPO_DIR);

  const fileFilters = ops.fileFilters;
  const client = ops.client || new elasticsearch.Client(elasticsearchEnv);
  await createIndex(client, refsIndexName, referenceIndexMapping);
  await createIndex(client, `${refsIndexName}-latest`, referenceIndexMapping);

  try {
    for (const date of getCheckoutDates()) {
      const commitHash = await checkoutRoundedDate(repoPath, currentGit, date);
      const commitDate = await getCommitDate(currentGit);

      await collectReferences({
        client,
        repoPath,
        commitHash,
        commitDate,
        fileFilters,
        indexAsLatest: date === undefined});
    }
  } catch (e) {
    console.log(`Indexing ${repo} failed: `, e);
  }
}

interface CollectContractReferencesOps {
  client: elasticsearch.Client,
  repoPath: string,
  commitHash: string,
  commitDate: string,
  indexAsLatest: boolean;
  fileFilters: string[]
}

export async function collectReferences({
  client,
  repoPath,
  commitHash,
  commitDate,
  fileFilters,
  indexAsLatest }: CollectContractReferencesOps) {
  const project = getTsProject(repoPath);
  const plugins = getPluginInfoForRepo(repoPath);

  const sourceFiles = project.getSourceFiles();
  const files: Array<SourceFile> = sourceFiles.filter((v, i) => {
    return fileFilters.find(filter => v.getFilePath().indexOf(filter) >= 0);
  });

  const apis = getContractApi(project, files, plugins);
  console.log(`Collecting references from ${files.length} files...`);

  const refs = getReferencesForApi({ apis: Object.values(apis), plugins });

  await indexRefDocs(client, commitHash, commitDate, Object.values(refs), indexAsLatest);
}
