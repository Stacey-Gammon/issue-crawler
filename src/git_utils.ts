
import { SimpleGit } from "simple-git";
import git from "simple-git/promise";
import tmp from 'tmp';
import moment from 'moment';
// @ts-ignore
import exec from 'await-exec';
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
  return (await currentGit.raw(["rev-parse", "HEAD"])).trim();
}

export async function getCommitDate(currentGit: SimpleGit)  {
  return new Date(
    await currentGit.raw(["log", "-1", "--format=%cd"])
  ).toISOString();
}

export async function checkoutRoundedDate(
  repoPath: string,
  currentGit: SimpleGit,
  date?: string): Promise<string> {
  const yesterday = moment();
  yesterday.subtract(1, 'd');
  const checkout = date ?
    `master@{${date} -0000}` :
    `master@{${yesterday.format('YYYY-MM-DD')} 12:00:00 -0000}`;
  const response = await exec(`cd ${repoPath} && git rev-list -1 --before="${checkout}" master`); 
  const hash = response.stdout.trim();
  console.log(`Checking out ${hash} as ${checkout}`);
  await currentGit.checkout(hash);
  return hash;
}