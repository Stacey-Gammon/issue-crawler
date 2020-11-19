import { checkoutRepo, checkoutRoundedDate, getCommitDate, getCommitHash } from "../git_utils";
import { getPluginInfoForRepo } from "../plugin_utils";
import { repo } from "./config";
import { getRefCnt } from "./get_ref_cnt";
import elasticsearch from 'elasticsearch';
import { elasticsearchEnv } from "../config";

export async function crawlPlugins() {
  const { repoPath, currentGit } = await checkoutRepo(repo, process.env.LOCAL_REPO_DIR);
  await checkoutRoundedDate(repoPath, currentGit, "2020-11-17 12:00:00");

  const commitHash = await getCommitHash(currentGit);
  const commitDate = await getCommitDate(currentGit);

  console.log('commitHash is ', commitHash);
  const plugins = getPluginInfoForRepo(repoPath);

  const client = new elasticsearch.Client(elasticsearchEnv);

  for await (const plugin of plugins) {
    const refCnt = await getRefCnt(client, plugin.name, commitHash);
    console.log('refcnt is ', refCnt);
  }
}