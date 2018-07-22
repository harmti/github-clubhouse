#!/usr/bin/env node

var path = require('path')
var parseArgs = require('minimist')
var camelcaseObject = require('camelcase-object');

var ghCh
try {
  ghCh = require('github-clubhouse')
} catch (err) {
  // so that we can run during development
  ghCh = require('../lib')
}
var loadConfig = ghCh.loadConfig
var saveConfig = ghCh.saveConfig
var githubIssueToClubhouseStory = ghCh.githubIssueToClubhouseStory

function run() {
  var args = parseArgs(process.argv.slice(2), {
    string: ['github-token', 'clubhouse-token', 'github-project', 'clubhouse-project', 'issue', 'query'],
    boolean: ['s', 'h', 'n'],
    alias: {
      h: 'help',
      s: 'save-config',
      n: 'dry-run',
    },
  })
  //console.log(args)

  if (args.h) {
    console.info(_usage())
    return process.exit(0)
  }
  if (args._.length > 0) {
    return _die('Syntax error, run --help for usage')
  }

  if (!(('issue' in args) != ('query' in args))) {
    return _die('Use --issue or --query, run --help for usage')
  }

  var options = _loadAndOrSaveOptions(args)
  //console.log(options)

  githubIssueToClubhouseStory(options)
    .then(function(count) {
      console.info(`\nImported ${count} stories`)
    })
    .catch(function(err) {
      console.error(err)
    })
}

function _die(message) {
  console.error(`ERROR: ${message}`)
  console.error('Try `--help` for help.')
  process.exit(1)
}

function _usage() {
  return 'Usage:\n' +
    '  ' + path.basename(process.argv[1]) + ' GITHUB_ISSUE_URL CLUBHOUSE_PROJECT_NAME\n' +
    '\n' +
    'Options:\n' +
    '  -h, --help                     display this help message\n' +
    '  -n, --dry-run                  test run, do not import\n' +
    '  -s, --save-config              save configuration into ~/.github-clubhouse\n' +
    '  --issue=NUMBER                 github issue number' +
    '  --query=QUERY                  github issue query' +
    '  --github-token=TOKEN           your GitHub API token\n' +
    '  --clubhouse-token=TOKEN        your Clubhouse API token' +
    '  --github-project=REPO/PROJECT  your github repo/project name' +
    '  --clubhouse-project=PROJECT    your Clubhouse project name'
}

function _loadAndOrSaveOptions(args) {
  var options = loadConfig()
  options = Object.assign(options, camelcaseObject(args))
  //console.log(options)
  if (args.s) {
    if (!args['github-token'] || !args['clubhouse-token']) {
      return _die('Cannot save configuration unless both `--github-token` and `--clubhouse-token` are provided.')
    }
    saveConfig(options)
  }

  return options
}

if (!module.parent) {
  run()
}
