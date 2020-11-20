import { OctokitResponse } from "@octokit/types";

export function extractValue(labels: Array<{ name: string }>, value: string) {
	let val;
	labels.forEach((label) => {
	  if (label.name.startsWith(value)) {
			val = label.name.substring(value.length + 1, label.name.length);
		}
	});
	return val;
}


export function extractValues(labels: Array<{ name: string }>, value: string) {
	const matchingValues: Array<string> = [];
  return labels.reduce((acc, label) => {
	  if (label.name.startsWith(value)) {
			acc.push(label.name.substring(value.length + 1, label.name.length));
		}
		return acc;
  }, matchingValues)
}

export function findLabel(labels: Array<{ name: string }>, labelToFind: string) {
  return labels.find((label) => label.name === labelToFind);
}

export function logRateLimit(response: { headers: Record<string, unknown> }, prefix: string) {
	console.log(`${prefix} Remaining request limit: %s/%s`,
		response.headers['x-ratelimit-remaining'],
		response.headers['x-ratelimit-limit']
	);
}

export async function mapResponses<Request, ResponseData>(
		request: Request,
		doQuery: (req: Request & { page: number }) => Promise<OctokitResponse<Array<ResponseData>>>,
		callback: (results: ResponseData) => void,
		test: boolean = false) {
	let shouldCheckNextPage: boolean = true;
	let page = 1;
	while(shouldCheckNextPage) {
		const response = await doQuery({ ...request, page });
		response.data[1]
		await Promise.all(response.data.map(async data => await callback(data)));
		shouldCheckNextPage = !test && !!(response.headers.link && response.headers.link.includes('rel="next"'));
		logRateLimit(response, 'mapResponses');
		page++;
		await new Promise(resolve => setTimeout(resolve, 2000));
	}
}

export function extractIssueNumber(contentUrl: string) {
	const sections = contentUrl.split('/');
	return sections[sections.length - 1];
}

export function extractVersionNumber(name: string) {
	const results = name.match(/\d+.\d+/ig);
	if (results && results.length > 0) {
		return results[0]
	} else {
		return undefined;
	}
}

export function getRelativeKibanaPath(fullPath: string): string {
	const parts = fullPath.split('/');
	if (parts.indexOf('x-pack') >= 0) {
		return parts.slice(parts.indexOf('x-pack'), parts.length).join('/');
	} else if (parts.indexOf('src') >= 0) {
		return parts.slice(parts.indexOf('src'), parts.length).join('/');
	}
	return fullPath;
}

export function getPublicOrServer(path: string): 'public' | 'server' {
  return path.indexOf('/public/') >= 0 ? 'public' : 'server';
}