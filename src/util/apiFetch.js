import fetch from 'node-fetch'
import buildUrl from 'build-url'
import parseLinkHeader from 'parse-link-header'
import sleep from 'await-sleep'

import {log} from './logging'

const DEFAULT_HEADERS = {
  Accept: 'application/json',
}

class APIError extends Error {
  constructor(status, statusText, text, url) {
    const message = `API Error ${status} (${statusText}) trying to invoke API (url = '${url}')`
    super(message)
    this.name = 'APIError'
    this.status = status
    this.statusText = statusText
    this.url = url

    if (text != null)
      text.then(text => log(text + "\n"))
  }
}

function apiBuildUrl(urlData) {

  return buildUrl(urlData.base, urlData)
}


function apiFetchRaw(urlData, opts) {
  opts.headers = Object.assign({}, DEFAULT_HEADERS, opts.headers)

  const url = (typeof urlData === 'object') ? apiBuildUrl(urlData) : urlData

  //log("apiFetchRaw", url, opts)
  return fetch(url, opts)
}

const MAX_RETRY = 3

async function apiFetchRawRetry(urlData, opts, n = MAX_RETRY) {
  return apiFetchRaw(urlData, opts)
    .then(async resp => {
      if (!resp.ok && n > 0) {
        //clubhouse returns 429, github 403 and X-RateLimit-Reset in headers
        if (resp.status === 429 || (resp.status === 403 && resp.headers.has('X-RateLimit-Reset'))) {
          log("    API rate limit exceeded, retrying")
          await sleep(1000)
          // exceeding rate limit does not count as a retry...
          return await apiFetchRawRetry(urlData, opts, n)
        }
        else if (!resp.ok) {
          throw new APIError(resp.status, resp.statusText, resp.text(), resp.url)
        }
      }
      return resp
    })
    .catch(async error => {
      log(`    Network error ${error.errno}:${error.url}, retrying`)
      await sleep(1000)
      if (n > 0)
        return await apiFetchRawRetry(urlData, opts, n - 1)
      else
        throw new APIError(error.errno, error.message, null, error.url)
    })
}

export function apiFetch(urlData, opts = {}) {
  return apiFetchRawRetry(urlData, opts)
    .then(resp => {
      if (!resp.ok) {
        throw new APIError(resp.status, resp.statusText, resp.text(), resp.url)
      }
      return resp.json()
    })
}


export function apiFetchAllPages(urlData, opts = {}, prevResults = []) {
  return apiFetchRawRetry(urlData, opts)
    .then(resp => {
      if (!resp.ok) {
        throw new APIError(resp.status, resp.statusText, resp.text(), resp.url)
      }
      const link = parseLinkHeader(resp.headers.get('Link'))
      let next = null
      if (link && link.next) {
        next = link.next.results && !eval(link.next.results) ? null : link.next.url // eslint-disable-line no-eval
      }
      return resp.json()
        .then(results => {
          if (next) {
            return apiFetchAllPages(next, opts, prevResults.concat(results))
          }
          return prevResults.concat(results)
        })
    })
}


