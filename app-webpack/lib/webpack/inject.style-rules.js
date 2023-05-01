
import path from 'node:path'
import miniCssExtractPlugin from 'mini-css-extract-plugin'
import { merge } from 'webpack-merge'

import appPaths from '../app-paths.js'
import { cssVariables } from '../helpers/css-variables.js'

const quasarCssPaths = [
  path.join('node_modules', 'quasar', 'dist'),
  path.join('node_modules', 'quasar', 'src'),
  path.join('node_modules', '@quasar')
]

const absoluteUrlRE = /^[a-z][a-z0-9+.-]*:/i
const protocolRelativeRE = /^\/\//
const templateUrlRE = /^[{}[\]#*;,'§$%&(=?`´^°<>]/
const rootRelativeUrlRE = /^\//

/**
 * Inspired by loader-utils > isUrlRequest()
 * Mimics Webpack v4 & css-loader v3 behavior
 */
function shouldRequireUrl (url) {
  return (
    // an absolute url and it is not `windows` path like `C:\dir\file`:
    (absoluteUrlRE.test(url) === true && path.win32.isAbsolute(url) === false)
    // a protocol-relative:
    || protocolRelativeRE.test(url) === true
    // some kind of url for a template:
    || templateUrlRE.test(url) === true
    // not a request if root isn't set and it's a root-relative url
    || rootRelativeUrlRE.test(url) === true
  ) === false
}

async function injectRule (chain, pref, lang, test, loader, loaderOptions) {
  const baseRule = chain.module.rule(lang).test(test)

  // rules for <style lang="module">
  const modulesRule = baseRule.oneOf('modules-query').resourceQuery(/module/)
  await create(modulesRule, true)

  // rules for *.module.* files
  const modulesExtRule = baseRule.oneOf('modules-ext').test(/\.module\.\w+$/)
  await create(modulesExtRule, true)

  const normalRule = baseRule.oneOf('normal')
  await create(normalRule, false)

  async function create (rule, modules) {
    if (pref.isServerBuild === true) {
      rule.use('null-loader')
        .loader('null-loader')
      return
    }

    if (pref.extract) {
      rule.use('mini-css-extract')
        .loader(miniCssExtractPlugin.loader)
        .options({ publicPath: '../' })
    }
    else {
      rule.use('vue-style-loader')
        .loader('vue-style-loader')
        .options({
          sourceMap: pref.sourceMap
        })
    }

    const cssLoaderOptions = {
      sourceMap: pref.sourceMap,
      url: { filter: shouldRequireUrl },
      importLoaders:
        1 // stylePostLoader injected by vue-loader
        + 1 // postCSS loader
        + (!pref.extract && pref.minify ? 1 : 0) // postCSS with cssnano
        + (loader ? (loader === 'sass-loader' ? 2 : 1) : 0)
    }

    if (modules) {
      Object.assign(cssLoaderOptions, {
        modules: {
          localIdentName: '[name]_[local]_[hash:base64:5]'
        }
      })
    }

    rule.use('css-loader')
      .loader('css-loader')
      .options(cssLoaderOptions)

    if (!pref.extract && pref.minify) {
      const { default: cssnano } = await import('cssnano')

      // needs to be applied separately,
      // otherwise it messes up RTL
      rule.use('cssnano')
        .loader('postcss-loader')
        .options({
          sourceMap: pref.sourceMap,
          postcssOptions: {
            plugins: [
              cssnano({
                preset: [ 'default', {
                  mergeLonghand: false,
                  convertValues: false,
                  cssDeclarationSorter: false,
                  reduceTransforms: false
                } ]
              })
            ]
          }
        })
    }

    // need a fresh copy, otherwise plugins
    // will keep on adding making N duplicates for each one
    const { default: postCssConfig } = await import(appPaths.postcssConfigFilename)
    let postcssOptions = { sourceMap: pref.sourceMap, ...postCssConfig }

    if (pref.rtl) {
      const { default: postcssRTL } = await import('postcss-rtlcss')
      const postcssRTLOptions = pref.rtl === true ? {} : pref.rtl

      if (
        typeof postCssConfig.plugins !== 'function'
        && (postcssRTLOptions.source === 'ltr' || typeof postcssRTLOptions === 'function')
      ) {
        const originalPlugins = postcssOptions.plugins ? [ ...postcssOptions.plugins ] : []

        postcssOptions = ctx => {
          const plugins = [ ...originalPlugins ]
          const isClientCSS = quasarCssPaths.every(item => ctx.resourcePath.indexOf(item) === -1)

          plugins.push(postcssRTL(
            typeof postcssRTLOptions === 'function'
              ? postcssRTLOptions(isClientCSS, ctx.resourcePath)
              : {
                  ...postcssRTLOptions,
                  source: isClientCSS ? 'rtl' : 'ltr'
                }
          ))

          return { sourceMap: pref.sourceMap, plugins }
        }
      }
      else {
        postcssOptions.plugins.push(postcssRTL(postcssRTLOptions))
      }
    }

    rule.use('postcss-loader')
      .loader('postcss-loader')
      .options({ postcssOptions })

    if (loader) {
      rule.use(loader)
        .loader(loader)
        .options({
          sourceMap: pref.sourceMap,
          ...loaderOptions
        })

      if (loader === 'sass-loader') {
        if (loaderOptions && loaderOptions.sassOptions && loaderOptions.sassOptions.indentedSyntax) {
          rule.use('quasar-sass-variables-loader')
            .loader(new URL('./loader.quasar-sass-variables.cjs', import.meta.url).pathname)
            .options({ prefix: cssVariables.codePrefixes.sass })
        }
        else {
          rule.use('quasar-scss-variables-loader')
            .loader(new URL('./loader.quasar-scss-variables.cjs', import.meta.url).pathname)
            .options({ prefix: cssVariables.codePrefixes.scss })
        }
      }
    }
  }
}

export async function injectStyleRules (chain, pref) {
  await injectRule(chain, pref, 'css', /\.css$/)
  await injectRule(chain, pref, 'stylus', /\.styl(us)?$/, 'stylus-loader', pref.stylusLoaderOptions)
  await injectRule(chain, pref, 'scss', /\.scss$/, 'sass-loader', merge(
    { sassOptions: { outputStyle: /* required for RTL */ 'expanded' } },
    pref.scssLoaderOptions
  ))
  await injectRule(chain, pref, 'sass', /\.sass$/, 'sass-loader', merge(
    { sassOptions: { indentedSyntax: true, outputStyle: /* required for RTL */ 'expanded' } },
    pref.sassLoaderOptions
  ))
  await injectRule(chain, pref, 'less', /\.less$/, 'less-loader', pref.lessLoaderOptions)
}
