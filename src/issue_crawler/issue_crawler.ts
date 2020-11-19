import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import  elasticsearch, { BulkIndexDocumentsParams } from 'elasticsearch';

import  { elasticsearchEnv, githubAuth, repos, privateRepos } from './config';

import { getProjectsForOrg, getProjectsForRepo, ProjectInfo } from './get_projects';
import { convertIssue } from './convert_issue';
import { IssuesListForRepoResponseData, OctokitResponse } from '@octokit/types';
import { getCacheKeyUpdate, loadCacheForRepo } from './issue_cache';
import { IssueDoc } from './issue_doc';


const RetryOctokit = Octokit.plugin(retry);
const octokit = new RetryOctokit({
	previews: ['squirrel-girl-preview'],
	auth: githubAuth,
});

/**
 * Create a bulk request body for all issues. You need to specify the index in
 * which these issues should be stored.
 */
function getIssueBulkUpdates(
		index: string,
		issues: Array<IssueDoc>) {
	console.log('getIssueBulkUpdates for ' + issues.length + ' issues');
	const ret: BulkIndexDocumentsParams['body'] = [];
	return ret.concat(...issues.map(issue => [
		{ index: { _index: index, _type: '_doc', _id: issue.id }},
		issue
	]));
}

interface ProcessGitIssueOpts {
	client: elasticsearch.Client,
	owner: string,
	repo: string,
	response: OctokitResponse<IssuesListForRepoResponseData>,
	page: number,
	indexName: string,
	logDisplayName: string;
	issuesWithProjects: { [key: string]: ProjectInfo[] }
}

/**s
 * Processes a GitHub response for the specified page of issues.
 * This will convert all issues to the desired format, store them into
 * Elasticsearch and update the cache key, we got from GitHub.
 */
async function processGitHubIssues(opts: ProcessGitIssueOpts) {
	const { logDisplayName, page, response, issuesWithProjects, repo, owner, indexName, client } = opts;
	console.log(`[${logDisplayName}#${page}] Found ${response.data.length} issues`);
 	if (response.data.length > 0) {
		const issueGroups = response.data.map((issue: IssuesListForRepoResponseData[0]) => convertIssue(owner, repo, issue, issuesWithProjects));

		const flattened: Array<IssueDoc> = [];
		issueGroups.forEach(issueGroup => flattened.push(...issueGroup));
		const bulkIssues = getIssueBulkUpdates(indexName, flattened);
		const updateCacheKey = getCacheKeyUpdate(owner, repo, page, response.headers.etag);
		const body = [...bulkIssues, ...updateCacheKey];
		console.log(`[${logDisplayName}#${page}] Writing issues and new cache key "${response.headers.etag}" to Elasticsearch`);
		await client.bulk({ body });
	}
}


export async function crawlIssues() {
  const client = new elasticsearch.Client(elasticsearchEnv);
  const args = process.argv.slice(2);
	const test = !!(args.find(arg => arg === "test"));

	const projectMap: { [key: string]: Array<ProjectInfo> } = {};

	// Get org level projects first.
	await getProjectsForOrg(octokit, { issues: projectMap, test: !!test });

	await Promise.all([
		...repos.map(repo => crawlIssuesForRepo({ repo, client, test, projectMap })),
		...(privateRepos.length > 0 ? privateRepos.map((repo, index) => crawlIssuesForRepo({ repo, isPrivate: true, client, test, projectMap })) : [])
	]);
}

interface CrawlIssuesForRepoOpts {
	repo: string;
	isPrivate?: boolean;
	test?: boolean;
	client: elasticsearch.Client
	projectMap: { [key: string]: Array<ProjectInfo> }
}

async function crawlIssuesForRepo(opts: CrawlIssuesForRepoOpts): Promise<void> {
	const { test, client } = opts;

	console.log(`Processing repository ${opts.repo}.`);
	const [ owner, repo ] = opts.repo.split('/');

	const cache = await loadCacheForRepo(client, owner, repo);

	await getProjectsForRepo(octokit, { owner, repo, issues: opts.projectMap, test: !!test });

	let page = 1;
	let shouldCheckNextPage = true;
	while(shouldCheckNextPage) {
		console.log(`[${repo}#${page}] Requesting issues using etag: ${cache[page]}`);
		try {
			const headers = cache[page] && !process.env.CLEAR_ISSUE_CACHE ? { 'If-None-Match': cache[page] } : {};
			const response = await octokit.issues.listForRepo({
				owner,
				repo,
				page,
				per_page: 100,
				state: 'all',
				sort: 'created',
				direction: 'desc',
				headers: headers,
			});
			console.log(`[${repo}#${page}] Remaining request limit: %s/%s`,
				response.headers['x-ratelimit-remaining'],
				response.headers['x-ratelimit-limit']
			);

			const indexName = opts.isPrivate ? `private-issues-${owner}-${repo}` : `issues-${owner}-${repo}`;
			await processGitHubIssues({ client, owner, repo, response, page, indexName, logDisplayName: repo, issuesWithProjects: opts.projectMap });
			shouldCheckNextPage = !test && !!(response.headers.link && response.headers.link.includes('rel="next"'));
			page++;
		} catch (error) {
			if (error.name === 'HttpError' && error.status === 304) {
				// Ignore not modified responses and continue with the next page.
				console.log(`[${repo}#${page}] Page was not modified. Continue with next page.`);
				page++;
				continue;
			}

			if(error.request && error.request.request.retryCount) {
				console.error(`[${repo}#${page}] Failed request for page after ${error.request.request.retryCount} retries.`);
			} else {
				console.error(error);
			}
			throw error;
		}
	}
}