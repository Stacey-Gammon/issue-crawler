
import { SimpleGit } from "simple-git";
import git from "simple-git/promise";
import tmp from 'tmp';

export interface GitInfo {
  repoPath: string,
  commitHash: string,
  commitDate: string,
  currentGit: SimpleGit
}

export async function checkoutRepo(repo: string, dir?: string):
  Promise<{ repoPath: string, commitHash: string, commitDate: string, currentGit: SimpleGit }> {
  const tmpDir = dir ? { name: dir } : tmp.dirSync();
 
  console.log(`Processing ${repo}, using ${tmpDir.name}`);
 
  const currentGit = git(tmpDir.name);
  
  if (dir === undefined) {
    console.log(`Cloning ${repo}...`);
    await currentGit.clone(`https://github.com/${repo}.git`, tmpDir.name);
    console.log(`Clone completed`);
  }

  const commitHash = await currentGit.raw(["rev-parse", "HEAD"]);
  const commitDate = new Date(
    await currentGit.raw(["log", "-1", "--format=%cd"])
  ).toISOString();

  return { repoPath: tmpDir.name, commitHash, commitDate, currentGit };
}