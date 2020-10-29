import { Octokit } from "@octokit/rest";


import { mapResponses, extractIssueNumber, logRateLimit } from './utils';
import { ProjectsListForOrgResponseData, ProjectsListForRepoResponseData } from "@octokit/types";

export interface IssueProjectInfo {
  name: string;
  stage: string;
  order: number;
}

export interface ProjectInfo {
  name: string;
  stage: string;
  order: number;
}

type ProjectsForOrgRequest = {
  org: string;
  state: "open" | "closed" | "all" | undefined;
  sort: string;
  per_page: number;
  direction: string;
};

type ProjectsForRepoRequest = {
  owner: string;
  repo: string;
  state: "open" | "closed" | "all" | undefined;
  sort: string;
  per_page: number;
  direction: string;
}

type CardEntry = {
  contentUrl: string;
  issue?: string;
}

type ColumnEntry = {
  id: string;
  name: string;
  cards: Record<string, CardEntry>
}

type ProjectEntry = {
  id: string;
  name: string;
  columns: Record<string, ColumnEntry>;
}

type ProjectMapping = Record<string, ProjectEntry>;


async function getCards(
    octokit: Octokit,
    columnId: number,
    project: ProjectEntry,
    issues: Record<string, Array<IssueProjectInfo>>) {
  const response = await octokit.projects.listCards({
    column_id: columnId,
    archived_state: 'not_archived'
  });
  await new Promise(resolve => setTimeout(resolve, 3000));
  logRateLimit(response, 'getCards');
  let order = 1;
  response.data.forEach((card) => {
    const issue = card.content_url ? extractIssueNumber(card.content_url): undefined;
    project.columns[columnId + ''].cards[card.id] = {
      contentUrl: card.content_url,
      issue,
    }

    const stage = project.columns[columnId].name;
    const projectName = project.name;
    if (issue && issues[issue]) {
      issues[issue].push({ name: projectName, stage, order });
    } else if (issue) {
      issues[issue] = [
        { name: projectName, stage, order }
      ]
    }
    order++;
  });
}

async function getColumns(octokit: Octokit, projectId: number, projects: ProjectMapping, issues: Record<string, Array<IssueProjectInfo>>) {
  console.log('getColumns for project ' + projects[projectId].name);
  await new Promise(resolve => setTimeout(resolve, 3000));
  const response = await octokit.projects.listColumns({
    project_id: projectId,
  });
  logRateLimit(response, 'getColumns');
  await Promise.all(response.data.map(async (column) => {
    projects[projectId].columns[column.id] = {
      id: column.id + '',
      name: column.name,
      cards: {},
    };

    await new Promise(resolve => setTimeout(resolve, 3000));
    await getCards(octokit, column.id, projects[projectId], issues);
  }));
}

export async function getProjects(
    octokit: Octokit,
    owner: string,
    repo: string,
    issues: Record<string, Array<IssueProjectInfo>>,
    test: boolean) {
  const projects: ProjectMapping = {};
  await new Promise(resolve => setTimeout(resolve, 3000));

	await mapResponses<ProjectsForOrgRequest, ProjectsListForOrgResponseData[1]>({
    org: 'elastic',
    per_page: 5,
    state: 'open',
    sort: 'created',
    direction: 'desc',
  },
  async (request: ProjectsForOrgRequest) => await octokit.projects.listForOrg(request),
  async (project) => {
    if (project.name.search("Kibana") >= 0) {
      projects[project.id] = {
        id: project.id + '',
        name: project.name,
        columns: {}
      };
      await getColumns(octokit, project.id, projects, issues);
    }
  }
);

	await mapResponses<ProjectsForRepoRequest, ProjectsListForRepoResponseData[0]>({
      owner,
      repo,
      per_page: 5,
      state: 'open',
      sort: 'created',
      direction: 'desc',
    },
    async (request) => await octokit.projects.listForRepo(request),
    async (project) => {
      projects[project.id] = {
        id: project.id + '',
        name: project.name,
        columns: {}
      };
      await getColumns(octokit, project.id, projects, issues);
    }, 
    test
  );
  return projects;
}
