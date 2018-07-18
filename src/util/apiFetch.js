import fetch from 'node-fetch'
import buildUrl from 'build-url'
import parseLinkHeader from 'parse-link-header'

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

  const url = apiBuildUrl(urlData)
  console.log("apiFetchRaw", url, opts)
  return fetch(url, opts)
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
  return apiFetchRaw(urlData, opts)
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
