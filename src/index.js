import Bluebird from 'bluebird'

import {getIssue, getCommentsForIssue, getLabelsForIssue, createIssue, createIssueComment} from './fetchers/gitHub'
import {getStory, listUsers, listLabels, listProjects, createStory, createLabel} from './fetchers/clubhouse'
import {parseClubhouseStoryURL, parseGithubIssueURL, parseGithubRepoURL} from './util/urlParse'

export {saveConfig, loadConfig} from './util/config'

export async function clubhouseStoryToGithubIssue(clubhouseStoryURL, githubRepoURL, options = {}) {
  _assertOption('githubToken', options)
  _assertOption('clubhouseToken', options)

  const {storyId} = parseClubhouseStoryURL(clubhouseStoryURL)
  const {owner, repo} = parseGithubRepoURL(githubRepoURL)

  const clubhouseUsers = await listUsers(options.clubhouseToken)
  const clubhouseUsersById = clubhouseUsers.reduce((acc, user) => {
    acc[user.id] = user
    return acc
  })

  const story = await getStory(options.clubhouseToken, storyId)
  const unsavedIssue = _storyToIssue(clubhouseStoryURL, story)
  const unsavedIssueComments = _presentClubhouseComments(story.comments, clubhouseUsersById)
  const issue = await createIssue(options.githubToken, owner, repo, unsavedIssue)
  await Bluebird.each(unsavedIssueComments, comment => createIssueComment(options.githubToken, owner, repo, issue.number, comment))

  return issue
}

export async function githubIssueToClubhouseStory(githubIssueURL, clubhouseProject, options = {}) {
  _assertOption('githubToken', options)
  _assertOption('clubhouseToken', options)

  const clubhouseUsers = await listUsers(options.clubhouseToken)
  //console.log("clubhouseUsers", clubhouseUsers)
  const clubhouseUsersByName = clubhouseUsers.reduce((acc, user) => {
    acc[user.username] = user
    return acc
  }, {} )
  console.log("clubhouseUsersByName", clubhouseUsersByName)

  const clubhouseLabels = await listLabels(options.clubhouseToken)
  //console.log("clubhouseLabels", clubhouseLabels)
  const clubhouseLabelsByName = clubhouseLabels.reduce((acc, label) => {
    acc[label.name] = label
    return acc
  }, {} )
  console.log("clubhouseLabelsByName", clubhouseLabelsByName)

  const projects = await listProjects(options.clubhouseToken)
  const project = projects.find(project => project.name === clubhouseProject)

  if (!project) {
    throw new Error(`The '${clubhouseProject}' project wasn't found in your Clubhouse`)
  }

  const {id: projectId} = project

  const {owner, repo, issueNumber} = parseGithubIssueURL(githubIssueURL)
  const issue = await getIssue(options.githubToken, owner, repo, issueNumber)
  const issueComments = await getCommentsForIssue(options.githubToken, owner, repo, issueNumber)
  const issueLabels = await getLabelsForIssue(options.githubToken, owner, repo, issueNumber)
  console.log("comments", issueComments)
  console.log("labels", issueLabels)
  console.log("issue", issue)
  const unsavedStory = _issueToStory(clubhouseUsersByName, clubhouseLabelsByName, projectId, issue, issueComments, issueLabels)
  console.log("story", unsavedStory)
  const story = createStory(options.clubhouseToken, unsavedStory)

  return story
}

function _assertOption(name, options) {
  if (!options[name]) {
    throw new Error(`${name} option must be provided`)
  }
}


const userMappings = {
  "melor": "melohmu", "harmti": "timoharm"}

function _mapUser(clubhouseUsersByName, githubUsername) {

  //console.log("githubUsername", githubUsername)

  var username
  if (userMappings[githubUsername]) {
    username = userMappings[githubUsername]
  }
  else {
    username = githubUsername
  }

  //console.log("username", username)
  if (clubhouseUsersByName[username]) {
    return clubhouseUsersByName[username].id
  }
  else {
    // default username if not found...
    console.log("Warning, user missing from clubhouse", username)
    return Object.keys(clubhouseUsersByName)[0].id
  }
}

/* eslint-disable camelcase */

function _issueToStory(clubhouseUsersByName, clubhouseLabelsByName, projectId, issue, issueComments, issueLabels) {
  return {
    project_id: projectId,
    name: issue.title,
    description: issue.body,
    comments: _presentGithubComments(clubhouseUsersByName, issueComments),
    labels: _presentGithubLabels(clubhouseLabelsByName, issueLabels),
    //labels:  [{name: 'ddsui', color: '#dbca06', external_id: 'bar' }],
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    external_id: issue.html_url,
    requested_by_id: _mapUser(clubhouseUsersByName, issue.user.login),
  }
}

function _presentGithubComments(clubhouseUsersByName, issueComments) {
  return issueComments.map(issueComment => ({
    author_id: _mapUser(clubhouseUsersByName, issueComment.user.login),
    text: issueComment.body,
    created_at: issueComment.created_at,
    updated_at: issueComment.updated_at,
    external_id: issueComment.url,
  }))
}

function _presentGithubLabels(clubhouseLabelsByName, issueLabels) {

  // Create labels missing from clubhouse
  //console.log("checking if new github labels needed for", issueLabels)
  for (let issueLabel of issueLabels) {
    if (!(issueLabel.name in clubhouseLabelsByName)) {
      console.log("creating label", issueLabel.name, `#${issueLabel.color}`)
      var label = createLabel({
        name: issueLabel.name,
        color: `#${issueLabel.color}`
        //created_at: issueLabel.created_at,
        //updated_at: issueLabel.updated_at,
        //external_id: issueLabel.url,
      })
      clubhouseLabelsByName[label.name] = label
    }
  }

  return issueLabels.map(issueLabel => ({
    name: issueLabel.name,
  }))
}

function _storyToIssue(clubhouseStoryURL, story) {
  const renderedTasks = story.tasks
    .map(task => `- [${task.complete ? 'x' : ' '}] ${task.description}`)
    .join('\n')
  const renderedTasksSection = renderedTasks.length > 0 ? `\n### Tasks\n\n${renderedTasks}` : ''
  const originalStory = `From [ch${story.id}](${clubhouseStoryURL})`

  return {
    title: story.name,
    body: `${originalStory}\n\n${story.description}${renderedTasksSection}`,
  }
}

function _presentClubhouseComments(comments, clubhouseUsersById) {
  return comments.map(comment => {
    const user = clubhouseUsersById[comment.author_id] || {username: comment.author_id}
    return {
      body: `**[Comment from Clubhouse user @${user.username}:]** ${comment.text}`
    }
  })
}
