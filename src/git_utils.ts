
import { SimpleGit } from "simple-git";
import git from "simple-git/promise";
import tmp from 'tmp';
import moment from 'moment';
export interface GitInfo {
  repoPath: string,
  commitHash: string,
  commitDate: string,
  currentGit: SimpleGit
}

export async function checkoutRepo(repo: string, dir?: string):
  Promise<{ repoPath: string, currentGit: SimpleGit }> {
  const tmpDir = dir && dir != '' ? { name: dir } : tmp.dirSync();
 
  console.log(`Processing ${repo}, using ${tmpDir.name}`);
 
  const currentGit = git(tmpDir.name);
  
  if (dir === undefined) {
    console.log(`Cloning ${repo}...`);
    await currentGit.clone(`https://github.com/${repo}.git`, tmpDir.name);
    console.log(`Clone completed`);
  }
  return { repoPath: tmpDir.name, currentGit };
}

export async function getCommitHash(currentGit: SimpleGit) {
  return await currentGit.raw(["rev-parse", "HEAD"]);
}

export async function getCommitDate(currentGit: SimpleGit)  {
  return new Date(
    await currentGit.raw(["log", "-1", "--format=%cd"])
  ).toISOString();
}

export async function checkoutRoundedDate(currentGit: SimpleGit, date?: string) {
  const yesterday = moment();
  yesterday.subtract(1, 'd');
  const checkout = date ?
    `master@{${date}}` :
    `master@{${yesterday.format('YYYY-MM-DD')} 12:00:00}`;
  console.log(`Checking out ${checkout}`);
  await currentGit.checkout(checkout);
}