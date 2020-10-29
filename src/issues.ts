

import { extractValues, extractValue, findLabel, extractVersionNumber } from './utils';

import moment from 'moment';
import { IssuesListForRepoResponseData } from '@octokit/types';
import { ProjectInfo } from './projects';

type EnhancedDate = {
  time: string;
  weekday: string;
  weekday_number: number;
  hour_of_day: number;
}

/**
 * Enhace a passed in date, into an object that contains further useful
 * information about that date (e.g. day of the week or hour of day).
 */
function enhanceDate(date: string): EnhancedDate | undefined {
	if (!date) return undefined;

	const m = moment(date);
	return {
		time: m.format(),
		weekday: m.format('ddd'),
		weekday_number: parseInt(m.format('d')),
		hour_of_day: parseInt(m.format('H'))
	};
}

export interface KibanaIssue {
  priority_num: number;
  is_team_dependency: boolean;
  is_project_dependency: boolean;
  is_internal_request: boolean;
  needed_for: Array<string>;
  priority?: string;
  teams: Array<string>;
  features: Array<string>;
  loe?: string;
  id: string;
  projects: Array<string>;
  project_board?: string;
  stage?: string;
  order?: number;
  release_target?: string;
  original_release_target?: string;
  previous_release_target?: string;
  release_status: "Done" | "In progress" | "Not started";
  for_release_status: boolean;
  in_progress: boolean;
  is_prioritized: boolean;
  is_tech_debt: boolean;
  last_crawled_at: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  // Issue number. "Id" above is not the issue number.
  number: number;
  url: string;
  comment_count: number;
  created_at?: EnhancedDate;
  updated_at?: EnhancedDate;
  closed_at?: EnhancedDate;
  user: string;
  body: string;
  labels: Array<string>;
  is_pullrequest: boolean;
  assignees: Array<string>,
  time_to_fix?: number,
} 

/**
 * Takes in the raw issue from the GitHub API response and must return the
 * object that should be stored inside Elasticsearch.
 */
export function convertIssue(
    owner: string,
    repo: string,
    raw: IssuesListForRepoResponseData[0],
    issuesToProjects: { [key: string]: Array<ProjectInfo> }): Array<KibanaIssue> {
	const time_to_fix = (raw.created_at && raw.closed_at) ?
			moment(raw.closed_at).diff(moment(raw.created_at)) :
			undefined;
	
  const priority = extractValue(raw.labels, 'impact');
  const teams = extractValues(raw.labels, 'Team');
  const dependent_teams = extractValues(raw.labels, 'Dependency');
  const features = extractValues(raw.labels, 'Feature');
  const projects = extractValues(raw.labels, 'Project');
  const loe = extractValue(raw.labels, 'loe');
  const is_tech_debt = !!findLabel(raw.labels, 'technical debt');
  const for_release_status = !!findLabel(raw.labels, 'ReleaseStatus');
	const is_project_dependency = projects.length >= 1;
  const is_team_dependency = dependent_teams.length >= 1;
  const state = raw.state;

  const assignees = !raw.assignees ? [] : raw.assignees.map(a => a.login);
  let priority_num = 5;

	if (priority === "critical") {
		priority_num = 1;
	} else if (priority === "high") {
		priority_num = 2;
	} else if (priority === "medium") {
		priority_num = 3;
	} else if (priority === "low") {
		priority_num = 4;
	}
  const id = raw.number + '';
  if (issuesToProjects[id] === undefined) {
    issuesToProjects[id] = [
      {
        name: 'undefined',
        stage: 'undefined',
        order: 1000,
      }
    ]; 
  }

  console.log('issuesToProjects[id] is ', issuesToProjects[id]);

  const issues: Array<KibanaIssue> = [];
  issuesToProjects[id].forEach(projectBoard => {

      const stage = projectBoard.stage;
      const release_target = extractVersionNumber(stage);


      let release_status: "Not started" | "In progress" | "Done" = 'Not started';
      if (assignees.length > 0 && state === 'open') {
        release_status = 'In progress';
      } else if (state === 'closed') {
        release_status = 'Done';
      } 

      const issue: KibanaIssue = {
        loe,
        id: raw.id + 'p' + projectBoard.name,
        priority_num,
        projects,
        project_board: projectBoard.name,
        stage,
        original_release_target: release_target,
        release_target,
        order: projectBoard.order,
        features,
        priority,
        teams,
        release_status,
        for_release_status,
        in_progress: assignees.length > 0 && state === 'open',
        is_team_dependency,
        is_prioritized: priority !== undefined && priority !== '',
        is_project_dependency,
        is_internal_request: is_team_dependency || is_project_dependency,
        is_tech_debt,
        needed_for: dependent_teams,
        last_crawled_at: Date.now(),
        owner,
        repo,
        state,
        title: raw.title,
        number: raw.number,
        url: `https://github.com/elastic/kibana/issues/${raw.number}`,
        comment_count: raw.comments,
        created_at: enhanceDate(raw.created_at),
        updated_at: enhanceDate(raw.updated_at),
        closed_at: enhanceDate(raw.closed_at),
        user: raw.user.login,
        body: raw.body,
        labels: raw.labels.map(label => label.name),
        is_pullrequest: !!raw.pull_request,
        assignees,
        time_to_fix,
      };
      
      if (issuesToProjects[id]) {
      //console.log('Issue is ', issue);
      }
      issues.push(issue);
  });
  return issues
}

module.exports = { convertIssue }