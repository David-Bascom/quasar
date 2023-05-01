
import { existsSync, readFileSync } from 'node:fs'
import webpack from 'webpack'
import WebpackChain from 'webpack-chain'
import { CopyWebpackPlugin } from 'copy-webpack-plugin'

import appPaths from '../../app-paths.js'
import { WebserverAssetsPlugin } from './plugin.webserver-assets.js'
import { injectNodeTypescript } from '../inject.node-typescript.js'
import { WebpackProgressPlugin } from '../plugin.progress.js'

const nodeEnvBanner = 'if(process.env.NODE_ENV===void 0){process.env.NODE_ENV=\'production\'}'
const prodExportFile = {
  js: appPaths.resolve.ssr('production-export.js'),
  ts: appPaths.resolve.ssr('production-export.ts'),
  fallback: appPaths.resolve.app('.quasar/ssr-fallback-production-export.js')
}

const flattenObject = (obj, prefix = 'process.env') => {
  return Object.keys(obj)
    .reduce((acc, k) => {
      const pre = prefix.length ? prefix + '.' : ''

      if (Object(obj[ k ]) === obj[ k ]) {
        Object.assign(acc, flattenObject(obj[ k ], pre + k))
      }
      else {
        acc[ pre + k ] = JSON.stringify(obj[ k ])
      }

      return acc
    }, {})
}

export function createSSRWebserverChain (cfg, configName) {
  const { dependencies: appDeps = {} } = JSON.parse(
    readFileSync(appPaths.resolve.app('package.json'), 'utf-8')
  )

  const { dependencies: cliDeps = {} } = JSON.parse(
    readFileSync(appPaths.resolve.cli('package.json'), 'utf-8')
  )

  const chain = new WebpackChain()
  const resolveModules = [
    'node_modules',
    appPaths.resolve.app('node_modules'),
    appPaths.resolve.cli('node_modules')
  ]

  chain.target('node')
  chain.mode(cfg.ctx.prod ? 'production' : 'development')

  if (
    existsSync(prodExportFile.js) === false
    && existsSync(prodExportFile.ts) === false
  ) {
    chain.resolve.alias.set('src-ssr/production-export', prodExportFile.fallback)
  }

  chain.resolve.alias.set('src-ssr', appPaths.ssrDir)

  if (cfg.ctx.dev) {
    chain.entry('webserver')
      .add(appPaths.resolve.app('.quasar/ssr-middlewares.js'))

    chain.output
      .filename('compiled-middlewares.mjs')
      .path(appPaths.resolve.app('.quasar/ssr'))
  }
  else {
    chain.entry('webserver')
      .add(appPaths.resolve.app('.quasar/ssr-prod-webserver.js'))

    chain.output
      .filename('index.js')
      .path(cfg.build.distDir)
  }

  chain.output
    .library({
      type: 'module'
    })

  chain.externals([
    '@vue/server-renderer',
    '@vue/compiler-sfc',
    '@quasar/ssr-helpers/create-renderer',
    './render-template.js',
    './quasar.server-manifest.json',
    './quasar.client-manifest.json',
    'compression',
    'express',
    ...Object.keys(cliDeps),
    ...Object.keys(appDeps)
  ])

  chain.module.rule('node')
    .test(/\.node$/)
    .use('node-loader')
    .loader('node-loader')

  chain.resolve.modules
    .merge(resolveModules)

  chain.resolve.extensions
    .merge([ '.js', '.json', '.node' ])

  chain.resolveLoader.modules
    .merge(resolveModules)

  chain.plugin('define')
    .use(webpack.DefinePlugin, [
      // flatten the object keys
      // example: some: { object } becomes 'process.env.some.object'
      { ...flattenObject(cfg.build.env), ...cfg.__rootDefines }
    ])

  // we include it already in cfg.build.env
  chain.optimization
    .nodeEnv(false)

  injectNodeTypescript(cfg, chain)

  chain.plugin('progress')
    .use(WebpackProgressPlugin, [ { name: configName, cfg, hasExternalWork: true } ])

  if (cfg.ctx.prod) {
    // we need to set process.env.NODE_ENV to 'production'
    // (unless it's already set to something)
    // in order for externalized vue/vuex/etc packages to run the
    // production code (*.cjs.prod.js) instead of the dev one
    chain.plugin('node-env-banner')
      .use(webpack.BannerPlugin, [
        { banner: nodeEnvBanner, raw: true, entryOnly: true }
      ])

    chain.plugin('webserver-assets-plugin')
      .use(WebserverAssetsPlugin, [ cfg ])

    const patterns = [
      appPaths.resolve.app('.npmrc'),
      appPaths.resolve.app('.yarnrc')
    ].map(filename => ({
      from: filename,
      to: '..',
      noErrorOnMissing: true
    }))

    chain.plugin('copy-webpack')
      .use(CopyWebpackPlugin, [ { patterns } ])
  }

  if (cfg.ctx.debug || (cfg.ctx.prod && cfg.build.minify !== true)) {
    // reset default webpack 4 minimizer
    chain.optimization.minimizers.delete('js')
    // also:
    chain.optimization.minimize(false)
  }

  chain.performance
    .hints(false)

  return chain
}
