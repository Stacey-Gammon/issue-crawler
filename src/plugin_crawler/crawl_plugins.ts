import { checkoutRepo, checkoutRoundedDate, getCheckoutDates, getCommitDate, getCommitHash } from "../git_utils";
import { getPluginInfoForRepo, indexPluginInfo } from "../plugin_utils";
import { repo } from "./config";
import { getRefCnt } from "./get_ref_cnt";
import elasticsearch from 'elasticsearch';
import { elasticsearchEnv } from "../config";

export async function crawlPlugins() {
  const { repoPath, currentGit } = await checkoutRepo(repo, process.env.LOCAL_REPO_DIR);

  const client = new elasticsearch.Client(elasticsearchEnv);

  for (const date of getCheckoutDates()) {
      const commitHash = await checkoutRoundedDate(repoPath, currentGit, date);
      const commitDate = await getCommitDate(currentGit);
    
      console.log('commitHash is ', commitHash);
      const plugins = getPluginInfoForRepo(repoPath);

    for await (const plugin of plugins) {
      const refCnt = await getRefCnt(client, plugin.name, commitHash);
      console.log('refcnt is ', refCnt);
      plugin.hasPublicApi = refCnt > 0;
      plugin.refCount = refCnt;
    }

    await indexPluginInfo(client, plugins, commitHash, commitDate);
  }
}