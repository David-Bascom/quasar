
import { readFileSync } from 'node:fs'

import { getPackage } from '../../helpers/get-package.js'
import { progress } from '../../helpers/logger.js'
import { appPackageJson } from '../../helpers/app-package-json.js'

const workboxBuild = await getPackage('workbox-build')

export function createHeadTags (quasarConf) {
  const { publicPath } = quasarConf.build
  const { pwaManifest } = quasarConf.htmlVariables
  const { useCredentialsForManifestTag, injectPwaMetaTags, manifestFilename } = quasarConf.pwa

  let headTags
    = `<link rel="manifest" href="${ publicPath }${ manifestFilename }"${ useCredentialsForManifestTag === true ? ' crossorigin="use-credentials"' : '' }>`

  if (injectPwaMetaTags === true) {
    headTags
      += (pwaManifest.theme_color !== void 0
        ? `<meta name="theme-color" content="${ pwaManifest.theme_color }">`
          + `<link rel="mask-icon" href="${ publicPath }icons/safari-pinned-tab.svg" color="${ pwaManifest.theme_color }">`
        : '')
      + '<meta name="apple-mobile-web-app-capable" content="yes">'
      + '<meta name="apple-mobile-web-app-status-bar-style" content="default">'
      + `<meta name="msapplication-TileImage" content="${ publicPath }icons/ms-icon-144x144.png">`
      + '<meta name="msapplication-TileColor" content="#000000">'
      + (pwaManifest.name !== void 0 ? `<meta name="apple-mobile-web-app-title" content="${ pwaManifest.name }">` : '')
      + `<link rel="apple-touch-icon" href="${ publicPath }icons/apple-icon-120x120.png">`
      + `<link rel="apple-touch-icon" sizes="152x152" href="${ publicPath }icons/apple-icon-152x152.png">`
      + `<link rel="apple-touch-icon" sizes="167x167" href="${ publicPath }icons/apple-icon-167x167.png">`
      + `<link rel="apple-touch-icon" sizes="180x180" href="${ publicPath }icons/apple-icon-180x180.png">`
  }
  else if (typeof injectPwaMetaTags === 'function') {
    headTags += injectPwaMetaTags()
  }

  return headTags
}

export function injectPwaManifest (quasarConf, ifNotAlreadyGenerated) {
  if (ifNotAlreadyGenerated === true && quasarConf.htmlVariables.pwaManifest !== void 0) {
    return
  }

  const id = appPackageJson.name || 'quasar-pwa'
  const pwaManifest = {
    id,
    name: appPackageJson.productName || appPackageJson.name || 'Quasar App',
    short_name: id,
    description: appPackageJson.description,
    display: 'standalone',
    start_url: quasarConf.build.publicPath,
    ...JSON.parse(readFileSync(quasarConf.metaConf.pwaManifestFile, 'utf-8'))
  }

  if (typeof quasarConf.pwa.extendManifestJson === 'function') {
    quasarConf.pwa.extendManifestJson(pwaManifest)
  }

  quasarConf.htmlVariables.pwaManifest = pwaManifest
}

export async function buildPwaServiceWorker (workboxMode, workboxConfig) {
  const done = progress('Compiling of the ___ with Workbox in progress...', 'Service Worker')
  await workboxBuild[ workboxMode ](workboxConfig)
  done('The ___ compiled with success')
}
