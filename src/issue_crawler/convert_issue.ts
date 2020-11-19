

import { extractValues, extractValue, findLabel, extractVersionNumber } from '../utils';

import moment from 'moment';
import { IssuesListForRepoResponseData } from '@octokit/types';
import { ProjectInfo } from './get_projects';
import { EnhancedDate, IssueDoc, ReleaseStatus } from './issue_doc';
import { extractReleaseStatus } from './extract_release_status';


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

/**
 * Takes in the raw issue from the GitHub API response and must return the
 * object that should be stored inside Elasticsearch.
 */
export function convertIssue(
    owner: string,
    repo: string,
    raw: IssuesListForRepoResponseData[0],
    issuesToProjects: { [key: string]: Array<ProjectInfo> }): Array<IssueDoc> {
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

  // Placeholder for issues that don't belong to any project broad, we will
  // need to leave these values undefined.
  if (issuesToProjects[id] === undefined) {
    issuesToProjects[id] = [
      {
        name: 'undefined',
        stage: 'undefined',
        order: 1000,
      }
    ]; 
  }

  const issues: Array<IssueDoc> = [];
  issuesToProjects[id].forEach(projectBoard => {

      const project_board_column = projectBoard.stage;
      const release_target = extractVersionNumber(project_board_column);
      const release_status = extractReleaseStatus(raw, projectBoard);

      const issue: IssueDoc = {
        loe,
        id: raw.id + 'p' + projectBoard.name,
        priority_num,
        projects,
        project_board: projectBoard.name,
        project_board_column,
        original_release_target: release_target,
        release_target,
        project_board_column_order: projectBoard.order,
        features,
        priority,
        teams,
        release_status: extractReleaseStatus(raw, projectBoard),
        for_release_status,
        in_progress: release_status === ReleaseStatus.IN_PROGRESS,
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