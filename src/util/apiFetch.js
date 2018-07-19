import fetch from 'node-fetch'
import buildUrl from 'build-url'
import parseLinkHeader from 'parse-link-header'
import sleep from 'await-sleep'

const DEFAULT_HEADERS = {
  Accept: 'application/json',
}

class APIError extends Error {
  constructor(status, statusText, urlData) {
    const url = apiBuildUrl(urlData)
    const message = `API Error ${status} (${statusText}) trying to invoke API (url = '${url}')`
    super(message)
    this.name = 'APIError'
    this.status = status
    this.statusText = statusText
    this.url = url
  }
}

function apiBuildUrl(urlData) {

  // remove queryParanms if empty, othwerise will have extra "?" in the URL
//  if ('queryParams' in urlData && Object.keys(urlData.queryParams).length === 0) {
//    delete urlData.queryParams
//  }

  //console.log("apiBuildUrl", urlData, buildUrl(urlData.base, urlData))
  return buildUrl(urlData.base, urlData)
}


function apiFetchRaw(urlData, opts) {
  opts.headers = Object.assign({}, DEFAULT_HEADERS, opts.headers)

  const url = (typeof urlData === 'object') ? apiBuildUrl(urlData) : urlData

  console.log("apiFetchRaw", url, opts)
  return fetch(url, opts)
}

const MAX_RETRY = 1000

function apiFetchRawRetry(urlData, opts, n = MAX_RETRY) {

  return apiFetchRaw(urlData, opts)
    .then(resp => {

      if (!resp.ok && n > 1) {
        //clubhouse returns 429, github 403 and X-RateLimit-Reset in headers
        if (resp.status === 429 || (resp.status === 403 && resp.headers.has('X-RateLimit-Reset'))) {
          console.log("rate limiting exceeded, sleeping before retry")

          //await sleep((MAX_RETRY - n + 1) * 1000)
          return apiFetchRawRetry(urlData, opts, n - 1);
        }
        else if (!resp.ok) {
          throw new APIError(resp.status, resp.statusText, urlData)
        }
      }

      return resp
    })
}

export function apiFetch(urlData, opts = {}) {
  return apiFetchRaw(urlData, opts)
    .then(resp => {
      if (!resp.ok) {
        throw new APIError(resp.status, resp.statusText, urlData)
      }
      return resp.json()
    })
}


export function apiFetchAllPages(urlData, opts = {}, prevResults = []) {
  return apiFetchRawRetry(urlData, opts)
    .then(resp => {
      if (!resp.ok) {
        throw new APIError(resp.status, resp.statusText, urlData)
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


// export function apiFetchAllPages(urlData, opts = {}, prevResults = []) {

//   var resp = apiFetchRawRetry(urlData, opts)

//   console.log("resp", resp)
//   if (!resp.ok) {
//     throw new APIError(resp.status, resp.statusText, urlData)
//   }

//   const link = parseLinkHeader(resp.headers.get('Link'))
//   let next = null
//   if (link && link.next) {
//     next = link.next.results && !eval(link.next.results) ? null : link.next.url // eslint-disable-line no-eval
//   }

//   const results = prevResults.concat(resp.json())
//   console.log("results len", results.length)

//   if (next) {
//     return apiFetchAllPages(next, opts, results)
//   }
//   return results
// }
