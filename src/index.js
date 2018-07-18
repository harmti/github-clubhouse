import Bluebird from 'bluebird'

import {getIssue, queryIssues, getCommentsForIssue, getLabelsForIssue, createIssue, createIssueComment} from './fetchers/gitHub'
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

export async function githubIssueToClubhouseStory(options) {
  _assertOption('githubToken', options)
  _assertOption('clubhouseToken', options)
  _assertOption('clubhouseProject', options)
  _assertOption('githubProject', options)

  const clubhouseUsers = await listUsers(options.clubhouseToken)
  //console.log("clubhouseUsers", clubhouseUsers)
  const clubhouseUsersByName = clubhouseUsers.reduce((acc, user) => {
    acc[user.profile.mention_name] = user
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
  const project = projects.find(project => project.name === options['clubhouseProject'])

  if (!project) {
    throw new Error(`The '${options['clubhouseProject']}' project wasn't found in your Clubhouse`)
  }

  const {id: projectId} = project

  console.log("SPLIT", options.githubProject.split("/"))
  const [owner, repo] = options.githubProject.split("/")

  var issues = {}
  if ('issue' in options) {
    issues = [await getIssue(options.githubToken, owner, repo, options.issue)]
  } else {
    issues = await queryIssues(options.githubToken, owner, repo, options.query)
    issues = issues.items
  }
  console.log("issues:", issues)

  var count=0
  for (const issue of issues) {
    console.log("issue", issue)
    const issueComments = await getCommentsForIssue(options.githubToken, owner, repo, issue.number)
    const issueLabels = await getLabelsForIssue(options.githubToken, owner, repo, issue.number)
    console.log("comments", issueComments)
    console.log("labels", issueLabels)
    const unsavedStory = _issueToStory(clubhouseUsersByName, clubhouseLabelsByName, projectId, issue, issueComments, issueLabels)
    console.log("story", unsavedStory)

    if (!options.dry_run) {
      console.log("will call createStory")
      const story = await createStory(options.clubhouseToken, unsavedStory)
      console.info("Created story", story.id)
      count=count+1
    }
  }

  return count
}

function _assertOption(name, options) {
  if (!options[name]) {
    throw new Error(`${name} option must be provided`)
  }
}


//const userMappings = {
//  "melor": "melohmu", "harmti": "timoharm"}

const userMappings = {}

function _mapUser(clubhouseUsersByName, githubUsername) {

  //console.log("githubUsername", githubUsername)

  var username
  if (userMappings[githubUsername]) {
    username = userMappings[githubUsername]
  }
  else {
    username = githubUsername
  }

  console.log("username", username)
  if (clubhouseUsersByName[username]) {
    return clubhouseUsersByName[username].id
  }
  else {
    // default username if not found...
    console.log("Warning, user missing from clubhouse:", username)
    console.log("Object.keys(clubhouseUsersByName)", Object.keys(clubhouseUsersByName))
    return clubhouseUsersByName[Object.keys(clubhouseUsersByName)[0]].id
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
