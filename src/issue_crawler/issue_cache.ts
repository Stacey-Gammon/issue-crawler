import elasticsearch, { BulkIndexDocumentsParams, SearchResponse } from 'elasticsearch';
import { issueMapping } from './issue_doc';

const CACHE_INDEX = 'cache';
type CacheEntry = {
	owner: string;
	repo: string;
	page: number;
	key?: string;
}

/**
 * Load the existing cache for the specified repository. The result will be
 * in the format { [pageNr]: 'cacheKey' }.
 */
export async function loadCacheForRepo(client: elasticsearch.Client, owner: string, repo: string): Promise<Record<number, string | undefined>> {
	const entries = await getCachedEntries(client, owner, repo);

	if (!entries) return {};

	if (entries && entries.hits.total === 0) {
		return {};
	}

	const cacheMapping: Record<string, string | undefined>  = {};
	return entries.hits.hits.reduce((cache, entry: any) => {
		cache[entry._source.page] = entry._source.key;
		return cache;
	}, cacheMapping);
}

/**
 * Returns the bulk request body to update the cache key for the specified repo
 * and page.
 */
export function getCacheKeyUpdate(owner: string, repo: string, page: number, key?: string): BulkIndexDocumentsParams['body'] {
	const id = `${owner}_${repo}_${page}`
	return [
		{ index: { _index: CACHE_INDEX, _type: '_doc', _id: id }},
		{ owner, repo, page, key }
	];
}

async function getCachedEntries(client: elasticsearch.Client, owner: string, repo: string): Promise<SearchResponse<CacheEntry>  | undefined> {
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
				index: repo,
				body: {
					mappings: {
						properties: issueMapping
					},
				},
			});

			await client.indices.create({ method: 'PUT',
				index: CACHE_INDEX,
			});

			return getCachedEntries(client, owner, repo);
		} else {
			console.error(e);
		}
	}
}