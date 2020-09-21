import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import  elasticsearch, { BulkIndexDocumentsParams, SearchResponse } from 'elasticsearch';

import  { elasticsearchEnv, githubAuth, repos, privateRepos } from './config';


import { getProjects, ProjectInfo } from './projects';
import { convertIssue, KibanaIssue } from './issues';
import { IssuesListForRepoResponseData, OctokitResponse } from '@octokit/types';

const CACHE_INDEX = 'cache';
const CLEAR_CACHE = true;
const issuesWithProjects: { [key: string]: Array<ProjectInfo> } = {};

const client = new elasticsearch.Client(elasticsearchEnv);

const RetryOctokit = Octokit.plugin(retry);
const octokit = new RetryOctokit({
	previews: ['squirrel-girl-preview'],
	auth: githubAuth,
});

type CacheEntry = {
	owner: string;
	repo: string;
	page: number;
	key?: string;
}

/**
 * Create a bulk request body for all issues. You need to specify the index in
 * which these issues should be stored.
 */
function getIssueBulkUpdates(
		index: string,
		issues: Array<KibanaIssue>): BulkIndexDocumentsParams['body'] {
	console.log('getIssueBulkUpdates for ' + issues.length + ' issues');
	return issues.map(issue => [
		{ index: { _index: index, _type: '_doc', _id: issue.id }},
		issue
	]);
}

/**
 * Returns the bulk request body to update the cache key for the specified repo
 * and page.
 */
function getCacheKeyUpdate(owner: string, repo: string, page: number, key?: string): BulkIndexDocumentsParams['body'] {
	const id = `${owner}_${repo}_${page}`
	return [
		{ index: { _index: CACHE_INDEX, _type: '_doc', _id: id }},
		{ owner, repo, page, key }
	];
}

/**
 * Processes a GitHub response for the specified page of issues.
 * This will convert all issues to the desired format, store them into
 * Elasticsearch and update the cache key, we got from GitHub.
 */
async function processGitHubIssues(
	  owner: string,
		repo: string,
		response: OctokitResponse<IssuesListForRepoResponseData>,
		page: number,
		indexName: string,
		logDisplayName: string) {
	console.log(`[${logDisplayName}#${page}] Found ${response.data.length} issues`);
 	if (response.data.length > 0) {
		const issueGroups = response.data.map((issue: IssuesListForRepoResponseData[0]) => convertIssue(owner, repo, issue, issuesWithProjects));

		const flattened: Array<KibanaIssue> = [];
		issueGroups.forEach(issueGroup => flattened.push(...issueGroup));

    const existingIssues = await client.mget<KibanaIssue>({
			body: {
				docs: [
					...flattened.map(issue => ({
						_index: indexName,
            _id: issue.id
					}))
				]
			}
		});

		if (existingIssues.docs) {
			existingIssues.docs.forEach(doc => {
				if (doc.found) {
					const matchingIssue = flattened.find(i => (i.id + '') === (doc._id + ''));
					if (!matchingIssue) {
						console.log('no match found for doc with id ' + doc._id + ' in flattened list: ', flattened.map(i => i.id));
						return;
					}

					// The release target has gotten bumped
					if (doc._source.original_release_target !== matchingIssue.release_target) {
						matchingIssue.original_release_target = doc._source.original_release_target;
						matchingIssue.previous_release_target = doc._source.previous_release_target ? doc._source.previous_release_target : doc._source.original_release_target;
					}
	  		} else {
		  		console.log('doc for ' + doc._id  + ' not found');
			  }
  		});
		} else {
			console.log('existingIssues is ', existingIssues);
		}

		const bulkIssues = getIssueBulkUpdates(indexName, flattened);
		const updateCacheKey = getCacheKeyUpdate(owner, repo, page, response.headers.etag);
		const body = [...bulkIssues, ...updateCacheKey];
		console.log(`[${logDisplayName}#${page}] Writing issues and new cache key "${response.headers.etag}" to Elasticsearch`);
		await client.bulk({ body });
	}
}

async function getEntries(owner: string, repo: string): Promise<SearchResponse<CacheEntry> | undefined> {
	try {
		return await client.search({
			index: CACHE_INDEX,
			_source: ['page', 'key'],
			size: 10000,
			body: {
				query: {
					bool: {
						filter: [
							{ match: { owner } },
							{ match: { repo } }
						]
					}
				}
			}
		});
	} catch (e) {
		if (e.status === 404) {
			await client.indices.create({ method: 'PUT',
				index: CACHE_INDEX,
			});
			return getEntries(owner, repo);
		} else {
			console.error(e);
		}
	}
}

/**
 * Load the existing cache for the specified repository. The result will be
 * in the format { [pageNr]: 'cacheKey' }.
 */
async function loadCacheForRepo(owner: string, repo: string): Promise<Record<number, string | undefined>> {
	const entries = await getEntries(owner, repo);

	if (!entries) return {};

	if (entries && entries.hits.total === 0) {
		return {};
	}

	const cacheMapping: Record<string, string | undefined>  = {};
	return entries.hits.hits.reduce((cache, entry) => {
		cache[entry._source.page] = entry._source.key;
		return cache;
	}, cacheMapping);
}

async function main() {
	async function handleRepository(repository: string, displayName = repository, isPrivate = false): Promise<void> {
		console.log(`Processing repository ${displayName}`);
		const [ owner, repo ] = repository.split('/');

		await getProjects(octokit, owner, repo, issuesWithProjects);
		console.log('IssuesWithProjects is: ', issuesWithProjects);
		const cache = await loadCacheForRepo(owner, repo);

		let page = 1;
		let shouldCheckNextPage = true;
		while(shouldCheckNextPage) {
			console.log(`[${displayName}#${page}] Requesting issues using etag: ${cache[page]}`);
			try {
				const headers = cache[page] && !CLEAR_CACHE ? { 'If-None-Match': cache[page] } : {};
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
				console.log(`[${displayName}#${page}] Remaining request limit: %s/%s`,
					response.headers['x-ratelimit-remaining'],
					response.headers['x-ratelimit-limit']
				);

				const indexName = isPrivate ? `private-issues-${owner}-${repo}` : `issues-${owner}-${repo}`;
				await processGitHubIssues(owner, repo, response, page, indexName, displayName);
				shouldCheckNextPage = !!(response.headers.link && response.headers.link.includes('rel="next"'));
				page++;
			} catch (error) {
				if (error.name === 'HttpError' && error.status === 304) {
					// Ignore not modified responses and continue with the next page.
					console.log(`[${displayName}#${page}] Page was not modified. Continue with next page.`);
					page++;
					continue;
				}

				if(error.request && error.request.request.retryCount) {
					console.error(`[${displayName}#${page}] Failed request for page after ${error.request.request.retryCount} retries.`);
				} else {
					console.error(error);
				}
				throw error;
			}
		}
	}

	await Promise.all([
		...repos.map(rep => handleRepository(rep)),
		...(privateRepos.length > 0 ? privateRepos.map((rep, index) => handleRepository(rep, `PRIVATE_REPOS[${index}]`, true)) : [])
	]);

	process.exit(1);
}

main();
